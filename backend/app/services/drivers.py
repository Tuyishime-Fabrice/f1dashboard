"""Driver analytics: rankings, profiles, comparisons and qualifying-vs-race."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db import row, rows
from app.services.common import DRIVER_COLS, TEAM_COLS, driver_stats

RANK_METRICS = {
    "wins": "wins DESC",
    "points": "points DESC NULLS LAST",
    "podiums": "podiums DESC",
    "poles": "poles DESC",
    "starts": "starts DESC",
    "fastest_laps": "fastest_laps DESC",
}


@lru_cache
def leaderboard(metric: str, season: int | None, limit: int = 15) -> list[dict[str, Any]]:
    order = RANK_METRICS.get(metric, RANK_METRICS["wins"])
    out = driver_stats(season=season, order=order, limit=limit)
    return [r for r in out if (r.get(metric) or 0) > 0]


@lru_cache
def standings(season: int) -> list[dict[str, Any]]:
    return driver_stats(season=season, order="championship_position ASC NULLS LAST")


@lru_cache
def profile(driver_id: int, season: int | None = None) -> dict[str, Any]:
    info = row("""SELECT driver_id, driver_ref, code, forename, surname, full_name, permanent_number,
                         dob, nationality, url FROM driver WHERE driver_id = ?""", [driver_id])
    if info is None:
        return {}
    stats = driver_stats(season=season, driver_ids=[driver_id])
    career = stats[0] if season is None else (driver_stats(driver_ids=[driver_id]) or [None])[0]
    teams = rows(f"""
      SELECT {TEAM_COLS}, min(r.year) AS first_year, max(r.year) AS last_year,
             count(DISTINCT r.race_id) AS races
      FROM result r JOIN constructor c USING (constructor_id)
      WHERE r.driver_id = ? GROUP BY ALL ORDER BY first_year""", [driver_id])
    debut = row("""SELECT ra.year, ra.name FROM result r JOIN race ra USING (race_id)
                   WHERE r.driver_id = ? AND r.started ORDER BY ra.date LIMIT 1""", [driver_id])
    return {"driver": info, "stats": stats[0] if stats else None, "career": career,
            "teams": teams, "debut": debut}


@lru_cache
def compare(driver_ids: tuple[int, ...], season: int | None = None) -> dict[str, Any]:
    stats = driver_stats(season=season, driver_ids=list(driver_ids))
    by_season = rows(f"""
      SELECT sd.year, {DRIVER_COLS}, sd.points, sd.position, sd.wins,
             (SELECT count(*) FROM race WHERE year = sd.year) AS season_races
      FROM season_driver sd JOIN driver d USING (driver_id)
      WHERE list_contains($ids, sd.driver_id) ORDER BY sd.year""", {"ids": list(driver_ids)})
    rounds: list[dict[str, Any]] = []
    if season is not None:
        rounds = rows(f"""
          SELECT r.round, ra.name AS race_name, {DRIVER_COLS}, r.position, r.position_text, r.grid,
                 q.position AS quali_position, r.points, r.status
          FROM result r JOIN race ra USING (race_id) JOIN driver d USING (driver_id)
          LEFT JOIN qualifying q ON q.race_id = r.race_id AND q.driver_id = r.driver_id
          WHERE r.year = $season AND list_contains($ids, r.driver_id)
          ORDER BY r.round""", {"season": season, "ids": list(driver_ids)})
    # Head-to-head: races where both drivers finished classified (only for 2 drivers).
    h2h = None
    if len(driver_ids) == 2:
        a, b = driver_ids
        flt = "AND x.year = $season" if season is not None else ""
        params: dict[str, Any] = {"a": a, "b": b}
        if season is not None:
            params["season"] = season
        h2h = row(f"""
          WITH x AS (SELECT race_id, year, driver_id, min(position_order) AS po, min(grid) AS grid,
                            bool_or(classified) AS cls
                     FROM result GROUP BY ALL),
          pairs AS (SELECT xa.race_id, xa.po AS a_po, xb.po AS b_po, xa.grid AS a_grid, xb.grid AS b_grid,
                           xa.cls AS a_cls, xb.cls AS b_cls
                    FROM x xa JOIN x xb ON xa.race_id = xb.race_id AND xb.driver_id = $b
                    WHERE xa.driver_id = $a {flt.replace('x.', 'xa.')})
          SELECT count(*) AS shared_races,
                 count(*) FILTER (WHERE a_po < b_po) AS a_ahead,
                 count(*) FILTER (WHERE b_po < a_po) AS b_ahead,
                 count(*) FILTER (WHERE a_grid < b_grid) AS a_grid_ahead,
                 count(*) FILTER (WHERE b_grid < a_grid) AS b_grid_ahead
          FROM pairs""", params)
    return {"stats": stats, "by_season": by_season, "rounds": rounds, "head_to_head": h2h}


@lru_cache
def quali_vs_race(season: int, driver_ids: tuple[int, ...] | None = None) -> dict[str, Any]:
    """Start position (qualifying where available, else grid) against result."""
    params: dict[str, Any] = {"season": season}
    ids_clause = ""
    if driver_ids:
        params["ids"] = list(driver_ids)
        ids_clause = "AND list_contains($ids, r.driver_id)"
    pts = rows(f"""
      SELECT r.round, ra.name AS race_name, {DRIVER_COLS}, {TEAM_COLS},
             q.position AS quali_position, r.grid, r.position, r.position_text, r.classified, r.status
      FROM result r JOIN race ra USING (race_id) JOIN driver d USING (driver_id)
      JOIN constructor c USING (constructor_id)
      LEFT JOIN qualifying q ON q.race_id = r.race_id AND q.driver_id = r.driver_id
      WHERE r.year = $season AND r.started {ids_clause}
      ORDER BY r.round, r.position_order""", params)
    corr = row(f"""
      SELECT corr(coalesce(q.position, r.grid), r.position) AS r, count(*) AS n
      FROM result r LEFT JOIN qualifying q ON q.race_id = r.race_id AND q.driver_id = r.driver_id
      WHERE r.year = $season AND r.classified AND coalesce(q.position, r.grid) IS NOT NULL {ids_clause}""",
               params)
    return {"points": pts, "correlation": corr}
