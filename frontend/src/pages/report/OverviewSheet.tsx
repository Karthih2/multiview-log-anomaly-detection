import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../../api/hooks'
import type { ComponentRisk, RootCauseCount, TimelinePoint } from '../../api/types'
import { BarList, chooseBucket, TimelineChart } from '../../components/charts'
import { Count, Tally } from '../../components/Ephemera'
import type { TallyRow } from '../../components/Ephemera'
import { ErrorNotice, SkeletonBlock, SkeletonRows } from '../../components/States'
import { formatInt, formatLogDate, formatPercent, formatScore } from '../../lib/format'
import { bySeverity, metricCopy, severityVar } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const TOP_ROWS = 8

export default function OverviewSheet() {
  const { run, summary } = useReport()
  const bucket = chooseBucket(summary.time_start, summary.time_end)
  const timeline = useApi<TimelinePoint[]>(`/runs/${run.id}/timeline?bucket=${bucket}`)
  const sameDay = summary.time_start.slice(0, 10) === summary.time_end.slice(0, 10)
  const components = useApi<ComponentRisk[]>(`/runs/${run.id}/components`)
  const rootCauses = useApi<RootCauseCount[]>(`/runs/${run.id}/root-causes`)

  const count = (value: number) => <Count to={value} />
  const tally: TallyRow[] = [
    { label: 'Log lines read', value: count(summary.total_rows), note: 'Lines left after dropping broken or empty ones.' },
    { label: 'Lines flagged as anomalies', value: count(summary.n_anomalies), note: `${formatPercent(summary.anomaly_rate)} of all lines scored above the moving cutoff.` },
    { label: 'Incidents', value: count(summary.n_incidents), note: 'Flagged lines that happened close together in time, grouped.' },
    { label: 'Message templates found', value: count(summary.n_templates), note: 'Distinct line shapes mined by Drain3.' },
  ]
  const auc = summary.test_metrics?.auc_roc
  if (auc != null) {
    tally.push({ label: metricCopy('auc_roc').label, value: formatScore(auc), note: metricCopy('auc_roc').meaning })
  }
  const severities = Object.keys(summary.severity_counts).sort(bySeverity)

  return (
    <article className="sheet">
      <header className="sheet__head sheet__head--stamped">
        <h1 className="display">{run.name}</h1>
        {run.finished_at && (
          <p className="inkmark sheet__stamp">
            Processed<small>{formatLogDate(run.finished_at)}</small>
          </p>
        )}
        <p className="lede">
          {sameDay
            ? `On ${formatLogDate(summary.time_start)}, `
            : `Between ${formatLogDate(summary.time_start)} and ${formatLogDate(summary.time_end)}, `}
          {formatInt(summary.total_rows)} log lines were read. {formatInt(summary.n_anomalies)} were flagged
          and grouped into {formatInt(summary.n_incidents)} incidents.
        </p>
      </header>

      <section className="sheet__section" aria-label="Totals">
        <Tally rows={tally} large />
      </section>

      <section className="sheet__section">
        <h2>When the anomalies happened</h2>
        <p className="muted">Flagged lines per {bucket}. Darker means more severe.</p>
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
        {timeline.data && (timeline.data.length ? <TimelineChart points={timeline.data} bucket={bucket} /> : <p>No line was flagged in this run.</p>)}
      </section>

      <div className="sheet__pair">
        <section className="sheet__section">
          <h2>Where they came from</h2>
          <p className="muted">Flagged lines per component, with the average severity score.</p>
          {components.loading && <SkeletonRows rows={5} height="1.75rem" />}
          {components.error && <ErrorNotice error={components.error} onRetry={components.reload} />}
          {components.data && (
            <BarList rows={components.data.slice(0, TOP_ROWS).map((c) => ({
              key: c.component ?? 'unknown',
              label: c.component ?? 'Unknown',
              value: c.anomaly_count,
              note: `avg severity ${formatScore(c.avg_severity_score, 2)}`,
            }))} />
          )}
        </section>

        <section className="sheet__section">
          <h2>Most likely origins</h2>
          <p className="muted">How often each component ranked first as an incident's likely root cause.</p>
          {rootCauses.loading && <SkeletonRows rows={5} height="1.75rem" />}
          {rootCauses.error && <ErrorNotice error={rootCauses.error} onRetry={rootCauses.reload} />}
          {rootCauses.data && (rootCauses.data.length ? (
            <BarList rows={rootCauses.data.slice(0, TOP_ROWS).map((r) => ({
              key: r.component, label: r.component, value: r.times_ranked_root_cause,
            }))} />
          ) : <p>No incidents, so nothing to rank.</p>)}
          <p><Link to="incidents" className="link">Go through the incidents</Link></p>
        </section>
      </div>
    </article>
  )
}
