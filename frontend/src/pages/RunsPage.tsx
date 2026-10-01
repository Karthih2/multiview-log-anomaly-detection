import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, deleteRun } from '../api/client'
import { useApi } from '../api/hooks'
import type { Page, Run } from '../api/types'
import { Barcode } from '../components/Ephemera'
import { EmptyNotice, ErrorNotice, SkeletonRows } from '../components/States'
import { formatInt, formatLogDate, formatPercent, serial } from '../lib/format'
import { stageCopy } from '../lib/vocabulary'
import '../styles/app.css'

const SOURCE: Record<string, string> = { upload: 'Uploaded', file: 'From disk', artifacts: 'Saved experiment outputs' }

function RunRow({ run, onDeleted }: { run: Run; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = run.status === 'completed'
  const active = run.status === 'queued' || run.status === 'running'
  const target = done ? `/runs/${run.id}` : `/runs/${run.id}/receipt`

  const remove = async () => {
    setBusy(true)
    try {
      await deleteRun(run.id)
      onDeleted()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete this run.')
      setBusy(false)
    }
  }

  return (
    <li className="run-row">
      <div className="run-row__serial">
        <span className="data">No. {serial(run.id)}</span>
        <Barcode value={`run-${run.id}-${run.created_at}`} bars={20} />
      </div>
      <div className="run-row__main">
        <h2><Link to={target}>{run.name}</Link></h2>
        <p className="muted">
          {SOURCE[run.source_kind] ?? run.source_kind}
          {run.time_start && run.time_end ? `. Log covers ${formatLogDate(run.time_start)} to ${formatLogDate(run.time_end)}.` : '.'}
        </p>
      </div>
      <div className="run-row__figures">
        {done ? (
          <>
            <span><span className="num">{formatInt(run.total_rows)}</span> lines</span>
            <span><span className="num">{formatInt(run.n_anomalies)}</span> flagged ({formatPercent((run.n_anomalies ?? 0) / (run.total_rows || 1))})</span>
            <span><span className="num">{formatInt(run.n_incidents)}</span> incidents</span>
          </>
        ) : active ? (
          <span>{run.stage ? stageCopy(run.stage).label : 'Waiting in line'}</span>
        ) : (
          <span className="run-row__failed">Stopped: {run.error ?? 'no reason reported'}</span>
        )}
      </div>
      <div className="run-row__actions">
        <Link to={target} className="btn btn--small">{done ? 'Open report' : active ? 'Watch' : 'Details'}</Link>
        {!active && !confirming && (
          <button type="button" className="link" onClick={() => setConfirming(true)}>Delete</button>
        )}
        {confirming && (
          <span className="run-row__confirm">
            <button type="button" className="link" onClick={remove} disabled={busy}>
              {busy ? 'Deleting' : 'Delete for good'}
            </button>
            <button type="button" className="link" onClick={() => setConfirming(false)} disabled={busy}>Keep</button>
          </span>
        )}
        {error && <span className="form-error" role="alert">{error}</span>}
      </div>
    </li>
  )
}

export default function RunsPage() {
  const runs = useApi<Page<Run>>('/runs')

  return (
    <div className="page runs-page">
      <div className="stack runs-page__head">
        <h1 className="display">Runs</h1>
        <p className="lede">Every log that has been handed in, newest first.</p>
      </div>
      {runs.loading && <SkeletonRows rows={3} height="5.5rem" />}
      {runs.error && <ErrorNotice error={runs.error} onRetry={runs.reload} />}
      {runs.data && runs.data.items.length === 0 && (
        <EmptyNotice title="No runs yet">
          <p>Upload a log file to create the first one.</p>
          <Link to="/upload" className="btn">Upload a log</Link>
        </EmptyNotice>
      )}
      {runs.data && runs.data.items.length > 0 && (
        <ul className="run-list">
          {runs.data.items.map((run) => <RunRow key={run.id} run={run} onDeleted={runs.reload} />)}
        </ul>
      )}
    </div>
  )
}
