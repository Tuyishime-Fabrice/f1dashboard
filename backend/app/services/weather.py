"""Weather (2025+) summaries and their association with race outcomes.

These are observational associations over a small sample (one row per race),
not causal estimates. The API returns the sample size with every statistic.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db import row, rows

# Per-race outcome metrics joined to the weather table.
_OUTCOMES = """
  WITH res AS (
    SELECT race_id,
           count(*) FILTER (WHERE is_dnf) AS dnfs,
           count(*) FILTER (WHERE started) AS starters,
           avg(abs(positions_gained)) AS avg_abs_change,
           max(grid) FILTER (WHERE is_win) AS winner_grid,
           bool_or(is_win AND grid = 1) AS pole_won
    FROM result GROUP BY 1),
  pit AS (SELECT race_id, count(*)::DOUBLE / count(DISTINCT driver_id) AS stops_per_driver,
                 median(duration_ms) FILTER (WHERE valid_duration) AS median_pit_ms
          FROM pit_stop GROUP BY 1),
  tyre AS (SELECT race_id, avg(laps) FILTER (WHERE compound IN ('SOFT','MEDIUM','HARD')) AS avg_dry_stint,
                  sum(laps) FILTER (WHERE compound IN ('INTERMEDIATE','WET')) AS wet_tyre_laps
           FROM tyre_stint GROUP BY 1),
  win AS (SELECT r.race_id, d.full_name AS winner, d.code AS winner_code, c.constructor_ref
          FROM result r JOIN driver d USING (driver_id) JOIN constructor c USING (constructor_id)
          WHERE r.is_win QUALIFY row_number() OVER (PARTITION BY r.race_id ORDER BY r.result_id) = 1)
  SELECT w.*, ra.date, ra.circuit_name, ra.country,
         res.dnfs, res.starters, round(res.avg_abs_change, 2) AS avg_abs_change, res.winner_grid, res.pole_won,
         round(pit.stops_per_driver, 2) AS stops_per_driver, pit.median_pit_ms,
         round(tyre.avg_dry_stint, 1) AS avg_dry_stint, coalesce(tyre.wet_tyre_laps, 0) AS wet_tyre_laps,
         win.winner, win.winner_code, win.constructor_ref
  FROM weather w JOIN race ra USING (race_id)
  LEFT JOIN res USING (race_id) LEFT JOIN pit USING (race_id) LEFT JOIN tyre USING (race_id)
  LEFT JOIN win USING (race_id)
"""


@lru_cache
def weather_races(season: int | None = None) -> list[dict[str, Any]]:
    where = "WHERE w.year = $season" if season else ""
    return rows(_OUTCOMES + where + " ORDER BY w.year, w.round", {"season": season} if season else None)


@lru_cache
def summary(season: int | None = None) -> dict[str, Any]:
    where = "WHERE year = $season" if season else ""
    return row(f"""
      SELECT count(*) AS races, round(avg(air_temp_avg), 1) AS air_temp, round(avg(track_temp_avg), 1) AS track_temp,
             round(avg(humidity_avg), 1) AS humidity, round(avg(wind_speed_avg), 1) AS wind_speed,
             count(*) FILTER (WHERE rainfall) AS wet_races,
             max(track_temp_max) AS hottest_track, min(air_temp_min) AS coldest_air
      FROM weather {where}""", {"season": season} if season else None) or {}


@lru_cache
def wet_vs_dry(season: int | None = None) -> list[dict[str, Any]]:
    where = "WHERE w.year = $season" if season else ""
    return rows(f"""
      WITH o AS ({_OUTCOMES} {where})
      SELECT CASE WHEN rainfall THEN 'Rain recorded' ELSE 'Dry' END AS condition,
             count(*) AS races,
             round(avg(dnfs), 2) AS avg_dnfs,
             round(avg(avg_abs_change), 2) AS avg_abs_change,
             round(avg(stops_per_driver), 2) AS stops_per_driver,
             round(avg(winner_grid), 2) AS avg_winner_grid,
             round(100.0 * avg(pole_won::INT), 1) AS pole_win_rate,
             round(avg(track_temp_avg), 1) AS track_temp
      FROM o GROUP BY 1 ORDER BY 1""", {"season": season} if season else None)


@lru_cache
def correlations(season: int | None = None) -> list[dict[str, Any]]:
    where = "WHERE w.year = $season" if season else ""
    pairs = [
        ("track_temp_avg", "avg_dry_stint", "Track temp vs avg dry-tyre stint (laps)"),
        ("track_temp_avg", "stops_per_driver", "Track temp vs pit stops per driver"),
        ("air_temp_avg", "dnfs", "Air temp vs DNFs"),
        ("humidity_avg", "avg_abs_change", "Humidity vs avg position change"),
        ("wind_speed_avg", "avg_abs_change", "Wind speed vs avg position change"),
    ]
    out = []
    for x, y, label in pairs:
        r = row(f"""WITH o AS ({_OUTCOMES} {where})
                    SELECT corr({x}, {y}) AS r, count({y}) AS n FROM o WHERE {y} IS NOT NULL""",
                {"season": season} if season else None)
        out.append({"x": x, "y": y, "label": label, "r": r["r"] if r else None, "n": r["n"] if r else 0})
    return out
