import { useApi } from '../../api/hooks'
import type { AnomalyKind, IncidentDetail, LogEvent, Page } from '../../api/types'
import { BarList } from '../../components/charts'
import { SeverityTag } from '../../components/Ephemera'
import { ErrorNotice, SkeletonBlock, SkeletonRows } from '../../components/States'
import { formatInt, formatLogTime, formatScore, logSpan } from '../../lib/format'
import Explanation from './Explanation'

/** The chosen incident: where it came from, how likely each component is the origin, and why it was flagged. */
export default function IncidentFocus({ runId, incidentId }: { runId: number; incidentId: number }) {
  const detail = useApi<IncidentDetail>(`/runs/${runId}/incidents/${incidentId}`)
  const kinds = useApi<Page<AnomalyKind>>(`/runs/${runId}/anomaly-kinds?incident_id=${incidentId}&limit=1`)
  if (detail.loading) return <SkeletonBlock height="22rem" />
  if (detail.error) return <ErrorNotice error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return null
  const incident = detail.data
  const topLine: LogEvent | undefined = kinds.data?.items[0]?.event

  return (
    <div className="focus">
      <div className="focus__head">
        <div>
          <p className="caps">Incident No. {incident.incident_id}</p>
          <p className="focus__when">
            {formatLogTime(incident.start_time)} <span className="muted">lasted {logSpan(incident.start_time, incident.end_time)}</span>
          </p>
        </div>
        {incident.peak_severity && <SeverityTag severity={incident.peak_severity} />}
      </div>
      <dl className="focus__facts">
        <div><dt>Flagged lines</dt><dd className="num">{formatInt(incident.n_anomalies)}</dd></div>
        <div><dt>Message kinds</dt><dd className="num">{formatInt(incident.n_distinct_templates)}</dd></div>
        <div><dt>Components</dt><dd>{incident.components_involved.join(', ')}</dd></div>
        <div><dt>Likely origin</dt><dd><strong>{incident.top_root_cause ?? 'Not ranked'}</strong></dd></div>
      </dl>

      <div className="focus__section">
        <h3>Root-cause candidates</h3>
        {incident.root_cause_candidates.length === 1 && (
          <p className="muted">Only one component was involved, so there is nothing to rank against.</p>
        )}
        <BarList max={1} labelWidth="8rem" rows={incident.root_cause_candidates.slice(0, 5).map((candidate) => ({
          key: candidate.component, label: candidate.component, value: candidate.root_cause_score,
          display: formatScore(candidate.root_cause_score, 2),
          colour: candidate.rank === 1 ? 'var(--alert)' : 'var(--view-semantic)',
        }))} />
      </div>

      <div className="focus__section">
        <h3>Why it was flagged</h3>
        {kinds.loading && <SkeletonRows rows={3} height="2rem" />}
        {topLine && <Explanation runId={runId} rowIndex={topLine.row_index} evidenceLimit={null} />}
        {kinds.data && !topLine && <p className="muted">No flagged line is stored for this incident.</p>}
      </div>
    </div>
  )
}
