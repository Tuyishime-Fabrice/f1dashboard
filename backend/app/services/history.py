"""Historical analytics across all seasons (1950 onwards).

Raw points are NOT comparable across eras (a win was worth 8 points in 1950,
9 in 1961-90, 10 in 1991-2009 and 25 since 2010; dropped-score rules applied
until 1990). Era comparisons therefore use rates (win %, podium %) or results
re-scored with a single points scale (25-18-15-12-10-8-6-4-2-1, race only).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import pandas as pd

from app.db import frame, rows
from app.services.common import DRIVER_COLS, TEAM_COLS


@lru_cache
def champions() -> list[dict[str, Any]]:
    return rows(f"""
      WITH dc AS (
        SELECT sd.year, {DRIVER_COLS}, sd.points, sd.wins,
               sd.points - lead(sd.points) OVER (PARTITION BY sd.year ORDER BY sd.position) AS margin
        FROM season_driver sd JOIN driver d USING (driver_id)
        QUALIFY row_number() OVER (PARTITION BY sd.year ORDER BY sd.position) = 1),
      dt AS (SELECT t.year, t.driver_id, c.constructor_ref AS driver_team_ref, c.name AS driver_team
             FROM driver_season_team t JOIN constructor c USING (constructor_id)),
      cc AS (
        SELECT sc.year, {TEAM_COLS}, sc.points AS constructor_points, sc.wins AS constructor_wins
        FROM season_constructor sc JOIN constructor c USING (constructor_id)
        QUALIFY row_number() OVER (PARTITION BY sc.year ORDER BY sc.position) = 1)
      SELECT s.year, s.races, s.in_progress, dc.* EXCLUDE (year), dt.driver_team_ref, dt.driver_team,
             cc.* EXCLUDE (year),
             round(100.0 * dc.wins / s.races, 1) AS win_rate
      FROM season s JOIN dc USING (year)
      LEFT JOIN dt ON dt.year = s.year AND dt.driver_id = dc.driver_id
      LEFT JOIN cc ON cc.year = s.year
      ORDER BY s.year DESC""")


@lru_cache
def title_counts() -> dict[str, Any]:
    drivers = rows(f"""
      SELECT {DRIVER_COLS}, count(*) AS titles, list(sd.year ORDER BY sd.year) AS years
      FROM season_driver sd JOIN season s USING (year) JOIN driver d USING (driver_id)
      WHERE sd.position = 1 AND NOT s.in_progress GROUP BY ALL ORDER BY titles DESC, min(sd.year) LIMIT 15""")
    teams = rows(f"""
      SELECT {TEAM_COLS}, count(*) AS titles, list(sc.year ORDER BY sc.year) AS years
      FROM season_constructor sc JOIN season s USING (year) JOIN constructor c USING (constructor_id)
      WHERE sc.position = 1 AND NOT s.in_progress GROUP BY ALL ORDER BY titles DESC, min(sc.year) LIMIT 15""")
    return {"drivers": drivers, "constructors": teams}


@lru_cache
def era_comparison() -> list[dict[str, Any]]:
    """Champion dominance per season with era-neutral measures."""
    return rows("""
      WITH modern AS (
        SELECT year, driver_id, sum(modern_points) AS mp, count(DISTINCT race_id) FILTER (WHERE started) AS starts
        FROM result GROUP BY ALL),
      ranked AS (
        SELECT sd.year, sd.driver_id, sd.position, m.mp, m.starts
        FROM season_driver sd JOIN modern m USING (year, driver_id)),
      champ AS (SELECT * FROM ranked WHERE position = 1),
      second AS (SELECT * FROM ranked WHERE position = 2),
      allpts AS (SELECT year, sum(modern_points) AS total_mp FROM result GROUP BY 1)
      SELECT s.year, s.races, s.in_progress,
             round(100.0 * c.mp / a.total_mp, 1) AS champion_share_modern,
             round(c.mp / s.races, 2) AS champion_modern_ppr,
             round(100.0 * (c.mp - s2.mp) / nullif(c.mp, 0), 1) AS margin_pct_modern,
             round(100.0 * sd.wins / s.races, 1) AS champion_win_rate
      FROM season s JOIN champ c USING (year) LEFT JOIN second s2 USING (year)
      JOIN allpts a USING (year)
      JOIN season_driver sd ON sd.year = s.year AND sd.driver_id = c.driver_id
      ORDER BY s.year""")


@lru_cache
def career_trajectories(driver_ids: tuple[int, ...]) -> list[dict[str, Any]]:
    """Cumulative wins and re-scored points by career start number (era-neutral x-axis)."""
    df = frame(f"""
      WITH per_race AS (
        SELECT r.driver_id, ra.date, ra.year, ra.name AS race_name,
               bool_or(r.is_win) AS win, bool_or(r.is_podium) AS podium, max(r.modern_points) AS mp
        FROM result r JOIN race ra USING (race_id)
        WHERE r.started AND list_contains($ids, r.driver_id) GROUP BY ALL)
      SELECT p.*, {DRIVER_COLS},
             row_number() OVER (PARTITION BY p.driver_id ORDER BY p.date) AS start_no,
             sum(p.win::INT) OVER (PARTITION BY p.driver_id ORDER BY p.date) AS cum_wins,
             sum(p.podium::INT) OVER (PARTITION BY p.driver_id ORDER BY p.date) AS cum_podiums,
             sum(p.mp) OVER (PARTITION BY p.driver_id ORDER BY p.date) AS cum_modern_points
      FROM per_race p JOIN driver d USING (driver_id) ORDER BY p.driver_id, p.date""", {"ids": list(driver_ids)})
    out = []
    for did, g in df.groupby("driver_id", sort=False):
        first = g.iloc[0]
        out.append({
            "driver_id": int(did), "code": None if pd.isna(first["code"]) else first["code"],
            "driver_name": first["driver_name"],
            "first_year": int(g["year"].min()), "last_year": int(g["year"].max()),
            "starts": int(g["start_no"].max()),
            "cum_wins": [int(v) for v in g["cum_wins"]],
            "cum_podiums": [int(v) for v in g["cum_podiums"]],
            "cum_modern_points": [float(v) for v in g["cum_modern_points"]],
        })
    return out


@lru_cache
def circuits_hosted(limit: int = 15) -> list[dict[str, Any]]:
    return rows(f"""
      WITH wins AS (
        SELECT ra.circuit_id, w.driver_id, count(DISTINCT ra.race_id) AS n
        FROM race ra JOIN result w ON w.race_id = ra.race_id AND w.is_win GROUP BY ALL),
      top AS (SELECT * FROM wins QUALIFY row_number() OVER (PARTITION BY circuit_id ORDER BY n DESC, driver_id) = 1)
      SELECT ci.circuit_id, ci.circuit_ref, ci.name, ci.location, ci.country,
             count(ra.race_id) AS races, min(ra.year) AS first_year, max(ra.year) AS last_year,
             any_value(d.full_name) AS top_winner, any_value(d.code) AS top_winner_code, any_value(top.n) AS top_winner_wins
      FROM circuit ci JOIN race ra USING (circuit_id)
      LEFT JOIN top ON top.circuit_id = ci.circuit_id
      LEFT JOIN driver d ON d.driver_id = top.driver_id
      GROUP BY ALL ORDER BY races DESC, ci.name LIMIT {int(limit)}""")


@lru_cache
def points_systems() -> list[dict[str, Any]]:
    """Typical points for a win per season (mode, so one-off double points or bonuses do not distort it)."""
    return rows("""
      SELECT year, mode(points) FILTER (WHERE is_win) AS win_points,
             max(position) FILTER (WHERE points > 0 AND classified) AS scoring_positions
      FROM result GROUP BY year ORDER BY year""")
