import { useApi } from '../../api/hooks'
import type { EventDetail, LogEvent } from '../../api/types'
import { BarList } from '../../components/charts'
import { Tally, ViewTag } from '../../components/Ephemera'
import { ErrorNotice, SkeletonRows } from '../../components/States'
import { formatClock, formatLogTime, formatPercent, formatScore } from '../../lib/format'
import { viewCopy, viewVar } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

/** Why a line was flagged: each view's score, its weight, and what the two contribute together. */
export default function Explanation({ runId, rowIndex, evidenceLimit }: { runId: number; rowIndex: number; evidenceLimit: string | null }) {
  const detail = useApi<EventDetail>(`/runs/${runId}/events/${rowIndex}`)
  const { run } = useReport()
  if (detail.loading) return <SkeletonRows rows={3} height="2rem" />
  if (detail.error) return <ErrorNotice error={detail.error} onRetry={detail.reload} />
  const event = detail.data
  if (!event) return null

  // View names come from the run; older runs without a summary fall back to the
  // views this line carries a weight for.
  const views = run.view_summary
    ? Object.keys(run.view_summary)
    : Object.keys(event).filter((key) => key.endsWith('_weight')).map((key) => key.slice(0, -'_weight'.length))
  const parts = views.map((view) => {
    const score = event[`${view}_score` as keyof LogEvent] as number
    const weight = event[`${view}_weight` as keyof LogEvent] as number
    return { view, score, weight, contribution: score * weight }
  })
  const dominant = parts.reduce((a, b) => (b.contribution > a.contribution ? b : a))
  const evidence = event.evidence?.package
  const nearest = evidence?.nearest_normal_example?.[0]

  return (
    <div className="explain panel">
      <div className="explain__why">
        <h3>Why this line was flagged</h3>
        <p>
          The <strong>{viewCopy(dominant.view).name.toLowerCase()}</strong> view contributed most.
          {' '}{viewCopy(dominant.view).catches}
        </p>
        <BarList labelWidth="8.5rem" rows={parts.map((part) => ({
          key: part.view,
          label: <ViewTag view={part.view}>{viewCopy(part.view).name}</ViewTag>,
          value: part.contribution,
          display: formatScore(part.contribution),
          colour: viewVar(part.view),
          note: `score ${formatScore(part.score, 2)} x weight ${formatPercent(part.weight, 0)}`,
        }))} />
        <Tally rows={[
          { label: 'Final score', value: formatScore(event.final_score), note: 'The three contributions added together.' },
          ...(event.threshold != null
            ? [{ label: 'Cutoff at that moment', value: formatScore(event.threshold), note: 'Moves with recent scores. A line is flagged when its final score is above it.' }]
            : []),
          { label: 'Severity score', value: formatScore(event.severity_score), note: 'Blends the score with how persistent, frequent and rare the event is.' },
        ]} />
      </div>

      <div className="explain__context">
        <h3>The line</h3>
        <p className="logline">{event.content}</p>
        <dl className="facts">
          <div><dt>Logged</dt><dd>{formatLogTime(event.time)}</dd></div>
          <div><dt>Node</dt><dd className="data">{event.node ?? '-'}</dd></div>
          <div><dt>Level</dt><dd>{event.level ?? '-'}</dd></div>
          {event.template && <div><dt>Template</dt><dd className="data">{event.template}</dd></div>}
        </dl>

        {nearest && (
          <>
            <h3>A normal line of the same kind</h3>
            <p className="logline">{nearest.content}</p>
            <p className="muted">Logged {formatLogTime(nearest.time)} and not flagged.</p>
          </>
        )}
        {evidence?.preceding_events && evidence.preceding_events.length > 0 && (
          <>
            <h3>What came just before</h3>
            <ol className="preceding">
              {evidence.preceding_events.map((previous, i) => (
                <li key={i}>
                  <span className="data muted">{formatClock(previous.time.replace(' ', 'T'))}</span>
                  <span className="logline">{previous.content}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {!evidence && (
          <p className="muted">
            No comparison lines were stored for this one.
            {evidenceLimit
              ? ` A new run keeps them for its ${evidenceLimit} most severe lines; imported results keep fewer.`
              : ''}
          </p>
        )}
      </div>
    </div>
  )
}
