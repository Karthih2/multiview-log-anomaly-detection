import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi, usePaged } from '../../api/hooks'
import type { AnomalyKind, ComponentRisk, LogEvent } from '../../api/types'
import Collapse from '../../components/Collapse'
import { SeverityTag } from '../../components/Ephemera'
import { EmptyNotice, ErrorNotice, SkeletonRows } from '../../components/States'
import { formatClock, formatInt, formatLogDate, formatScore } from '../../lib/format'
import { bySeverity, viewCopy, viewVar } from '../../lib/vocabulary'
import Explanation from './Explanation'
import Explorer from './Explorer'
import { useReport } from './ReportLayout'

const PAGE_SIZE = 20

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
          The {formatInt(summary.n_anomalies)} lines that scored above the cutoff. First every line, most severe
          first. Below, the same lines grouped into kinds, with an explanation for the worst line of each.
        </p>
      </header>

      <section className="sheet__section" aria-label="All flagged lines">
        <h2>Every flagged line</h2>
        <Explorer runId={run.id} />
      </section>

      <section className="sheet__section" aria-label="Flagged lines by kind">
        <h2>Grouped by kind of line</h2>
        <p className="muted">Lines with the same template from the same component. Open one to see which view flagged it.</p>
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
