import type { CSSProperties } from 'react'
import { useApi } from '../../api/hooks'
import type { ComponentRisk, RootCauseCount, TimelinePoint } from '../../api/types'
import { BarList, chooseBucket, TimelineChart } from '../../components/charts'
import { ErrorNotice, SkeletonBlock, SkeletonRows } from '../../components/States'
import Tile from '../../components/Tile'
import { formatInt, formatLogDate } from '../../lib/format'
import { bySeverity, severityVar } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const TOP_ROWS = 10

/** When the flagged lines happened, and which components they came from. */
export default function WhenWhereSheet() {
  const { run, summary } = useReport()
  const bucket = chooseBucket(summary.time_start, summary.time_end)
  const timeline = useApi<TimelinePoint[]>(`/runs/${run.id}/timeline?bucket=${bucket}`)
  const components = useApi<ComponentRisk[]>(`/runs/${run.id}/components`)
  const rootCauses = useApi<RootCauseCount[]>(`/runs/${run.id}/root-causes`)
  const severities = Object.keys(summary.severity_counts).sort(bySeverity)

  return (
    <article className="dash">
      <header className="dash__head">
        <div>
          <p className="caps">When and where</p>
          <h1 className="dash__title">Flagged lines over time</h1>
          <p className="muted">
            {formatLogDate(summary.time_start)} to {formatLogDate(summary.time_end)}. Which part of the system they came from.
          </p>
        </div>
      </header>

      <div className="bento">
        <Tile title={`Flagged lines per ${bucket}`} span={12} hint="Stacked by severity. Hover a bar for the figures.">
          <ul className="legend">
            {severities.map((severity) => (
              <li key={severity}>
                <span className="tag"><span className="tag__swatch" style={{ '--swatch': severityVar(severity) } as CSSProperties} />{severity.toLowerCase()}</span>
                <span className="num">{formatInt(summary.severity_counts[severity])}</span>
              </li>
            ))}
          </ul>
          {timeline.loading && <SkeletonBlock height="17.5rem" />}
          {timeline.error && <ErrorNotice error={timeline.error} onRetry={timeline.reload} />}
          {timeline.data && (timeline.data.length
            ? <TimelineChart points={timeline.data} bucket={bucket} />
            : <p>No line was flagged in this run.</p>)}
        </Tile>

        <Tile title="Where they came from" span={6} hint="Flagged lines per component">
          {components.loading && <SkeletonRows rows={6} height="1.75rem" />}
          {components.error && <ErrorNotice error={components.error} onRetry={components.reload} />}
          {components.data && (
            <BarList labelWidth="7rem" rows={components.data.slice(0, TOP_ROWS).map((c) => ({
              key: c.component ?? 'unknown', label: c.component ?? 'Unknown', value: c.anomaly_count,
              note: `average severity score ${c.avg_severity_score.toFixed(2)}`,
            }))} />
          )}
        </Tile>

        <Tile title="Most likely origins" span={6} hint="How often each component ranked first as an incident's origin">
          {rootCauses.loading && <SkeletonRows rows={5} height="1.75rem" />}
          {rootCauses.error && <ErrorNotice error={rootCauses.error} onRetry={rootCauses.reload} />}
          {rootCauses.data && (rootCauses.data.length ? (
            <BarList labelWidth="7rem" rows={rootCauses.data.slice(0, TOP_ROWS).map((r) => ({
              key: r.component, label: r.component, value: r.times_ranked_root_cause,
              display: `${formatInt(r.times_ranked_root_cause)} incidents`, colour: 'var(--crimson)',
            }))} />
          ) : <p>No incidents, so nothing to rank.</p>)}
        </Tile>
      </div>
    </article>
  )
}
