import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { Incident, ScoreBucket } from '../api/types'
import { formatInt, formatLogDate, formatLogTime, formatPercent, formatScore } from '../lib/format'
import { useInView } from '../lib/useInView'
import { bySeverity, severityVar } from '../lib/vocabulary'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const HEIGHT = 300
const MARGIN = { top: 14, right: 12, bottom: 34, left: 40 }

/** Index of the last slice that starts at or before a given log line. */
const bucketOfRow = (buckets: ScoreBucket[], row: number) => {
  let found = 0
  buckets.forEach((b, i) => { if (b.row_start <= row) found = i })
  return found
}

const bucketOfTime = (buckets: ScoreBucket[], iso: string) => {
  const t = Date.parse(iso)
  let found = 0
  buckets.forEach((b, i) => { if (Date.parse(b.time) <= t) found = i })
  return found
}

export interface ScoreChartProps {
  buckets: ScoreBucket[]
  incidents: Incident[]
  trainEndRow: number | null
  driftRow: number | null
  selected: number | null
  onSelect: (incidentId: number) => void
}

/**
 * The headline chart: the worst fused score per slice of the log, the moving cutoff, a strip showing
 * where lines were flagged, the learning window, the drift point and one marker per incident.
 */
export function ScoreChart({ buckets, incidents, trainEndRow, driftRow, selected, onSelect }: ScoreChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [inViewRef, drawn] = useInView<HTMLDivElement>(0.2)
  const [hover, setHover] = useState<number | null>(null)
  const gradient = useId().replace(/:/g, '')

  const n = buckets.length
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const top = Math.max(1, Math.ceil(Math.max(...buckets.map((b) => b.max_score), 0) * 10) / 10)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * innerWidth : 0)
  const y = (v: number) => innerHeight - (v / top) * innerHeight
  const maxFlagged = Math.max(...buckets.map((b) => b.n_anomalies), 1)

  const line = useMemo(
    () => buckets.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b.max_score).toFixed(1)}`).join(''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buckets, innerWidth, top])
  const area = `${line}L${x(n - 1).toFixed(1)},${innerHeight}L0,${innerHeight}Z`
  const cutoff = buckets
    .map((b, i) => (b.mean_threshold == null ? null : `${x(i).toFixed(1)},${y(b.mean_threshold).toFixed(1)}`))
    .filter((p): p is string => p !== null)
    .map((p, i) => `${i ? 'L' : 'M'}${p}`).join('')

  const sameDay = n > 0 && buckets[0].time.slice(0, 10) === buckets[n - 1].time.slice(0, 10)
  const tickIndexes = n > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))) : []
  const learningEnd = trainEndRow == null ? null : bucketOfRow(buckets, trainEndRow)
  const driftStart = driftRow == null ? null : bucketOfRow(buckets, driftRow)
  const hovered = hover === null ? null : buckets[hover]

  const markers = incidents.map((incident) => {
    const index = bucketOfTime(buckets, incident.start_time)
    return { incident, index, bucket: buckets[index] }
  })

  const onKey = (event: KeyboardEvent, id: number) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(id) }
  }

  return (
    <figure className="chart">
      <div ref={inViewRef}>
        <div ref={ref} className="chart__plot"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const index = Math.round(((event.clientX - box.left - MARGIN.left) / innerWidth) * (n - 1))
            setHover(index >= 0 && index < n ? index : null)
          }}
          onPointerLeave={() => setHover(null)}>
          {width > 0 && n > 1 && (
            <svg width={width} height={HEIGHT} role="img"
              aria-label={`Worst anomaly score across the log with the moving cutoff, ${incidents.length} incident markers, and where drift was flagged. A table follows.`}>
              <defs>
                <linearGradient id={`area-${gradient}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--peri)" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="var(--peri)" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id={`line-${gradient}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="var(--peri-deep)" />
                  <stop offset="100%" stopColor="var(--peri-deep)" />
                </linearGradient>
              </defs>
              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {learningEnd !== null && learningEnd > 0 && (
                  <g>
                    <rect x={0} y={0} width={x(learningEnd)} height={innerHeight} fill="var(--peri)" opacity={0.28} />
                    <text x={6} y={12} className="chart__tick">Learning window</text>
                  </g>
                )}
                {driftStart !== null && (
                  <g>
                    <rect x={x(driftStart)} y={0} width={Math.max(innerWidth - x(driftStart), 0)} height={innerHeight}
                      fill="var(--alert)" opacity={0.1} />
                    <line x1={x(driftStart)} x2={x(driftStart)} y1={0} y2={innerHeight} stroke="var(--alert)" strokeDasharray="4 3" />
                    <text x={x(driftStart) + 6} y={12} className="chart__tick" style={{ fill: 'var(--alert)' }}>Drift flagged</text>
                  </g>
                )}
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <g key={f} transform={`translate(0,${y(f * top)})`}>
                    <line x1={0} x2={innerWidth} className="chart__grid" />
                    <text x={-8} dy="0.32em" textAnchor="end" className="chart__tick">{(f * top).toFixed(2).replace(/0$/, '')}</text>
                  </g>
                ))}
                <path d={area} fill={`url(#area-${gradient})`} className={drawn ? 'score__area score__area--in' : 'score__area'} />
                {cutoff && <path d={cutoff} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.8} />}
                <path d={line} fill="none" stroke={`url(#line-${gradient})`} strokeWidth={2.25} strokeLinejoin="round"
                  pathLength={1} className={drawn ? 'score__line score__line--in' : 'score__line'} />
                {buckets.map((b, i) => b.n_anomalies > 0 && (
                  <rect key={i} x={x(i) - Math.max(innerWidth / n / 2, 0.75)} y={innerHeight + 6}
                    width={Math.max(innerWidth / n, 1.5)} height={6} fill="var(--alert)"
                    opacity={0.25 + 0.75 * (b.n_anomalies / maxFlagged)} />
                ))}
                {tickIndexes.map((i) => (
                  <text key={i} x={x(i)} y={innerHeight + 28} className="chart__tick"
                    textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                    {sameDay ? buckets[i].time.slice(11, 16) : formatLogDate(buckets[i].time)}
                  </text>
                ))}
                {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={innerHeight} className="chart__marker" />}
                {markers.map(({ incident, index, bucket }) => {
                  const color = severityVar(incident.peak_severity ?? 'MEDIUM')
                  const isSelected = incident.incident_id === selected
                  return (
                    <g key={incident.incident_id} transform={`translate(${x(index)},${y(bucket.max_score)})`}
                      className="score__marker cursor-target" role="button" tabIndex={0}
                      aria-label={`Incident ${incident.incident_id}, ${incident.peak_severity?.toLowerCase() ?? 'unrated'}, ${formatInt(incident.n_anomalies)} flagged lines`}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(incident.incident_id)} onKeyDown={(e) => onKey(e, incident.incident_id)}>
                      {isSelected && <circle r={11} fill={color} opacity={0.25} className="score__pulse" />}
                      <circle r={isSelected ? 7 : 5.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
          {hovered && hover !== null && (
            <div className="chart__tip" role="status"
              style={{ left: Math.min(Math.max(MARGIN.left + x(hover), 90), width - 90) }}>
              <strong>{formatLogTime(hovered.time)}</strong>
              <span className="chart__tip-row"><span>Worst score</span><span className="num">{formatScore(hovered.max_score, 2)}</span></span>
              {hovered.mean_threshold != null && (
                <span className="chart__tip-row"><span>Cutoff</span><span className="num">{formatScore(hovered.mean_threshold, 2)}</span></span>
              )}
              <span className="chart__tip-row"><span>Flagged lines</span><span className="num">{formatInt(hovered.n_anomalies)}</span></span>
            </div>
          )}
        </div>
      </div>
      <ul className="chart-key" aria-label="Chart key">
        <li><span className="chart-key__line" />Worst score</li>
        <li><span className="chart-key__dash" />Moving cutoff</li>
        <li><span className="chart-key__strip" />Flagged lines</li>
        <li><span className="chart-key__dot" />Incident, coloured by severity</li>
      </ul>
      <details className="chart__table">
        <summary>Show the highest-scoring slices as a table</summary>
        <table>
          <thead>
            <tr><th scope="col">Time</th><th scope="col" className="num-cell">Worst score</th><th scope="col" className="num-cell">Flagged lines</th></tr>
          </thead>
          <tbody>
            {[...buckets].sort((a, b) => b.max_score - a.max_score).slice(0, 8).map((b) => (
              <tr key={b.row_start}>
                <th scope="row">{formatLogTime(b.time)}</th>
                <td className="num-cell">{formatScore(b.max_score, 2)}</td>
                <td className="num-cell">{formatInt(b.n_anomalies)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

const RADIUS = 48
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Severity split as a ring. Every slice is also named in the key beside it. */
export function SeverityDonut({ counts }: { counts: Record<string, number> }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.3)
  const [hot, setHot] = useState<string | null>(null)
  const names = Object.keys(counts).sort(bySeverity).reverse()
  const total = names.reduce((sum, name) => sum + counts[name], 0)
  let offset = 0
  return (
    <div className="donut" ref={ref}>
      <svg viewBox="0 0 120 120" role="img"
        aria-label={names.map((name) => `${name.toLowerCase()} ${formatInt(counts[name])}`).join(', ')}>
        <circle cx={60} cy={60} r={RADIUS} fill="none" stroke="var(--line)" strokeWidth={14} />
        {names.map((name) => {
          const length = total ? (counts[name] / total) * CIRCUMFERENCE : 0
          const gap = names.length > 1 && length > 3 ? 2.5 : 0
          const start = offset
          offset += length
          return (
            <circle key={name} cx={60} cy={60} r={RADIUS} fill="none" stroke={severityVar(name)} strokeWidth={14}
              strokeDasharray={`${Math.max(length - gap, 0)} ${CIRCUMFERENCE}`}
              strokeDashoffset={seen ? -start : -start + length}
              transform="rotate(-90 60 60)" className={`donut__arc${hot === name ? ' is-hot' : ''}`}
              style={{ opacity: seen ? (hot && hot !== name ? 0.3 : 1) : 0 } as CSSProperties}
              onPointerEnter={() => setHot(name)} onPointerLeave={() => setHot(null)}>
              <title>{`${name.toLowerCase()}: ${formatInt(counts[name])} lines`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="donut__centre">
        <span className="donut__total num">{formatInt(total)}</span>
        <span className="caps">flagged</span>
      </div>
      <ul className="donut__key">
        {names.map((name) => (
          <li key={name} className={hot === name ? 'is-hot' : ''}
            onPointerEnter={() => setHot(name)} onPointerLeave={() => setHot(null)}>
            <span className="tag__swatch" style={{ '--swatch': severityVar(name) } as CSSProperties} />
            <span className="donut__name">{name.toLowerCase()}</span>
            <span className="num">{formatInt(counts[name])}</span>
            <span className="muted num">{formatPercent(total ? counts[name] / total : 0, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
