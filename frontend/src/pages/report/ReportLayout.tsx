import { Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { useApi } from '../../api/hooks'
import type { RunDetail, RunSummary } from '../../api/types'
import { Barcode } from '../../components/Ephemera'
import { ErrorNotice, SkeletonBlock, SkeletonLines } from '../../components/States'
import { formatLogDate, serial } from '../../lib/format'
import '../../styles/report.css'

export interface ReportContext {
  run: RunDetail
  summary: RunSummary
}

export const useReport = () => useOutletContext<ReportContext>()

export default function ReportLayout() {
  const { runId } = useParams()
  const run = useApi<RunDetail>(`/runs/${runId}`)
  const completed = run.data?.status === 'completed'
  const summary = useApi<RunSummary>(completed ? `/runs/${runId}/summary` : null)

  if (run.data && !completed) return <Navigate to={`/runs/${runId}/receipt`} replace />

  const error = run.error ?? summary.error
  if (error) {
    return (
      <div className="page report-missing">
        <ErrorNotice error={error} title="This report could not be loaded"
          onRetry={() => { run.reload(); summary.reload() }} />
      </div>
    )
  }

  const context: ReportContext | null = run.data && summary.data
    ? { run: run.data, summary: summary.data }
    : null
  const sheets = [
    { to: '.', label: 'Overview', end: true },
    { to: 'views', label: 'Three views' },
    { to: 'incidents', label: 'Incidents' },
    { to: 'events', label: 'Flagged lines' },
    { to: 'checks', label: 'Templates and drift' },
    { to: 'summary', label: 'Printable summary' },
  ]

  return (
    <div className="page report">
      <aside className="report__stub no-print">
        {run.data ? (
          <>
            <p className="data report__serial">Run No. {serial(run.data.id)}</p>
            <p className="report__name">{run.data.name}</p>
            {run.data.time_start && run.data.time_end && (
              <p className="muted report__span">
                {formatLogDate(run.data.time_start)} to {formatLogDate(run.data.time_end)}
              </p>
            )}
            <Barcode value={`run-${run.data.id}-${run.data.created_at}`} bars={34} />
          </>
        ) : (
          <SkeletonLines widths={['60%', '90%', '75%']} />
        )}
        <nav aria-label="Report sections">
          <ul>
            {sheets.map((sheet) => (
              <li key={sheet.to}>
                <NavLink to={sheet.to} end={sheet.end}>{sheet.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="report__sheet">
        {context ? <Outlet context={context} /> : (
          <div className="stack">
            <SkeletonLines widths={['45%', '85%', '70%']} />
            <SkeletonBlock height="16rem" />
          </div>
        )}
      </div>
    </div>
  )
}
