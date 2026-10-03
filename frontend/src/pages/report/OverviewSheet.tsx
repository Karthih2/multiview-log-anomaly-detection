import { Database, Fire, Flag, Hash } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../../api/hooks'
import type { Incident, Page, ScoreBucket } from '../../api/types'
import { ScoreChart, SeverityDonut } from '../../components/dashcharts'
import { Count, SeverityTag } from '../../components/Ephemera'
import Reveal from '../../components/Reveal'
import { EmptyNotice, ErrorNotice, SkeletonBlock, SkeletonRows } from '../../components/States'
import Tile from '../../components/Tile'
import { formatInt, formatLogDate, formatLogTime, formatPercent, logSpan } from '../../lib/format'
import { useReport } from './ReportLayout'

const TOP_INCIDENTS = 12
const SHOWN_CARDS = 5

function Kpi({ icon: KpiIcon, label, children, note, tone }: {
  icon: Icon
  label: string
  children: ReactNode
  note?: string
  tone: 'peri' | 'crimson' | 'latte'
}) {
  return (
    <Reveal className="bento__cell bento__cell--kpi">
      <div className={`kpi kpi--${tone}`}>
        <div className="kpi__top">
          <span className="kpi__icon" aria-hidden="true"><KpiIcon size={20} weight="duotone" /></span>
          <span className="kpi__label">{label}</span>
        </div>
        <p className="kpi__value">{children}</p>
        {note && <p className="kpi__note">{note}</p>}
      </div>
    </Reveal>
  )
}

/** The first tab: the headline numbers, the score over time and how serious the flags were. */
export default function OverviewSheet() {
  const { run, summary } = useReport()
  const navigate = useNavigate()
  const scores = useApi<ScoreBucket[]>(`/runs/${run.id}/score-timeline?points=120`)
  const incidents = useApi<Page<Incident>>(`/runs/${run.id}/incidents?limit=${TOP_INCIDENTS}`)
  const items = incidents.data?.items ?? []
  const skipped = Math.max(0, (run.raw_rows ?? 0) - summary.total_rows)

  return (
    <article className="dash">
      <header className="dash__head">
        <div>
          <p className="caps">Overview</p>
          <h1 className="dash__title">{run.name}</h1>
          <p className="muted">
            Log from {formatLogDate(summary.time_start)} to {formatLogDate(summary.time_end)}
            {run.finished_at ? `. Processed ${formatLogDate(run.finished_at)}.` : '.'}
          </p>
        </div>
        <div className="dash__actions no-print">
          <Link to="summary" className="btn btn--ghost btn--small">Printable summary</Link>
          <Link to="/upload" className="btn btn--small">Analyse another log</Link>
        </div>
      </header>

      <div className="bento">
        <Kpi icon={Database} tone="peri" label="Readable lines" note={skipped > 0 ? `${formatInt(skipped)} lines skipped (no message)` : 'Every line had a message'}>
          <Count to={summary.total_rows} />
        </Kpi>
        <Kpi icon={Flag} tone="crimson" label="Flagged lines" note={`${formatPercent(summary.anomaly_rate)} of all lines`}>
          <Count to={summary.n_anomalies} />
        </Kpi>
        <Kpi icon={Fire} tone="latte" label="Incidents" note="Flagged lines close together in time">
          <Count to={summary.n_incidents} />
        </Kpi>
        <Kpi icon={Hash} tone="peri" label="Templates" note="Distinct line shapes found">
          <Count to={summary.n_templates} />
        </Kpi>

        <Tile title="Anomaly timeline" span={8}
          hint="Worst score per slice of the log. Select an incident marker to open it.">
          {(scores.loading || incidents.loading) && <SkeletonBlock height="19rem" />}
          {scores.error && <ErrorNotice error={scores.error} onRetry={scores.reload} />}
          {scores.data && incidents.data && (
            <ScoreChart buckets={scores.data} incidents={items} selected={null}
              onSelect={(id) => navigate(`incidents?incident=${id}`)}
              trainEndRow={run.train_end_idx} driftRow={null} />
          )}
        </Tile>

        <Tile title="Severity" span={4} hint="How serious the flagged lines are">
          <SeverityDonut counts={summary.severity_counts} />
        </Tile>

        <Tile title="Top incidents" span={12} hint="The largest groups of flagged lines"
          action={<Link to="incidents" className="link">All {formatInt(summary.n_incidents)} incidents</Link>}>
          {incidents.loading && <SkeletonRows rows={2} height="6rem" />}
          {incidents.error && <ErrorNotice error={incidents.error} onRetry={incidents.reload} />}
          {incidents.data && !items.length && <EmptyNotice title="No incidents"><p>Nothing was flagged in this run.</p></EmptyNotice>}
          {items.length > 0 && (
            <ul className="incident-cards">
              {items.slice(0, SHOWN_CARDS).map((incident) => (
                <li key={incident.incident_id}>
                  <Link to={`incidents?incident=${incident.incident_id}`} className="incident-card">
                    <span className="incident-card__top">
                      <span className="data">No. {incident.incident_id}</span>
                      {incident.peak_severity && <SeverityTag severity={incident.peak_severity} />}
                    </span>
                    <span className="incident-card__when">{formatLogTime(incident.start_time)}</span>
                    <span><span className="num">{formatInt(incident.n_anomalies)}</span> lines over {logSpan(incident.start_time, incident.end_time)}</span>
                    <span className="muted">Origin <strong>{incident.top_root_cause ?? 'not ranked'}</strong></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </article>
  )
}
