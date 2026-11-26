"""HTTP routes. Each route is a thin wrapper around a service function."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.routers.deps import not_found_if_empty, optional_season, parse_ids, season_param
from app.services import constructors, drivers, history, meta, overview, races, seasons, strategy, weather

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------- meta
m = APIRouter(prefix="/meta", tags=["meta"])


@m.get("/seasons")
def get_seasons():
    return meta.seasons()


@m.get("/coverage")
def get_coverage():
    return {"coverage": meta.coverage(), "quality": meta.quality()}


@m.get("/season-entities")
def get_season_entities(season: int = Depends(season_param)):
    return meta.season_entities(season)


@m.get("/drivers")
def get_all_drivers():
    return meta.all_drivers()


@m.get("/constructors")
def get_all_constructors():
    return meta.all_constructors()


@m.get("/circuits")
def get_all_circuits():
    return meta.all_circuits()


# ---------------------------------------------------------------- overview
o = APIRouter(prefix="/overview", tags=["overview"])


@o.get("/kpis")
def get_kpis(season: int = Depends(season_param)):
    return overview.kpis(season)


@o.get("/driver-progression")
def get_driver_progression(season: int = Depends(season_param), top: int = Query(8, ge=1, le=30),
                           ids: str | None = None):
    return overview.driver_progression(season, top, parse_ids(ids))


@o.get("/constructor-progression")
def get_constructor_progression(season: int = Depends(season_param), top: int = Query(10, ge=1, le=30),
                                ids: str | None = None):
    return overview.constructor_progression(season, top, parse_ids(ids))


@o.get("/winners")
def get_winners(season: int = Depends(season_param)):
    return overview.race_winners(season)


@o.get("/top-drivers")
def get_top_drivers(season: int = Depends(season_param), limit: int = Query(10, ge=1, le=40)):
    return overview.top_drivers(season, limit)


# ---------------------------------------------------------------- seasons
s = APIRouter(prefix="/seasons", tags=["seasons"])


@s.get("/summary")
def get_season_summary(season: int = Depends(season_param)):
    return seasons.summary(season)


@s.get("/calendar")
def get_calendar(season: int = Depends(season_param)):
    return seasons.calendar(season)


@s.get("/matrix")
def get_matrix(season: int = Depends(season_param)):
    return seasons.results_matrix(season)


# ---------------------------------------------------------------- drivers
d = APIRouter(prefix="/drivers", tags=["drivers"])


@d.get("/leaderboard")
def get_driver_leaderboard(metric: str = "wins", season: int | None = Depends(optional_season),
                           limit: int = Query(15, ge=1, le=50)):
    return drivers.leaderboard(metric, season, limit)


@d.get("/standings")
def get_driver_standings(season: int = Depends(season_param)):
    return drivers.standings(season)


@d.get("/compare")
def get_driver_compare(ids: str, season: int | None = Depends(optional_season)):
    return drivers.compare(not_found_if_empty(parse_ids(ids), "drivers"), season)


@d.get("/quali-vs-race")
def get_quali_vs_race(season: int = Depends(season_param), ids: str | None = None):
    return drivers.quali_vs_race(season, parse_ids(ids))


@d.get("/{driver_id}")
def get_driver(driver_id: int, season: int | None = Depends(optional_season)):
    return not_found_if_empty(drivers.profile(driver_id, season), "Driver")


# ---------------------------------------------------------------- constructors
c = APIRouter(prefix="/constructors", tags=["constructors"])


@c.get("/standings")
def get_constructor_standings(season: int = Depends(season_param)):
    return constructors.standings(season)


@c.get("/leaderboard")
def get_constructor_leaderboard(metric: str = "wins", season: int | None = Depends(optional_season),
                                limit: int = Query(15, ge=1, le=50)):
    return constructors.leaderboard(metric, season, limit)


@c.get("/dominance")
def get_dominance(year_from: int = Query(1958, ge=1950), year_to: int | None = None,
                  top: int = Query(8, ge=3, le=15)):
    return constructors.dominance(year_from, year_to, top)


@c.get("/heatmap")
def get_constructor_heatmap(year_from: int = Query(2005, ge=1958), year_to: int = Query(2026, le=2100),
                            top: int = Query(14, ge=3, le=30)):
    return constructors.season_heatmap(year_from, year_to, top)


@c.get("/compare")
def get_constructor_compare(ids: str, season: int | None = Depends(optional_season)):
    return constructors.compare(not_found_if_empty(parse_ids(ids), "constructors"), season)


@c.get("/{constructor_id}")
def get_constructor(constructor_id: int, season: int | None = Depends(optional_season)):
    return not_found_if_empty(constructors.profile(constructor_id, season), "Constructor")


# ---------------------------------------------------------------- races
r = APIRouter(prefix="/races", tags=["races"])


@r.get("/grid-vs-finish")
def get_grid_vs_finish(season: int = Depends(season_param)):
    return races.grid_vs_finish(season)


@r.get("/positions-gained")
def get_positions_gained(season: int = Depends(season_param)):
    return races.positions_gained(season)


@r.get("/status")
def get_status(season: int = Depends(season_param)):
    return races.status_distribution(season)


@r.get("/retirement-trend")
def get_retirement_trend():
    return races.retirement_trend()


@r.get("/fastest-laps")
def get_fastest_laps(season: int = Depends(season_param)):
    return races.fastest_laps(season)


@r.get("/circuit-traits")
def get_circuit_traits(season: int = Depends(season_param)):
    return races.circuit_traits(season)


@r.get("/circuit/{circuit_id}")
def get_circuit(circuit_id: int):
    return not_found_if_empty(races.circuit_history(circuit_id), "Circuit")


@r.get("/{race_id}")
def get_race(race_id: int):
    return not_found_if_empty(races.race_detail(race_id), "Race")


@r.get("/{race_id}/laps")
def get_race_laps(race_id: int):
    return races.lap_positions(race_id)


@r.get("/{race_id}/fastest-laps")
def get_race_fastest_laps(race_id: int):
    return races.race_fastest_laps(race_id)


# ---------------------------------------------------------------- strategy
st = APIRouter(prefix="/strategy", tags=["strategy"])


@st.get("/pit-summary")
def get_pit_summary(season: int = Depends(season_param), race_id: int | None = None):
    return strategy.pit_summary(season, race_id)


@st.get("/pit-by-constructor")
def get_pit_by_constructor(season: int = Depends(season_param), race_id: int | None = None):
    return strategy.pit_by_constructor(season, race_id)


@st.get("/stops-per-driver")
def get_stops_per_driver(season: int = Depends(season_param), race_id: int | None = None):
    return strategy.stops_per_driver(season, race_id)


@st.get("/stop-timing")
def get_stop_timing(season: int = Depends(season_param), race_id: int | None = None):
    return strategy.stop_timing(season, race_id)


@st.get("/pit-trend")
def get_pit_trend():
    return strategy.pit_trend()


@st.get("/tyres")
def get_tyres(season: int = Depends(season_param)):
    return strategy.tyre_overview(season)


@st.get("/tyres/race/{race_id}")
def get_race_strategy(race_id: int):
    return strategy.race_strategy(race_id)


@st.get("/tyres/drivers")
def get_driver_tyres(season: int = Depends(season_param), ids: str | None = None):
    return strategy.driver_tyre_usage(season, parse_ids(ids))


# ---------------------------------------------------------------- weather
w = APIRouter(prefix="/weather", tags=["weather"])


@w.get("/races")
def get_weather_races(season: int | None = Depends(optional_season)):
    return weather.weather_races(season)


@w.get("/summary")
def get_weather_summary(season: int | None = Depends(optional_season)):
    return {"summary": weather.summary(season), "wet_vs_dry": weather.wet_vs_dry(season),
            "correlations": weather.correlations(season)}


# ---------------------------------------------------------------- history
h = APIRouter(prefix="/history", tags=["history"])


@h.get("/champions")
def get_champions():
    return history.champions()


@h.get("/titles")
def get_titles():
    return history.title_counts()


@h.get("/eras")
def get_eras():
    return {"seasons": history.era_comparison(), "points_systems": history.points_systems()}


@h.get("/careers")
def get_careers(ids: str):
    return history.career_trajectories(not_found_if_empty(parse_ids(ids), "drivers"))


@h.get("/circuits")
def get_circuits_hosted(limit: int = Query(15, ge=1, le=80)):
    return history.circuits_hosted(limit)


for sub in (m, o, s, d, c, r, st, w, h):
    router.include_router(sub)
