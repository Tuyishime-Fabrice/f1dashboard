"""Build the analytical DuckDB database from the raw Formula 1 CSV files.

Run with:  python -m app.etl.build   (from the ``backend`` directory)

Pipeline
--------
1. Load every CSV into a ``raw_*`` table. ``\\N`` is treated as NULL.
2. Build curated tables with consistent types and derived flags
   (``race``, ``result``, ``sprint``, ``qualifying``, ``pit_stop`` ...).
3. Build season-level helper tables (``season``, ``season_driver``...).
4. Run validation checks (see ``validate.py``) and fail loudly on errors.

All dashboard figures are computed from these tables at request time, so every
number is traceable back to a raw CSV row.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import duckdb

from app.config import DB_PATH, MODERN_POINTS, PIT_DURATION_MAX_MS, PIT_DURATION_MIN_MS, RAW_DIR

RAW_TABLES = [
    "circuits", "constructor_results", "constructor_standings", "constructors",
    "driver_standings", "drivers", "lap_times", "pit_stops", "practice_results",
    "qualifying", "races", "results", "seasons", "sprint_results", "status",
    "tire_stints", "weather",
]

# Explicit types for columns that auto-detection gets wrong or ambiguous.
TYPE_OVERRIDES = {
    "pit_stops": {"duration": "VARCHAR", "time": "VARCHAR"},
    "sprint_results": {"points": "DOUBLE"},
    "results": {"points": "DOUBLE", "fastestLapSpeed": "DOUBLE"},
    "races": {"time": "VARCHAR"},
}

# Statuses that mean the driver never took the race start.
NON_START_STATUSES = (
    "Did not qualify", "Did not prequalify", "Did not start", "Withdrew", "107% Rule",
)


def _lap_to_ms(col: str) -> str:
    """SQL expression converting 'm:ss.mmm' or 'ss.mmm' text to milliseconds."""
    return f"""
    CASE
      WHEN {col} IS NULL OR trim({col}) = '' THEN NULL
      WHEN regexp_matches({col}, '^\\d+:\\d{{1,2}}\\.\\d+$') THEN
        CAST(round((CAST(split_part({col}, ':', 1) AS DOUBLE) * 60
                   + CAST(split_part({col}, ':', 2) AS DOUBLE)) * 1000) AS BIGINT)
      WHEN regexp_matches({col}, '^\\d+\\.\\d+$') THEN CAST(round(CAST({col} AS DOUBLE) * 1000) AS BIGINT)
      ELSE NULL
    END"""


def _status_group_sql(col: str = "st.status") -> str:
    accident = "('Accident','Collision','Spun off','Collision damage','Fatal accident','Damage','Debris')"
    dsq = "('Disqualified','Excluded','Underweight')"
    non_start = "('Did not qualify','Did not prequalify','Did not start','Withdrew','107% Rule')"
    health = "('Illness','Injury','Injured','Physical','Driver unwell','Eye injury','Safety concerns','Safety')"
    return f"""
    CASE
      WHEN {col} = 'Finished' THEN 'Finished'
      WHEN {col} LIKE '+%Lap%' OR {col} = 'Lapped' THEN 'Lapped'
      WHEN {col} IN {non_start} THEN 'Did not start'
      WHEN {col} IN {dsq} THEN 'Disqualified'
      WHEN {col} IN {accident} THEN 'Accident / collision'
      WHEN {col} IN ('Retired','Not classified','Not restarted') THEN 'Retired (unspecified)'
      WHEN {col} IN {health} THEN 'Driver / safety'
      ELSE 'Mechanical'
    END"""


def load_raw(con: duckdb.DuckDBPyConnection, raw_dir: Path) -> None:
    for name in RAW_TABLES:
        path = raw_dir / f"{name}.csv"
        if not path.exists():
            raise FileNotFoundError(f"Missing dataset file: {path}")
        overrides = TYPE_OVERRIDES.get(name)
        types = ""
        if overrides:
            pairs = ", ".join(f"'{k}': '{v}'" for k, v in overrides.items())
            types = f", types={{{pairs}}}"
        con.execute(
            f"""CREATE OR REPLACE TABLE raw_{name} AS
                SELECT * FROM read_csv('{path.as_posix()}', header=true, nullstr='\\N',
                                       sample_size=-1{types})"""
        )


def build_curated(con: duckdb.DuckDBPyConnection) -> None:
    modern_case = " ".join(f"WHEN {p} THEN {v}" for p, v in MODERN_POINTS.items())
    non_start = ", ".join(f"'{s}'" for s in NON_START_STATUSES)

    con.execute("""
    CREATE OR REPLACE TABLE circuit AS
    SELECT circuitId AS circuit_id, circuitRef AS circuit_ref, name, location,
           CASE WHEN country IN ('USA','United States') THEN 'United States'
                WHEN country = 'UK' THEN 'United Kingdom'
                WHEN country = 'UAE' THEN 'United Arab Emirates'
                ELSE country END AS country,
           lat, lng, NULLIF(alt, 0) AS alt, url
    FROM raw_circuits
    """)

    con.execute("""
    CREATE OR REPLACE TABLE driver AS
    SELECT driverId AS driver_id, driverRef AS driver_ref, number AS permanent_number,
           code, forename, surname, forename || ' ' || surname AS full_name,
           dob, nationality, url
    FROM raw_drivers
    """)

    con.execute("""
    CREATE OR REPLACE TABLE constructor AS
    SELECT constructorId AS constructor_id, constructorRef AS constructor_ref,
           name, nationality, url
    FROM raw_constructors
    """)

    con.execute("""
    CREATE OR REPLACE TABLE race AS
    SELECT r.raceId AS race_id, r.year, r.round, r.circuitId AS circuit_id, r.name,
           r.date, r.url,
           r.sprint_date IS NOT NULL OR EXISTS (SELECT 1 FROM raw_sprint_results s WHERE s.raceId = r.raceId) AS has_sprint,
           c.name AS circuit_name, c.location, c.country
    FROM raw_races r JOIN circuit c ON c.circuit_id = r.circuitId
    """)

    # Pole position follows the official convention: the driver who starts the
    # Grand Prix from grid slot 1 (so qualifying penalties move the pole). The
    # exception is the 2022 sprint format, where pole was credited to the
    # fastest driver in Friday qualifying even though the sprint set the grid.
    # Races where nobody is recorded on grid 1 fall back to qualifying P1.
    con.execute("""
    CREATE OR REPLACE TABLE race_pole AS
    WITH q AS (SELECT raceId AS race_id, driverId AS driver_id FROM raw_qualifying WHERE position = 1),
    g AS (SELECT raceId AS race_id, min_by(driverId, resultId) AS driver_id
          FROM raw_results WHERE grid = 1 GROUP BY raceId),
    rules AS (
      SELECT ra.race_id,
             CASE WHEN ra.year = 2022 AND ra.has_sprint AND q.driver_id IS NOT NULL THEN q.driver_id
                  WHEN g.driver_id IS NOT NULL THEN g.driver_id
                  ELSE q.driver_id END AS driver_id,
             CASE WHEN ra.year = 2022 AND ra.has_sprint AND q.driver_id IS NOT NULL THEN 'qualifying'
                  WHEN g.driver_id IS NOT NULL THEN 'grid'
                  ELSE 'qualifying' END AS source
      FROM race ra LEFT JOIN q USING (race_id) LEFT JOIN g USING (race_id))
    SELECT * FROM rules WHERE driver_id IS NOT NULL
    """)

    con.execute(f"""
    CREATE OR REPLACE TABLE result AS
    SELECT res.resultId AS result_id, res.raceId AS race_id, ra.year, ra.round, ra.date,
           ra.circuit_id, res.driverId AS driver_id, res.constructorId AS constructor_id,
           res.number, NULLIF(res.grid, 0) AS grid, res.grid = 0 AS pit_lane_or_unknown_grid,
           res.position, res.positionText AS position_text, res.positionOrder AS position_order,
           res.points, res.laps, res.time AS race_time, res.milliseconds AS race_ms,
           res.fastestLap AS fastest_lap_no, res.rank AS fastest_lap_rank,
           res.fastestLapTime AS fastest_lap_time, {_lap_to_ms('res.fastestLapTime')} AS fastest_lap_ms,
           res.statusId AS status_id, st.status, {_status_group_sql()} AS status_group,
           coalesce(st.status NOT IN ({non_start}) AND res.positionText NOT IN ('F','W'), false) AS started,
           res.position IS NOT NULL AS classified,
           coalesce(res.position = 1, false) AS is_win,
           coalesce(res.position <= 3, false) AS is_podium,
           coalesce(res.positionText = 'D', false) AS is_dsq,
           coalesce(st.status NOT IN ({non_start}) AND res.positionText IN ('R','N'), false) AS is_dnf,
           CASE WHEN res.position IS NOT NULL AND res.grid > 0 THEN res.grid - res.position END AS positions_gained,
           CASE res.position {modern_case} ELSE 0 END AS modern_points
    FROM raw_results res
    JOIN race ra ON ra.race_id = res.raceId
    JOIN raw_status st ON st.statusId = res.statusId
    """)

    con.execute(f"""
    CREATE OR REPLACE TABLE sprint AS
    SELECT s.resultId AS result_id, s.raceId AS race_id, ra.year, ra.round,
           s.driverId AS driver_id, s.constructorId AS constructor_id,
           NULLIF(s.grid, 0) AS grid, s.position, s.positionText AS position_text,
           s.positionOrder AS position_order, s.points, s.laps,
           s.fastestLapTime AS fastest_lap_time, {_lap_to_ms('s.fastestLapTime')} AS fastest_lap_ms,
           st.status, {_status_group_sql()} AS status_group
    FROM raw_sprint_results s
    JOIN race ra ON ra.race_id = s.raceId
    JOIN raw_status st ON st.statusId = s.statusId
    """)

    con.execute(f"""
    CREATE OR REPLACE TABLE qualifying AS
    SELECT q.qualifyId AS qualify_id, q.raceId AS race_id, ra.year, ra.round,
           q.driverId AS driver_id, q.constructorId AS constructor_id, q.position,
           q.q1, q.q2, q.q3,
           {_lap_to_ms('q.q1')} AS q1_ms, {_lap_to_ms('q.q2')} AS q2_ms, {_lap_to_ms('q.q3')} AS q3_ms
    FROM raw_qualifying q JOIN race ra ON ra.race_id = q.raceId
    """)
    con.execute("""
    ALTER TABLE qualifying ADD COLUMN best_ms BIGINT;
    UPDATE qualifying SET best_ms = NULLIF(least(coalesce(q1_ms, 9e12), coalesce(q2_ms, 9e12), coalesce(q3_ms, 9e12)), 9e12);
    """)

    con.execute(f"""
    CREATE OR REPLACE TABLE pit_stop AS
    SELECT p.raceId AS race_id, ra.year, ra.round, p.driverId AS driver_id,
           p.stop, p.lap, p.milliseconds AS duration_ms,
           coalesce(p.milliseconds BETWEEN {PIT_DURATION_MIN_MS} AND {PIT_DURATION_MAX_MS}, false) AS valid_duration,
           res.constructor_id
    FROM raw_pit_stops p
    JOIN race ra ON ra.race_id = p.raceId
    LEFT JOIN (SELECT race_id, driver_id, any_value(constructor_id) AS constructor_id
               FROM result GROUP BY ALL) res
      ON res.race_id = p.raceId AND res.driver_id = p.driverId
    """)

    con.execute("""
    CREATE OR REPLACE TABLE lap_time AS
    SELECT l.raceId AS race_id, l.driverId AS driver_id, l.lap, l.position, l.milliseconds AS lap_ms
    FROM raw_lap_times l
    """)

    con.execute("""
    CREATE OR REPLACE TABLE tyre_stint AS
    SELECT t.raceId AS race_id, ra.year, ra.round, t.driverId AS driver_id, t.stint,
           coalesce(t.compound, 'UNKNOWN') AS compound, t.startLap AS start_lap,
           t.endLap AS end_lap, t.lapsOnTire AS laps
    FROM raw_tire_stints t JOIN race ra ON ra.race_id = t.raceId
    """)

    con.execute("""
    CREATE OR REPLACE TABLE weather AS
    SELECT w.raceId AS race_id, ra.year, ra.round, ra.name AS race_name,
           w.airTempAvg AS air_temp_avg, w.airTempMin AS air_temp_min, w.airTempMax AS air_temp_max,
           w.trackTempAvg AS track_temp_avg, w.trackTempMin AS track_temp_min, w.trackTempMax AS track_temp_max,
           w.humidityAvg AS humidity_avg, w.windSpeedAvg AS wind_speed_avg, w.windSpeedMax AS wind_speed_max,
           w.rainfall
    FROM raw_weather w JOIN race ra ON ra.race_id = w.raceId
    """)

    con.execute("""
    CREATE OR REPLACE TABLE practice AS
    SELECT p.raceId AS race_id, p.driverId AS driver_id, p.session, p.position, p.laps,
           CAST(round(extract(epoch FROM CAST(replace(p.bestLapTime, ' days ', ' day ') AS INTERVAL)) * 1000) AS BIGINT) AS best_lap_ms
    FROM raw_practice_results p
    """)

    con.execute("""
    CREATE OR REPLACE TABLE driver_standing AS
    SELECT ds.raceId AS race_id, ra.year, ra.round, ds.driverId AS driver_id,
           ds.points, ds.position, ds.positionText AS position_text, ds.wins
    FROM raw_driver_standings ds JOIN race ra ON ra.race_id = ds.raceId
    """)

    con.execute("""
    CREATE OR REPLACE TABLE constructor_standing AS
    SELECT cs.raceId AS race_id, ra.year, ra.round, cs.constructorId AS constructor_id,
           cs.points, cs.position, cs.positionText AS position_text, cs.wins
    FROM raw_constructor_standings cs JOIN race ra ON ra.race_id = cs.raceId
    """)

    con.execute("""
    CREATE OR REPLACE TABLE constructor_race AS
    SELECT cr.raceId AS race_id, ra.year, ra.round, cr.constructorId AS constructor_id,
           cr.points, cr.status = 'D' AS disqualified
    FROM raw_constructor_results cr JOIN race ra ON ra.race_id = cr.raceId
    """)


def build_season_tables(con: duckdb.DuckDBPyConnection) -> None:
    # A season is flagged "in progress" when it is the latest season in the
    # snapshot and its last recorded race is before November (modern calendars
    # always finish in Nov/Dec). Override with PITWALL_IN_PROGRESS=2026,...
    override = os.environ.get("PITWALL_IN_PROGRESS")
    con.execute("""
    CREATE OR REPLACE TABLE season AS
    WITH s AS (
      SELECT year, count(*) AS races, max(round) AS last_round, min(date) AS first_date,
             max(date) AS last_date, max_by(race_id, round) AS last_race_id,
             count(*) FILTER (WHERE has_sprint) AS sprint_weekends
      FROM race GROUP BY year
    )
    SELECT s.*, (s.year = (SELECT max(year) FROM race) AND month(s.last_date) < 11) AS in_progress
    FROM s
    """)
    if override is not None:
        years = [int(y) for y in override.split(",") if y.strip()]
        con.execute("UPDATE season SET in_progress = list_contains(?, year)", [years])

    con.execute("""
    CREATE OR REPLACE TABLE season_driver AS
    SELECT ds.year, ds.driver_id, ds.points, ds.position, ds.wins
    FROM driver_standing ds JOIN season s ON s.last_race_id = ds.race_id
    """)
    con.execute("""
    CREATE OR REPLACE TABLE season_constructor AS
    SELECT cs.year, cs.constructor_id, cs.points, cs.position, cs.wins
    FROM constructor_standing cs JOIN season s ON s.last_race_id = cs.race_id
    """)

    # The team a driver represented most often in a season (ties -> latest race).
    con.execute("""
    CREATE OR REPLACE TABLE driver_season_team AS
    WITH c AS (
      SELECT year, driver_id, constructor_id, count(DISTINCT race_id) AS n, max(round) AS last_round
      FROM result GROUP BY ALL)
    SELECT year, driver_id, constructor_id FROM (
      SELECT *, row_number() OVER (PARTITION BY year, driver_id ORDER BY n DESC, last_round DESC) AS rn FROM c)
    WHERE rn = 1
    """)

    # Data coverage summary used by the UI to hide analyses that lack data.
    con.execute("""
    CREATE OR REPLACE TABLE coverage AS
    SELECT 'results' AS dataset, min(year) AS first_year, max(year) AS last_year, count(DISTINCT race_id) AS races, count(*) AS rows FROM result
    UNION ALL SELECT 'qualifying', min(year), max(year), count(DISTINCT race_id), count(*) FROM qualifying
    UNION ALL SELECT 'lap_times', min(r.year), max(r.year), count(DISTINCT l.race_id), count(*) FROM lap_time l JOIN race r USING (race_id)
    UNION ALL SELECT 'pit_stops', min(year), max(year), count(DISTINCT race_id), count(*) FROM pit_stop
    UNION ALL SELECT 'sprint_results', min(year), max(year), count(DISTINCT race_id), count(*) FROM sprint
    UNION ALL SELECT 'tyre_stints', min(year), max(year), count(DISTINCT race_id), count(*) FROM tyre_stint
    UNION ALL SELECT 'weather', min(year), max(year), count(DISTINCT race_id), count(*) FROM weather
    UNION ALL SELECT 'practice', min(r.year), max(r.year), count(DISTINCT p.race_id), count(*) FROM practice p JOIN race r USING (race_id)
    UNION ALL SELECT 'constructor_standings', min(year), max(year), count(DISTINCT race_id), count(*) FROM constructor_standing
    """)


def build(db_path: Path = DB_PATH, raw_dir: Path = RAW_DIR, verbose: bool = True) -> Path:
    from app.etl.validate import run_checks

    t0 = time.perf_counter()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = db_path.with_suffix(".building.duckdb")
    if tmp.exists():
        tmp.unlink()
    con = duckdb.connect(str(tmp))
    try:
        load_raw(con, raw_dir)
        build_curated(con)
        build_season_tables(con)
        con.execute("DROP TABLE raw_lap_times")  # curated copy kept; raw is large
        report = run_checks(con)
        con.execute("CREATE OR REPLACE TABLE quality_report (name VARCHAR, ok BOOLEAN, detail VARCHAR, level VARCHAR)")
        con.executemany("INSERT INTO quality_report VALUES (?, ?, ?, ?)",
                        [(c["name"], c["ok"], c["detail"], c["level"]) for c in report])
    finally:
        con.close()
    failures = [c for c in report if c["level"] == "error" and not c["ok"]]
    if failures:
        tmp.unlink(missing_ok=True)
        raise RuntimeError("Validation failed: " + "; ".join(c["name"] for c in failures))
    tmp.replace(db_path)
    if verbose:
        for c in report:
            mark = "ok " if c["ok"] else ("ERR" if c["level"] == "error" else "warn")
            print(f"  [{mark}] {c['name']}: {c['detail']}")
        print(f"Built {db_path} in {time.perf_counter() - t0:.1f}s")
    return db_path


if __name__ == "__main__":
    build(verbose="-q" not in sys.argv)
