import { Check, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useNow, useRun } from '../api/hooks'
import type { RunDetail } from '../api/types'
import { Barcode, Count, prefersReducedMotion } from '../components/Ephemera'
import GlitchField from '../components/GlitchField'
import { ErrorNotice, SkeletonBlock } from '../components/States'
import { formatDuration, formatInt, parseServerTime, serial } from '../lib/format'
import { stageCopy } from '../lib/vocabulary'
import DecryptedText from '../reactbits/DecryptedText'
import '../styles/app.css'

type LineState = 'pending' | 'running' | 'done' | 'failed'

interface Line {
  stage: string
  state: LineState
  elapsedMs: number | null
}

/** How long the finished screen shows before it opens the dashboard on its own. */
const REDIRECT_SECONDS = 3

/** Turn the backend's planned stages and stage log into receipt lines. */
function buildLines(run: RunDetail, now: number): Line[] {
  const started = new Map((run.stage_log ?? []).map((entry) => [entry.stage, parseServerTime(entry.started_at)]))
  const finished = run.finished_at ? parseServerTime(run.finished_at) : null
  const order = run.planned_stages

  return order.map((stage, i) => {
    const start = started.get(stage)
    // A finished run with no stage log predates per-stage timing: every stage ran, untimed.
    if (start === undefined) return { stage, state: run.status === 'completed' ? 'done' : 'pending', elapsedMs: null }
    const nextStart = order.slice(i + 1).map((s) => started.get(s)).find((t) => t !== undefined)
    if (nextStart !== undefined) return { stage, state: 'done', elapsedMs: nextStart - start }
    if (run.status === 'completed') return { stage, state: 'done', elapsedMs: (finished ?? now) - start }
    if (run.status === 'failed') return { stage, state: 'failed', elapsedMs: (finished ?? now) - start }
    return { stage, state: 'running', elapsedMs: now - start }
  })
}

function Mark({ state }: { state: LineState }) {
  return (
    <span className={`receipt-line__mark receipt-line__mark--${state}`} aria-hidden="true">
      {state === 'done' && <Check weight="bold" />}
      {state === 'failed' && <X weight="bold" />}
    </span>
  )
}

const STATE_WORD: Record<LineState, string> = { pending: 'waiting', running: 'in progress', done: 'done', failed: 'failed' }

function Receipt({ run, lines, now }: { run: RunDetail; lines: Line[]; now: number }) {
  const startedAt = run.started_at ? parseServerTime(run.started_at) : null
  const endedAt = run.finished_at ? parseServerTime(run.finished_at) : now
  const doneCount = lines.filter((line) => line.state === 'done').length

  return (
    <div className="receipt receipt--feed process__receipt" aria-live="polite">
      <header className="receipt__head">
        <p className="display receipt__brand">LogSight</p>
        <p>Run No. {serial(run.id)}</p>
        <p className="receipt__name">{run.name}</p>
      </header>
      <hr className="receipt__dash" />
      <ol className="receipt__lines">
        {lines.map((line, i) => {
          const copy = stageCopy(line.stage)
          return (
            <li key={line.stage} className={`receipt-line receipt-line--${line.state}`}
              style={{ animationDelay: `${i * 70}ms` }}>
              <Mark state={line.state} />
              <span className="receipt-line__label">
                {line.state === 'running' ? (
                  <DecryptedText text={copy.label} animateOn="view" sequential speed={28} characters="01" />
                ) : (
                  copy.label
                )}
                <span className="sr-only">, {STATE_WORD[line.state]}</span>
                {line.state === 'running' && <span className="receipt-line__detail">{copy.detail}</span>}
              </span>
              <span className="receipt-line__time">
                {line.elapsedMs === null ? '' : formatDuration(line.elapsedMs)}
              </span>
            </li>
          )
        })}
      </ol>
      <hr className="receipt__dash" />
      <dl className="receipt__totals">
        <div>
          <dt>Stages</dt>
          <dd>{doneCount} of {lines.length}</dd>
        </div>
        <div className="receipt__total">
          <dt>Total time</dt>
          <dd>{startedAt === null ? 'not started' : formatDuration(endedAt - startedAt)}</dd>
        </div>
        {run.status === 'completed' && (
          <>
            <div>
              <dt>Lines read</dt>
              <dd><Count to={run.total_rows ?? 0} duration={0.8} /></dd>
            </div>
            <div>
              <dt>Flagged</dt>
              <dd><Count to={run.n_anomalies ?? 0} duration={0.8} /></dd>
            </div>
            <div>
              <dt>Incidents</dt>
              <dd><Count to={run.n_incidents ?? 0} duration={0.8} /></dd>
            </div>
          </>
        )}
      </dl>
      <hr className="receipt__dash" />
      <div className="receipt__foot">
        <Barcode value={`run-${run.id}-${run.created_at}`} bars={56} />
        {run.status === 'completed' && <span className="inkmark receipt__stamp">Processed</span>}
        {run.status === 'failed' && <span className="inkmark receipt__stamp">Void</span>}
      </div>
    </div>
  )
}

