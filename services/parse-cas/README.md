# parse-cas — stateless CAS PDF → JSON service

The one optional server piece of the fully-client-side dhan360. It parses a mutual-fund CAS PDF
(which needs a native PDF library `casparser` can't run in the browser) and returns CAS JSON. The
client does everything else locally.

**It stores nothing** — the PDF is parsed in memory and discarded. No DB, no logs of content.

## Run locally
```bash
pip install -r requirements.txt
uvicorn app:app --port 8080
# POST a PDF:
curl -F "file=@your_cas.pdf" -F "password=YOURPAN" http://localhost:8080/parse-cas
```
Or with Docker: `docker build -t parse-cas . && docker run -p 8080:8080 parse-cas`.

## Deploy (scale-to-zero, ~₹0 at rest)
Any container host works — e.g. Google Cloud Run:
```bash
gcloud run deploy dhan360-parse-cas --source . --allow-unauthenticated \
  --set-env-vars PARSE_CAS_ORIGINS=https://dhan360.in --region asia-south1
```
Set `PARSE_CAS_ORIGINS` to your client app's origin so CORS is locked down.

## Wire it into the client
Build the client app with the service URL:
```bash
VITE_PARSE_CAS_URL=https://<your-service-url> npm run build:client
```
Then the **CAS PDF** import in the app posts the PDF here, gets JSON back, and processes it in the
browser. Without `VITE_PARSE_CAS_URL`, the app tells users to convert locally with `casparser` and
upload the JSON (the zero-server path).
```
