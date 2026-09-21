# LogSight — Adaptive Multi-View Log Anomaly Detection Platform

**A product specification** — application-focused. Research/paper work is called out separately and owned independently.

---

## 1. What It Is

LogSight is an application that ingests raw system logs and detects unusual behavior by analyzing them from three angles at once, instead of relying on a single signal:

- **Semantic view** — understands what a log line *means* using Sentence-BERT, so "connection timed out" and "socket read failed after 30000ms" are recognized as similar even though they share no words.
- **Structural view** — looks at the *shape* of the log: which template it matches, its log level, and its parameter types/count.
- **Temporal view** — looks at *timing and behavior*: how often something happens, bursts, and event sequence.

Each view is scored by a detector suited to that kind of data, and the three scores are combined through **reliability-weighted fusion** — the system trusts a view more or less depending on how reliable that view currently is, not just how loud its alarm is. This runs with no labeled failure data. On top of detection, the app groups related anomalies and points to the most likely root-cause component, using correlation patterns rather than requiring a full service map.

---

## 2. The Problem

Modern systems (microservices, Kubernetes, cloud infrastructure) produce millions of log lines a day. Existing monitoring struggles because:

- Log formats change every time new code ships
- Unknown failure types can't be predicted or written as rules in advance
- Volume overwhelms manual or dashboard-based review
- Root-cause investigation is slow and reactive

**Core idea:** teach the system what "normal" looks like, then flag whatever doesn't fit — instead of hand-coding what "bad" looks like.

---

## 3. Competitive Landscape

**Commercial tools** (Splunk, Datadog Watchdog, Elastic ML, New Relic, Grafana/Loki)
- Already ship ML-based anomaly detection
- Mostly statistical/numeric (thresholds, seasonality), not deep text understanding
- Closed-source, expensive, tied to their own platform — hard for smaller teams to adopt independently
- Gap: shallow text understanding, little real explanation beyond a raw score

**Where LogSight positions itself:** an open, self-hostable tool that goes deeper on *understanding log text* and *explaining* what it flags, without requiring a Splunk/Datadog-scale platform or budget.

*(Note: academic/paper-level positioning against LogBERT-class research models is intentionally left out of this document — that comparison belongs to the research track, not the product.)*

---

## 4. What Makes the Application Different

**1. Multi-view fusion (semantic + structural + temporal)**
Each view catches failure types the others miss. Scores are combined through reliability-weighted fusion — a view is trusted more when its own data is stable and well-supported, not simply because its score is high.

**2. Adaptive thresholding and drift handling**
Instead of one fixed cutoff for "anomaly," the threshold moves with a rolling median and spread of recent scores. A drift check compares recent data to a reference window to distinguish a real new problem from a legitimate new normal (e.g., a version rollout).

**3. Evidence-based explanation + lightweight root-cause clustering**
Every flagged anomaly ships with a structured evidence package (which view flagged it, what changed, nearest normal example) instead of a bare number. Related anomalies are grouped and ranked by likely origin using timing, co-occurrence, and shared error patterns — without pretending to have a full dependency graph.

---

## 5. Product Objectives

- Detect anomalies with zero labeled data
- Use semantic, structural, and temporal signals together
- Combine view scores adaptively based on reliability, not fixed voting
- Adapt to changes in "normal" behavior over time without relabeling
- Catch previously unseen failure types
- Give evidence-based, plain-language explanations for every anomaly
- Group related anomalies and surface the most likely root-cause component
- Ship a working, interactive monitoring dashboard

---

## 6. Product End Goal

A dashboard where a user uploads log files and gets back:
- An anomaly timeline
- Severity scores
- Root-cause cluster cards (ranked list of likely origin components with supporting evidence)
- A plain-language explanation for each flagged event

*(The comparison-experiment and unseen-pattern benchmark work described in the original write-up is **research-track** material — tracked separately, not a product deliverable.)*

---

## 7. Business Use Case

**Target users:** DevOps, SRE, Cloud Infrastructure teams, SOC (Security Operations Center), IT Ops.

**Target industries:** SaaS, banking/fintech, e-commerce, telecom — anywhere large, always-on infrastructure produces continuous logs.

**Applications:**
- Early detection of server/service failures
- Microservice and infrastructure health monitoring
- Application performance monitoring
- Incident investigation and root-cause tracing
- Security anomaly detection
- Cloud monitoring automation

**Business value:** faster incident detection → lower downtime, lower operational cost, better SLA compliance.

---

## 8. Architecture

