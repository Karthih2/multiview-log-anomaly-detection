import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi, usePaged } from '../../api/hooks'
import type { AnomalyKind, ComponentRisk, EventDetail, LogEvent } from '../../api/types'
import { BarList } from '../../components/charts'
import Collapse from '../../components/Collapse'
import { SeverityTag, Tally, ViewTag } from '../../components/Ephemera'
import { EmptyNotice, ErrorNotice, SkeletonRows } from '../../components/States'
import { formatClock, formatInt, formatLogDate, formatLogTime, formatPercent, formatScore } from '../../lib/format'
import { bySeverity, viewCopy, viewVar } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const PAGE_SIZE = 20

/** Why a line was flagged: each view's score, its weight, and what the two contribute together. */
function Explanation({ runId, rowIndex, evidenceLimit }: { runId: number; rowIndex: number; evidenceLimit: string | null }) {
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

/** The three view scores as three small bars in the view colours. */
function ViewScores({ event }: { event: LogEvent }) {
  const scores = { semantic: event.semantic_score, structural: event.structural_score, temporal: event.temporal_score }
  return (
    <span className="viewbars" role="img"
      aria-label={Object.entries(scores).map(([view, score]) => `${viewCopy(view).name} ${formatScore(score, 2)}`).join(', ')}>
      {Object.entries(scores).map(([view, score]) => (
        <span key={view} className="viewbars__bar">
          <span style={{ width: `${Math.max(Math.min(score, 1) * 100, 3)}%`, background: viewVar(view) }} />
        </span>
      ))}
    </span>
  )
}

function EventRow({ runId, event, lines, evidenceLimit }: { runId: number; event: LogEvent; lines: number; evidenceLimit: string | null }) {
  const [open, setOpen] = useState(false)
  const panel = `event-${event.row_index}`
  return (
    <li className="event">
      <button type="button" className="event__row" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <span className="event__time">
          <span>{formatLogDate(event.time)}</span>
          <span className="data muted">{formatClock(event.time)}</span>
        </span>
        <span className="event__source">
          <strong>{event.component ?? 'Unknown'}</strong>
          <span className="muted">{event.level}</span>
        </span>
        <span className="event__what">
          <span className="logline event__content">{event.content}</span>
          <span className="muted event__count">
            {lines === 1 ? 'The only flagged line of this kind.' : `Most severe of ${formatInt(lines)} flagged lines of this kind.`}
          </span>
        </span>
        <span className="event__sev">
          <SeverityTag severity={event.severity} />
          <ViewScores event={event} />
        </span>
        <span className="event__toggle">{open ? 'Close' : 'Explain'}</span>
      </button>
      <Collapse open={open} id={panel}><Explanation runId={runId} rowIndex={event.row_index} evidenceLimit={evidenceLimit} /></Collapse>
    </li>
  )
}

export default function EventsSheet() {
  const { run, summary } = useReport()
  const [params, setParams] = useSearchParams()
  const severity = params.get('severity') ?? ''
  const component = params.get('component') ?? ''
  const incident = params.get('incident') ?? ''
  const components = useApi<ComponentRisk[]>(`/runs/${run.id}/components`)

  const query = new URLSearchParams()
  if (severity) query.set('severity', severity)
  if (component) query.set('component', component)
  if (incident) query.set('incident_id', incident)
  const queryString = query.toString()
  const events = usePaged<AnomalyKind>(`/runs/${run.id}/anomaly-kinds${queryString ? `?${queryString}` : ''}`, PAGE_SIZE)

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const limit = run.parameters?.evidence?.max_packages
  const evidenceLimit = limit == null ? null : String(limit)

  return (
    <article className="sheet">
      <header className="sheet__head">
        <h1 className="display">Flagged lines</h1>
        <p className="lede">
          The {formatInt(summary.n_anomalies)} lines that scored above the cutoff, grouped into kinds: lines
          with the same template from the same component. Open the most severe line of each kind to see
          which view flagged it and why.
        </p>
      </header>

      <section className="sheet__section" aria-label="Flagged lines">
        <div className="filters no-print">
          <div className="field">
            <label htmlFor="filter-severity">Severity</label>
            <select id="filter-severity" value={severity} onChange={(e) => setFilter('severity', e.target.value)}>
              <option value="">All</option>
              {Object.keys(summary.severity_counts).sort(bySeverity).reverse().map((s) => (
                <option key={s} value={s}>{s.toLowerCase()} ({formatInt(summary.severity_counts[s])})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-component">Component</label>
            <select id="filter-component" value={component} onChange={(e) => setFilter('component', e.target.value)}>
              <option value="">All</option>
              {(components.data ?? []).filter((c) => c.component).map((c) => (
                <option key={c.component} value={c.component!}>{c.component} ({formatInt(c.anomaly_count)})</option>
              ))}
            </select>
          </div>
          {incident && (
            <p className="filters__chip">
              Incident No. {incident} only
              <button type="button" className="link" onClick={() => setFilter('incident', '')}>Show all incidents</button>
            </p>
          )}
          {events.total !== null && <p className="filters__count muted">{formatInt(events.total)} kinds of line match</p>}
        </div>

        {events.initialLoading && <SkeletonRows rows={6} height="4rem" />}
        {events.total === 0 && (
          <EmptyNotice title="No lines match these filters"><p>Widen the severity or component filter.</p></EmptyNotice>
        )}
        {events.items.length > 0 && (
          <ul className="event-list">
            {events.items.map((kind) => (
              <EventRow key={kind.event.row_index} runId={run.id} event={kind.event} lines={kind.lines} evidenceLimit={evidenceLimit} />
            ))}
          </ul>
        )}
        {events.error && <ErrorNotice error={events.error} onRetry={events.retry} />}
        {events.hasMore && !events.error && (
          <button type="button" className="btn btn--ghost" onClick={events.more} disabled={events.loading}>
            {events.loading ? 'Loading' : `Show ${PAGE_SIZE} more`}
          </button>
        )}
      </section>
    </article>
  )
}
