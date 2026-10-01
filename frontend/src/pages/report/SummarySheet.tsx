import { useApi } from '../../api/hooks'
import type { ComponentRisk, Incident, Page, RootCauseCount } from '../../api/types'
import { Barcode, Tally } from '../../components/Ephemera'
import { ErrorNotice, SkeletonRows } from '../../components/States'
import { formatInt, formatLogDate, formatLogTime, formatPercent, formatScore, logSpan, serial } from '../../lib/format'
import { bySeverity, metricCopy, viewCopy } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const TOP_INCIDENTS = 5
const TOP_COMPONENTS = 5

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** One page that states the findings, sized to print. */
export default function SummarySheet() {
  const { run, summary, evaluation } = useReport()
  const incidents = useApi<Page<Incident>>(`/runs/${run.id}/incidents?limit=${TOP_INCIDENTS}`)
  const components = useApi<ComponentRisk[]>(`/runs/${run.id}/components`)
  const rootCauses = useApi<RootCauseCount[]>(`/runs/${run.id}/root-causes`)
  const loading = incidents.loading || components.loading || rootCauses.loading
  const error = incidents.error ?? components.error ?? rootCauses.error
  const views = run.view_summary ?? {}
  const leadView = Object.keys(views).sort((a, b) => views[b].dominant_flags - views[a].dominant_flags)[0]
  const topOrigin = rootCauses.data?.[0]
  const auc = summary.test_metrics?.auc_roc

  return (
    <article className="sheet summary">
      <header className="sheet__head summary__head">
        <div>
          <h1 className="display">Run summary</h1>
          <p className="lede">{run.name}</p>
        </div>
        <div className="summary__serial">
          {run.finished_at && (
            <p className="inkmark">Processed<small>{formatLogDate(run.finished_at)}</small></p>
          )}
          <span className="data">Run No. {serial(run.id)}</span>
          <Barcode value={`run-${run.id}-${run.created_at}`} bars={30} />
        </div>
      </header>

      <div className="summary__actions no-print">
        <button type="button" className="btn" onClick={() => window.print()}>Print or save as PDF</button>
        <button type="button" className="btn btn--ghost" disabled={loading || !!error}
          onClick={() => download(`logsight-run-${run.id}.json`, {
            run, summary, evaluation, components: components.data, root_causes: rootCauses.data,
            largest_incidents: incidents.data?.items,
          })}>
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
          {auc != null && (
            <li>Against the log's own labels, ranking quality ({metricCopy('auc_roc').label}) is {formatScore(auc)}.</li>
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
