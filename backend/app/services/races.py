"""Race analytics: race detail, grid vs finish, status distribution, circuits."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db import frame, row, rows
from app.services.common import DRIVER_COLS, TEAM_COLS
from app.services.overview import race_results


@lru_cache
def race_detail(race_id: int) -> dict[str, Any]:
    base = race_results(race_id)
    if not base:
        return {}
    pole = row(f"""SELECT {DRIVER_COLS}, p.source FROM race_pole p JOIN driver d USING (driver_id)
                   WHERE p.race_id = ?""", [race_id])
    fastest = row(f"""SELECT {DRIVER_COLS}, {TEAM_COLS}, r.fastest_lap_time, r.fastest_lap_no
                      FROM result r JOIN driver d USING (driver_id) JOIN constructor c USING (constructor_id)
                      WHERE r.race_id = ? AND r.fastest_lap_rank = 1 LIMIT 1""", [race_id])
    weather = row("SELECT * EXCLUDE (race_id, year, round, race_name) FROM weather WHERE race_id = ?", [race_id])
    summary = row("""
      SELECT count(*) FILTER (WHERE started) AS starters,
             count(*) FILTER (WHERE classified) AS classified,
             count(*) FILTER (WHERE is_dnf) AS dnfs,
             max(laps) AS laps,
             sum(abs(positions_gained)) AS total_position_changes
      FROM result WHERE race_id = ?""", [race_id])
    pit = row("""SELECT count(*) AS stops, median(duration_ms) FILTER (WHERE valid_duration) AS median_ms
                 FROM pit_stop WHERE race_id = ?""", [race_id])
    return {**base, "pole": pole, "fastest_lap": fastest, "weather": weather,
            "summary": summary, "pit": pit}


@lru_cache
def lap_positions(race_id: int) -> dict[str, Any]:
    df = frame(f"""
      SELECT l.lap, l.position, l.lap_ms, {DRIVER_COLS}
      FROM lap_time l JOIN driver d USING (driver_id) WHERE l.race_id = $race ORDER BY l.lap""",
               {"race": race_id})
    if df.empty:
        return {"laps": 0, "series": []}
    order = rows(f"""SELECT r.driver_id, {TEAM_COLS}, r.grid, r.position_order
                     FROM result r JOIN constructor c USING (constructor_id)
                     WHERE r.race_id = ? ORDER BY r.position_order""", [race_id])
    max_lap = int(df["lap"].max())
    series = []
    for o in order:
        sub = df[df["driver_id"] == o["driver_id"]]
        if sub.empty:
            continue
        pos = dict(zip(sub["lap"].astype(int), sub["position"].astype(int)))
        ms = dict(zip(sub["lap"].astype(int), sub["lap_ms"].astype(int)))
        first = sub.iloc[0]
        series.append({
            "driver_id": int(o["driver_id"]), "code": None if first["code"] != first["code"] else first["code"], "driver_name": first["driver_name"],
            "constructor_ref": o["constructor_ref"], "constructor_name": o["constructor_name"],
            "grid": o["grid"],
            "positions": [pos.get(i) for i in range(1, max_lap + 1)],
            "lap_ms": [ms.get(i) for i in range(1, max_lap + 1)],
        })
    return {"laps": max_lap, "series": series}


@lru_cache
def grid_vs_finish(season: int) -> dict[str, Any]:
    pts = rows(f"""
      SELECT r.round, r.grid, r.position, {DRIVER_COLS}, {TEAM_COLS}
      FROM result r JOIN driver d USING (driver_id) JOIN constructor c USING (constructor_id)
      WHERE r.year = ? AND r.classified AND r.grid IS NOT NULL""", [season])
    stats = row("""
      SELECT corr(grid, position) AS r, count(*) AS n,
             avg(positions_gained) AS avg_gain,
             count(*) FILTER (WHERE is_win AND grid = 1) AS pole_wins,
             count(DISTINCT race_id) AS races,
             avg(grid) FILTER (WHERE is_win) AS avg_winner_grid,
             max(grid) FILTER (WHERE is_win) AS worst_winning_grid
      FROM result WHERE year = ? AND classified AND grid IS NOT NULL""", [season])
    return {"points": pts, "stats": stats}


@lru_cache
def positions_gained(season: int, limit: int = 12) -> dict[str, Any]:
    q = f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, sum(r.positions_gained) AS total, round(avg(r.positions_gained), 2) AS avg,
             count(r.positions_gained) AS races
      FROM result r JOIN driver d USING (driver_id)
      LEFT JOIN driver_season_team t ON t.year = r.year AND t.driver_id = r.driver_id
      LEFT JOIN constructor c ON c.constructor_id = t.constructor_id
      WHERE r.year = ? AND r.positions_gained IS NOT NULL GROUP BY ALL"""
    return {
        "gainers": rows(q + f" ORDER BY total DESC LIMIT {limit}", [season]),
        "losers": rows(q + f" ORDER BY total ASC LIMIT {limit}", [season]),
    }


