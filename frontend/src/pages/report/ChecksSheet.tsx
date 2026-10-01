import { useApi } from '../../api/hooks'
import type { DriftSignal, Page, Template } from '../../api/types'
import { BarList, DriftChart } from '../../components/charts'
import { EmptyNotice, ErrorNotice, SkeletonBlock, SkeletonRows } from '../../components/States'
import { formatInt, formatPercent } from '../../lib/format'
import { useReport } from './ReportLayout'

const TOP_TEMPLATES = 10

const SIGNALS: Record<string, { title: string; meaning: string }> = {
  embedding: { title: 'Meaning of the messages', meaning: 'Distance of each line from the average training-period message.' },
  template_frequency: { title: 'Mix of templates', meaning: 'How common each line\'s template was during training.' },
}

export default function ChecksSheet() {
  const { run, summary } = useReport()
  const templates = useApi<Page<Template>>(`/runs/${run.id}/templates?limit=${TOP_TEMPLATES}`)
  const drift = useApi<DriftSignal[]>(`/runs/${run.id}/drift`)
  const shown = templates.data?.items ?? []
  const covered = shown.reduce((sum, t) => sum + t.occurrences, 0)

  return (
    <article className="sheet">
      <header className="sheet__head">
        <h1 className="display">Templates and drift</h1>
        <p className="lede">
          What the parser found in the log, and whether later parts of the log still look like the
          part the detectors learned from.
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

      <section className="sheet__section">
        <h2>Drift</h2>
        <p className="muted">
          The log is cut into windows and each is compared with the training period. The line is the
          KS statistic: 0 means the window looks the same, 1 means completely different. A bar under
          the axis marks windows flagged as drifted.
        </p>
        {drift.loading && <SkeletonBlock height="10rem" />}
        {drift.error && <ErrorNotice error={drift.error} onRetry={drift.reload} />}
        {drift.data && drift.data.length === 0 && <EmptyNotice title="No drift check was stored for this run" />}
        {drift.data?.map((signal) => {
          const copy = SIGNALS[signal.signal] ?? { title: signal.signal, meaning: '' }
          const flagged = signal.windows.filter((w) => w.drift_flagged).length
          return (
            <div key={signal.signal} className="drift">
              <h3>{copy.title}</h3>
              <p className="muted">{copy.meaning}</p>
              {signal.windows.length > 0 ? (
                <DriftChart signal={signal} trainEnd={run.train_end_idx} />
              ) : (
                <p>The log is too short to cut into windows.</p>
              )}
              <p>
                {flagged} of {signal.windows.length} windows flagged
                {signal.first_flagged_row !== null && `, first at row ${formatInt(signal.first_flagged_row)}`}.
                {' '}Control test on the training period itself: KS {signal.control_test.ks_stat?.toFixed(4)},
                which should be near 0.
              </p>
            </div>
          )
        })}
        <div className="notice">
          <h3>Read drift flags with care</h3>
          <p>
            Comparing consecutive windows is oversensitive when the same templates arrive in bursts, as they
            do in BGL logs. A flag here shows the log changed character, which is not always a fault.
          </p>
        </div>
      </section>
    </article>
  )
}
