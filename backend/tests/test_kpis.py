"""Regression tests: computed figures must match published Formula 1 records.

Reference values are widely published career statistics up to the end of the
2024 season (the last season of the base dataset) and the official 2025 result.
"""

import duckdb
import pytest

from app.config import DB_PATH
from app.services import common, constructors, history, overview


@pytest.fixture(scope="module")
def con():
    return duckdb.connect(str(DB_PATH), read_only=True)


def _count(con, sql, params):
    return con.execute(sql, params).fetchone()[0]


@pytest.mark.parametrize("driver_id,wins", [(1, 105), (30, 91), (830, 63), (20, 53), (117, 51), (102, 41)])
def test_wins_to_2024(con, driver_id, wins):
    assert _count(con, "SELECT count(DISTINCT race_id) FROM result WHERE driver_id=? AND is_win AND year<=2024",
                  [driver_id]) == wins


@pytest.mark.parametrize("driver_id,poles", [(1, 104), (30, 68), (102, 65), (20, 57), (830, 40)])
def test_poles_to_2024(con, driver_id, poles):
    assert _count(con, "SELECT count(*) FROM race_pole JOIN race USING (race_id) WHERE driver_id=? AND year<=2024",
                  [driver_id]) == poles


def test_titles():
    t = history.title_counts()
    top = {d["driver_name"]: d["titles"] for d in t["drivers"]}
    assert top["Lewis Hamilton"] == 7 and top["Michael Schumacher"] == 7
    assert {c["constructor_name"]: c["titles"] for c in t["constructors"]}["Ferrari"] == 16


def test_2025_champion():
    champ = next(c for c in history.champions() if c["year"] == 2025)
    assert champ["driver_name"] == "Lando Norris" and champ["points"] == 423
    assert champ["constructor_name"] == "McLaren"


def test_partial_season_not_counted_as_title():
    champ = next(c for c in history.champions() if c["year"] == 2026)
    assert champ["in_progress"] is True
    assert common.driver_stats(season=2026, driver_ids=[863])[0]["titles"] == 0


def test_standings_match_results_since_2010(con):
    # No dropped scores since 2010, so standings == race + sprint points.
    n = _count(con, """
      WITH p AS (SELECT year, driver_id, sum(points) s FROM (
                   SELECT year, driver_id, points FROM result UNION ALL SELECT year, driver_id, points FROM sprint)
                 WHERE year >= 2010 GROUP BY ALL)
      SELECT count(*) FROM p JOIN season_driver USING (year, driver_id) WHERE abs(s - points) > 0.01""", [])
    assert n == 0


def test_kpis_2026_consistent():
    k = overview.kpis(2026)
    assert k["in_progress"] and k["races_completed"] == 15
    assert k["total_wins"] == 15
    assert k["driver_gap"] == k["driver_leader"]["points"] - k["driver_runner_up"]["points"]


def test_shared_drives_not_double_counted(con):
    starts = common.driver_stats(driver_ids=[579])[0]["starts"]  # Fangio
    assert starts == _count(con, "SELECT count(DISTINCT race_id) FROM result WHERE driver_id=579 AND started", [])


def test_dominance_shares_bounded():
    d = constructors.dominance(1958, 2026, 8)
    for i in range(len(d["years"])):
        assert sum(s["share"][i] for s in d["series"]) <= 100.5
