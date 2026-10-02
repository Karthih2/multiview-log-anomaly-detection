import { CalendarBlank, ChartLineUp, Fire, Flag, Hash, Printer, Stack } from '@phosphor-icons/react'
import { Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { useApi } from '../../api/hooks'
import type { RunDetail, RunSummary } from '../../api/types'
import { ErrorNotice, SkeletonBlock, SkeletonLines } from '../../components/States'
import { formatLogDate } from '../../lib/format'
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
    { to: '.', label: 'Overview', end: true, icon: ChartLineUp },
    { to: 'when', label: 'When and where', icon: CalendarBlank },
    { to: 'incidents', label: 'Incidents', icon: Fire },
    { to: 'views', label: 'Three views', icon: Stack },
    { to: 'events', label: 'Flagged lines', icon: Flag },
    { to: 'templates', label: 'Templates', icon: Hash },
    { to: 'summary', label: 'Printable summary', icon: Printer },
  ]

  return (
    <div className="page report">
      <aside className="report__rail no-print">
        {run.data ? (
          <>
            <p className="caps">Run</p>
            <p className="report__name">{run.data.name}</p>
            {run.data.time_start && run.data.time_end && (
              <p className="muted report__span">
                {formatLogDate(run.data.time_start)} to {formatLogDate(run.data.time_end)}
              </p>
            )}
          </>
        ) : (
          <SkeletonLines widths={['60%', '90%', '75%']} />
        )}
        <nav aria-label="Run sections">
          <ul>
            {sheets.map((sheet) => (
              <li key={sheet.to}>
                <NavLink to={sheet.to} end={sheet.end}><sheet.icon size={18} weight="duotone" aria-hidden="true" />{sheet.label}</NavLink>
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
