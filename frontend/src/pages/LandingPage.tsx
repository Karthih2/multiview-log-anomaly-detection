import { ClockCountdown, TextAa, TreeStructure } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/hooks'
import type { Incident, Page, Run, RunDetail, RunSummary, TimelinePoint } from '../api/types'
import { chooseBucket, TimelineChart } from '../components/charts'
import { Barcode, BinaryField, Count, prefersReducedMotion } from '../components/Ephemera'
import { EmptyNotice, ErrorNotice, SkeletonBlock, SkeletonLines, SkeletonRows } from '../components/States'
import { formatInt, formatLogDate, formatLogTime, formatPercent, formatScore, logSpan, serial } from '../lib/format'
import { stageCopy, viewCopy, viewVar } from '../lib/vocabulary'
import AnimatedContent from '../reactbits/AnimatedContent'
import SplitText from '../reactbits/SplitText'
import '../styles/landing.css'

const HEADLINE = 'Find the lines that do not belong'

/** Scroll reveal that leaves content plainly visible when motion is not wanted. */
function Reveal({ children }: { children: ReactNode }) {
  if (prefersReducedMotion()) return <>{children}</>
  return (
    <AnimatedContent distance={48} duration={0.9} ease="power3.out" threshold={0.15}>
      {children}
    </AnimatedContent>
  )
}

/** The run the page demonstrates with: the largest finished one. */
function pickFeatured(runs: Run[]): Run | null {
  const finished = runs.filter((run) => run.status === 'completed' && run.total_rows)
  return finished.sort((a, b) => (b.total_rows ?? 0) - (a.total_rows ?? 0))[0] ?? null
}

function HeroTicket({ run, summary }: { run: Run; summary: RunSummary | null }) {
  const auc = summary?.test_metrics?.auc_roc
  return (
    <div className="ticket hero-ticket">
      <div className="ticket__body hero-ticket__body">
        <p className="display hero-ticket__spine" aria-hidden="true">LogSight</p>
        <div className="hero-ticket__main">
          <p className="display hero-ticket__admits">Admits</p>
          <p className="display hero-ticket__figure">
            <Count to={run.total_rows ?? 0} duration={1.6} />
          </p>
          <p className="display hero-ticket__admits">log lines</p>
          <p className="hero-ticket__to" aria-hidden="true">to</p>
          <p className="display hero-ticket__title">
            {formatInt(run.n_anomalies)} flagged in {formatInt(run.n_incidents)} incidents
          </p>
        </div>
        {run.time_start && run.time_end && (
          <p className="display hero-ticket__date">
            <span>{formatLogDate(run.time_start).split(' ')[1]}</span>
            <span className="hero-ticket__day">{run.time_start.slice(8, 10)}</span>
            <span>{run.time_start.slice(0, 4)}</span>
            <span className="hero-ticket__until">until {formatLogDate(run.time_end)}</span>
          </p>
        )}
      </div>
      <div className="ticket__stub hero-ticket__stub">
        <div>
          <Barcode value={`run-${run.id}-${run.created_at}`} bars={32} />
          <p className="data hero-ticket__serial">RUN{serial(run.id)}</p>
        </div>
        {auc != null && (
          <p>
            <span className="display hero-ticket__auc">{formatScore(auc)}</span>
            <span className="hero-ticket__auc-label">ranking quality against the log's own labels (AUC-ROC)</span>
          </p>
        )}
        <Link to={`/runs/${run.id}`} className="hero-ticket__link">Open this report</Link>
      </div>
    </div>
  )
}

const VIEW_ICONS: Record<string, Icon> = { semantic: TextAa, structural: TreeStructure, temporal: ClockCountdown }

