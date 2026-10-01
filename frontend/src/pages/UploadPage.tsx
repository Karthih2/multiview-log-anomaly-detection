import { FileArrowUp } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, uploadLog } from '../api/client'
import { Barcode } from '../components/Ephemera'
import { formatBytes } from '../lib/format'
import '../styles/app.css'

export default function UploadPage() {
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sending = progress !== null

  const choose = (chosen: File | undefined) => {
    if (!chosen) return
    setFile(chosen)
    setError(chosen.size === 0 ? 'That file is empty. Choose a log with at least one line.' : null)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!sending) choose(event.dataTransfer.files[0])
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file || file.size === 0 || sending) return
    setError(null)
    setProgress(0)
    try {
      const run = await uploadLog(file, name, setProgress)
      navigate(`/runs/${run.id}/receipt`)
    } catch (caught) {
      setProgress(null)
      setError(caught instanceof ApiError ? caught.message : 'The upload failed. Try again.')
    }
  }

  return (
    <div className="page upload-page">
      <div className="upload-page__intro stack">
        <h1 className="display">Hand in a log</h1>
        <p className="lede">
          Upload one raw log file. LogSight stores it, runs the full pipeline, and prints a receipt
          while it works.
        </p>
        <ul className="plain-list muted">
          <li>Format: raw BGL log lines, one event per line.</li>
          <li>Around a minute for tens of thousands of lines. Larger files take longer.</li>
          <li>No labels are needed. If the log has them, you also get accuracy figures.</li>
        </ul>
      </div>

      <form className="ticket ticket--paper upload-ticket" onSubmit={submit}>
        <div className="ticket__body stack">
          <div
            className={`dropzone${dragging ? ' dropzone--over' : ''}${file ? ' dropzone--filled' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <FileArrowUp size={40} weight="light" aria-hidden="true" />
            {file ? (
              <p>
                <strong className="data dropzone__file">{file.name}</strong>
                <span className="muted"> {formatBytes(file.size)}</span>
              </p>
            ) : (
              <p>Drop a log file here</p>
            )}
            <button type="button" className="link" onClick={() => input.current?.click()} disabled={sending}>
              {file ? 'Choose a different file' : 'or choose a file'}
            </button>
            <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="Log file"
              onChange={(event) => choose(event.target.files?.[0])} />
          </div>

          <div className="field">
            <label htmlFor="run-name">Run name</label>
            <input id="run-name" type="text" value={name} maxLength={120} disabled={sending}
              onChange={(event) => setName(event.target.value)} aria-describedby="run-name-hint" />
            <span className="hint" id="run-name-hint">Optional. The file name is used if you leave this empty.</span>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <div className="ticket__stub">
          <div>
            <p className="caps">Admit one log</p>
            <p className="muted upload-ticket__note">Your log stays on the server running LogSight.</p>
          </div>
          <Barcode value={file ? `${file.name}${file.size}` : 'no file yet'} bars={30} />
          {sending ? (
            <div className="upload-progress" role="status">
              <span className="upload-progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              <span className="upload-progress__label">
                {progress < 1 ? `Sending ${Math.round(progress * 100)}%` : 'Starting the run'}
              </span>
            </div>
          ) : (
            <button type="submit" className="btn" disabled={!file || file.size === 0}>
              Run analysis
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