@lru_cache
def status_distribution(season: int) -> dict[str, Any]:
    groups = rows("""SELECT status_group, count(*) AS n FROM result
                     WHERE year = ? AND started GROUP BY 1 ORDER BY n DESC""", [season])
    detail = rows("""SELECT status, status_group, count(*) AS n FROM result
                     WHERE year = ? AND started AND status_group NOT IN ('Finished', 'Lapped')
                     GROUP BY ALL ORDER BY n DESC LIMIT 12""", [season])
    return {"groups": groups, "detail": detail}


@lru_cache
def retirement_trend() -> list[dict[str, Any]]:
    return rows("""
      SELECT year,
             count(*) FILTER (WHERE started) AS starts,
             round(100.0 * count(*) FILTER (WHERE is_dnf) / count(*) FILTER (WHERE started), 1) AS dnf_rate,
             round(100.0 * count(*) FILTER (WHERE is_dnf AND status_group = 'Mechanical')
                   / count(*) FILTER (WHERE started), 1) AS mechanical_rate,
             round(100.0 * count(*) FILTER (WHERE is_dnf AND status_group = 'Accident / collision')
                   / count(*) FILTER (WHERE started), 1) AS accident_rate,
             round(100.0 * count(*) FILTER (WHERE is_dnf AND status_group = 'Retired (unspecified)')
                   / count(*) FILTER (WHERE started), 1) AS unspecified_rate
      FROM result GROUP BY year ORDER BY year""")


