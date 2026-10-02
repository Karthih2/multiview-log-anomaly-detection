import { useApi } from '../../api/hooks'
import type { Page, Template } from '../../api/types'
import { BarList } from '../../components/charts'
import { ErrorNotice, SkeletonRows } from '../../components/States'
import { formatInt, formatPercent } from '../../lib/format'
import { useReport } from './ReportLayout'

const TOP_TEMPLATES = 10

export default function TemplatesSheet() {
  const { run, summary } = useReport()
  const templates = useApi<Page<Template>>(`/runs/${run.id}/templates?limit=${TOP_TEMPLATES}`)
  const shown = templates.data?.items ?? []
  const covered = shown.reduce((sum, t) => sum + t.occurrences, 0)

  return (
    <article className="sheet">
      <header className="sheet__head">
        <p className="caps">Templates</p>
        <h1 className="display">Message templates</h1>
        <p className="lede">
          The line shapes the parser found in this log. Each template is a line with its variable parts replaced.
        </p>
      </header>

      <section className="sheet__section">
        <h2>Most common message templates</h2>
        <p className="muted">
          Drain3 found {formatInt(summary.n_templates)} templates. A template is a line with its variable
          parts replaced by {'<*>'}.
          {shown.length > 0 && ` These ${shown.length} cover ${formatPercent(covered / summary.total_rows)} of all lines.`}
        </p>
        {templates.loading && <SkeletonRows rows={6} height="2.5rem" />}
        {templates.error && <ErrorNotice error={templates.error} onRetry={templates.reload} />}
        {templates.data && (
          <BarList stacked rows={shown.map((t) => ({
            key: String(t.template_id),
            label: <span className="logline">{t.template}</span>,
            value: t.occurrences,
            display: `${formatInt(t.occurrences)} lines`,
          }))} />
        )}
      </section>
    </article>
  )
}
