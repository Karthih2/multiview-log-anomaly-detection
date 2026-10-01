import { Check, X } from '@phosphor-icons/react'
import { Link, useParams } from 'react-router-dom'
import { useNow, useRun } from '../api/hooks'
import type { RunDetail } from '../api/types'
import { Barcode } from '../components/Ephemera'
import { ErrorNotice, SkeletonBlock, SkeletonLines } from '../components/States'
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

function Receipt({ run }: { run: RunDetail }) {
  const active = run.status === 'queued' || run.status === 'running'
  const now = useNow(active)
  const lines = buildLines(run, now)
  const startedAt = run.started_at ? parseServerTime(run.started_at) : null
  const endedAt = run.finished_at ? parseServerTime(run.finished_at) : now
  const doneCount = lines.filter((line) => line.state === 'done').length

  return (
    <div className="receipt receipt--feed" aria-live="polite">
      <header className="receipt__head">
        <p className="display receipt__brand">LogSight</p>
        <p>Run No. {serial(run.id)}</p>
        <p className="receipt__name">{run.name}</p>
      </header>
      <hr className="receipt__dash" />
      <ol className="receipt__lines">
        {lines.map((line) => {
          const copy = stageCopy(line.stage)
          return (
            <li key={line.stage} className={`receipt-line receipt-line--${line.state}`}>
              <Mark state={line.state} />
              <span className="receipt-line__label">
                {line.state === 'running' ? (
                  <DecryptedText text={copy.label} animateOn="view" sequential speed={28} characters="01" />
                ) : (
                  copy.label
                )}
                <span className="sr-only">, {STATE_WORD[line.state]}</span>
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
              <dd>{formatInt(run.total_rows)}</dd>
            </div>
            <div>
              <dt>Flagged</dt>
              <dd>{formatInt(run.n_anomalies)}</dd>
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

function Status({ run }: { run: RunDetail }) {
  if (run.status === 'completed') {
    return (
      <>
        <h1 className="display">Your report is ready</h1>
        <p className="lede">
          {formatInt(run.total_rows)} lines read, {formatInt(run.n_anomalies)} flagged,
          grouped into {formatInt(run.n_incidents)} incidents.
        </p>
        <Link to={`/runs/${run.id}`} className="btn">Open the report</Link>
      </>
    )
  }
  if (run.status === 'failed') {
    return (
      <>
        <h1 className="display">This run stopped</h1>
        <div className="notice notice--error" role="alert">
          <h2>What went wrong</h2>
          <p className="data">{run.error ?? 'The pipeline stopped without reporting a reason.'}</p>
        </div>
        <p>Check that the file is a raw BGL log, then upload it again.</p>
        <Link to="/upload" className="btn">Upload again</Link>
      </>
    )
  }
  const copy = run.stage ? stageCopy(run.stage) : null
  return (
    <>
      <h1 className="display">{run.status === 'queued' ? 'Waiting in line' : 'Reading your log'}</h1>
      <p className="lede">
        {copy ? `${copy.label}. ${copy.detail}` : 'The pipeline starts as soon as the previous run finishes.'}
      </p>
      <p className="muted">
        You can leave this page. The run continues on the server and stays under Runs.
      </p>
    </>
  )
}

export default function ReceiptPage() {
  const { runId } = useParams()
  const { run, error } = useRun(runId)

  return (
    <div className="page receipt-page">
      <div className="receipt-page__status stack">
        {run ? <Status run={run} /> : error ? (
          <ErrorNotice error={error} title="This run could not be loaded" />
        ) : (
          <SkeletonLines widths={['70%', '90%', '55%']} />
        )}
      </div>
      <div className="receipt-page__paper">
        {run ? <Receipt run={run} /> : !error && <SkeletonBlock height="34rem" />}
      </div>
    </div>
  )
}
