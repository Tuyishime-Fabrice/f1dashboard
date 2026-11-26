"""Reusable SQL building blocks shared by the analytics services.

Counting rules (applied consistently everywhere):
* start      -> distinct race where the driver took the start (excludes DNQ, DNPQ,
                DNS, withdrawn, 107 % rule). Shared 1950s drives count once.
* win/podium -> distinct race with a classified P1 / P1-P3 result.
* DNF        -> started but not classified (positionText R or N). DSQ is separate.
* pole       -> driver starting from grid slot 1 (official convention; 2022 sprint
                weekends use Friday qualifying P1). See etl/build.py.
* points     -> official championship points from the standings table (they include
                sprint points and respect historical dropped-score rules).
"""

from __future__ import annotations

from typing import Any

from app.db import rows

DRIVER_COLS = "d.driver_id, d.driver_ref, d.code, d.full_name AS driver_name, d.surname, d.nationality"
TEAM_COLS = "c.constructor_id, c.constructor_ref, c.name AS constructor_name"


def scope_filter(season: int | None, alias: str = "") -> str:
    prefix = f"{alias}." if alias else ""
    return f"{prefix}year = $season" if season is not None else "TRUE"


def driver_stats(season: int | None = None, driver_ids: list[int] | None = None,
                 order: str = "points DESC NULLS LAST", limit: int | None = None) -> list[dict[str, Any]]:
    """Per-driver performance metrics for one season or the whole history."""
    params: dict[str, Any] = {}
    if season is not None:
        params["season"] = season
    flt = scope_filter(season)
    ids_clause = ""
    if driver_ids:
        params["ids"] = list(driver_ids)
        ids_clause = "AND list_contains($ids, driver_id)"
    lim = f"LIMIT {int(limit)}" if limit else ""
    sql = f"""
    WITH r AS (SELECT * FROM result WHERE {flt} {ids_clause}),
    agg AS (
      SELECT driver_id,
             count(DISTINCT race_id) FILTER (WHERE started) AS starts,
             count(DISTINCT race_id) FILTER (WHERE is_win) AS wins,
             count(DISTINCT race_id) FILTER (WHERE is_podium) AS podiums,
             count(DISTINCT race_id) FILTER (WHERE is_dnf) AS dnfs,
             count(DISTINCT race_id) FILTER (WHERE classified) AS classified,
             avg(position) FILTER (WHERE classified) AS avg_finish,
             avg(positions_gained) AS avg_positions_gained,
             sum(positions_gained) AS total_positions_gained,
             avg(grid) FILTER (WHERE started) AS avg_grid,
             count(DISTINCT race_id) FILTER (WHERE fastest_lap_rank = 1) AS fastest_laps,
             sum(points) AS race_points,
             min(year) AS first_year, max(year) AS last_year
      FROM r GROUP BY driver_id),
    poles AS (
      SELECT p.driver_id, count(*) AS poles FROM race_pole p JOIN race USING (race_id)
      WHERE {flt} GROUP BY 1),
    quali AS (
      SELECT driver_id, avg(position) AS avg_quali, count(*) AS quali_sessions
      FROM qualifying WHERE {flt} GROUP BY 1),
    champ AS (
      SELECT sd.driver_id, sum(sd.points) AS points, min(sd.position) AS best_championship,
             count(*) FILTER (WHERE sd.position = 1 AND NOT s.in_progress) AS titles,
             count(*) AS seasons,
             arg_max(sd.position, sd.year) AS championship_position
      FROM season_driver sd JOIN season s USING (year) WHERE {scope_filter(season, 'sd')} GROUP BY 1),
    team AS (
      SELECT driver_id, arg_max(constructor_id, year) AS constructor_id
      FROM driver_season_team WHERE {flt} GROUP BY 1)
    SELECT {DRIVER_COLS}, {TEAM_COLS},
           agg.starts, agg.wins, agg.podiums, coalesce(poles.poles, 0) AS poles, agg.dnfs,
           agg.classified, round(agg.avg_finish, 2) AS avg_finish,
           round(agg.avg_positions_gained, 2) AS avg_positions_gained,
           agg.total_positions_gained, round(agg.avg_grid, 2) AS avg_grid,
           round(quali.avg_quali, 2) AS avg_quali, coalesce(quali.quali_sessions, 0) AS quali_sessions,
           agg.fastest_laps, coalesce(champ.points, 0) AS points, agg.race_points,
           champ.best_championship, coalesce(champ.titles, 0) AS titles, champ.seasons,
           champ.championship_position,
           round(100.0 * agg.dnfs / nullif(agg.starts, 0), 1) AS dnf_rate,
           round(100.0 * agg.wins / nullif(agg.starts, 0), 1) AS win_rate,
           round(100.0 * agg.podiums / nullif(agg.starts, 0), 1) AS podium_rate,
           agg.first_year, agg.last_year
    FROM agg
    JOIN driver d USING (driver_id)
    LEFT JOIN poles USING (driver_id)
    LEFT JOIN quali USING (driver_id)
    LEFT JOIN champ USING (driver_id)
    LEFT JOIN team USING (driver_id)
    LEFT JOIN constructor c ON c.constructor_id = team.constructor_id
    ORDER BY {order}, agg.wins DESC, d.surname
    {lim}
    """
    return rows(sql, params)


