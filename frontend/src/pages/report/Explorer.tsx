import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePaged } from '../../api/hooks'
import type { LogEvent } from '../../api/types'
import { SeverityTag } from '../../components/Ephemera'
import { ErrorNotice, SkeletonRows } from '../../components/States'
import { formatInt, formatLogTime, formatScore } from '../../lib/format'
import { bySeverity } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const EXPLORER_PAGE = 10

export default function Explorer({ runId }: { runId: number; onPick?: (incidentId: number) => void }) {
  const { summary } = useReport()
  const [severity, setSeverity] = useState('')
  const events = usePaged<LogEvent>(`/runs/${runId}/anomalies${severity ? `?severity=${severity}` : ''}`, EXPLORER_PAGE)
  return (
    <>
      <div className="explorer__bar no-print">
        <div className="field explorer__filter">
          <label htmlFor="explorer-severity">Severity</label>
          <select id="explorer-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All</option>
            {Object.keys(summary.severity_counts).sort(bySeverity).reverse().map((s) => (
              <option key={s} value={s}>{s.toLowerCase()} ({formatInt(summary.severity_counts[s])})</option>
            ))}
          </select>
        </div>
        {events.total !== null && <p className="muted">{formatInt(events.total)} lines match, most severe first</p>}
      </div>
      {events.initialLoading && <SkeletonRows rows={5} height="2.5rem" />}
      {events.error && <ErrorNotice error={events.error} onRetry={events.retry} />}
      {events.items.length > 0 && (
        <div className="table-scroll">
          <table className="explorer">
            <thead>
              <tr>
                <th scope="col">Time</th><th scope="col">Level</th><th scope="col">Component</th>
                <th scope="col">Message</th><th scope="col" className="num-cell">Score</th>
                <th scope="col">Severity</th><th scope="col">Incident</th>
              </tr>
            </thead>
            <tbody>
              {events.items.map((event) => (
                <tr key={event.row_index}>
                  <td className="data nowrap">{formatLogTime(event.time)}</td>
                  <td>{event.level ?? '-'}</td>
                  <td>{event.component ?? '-'}</td>
                  <td className="explorer__msg data" title={event.content}>{event.content}</td>
                  <td className="num-cell">{formatScore(event.final_score, 2)}</td>
                  <td><SeverityTag severity={event.severity} /></td>
                  <td>
                    {event.incident_id != null
                      ? <Link to={`../incidents?incident=${event.incident_id}`} className="link">No. {event.incident_id}</Link>
                      : <span className="muted">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="explorer__foot">
        {events.hasMore && !events.error && (
          <button type="button" className="btn btn--ghost btn--small" onClick={events.more} disabled={events.loading}>
            {events.loading ? 'Loading' : `Show ${EXPLORER_PAGE} more`}
          </button>
        )}
      </div>
    </>
  )
}
