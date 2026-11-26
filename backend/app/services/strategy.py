"""Pit-stop (2011+) and tyre-stint (2025+) strategy analytics.

Pit durations are pit-lane times (entry to exit), not stationary times. Rows of
0 ms or above 60 s are excluded from duration statistics (see config).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db import frame, row, rows
from app.services.common import DRIVER_COLS, TEAM_COLS

COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"]


def _race_filter(race_id: int | None) -> str:
    return "AND p.race_id = $race" if race_id else ""


def _params(season: int, race_id: int | None) -> dict[str, Any]:
    p: dict[str, Any] = {"season": season}
    if race_id:
        p["race"] = race_id
    return p


@lru_cache
def pit_summary(season: int, race_id: int | None = None) -> dict[str, Any]:
    rf = _race_filter(race_id)
    params = _params(season, race_id)
    s = row(f"""
      SELECT count(*) AS stops,
             count(*) FILTER (WHERE valid_duration) AS timed_stops,
             count(*) FILTER (WHERE NOT valid_duration) AS excluded_stops,
             median(duration_ms) FILTER (WHERE valid_duration) AS median_ms,
             avg(duration_ms) FILTER (WHERE valid_duration) AS mean_ms,
             count(DISTINCT race_id) AS races
      FROM pit_stop p WHERE p.year = $season {rf}""", params)
    per_driver_race = row(f"""
      SELECT avg(n) AS avg_stops FROM (
        SELECT race_id, driver_id, count(*) AS n FROM pit_stop p WHERE p.year = $season {rf} GROUP BY ALL)""",
                          params)
    fastest = rows(f"""
      SELECT p.duration_ms, p.lap, p.stop, ra.round, ra.name AS race_name, {DRIVER_COLS}, {TEAM_COLS}
      FROM pit_stop p JOIN race ra USING (race_id) JOIN driver d USING (driver_id)
      LEFT JOIN constructor c ON c.constructor_id = p.constructor_id
      WHERE p.year = $season AND p.valid_duration {rf}
      ORDER BY p.duration_ms LIMIT 10""", params)
    return {**(s or {}), "avg_stops_per_driver": (per_driver_race or {}).get("avg_stops"),
            "fastest": fastest}


@lru_cache
def pit_by_constructor(season: int, race_id: int | None = None) -> list[dict[str, Any]]:
    """Box-plot statistics of pit-lane time by constructor."""
    rf = _race_filter(race_id)
    return rows(f"""
      SELECT {TEAM_COLS}, count(*) AS n,
             min(duration_ms) AS min_ms,
             quantile_cont(duration_ms, 0.25) AS q1_ms,
             median(duration_ms) AS median_ms,
             quantile_cont(duration_ms, 0.75) AS q3_ms,
             max(duration_ms) AS max_ms,
             avg(duration_ms) AS mean_ms
      FROM pit_stop p JOIN constructor c USING (constructor_id)
      WHERE p.year = $season AND p.valid_duration {rf}
      GROUP BY ALL HAVING count(*) >= 3 ORDER BY median_ms""", _params(season, race_id))


@lru_cache
def stops_per_driver(season: int, race_id: int | None = None) -> list[dict[str, Any]]:
    rf = _race_filter(race_id)
    return rows(f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, count(*) AS stops, count(DISTINCT p.race_id) AS races,
             round(count(*) / count(DISTINCT p.race_id), 2) AS stops_per_race,
             median(duration_ms) FILTER (WHERE valid_duration) AS median_ms
      FROM pit_stop p JOIN driver d USING (driver_id)
      LEFT JOIN driver_season_team t ON t.year = p.year AND t.driver_id = p.driver_id
      LEFT JOIN constructor c ON c.constructor_id = t.constructor_id
      WHERE p.year = $season {rf}
      GROUP BY ALL ORDER BY stops DESC, d.surname""", _params(season, race_id))


