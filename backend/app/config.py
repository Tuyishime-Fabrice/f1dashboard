"""Central configuration for the PITWALL backend."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
# The dataset lives inside the backend so the backend deploys as a self-contained
# service (on Vercel, only files under the service root are bundled).
RAW_DIR = Path(os.environ.get("PITWALL_RAW_DIR", BACKEND_DIR / "data" / "raw"))
DB_PATH = Path(os.environ.get("PITWALL_DB_PATH", BACKEND_DIR / "data" / "f1.duckdb"))
# Used when DB_PATH is missing and its directory is read-only (serverless runtimes,
# where only the temp directory is writable).
FALLBACK_DB_PATH = Path(tempfile.gettempdir()) / "pitwall" / "f1.duckdb"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

# Pit-lane durations outside this window are excluded from duration statistics.
# 0 ms rows are missing values in the 2025/26 extension; > 60 s rows are red-flag
# stoppages, drive-throughs or long repairs, which distort averages.
PIT_DURATION_MIN_MS = 1
PIT_DURATION_MAX_MS = 60_000

# Modern points scale (2010+, without fastest-lap bonus) used ONLY for the
# era-normalised comparison on the History page.
MODERN_POINTS = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}
