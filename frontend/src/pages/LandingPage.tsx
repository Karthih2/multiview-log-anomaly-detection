import {
  ArrowsMerge, ChartLineUp, ChatCircleText, ClockCountdown, FileText, Scan, TextAa, TreeStructure, Warning,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/hooks'
import type { Incident, Page, Run, RunDetail, ScoreBucket } from '../api/types'
import { ScoreChart } from '../components/dashcharts'
import { Barcode, BinaryField, Count, prefersReducedMotion, SeverityTag } from '../components/Ephemera'
import GlitchField from '../components/GlitchField'
import Reveal from '../components/Reveal'
import { EmptyNotice, ErrorNotice, SkeletonBlock, SkeletonRows } from '../components/States'
import { formatInt, formatLogDate, formatLogTime, formatPercent, logSpan, serial } from '../lib/format'
import { useInView } from '../lib/useInView'
import { stageCopy, viewCopy, viewVar } from '../lib/vocabulary'
import DecryptedText from '../reactbits/DecryptedText'
import '../styles/landing.css'

/** A run this long covers the whole BGL log (4.7M lines) rather than a 50,000-line sample. */
const FULL_LOG_MIN_LINES = 1_000_000

const isFullLog = (run: Run | null) => (run?.total_rows ?? 0) >= FULL_LOG_MIN_LINES

/** The run the page demonstrates with: the full BGL run when there is one (newest first),
 *  otherwise the largest finished run. */
function pickFeatured(runs: Run[]): Run | null {
  const finished = runs.filter((run) => run.status === 'completed' && run.total_rows)
  const full = finished.filter(isFullLog)
  const pool = full.length ? full : finished
  return [...pool].sort((a, b) => (b.total_rows ?? 0) - (a.total_rows ?? 0) || b.id - a.id)[0] ?? null
}

interface PipeNode {
  icon: Icon
  label: string
  note: string
  step: number
}

const PIPE_START: PipeNode = { icon: FileText, label: 'Your logs', note: 'Any BGL file', step: 0 }
const PIPE_READ: PipeNode = { icon: Scan, label: 'Read', note: 'Find the pattern', step: 1 }
const PIPE_VIEWS: PipeNode[] = [
  { icon: ChatCircleText, label: 'Meaning', note: 'What it says', step: 2 },
  { icon: TreeStructure, label: 'Structure', note: "How it's built", step: 3 },
  { icon: ClockCountdown, label: 'Timing', note: 'When it comes', step: 4 },
]
const PIPE_END: PipeNode[] = [
  { icon: ArrowsMerge, label: 'Fuse', note: 'One score', step: 5 },
  { icon: ChartLineUp, label: 'Cutoff', note: 'Too high?', step: 6 },
  { icon: Warning, label: 'Incidents', note: 'Ranked, explained', step: 7 },
]

function PipeBox({ node, index, tone = 'plain' }: { node: PipeNode; index: number; tone?: 'start' | 'plain' }) {
  const NodeIcon = node.icon
  return (
    <Reveal className="pipe__reveal" delay={0.05 * index} distance={14} duration={0.45}>
      <div className={`pipe__node pipe__node--${tone}`} style={{ '--n': node.step } as CSSProperties}>
        <NodeIcon size={30} weight="regular" aria-hidden="true" />
        <p className="pipe__label">{node.label}</p>
        <p className="pipe__note">{node.note}</p>
      </div>
    </Reveal>
  )
}

const PipeLink = () => <span className="pipe__link" aria-hidden="true" />

/** The pipeline as boxes: logs in, three views in parallel, one score, a cutoff, ranked incidents out. */
function PipelineFlow() {
  return (
    <div className="pipe" role="img"
      aria-label="Your logs are read, scored three ways at once for meaning, structure and timing, fused into one score, cut off, and turned into ranked incidents.">
      <PipeBox node={PIPE_START} index={0} tone="start" />
      <PipeLink />
      <PipeBox node={PIPE_READ} index={1} />
      <PipeLink />
      <div className="pipe__group">
        <p className="pipe__group-label">3 views at once</p>
        <div className="pipe__views">
          {PIPE_VIEWS.map((node, i) => <PipeBox key={node.label} node={node} index={2 + i} />)}
        </div>
      </div>
      {PIPE_END.map((node, i) => (
        <span key={node.label} className="pipe__tail">
          <PipeLink />
          <PipeBox node={node} index={5 + i} />
        </span>
      ))}
    </div>
  )
}

function HeroTicket({ run }: { run: Run }) {
  return (
    <div className="ticket hero-ticket">
      <div className="ticket__body hero-ticket__body">
        <p className="display hero-ticket__spine" aria-hidden="true">LogSight</p>
        <div className="hero-ticket__main">
          <p className="display hero-ticket__admits">Admits</p>
          <p className="display hero-ticket__figure"><Count to={run.total_rows ?? 0} duration={1.2} /></p>
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
        <Link to={`/runs/${run.id}`} className="hero-ticket__link">Open this dashboard</Link>
      </div>
    </div>
  )
}

const VIEW_ICONS: Record<string, Icon> = { semantic: TextAa, structural: TreeStructure, temporal: ClockCountdown }

function ViewRows({ detail }: { detail: RunDetail | null }) {
  const names = detail?.view_summary ? Object.keys(detail.view_summary) : Object.keys(VIEW_ICONS)
  return (
    <ul className="view-rows">
      {names.map((view, index) => {
        const copy = viewCopy(view)
        const ViewIcon = VIEW_ICONS[view]
        const weight = detail?.view_summary?.[view]?.mean_weight
        return (
          <li key={view} className="view-row">
            <Reveal className="view-row__grid" delay={index * 0.12}>
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
            </Reveal>
          </li>
        )
      })}
    </ul>
  )
}

const ROUTE: { title: string; blurb: string; stages: string[] }[] = [
  { title: 'Read', blurb: 'The file is cleaned, sorted by time, and every line is reduced to its template.', stages: ['ingest', 'parse', 'split'] },
  { title: 'Look three ways', blurb: 'Meaning, structure and timing each get their own detector and their own score.', stages: ['features', 'scoring'] },
  { title: 'Decide', blurb: 'The scores are blended by reliability, and a moving cutoff flags the outliers.', stages: ['fusion', 'threshold', 'drift'] },
  { title: 'Explain', blurb: 'Flags are grouped into incidents, each with evidence and a ranked likely origin.', stages: ['evidence', 'root_cause'] },
]

/** One step of the flow: its node and the line down to the next fill in as it scrolls into view. */
function FlowStep({ index, step }: { index: number; step: (typeof ROUTE)[number] }) {
  const [ref, seen] = useInView<HTMLLIElement>(0.35)
  return (
    <li ref={ref} className={seen ? 'flow__step is-on' : 'flow__step'}>
      <div className="flow__rail" aria-hidden="true">
        <span className="flow__node num">{String(index + 1).padStart(2, '0')}</span>
        {index < ROUTE.length - 1 && <span className="flow__line" />}
      </div>
      <Reveal className="flow__card" delay={0.05}>
        <h3 className="display">{step.title}</h3>
        <p className="flow__blurb">{step.blurb}</p>
        <ul className="flow__stages">
          {step.stages.map((stage) => (
            <li key={stage}>
              <strong>{stageCopy(stage).label}</strong>
              <span className="muted">{stageCopy(stage).detail}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </li>
  )
}

function Demo({ run }: { run: Run }) {
  const scores = useApi<ScoreBucket[]>(`/runs/${run.id}/score-timeline?points=120`)
  const incidents = useApi<Page<Incident>>(`/runs/${run.id}/incidents?limit=8`)
  return (
    <div className="demo">
      <div className="demo__chart">
        <h3>Worst anomaly score across the log</h3>
        {(scores.loading || incidents.loading) && <SkeletonBlock height="19rem" />}
        {scores.error && <ErrorNotice error={scores.error} onRetry={scores.reload} />}
        {scores.data && incidents.data && (
          <ScoreChart buckets={scores.data} incidents={incidents.data.items} selected={null} onSelect={() => undefined}
            trainEndRow={run.train_end_idx} driftRow={null} />
        )}
      </div>
      <div className="demo__incidents">
        <h3>Its three largest incidents</h3>
        {incidents.loading && <SkeletonRows rows={3} height="4rem" />}
        <ul>
          {incidents.data?.items.slice(0, 3).map((incident) => (
            <li key={incident.incident_id}>
              <p className="demo__when">
                <span className="data">{formatLogTime(incident.start_time)}</span>
                {incident.peak_severity && <SeverityTag severity={incident.peak_severity} />}
              </p>
              <p><span className="num">{formatInt(incident.n_anomalies)}</span> flagged lines over {logSpan(incident.start_time, incident.end_time)}</p>
              <p className="muted">Likely origin: <strong>{incident.top_root_cause ?? 'not ranked'}</strong></p>
            </li>
          ))}
        </ul>
        <Link to={`/runs/${run.id}`} className="btn btn--ghost">Open the dashboard</Link>
      </div>
    </div>
  )
}

const LIMITS: [string, string][] = [
  ['One log format', 'It reads BlueGene/L (BGL) logs today.'],
  ['Batch only', 'You upload a file and wait. It does not watch a live stream.'],
  ['Candidates, not causes', 'Root-cause ranking uses timing and co-occurrence. It has no map of how your services depend on each other.'],
  ['Some false alarms', 'Rare but harmless events can be flagged, as with any detector that learns without labels.'],
]

export default function LandingPage() {
  const runs = useApi<Page<Run>>('/runs?limit=500')
  const featured = runs.data ? pickFeatured(runs.data.items) : null
  const full = isFullLog(featured)
  const detail = useApi<RunDetail>(featured ? `/runs/${featured.id}` : null)
  const still = prefersReducedMotion()

  return (
    <>
      <section className="intro">
        <GlitchField className="intro__glitch" speed={90} />
        <div className="page intro__inner">
          <Reveal className="intro__copy" distance={16}>
            <p className="caps">Multi-view log anomaly detection</p>
            <h1 className="display intro__title" aria-label="LogSight">
              {still ? 'LogSight' : (
                <DecryptedText text="LogSight" animateOn="view" sequential speed={55} maxIterations={14}
                  revealDirection="start" characters="01#%&@/\\<>[]{}=+*" />
              )}
            </h1>
            <p className="lede intro__lede">
              Upload a raw BlueGene/L log. LogSight reads every line three ways, blends the scores,
              flags what does not belong, groups the flags into incidents, and ranks where to look first.
            </p>
            <div className="hero__actions intro__actions">
              <Link to="/upload" className="btn">Upload a log</Link>
              <a href="#how" className="btn btn--ghost">See how it works</a>
            </div>
          </Reveal>
          <Reveal className="intro__flow" distance={20} delay={0.15}>
            <PipelineFlow />
            <p className="muted intro__flowcap">Every log goes through the same steps, in this order.</p>
          </Reveal>
        </div>
      </section>

      <section className="band" id="how">
        <div className="page">
          <Reveal className="band__head">
            <p className="caps">How it works</p>
            <h2 className="display">From file to verdict</h2>
            <p className="lede">Four steps, one pass. The receipt you watch after uploading prints these same stages as they finish.</p>
          </Reveal>
          <ol className="flow">
            {ROUTE.map((step, index) => <FlowStep key={step.title} index={index} step={step} />)}
          </ol>
        </div>
      </section>

      <section className="band band--tint">
        <div className="page band__split">
          <Reveal className="band__intro stack">
            <p className="caps">Three readings</p>
            <h2 className="display">One line, three opinions</h2>
            <p className="lede">
              A single detector misses what it was not built to see. Each line is scored three separate ways,
              then blended by how far each can be trusted for that line.
            </p>
            <p className="muted">
              {detail.data?.view_summary
                ? full
                  ? `The figure on each stamp is that view's average weight across all ${formatInt(detail.data.total_rows)} lines of the full BGL log.`
                  : `The figure on each stamp is that view's average weight in run No. ${serial(detail.data.id)}.`
                : 'Each view gets a weight per line. The three weights always add up to 100 percent.'}
            </p>
          </Reveal>
          {detail.loading ? <SkeletonRows rows={3} height="9rem" /> : <ViewRows detail={detail.data} />}
        </div>
      </section>

      <section className="band" id="demo">
        <div className="page">
          <Reveal className="band__head">
            <p className="caps">{full ? 'Full BGL log' : 'Live example'}</p>
            <h2 className="display">{full ? 'The whole log, end to end' : 'A real run, in full'}</h2>
            {featured && full ? (
              <p className="lede">
                All {formatInt(featured.total_rows)} lines of the BlueGene/L log
                {featured.time_start && featured.time_end
                  ? `, ${formatLogDate(featured.time_start)} to ${formatLogDate(featured.time_end)}`
                  : ''}.
                {' '}{formatInt(featured.n_anomalies)} lines
                ({formatPercent((featured.n_anomalies ?? 0) / (featured.total_rows || 1))}) were flagged and
                grouped into {formatInt(featured.n_incidents)} incidents. These are the stored results of
                run No. {serial(featured.id)}, not a mock-up.
              </p>
            ) : featured ? (
              <p className="lede">
                Run No. {serial(featured.id)} read {formatInt(featured.total_rows)} lines,
                of which {formatPercent((featured.n_anomalies ?? 0) / (featured.total_rows || 1))} were
                flagged. These are its stored results, not a mock-up.
              </p>
            ) : (
              <p className="lede">Finished runs are shown here with their stored results.</p>
            )}
          </Reveal>
          {runs.loading && <SkeletonBlock height="22rem" />}
          {runs.error && <ErrorNotice error={runs.error} onRetry={runs.reload} title="No run to show yet" />}
          {featured && (
            <div className="demo-wrap">
              <Reveal className="demo-wrap__ticket"><HeroTicket run={featured} /></Reveal>
              <Reveal><Demo run={featured} /></Reveal>
            </div>
          )}
          {runs.data && !featured && (
            <EmptyNotice title="Nothing to show yet">
              <p>No run has finished. Upload a log to create one.</p>
              <Link to="/upload" className="btn">Upload a log</Link>
            </EmptyNotice>
          )}
        </div>
      </section>

      <section className="band band--tint">
        <div className="page band__split">
          <Reveal className="stack">
            <p className="caps">Honest limits</p>
            <h2 className="display">What it will not tell you</h2>
            <p className="lede">Worth knowing before you rely on it.</p>
          </Reveal>
          <ul className="limits">
            {LIMITS.map(([title, text], index) => (
              <li key={title}>
                <Reveal delay={index * 0.08}>
                  <p><strong>{title}.</strong> {text}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band band--close">
        <div className="page">
          <BinaryField seed="admit one log" rows={5} columns={90} />
          <Reveal>
            <div className="ticket ticket--paper close-ticket">
              <div className="ticket__body">
                <h2 className="display">Have a log that looks wrong?</h2>
                <p className="lede">Hand it in. The receipt prints while the pipeline runs, then your dashboard opens.</p>
              </div>
              <div className="ticket__stub">
                <Barcode value="admit one log" bars={30} />
                <Link to="/upload" className="btn">Upload a log</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
