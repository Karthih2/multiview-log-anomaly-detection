# LogSight backend

API and database for the multi-view log anomaly detection pipeline. It turns the
experiment in `../engine` into a service: upload a raw log, the pipeline runs in the
background, the results are stored in SQLite and served as JSON for the dashboard.

The experiment code is **not copied or modified**. The backend imports the
functions in `../engine` and calls them in the order the experiment defines.

## Flow

```
raw log ──► ingest ──► parse (Drain3) ──► chronological split
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
        semantic features               structural features             temporal features
        (SBERT per template)            (template, level, freq)         (bursts, entropy, ...)
              │                               │                               │
        prototype distance              Isolation Forest + LOF          HMM + rolling z-score
              └───────────────────────────────┼───────────────────────────────┘
                              reliability-weighted fusion
                                              │
                           rolling MAD threshold + severity
                                              │
              ┌──────────────┬────────────────┼────────────────┬──────────────┐
            drift         evidence       incidents +       database
          (KS test)       packages       root-cause
                                          ranking
```

## Layout

```
backend/
├── app/
│   ├── main.py              FastAPI app
│   ├── cli.py               command line: init-db, run, import-artifacts
│   ├── core/                settings, pipeline config loader, logging
│   ├── db/                  engine/session and table definitions
│   ├── pipeline/
│   │   ├── experiment.py    the only module that imports ../engine
│   │   ├── stages.py        one function per pipeline stage
│   │   ├── runner.py        full pipeline on a raw log
│   │   ├── artifacts.py     loads precomputed outputs from ../data/processed
│   │   └── result.py        in-memory result passed to persistence
│   ├── services/            run lifecycle, writing results to the database
│   ├── schemas/             API response models
│   └── api/                 dependencies and routes
├── config/pipeline.yaml     pipeline parameters
├── tests/
├── storage/                 uploads + SQLite file (created on first use, git-ignored)
├── requirements.txt
└── .env.example
```

## Setup

Uses one environment for the engine and the backend (root `requirements.txt`). From the project root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

## Running

All commands are run from `backend/`.

```powershell
# Start the API (interactive docs at http://127.0.0.1:8000/docs)
..\.venv\Scripts\python.exe -m uvicorn app.main:app

# Run the pipeline on a raw log from the command line
..\.venv\Scripts\python.exe -m app.cli run ..\data\raw\BGL.log --max-lines 60000

# Load the results the experiment already computed in ..\data\processed
..\.venv\Scripts\python.exe -m app.cli import-artifacts

# Tests
..\.venv\Scripts\python.exe -m pytest tests
```

`import-artifacts` reads the saved parsing, feature, scoring, fusion, threshold
and drift outputs as they are, then recomputes incident clustering, root-cause
ranking from the saved anomaly flags. Those are
recomputed because the saved RCA files were produced by an earlier threshold
run and no longer match `is_anomaly.npy`.

## Configuration

Nothing is hardcoded in the backend code.

- **Runtime settings** (database URL, storage folder, upload limit, page sizes,
  CORS, ...) live in `app/core/config.py` and are set through `LOGSIGHT_*`
  environment variables or `.env`. See `.env.example`.
- **Pipeline parameters** live in `config/pipeline.yaml`. Each section maps to
  one experiment function. `null` means "use that function's own default", so
  the experiment remains the single source of truth; set a value to override it.
  `GET /api/v1/config/pipeline` shows the values in effect, and every run stores
  the snapshot it ran with.

Some values are fixed inside the experiment functions themselves and are
therefore not configurable without editing `../engine`: the embedding model name,
Isolation Forest / LOF `contamination`, the view quality multipliers, severity
weights and bucket cut-offs, and the root-cause ranking weights.

## API

Prefix `/api/v1`. List endpoints take `limit` and `offset`.

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | liveness + database check |
| GET | `/config/pipeline` | pipeline parameters in effect |
| POST | `/runs` | upload a log (`file`, optional `name`); starts a run, returns 202 |
| GET | `/runs` | all runs, newest first |
| GET | `/runs/{id}` | status, current stage, counts, parameters, planned stages, stage log with start times, per-view summary |
| DELETE | `/runs/{id}` | remove a run and its data |
| GET | `/runs/{id}/summary` | header numbers: lines, anomalies, rate, incidents, severity counts |
| GET | `/runs/{id}/timeline` | anomalies per day and severity; `bucket=hour` for short logs |
| GET | `/runs/{id}/components` | per-component anomaly count and mean severity |
| GET | `/runs/{id}/anomalies` | flagged events, most severe first; filters `severity`, `component`, `incident_id` |
| GET | `/runs/{id}/anomaly-kinds` | flagged events grouped by template and component, with the line count and most severe line of each; same filters |
| GET | `/runs/{id}/events/{row_index}` | one event with per-view scores, weights, template, evidence |
| GET | `/runs/{id}/evidence` | evidence packages |
| GET | `/runs/{id}/templates` | mined templates, most frequent first |
| GET | `/runs/{id}/incidents` | incident cards with top root-cause candidate |
| GET | `/runs/{id}/incidents/{incident_id}` | incident with all ranked candidates |
| GET | `/runs/{id}/root-causes` | how often each component ranked first |
| GET | `/runs/{id}/cooccurrence` | component pairs seen in the same incident |
| GET | `/runs/{id}/drift` | KS drift windows and control test per signal |

A run moves through `queued → running → completed | failed`. While running,
`stage` shows the current pipeline step. Result endpoints return 409 until the
run is completed.

## Database

SQLite at `storage/logsight.db` by default; tables are created on startup.
Every table is keyed by `run_id`.

| Table | One row per |
|---|---|
| `pipeline_runs` | run: source, status, counts, split indices, parameter snapshot, stage log, per-view summary |
| `log_events` | cleaned log line: fields, per-view scores and weights, final score, threshold, anomaly flag, severity, incident |
| `templates` | mined template: text, occurrences, training frequency |
| `incidents` | incident: size, templates, components, time range |
| `root_cause_candidates` | ranked component within an incident, with every ranking factor |
| `component_cooccurrence` | component pair and how many incidents share it |
| `drift_summaries`, `drift_windows` | drift signal and each KS window |
| `evidence_packages` | evidence for one flagged event |

The old `evaluation_metrics` table, and the `log_events.label` column, are unused.
An existing `storage/logsight.db` keeps working untouched. For a clean
database, delete it (or point `LOGSIGHT_DATABASE_URL` elsewhere) and run
`python -m app.cli import-artifacts`.

To move to PostgreSQL, set `LOGSIGHT_DATABASE_URL` and install a driver; the
models use only portable SQLAlchemy types.

## Known limits

- **Log format:** ingestion uses `engine/ingest.py`, which reads the BGL format only.
- **Scale:** the experiment's feature and threshold code loops over rows in
  Python and holds one 384-float embedding per row in memory. Tens of thousands
  of lines take about a minute; the full 4.7M-line BGL file takes hours and
  several GB of RAM, as it did in the experiment.
- **Evidence:** packages are built for the most severe anomalies up to
  `evidence.max_packages`, not for every flagged event.
- **Background runs** execute in a worker thread inside the API process. A run
  that is interrupted by a restart is marked failed.
- **Schema changes:** tables are created with `create_all`; there are no
  migrations yet.
- **Not built:** authentication, the optional LLM rewrite of evidence, and
  saving fitted models to disk.
