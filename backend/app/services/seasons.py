"""Season explorer: calendar with outcomes and the driver x round results matrix."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db import row, rows
from app.services.common import DRIVER_COLS, TEAM_COLS, round_labels


@lru_cache
def calendar(season: int) -> list[dict[str, Any]]:
    return rows(f"""
      WITH win AS (
        SELECT r.race_id, {DRIVER_COLS}, {TEAM_COLS}, r.grid, r.laps
        FROM result r JOIN driver d USING (driver_id) JOIN constructor c USING (constructor_id)
        WHERE r.is_win AND r.year = $season
        QUALIFY row_number() OVER (PARTITION BY r.race_id ORDER BY r.result_id) = 1),
      fl AS (
        SELECT r.race_id, d.code AS fastest_code, d.full_name AS fastest_driver, r.fastest_lap_time
        FROM result r JOIN driver d USING (driver_id)
        WHERE r.fastest_lap_rank = 1 AND r.year = $season
        QUALIFY row_number() OVER (PARTITION BY r.race_id ORDER BY r.result_id) = 1)
      SELECT ra.race_id, ra.round, ra.name AS race_name, ra.date, ra.circuit_id, ra.circuit_name, ra.country,
             ra.has_sprint, ci.circuit_ref, win.* EXCLUDE (race_id),
             pd.full_name AS pole_driver, pd.code AS pole_code,
             fl.fastest_code, fl.fastest_driver, fl.fastest_lap_time,
             w.rainfall, w.air_temp_avg, w.track_temp_avg
      FROM race ra JOIN circuit ci USING (circuit_id)
      LEFT JOIN win USING (race_id)
      LEFT JOIN race_pole p USING (race_id) LEFT JOIN driver pd ON pd.driver_id = p.driver_id
      LEFT JOIN fl USING (race_id)
      LEFT JOIN weather w USING (race_id)
      WHERE ra.year = $season ORDER BY ra.round""", {"season": season})


@lru_cache
def results_matrix(season: int) -> dict[str, Any]:
    """Finishing result for every driver in every round (best result for shared drives)."""
    labels = round_labels(season)
    drivers = rows(f"""
      SELECT {DRIVER_COLS}, {TEAM_COLS}, sd.position AS standing, sd.points
      FROM season_driver sd JOIN driver d USING (driver_id)
      LEFT JOIN driver_season_team t ON t.year = sd.year AND t.driver_id = sd.driver_id
      LEFT JOIN constructor c ON c.constructor_id = t.constructor_id
      WHERE sd.year = ? ORDER BY sd.position""", [season])
    cells = rows("""
      SELECT round, driver_id, position, position_text, points, status, grid, is_dnf, started
      FROM result WHERE year = ?
      QUALIFY row_number() OVER (PARTITION BY race_id, driver_id ORDER BY position_order) = 1""", [season])
    sprint_pts = rows("""SELECT round, driver_id, points, position FROM sprint WHERE year = ? AND points > 0""",
                      [season])
    return {"rounds": labels, "drivers": drivers, "cells": cells, "sprint": sprint_pts}


@lru_cache
def summary(season: int) -> dict[str, Any]:
    info = row("SELECT * FROM season WHERE year = ?", [season]) or {}
    counts = row("""
      SELECT count(DISTINCT driver_id) FILTER (WHERE is_win) AS winners,
             count(DISTINCT driver_id) FILTER (WHERE started) AS drivers,
             count(DISTINCT constructor_id) AS constructors,
             count(DISTINCT driver_id) FILTER (WHERE is_podium) AS podium_finishers
      FROM result WHERE year = ?""", [season]) or {}
    poles = row("""SELECT count(DISTINCT p.driver_id) AS pole_sitters FROM race_pole p JOIN race USING (race_id)
                   WHERE year = ?""", [season]) or {}
    return {**info, **counts, **poles}
