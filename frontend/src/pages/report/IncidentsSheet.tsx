import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi, usePaged } from '../../api/hooks'
import type { Cooccurrence, Incident, RootCauseCluster } from '../../api/types'
import { BarList, ShareBar } from '../../components/charts'
import ClusterMap from '../../components/ClusterMap'
import Collapse from '../../components/Collapse'
import { SeverityTag } from '../../components/Ephemera'
import Reveal from '../../components/Reveal'
import { EmptyNotice, ErrorNotice, SkeletonBlock, SkeletonRows } from '../../components/States'
import Tile from '../../components/Tile'
import { formatInt, formatLogDate, formatLogTime, formatPercent, formatScore, logSpan } from '../../lib/format'
import IncidentFocus from './IncidentFocus'
import { useReport } from './ReportLayout'

const PAGE_SIZE = 12
const TOP_PAIRS = 8
/** Cluster colours cycle through the palette; the name is always in the table row too. */
const CLUSTER_COLOURS = ['var(--crimson)', 'var(--peri-deep)', 'var(--view-temporal)', 'var(--view-structural)', 'var(--sev-medium)', 'var(--peri)']

function ClusterRow({ cluster, index, total, maxIncidents, onOpen }: {
  cluster: RootCauseCluster
  index: number
  total: number
  maxIncidents: number
  onOpen: (incidentId: number) => void
}) {
  const [open, setOpen] = useState(false)
  const panel = `cluster-${index}`
  return (
    <>
      <tr className={open ? 'cluster is-open' : 'cluster'}>
        <th scope="row">
          <span className="cluster__name">
            <span className="cluster__swatch" style={{ background: CLUSTER_COLOURS[index % CLUSTER_COLOURS.length] }} aria-hidden="true" />
            {cluster.component}
          </span>
        </th>
        <td>
          <span className="cluster__size">
            <span className="num cluster__count">{formatInt(cluster.n_incidents)}</span>
            <span className="cluster__bar"><span style={{
              width: `${Math.max((cluster.n_incidents / maxIncidents) * 100, 3)}%`,
              background: CLUSTER_COLOURS[index % CLUSTER_COLOURS.length],
            }} /></span>
            <span className="muted num">{formatPercent(total ? cluster.n_incidents / total : 0, 0)}</span>
          </span>
        </td>
        <td className="num-cell">{formatInt(cluster.n_anomalies)}</td>
        <td className="num-cell">{formatScore(cluster.avg_severity, 2)}</td>
        <td className="num-cell">{formatScore(cluster.avg_root_cause_score, 2)}</td>
        <td className="nowrap">{formatLogDate(cluster.first_time)}{cluster.first_time.slice(0, 10) !== cluster.last_time.slice(0, 10) && <> to {formatLogDate(cluster.last_time)}</>}</td>
        <td>{cluster.co_components.length ? cluster.co_components.join(', ') : <span className="muted">only itself</span>}</td>
        <td>
          <button type="button" className="link" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Members'}
          </button>
        </td>
      </tr>
      <tr className="cluster__members-row">
        <td colSpan={8}>
          <Collapse open={open} id={panel}>
            <div className="cluster__members">
              <p className="caps">Largest incidents in this cluster</p>
              <ul>
                {cluster.incidents.slice(0, 8).map((incident) => (
                  <li key={incident.incident_id}>
                    <button type="button" className="link" onClick={() => onOpen(incident.incident_id)}>No. {incident.incident_id}</button>
                    <span className="data">{formatLogTime(incident.start_time)}</span>
                    <span className="muted"><span className="num">{formatInt(incident.n_anomalies)}</span> lines</span>
                  </li>
                ))}
              </ul>
            </div>
          </Collapse>
        </td>
      </tr>
    </>
  )
}

function IncidentPick({ incident, active, onPick }: { incident: Incident; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button type="button" className={active ? 'incident-pick__row is-active' : 'incident-pick__row'}
        aria-pressed={active} onClick={onPick}>
        <span className="incident-pick__main">
          <span className="data">No. {incident.incident_id}</span>
          {incident.peak_severity && <SeverityTag severity={incident.peak_severity} />}
        </span>
        <span className="incident-pick__when">{formatLogTime(incident.start_time)}</span>
        <span className="incident-pick__meta muted">
          <span className="num">{formatInt(incident.n_anomalies)}</span> lines, {logSpan(incident.start_time, incident.end_time)}.
          Origin <strong>{incident.top_root_cause ?? 'not ranked'}</strong>
        </span>
      </button>
    </li>
  )
}

