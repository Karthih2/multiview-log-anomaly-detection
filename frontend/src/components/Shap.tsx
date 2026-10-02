import type { CSSProperties } from 'react'
import { formatScore } from '../lib/format'
import { viewCopy, viewVar } from '../lib/vocabulary'

export interface ShapPart {
  view: string
  score: number
  weight: number
  /** Typical score of this view on a normal (unflagged) line. */
  baseline: number
}

/**
 * The fused score is a weighted sum of the three view scores, so its Shapley values are exact:
 * each view's value is its weight times how far its score sits above a typical normal line.
 * Base value + the three values = the final score. Bars that push the score up are crimson,
 * bars that pull it down are blue.
 */
export function shapValues(parts: ShapPart[]) {
  const base = parts.reduce((sum, p) => sum + p.weight * p.baseline, 0)
  const values = parts.map((p) => ({ ...p, phi: p.weight * (p.score - p.baseline) }))
  const final = base + values.reduce((sum, p) => sum + p.phi, 0)
  return { base, values, final }
}

export default function ShapWaterfall({ parts, threshold }: { parts: ShapPart[]; threshold: number | null }) {
  const { base, values, final } = shapValues(parts)
  // Largest push first, like a SHAP waterfall.
  const ordered = [...values].sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi))

  let running = base
  const steps = ordered.map((p) => {
    const from = running
    running += p.phi
    return { ...p, from, to: running }
  })
  const points = [base, final, threshold ?? base, ...steps.flatMap((s) => [s.from, s.to])]
  const lo = Math.min(0, ...points)
  const hi = Math.max(...points) * 1.08 || 1
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100

  return (
    <div className="shap" role="group" aria-label="Shapley attribution of the final score">
      <div className="shap__row shap__row--ends">
        <span className="shap__label">Typical normal line</span>
        <span className="shap__track">
          <span className="shap__mark" style={{ left: `${x(base)}%` }} />
          {threshold != null && <span className="shap__cutoff" style={{ left: `${x(threshold)}%` }} />}
        </span>
        <span className="shap__value num">{formatScore(base)}</span>
      </div>
      {steps.map((step, index) => {
        const up = step.phi >= 0
        const left = x(Math.min(step.from, step.to))
        const width = Math.max(Math.abs(x(step.to) - x(step.from)), 0.8)
        return (
          <div className="shap__row" key={step.view}
            title={`${viewCopy(step.view).name}: score ${formatScore(step.score, 2)} against a typical ${formatScore(step.baseline, 2)}, weight ${Math.round(step.weight * 100)}%`}>
            <span className="shap__label">
              <span className="tag__swatch" style={{ '--swatch': viewVar(step.view) } as CSSProperties} />
              {viewCopy(step.view).name}
            </span>
            <span className="shap__track">
              {threshold != null && <span className="shap__cutoff" style={{ left: `${x(threshold)}%` }} />}
              <span className={up ? 'shap__bar shap__bar--up' : 'shap__bar shap__bar--down'}
                style={{ left: `${left}%`, width: `${width}%`, animationDelay: `${index * 120}ms` }} />
            </span>
            <span className={up ? 'shap__value shap__value--up num' : 'shap__value shap__value--down num'}>
              {up ? '+' : '-'}{formatScore(Math.abs(step.phi))}
            </span>
          </div>
        )
      })}
      <div className="shap__row shap__row--ends">
        <span className="shap__label"><strong>This line</strong></span>
        <span className="shap__track">
          <span className="shap__mark shap__mark--final" style={{ left: `${x(final)}%` }} />
          {threshold != null && <span className="shap__cutoff" style={{ left: `${x(threshold)}%` }} />}
        </span>
        <span className="shap__value num"><strong>{formatScore(final)}</strong></span>
      </div>
      <p className="shap__note">
        Each bar is weight x (score - typical normal score). Crimson pushes the score up, blue pulls it down.
        {threshold != null && ' The dashed line is the cutoff at that moment.'}
      </p>
    </div>
  )
}
