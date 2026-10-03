# LogSight

Upload a BlueGene/L (BGL) log. LogSight reads every line three ways (meaning,
structure, timing), blends the three scores by how reliable each is for that
line, flags the lines that do not belong, groups them into incidents and ranks
candidate root causes. Results are stored in SQLite and shown in a web
dashboard.

![Landing page](docs/screenshots/landing.png)
![Dashboard](docs/screenshots/dashboard.png)

## How it works

![Architecture](docs/System%20Architecture%20Version%203.png)

clean, Drain3 templates, semantic / structural / temporal views, per-view
scores, reliability-weighted fusion, moving threshold and severity, drift,
evidence, incidents and candidate root causes. The first part of the log (the
learning window) teaches the detectors what normal looks like. No labels are used.

## Results

The accuracy numbers in `research/` come from the full BGL log (4.7M lines) and the
v1 configuration (one embedding per template, fixed view weights). The app is v2: it embeds each
distinct line's own text and measures the view weights per run, without labels. The app reports no
accuracy figure, so its flag counts show the views are active, not that detection is more accurate.
See `docs/SEMANTIC_VIEW_NOTE.md`.

## Run it

Python 3.10 and Node 22.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # .venv/bin/python on Linux and macOS
```

Backend (from `backend/`):

```bash
../.venv/Scripts/python -m uvicorn app.main:app
```

Frontend (from `frontend/`, opens on http://localhost:5173):

```bash
npm install
npm run dev
```

Load results already computed in `data/processed` instead of running the pipeline:

```bash
cd backend && ../.venv/Scripts/python -m app.cli import-artifacts
```

Demo logs are in `data/raw/samples/`. Upload one at `/upload`.

With Docker:

```bash
docker compose up --build
```

The app is then at http://localhost:8080. `backend/storage` and `data/` are mounted as volumes.

Tests: `python -m pytest backend/tests`. See `backend/README.md` and `frontend/README.md` for detail.

## Layout

```
backend/    FastAPI app
engine/     pipeline modules the app uses (ingest, parse, evidence, features, detection, rca)
frontend/   React app
data/       raw/ (with raw/samples), processed/
docs/       SRS, product spec, architecture image, review PDF
design/     PRODUCT.md, DESIGN.md, reference images, review screenshots
scripts/    make_bgl_samples.py
research/   experiments, notebooks, old dashboard, evaluation (not part of the app)
```

## Limits

- BGL format only.
- Batch only: upload a file and wait; no live stream.
- Root causes are ranked candidates from timing and co-occurrence, not proof.
- Some false alarms: rare but harmless events can be flagged.
- Large files are slow: tens of thousands of lines take about a minute; the full 4.7M-line BGL file takes hours.

The experiment track lives in [research/](research/).