export default function IncidentsSheet() {
  const { run, summary } = useReport()
  const [params, setParams] = useSearchParams()
  const clusters = useApi<RootCauseCluster[]>(`/runs/${run.id}/root-cause-clusters?members=40`)
  const [mode, setMode] = useState<'table' | 'map'>('table')
  const pairs = useApi<Cooccurrence[]>(`/runs/${run.id}/cooccurrence`)
  const incidents = usePaged<Incident>(`/runs/${run.id}/incidents`, PAGE_SIZE)
  const chosen = params.get('incident')
  const active = chosen ? Number(chosen) : incidents.items[0]?.incident_id ?? null

  const open = (id: number) => {
    setParams({ incident: String(id) }, { replace: true })
    document.getElementById('incident-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const list = clusters.data ?? []
  const maxIncidents = Math.max(...list.map((c) => c.n_incidents), 1)

  return (
    <article className="dash">
      <header className="dash__head">
        <div>
          <p className="caps">Incidents</p>
          <h1 className="dash__title">{formatInt(summary.n_incidents)} incidents</h1>
          <p className="muted">
            Flagged lines that happened close together form an incident. Incidents that point at the same
            likely origin are grouped into clusters. A likely origin is a ranked guess, not proof.
          </p>
        </div>
      </header>

      <div className="bento">
        <Tile title="Root-cause clusters" span={12}
          hint="Incidents grouped by the component ranked most likely to be their origin, largest cluster first."
          action={
            <div className="seg no-print" role="group" aria-label="Cluster view">
              <button type="button" className={mode === 'table' ? 'seg__btn is-on' : 'seg__btn'} aria-pressed={mode === 'table'}
                onClick={() => setMode('table')}>Table</button>
              <button type="button" className={mode === 'map' ? 'seg__btn is-on' : 'seg__btn'} aria-pressed={mode === 'map'}
                onClick={() => setMode('map')}>2D map</button>
            </div>
          }>
          {clusters.loading && <SkeletonRows rows={5} height="3rem" />}
          {clusters.error && <ErrorNotice error={clusters.error} onRetry={clusters.reload} />}
          {clusters.data && !list.length && <EmptyNotice title="No clusters"><p>No incident was ranked in this run.</p></EmptyNotice>}
          {list.length > 0 && (
            <>
              <div className="cluster-share">
                <p className="caps">Share of incidents</p>
                <ShareBar parts={list.slice(0, 6).map((c, i) => ({
                  key: c.component, label: c.component, share: c.n_incidents / summary.n_incidents,
                  colour: CLUSTER_COLOURS[i % CLUSTER_COLOURS.length],
                }))} />
              </div>
              {mode === 'map' && (
                <ClusterMap clusters={list} colours={CLUSTER_COLOURS} totalIncidents={summary.n_incidents} onOpen={open} />
              )}
              {mode === 'table' && (
              <div className="table-scroll">
                <table className="clusters">
                  <thead>
                    <tr>
                      <th scope="col">Cluster</th>
                      <th scope="col">Incidents</th>
                      <th scope="col" className="num-cell">Flagged lines</th>
                      <th scope="col" className="num-cell">Avg severity</th>
                      <th scope="col" className="num-cell">Origin score</th>
                      <th scope="col">Active</th>
                      <th scope="col">Fails together with</th>
                      <th scope="col"><span className="sr-only">Members</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((cluster, index) => (
                      <ClusterRow key={cluster.component} cluster={cluster} index={index} total={summary.n_incidents}
                        maxIncidents={maxIncidents} onOpen={open} />
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              {mode === 'table' && (
                <p className="muted cluster__note">
                  Avg severity and origin score run from 0 to 1. Origin score is how strongly the ranking favours this component.
                </p>
              )}
            </>
          )}
        </Tile>

        <Tile title="Incidents" span={5} hint="Largest first. Select one to inspect.">
          {incidents.initialLoading && <SkeletonRows rows={6} height="3.5rem" />}
          {incidents.error && <ErrorNotice error={incidents.error} onRetry={incidents.retry} />}
          {incidents.total === 0 && <EmptyNotice title="No incidents"><p>Nothing was flagged in this run.</p></EmptyNotice>}
          {incidents.items.length > 0 && (
            <ul className="incident-pick">
              {incidents.items.map((incident) => (
                <IncidentPick key={incident.incident_id} incident={incident} active={incident.incident_id === active}
                  onPick={() => setParams({ incident: String(incident.incident_id) }, { replace: true })} />
              ))}
            </ul>
          )}
          {incidents.hasMore && !incidents.error && (
            <button type="button" className="btn btn--ghost btn--small" onClick={incidents.more} disabled={incidents.loading}>
              {incidents.loading ? 'Loading' : `Show ${Math.min(PAGE_SIZE, (incidents.total ?? 0) - incidents.items.length)} more`}
            </button>
          )}
        </Tile>

        <div id="incident-detail" className="bento__cell bento__cell--7">
          <Reveal>
            <section className="tile">
              <header className="tile__head">
                <div>
                  <h2 className="tile__title">Incident detail</h2>
                  <p className="tile__hint">Why it was flagged and where to look first</p>
                </div>
              </header>
              {active === null ? <SkeletonBlock height="20rem" /> : <IncidentFocus key={active} runId={run.id} incidentId={active} />}
            </section>
          </Reveal>
        </div>

        <Tile title="Components that fail together" span={12} hint="Pairs that appear in the same incident, and in how many">
          {pairs.loading && <SkeletonRows rows={5} height="1.75rem" />}
          {pairs.error && <ErrorNotice error={pairs.error} onRetry={pairs.reload} />}
          {pairs.data && (pairs.data.length ? (
            <BarList labelWidth="14rem" rows={pairs.data.slice(0, TOP_PAIRS).map((p) => ({
              key: `${p.component_a}-${p.component_b}`, label: `${p.component_a} + ${p.component_b}`, value: p.cooccurrence_count,
              display: `${formatInt(p.cooccurrence_count)} incidents`,
            }))} />
          ) : <p>No incident involved more than one component.</p>)}
        </Tile>
      </div>
    </article>
  )
}
