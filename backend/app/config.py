"""Central configuration for the PITWALL backend."""

from __future__ import annotations

import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = Path(os.environ.get("PITWALL_RAW_DIR", ROOT_DIR / "data" / "raw"))
DB_PATH = Path(os.environ.get("PITWALL_DB_PATH", ROOT_DIR / "data" / "f1.duckdb"))
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

# Pit-lane durations outside this window are excluded from duration statistics.
# 0 ms rows are missing values in the 2025/26 extension; > 60 s rows are red-flag
# stoppages, drive-throughs or long repairs, which distort averages.
PIT_DURATION_MIN_MS = 1
PIT_DURATION_MAX_MS = 60_000

# Modern points scale (2010+, without fastest-lap bonus) used ONLY for the
# era-normalised comparison on the History page.
MODERN_POINTS = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}
