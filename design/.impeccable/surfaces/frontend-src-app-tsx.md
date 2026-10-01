---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: []
---

# LogSight frontend

Scope: the whole web app. Landing is Persuade; upload, receipt and report are Operate.
Audience: DevOps / SRE engineers with a log file from a system that misbehaved.
Job: upload a log, watch the pipeline work, read what broke, when, how badly, and where to look first.
Proof: real runs in the database (full BGL run, 60k trial). No customers, testimonials or pricing exist.
Constraints: the user's ban list and brand commitments in PRODUCT.md. Build path: code-led (no image generation).

## Direction contract

THESIS: A log run is a ticket. You hand a file in, the machine prints a receipt line by line as each stage completes, and what comes back is a stamped report sheet. Refuses the SaaS dashboard of rounded metric cards and the dark "hacker" console.

OWN-WORLD: Light Sand ground, Wine Red as the one heavy colour, wine-tinted ink. Admission tickets with punched notches and perforation rules, receipts with a saw-tooth tear, postage stamps with scalloped edges in ochre, slate blue and green. Barcodes built from the run id. Square corners, hairline rules, no shadows. Condensed heavy grotesque caps for ticket lettering, a plain grotesque for reading, a mono only for log lines and figures.

STORY: The visitor sees a real run printed on a ticket, understands the three views and the fusion, uploads a file, watches the receipt tick, then reads a report that says what each number means.

FIRST VIEWPORT: Left, a two-line headline in heavy condensed caps with one sentence and two actions (Upload a log, See a real run). Right, a large wine ticket, notched and perforated, carrying the featured run's real figures at ticket scale with a barcode stub. Binary digits fade in behind the ticket.

FORM: Brief-pinned ticket and receipt ephemera. The pin outranks the roll (seed ce48e233, assigned index 5). Raises kept from declined challengers: from the punched jacquard, rows of binary instruction as the page texture; from airport wayfinding, one message per band and figures at monumental scale.

Signature interaction: the receipt. Each stage prints as the backend starts it, shows its elapsed time in the price column, gets ticked when the next begins, and the finished receipt is stamped.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
