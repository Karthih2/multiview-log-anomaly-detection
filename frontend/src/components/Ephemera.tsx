import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { severityVar, viewVar } from '../lib/vocabulary'
import CountUp from '../reactbits/CountUp'

/** Small deterministic generator so the same text always prints the same pattern. */
function seeded(text: string) {
  let state = 2166136261
  for (let i = 0; i < text.length; i += 1) state = Math.imul(state ^ text.charCodeAt(i), 16777619)
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

const BAR_UNITS = [1, 1, 2, 1, 3, 2, 1, 4]

/** Bars derived from `value`; decorative, so hidden from assistive tech. */
export function Barcode({ value, bars = 44 }: { value: string; bars?: number }) {
  const rects = useMemo(() => {
    const random = seeded(value)
    const out: { x: number; w: number }[] = []
    let x = 0
    for (let i = 0; i < bars; i += 1) {
      const w = BAR_UNITS[Math.floor(random() * BAR_UNITS.length)]
      if (i % 2 === 0) out.push({ x, w })
      x += w
    }
    return { out, width: x }
  }, [value, bars])
  return (
    <svg className="barcode" viewBox={`0 0 ${rects.width} 10`} preserveAspectRatio="none" aria-hidden="true">
      {rects.out.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={10} />
      ))}
    </svg>
  )
}

/** Rows of 0 and 1 that fade in from the top and then stay still. */
export function BinaryField({ seed, rows = 14, columns = 46 }: { seed: string; rows?: number; columns?: number }) {
  const cells = useMemo(() => {
    const random = seeded(seed)
    return Array.from({ length: rows * columns }, () => ({
      bit: random() > 0.5 ? '1' : '0',
      opacity: 0.12 + Math.floor(random() * 5) * 0.2,
    }))
  }, [seed, rows, columns])


  return (
    <div className="binary" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row}>
          {cells.slice(row * columns, (row + 1) * columns).map((cell, i) => (
            <span key={i} style={{ '--o': cell.opacity } as CSSProperties}>
              {cell.bit}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A whole number that counts up when it scrolls into view, or just prints if motion is unwanted. */
export function Count({ to, duration = 1.2 }: { to: number; duration?: number }) {
  if (prefersReducedMotion()) return <>{to.toLocaleString('en-US')}</>
  return <CountUp to={to} separator="," duration={duration} />
}

export interface TallyRow {
  label: string
  value: ReactNode
  note?: string
}

export function Tally({ rows, large = false }: { rows: TallyRow[]; large?: boolean }) {
  return (
    <dl className={large ? 'tally tally--large' : 'tally'}>
      {rows.map((row) => (
        <div className="tally__row" key={row.label}>
          <dt>{row.label}</dt>
          <span className="tally__lead" aria-hidden="true" />
          <dd>{row.value}</dd>
          {row.note && <p className="tally__note">{row.note}</p>}
        </div>
      ))}
    </dl>
  )
}

export function SeverityTag({ severity }: { severity: string }) {
  return (
    <span className="tag bracket">
      <span className="tag__swatch" style={{ '--swatch': severityVar(severity) } as CSSProperties} />
      {severity.toLowerCase()}
    </span>
  )
}

export function ViewTag({ view, children }: { view: string; children?: ReactNode }) {
  return (
    <span className="tag bracket">
      <span className="tag__swatch" style={{ '--swatch': viewVar(view) } as CSSProperties} />
      {children ?? view}
    </span>
  )
}
