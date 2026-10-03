import type { CSSProperties } from 'react'
import { useApi } from '../../api/hooks'
import type { DriftSignal } from '../../api/types'
import { DriftChart, ShareBar } from '../../components/charts'
import { Tally } from '../../components/Ephemera'
import type { TallyRow } from '../../components/Ephemera'
import Reveal from '../../components/Reveal'
import { EmptyNotice, SkeletonBlock } from '../../components/States'
import { formatInt, formatPercent } from '../../lib/format'
import { detectorFactLabel, viewCopy, viewVar } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

/** Parameter the run was executed with, read from its stored snapshot. */
function setting(parameters: Record<string, Record<string, unknown>> | null, section: string, key: string): string | null {
  const value = parameters?.[section]?.[key]
  return value == null ? null : String(value)
}

/** Drift needs several 50,000-line windows to say anything; one window is just the run itself. */
function DriftCheck({ runId, trainEnd }: { runId: number; trainEnd: number | null }) {
  const drift = useApi<DriftSignal[]>(`/runs/${runId}/drift`)
  if (drift.loading) return <SkeletonBlock height="9rem" />
  const signals = drift.data ?? []
  const judged = signals.filter((s) => s.windows.length > 1 || s.windows.some((w) => w.drift_flagged))
  if (!judged.length) {
    return <p className="muted">Drift needs long logs (several 50,000-line windows). This run is too short to judge drift.</p>
  }
  return (
    <div className="drift-grid">
      {judged.map((signal) => (
        <figure key={signal.signal} className="drift-grid__item">
          <figcaption className="caps">{signal.signal.replace(/_/g, ' ')}</figcaption>
          <DriftChart signal={signal} trainEnd={trainEnd} />
        </figure>
      ))}
    </div>
  )
}

export default function ViewsSheet() {
  const { run, summary } = useReport()
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
  const settings: TallyRow[] = [
    ['Learning window share of the log', setting(run.parameters, 'split', 'train_frac')],
    ['Normal-message clusters (semantic)', setting(run.parameters, 'semantic_scoring', 'n_prototypes')],
    ['Hidden states (temporal)', setting(run.parameters, 'temporal_hmm', 'n_states')],
    ['Threshold window, in lines', setting(run.parameters, 'threshold', 'window')],
    ['Threshold strictness (lambda)', setting(run.parameters, 'threshold', 'lam')],
    ['Gap that splits two incidents', setting(run.parameters, 'incidents', 'time_window')],
  ].filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => ({ label, value }))

  return (
    <article className="sheet dash">
      <header className="dash__head">
        <h1 className="display">Three views</h1>
        <p className="muted">
          Every line is scored three ways, then blended. Each view's say depends on how reliable it is for that line.
        </p>
      </header>

      <Reveal>
        <section className="dash__section">
          <h2>Average say in the final score</h2>
          <p className="muted">Measured on this run's learning window, without labels: a view whose scores separate clearly gets more say.</p>
          <ShareBar parts={names.map((view) => ({
            key: view, label: viewCopy(view).name, share: views[view].mean_weight ?? 0, colour: viewVar(view),
          }))} />
        </section>
      </Reveal>

      <div className="view-panels">
        {names.map((view, index) => {
          const copy = viewCopy(view)
          const stats = views[view]
          const fitted = run.detectors?.[view]
          return (
            <Reveal key={view} delay={index * 0.1}>
              <section className="panel view-panel" style={{ '--view': viewVar(view) } as CSSProperties}>
                <h2 className="bracket view-block__title">
                  <span className="view-block__swatch" aria-hidden="true" />{copy.name}
                </h2>
                <p className="view-panel__reads">{copy.reads}</p>
                <p className="muted">{copy.catches}</p>
                <Tally rows={[
                  { label: 'Detector', value: '', note: `${copy.detector}.` },
                  { label: 'Average weight', value: formatPercent(stats.mean_weight) },
                  { label: 'Flags it drove', value: formatInt(stats.dominant_flags),
                    note: `${formatPercent(summary.n_anomalies ? stats.dominant_flags / summary.n_anomalies : null)} of all flagged lines.` },
                ]} />
                {fitted && (
                  <details className="view-panel__fitted">
                    <summary>As fitted on this log</summary>
                    <Tally rows={Object.entries(fitted).map(([key, value]) => ({
                      label: detectorFactLabel(key),
                      value: typeof value === 'number' ? formatInt(value) : String(value),
                    }))} />
                  </details>
                )}
              </section>
            </Reveal>
          )
        })}
      </div>

      <Reveal>
        <section className="dash__section">
          <h2>Drift check</h2>
          <DriftCheck runId={run.id} trainEnd={run.train_end_idx} />
        </section>
      </Reveal>

      {settings.length > 0 && (
        <Reveal>
          <section className="settings-box">
            <h2>Settings this run used</h2>
            <p>Stored with the run, so every figure can be reproduced.</p>
            <Tally rows={settings} />
          </section>
        </Reveal>
      )}
    </article>
  )
}
