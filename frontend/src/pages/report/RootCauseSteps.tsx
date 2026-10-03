import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { IncidentDetail } from '../../api/types'
import { formatInt, formatScore } from '../../lib/format'
import { useInView } from '../../lib/useInView'
import { RANK_FACTORS } from '../../lib/vocabulary'
import type { RankFactorKey } from '../../lib/vocabulary'

const SHOWN_CANDIDATES = 3

/** Which ranking factors each step feeds, so hovering a step lights the matching bars. */
const STEP_FACTORS: Record<number, RankFactorKey[]> = {
  2: ['cooc_centrality_norm'],
  3: ['first_occurrence_priority_norm', 'avg_severity_norm', 'in_cluster_freq_norm'],
  4: RANK_FACTORS.map((f) => f.key),
}

/** The four steps engine/rca took for this incident, with the real numbers behind each. */
export default function RootCauseSteps({ incident }: { incident: IncidentDetail }) {
  const [ref, seen] = useInView<HTMLOListElement>(0.2)
  const [step, setStep] = useState<number | null>(null)
  const lit = step === null ? null : STEP_FACTORS[step] ?? []
  const candidates = incident.root_cause_candidates.slice(0, SHOWN_CANDIDATES)
  const components = incident.components_involved.length

  const steps = [
    { title: 'Incident grouped', body: <>
      <span className="num">{formatInt(incident.n_anomalies)}</span> flagged lines, each within 10 minutes of the next, form this one incident.</> },
    { title: 'Components that co-occur', body: <>
      <span className="num">{formatInt(components)}</span> component{components === 1 ? ' appears' : 's appear together'}: {incident.components_involved.join(', ')}.{components === 1 && ' With one component there is nothing to rank against, so every factor reads 0.'}</> },
    { title: 'Template signature', body: <>
      Lines fall into <span className="num">{formatInt(incident.n_distinct_templates)}</span> message kind{incident.n_distinct_templates === 1 ? '' : 's'}.
      Each component is scored on how early, how severe and how often its kinds appear.</> },
    { title: 'Ranked', body: <>
      Score = {RANK_FACTORS.map((f) => `${f.label.toLowerCase()} ${Math.round(f.weight * 100)}%`).join(', ')}.
      {incident.top_root_cause && <> Top: <strong>{incident.top_root_cause}</strong>.</>}</> },
  ]

  return (
    <div className="rcsteps">
      <ol ref={ref} className={`rcsteps__list${seen ? ' is-in' : ''}`}>
        {steps.map((item, i) => {
          const n = i + 1
          return (
            <li key={n} className={`rcsteps__step${step === n ? ' is-active' : ''}`} style={{ '--s': i } as CSSProperties}
              tabIndex={0}
              onPointerEnter={() => setStep(n)} onPointerLeave={() => setStep(null)}
              onFocus={() => setStep(n)} onBlur={() => setStep(null)}>
              <span className="rcsteps__n" aria-hidden="true">{n}</span>
              <span className="rcsteps__title">{item.title}</span>
              <span className="rcsteps__body">{item.body}</span>
            </li>
          )
        })}
      </ol>

      <ul className="rcsteps__cands">
        {candidates.map((candidate) => (
          <li key={candidate.component} className={`rcsteps__cand${candidate.rank === 1 ? ' is-top' : ''}`}>
            <p className="rcsteps__candhead">
              <strong>{candidate.component}</strong>
              <span className="num">{formatScore(candidate.root_cause_score, 2)}</span>
            </p>
            <ul className="rcsteps__bars">
              {RANK_FACTORS.map((factor) => {
                const value = candidate[factor.key]
                const state = lit === null ? '' : lit.includes(factor.key) ? ' is-lit' : ' is-dim'
                return (
                  <li key={factor.key} className={`rcsteps__bar${state}`}
                    title={`${factor.label}: ${formatScore(value, 2)} (weight ${Math.round(factor.weight * 100)}%)`}>
                    <span className="rcsteps__barlabel">{factor.label}</span>
                    <span className="rcsteps__track">
                      <span className="rcsteps__fill" style={{ '--ratio': value } as CSSProperties} />
                    </span>
                    <span className="num rcsteps__barvalue">{formatScore(value, 2)}</span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
