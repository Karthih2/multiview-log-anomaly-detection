import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../../api/hooks'
import type { ComponentRisk, Incident, Page, RootCauseCount, TimelinePoint } from '../../api/types'
import { BarList, chooseBucket, TimelineChart } from '../../components/charts'
import { Count } from '../../components/Ephemera'
import Reveal from '../../components/Reveal'
import { EmptyNotice, ErrorNotice, SkeletonBlock, SkeletonRows } from '../../components/States'
import { formatInt, formatLogDate, formatLogTime, formatPercent, formatScore, logSpan } from '../../lib/format'
import { bySeverity, severityVar } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const TOP_ROWS = 8
const TOP_INCIDENTS = 5

function Kpi({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="kpi panel">
      <p className="kpi__label">{label}</p>
      <p className="kpi__value display"><Count to={value} /></p>
      {note && <p className="kpi__note">{note}</p>}
    </div>
  )
}

export default function OverviewSheet() {
  const { run, summary } = useReport()
  const bucket = chooseBucket(summary.time_start, summary.time_end)
  const timeline = useApi<TimelinePoint[]>(`/runs/${run.id}/timeline?bucket=${bucket}`)
  const components = useApi<ComponentRisk[]>(`/runs/${run.id}/components`)
  const rootCauses = useApi<RootCauseCount[]>(`/runs/${run.id}/root-causes`)
  const incidents = useApi<Page<Incident>>(`/runs/${run.id}/incidents?limit=${TOP_INCIDENTS}`)
  const severities = Object.keys(summary.severity_counts).sort(bySeverity)

  return (
    <article className="sheet dash">
      <header className="dash__head">
        <h1 className="display">Dashboard</h1>
        <p className="muted">
          {formatLogDate(summary.time_start)} to {formatLogDate(summary.time_end)}
          {run.finished_at ? `, processed ${formatLogDate(run.finished_at)}` : ''}
        </p>
      </header>

      <Reveal>
        <section className="kpis" aria-label="Totals">
          <Kpi label="Lines read" value={summary.total_rows} />
          <Kpi label="Flagged lines" value={summary.n_anomalies}
            note={`${formatPercent(summary.anomaly_rate)} of all lines`} />
          <Kpi label="Incidents" value={summary.n_incidents} />
          <Kpi label="Templates" value={summary.n_templates} />
        </section>
      </Reveal>

      <Reveal>
        <section className="dash__section">
          <h2>Flagged lines per {bucket}</h2>
          <ul className="legend">
            {severities.map((severity) => (
              <li key={severity} className="bracket">
                <span className="tag">
                  <span className="tag__swatch" style={{ '--swatch': severityVar(severity) } as CSSProperties} />
                  {severity.toLowerCase()}
                </span>
                <span className="num">{formatInt(summary.severity_counts[severity])}</span>
              </li>
            ))}
          </ul>
          {timeline.loading && <SkeletonBlock height="17.5rem" />}
          {timeline.error && <ErrorNotice error={timeline.error} onRetry={timeline.reload} />}
          {timeline.data && (timeline.data.length
            ? <TimelineChart points={timeline.data} bucket={bucket} />
            : <p>No line was flagged in this run.</p>)}
        </section>
      </Reveal>

      <div className="dash__pair">
        <Reveal>
          <section className="dash__section">
            <h2>Where they came from</h2>
            {components.loading && <SkeletonRows rows={5} height="1.75rem" />}
            {components.error && <ErrorNotice error={components.error} onRetry={components.reload} />}
            {components.data && (
              <BarList rows={components.data.slice(0, TOP_ROWS).map((c) => ({
                key: c.component ?? 'unknown',
                label: c.component ?? 'Unknown',
                value: c.anomaly_count,
                note: `average severity ${formatScore(c.avg_severity_score, 2)}`,
              }))} />
            )}
          </section>
        </Reveal>
        <Reveal delay={0.1}>
          <section className="dash__section">
            <h2>Most likely origins</h2>
            {rootCauses.loading && <SkeletonRows rows={5} height="1.75rem" />}
            {rootCauses.error && <ErrorNotice error={rootCauses.error} onRetry={rootCauses.reload} />}
            {rootCauses.data && (rootCauses.data.length ? (
              <BarList rows={rootCauses.data.slice(0, TOP_ROWS).map((r) => ({
                key: r.component, label: r.component, value: r.times_ranked_root_cause,
                display: `${formatInt(r.times_ranked_root_cause)} incidents`,
              }))} />
            ) : <p>No incidents, so nothing to rank.</p>)}
          </section>
        </Reveal>
      </div>

      <Reveal>
        <section className="dash__section">
          <div className="dash__row">
            <h2>Top incidents</h2>
            <Link to="incidents" className="link">All {formatInt(summary.n_incidents)} incidents</Link>
          </div>
          {incidents.loading && <SkeletonRows rows={TOP_INCIDENTS} height="5.5rem" />}
          {incidents.error && <ErrorNotice error={incidents.error} onRetry={incidents.reload} />}
          {incidents.data && (incidents.data.items.length ? (
            <ul className="incident-cards">
              {incidents.data.items.map((incident) => (
                <li key={incident.incident_id}>
                  <Link to="incidents" className="panel incident-card">
                    <span className="data incident-card__when">{formatLogTime(incident.start_time)}</span>
                    <span>
                      <span className="num">{formatInt(incident.n_anomalies)}</span> lines over {logSpan(incident.start_time, incident.end_time)}
                    </span>
                    <span className="muted">{incident.components_involved.join(', ')}</span>
                    <span>Likely origin: <strong>{incident.top_root_cause ?? 'not ranked'}</strong></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNotice title="No incidents"><p>Nothing was flagged in this run.</p></EmptyNotice>
          ))}
        </section>
      </Reveal>
    </article>
  )
}
