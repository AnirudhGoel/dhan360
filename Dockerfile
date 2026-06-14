# Multi-stage build: compile the React SPA, then serve it from the FastAPI backend so the
# whole app runs as one self-hosted container on a single port.

# ---- stage 1: build frontend ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- stage 2: backend + built SPA ----
FROM python:3.12-slim AS app
WORKDIR /app

# casparser needs a couple of system libs for PDF handling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libmupdf-dev && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY samples/ ./samples/
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV DHAN360_DATA_DIR=/data
ENV PYTHONPATH=/app/backend
VOLUME ["/data"]
EXPOSE 8000

WORKDIR /app/backend
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