```
Raw Log Files
      │
      ▼
Light Cleaning (remove broken/empty lines, fix encoding)
      │
      ▼
Log Parsing (Drain3) — turns each raw log line into a template + extracted variables
      │
      ├──────────────────┬──────────────────┐
      ▼                  ▼                  ▼
  SEMANTIC VIEW      STRUCTURAL VIEW     TEMPORAL VIEW
  (SBERT 384-D        (template ID,       (event frequency,
   vector per          log level,          burst rate, time
   log line)           parameter types)    between events,
      │                  │                 sequence patterns)
      ▼                  ▼                  ▼
  Prototype          Isolation Forest    HMM (sequence score)
  Distance Score      + LOF (combined     + rolling z-score
  (distance from       structural score)   (frequency score),
   "normal" clusters)                     combined
      │                  │                  │
      └──────────────────┴──────────────────┘
                          ▼
         Reliability-Weighted Score Fusion
         (each view's weight depends on how
          trustworthy that view currently is,
          not on how high its own score is)
                          ▼
                Adaptive Threshold
         (moves with recent score patterns,
          instead of one fixed cutoff)
                          ▼
             Anomaly Flag + Severity Score
                          ▼
                  Drift Monitoring
        (tells apart "real new anomaly" from
         "legitimate new normal pattern")
                          ▼
             Evidence-Based Explanation
        (why it was flagged, what changed,
         nearest normal example — optional
         LLM rewrite into plain English)
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
         Dashboard              Lightweight RCA
                            (groups related anomalies
                            by timing + component
                            co-occurrence + shared
                            error pattern, then ranks
                            likely root-cause candidates)
              │                       │
              └───────────┬───────────┘
                          ▼
                  Unified Dashboard
      (timeline, per-component risk, incident cards,
       root-cause cluster cards, explanations)
```

**Pipeline steps:**

1. **Upload** — raw log files from applications/servers.
2. **Clean** — strip noise, fix encoding.
3. **Parse (Drain3)** — mine templates, extract structured fields.
4. **Build three views** — semantic (SBERT), structural (template/log-level features), temporal (frequency/timing).
5. **Detect per view** — each view scored by its own detector.
6. **Fuse scores** — reliability-weighted combination of the three.
7. **Threshold and score severity** — flag anomalies with a moving threshold; rate severity.
8. **Check for drift** — confirm the system isn't reacting to a legitimate new pattern.
9. **Explain** — generate structured evidence for every flagged anomaly.
10. **Cluster and rank root causes** — group related anomalies, rank likely origin components.
11. **Visualize** — surface everything on the dashboard.

---

## 9. Key Features

| Feature | Description |
|---|---|
| Multi-view detection | Looks at meaning, structure, and timing together |
| Reliability-weighted fusion | Trusts each view based on current reliability, not alarm volume |
| Adaptive thresholding | Moving cutoff that adjusts as normal behavior shifts |
| Drift-aware | Distinguishes a real new anomaly from a legitimate new normal |
| Detects unknown failures | Flags failure patterns never seen before, without prior rules |
| Evidence-based explanations | Structured, per-view evidence for every anomaly; optional plain-language rewrite |
| Lightweight root-cause localization | Groups related anomalies, ranks likely origin components — no service map required |
| Interactive dashboard | Timeline, risk view, incident cards, root-cause cluster cards |
| Scalable architecture | Built to handle large log volumes |
| Real-time ready | Architecture extendable toward streaming later; current version processes uploaded batches |

---

## 10. Product Deliverables

- Log preprocessing and Drain3 parsing module
- Three feature-building modules (semantic, structural, temporal)
- Per-view anomaly detectors, plus a reliability-weighted fusion module
- Adaptive threshold and severity scoring module
- Drift monitoring module
- Evidence-based explanation layer
- Lightweight root-cause localization module (clustering and ranking)
- Interactive dashboard (timeline, risk view, incident cards, root-cause cluster cards)
- Deployment-ready containerized app

*(Removed from this list, since they belong to the research track: the mini-ablation experiment, the unseen-pattern recall benchmark, and the paper/report.)*

---

## 11. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Language | Python | Fastest path to a working system with mature ML/NLP tooling |
| Data processing | Pandas, NumPy | Log cleaning and tabular manipulation |
| Semantic embeddings | Sentence-BERT (Sentence-Transformers) | Pretrained, no need to train a transformer from scratch |
| Semantic detector | KMeans (normal-behavior prototypes) + cosine distance | Handles brand-new, never-seen-before log messages well |
| Structural detector | Isolation Forest + Local Outlier Factor (scikit-learn) | Suited to structural features — high-dimensional, mixed-density data |
| Temporal detector | Hidden Markov Model (hmmlearn) + rolling z-score | HMM captures sequence patterns; z-score catches frequency spikes cheaply |
| Fusion and thresholding | Custom Python | Reliability weighting and adaptive threshold aren't off-the-shelf functions |
| Drift monitoring | scipy.stats (KS test) | Statistical comparison between recent and reference data |
| Log parsing | Drain3 (+ regex fallback) | Handles real-world messy, variable logs far better than plain regex |
| Visualization | Plotly, Matplotlib | Interactive charts for the dashboard |
| Dashboard | Streamlit *or* FastAPI + React | Streamlit is fastest to build solo; FastAPI+React is more product-grade if time allows |
| Storage | SQLite (dev) → PostgreSQL (scale) | SQLite is enough early on; Postgres for production-readiness |
| Model management | Joblib | Save/load trained detectors |
| Deployment | Docker + cloud host (or Streamlit Community Cloud/Render) | Makes the "deployable" claim real |
| Version control | Git + GitHub | Standard |