function Process({ run }: { run: RunDetail }) {
  const navigate = useNavigate()
  const active = run.status === 'queued' || run.status === 'running'
  const now = useNow(active)
  const lines = buildLines(run, now)
  const doneCount = lines.filter((line) => line.state === 'done').length
  const running = lines.some((line) => line.state === 'running')
  const percent = run.status === 'completed' ? 100 : lines.length ? ((doneCount + (running ? 0.5 : 0)) / lines.length) * 100 : 0
  const [left, setLeft] = useState(REDIRECT_SECONDS)

  // Finished: count down, then open the dashboard.
  useEffect(() => {
    if (run.status !== 'completed') return
    const target = `/runs/${run.id}`
    if (prefersReducedMotion()) { navigate(target, { replace: true }); return }
    const tick = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    const go = window.setTimeout(() => navigate(target, { replace: true }), REDIRECT_SECONDS * 1000)
    return () => { window.clearInterval(tick); window.clearTimeout(go) }
  }, [run.status, run.id, navigate])

  const copy = run.stage ? stageCopy(run.stage) : null
  const headline = run.status === 'completed' ? 'Your report is ready'
    : run.status === 'failed' ? 'This run stopped'
      : run.status === 'queued' ? 'Waiting in line' : 'Reading your log'
  const detail = run.status === 'completed'
    ? `${formatInt(run.total_rows)} lines read, ${formatInt(run.n_anomalies)} flagged, grouped into ${formatInt(run.n_incidents)} incidents.`
    : run.status === 'failed' ? 'Check that the file is a raw BGL log, then upload it again.'
      : copy ? `${copy.label}. ${copy.detail}` : 'The pipeline starts as soon as the previous run finishes.'

  return (
    <>
      <header className="process__head">
        <p className="caps">Run No. {serial(run.id)}</p>
        <h1 className="display process__headline">{headline}</h1>
        <p className="lede process__detail">{detail}</p>
      </header>

      <div className="process__meter" role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(percent)} aria-label="Pipeline progress">
        <span className="process__meter-fill" style={{ width: `${percent}%` }} />
        <span className="process__meter-label num">{Math.round(percent)}%</span>
      </div>

      <Receipt run={run} lines={lines} now={now} />

      {run.status === 'completed' && (
        <div className="process__go">
          <span className="process__countdown" aria-hidden="true"><span style={{ animationDuration: `${REDIRECT_SECONDS}s` }} /></span>
          <Link to={`/runs/${run.id}`} replace className="btn">Open the dashboard now</Link>
          <p className="muted">Opening your dashboard in {left} s</p>
        </div>
      )}
      {run.status === 'failed' && (
        <div className="process__go">
          <div className="notice notice--error" role="alert">
            <h2>What went wrong</h2>
            <p className="data">{run.error ?? 'The pipeline stopped without reporting a reason.'}</p>
          </div>
          <Link to="/upload" className="btn">Upload again</Link>
        </div>
      )}
      {active && <p className="muted process__hint">You can leave this page. The run continues on the server and stays under Runs.</p>}
    </>
  )
}

export default function ReceiptPage() {
  const { runId } = useParams()
  const { run, error } = useRun(runId)

  return (
    <div className="process">
      <GlitchField full speed={60} />
      <div className="process__inner">
        {run ? <Process run={run} /> : error ? (
          <ErrorNotice error={error} title="This run could not be loaded" />
        ) : (
          <SkeletonBlock height="34rem" width="min(30rem, 100%)" />
        )}
      </div>
    </div>
  )
}
