.PHONY: setup data test dev api web build serve images

setup:            ## install backend + frontend dependencies
	pip install -r backend/requirements-dev.txt
	cd frontend && npm install

data:             ## build backend/data/f1.duckdb from backend/data/raw (runs validation checks)
	cd backend && python -m app.etl.build

test:             ## backend regression tests
	cd backend && python -m pytest -q

api:              ## FastAPI on :8000
	cd backend && uvicorn app.main:app --reload --port 8000

web:              ## Vite dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

dev:              ## API + web together
	$(MAKE) -j2 api web

build:            ## production frontend bundle (frontend/dist)
	cd frontend && npm run build

serve: build      ## single process: FastAPI serves API + built frontend on :8000
	cd backend && uvicorn app.main:app --port 8000

images:           ## collect openly licensed images from Wikimedia Commons
	python scripts/fetch_images.py