---

## 12. Models Used and Why

- **Sentence-BERT** — off-the-shelf sentence embedding model; captures meaning without pretraining a transformer on log data.
- **KMeans (prototype clustering)** — groups normal-training embeddings into "normal behavior" prototypes; anomaly score = distance from nearest prototype. Good at catching brand-new failure messages.
- **Isolation Forest** — fast, works well on high-dimensional data; default outlier detector for the structural view.
- **Local Outlier Factor (LOF)** — density-based; catches local anomalies a single global rule would miss.
- **Hidden Markov Model (HMM)** — models normal event ordering; flags sequences with low likelihood under the learned pattern.
- **Rolling z-score** — no-training-needed check for sudden frequency spikes, paired with the HMM.
- **Reliability-weighted fusion** — each view's contribution is weighted by how reliable it currently is, calculated independently of the anomaly score itself.
- **DBSCAN** — not part of the fused score; optional side reference only, since it doesn't naturally produce a calibrated anomaly score.

---

## 13. Build Roles (adapt for solo vs. team)

If solo, treat these as sequential phases owned end-to-end. If working with 2–3 others:

| Role | Responsibility |
|---|---|
| Data/ML lead | Log parsing, Drain3 integration, building the three feature views |
| Modeling lead | Tuning detectors, building fusion logic, adaptive threshold, drift monitor |
| Product/dashboard lead | Dashboard, visualizations, UX, root-cause cluster cards |
| DevOps/deployment lead | Containerization, CI/CD, hosting |

---

## 14. What to Be Careful About

- **Log parsing is where projects actually die.** Real logs are messy — multi-line stack traces, inconsistent formats across services. Budget real time here; don't treat Drain3 as an afterthought.
- **False positives will make or break usability.** Unsupervised methods can flag rare-but-harmless events (deployments, config changes) as anomalies. Plan a sensitivity setting or basic feedback loop.
- **Be honest about the root-cause piece.** Don't call it full "root cause analysis" — that implies a service dependency graph this data doesn't have. Call it "lightweight" or "candidate" root-cause localization.
- **Positioning matters commercially.** This is a crowded market (Splunk, Datadog, Elastic). Frame it as an open-source or niche tool, not a head-on enterprise competitor.
- **Scope the dashboard honestly.** A batch "upload and analyze" interface is fine — say so directly ("current version: batch analysis, extendable to streaming") rather than overclaiming real-time capability that isn't built yet.

---

## 15. Application Build Plan

1. **Week 1** — Set up repo, environment, ingest a sample log dataset. Light cleaning pipeline.
2. **Week 2** — Drain3 parsing module; validate template extraction quality.
3. **Week 3** — Build the three feature views (semantic, structural, temporal).
4. **Week 4–5** — Implement each per-view detector individually (KMeans prototypes, Isolation Forest + LOF, HMM + rolling z-score); validate each in isolation.
5. **Week 6** — Build reliability-weighted fusion, adaptive threshold, severity scoring.
6. **Week 7** — Build drift monitoring and the evidence-based explanation layer.
7. **Week 8** — Build lightweight root-cause localization (temporal windowing, co-occurrence, template grouping, ranking).
8. **Week 9–10** — Build the dashboard (timeline, risk view, incident cards, root-cause cluster cards).
9. **Week 11** — Integration testing across the full pipeline; tune false-positive rate.
10. **Week 12** — Dockerize the app, write setup docs, polish the GitHub repo (README, architecture diagram, demo GIF/video).

*(No paper-writing or ablation-experiment weeks included — those belong to the separately owned research track.)*

---

## 16. Research Track (owned separately, not part of this document)

The following is called out so it's clearly **not** part of the application scope, and is tracked as independent work:

- Literature review (DeepLog, LogBERT, LogADSBERT, LogST, MLAD, SimCSE)
- Mini-ablation experiment (single-view vs. full-fusion comparison)
- Unseen-pattern recall benchmark
- Embedding improvement experiments (contrastive fine-tuning, template-based embedding)
- Paper/report writing, feasibility write-up, comparison tables

---

## 17. Feasibility Snapshot

- **Technical feasibility:** Sound — mirrors established approaches while adding a genuinely different fusion strategy.
- **Commercially viable as-is:** Realistic as an open-source or niche tool — not a head-on Splunk/Datadog competitor.
- **Usable in practice:** Yes, provided real time is invested in log parsing robustness and false-positive management — these decide real-world adoption more than model choice does.
