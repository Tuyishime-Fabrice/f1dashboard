"""Lookup data for filters, data-coverage flags and data-quality notes."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db import rows
from app.services.common import DRIVER_COLS, TEAM_COLS


@lru_cache
def seasons() -> list[dict[str, Any]]:
    return rows("""
      SELECT s.year, s.races, s.last_round, s.first_date, s.last_date, s.in_progress, s.sprint_weekends,
             EXISTS (SELECT 1 FROM qualifying q WHERE q.year = s.year) AS has_qualifying,
             EXISTS (SELECT 1 FROM lap_time l JOIN race r USING (race_id) WHERE r.year = s.year) AS has_lap_times,
             EXISTS (SELECT 1 FROM pit_stop p WHERE p.year = s.year) AS has_pit_stops,
             EXISTS (SELECT 1 FROM tyre_stint t WHERE t.year = s.year) AS has_tyres,
             EXISTS (SELECT 1 FROM weather w WHERE w.year = s.year) AS has_weather,
             EXISTS (SELECT 1 FROM constructor_standing c WHERE c.year = s.year) AS has_constructor_standings
      FROM season s ORDER BY s.year DESC""")


@lru_cache
def coverage() -> list[dict[str, Any]]:
    return rows("SELECT * FROM coverage")


@lru_cache
def quality() -> list[dict[str, Any]]:
    return rows("SELECT * FROM quality_report WHERE level = 'warn' OR NOT ok")


@lru_cache
def season_entities(season: int) -> dict[str, Any]:
    drivers = rows(f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, sd.position AS standing, sd.points
      FROM driver_season_team t
      JOIN driver d USING (driver_id)
      JOIN constructor c USING (constructor_id)
      LEFT JOIN season_driver sd ON sd.year = t.year AND sd.driver_id = t.driver_id
      WHERE t.year = ? ORDER BY sd.position NULLS LAST, d.surname""", [season])
    constructors = rows(f"""
      SELECT {TEAM_COLS}, sc.position AS standing, sc.points
      FROM (SELECT DISTINCT constructor_id FROM result WHERE year = ?) x
      JOIN constructor c USING (constructor_id)
      LEFT JOIN season_constructor sc ON sc.year = ? AND sc.constructor_id = x.constructor_id
      ORDER BY sc.position NULLS LAST, c.name""", [season, season])
    races = rows(f"""
      SELECT ra.race_id, ra.round, ra.name, ra.date, ra.circuit_id, ra.circuit_name, ra.country,
             ra.has_sprint, ci.circuit_ref, {DRIVER_COLS}
      FROM race ra JOIN circuit ci USING (circuit_id)
      LEFT JOIN result w ON w.race_id = ra.race_id AND w.is_win
      LEFT JOIN driver d ON d.driver_id = w.driver_id
      WHERE ra.year = ?
      QUALIFY row_number() OVER (PARTITION BY ra.race_id ORDER BY w.result_id) = 1
      ORDER BY ra.round""", [season])
    return {"season": season, "drivers": drivers, "constructors": constructors, "races": races}


@lru_cache
def all_drivers() -> list[dict[str, Any]]:
    return rows(f"""
      SELECT {DRIVER_COLS}, min(r.year) AS first_year, max(r.year) AS last_year,
             count(DISTINCT r.race_id) FILTER (WHERE r.started) AS starts,
             count(DISTINCT r.race_id) FILTER (WHERE r.is_win) AS wins
      FROM result r JOIN driver d USING (driver_id)
      GROUP BY ALL ORDER BY wins DESC, starts DESC""")


@lru_cache
def all_constructors() -> list[dict[str, Any]]:
    return rows(f"""
      SELECT {TEAM_COLS}, c.nationality, min(r.year) AS first_year, max(r.year) AS last_year,
             count(DISTINCT r.race_id) AS races,
             count(DISTINCT r.race_id) FILTER (WHERE r.is_win) AS wins
      FROM result r JOIN constructor c USING (constructor_id)
      GROUP BY ALL ORDER BY wins DESC, races DESC""")


@lru_cache
def all_circuits() -> list[dict[str, Any]]:
    return rows("""
      SELECT c.circuit_id, c.circuit_ref, c.name, c.location, c.country, c.lat, c.lng,
             count(r.race_id) AS races, min(r.year) AS first_year, max(r.year) AS last_year
      FROM circuit c JOIN race r USING (circuit_id)
      GROUP BY ALL ORDER BY races DESC""")
