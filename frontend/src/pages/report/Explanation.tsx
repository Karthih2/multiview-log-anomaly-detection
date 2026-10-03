import { useApi } from '../../api/hooks'
import type { EventDetail, EvidencePackage, LogEvent } from '../../api/types'
import ShapWaterfall, { shapValues } from '../../components/Shap'
import { Tally } from '../../components/Ephemera'
import { ErrorNotice, SkeletonRows } from '../../components/States'
import { formatClock, formatLogTime, formatScore } from '../../lib/format'
import { viewCopy } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

/** Why a line was flagged: each view's score, its weight, and what the two contribute together. */
export default function Explanation({ runId, rowIndex, evidenceLimit }: { runId: number; rowIndex: number; evidenceLimit: string | null }) {
  const detail = useApi<EventDetail>(`/runs/${runId}/events/${rowIndex}`)
  const baseline = useApi<Record<string, number>>(`/runs/${runId}/baseline`)
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
  // Same Shapley values the waterfall draws, so the sentence and the chart agree.
  const dominant = baseline.data
    ? shapValues(parts.map((p) => ({ ...p, baseline: baseline.data![p.view] ?? 0 })))
        .values.reduce((a, b) => (Math.abs(b.phi) > Math.abs(a.phi) ? b : a))
    : parts.reduce((a, b) => (b.contribution > a.contribution ? b : a))
  const evidence = event.evidence?.package
  const nearest = evidence?.nearest_normal_example?.[0]

  return (
    <div className="explain panel">
      <div className="explain__why">
        <h3>Why this line was flagged (Shapley values)</h3>
        <p>
          The <strong>{viewCopy(dominant.view).name.toLowerCase()}</strong> view contributed most.
          {' '}{viewCopy(dominant.view).catches}
        </p>
        {baseline.loading && <SkeletonRows rows={4} height="1.6rem" />}
        {baseline.data && (
          <ShapWaterfall threshold={event.threshold}
            parts={parts.map((part) => ({ view: part.view, score: part.score, weight: part.weight, baseline: baseline.data![part.view] ?? 0 }))} />
        )}
        <WhatDrove pkg={evidence} />
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

/** Feature-level reasons per view. Absent on imported runs. */
function WhatDrove({ pkg }: { pkg: EvidencePackage | undefined }) {
  const shap = pkg?.structural_shap?.slice(0, 4)
  const timing = pkg?.temporal_deviations?.slice(0, 3)
  const proto = pkg?.semantic_prototype
  if (!shap?.length && !timing?.length && !proto) {
    return <p className="muted">Feature-level reasons are kept for new runs only.</p>
  }
  const peak = Math.max(...(shap ?? []).map((f) => Math.abs(f.shap)), 1e-9)
  return (
    <div className="drove">
      <h3>What drove it</h3>
      {shap && shap.length > 0 && (
        <section>
          <h4>Structure (SHAP)</h4>
          {shap.map((f) => (
            <div className="drove__row" key={f.feature}>
              <span className="drove__label">{f.feature} <span className="muted data">{String(f.value)}</span></span>
              <span className="drove__track">
                <span className={`drove__bar drove__bar--${f.pushes}`} style={{ width: `${(Math.abs(f.shap) / peak) * 100}%` }} />
              </span>
            </div>
          ))}
        </section>
      )}
      {timing && timing.length > 0 && (
        <section>
          <h4>Timing</h4>
          <ul className="drove__list">
            {timing.map((d) => <li key={d.feature}>{d.feature} <span className="data">{d.value}</span> <span className="muted">· usual {d.usual}</span></li>)}
          </ul>
        </section>
      )}
      {proto && (
        <section>
          <h4>Meaning</h4>
          <p className="muted">Closest normal message ({Math.round(proto.similarity * 100)}% match to the typical pattern):</p>
          <p className="logline">{proto.example}</p>
        </section>
      )}
    </div>
  )
}
