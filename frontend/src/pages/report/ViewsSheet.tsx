import type { CSSProperties } from 'react'
import { ShareBar } from '../../components/charts'
import { Tally } from '../../components/Ephemera'
import type { TallyRow } from '../../components/Ephemera'
import { EmptyNotice } from '../../components/States'
import { formatInt, formatPercent, formatScore } from '../../lib/format'
import { detectorFactLabel, viewCopy, viewVar } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

/** Parameter the run was executed with, read from its stored snapshot. */
function setting(parameters: Record<string, Record<string, unknown>> | null, section: string, key: string): string | null {
  const value = parameters?.[section]?.[key]
  return value == null ? null : String(value)
}

export default function ViewsSheet() {
  const { run, summary, evaluation } = useReport()
  const views = run.view_summary

  if (!views) {
    return (
      <article className="sheet">
        <header className="sheet__head"><h1 className="display">Three views</h1></header>
        <EmptyNotice title="No per-view figures were stored for this run" />
      </article>
    )
  }

  const names = Object.keys(views)
  const aucAlone = (view: string) =>
    evaluation.find((e) => e.scope === `ablation:${view}_only`)?.metrics.auc_roc ?? null

  const settings: TallyRow[] = [
    ['Training share of the log', setting(run.parameters, 'split', 'train_frac')],
    ['Normal-message clusters (semantic)', setting(run.parameters, 'semantic_scoring', 'n_prototypes')],
    ['Hidden states (temporal)', setting(run.parameters, 'temporal_hmm', 'n_states')],
    ['Threshold window, in lines', setting(run.parameters, 'threshold', 'window')],
    ['Threshold strictness (lambda)', setting(run.parameters, 'threshold', 'lam')],
    ['Gap that splits two incidents', setting(run.parameters, 'incidents', 'time_window')],
  ].filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => ({ label, value }))

  return (
    <article className="sheet">
      <header className="sheet__head">
        <h1 className="display">Three views</h1>
        <p className="lede">
          Every line is scored three separate ways. The scores are then blended, and each view's say
          depends on how reliable it is for that particular line.
        </p>
      </header>

      <section className="sheet__section">
        <h2>Average say in the final score</h2>
        <p className="muted">Mean fusion weight across all {formatInt(summary.total_rows)} lines. The three always add up to 100%.</p>
        <ShareBar parts={names.map((view) => ({
          key: view, label: viewCopy(view).name, share: views[view].mean_weight ?? 0, colour: viewVar(view),
        }))} />
      </section>

      {names.map((view) => {
        const copy = viewCopy(view)
        const stats = views[view]
        const auc = aucAlone(view)
        const fitted = run.detectors?.[view]
        const rows: TallyRow[] = [
          { label: 'Average score, all lines', value: formatScore(stats.mean_score), note: '0 is ordinary, 1 is as unusual as it gets.' },
          { label: 'Average score, flagged lines', value: formatScore(stats.mean_score_flagged) },
          { label: 'Average weight on flagged lines', value: formatPercent(stats.mean_weight_flagged) },
          { label: 'Flags it contributed most to', value: formatInt(stats.dominant_flags),
            note: `${formatPercent(summary.n_anomalies ? stats.dominant_flags / summary.n_anomalies : null)} of all flags. Contribution is score times weight.` },
        ]
        if (auc != null) {
          rows.push({ label: 'AUC-ROC on its own', value: formatScore(auc), note: 'Ranking quality if this view were the only one. 0.5 is chance.' })
        }
        return (
          <section key={view} className="sheet__section view-block" style={{ '--view': viewVar(view) } as CSSProperties}>
            <div className="view-block__intro">
              <h2 className="bracket view-block__title"><span className="view-block__swatch" aria-hidden="true" />{copy.name} view</h2>
              <p className="view-block__reads">{copy.reads}.</p>
              <p className="muted">{copy.catches}</p>
              {!fitted && <p className="muted view-block__detector">Detector: {copy.detector}.</p>}
            </div>
            <Tally rows={rows} />
            {fitted && (
              <div className="view-block__fitted">
                <h3>Its detector, as fitted on this log</h3>
                <Tally rows={Object.entries(fitted).map(([key, value]) => ({
                  label: detectorFactLabel(key),
                  value: typeof value === 'number' ? formatInt(value) : String(value),
                }))} />
              </div>
            )}
          </section>
        )
      })}

      {settings.length > 0 && (
        <section className="sheet__section">
          <h2>Settings this run used</h2>
          <p className="muted">Stored with the run, so the figures above can be reproduced.</p>
          <Tally rows={settings} />
        </section>
      )}
    </article>
  )
}
