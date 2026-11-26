"""Data validation checks executed at the end of every database build.

``error`` level checks abort the build. ``warn`` level checks document known
quirks of the source data; they are surfaced in the API (``/api/meta/quality``)
so the dashboard can be transparent about them.
"""

from __future__ import annotations

import duckdb

FOREIGN_KEYS = [
    ("result", "race_id", "race", "race_id"),
    ("result", "driver_id", "driver", "driver_id"),
    ("result", "constructor_id", "constructor", "constructor_id"),
    ("sprint", "driver_id", "driver", "driver_id"),
    ("sprint", "constructor_id", "constructor", "constructor_id"),
    ("qualifying", "driver_id", "driver", "driver_id"),
    ("qualifying", "constructor_id", "constructor", "constructor_id"),
    ("pit_stop", "driver_id", "driver", "driver_id"),
    ("lap_time", "race_id", "race", "race_id"),
    ("lap_time", "driver_id", "driver", "driver_id"),
    ("tyre_stint", "driver_id", "driver", "driver_id"),
    ("weather", "race_id", "race", "race_id"),
    ("practice", "driver_id", "driver", "driver_id"),
    ("driver_standing", "driver_id", "driver", "driver_id"),
    ("constructor_standing", "constructor_id", "constructor", "constructor_id"),
    ("constructor_race", "constructor_id", "constructor", "constructor_id"),
    ("race", "circuit_id", "circuit", "circuit_id"),
]

UNIQUE_KEYS = [
    ("result", ["result_id"]),
    ("sprint", ["race_id", "driver_id"]),
    ("qualifying", ["race_id", "driver_id"]),
    ("pit_stop", ["race_id", "driver_id", "stop"]),
    ("lap_time", ["race_id", "driver_id", "lap"]),
    ("tyre_stint", ["race_id", "driver_id", "stint"]),
    ("weather", ["race_id"]),
    ("driver_standing", ["race_id", "driver_id"]),
    ("constructor_standing", ["race_id", "constructor_id"]),
]


def _one(con: duckdb.DuckDBPyConnection, sql: str):
    return con.execute(sql).fetchone()[0]


def run_checks(con: duckdb.DuckDBPyConnection) -> list[dict]:
    out: list[dict] = []

    def add(name: str, ok: bool, detail: str, level: str = "error") -> None:
        out.append({"name": name, "ok": bool(ok), "detail": detail, "level": level})

    for child, col, parent, pk in FOREIGN_KEYS:
        n = _one(con, f"""SELECT count(*) FROM {child} c
                          WHERE c.{col} IS NOT NULL
                            AND NOT EXISTS (SELECT 1 FROM {parent} p WHERE p.{pk} = c.{col})""")
        add(f"fk {child}.{col} -> {parent}", n == 0, f"{n} orphan rows")

    for table, cols in UNIQUE_KEYS:
        key = ", ".join(cols)
        n = _one(con, f"SELECT count(*) FROM (SELECT {key} FROM {table} GROUP BY ALL HAVING count(*) > 1)")
        add(f"unique {table}({key})", n == 0, f"{n} duplicate keys")

    # Shared drives (1950s) legitimately produce two result rows per driver/race.
    n = _one(con, "SELECT count(*) FROM (SELECT race_id, driver_id FROM result GROUP BY ALL HAVING count(*) > 1)")
    add("shared drives (driver twice in one race)", True, f"{n} pairs; counted once for starts", "warn")

    n = _one(con, "SELECT count(*) FROM race r WHERE NOT EXISTS (SELECT 1 FROM result x WHERE x.race_id = r.race_id AND x.is_win)")
    add("every race has a winner", n == 0, f"{n} races without a P1 row")
    n = _one(con, "SELECT count(*) FROM (SELECT race_id FROM result WHERE is_win GROUP BY 1 HAVING count(*) > 1)")
    add("races with a shared winning car", True, f"{n} races credit two winners", "warn")

    # Since 2010 no results are dropped, so standings must equal race + sprint points.
    n = _one(con, """
      WITH pts AS (
        SELECT year, driver_id, sum(points) AS p FROM (
          SELECT year, driver_id, points FROM result UNION ALL SELECT year, driver_id, points FROM sprint)
        WHERE year >= 2010 GROUP BY ALL)
      SELECT count(*) FROM pts JOIN season_driver sd USING (year, driver_id)
      WHERE abs(pts.p - sd.points) > 0.01""")
    add("2010+ standings = race + sprint points", n == 0, f"{n} driver-seasons differ", "warn")

    n = _one(con, """
      WITH pts AS (SELECT year, constructor_id, sum(points) p FROM (
          SELECT year, constructor_id, points FROM result UNION ALL SELECT year, constructor_id, points FROM sprint)
        WHERE year >= 2010 GROUP BY ALL)
      SELECT count(*) FROM pts JOIN season_constructor sc USING (year, constructor_id)
      WHERE abs(pts.p - sc.points) > 0.01""")
    add("2010+ constructor standings = race + sprint points", n == 0, f"{n} team-seasons differ", "warn")

    n = _one(con, "SELECT count(*) FROM pit_stop WHERE NOT valid_duration")
    z = _one(con, "SELECT count(*) FROM pit_stop WHERE duration_ms = 0")
    add("pit stops excluded from duration stats", True, f"{n} rows ({z} zero-duration, rest > 60 s)", "warn")
    n = _one(con, "SELECT count(*) FROM tyre_stint WHERE compound = 'UNKNOWN'")
    add("tyre stints with unknown compound", True, f"{n} stints", "warn")
    n = _one(con, "SELECT count(*) FROM result WHERE position IS NULL AND regexp_matches(position_text, '^\\d+$')")
    add("numeric positionText with NULL position", True, f"{n} rows treated as unclassified", "warn")
    n = _one(con, "SELECT count(*) FROM result WHERE year >= 2025 AND status = 'Retired'")
    add("2025+ retirements without cause", True, f"{n} rows report only 'Retired'", "warn")
    return out
