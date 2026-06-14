.PHONY: setup backend-setup frontend-setup seed dev-backend dev-frontend test build docker

PY := backend/.venv/bin/python

setup: backend-setup frontend-setup ## Install everything

backend-setup:
	python3.12 -m venv backend/.venv || python3 -m venv backend/.venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r backend/requirements.txt

frontend-setup:
	cd frontend && npm install

seed: ## Load the bundled sample portfolio
	cd backend && DHAN360_DATA_DIR=./data ../$(PY) -m scripts.seed

dev-backend: ## Run FastAPI on :8000 (auto-reload)
	cd backend && DHAN360_DATA_DIR=./data ../$(PY) -m uvicorn app.main:app --reload --port 8000

dev-frontend: ## Run Vite dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

test: ## Run backend tests
	cd backend && ../$(PY) -m pytest

build: ## Build the frontend for production
	cd frontend && npm run build

docker: ## Build & run the self-host container on :8000
	docker compose up --build
