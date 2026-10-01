# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Frontend: Vite + React + TypeScript, plain CSS with custom properties, React Bits
components for motion (requested by the user). Backend: FastAPI + SQLite in
`backend/`, serving JSON under `/api/v1`.

## Users

DevOps, SRE, cloud infrastructure, SOC and IT operations engineers who have a raw
log file from a system that misbehaved and want to know which events are unusual,
how severe they are, and where the trouble most likely started.

## Product Purpose

LogSight ingests raw system logs and flags unusual behaviour without labelled
failure data. It reads every log line from three angles (meaning, structure,
timing), fuses the three scores by how reliable each view currently is, applies a
moving threshold, rates severity, groups related anomalies into incidents and
ranks likely root-cause components. Success is a user who uploads a file and can
say what happened, when, how bad, and which component to look at first.

## Positioning

Three independent views of the same log stream, fused by per-row reliability
rather than fixed voting, with an evidence package behind every flag. An open,
self-hostable tool; not a head-on Splunk or Datadog competitor.

## Operating Context

Batch use: upload a file, wait while the pipeline runs, read the report. The
pipeline stages run in a fixed order (ingest, parse with Drain3, split, features,
per-view scoring, fusion, threshold and severity, drift, evidence, root cause,
evaluation, store). A run on tens of thousands of lines takes about a minute; the
full 4.7M-line BGL dataset takes hours.

## Capabilities and Constraints

- Log format: BGL only.
- Root-cause output is correlation-based candidate ranking, not causal analysis.
  It must be called "lightweight" or "candidate" root-cause localization.
- Evidence packages exist only for the most severe anomalies of a run.
- Drift flags on BGL are oversensitive (documented limitation); show with caveat.
- No authentication, no real-time streaming.
- Evaluation metrics exist only when the log carries labels.

## Brand Commitments

Set by the user for the frontend:

- Palette: Wine Red `#7F011F` and Light Sand `#F5EBD0` (`design/assets/Screenshot 2026-10-01 204451.png`).
- Form language: admission tickets, receipts and postage stamps, perforated and
  notched edges, barcodes (`design/assets/Ticket Choices.jpg`, `design/assets/stamp and ticket.jpg`,
  `design/assets/stamp.jpg`). Stamp secondary colours: ochre brown, slate blue, dark green-grey.
- Data graphics reference: stacked bars and bracketed labels (`design/assets/download (1).jpg`).
- Binary digits fading in as a texture (`design/assets/Binary code ... .jpg`).
- Pipeline progress is shown as a receipt that ticks off each stage as the backend completes it.
- Square corners everywhere. Minimal dashboard with a novel structure; show only the outputs a user needs.
- Motion through React Bits.
- Must not use: harsh gradients, lucide icons, pure white background, rainbow
  colouring, drop shadows, feature cards in a row, emoji, liquid glass, em dashes,
  Inter / Geist / Space Grotesk, terminal windows, fake testimonials, bento grids,
  neon colours, "it's not x, it's y" copy, checkmark bullets, pricing tiers,
  rounded corners, purple and black, radial orbs, dot grids, sparkle icons,
  animated arrows, hover animations, coloured left stripes, basic pastels.
- Must include: a real product demonstration, skeleton loaders, terms of service, privacy policy.

## Evidence on Hand

- Real results in the database: the full BGL run (4,713,483 lines, 537,638 flagged,
  3,885 incidents, test AUC-ROC 0.724) and a 60,000-line trial run.
- No customers, testimonials, pricing or press exist. Do not invent any.

## Product Principles

1. Show the result a reader needs, not everything the pipeline produced.
2. Every number says what it measures.
3. State limits plainly (candidate root cause, drift caveat, partial evidence).
4. The pipeline is the product: let people see it work.

## Accessibility & Inclusion

Legible first: WCAG AA contrast, keyboard access, reduced-motion support, and
severity never encoded by colour alone.