@lru_cache
def stop_timing(season: int, race_id: int | None = None) -> dict[str, Any]:
    """Distribution of pit-stop laps. Season view uses % of race distance (5 % bins)."""
    if race_id:
        data = rows("""SELECT lap, count(*) AS stops FROM pit_stop WHERE race_id = ? GROUP BY 1 ORDER BY 1""",
                    [race_id])
        return {"mode": "lap", "bins": data}
    data = rows("""
      WITH dist AS (SELECT race_id, max(laps) AS race_laps FROM result GROUP BY 1)
      SELECT least(floor(100.0 * p.lap / d.race_laps / 5) * 5, 95) AS pct, count(*) AS stops
      FROM pit_stop p JOIN dist d USING (race_id)
      WHERE p.year = ? GROUP BY 1 ORDER BY 1""", [season])
    return {"mode": "pct", "bins": data}


@lru_cache
def pit_trend() -> list[dict[str, Any]]:
    return rows("""
      SELECT year, median(duration_ms) FILTER (WHERE valid_duration) AS median_ms,
             quantile_cont(duration_ms, 0.1) FILTER (WHERE valid_duration) AS p10_ms,
             round(count(*) / count(DISTINCT race_id || '-' || driver_id), 2) AS stops_per_driver_race
      FROM pit_stop GROUP BY year ORDER BY year""")


# --------------------------------------------------------------------- tyres
@lru_cache
def tyre_overview(season: int) -> dict[str, Any]:
    by_compound = rows("""
      SELECT compound, count(*) AS stints, sum(laps) AS laps, round(avg(laps), 1) AS avg_stint,
             median(laps) AS median_stint, max(laps) AS max_stint
      FROM tyre_stint WHERE year = ? GROUP BY 1""", [season])
    by_compound.sort(key=lambda r: COMPOUND_ORDER.index(r["compound"]) if r["compound"] in COMPOUND_ORDER else 99)
    per_race_df = frame("""
      SELECT ra.round, ra.name AS race_name, t.compound, sum(t.laps) AS laps
      FROM tyre_stint t JOIN race ra USING (race_id) WHERE t.year = $season GROUP BY ALL""",
                        {"season": season})
    rounds: list[dict[str, Any]] = []
    if not per_race_df.empty:
        pv = per_race_df.pivot_table(index=["round", "race_name"], columns="compound", values="laps",
                                     aggfunc="sum", fill_value=0)
        for (rnd, name), vals in pv.iterrows():
            total = float(vals.sum())
            rounds.append({"round": int(rnd), "race_name": name,
                           "share": {c: round(100 * float(v) / total, 1) for c, v in vals.items()}})
    stops = row("""
      SELECT round(avg(n) - 1, 2) AS avg_stops FROM (
        SELECT race_id, driver_id, count(*) AS n FROM tyre_stint WHERE year = ? GROUP BY ALL)""", [season])
    return {"by_compound": by_compound, "rounds": rounds, "avg_stops_from_stints": (stops or {}).get("avg_stops")}


@lru_cache
def race_strategy(race_id: int) -> dict[str, Any]:
    stints = rows(f"""
      SELECT t.stint, t.compound, t.start_lap, t.end_lap, t.laps, {DRIVER_COLS}, {TEAM_COLS},
             r.position_order, r.position_text
      FROM tyre_stint t JOIN driver d USING (driver_id)
      JOIN result r ON r.race_id = t.race_id AND r.driver_id = t.driver_id
      JOIN constructor c ON c.constructor_id = r.constructor_id
      WHERE t.race_id = ? ORDER BY r.position_order, t.stint""", [race_id])
    laps = row("SELECT max(laps) AS laps FROM result WHERE race_id = ?", [race_id])
    return {"stints": stints, "laps": (laps or {}).get("laps")}


@lru_cache
def driver_tyre_usage(season: int, driver_ids: tuple[int, ...] | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"season": season}
    ids = ""
    if driver_ids:
        params["ids"] = list(driver_ids)
        ids = "AND list_contains($ids, t.driver_id)"
    return rows(f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, t.compound, count(*) AS stints, sum(t.laps) AS laps,
             round(avg(t.laps), 1) AS avg_stint
      FROM tyre_stint t JOIN driver d USING (driver_id)
      LEFT JOIN driver_season_team dt ON dt.year = t.year AND dt.driver_id = t.driver_id
      LEFT JOIN constructor c ON c.constructor_id = dt.constructor_id
      WHERE t.year = $season {ids}
      GROUP BY ALL ORDER BY d.surname""", params)
