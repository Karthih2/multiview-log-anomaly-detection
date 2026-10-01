import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi, usePaged } from '../../api/hooks'
import type { Cooccurrence, Incident, IncidentDetail, RootCauseCount } from '../../api/types'
import { BarList } from '../../components/charts'
import { EmptyNotice, ErrorNotice, SkeletonRows } from '../../components/States'
import { formatInt, formatLogTime, formatScore, logSpan } from '../../lib/format'
import { RANKING_FACTORS } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const PAGE_SIZE = 15
const TOP_PAIRS = 8

function Candidates({ runId, incidentId }: { runId: number; incidentId: number }) {
  const detail = useApi<IncidentDetail>(`/runs/${runId}/incidents/${incidentId}`)
  if (detail.loading) return <SkeletonRows rows={2} height="2.5rem" />
  if (detail.error) return <ErrorNotice error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return null
  const candidates = detail.data.root_cause_candidates

  return (
    <div className="incident__detail">
      <h3>Root-cause candidates, most likely first</h3>
      {candidates.length === 1 && (
        <p className="muted">Only one component was involved, so there is nothing to rank against.</p>
      )}
      <div className="table-scroll">
        <table className="candidates">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Component</th>
              <th scope="col" className="num-cell">Score</th>
              {RANKING_FACTORS.map((factor) => <th scope="col" key={factor.key}>{factor.label}</th>)}
              <th scope="col" className="num-cell">Flagged lines</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.component}>
                <td className="num-cell">{candidate.rank}</td>
                <th scope="row">{candidate.component}</th>
                <td className="num-cell">{formatScore(candidate.root_cause_score, 2)}</td>
                {RANKING_FACTORS.map((factor) => (
                  <td key={factor.key}>
                    <span className="factor" role="img" aria-label={`${Math.round(candidate[factor.key] * 100)} out of 100`}>
                      <span style={{ width: `${Math.max(candidate[factor.key] * 100, 2)}%` }} />
                    </span>
                  </td>
                ))}
                <td className="num-cell">{formatInt(candidate.in_cluster_freq)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Each factor is scaled within this incident: the longest bar is the component that leads on it.
      </p>
      <p>
        <Link to={`../events?incident=${incidentId}`} className="link">See this incident's flagged lines</Link>
      </p>
    </div>
  )
}

function IncidentCard({ runId, incident }: { runId: number; incident: Incident }) {
  const [open, setOpen] = useState(false)
  const panel = `incident-${incident.incident_id}`
  return (
    <li className="incident">
      <div className="incident__row">
        <div className="incident__id">
          <span className="data">No. {incident.incident_id}</span>
        </div>
        <div className="incident__when">
          <p>{formatLogTime(incident.start_time)}</p>
          <p className="muted">lasted {logSpan(incident.start_time, incident.end_time)}</p>
        </div>
        <div className="incident__size">
          <p><span className="num">{formatInt(incident.n_anomalies)}</span> flagged lines</p>
          <p className="muted">{incident.components_involved.join(', ')}</p>
        </div>
        <div className="incident__cause">
          <p className="muted">Likely origin</p>
          <p><strong>{incident.top_root_cause ?? 'Not ranked'}</strong></p>
        </div>
        <button type="button" className="btn btn--ghost btn--small" aria-expanded={open} aria-controls={panel}
          onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Candidates'}
        </button>
      </div>
      {open && <div id={panel}><Candidates runId={runId} incidentId={incident.incident_id} /></div>}
    </li>
  )
}

export default function IncidentsSheet() {
  const { run, summary } = useReport()
  const incidents = usePaged<Incident>(`/runs/${run.id}/incidents`, PAGE_SIZE)
  const rootCauses = useApi<RootCauseCount[]>(`/runs/${run.id}/root-causes`)
  const pairs = useApi<Cooccurrence[]>(`/runs/${run.id}/cooccurrence`)

  return (
    <article className="sheet">
      <header className="sheet__head">
        <h1 className="display">Incidents</h1>
        <p className="lede">
          Flagged lines that happened close together are grouped into one incident.
          This run has {formatInt(summary.n_incidents)}, listed largest first.
        </p>
        <p className="muted">
          The likely origin is a ranked guess from timing, severity, frequency and which components fail
          together. It is a place to start looking, not proof of cause.
        </p>
      </header>

      <section className="sheet__section" aria-label="Incident list">
        {incidents.initialLoading && <SkeletonRows rows={5} height="4.5rem" />}
        {incidents.total === 0 && <EmptyNotice title="No incidents"><p>Nothing was flagged in this run.</p></EmptyNotice>}
        {incidents.items.length > 0 && (
          <ul className="incident-list">
            {incidents.items.map((incident) => (
              <IncidentCard key={incident.incident_id} runId={run.id} incident={incident} />
            ))}
          </ul>
        )}
        {incidents.error && <ErrorNotice error={incidents.error} onRetry={incidents.retry} />}
        {incidents.hasMore && !incidents.error && (
          <button type="button" className="btn btn--ghost" onClick={incidents.more} disabled={incidents.loading}>
            {incidents.loading ? 'Loading' : `Show ${Math.min(PAGE_SIZE, (incidents.total ?? 0) - incidents.items.length)} more`}
          </button>
        )}
      </section>

      <div className="sheet__pair">
        <section className="sheet__section">
          <h2>Root-cause clusters</h2>
          <p className="muted">Incidents grouped by the component ranked most likely to be the origin.</p>
          {rootCauses.loading && <SkeletonRows rows={5} height="1.75rem" />}
          {rootCauses.error && <ErrorNotice error={rootCauses.error} onRetry={rootCauses.reload} />}
          {rootCauses.data && (rootCauses.data.length ? (
            <BarList rows={rootCauses.data.map((r) => ({
              key: r.component, label: r.component, value: r.times_ranked_root_cause,
              display: `${formatInt(r.times_ranked_root_cause)} incidents`,
            }))} />
          ) : <p>No incidents to cluster.</p>)}
        </section>

        <section className="sheet__section">
          <h2>Components that fail together</h2>
          <p className="muted">Pairs that appear in the same incident, and in how many.</p>
          {pairs.loading && <SkeletonRows rows={5} height="1.75rem" />}
          {pairs.error && <ErrorNotice error={pairs.error} onRetry={pairs.reload} />}
          {pairs.data && (pairs.data.length ? (
            <BarList labelWidth="13rem" rows={pairs.data.slice(0, TOP_PAIRS).map((p) => ({
              key: `${p.component_a}-${p.component_b}`,
              label: `${p.component_a} + ${p.component_b}`,
              value: p.cooccurrence_count,
            }))} />
          ) : <p>No incident involved more than one component.</p>)}
        </section>
      </div>
    </article>
  )
}
