import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { DriftSignal, TimelinePoint } from '../api/types'
import { formatCompact, formatInt, formatLogDate } from '../lib/format'
import { bySeverity, severityVar } from '../lib/vocabulary'
import { prefersReducedMotion, SeverityTag } from './Ephemera'

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

/** Round an axis maximum up to 1, 2 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const scaled = value / power
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * power
}

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Logs shorter than this are charted per hour; a per-day chart would be one or two bars. */
const HOURLY_BELOW_MS = 4 * DAY_MS
const MAX_BAND_PX = 56
/** Width of one axis-label character at the tick font size, and the gap kept between labels. */
const LABEL_CHAR_PX = 7.3
const LABEL_GAP_PX = 10

export type Bucket = 'day' | 'hour'

export function chooseBucket(startIso: string | null, endIso: string | null): Bucket {
  if (!startIso || !endIso) return 'day'
  return Date.parse(endIso) - Date.parse(startIso) < HOURLY_BELOW_MS ? 'hour' : 'day'
}

/** Bucket keys are "YYYY-MM-DD" or "YYYY-MM-DD HH:00"; both are read as UTC so no zone shifts them. */
const bucketTime = (key: string) => Date.parse(key.length > 10 ? `${key.replace(' ', 'T')}:00Z` : key)
const bucketKey = (time: number, bucket: Bucket) => {
  const iso = new Date(time).toISOString()
  return bucket === 'day' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 13)}:00`
}
const bucketLabel = (key: string) => (key.length > 10 ? `${formatLogDate(key)}, ${key.slice(11)}` : formatLogDate(key))

interface Day {
  date: string
  total: number
  counts: Record<string, number>
}

function fillDays(points: TimelinePoint[], bucket: Bucket): { days: Day[]; severities: string[] } {
  const step = bucket === 'day' ? DAY_MS : HOUR_MS
  const byDate = new Map<string, Record<string, number>>()
  const severities = new Set<string>()
  for (const point of points) {
    severities.add(point.severity)
    const counts = byDate.get(point.date) ?? {}
    counts[point.severity] = point.count
    byDate.set(point.date, counts)
  }
  const dates = [...byDate.keys()].sort()
  const days: Day[] = []
  if (dates.length) {
    const end = bucketTime(dates[dates.length - 1])
    for (let t = bucketTime(dates[0]); t <= end; t += step) {
      const date = bucketKey(t, bucket)
      const counts = byDate.get(date) ?? {}
      days.push({ date, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) })
    }
  }
  return { days, severities: [...severities].sort(bySeverity) }
}

const CHART_HEIGHT = 280
const MARGIN = { top: 12, right: 8, bottom: 28, left: 44 }

/** Flagged anomalies per day or hour, stacked by severity. One axis, hover for the figures. */
export function TimelineChart({ points, bucket = 'day' }: { points: TimelinePoint[]; bucket?: Bucket }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  // Bars grow from the baseline once, the first time the chart scrolls into view.
  const [grown, setGrown] = useState(prefersReducedMotion)
  const { days, severities } = useMemo(() => fillDays(points, bucket), [points, bucket])

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const top = niceMax(Math.max(...days.map((d) => d.total), 0))
  const band = days.length ? Math.min(innerWidth / days.length, MAX_BAND_PX) : 0
  const gap = band > 4 ? 1 : 0
  const y = (value: number) => innerHeight - (value / top) * innerHeight
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top)
  // Axis labels: month starts for daily charts; midnights (or every third hour) for hourly ones.
  const hourStep = days.length > 36 ? 24 : 3
  const axisLabels = days
    .map((day, i) => ({ day, i }))
    .filter(({ day, i }) => {
      if (i === 0) return true
      if (bucket === 'day') return day.date.endsWith('-01')
      return Number(day.date.slice(11, 13)) % hourStep === 0
    })
    .map(({ day, i }) => {
      const month = MONTHS[Number(day.date.slice(5, 7)) - 1]
      if (bucket === 'day') {
        return { i, text: `${month}${i === 0 || day.date.slice(5, 7) === '01' ? ` ${day.date.slice(0, 4)}` : ''}` }
      }
      const midnight = day.date.slice(11, 13) === '00'
      return { i, text: i === 0 || midnight ? `${Number(day.date.slice(8, 10))} ${month}, ${day.date.slice(11)}` : day.date.slice(11) }
    })
    // Keep a label only if it clears the last one kept.
    .reduce<{ i: number; text: string }[]>((kept, label) => {
      const previous = kept[kept.length - 1]
      const room = previous ? previous.text.length * LABEL_CHAR_PX + LABEL_GAP_PX : 0
      return !previous || (label.i - previous.i) * band >= room ? [...kept, label] : kept
    }, [])
    // ...and only if it fits before the right edge.
    .filter((label) => label.i * band + label.text.length * LABEL_CHAR_PX <= innerWidth + MARGIN.right)
  const hovered = hover === null ? null : days[hover]

  useEffect(() => {
    const node = ref.current
    if (grown || !node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setGrown(true); observer.disconnect() }
    }, { threshold: 0.25 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [grown, ref])

  return (
    <figure className="chart">
      <div
        ref={ref}
        className="chart__plot"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const index = Math.floor((event.clientX - box.left - MARGIN.left) / band)
          setHover(index >= 0 && index < days.length ? index : null)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={CHART_HEIGHT} role="img"
            aria-label={`Flagged anomalies per ${bucket} from ${bucketLabel(days[0]?.date ?? '')} to ${bucketLabel(days[days.length - 1]?.date ?? '')}, stacked by severity. A table follows.`}>
            <defs>
              {severities.map((severity) => (
                <linearGradient key={severity} id={`sevgrad-${severity}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={severityVar(severity)} />
                  <stop offset="100%" stopColor={severityVar(severity)} stopOpacity="0.55" />
                </linearGradient>
              ))}
            </defs>
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {ticks.map((tick) => (
                <g key={tick} transform={`translate(0,${y(tick)})`}>
                  <line x1={0} x2={innerWidth} className="chart__grid" />
                  <text x={-8} dy="0.32em" textAnchor="end" className="chart__tick">
                    {formatCompact(tick)}
                  </text>
                </g>
              ))}
              {days.map((day, i) => {
                let base = 0
                return (
                  <g key={day.date} transform={`translate(${i * band},0)`} opacity={hover === null || hover === i ? 1 : 0.45}>
                    <g className={grown ? 'chart__stack chart__stack--in' : 'chart__stack'}
                      style={{ transitionDelay: `${Math.min(i * 8, 320)}ms` }}>
                    {severities.map((severity) => {
                      const count = day.counts[severity] ?? 0
                      if (!count) return null
                      const y1 = y(base + count)
                      const height = y(base) - y1
                      base += count
                      return (
                        <rect key={severity} x={gap / 2} y={y1} width={Math.max(band - gap, 0.5)}
                          height={Math.max(height - (height > 3 ? 1 : 0), 0.5)} fill={`url(#sevgrad-${severity})`} />
                      )
                    })}
                    </g>
                  </g>
                )
              })}
              {axisLabels.map((label) => (
                <text key={label.i} x={label.i * band} y={innerHeight + 18} className="chart__tick">{label.text}</text>
              ))}
              <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} className="chart__axis" />
            </g>
          </svg>
        )}
        {hovered && (
          <div className="chart__tip" role="status"
            style={{ left: Math.min(Math.max(MARGIN.left + (hover! + 0.5) * band, 90), width - 90) }}>
            <strong>{bucketLabel(hovered.date)}</strong>
            {hovered.total === 0 ? (
              <span>No anomalies</span>
            ) : (
              severities.filter((s) => hovered.counts[s]).map((s) => (
                <span key={s} className="chart__tip-row">
                  <SeverityTag severity={s} />
                  <span className="num">{formatInt(hovered.counts[s])}</span>
                </span>
              ))
            )}
          </div>
        )}
      </div>
      <details className="chart__table">
        <summary>Show the busiest {bucket}s as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{bucket === 'day' ? 'Day' : 'Hour'}</th>
              {severities.map((s) => <th scope="col" key={s} className="num-cell">{s.toLowerCase()}</th>)}
              <th scope="col" className="num-cell">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...days].sort((a, b) => b.total - a.total).slice(0, 10).map((day) => (
              <tr key={day.date}>
                <th scope="row">{bucketLabel(day.date)}</th>
                {severities.map((s) => <td key={s} className="num-cell">{formatInt(day.counts[s] ?? 0)}</td>)}
                <td className="num-cell">{formatInt(day.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

export interface BarRow {
  key: string
  label: ReactNode
  value: number
  display?: string
  colour?: string
  note?: ReactNode
}

/** Horizontal bars with the figure printed beside each bar. No track, no axis. */
export function BarList({ rows, max, labelWidth = '9rem', stacked = false }: {
  rows: BarRow[]
  max?: number
  labelWidth?: string
  /** Put each label on its own line above the bar (for long labels). */
  stacked?: boolean
}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0)
  return (
    <ul className={stacked ? 'bars bars--stacked' : 'bars'} style={{ '--label-width': labelWidth } as CSSProperties}>
      {rows.map((row) => (
        <li key={row.key} className="bars__row">
          <span className="bars__label">{row.label}</span>
          <span className="bars__track">
            <span className="bars__bar" style={{
              '--ratio': top > 0 ? row.value / top : 0,
              '--bar': row.colour ?? 'var(--view-semantic)',
            } as CSSProperties} />
            <span className="bars__value num">{row.display ?? formatInt(row.value)}</span>
          </span>
          {row.note && <span className="bars__note">{row.note}</span>}
        </li>
      ))}
    </ul>
  )
}

/** One bar split into shares that add up to the whole, each share labelled. */
export function ShareBar({ parts }: { parts: { key: string; label: string; share: number; colour: string }[] }) {
  return (
    <div className="share" role="img"
      aria-label={parts.map((p) => `${p.label} ${(p.share * 100).toFixed(0)} percent`).join(', ')}>
      {parts.map((part) => (
        <span key={part.key} className="share__part" style={{ flexGrow: part.share, '--bar': part.colour } as CSSProperties}>
          <span className="share__label">{part.label}</span>
          <span className="num">{(part.share * 100).toFixed(0)}%</span>
        </span>
      ))}
    </div>
  )
}

const DRIFT_HEIGHT = 150
const DRIFT_MARGIN = { top: 10, right: 8, bottom: 24, left: 36 }

/** KS statistic per window. Windows the detector flagged as drifted are marked along the base. */
export function DriftChart({ signal, trainEnd }: { signal: DriftSignal; trainEnd: number | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const windows = signal.windows
  const innerWidth = Math.max(0, width - DRIFT_MARGIN.left - DRIFT_MARGIN.right)
  const innerHeight = DRIFT_HEIGHT - DRIFT_MARGIN.top - DRIFT_MARGIN.bottom
  const lastRow = windows.length ? windows[windows.length - 1].window_end : 1
  const x = (row: number) => (row / lastRow) * innerWidth
  const y = (ks: number) => innerHeight - ks * innerHeight
  const path = windows
    .map((w, i) => `${i === 0 ? 'M' : 'L'}${x(w.window_start)},${y(w.ks_stat)}H${x(w.window_end)}`)
    .join('')
  const hovered = hover === null ? null : windows[hover]

  return (
    <div ref={ref} className="chart__plot"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        const row = ((event.clientX - box.left - DRIFT_MARGIN.left) / innerWidth) * lastRow
        const index = windows.findIndex((w) => row >= w.window_start && row < w.window_end)
        setHover(index === -1 ? null : index)
      }}
      onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={DRIFT_HEIGHT} role="img"
          aria-label={`KS statistic per window for the ${signal.signal} signal across ${windows.length} windows.`}>
          <g transform={`translate(${DRIFT_MARGIN.left},${DRIFT_MARGIN.top})`}>
            {[0, 0.5, 1].map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line x1={0} x2={innerWidth} className="chart__grid" />
                <text x={-8} dy="0.32em" textAnchor="end" className="chart__tick">{tick}</text>
              </g>
            ))}
            {windows.filter((w) => w.drift_flagged).map((w) => (
              <rect key={w.window_start} x={x(w.window_start)} y={innerHeight + 3}
                width={Math.max(x(w.window_end) - x(w.window_start) - 1, 1)} height={4} fill="var(--alert)" />
            ))}
            {trainEnd !== null && trainEnd < lastRow && (
              <g transform={`translate(${x(trainEnd)},0)`}>
                <line y1={0} y2={innerHeight} className="chart__marker" />
                <text x={6} y={10} className="chart__tick">held-out period</text>
              </g>
            )}
            <path d={path} className="chart__line" />
            {hovered && (
              <rect x={x(hovered.window_start)} y={0} width={x(hovered.window_end) - x(hovered.window_start)}
                height={innerHeight} className="chart__hover" />
            )}
          </g>
        </svg>
      )}
      {hovered && (
        <div className="chart__tip" role="status"
          style={{ left: Math.min(Math.max(DRIFT_MARGIN.left + x((hovered.window_start + hovered.window_end) / 2), 90), width - 90) }}>
          <strong>Rows {formatInt(hovered.window_start)} to {formatInt(hovered.window_end)}</strong>
          <span className="chart__tip-row"><span>KS statistic</span><span className="num">{hovered.ks_stat.toFixed(3)}</span></span>
          <span className="chart__tip-row"><span>Flagged as drift</span><span>{hovered.drift_flagged ? 'yes' : 'no'}</span></span>
        </div>
      )}
    </div>
  )
}
