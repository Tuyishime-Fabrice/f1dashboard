"""Season overview: KPIs, championship progressions, winners and latest results."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import pandas as pd

from app.db import frame, records, row, rows
from app.services.common import DRIVER_COLS, TEAM_COLS, driver_stats, round_labels


@lru_cache
def kpis(season: int) -> dict[str, Any]:
    info = row("SELECT * FROM season WHERE year = ?", [season])
    if info is None:
        return {}
    last_race = row("""SELECT race_id, round, name, date, circuit_name, country
                       FROM race WHERE race_id = ?""", [info["last_race_id"]])
    drivers = rows(f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, ds.points, ds.position, ds.wins
      FROM driver_standing ds JOIN driver d USING (driver_id)
      LEFT JOIN driver_season_team t ON t.year = ds.year AND t.driver_id = ds.driver_id
      LEFT JOIN constructor c ON c.constructor_id = t.constructor_id
      WHERE ds.race_id = ? ORDER BY ds.position LIMIT 2""", [info["last_race_id"]])
    teams = rows(f"""
      SELECT {TEAM_COLS}, cs.points, cs.position, cs.wins
      FROM constructor_standing cs JOIN constructor c USING (constructor_id)
      WHERE cs.race_id = ? ORDER BY cs.position LIMIT 2""", [info["last_race_id"]])
    win_counts = rows(f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, count(DISTINCT r.race_id) AS wins
      FROM result r JOIN driver d USING (driver_id)
      LEFT JOIN driver_season_team t ON t.year = r.year AND t.driver_id = r.driver_id
      LEFT JOIN constructor c ON c.constructor_id = t.constructor_id
      WHERE r.year = ? AND r.is_win GROUP BY ALL ORDER BY wins DESC, d.surname""", [season])
    wins_by_team = rows(f"""
      SELECT {TEAM_COLS}, count(DISTINCT r.race_id) AS wins
      FROM result r JOIN constructor c USING (constructor_id)
      WHERE r.year = ? AND r.is_win GROUP BY ALL ORDER BY wins DESC, c.name""", [season])

    def gap(pair: list[dict[str, Any]]) -> float | None:
        return pair[0]["points"] - pair[1]["points"] if len(pair) > 1 else None

    top_wins = win_counts[0]["wins"] if win_counts else 0
    return {
        "season": season,
        "in_progress": info["in_progress"],
        "races_completed": info["races"],
        "sprint_weekends": info["sprint_weekends"],
        "last_race": last_race,
        "driver_leader": drivers[0] if drivers else None,
        "driver_runner_up": drivers[1] if len(drivers) > 1 else None,
        "driver_gap": gap(drivers),
        "constructor_leader": teams[0] if teams else None,
        "constructor_runner_up": teams[1] if len(teams) > 1 else None,
        "constructor_gap": gap(teams),
        "most_wins": [w for w in win_counts if w["wins"] == top_wins],
        "different_winners": len(win_counts),
        "wins_by_constructor": wins_by_team,
        "total_wins": sum(w["wins"] for w in wins_by_team),
    }


def _progression(table: str, key: str, season: int, top: int, ids: tuple[int, ...] | None) -> dict[str, Any]:
    """Cumulative standings points after every round, reshaped with pandas."""
    labels = round_labels(season)
    if key == "driver_id":
        meta_sql = f"""SELECT {DRIVER_COLS}, {TEAM_COLS}, sd.position AS final_position
                       FROM season_driver sd JOIN driver d USING (driver_id)
                       LEFT JOIN driver_season_team t ON t.year = sd.year AND t.driver_id = sd.driver_id
                       LEFT JOIN constructor c ON c.constructor_id = t.constructor_id
                       WHERE sd.year = $season"""
    else:
        meta_sql = f"""SELECT {TEAM_COLS}, sc.position AS final_position
                       FROM season_constructor sc JOIN constructor c USING (constructor_id)
                       WHERE sc.year = $season"""
    meta = frame(meta_sql, {"season": season})
    if meta.empty:
        return {"rounds": labels, "series": []}
    if ids:
        meta = meta[meta[key].isin(ids)]
    else:
        meta = meta.sort_values("final_position").head(top)
    data = frame(f"SELECT round, {key}, points, position FROM {table} WHERE year = $season",
                 {"season": season})
    data = data[data[key].isin(meta[key])]
    pts = data.pivot_table(index=key, columns="round", values="points", aggfunc="max")
    pos = data.pivot_table(index=key, columns="round", values="position", aggfunc="max")
    rounds = [lab["round"] for lab in labels]
    pts = pts.reindex(columns=rounds)
    pos = pos.reindex(columns=rounds)
    series = []
    for rec in records(meta.sort_values("final_position")):
        k = rec[key]
        rec["points"] = [None if pd.isna(v) else float(v) for v in pts.loc[k]] if k in pts.index else []
        rec["positions"] = [None if pd.isna(v) else int(v) for v in pos.loc[k]] if k in pos.index else []
        series.append(rec)
    return {"rounds": labels, "series": series}


@lru_cache
def driver_progression(season: int, top: int = 8, ids: tuple[int, ...] | None = None) -> dict[str, Any]:
    return _progression("driver_standing", "driver_id", season, top, ids)


@lru_cache
def constructor_progression(season: int, top: int = 10, ids: tuple[int, ...] | None = None) -> dict[str, Any]:
    return _progression("constructor_standing", "constructor_id", season, top, ids)


@lru_cache
def race_winners(season: int) -> list[dict[str, Any]]:
    return rows(f"""
      SELECT ra.race_id, ra.round, ra.name AS race_name, ra.date, ra.circuit_name, ra.country,
             ci.circuit_ref, {DRIVER_COLS}, {TEAM_COLS}, w.grid, w.race_time,
             pd.full_name AS pole_driver, pd.code AS pole_code
      FROM race ra
      JOIN circuit ci USING (circuit_id)
      JOIN result w ON w.race_id = ra.race_id AND w.is_win
      JOIN driver d ON d.driver_id = w.driver_id
      JOIN constructor c ON c.constructor_id = w.constructor_id
      LEFT JOIN race_pole p ON p.race_id = ra.race_id
      LEFT JOIN driver pd ON pd.driver_id = p.driver_id
      WHERE ra.year = ?
      QUALIFY row_number() OVER (PARTITION BY ra.race_id ORDER BY w.result_id) = 1
      ORDER BY ra.round DESC""", [season])


@lru_cache
def top_drivers(season: int, limit: int = 10) -> list[dict[str, Any]]:
    return driver_stats(season=season, order="championship_position ASC NULLS LAST", limit=limit)


@lru_cache
def race_results(race_id: int) -> dict[str, Any]:
    race = row("""SELECT ra.race_id, ra.year, ra.round, ra.name, ra.date, ra.circuit_id, ra.circuit_name,
                         ra.location, ra.country, ra.has_sprint, ra.url, ci.circuit_ref
                  FROM race ra JOIN circuit ci USING (circuit_id) WHERE ra.race_id = ?""", [race_id])
    if race is None:
        return {}
    results = rows(f"""
      SELECT r.position, r.position_text, r.position_order, r.grid, r.points, r.laps, r.race_time,
             r.status, r.status_group, r.fastest_lap_time, r.fastest_lap_rank, r.positions_gained,
             r.is_dnf, r.classified, {DRIVER_COLS}, {TEAM_COLS}
      FROM result r JOIN driver d USING (driver_id) JOIN constructor c USING (constructor_id)
      WHERE r.race_id = ? ORDER BY r.position_order""", [race_id])
    return {"race": race, "results": results}
