# LogSight frontend

React app for the LogSight backend in `../backend`. It has four parts:

- **Landing page** (`/`): what the product does, shown with a real stored run.
- **Upload** (`/upload`): hand in a raw log file and start a run.
- **Receipt** (`/runs/:id/receipt`): live progress. Each pipeline stage is ticked
  off as the backend reports it, with the time it took.
- **Report** (`/runs/:id/...`): overview, three views, incidents, flagged lines,
  templates and drift, accuracy, and a printable summary.

Plus the list of runs (`/runs`), terms of service and privacy policy.

## Running

The backend must be running first (see `../backend/README.md`).

```powershell
cd frontend
npm install        # first time only
npm run dev
```

Open http://localhost:5173. The dev server forwards `/api/v1` to the backend at
`http://127.0.0.1:8000`, so no CORS setup is needed. To change either, copy
`.env.example` to `.env`.

`npm run build` type-checks and writes a production build to `dist/`.

## Layout

```
src/
├── main.tsx, App.tsx     entry point and routes
├── api/                  backend types, fetch client, data hooks
├── lib/
│   ├── format.ts         numbers, dates, durations
│   └── vocabulary.ts     wording for stage, view, severity and metric ids
├── components/
│   ├── Chrome.tsx        masthead, footer, paper grain
│   ├── Ephemera.tsx      barcode, binary field, tally, tags
│   ├── charts.tsx        timeline, bar list, share bar, drift chart
│   └── States.tsx        skeletons, error and empty notices
├── pages/
│   ├── LandingPage, UploadPage, ReceiptPage, RunsPage, LegalPages
│   └── report/           one file per report sheet
├── reactbits/            components from reactbits.dev (SplitText, DecryptedText,
│                         CountUp, AnimatedContent, Noise), unmodified
└── styles/               base (tokens), shapes (ticket, receipt, stamp), and one file per area
```

## Where the data comes from

Every figure on screen is read from the API. The frontend holds no sample data.
Stage names and their order, view names, severity buckets, metrics and run
parameters all come from the backend; `lib/vocabulary.ts` only supplies the
human wording for those identifiers and falls back to the raw id for any it
does not know.

## Design

Recorded in `../design/DESIGN.md`. In short: Light Sand ground, Wine Red as the single
heavy colour, square corners, no shadows, and three printed forms from
`../assets`: the ticket, the receipt and the postage stamp.
