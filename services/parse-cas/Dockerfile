# Stateless CAS PDF → JSON service. Deploy to any scale-to-zero host (Cloud Run / Fly / Render).
FROM python:3.12-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# PARSE_CAS_ORIGINS = comma-separated allowed origins (your dhan360 client app URL).
ENV PARSE_CAS_ORIGINS=*
EXPOSE 8080

# Single worker with a request timeout — parses are quick; nothing is kept.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-keep-alive", "30"]
