import { useState } from 'react'
import { useApi } from '../../api/hooks'
import type { ComponentRisk, DriftSignal, Incident, Page, RootCauseCount, RunDetail } from '../../api/types'
import { Tally } from '../../components/Ephemera'
import { ErrorNotice, SkeletonRows } from '../../components/States'
import { formatInt, formatLogDate, formatLogTime, formatPercent, logSpan, serial } from '../../lib/format'
import { bySeverity, viewCopy } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const TOP_INCIDENTS = 5
const TOP_COMPONENTS = 5

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
const localTime = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

function processingSeconds(run: RunDetail): number | null {
  if (!run.started_at || !run.finished_at) return null
  return Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 100) / 10
}

function setting(run: RunDetail, section: string, key: string): string {
  const value = run.parameters?.[section]?.[key]
  return value == null ? '-' : String(value)
}

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** One report that states the findings, sized to print on A4. */
export default function SummarySheet() {
  const { run, summary } = useReport()
  const incidents = useApi<Page<Incident>>(`/runs/${run.id}/incidents?limit=${TOP_INCIDENTS}`)
  const components = useApi<ComponentRisk[]>(`/runs/${run.id}/components`)
  const rootCauses = useApi<RootCauseCount[]>(`/runs/${run.id}/root-causes`)
  const drift = useApi<DriftSignal[]>(`/runs/${run.id}/drift`)
  const [generated] = useState(() => new Date())
  const [copied, setCopied] = useState(false)
  const loading = incidents.loading || components.loading || rootCauses.loading || drift.loading
  const error = incidents.error ?? components.error ?? rootCauses.error ?? drift.error
  const views = run.view_summary ?? {}
  const leadView = Object.keys(views).sort((a, b) => views[b].dominant_flags - views[a].dominant_flags)[0]
  const topOrigin = rootCauses.data?.[0]
  const seconds = processingSeconds(run)
  const driftedSignals = drift.data?.filter((d) => d.first_flagged_row != null) ?? []
  const params: [string, string][] = [
    ['Threshold window (lines)', setting(run, 'threshold', 'window')],
    ['Threshold strictness (lambda)', setting(run, 'threshold', 'lam')],
    ['Normal-message prototypes', setting(run, 'semantic_scoring', 'n_prototypes')],
    ['Hidden states (HMM)', setting(run, 'temporal_hmm', 'n_states')],
    ['Incident gap', setting(run, 'incidents', 'time_window')],
  ]

  const copyId = () => {
    navigator.clipboard?.writeText(serial(run.id)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }, () => undefined)
  }
  const exportJson = () => download(`logsight-report-run${run.id}-${stamp(new Date())}.json`, {
    report: {
      title: 'LogSight Anomaly Report', schema_version: '1.0', generated_at: new Date().toISOString(),
      generator: 'LogSight', run_id: run.id, run_name: run.name, source_kind: run.source_kind,
      status: run.status, started_at: run.started_at, finished_at: run.finished_at,
      processing_seconds: seconds,
    },
    log: {
      period_start: summary.time_start, period_end: summary.time_end, raw_rows: run.raw_rows,
      readable_rows: summary.total_rows, templates: summary.n_templates, learning_window_rows: run.train_end_idx,
    },
    summary: {
      flagged: summary.n_anomalies, flag_rate: summary.anomaly_rate, incidents: summary.n_incidents,
      severity_counts: summary.severity_counts,
    },
    views: run.view_summary, detectors: run.detectors, parameters: run.parameters,
    top_components: components.data?.slice(0, TOP_COMPONENTS), largest_incidents: incidents.data?.items,
    root_causes: rootCauses.data,
    drift: drift.data?.map(({ windows: _windows, ...signal }) => signal),
  })

  return (
    <article className="sheet summary">
      <style media="print">{`@page { size: A4; margin: 18mm 15mm 20mm;
        @bottom-center { content: "LogSight · Run ${serial(run.id)} · generated ${localTime(generated)} · page " counter(page); font-size: 9pt; } }`}</style>
      <header className="sheet__head summary__head">
        <div>
          <p className="muted summary__brand">LogSight</p>
          <h1 className="display">Anomaly Report</h1>
          <p className="lede">{run.name}</p>
        </div>
        <div className="summary__serial">
          <span className="data">Run No. {serial(run.id)}</span>
          <button type="button" className="btn btn--ghost no-print" onClick={copyId}>
            {copied ? 'Copied' : 'Copy run ID'}
          </button>
        </div>
      </header>

      <dl className="meta">
        {([
          ['Source', run.source_kind],
          ['Generated', localTime(generated)],
          ['Log period', `${formatLogTime(summary.time_start)} to ${formatLogTime(summary.time_end)}`],
          ['Readable lines', formatInt(summary.total_rows)],
          ['Lines skipped', run.raw_rows != null ? formatInt(Math.max(run.raw_rows - summary.total_rows, 0)) : '-'],
          ['Templates', formatInt(summary.n_templates)],
          ['Learning-window lines', formatInt(run.train_end_idx)],
          ['Status', run.status],
          ['Processing time', seconds != null ? `${seconds} s` : '-'],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      <div className="summary__actions no-print">
        <button type="button" className="btn" onClick={() => window.print()}>Print or save as PDF</button>
        <button type="button" className="btn btn--ghost" disabled={loading || !!error} onClick={exportJson}>
          Download as JSON
        </button>
      </div>

      <section className="sheet__section">
        <h2>Findings</h2>
        <ul className="findings">
          <li>
            The log covers {formatLogDate(summary.time_start)} to {formatLogDate(summary.time_end)} and
            holds {formatInt(summary.total_rows)} readable lines in {formatInt(summary.n_templates)} templates.
          </li>
          <li>
            {formatInt(summary.n_anomalies)} lines ({formatPercent(summary.anomaly_rate)}) were flagged,
            in {formatInt(summary.n_incidents)} incidents.
          </li>
          {topOrigin && (
            <li>
              {topOrigin.component} is the most frequent likely origin, ranked first
              in {formatInt(topOrigin.times_ranked_root_cause)} incidents.
            </li>
          )}
          {leadView && (
            <li>
              The {viewCopy(leadView).name.toLowerCase()} view contributed most to{' '}
              {formatPercent(summary.n_anomalies ? views[leadView].dominant_flags / summary.n_anomalies : null)} of flags.
            </li>
          )}
        </ul>
      </section>

      <section className="sheet__section">
        <h2>Flagged lines by severity</h2>
        <Tally rows={Object.keys(summary.severity_counts).sort(bySeverity).reverse().map((severity) => ({
          label: severity.charAt(0) + severity.slice(1).toLowerCase(),
          value: formatInt(summary.severity_counts[severity]),
        }))} />
      </section>

      {loading && <SkeletonRows rows={5} height="2rem" />}
      {error && <ErrorNotice error={error} />}

      {components.data && components.data.length > 0 && (
        <section className="sheet__section">
          <h2>Components with the most flagged lines</h2>
          <Tally rows={components.data.slice(0, TOP_COMPONENTS).map((c) => ({
            label: c.component ?? 'Unknown', value: formatInt(c.anomaly_count),
          }))} />
        </section>
      )}

      {incidents.data && incidents.data.items.length > 0 && (
        <section className="sheet__section">
          <h2>Largest incidents</h2>
          <div className="table-scroll">
            <table className="metrics">
              <thead>
                <tr>
                  <th scope="col">No.</th>
                  <th scope="col">Started</th>
                  <th scope="col">Lasted</th>
                  <th scope="col" className="num-cell">Flagged lines</th>
                  <th scope="col">Likely origin</th>
                </tr>
              </thead>
              <tbody>
                {incidents.data.items.map((incident) => (
                  <tr key={incident.incident_id}>
                    <td className="data">{incident.incident_id}</td>
                    <td>{formatLogTime(incident.start_time)}</td>
                    <td>{logSpan(incident.start_time, incident.end_time)}</td>
                    <td className="num-cell">{formatInt(incident.n_anomalies)}</td>
                    <th scope="row">{incident.top_root_cause ?? 'Not ranked'}</th>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {Object.keys(views).length > 0 && (
        <section className="sheet__section">
          <h2>How each view contributed</h2>
          <div className="table-scroll">
            <table className="metrics">
              <thead>
                <tr>
                  <th scope="col">View</th>
                  <th scope="col" className="num-cell">Mean weight</th>
                  <th scope="col" className="num-cell">Flags driven</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(views).map(([view, stats]) => (
                  <tr key={view}>
                    <th scope="row">{viewCopy(view).name}</th>
                    <td className="num-cell">{formatPercent(stats.mean_weight)}</td>
                    <td className="num-cell">{formatInt(stats.dominant_flags)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {drift.data && (
        <section className="sheet__section">
          <h2>Drift check</h2>
          <p>
            {driftedSignals.length === 0
              ? 'No drift detected: the log stayed statistically close to its learning window.'
              : `Drift detected in ${driftedSignals.map((d) => d.signal.replace('_', ' ')).join(' and ')}.`}
          </p>
        </section>
      )}

      <section className="sheet__section">
        <h2>Parameters used</h2>
        <Tally rows={params.map(([label, value]) => ({ label, value }))} />
      </section>

      <section className="sheet__section">
        <h2>How to read this</h2>
        <ul className="findings muted">
          <li>Flags come from unsupervised detectors. Some flagged lines are rare but harmless.</li>
          <li>Likely origins are ranked guesses from timing and co-occurrence. They are not proof of cause.</li>
        </ul>
      </section>
    </article>
  )
}
