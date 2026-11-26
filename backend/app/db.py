"""DuckDB connection management and small query helpers."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Iterable, Mapping, Union

import duckdb
import pandas as pd

from app.config import DB_PATH, FALLBACK_DB_PATH

_lock = threading.Lock()
_con: duckdb.DuckDBPyConnection | None = None

Params = Union[Iterable[Any], Mapping[str, Any], None]


def _p(params: Params):
    if params is None:
        return []
    if isinstance(params, Mapping):
        return dict(params)
    return list(params)



def _resolve_db() -> Path:
    """Path of a ready database, building one from the raw CSVs if none exists.

    Deployments normally build the database ahead of time (``python -m app.etl.build``).
    If that file is missing, build it in place, or in the temp directory when the
    application directory is read-only.
    """
    for path in (DB_PATH, FALLBACK_DB_PATH):
        if path.exists():
            return path
    from app.etl.build import build

    try:
        return build(DB_PATH, verbose=False)
    except (OSError, duckdb.IOException):
        return build(FALLBACK_DB_PATH, verbose=False)


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return a shared read-only connection, building the database on first use."""
    global _con
    with _lock:
        if _con is None:
            _con = duckdb.connect(str(_resolve_db()), read_only=True)
        return _con


def _cursor() -> duckdb.DuckDBPyConnection:
    # A cursor per call keeps concurrent requests thread-safe.
    return get_connection().cursor()


def rows(sql: str, params: Params = None) -> list[dict[str, Any]]:
    cur = _cursor()
    try:
        res = cur.execute(sql, _p(params))
        cols = [d[0] for d in res.description]
        return [dict(zip(cols, r)) for r in res.fetchall()]
    finally:
        cur.close()


def row(sql: str, params: Params = None) -> dict[str, Any] | None:
    out = rows(sql, params)
    return out[0] if out else None


def scalar(sql: str, params: Params = None) -> Any:
    cur = _cursor()
    try:
        r = cur.execute(sql, _p(params)).fetchone()
        return r[0] if r else None
    finally:
        cur.close()


def frame(sql: str, params: Params = None) -> pd.DataFrame:
    cur = _cursor()
    try:
        return cur.execute(sql, _p(params)).df()
    finally:
        cur.close()


def records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """DataFrame -> JSON-safe records (NaN/NaT become None)."""
    clean = df.astype(object).where(pd.notna(df), None)
    return clean.to_dict(orient="records")


def latest_season() -> int:
    return int(scalar("SELECT max(year) FROM season"))