def constructor_stats(season: int | None = None, constructor_ids: list[int] | None = None,
                      order: str = "points DESC NULLS LAST", limit: int | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {}
    if season is not None:
        params["season"] = season
    flt = scope_filter(season)
    ids_clause = ""
    if constructor_ids:
        params["ids"] = list(constructor_ids)
        ids_clause = "AND list_contains($ids, constructor_id)"
    lim = f"LIMIT {int(limit)}" if limit else ""
    sql = f"""
    WITH r AS (SELECT * FROM result WHERE {flt} {ids_clause}),
    agg AS (
      SELECT constructor_id,
             count(DISTINCT race_id) FILTER (WHERE started) AS races,
             count(*) FILTER (WHERE started) AS car_starts,
             count(DISTINCT race_id) FILTER (WHERE is_win) AS wins,
             count(*) FILTER (WHERE is_podium) AS podiums,
             count(*) FILTER (WHERE is_dnf) AS dnfs,
             avg(position) FILTER (WHERE classified) AS avg_finish,
             sum(points) AS race_points,
             count(DISTINCT year) AS seasons_raced,
             min(year) AS first_year, max(year) AS last_year
      FROM r GROUP BY constructor_id),
    one_two AS (
      SELECT constructor_id, count(*) AS one_twos FROM (
        SELECT race_id, constructor_id FROM r WHERE position IN (1, 2)
        GROUP BY ALL HAVING count(DISTINCT position) = 2) GROUP BY 1),
    poles AS (
      SELECT x.constructor_id, count(DISTINCT p.race_id) AS poles
      FROM race_pole p JOIN race ra USING (race_id)
      JOIN result x ON x.race_id = p.race_id AND x.driver_id = p.driver_id
      WHERE {scope_filter(season, 'ra')} GROUP BY 1),
    champ AS (
      SELECT sc.constructor_id, sum(sc.points) AS points, min(sc.position) AS best_championship,
             count(*) FILTER (WHERE sc.position = 1 AND NOT s.in_progress) AS titles,
             arg_max(sc.position, sc.year) AS championship_position, count(*) AS seasons
      FROM season_constructor sc JOIN season s USING (year) WHERE {scope_filter(season, 'sc')} GROUP BY 1)
    SELECT {TEAM_COLS}, c.nationality,
           agg.races, agg.car_starts, agg.wins, agg.podiums, coalesce(poles.poles, 0) AS poles,
           coalesce(one_two.one_twos, 0) AS one_twos, agg.dnfs,
           round(agg.avg_finish, 2) AS avg_finish,
           champ.points, agg.race_points,
           round(coalesce(champ.points, agg.race_points) / nullif(agg.races, 0), 2) AS points_per_race,
           champ.best_championship, coalesce(champ.titles, 0) AS titles, champ.championship_position,
           champ.seasons, agg.seasons_raced,
           round(100.0 * agg.wins / nullif(agg.races, 0), 1) AS win_rate,
           round(100.0 * agg.dnfs / nullif(agg.car_starts, 0), 1) AS dnf_rate,
           agg.first_year, agg.last_year
    FROM agg JOIN constructor c USING (constructor_id)
    LEFT JOIN poles USING (constructor_id)
    LEFT JOIN one_two USING (constructor_id)
    LEFT JOIN champ USING (constructor_id)
    ORDER BY {order}, agg.wins DESC, c.name
    {lim}
    """
    return rows(sql, params)


def round_labels(season: int) -> list[dict[str, Any]]:
    return rows("""
      SELECT race_id, round, name, date, circuit_name, country, has_sprint
      FROM race WHERE year = ? ORDER BY round""", [season])


def short_race_name(name: str) -> str:
    return name.replace(" Grand Prix", " GP")
