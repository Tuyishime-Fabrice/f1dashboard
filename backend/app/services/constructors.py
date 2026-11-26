"""Constructor analytics: standings, dominance, comparisons and season heatmap."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.db import frame, records, row, rows
from app.services.common import TEAM_COLS, constructor_stats

RANK_METRICS = {
    "wins": "wins DESC",
    "points": "points DESC NULLS LAST",
    "podiums": "podiums DESC",
    "poles": "poles DESC",
    "titles": "titles DESC",
}


@lru_cache
def standings(season: int) -> list[dict[str, Any]]:
    return constructor_stats(season=season, order="championship_position ASC NULLS LAST")


@lru_cache
def leaderboard(metric: str, season: int | None, limit: int = 15) -> list[dict[str, Any]]:
    out = constructor_stats(season=season, order=RANK_METRICS.get(metric, "wins DESC"), limit=limit)
    return [r for r in out if (r.get(metric) or 0) > 0]


@lru_cache
def dominance(year_from: int = 1958, year_to: int | None = None, top: int = 8) -> dict[str, Any]:
    """Share of race wins per season for the most successful constructors in the window."""
    year_to = year_to or int(row("SELECT max(year) AS y FROM season")["y"])
    df = frame("""
      SELECT r.year, r.constructor_id, count(DISTINCT r.race_id) AS wins
      FROM result r WHERE r.is_win AND r.year BETWEEN $a AND $b GROUP BY ALL""",
               {"a": year_from, "b": year_to})
    races = frame("SELECT year, races FROM season WHERE year BETWEEN $a AND $b ORDER BY year",
                  {"a": year_from, "b": year_to})
    top_ids = df.groupby("constructor_id")["wins"].sum().nlargest(top).index.tolist()
    teams = {r["constructor_id"]: r for r in rows(f"SELECT {TEAM_COLS} FROM constructor c")}
    df["bucket"] = df["constructor_id"].where(df["constructor_id"].isin(top_ids), -1)
    pivot = df.pivot_table(index="year", columns="bucket", values="wins", aggfunc="sum", fill_value=0)
    pivot = pivot.reindex(races["year"].tolist(), fill_value=0)
    totals = races.set_index("year")["races"]
    series = []
    for cid in top_ids + ([-1] if -1 in pivot.columns else []):
        vals = pivot[cid] if cid in pivot.columns else [0] * len(pivot)
        share = [round(100 * v / totals[y], 1) for y, v in zip(pivot.index, vals)]
        meta = teams.get(cid, {"constructor_id": -1, "constructor_ref": "other", "constructor_name": "Others"})
        series.append({**meta, "wins": [int(v) for v in vals], "share": share,
                       "total": int(sum(vals))})
    return {"years": [int(y) for y in pivot.index], "races": [int(v) for v in totals], "series": series}


@lru_cache
def season_heatmap(year_from: int, year_to: int, top: int = 14) -> dict[str, Any]:
    """Constructor x season championship-position matrix (constructors' title era only)."""
    df = frame(f"""
      SELECT sc.year, {TEAM_COLS}, sc.position, sc.points
      FROM season_constructor sc JOIN constructor c USING (constructor_id)
      WHERE sc.year BETWEEN $a AND $b""", {"a": year_from, "b": year_to})
    if df.empty:
        return {"years": [], "constructors": [], "cells": []}
    rank = (df.groupby(["constructor_id", "constructor_ref", "constructor_name"])
              .agg(best=("position", "min"), avg=("position", "mean"), n=("year", "count"))
              .reset_index())
    rank["score"] = rank["avg"] - rank["n"] * 0.15  # favour sustained presence
    keep = rank.sort_values(["score", "best"]).head(top)
    years = sorted(df["year"].unique().tolist())
    cells = df[df["constructor_id"].isin(keep["constructor_id"])]
    return {
        "years": [int(y) for y in years],
        "constructors": records(keep[["constructor_id", "constructor_ref", "constructor_name"]]),
        "cells": records(cells[["year", "constructor_id", "position", "points"]]),
    }


@lru_cache
def compare(constructor_ids: tuple[int, ...], season: int | None = None) -> dict[str, Any]:
    stats = constructor_stats(season=season, constructor_ids=list(constructor_ids))
    by_season = rows(f"""
      SELECT r.year, {TEAM_COLS},
             count(DISTINCT r.race_id) FILTER (WHERE r.is_win) AS wins,
             count(*) FILTER (WHERE r.is_podium) AS podiums,
             sc.points, sc.position
      FROM result r JOIN constructor c USING (constructor_id)
      LEFT JOIN season_constructor sc ON sc.year = r.year AND sc.constructor_id = r.constructor_id
      WHERE list_contains($ids, r.constructor_id) GROUP BY ALL ORDER BY r.year""",
                     {"ids": list(constructor_ids)})
    return {"stats": stats, "by_season": by_season}


@lru_cache
def profile(constructor_id: int, season: int | None = None) -> dict[str, Any]:
    info = row(f"SELECT {TEAM_COLS}, c.nationality, c.url FROM constructor c WHERE constructor_id = ?",
               [constructor_id])
    if info is None:
        return {}
    stats = constructor_stats(season=season, constructor_ids=[constructor_id])
    career = constructor_stats(constructor_ids=[constructor_id])
    drivers = rows("""
      SELECT d.driver_id, d.driver_ref, d.code, d.full_name AS driver_name,
             count(DISTINCT r.race_id) AS races, count(DISTINCT r.race_id) FILTER (WHERE r.is_win) AS wins,
             sum(r.points) AS points
      FROM result r JOIN driver d USING (driver_id)
      WHERE r.constructor_id = $cid AND ($season IS NULL OR r.year = $season)
      GROUP BY ALL ORDER BY races DESC, wins DESC LIMIT 12""",
                   {"cid": constructor_id, "season": season})
    return {"constructor": info, "stats": stats[0] if stats else None,
            "career": career[0] if career else None, "drivers": drivers}
