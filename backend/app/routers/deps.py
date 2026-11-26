"""Shared request-parameter helpers."""

from __future__ import annotations

from fastapi import HTTPException, Query

from app.db import scalar


def parse_ids(ids: str | None) -> tuple[int, ...] | None:
    if not ids:
        return None
    try:
        out = tuple(sorted({int(x) for x in ids.split(",") if x.strip()}))
    except ValueError as exc:
        raise HTTPException(400, "ids must be a comma-separated list of integers") from exc
    if len(out) > 8:
        raise HTTPException(400, "At most 8 ids can be compared")
    return out or None


def season_param(season: int | None = Query(None, ge=1950, le=2100)) -> int:
    """Validated season; defaults to the latest season in the dataset."""
    if season is None:
        return int(scalar("SELECT max(year) FROM season"))
    if not scalar("SELECT count(*) FROM season WHERE year = ?", [season]):
        raise HTTPException(404, f"No data for season {season}")
    return season


def optional_season(season: int | None = Query(None, ge=1950, le=2100)) -> int | None:
    if season is not None and not scalar("SELECT count(*) FROM season WHERE year = ?", [season]):
        raise HTTPException(404, f"No data for season {season}")
    return season


def not_found_if_empty(data, what: str):
    if not data:
        raise HTTPException(404, f"{what} not found")
    return data