function ViewRows({ detail }: { detail: RunDetail | null }) {
  const names = detail?.view_summary ? Object.keys(detail.view_summary) : Object.keys(VIEW_ICONS)
  return (
    <ul className="view-rows">
      {names.map((view) => {
        const copy = viewCopy(view)
        const ViewIcon = VIEW_ICONS[view]
        const weight = detail?.view_summary?.[view]?.mean_weight
        return (
          <li key={view} className="view-row">
            <div className="stamp view-row__stamp" style={{ '--stamp-colour': viewVar(view) } as CSSProperties}>
              <div className="stamp__face">
                {ViewIcon && <ViewIcon size={44} weight="fill" aria-hidden="true" />}
                <p>
                  {weight != null && <span className="display view-row__weight">{Math.round(weight * 100)}</span>}
                  <span className="caps">{weight != null ? 'percent weight' : copy.name}</span>
                </p>
              </div>
            </div>
            <div className="view-row__text">
              <h3>{copy.name}: {copy.reads.toLowerCase()}</h3>
              <p>{copy.catches}</p>
              <p className="muted">{copy.detector}.</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const ROUTE: { title: string; stages: string[] }[] = [
  { title: 'Read', stages: ['ingest', 'parse', 'split'] },
  { title: 'Look three ways', stages: ['features', 'scoring'] },
  { title: 'Decide', stages: ['fusion', 'threshold', 'drift'] },
  { title: 'Explain', stages: ['evidence', 'root_cause'] },
]

function Demo({ run }: { run: Run }) {
  const bucket = chooseBucket(run.time_start, run.time_end)
  const timeline = useApi<TimelinePoint[]>(`/runs/${run.id}/timeline?bucket=${bucket}`)
  const incidents = useApi<Page<Incident>>(`/runs/${run.id}/incidents?limit=3`)
  return (
    <div className="demo">
      <div className="demo__chart">
        <h3>Flagged lines per {bucket}, by severity</h3>
        {timeline.loading && <SkeletonBlock height="17.5rem" />}
        {timeline.error && <ErrorNotice error={timeline.error} onRetry={timeline.reload} />}
        {timeline.data && <TimelineChart points={timeline.data} bucket={bucket} />}
      </div>
      <div className="demo__incidents">
        <h3>Its three largest incidents</h3>
        {incidents.loading && <SkeletonRows rows={3} height="4rem" />}
        {incidents.error && <ErrorNotice error={incidents.error} onRetry={incidents.reload} />}
        <ul>
          {incidents.data?.items.map((incident) => (
            <li key={incident.incident_id}>
              <p className="data demo__when">{formatLogTime(incident.start_time)}</p>
              <p>
                <span className="num">{formatInt(incident.n_anomalies)}</span> flagged lines
                over {logSpan(incident.start_time, incident.end_time)}
              </p>
              <p className="muted">Likely origin: <strong>{incident.top_root_cause ?? 'not ranked'}</strong></p>
            </li>
          ))}
        </ul>
        <Link to={`/runs/${run.id}`} className="btn btn--ghost">Read the full report</Link>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const runs = useApi<Page<Run>>('/runs')
  const featured = runs.data ? pickFeatured(runs.data.items) : null
  const detail = useApi<RunDetail>(featured ? `/runs/${featured.id}` : null)
  const summary = useApi<RunSummary>(featured ? `/runs/${featured.id}/summary` : null)

  return (
    <>
      <section className="hero">
        <div className="page hero__inner">
          <div className="hero__copy">
            {prefersReducedMotion() ? (
              <h1 className="display hero__title">{HEADLINE}</h1>
            ) : (
              <SplitText tag="h1" text={HEADLINE} className="display hero__title"
                splitType="words" delay={60} duration={0.9} ease="power3.out" from={{ opacity: 0, y: 40 }}
                to={{ opacity: 1, y: 0 }} textAlign="left" />
            )}
            <p className="lede">
              LogSight reads raw system logs three ways at once and tells you what broke, when, and
              where to look first.
            </p>
            <div className="hero__actions">
              <Link to="/upload" className="btn">Upload a log</Link>
              <a href="#demo" className="btn btn--ghost">See a real run</a>
            </div>
          </div>
          <div className="hero__ticket">
            <BinaryField seed={featured ? `run-${featured.id}` : 'logsight'} />
            {runs.loading && <SkeletonBlock height="22rem" />}
            {runs.error && <ErrorNotice error={runs.error} onRetry={runs.reload} title="No run to show yet" />}
            {runs.data && !featured && (
              <EmptyNotice title="No finished run yet">
                <p>Upload a log and its figures will be printed here.</p>
              </EmptyNotice>
            )}
            {featured && <HeroTicket run={featured} summary={summary.data} />}
          </div>
        </div>
      </section>

      <section className="band" id="how">
        <div className="page band__split">
          <Reveal>
            <div className="band__intro stack">
              <h2 className="display">Three readings of every line</h2>
              <p className="lede">
                A single detector misses what it was not built to see. LogSight scores each line three
                separate ways, then blends the scores by how far each one can be trusted for that line.
              </p>
              <p className="muted">
                {detail.data?.view_summary
                  ? `The figure on each stamp is that view's average weight in run No. ${serial(detail.data.id)}.`
                  : 'Each view gets a weight per line. The three weights always add up to 100 percent.'}
              </p>
            </div>
          </Reveal>
          <Reveal>
            {detail.loading ? <SkeletonRows rows={3} height="9rem" /> : <ViewRows detail={detail.data} />}
          </Reveal>
        </div>
      </section>

      <section className="band">
        <div className="page">
          <Reveal>
            <h2 className="display">From file to verdict</h2>
            <p className="lede route__lede">
              One pass, in a fixed order. The receipt you watch after uploading prints these same
              stages as they finish.
            </p>
            <ol className="route">
              {ROUTE.map((leg) => (
                <li key={leg.title} className="route__leg">
                  <h3 className="display">{leg.title}</h3>
                  <ol>
                    {leg.stages.map((stage) => (
                      <li key={stage}>
                        <strong>{stageCopy(stage).label}</strong>
                        <span className="route__lead" aria-hidden="true" />
                        <span>{stageCopy(stage).detail}</span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section className="band" id="demo">
        <div className="page">
          <div className="stack band__head">
            <h2 className="display">A real run, printed in full</h2>
            {featured ? (
              <p className="lede">
                Run No. {serial(featured.id)} read {formatInt(featured.total_rows)} lines,
                of which {formatPercent((featured.n_anomalies ?? 0) / (featured.total_rows || 1))} were
                flagged. These are its stored results, not a mock-up.
              </p>
            ) : (
              <p className="lede">Finished runs are shown here with their stored results.</p>
            )}
          </div>
          {runs.loading && <SkeletonLines widths={['80%', '60%']} />}
          {featured && <Demo run={featured} />}
          {runs.data && !featured && (
            <EmptyNotice title="Nothing to show yet">
              <p>No run has finished. Upload a log to create one.</p>
              <Link to="/upload" className="btn">Upload a log</Link>
            </EmptyNotice>
          )}
        </div>
      </section>

      <section className="band">
        <div className="page band__split">
          <div className="stack">
            <h2 className="display">What it will not tell you</h2>
            <p className="lede">Worth knowing before you rely on it.</p>
          </div>
          <ul className="limits">
            <li><strong>One log format.</strong> It reads BlueGene/L (BGL) logs today.</li>
            <li><strong>Batch only.</strong> You upload a file and wait. It does not watch a live stream.</li>
            <li><strong>Candidates, not causes.</strong> Root-cause ranking uses timing and co-occurrence. It has no map of how your services depend on each other.</li>
            <li><strong>Some false alarms.</strong> Rare but harmless events can be flagged, as with any detector that learns without labels.</li>
          </ul>
        </div>
      </section>

      <section className="band band--close">
        <div className="page">
          <BinaryField seed="admit one log" rows={5} columns={90} />
          <div className="ticket ticket--paper close-ticket">
            <div className="ticket__body">
              <h2 className="display">Have a log that looks wrong?</h2>
              <p className="lede">Hand it in. The receipt prints while the pipeline runs.</p>
            </div>
            <div className="ticket__stub">
              <Barcode value="admit one log" bars={30} />
              <Link to="/upload" className="btn">Upload a log</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
