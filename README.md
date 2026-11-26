# PITWALL | Formula 1 Analytics

An analytics dashboard for the Formula 1 World Championship, 1950 to the 2026 Azerbaijan Grand Prix. Every figure is calculated on request from the bundled dataset. Nothing is hard-coded.

**Stack:** React 19 + TypeScript + Vite · Tailwind CSS v4 + shadcn/ui (Radix) · Apache ECharts · Lucide icons · Inter / Barlow Condensed — Python · FastAPI · DuckDB · Pandas.

## Quick start

```bash
make setup      # pip + npm install
make data       # build data/f1.duckdb from data/raw (≈3 s, runs validation checks)
make dev        # API on :8000 + web on :5173  →  open http://localhost:5173
```

Single-process production mode: `make serve` builds the frontend and FastAPI serves both API and UI on `:8000`.
Tests: `make test` (regression tests against published F1 records).

## Pages

| Page | What it answers |
|---|---|
| **Overview** | Season KPIs, drivers' championship battle (cumulative points by round), constructors' progression, leader profile, race winners, race results |
| **Seasons** | Driver × round results heatmap, calendar with winner / pole / fastest lap / sprint and rain flags |
| **Drivers** | Profile, season or career scope, rankings, up-to-4-driver comparison, head-to-head, performance over seasons, qualifying vs finish |
| **Constructors** | Standings with points-per-race, points progression, historical win share since 1958/1980/2000, championship-position heatmap, comparisons |
| **Race Analysis** | Race header, lap-by-lap position chart, positions gained/lost, classification, fastest-lap gaps, grid-vs-finish correlation, status distribution, retirement trend since 1950, circuit history and characteristics |
| **Strategy & Weather** | Pit-lane time distributions by team (2011+), stop timing, fastest stops; tyre compound usage, stint length and per-race strategy charts (2025–26); weather KPIs, rain vs dry outcomes and correlations (2025–26) |
| **History** | All-time rankings, career trajectories by start number, era-neutral champion dominance, points-system changes, champions list, most-raced circuits |
| **Data, methods & credits** | Coverage per table, data-quality notes from the validation run, metric definitions, full image credits |

The season selector is global and stored in the URL along with each page's filters, so every view can be shared. Analyses that need data a season lacks (for example tyres before 2025) are hidden and explained rather than estimated.

## Project layout

```
data/raw/                  17 CSVs + original docs (source of truth)
backend/app/
  etl/build.py             CSV → DuckDB: typed, cleaned, derived flags, season tables
  etl/validate.py          FK / uniqueness / consistency checks (build fails on errors)
  services/*.py            analytical queries (overview, seasons, drivers, constructors, races, strategy, weather, history)
  routers/api.py           thin FastAPI routes
backend/tests/             regression tests vs published records
frontend/src/
  charts/                  ECharts option builders + shared theme
  components/{ui,common,filters,layout,charts}
  pages/                   one module per page
  state/filters.tsx        URL-backed global filters
scripts/fetch_images.py    Wikimedia Commons image collector → frontend/public/images + credits.json
```

## Data notes

The dataset's README/SCHEMA are partly out of date. The CSVs were profiled and treated as the source of truth:

* 2026 runs to **round 15 (Azerbaijan GP, 26 Sep 2026)**, not round 11 as the README says. It is flagged as an in-progress season: leaders are not called champions and the season is excluded from title counts.
* `lap_times.csv` **does** contain 2025/26 laps (SCHEMA says it does not).
* Coverage: results 1950+, constructors' standings 1958+, qualifying 1994+, lap times 1996+, fastest laps 2004+, pit stops 2011+, sprints 2021+, tyres / weather / practice 2025+.
* 85 duplicate (race, driver) result rows are genuine 1950s shared drives; three races credit two winners. Starts and wins are counted per distinct race.
* Pit stops: 71 zero-duration rows (missing data in 2025/26) and 517 stops over 60 s (red flags) are excluded from timing statistics but still counted as stops.
* 5 tyre stints have no compound; 2025+ results report retirements without a cause.
* Two constructor-standings totals differ from summed results for genuine historical reasons (Force India's 2018 points reset, Racing Point's 2020 penalty). Official standings are used.

## Metric definitions (summary)

* **Start**: excludes DNQ, DNPQ, DNS, withdrawn and 107% entries. **DNF**: started but not classified. **DSQ** is counted separately.
* **Pole**: the driver starting from grid slot 1 (the official convention), except 2022 sprint weekends, where pole went to the Friday qualifying winner. Validated against published totals (Hamilton 104, Schumacher 68, Senna 65, Vettel 57, Verstappen 40 to end of 2024).
* **Championship points** come from the standings tables, which include sprint points and historical dropped scores. Since 2010 they match race plus sprint points exactly; this is checked on every build.
* **Era comparisons** use rates or results re-scored on the 2010+ scale (25-18-15-12-10-8-6-4-2-1). Re-scored points are always labelled and never presented as official.
* **Weather** relationships are Pearson correlations over at most 39 races and are labelled as associations, not causes.

## Images

`scripts/fetch_images.py` resolves each driver, constructor and circuit to its Wikipedia article. It takes the article's lead image, or for teams and circuits other article images and a Commons search, and keeps only files hosted on Wikimedia Commons under CC0, public-domain, CC BY or CC BY-SA licences. For drivers, only portraits are accepted. Each thumbnail is saved locally, and its source URL, author, licence and attribution go into `frontend/public/images/credits.json`. The UI shows this on every image and lists it on the credits page. Entities without a suitable image get a neutral monogram rather than an unrelated photo.

Wikimedia rate-limits clients that do not identify themselves. Before running a large collection, set a contact for the User-Agent:

```bash
PITWALL_WIKIMEDIA_CONTACT="you@example.com" python scripts/fetch_images.py
```

The script resumes where it stopped (`--force` re-fetches), and it stops cleanly, keeping its progress, if Wikimedia keeps refusing requests.

Dataset licence: CC0 (see `data/raw/README.md`). Image licences: see `credits.json`.