@lru_cache
def fastest_laps(season: int) -> dict[str, Any]:
    counts = rows(f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, count(*) AS fastest_laps
      FROM result r JOIN driver d USING (driver_id) JOIN constructor c USING (constructor_id)
      WHERE r.year = ? AND r.fastest_lap_rank = 1 GROUP BY ALL ORDER BY fastest_laps DESC, d.surname""",
                  [season])
    per_race = rows(f"""
      SELECT ra.round, ra.name AS race_name, {DRIVER_COLS}, {TEAM_COLS}, r.fastest_lap_time, r.fastest_lap_ms,
             r.fastest_lap_no
      FROM result r JOIN race ra USING (race_id) JOIN driver d USING (driver_id)
      JOIN constructor c USING (constructor_id)
      WHERE r.year = ? AND r.fastest_lap_rank = 1 ORDER BY ra.round""", [season])
    return {"counts": counts, "per_race": per_race}


@lru_cache
def race_fastest_laps(race_id: int) -> list[dict[str, Any]]:
    return rows(f"""
      SELECT r.fastest_lap_rank AS rank, {DRIVER_COLS}, {TEAM_COLS}, r.fastest_lap_time, r.fastest_lap_ms,
             r.fastest_lap_no
      FROM result r JOIN driver d USING (driver_id) JOIN constructor c USING (constructor_id)
      WHERE r.race_id = ? AND r.fastest_lap_ms IS NOT NULL ORDER BY r.fastest_lap_ms""", [race_id])


@lru_cache
def circuit_history(circuit_id: int) -> dict[str, Any]:
    circuit = row("""SELECT c.*, count(r.race_id) AS races, min(r.year) AS first_year, max(r.year) AS last_year
                     FROM circuit c LEFT JOIN race r USING (circuit_id) WHERE c.circuit_id = ? GROUP BY ALL""",
                  [circuit_id])
    if circuit is None:
        return {}
    winners = rows(f"""
      SELECT ra.year, ra.name AS race_name, {DRIVER_COLS}, {TEAM_COLS}, w.grid
      FROM race ra JOIN result w ON w.race_id = ra.race_id AND w.is_win
      JOIN driver d ON d.driver_id = w.driver_id JOIN constructor c ON c.constructor_id = w.constructor_id
      WHERE ra.circuit_id = ? ORDER BY ra.year DESC, w.result_id""", [circuit_id])
    top_drivers = rows(f"""
      SELECT {DRIVER_COLS}, count(DISTINCT w.race_id) AS wins
      FROM race ra JOIN result w ON w.race_id = ra.race_id AND w.is_win JOIN driver d ON d.driver_id = w.driver_id
      WHERE ra.circuit_id = ? GROUP BY ALL ORDER BY wins DESC, d.surname LIMIT 10""", [circuit_id])
    top_teams = rows(f"""
      SELECT {TEAM_COLS}, count(DISTINCT w.race_id) AS wins
      FROM race ra JOIN result w ON w.race_id = ra.race_id AND w.is_win
      JOIN constructor c ON c.constructor_id = w.constructor_id
      WHERE ra.circuit_id = ? GROUP BY ALL ORDER BY wins DESC, c.name LIMIT 10""", [circuit_id])
    traits = row("""
      SELECT round(100.0 * count(DISTINCT race_id) FILTER (WHERE is_win AND grid = 1)
                   / nullif(count(DISTINCT race_id), 0), 1) AS pole_win_rate,
             round(avg(grid) FILTER (WHERE is_win), 2) AS avg_winner_grid,
             round(avg(abs(positions_gained)), 2) AS avg_abs_position_change,
             round(100.0 * count(*) FILTER (WHERE is_dnf) / nullif(count(*) FILTER (WHERE started), 0), 1) AS dnf_rate
      FROM result r JOIN race ra USING (race_id) WHERE ra.circuit_id = ?""", [circuit_id])
    return {"circuit": circuit, "winners": winners, "top_drivers": top_drivers,
            "top_constructors": top_teams, "traits": traits}


@lru_cache
def circuit_traits(season: int) -> list[dict[str, Any]]:
    """Historical characteristics of every circuit on the selected season's calendar."""
    return rows("""
      WITH cal AS (SELECT DISTINCT circuit_id, min(round) AS round FROM race WHERE year = $season GROUP BY 1),
      hist AS (
        SELECT ra.circuit_id, count(DISTINCT ra.race_id) AS races,
               round(100.0 * count(DISTINCT ra.race_id) FILTER (WHERE r.is_win AND r.grid = 1)
                     / count(DISTINCT ra.race_id), 1) AS pole_win_rate,
               round(avg(r.grid) FILTER (WHERE r.is_win), 2) AS avg_winner_grid,
               round(avg(abs(r.positions_gained)), 2) AS avg_abs_position_change,
               round(100.0 * count(*) FILTER (WHERE r.is_dnf) / nullif(count(*) FILTER (WHERE r.started), 0), 1)
                 AS dnf_rate
        FROM race ra JOIN result r USING (race_id)
        WHERE ra.year >= 2000 AND ra.year <= $season
        GROUP BY 1)
      SELECT cal.round, ci.circuit_id, ci.circuit_ref, ci.name, ci.country, hist.*
      FROM cal JOIN circuit ci USING (circuit_id) JOIN hist USING (circuit_id)
      ORDER BY cal.round""", {"season": season})
