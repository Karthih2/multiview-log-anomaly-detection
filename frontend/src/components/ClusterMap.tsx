/*
 * References used for this map:
 *  1. D3 zoomable circle packing, circle size from a value, sorted largest first, padding between circles:
 *     https://observablehq.com/notebook-kit/ex/d3/zoomable-pack
 *  2. Mike Bostock, clustered force layout, circles seeded by packing and kept apart so none overlap:
 *     https://gist.github.com/mbostock/7882658
 *  3. Datadog Watchdog RCA, the answer is shown as a short ordered chain (root cause, critical failure, impact):
 *     https://docs.datadoghq.com/watchdog/rca/
 *  4. Dynatrace root cause analysis, ranked contributors with a drill-down to the evidence:
 *     https://docs.dynatrace.com/docs/dynatrace-intelligence/root-cause-analysis/concepts
 *  5. PagerDuty AIOps, "probable origin" shown beside related incidents:
 *     https://support.pagerduty.com/docs/aiops
 * Taken from them: size encodes count and the biggest circle comes first (1, 2); the hovered group lifts while
 * the rest dim, and each circle opens a drill-down (4); the tooltip names the likely origin and what fails with it (3, 5).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import type { RootCauseCluster } from '../api/types'
import { formatInt, formatLogTime, formatScore } from '../lib/format'
import { useInView } from '../lib/useInView'

const HEIGHT_MIN = 440
const HEIGHT_MAX = 600
/** Space kept between circles, enough for the name above and the count below each one. */
const GAP = 52
const LABEL_TOP = 24
const LABEL_BOTTOM = 30
const GOLDEN_ANGLE = 2.399963

interface Placed {
  cluster: RootCauseCluster
  index: number
  x: number
  y: number
  r: number
}

/** Cluster circles sized by incident count, placed on a spiral so none overlap and all stay in frame. */
function layout(clusters: RootCauseCluster[], width: number, height: number): Placed[] {
  if (!clusters.length || width <= 0) return []
  const maxN = Math.max(...clusters.map((c) => c.n_incidents), 1)
  const rMax = Math.min((height - LABEL_TOP - LABEL_BOTTOM) * 0.4, width * 0.21)
  const rMin = Math.min(36, rMax * 0.4)
  const placed: Placed[] = []
  const find = (r: number) => {
    for (let step = 0; step < 3000; step += 1) {
      const radius = step * 1.6
      const angle = step * 0.35
      const x = width / 2 + Math.cos(angle) * radius * (width / height) * 0.7
      const y = height / 2 + Math.sin(angle) * radius
      const inside = x - r >= 4 && x + r <= width - 4 && y - r - LABEL_TOP >= 0 && y + r + LABEL_BOTTOM <= height
      if (inside && placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAP)) return { x, y }
    }
    return null
  }
  clusters.forEach((cluster, index) => {
    // Shrink a circle until it finds room, so no cluster ever hides under another.
    let r = rMin + (rMax - rMin) * Math.sqrt(cluster.n_incidents / maxN)
    let spot = find(r)
    while (!spot && r > 14) {
      r *= 0.88
      spot = find(r)
    }
    placed.push({ cluster, index, x: spot?.x ?? width / 2, y: spot?.y ?? height / 2, r })
  })
  return placed
}

/** The incident a cluster opens from the keyboard: its largest one. */
const members0 = (cluster: RootCauseCluster): number | null =>
  cluster.incidents.reduce<{ id: number; n: number } | null>(
    (best, m) => (best && best.n >= m.n_anomalies ? best : { id: m.incident_id, n: m.n_anomalies }), null)?.id ?? null

type Hover = { kind: 'cluster'; index: number } | { kind: 'incident'; index: number; incidentId: number } | null

/**
 * Root-cause clusters in two dimensions. Each circle is a cluster (size = incidents); the dots inside
 * are its largest incidents (size = flagged lines), the biggest at the centre.
 */
export default function ClusterMap({ clusters, colours, totalIncidents, onOpen }: {
  clusters: RootCauseCluster[]
  colours: string[]
  totalIncidents: number
  onOpen: (incidentId: number) => void
}) {
  const [frameRef, seen] = useInView<HTMLDivElement>(0.2)
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<Hover>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const node = boxRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const height = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, width * 0.6))
  const placed = useMemo(() => layout(clusters, width, height), [clusters, width, height])
  const active = hover?.index ?? null
  const hoveredCluster = active === null ? null : clusters[active]
  const hoveredIncident = hover?.kind === 'incident'
    ? hoveredCluster?.incidents.find((i) => i.incident_id === hover.incidentId) ?? null
    : null

  const track = (event: PointerEvent) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (box) setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })
  }

  return (
    <div ref={frameRef} className="cmap">
      <div ref={boxRef} className="cmap__box" style={{ height }} onPointerMove={track} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label={`Root-cause clusters: ${clusters.map((c) => `${c.component} ${c.n_incidents} incidents`).join(', ')}. The table view lists the same figures.`}>
            {placed.map(({ cluster, index, x, y, r }) => {
              const colour = colours[index % colours.length]
              const dim = active !== null && active !== index
              const members = cluster.incidents
              const maxLines = Math.max(...members.map((m) => m.n_anomalies), 1)
              const inner = r - 8
              return (
                <g key={cluster.component} className={`cmap__cluster${seen ? ' is-in' : ''}${dim ? ' is-dim' : ''}`}
                  style={{ '--i': index } as CSSProperties}
                  onPointerEnter={() => setHover({ kind: 'cluster', index })}>
                  <g className={`cmap__lift${active === index ? ' is-lifted' : ''}`}>
                  <circle cx={x} cy={y} r={r} fill={colour} fillOpacity={active === index ? 0.2 : 0.1}
                    stroke={colour} strokeWidth={active === index ? 3 : 1.5} className="cmap__ring cursor-target"
                    tabIndex={0} role="button"
                    aria-label={`Cluster ${cluster.component}, ${formatInt(cluster.n_incidents)} incidents. Enter opens the largest.`}
                    onFocus={() => { setPointer({ x, y: y - r }); setHover({ kind: 'cluster', index }) }}
                    onBlur={() => setHover(null)}
                    onClick={() => members0(cluster) && onOpen(members0(cluster)!)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && members0(cluster)) { e.preventDefault(); onOpen(members0(cluster)!) } }} />
                  {members.map((member, m) => {
                    const distance = inner * Math.sqrt((m + 0.5) / members.length)
                    const angle = m * GOLDEN_ANGLE
                    const dotR = Math.max(2.6, Math.min(r * 0.17, 2.6 + (r * 0.17 - 2.6) * Math.sqrt(member.n_anomalies / maxLines)))
                    const focus = hover?.kind === 'incident' && hover.incidentId === member.incident_id
                    const dx = x + Math.cos(angle) * distance
                    const dy = y + Math.sin(angle) * distance
                    return (
                      <circle key={member.incident_id} cx={dx} cy={dy}
                        r={focus ? dotR + 2.5 : dotR} fill={colour} stroke="var(--paper)" strokeWidth={1.2}
                        className={`cmap__dot cursor-target${seen ? ' is-in' : ''}`} tabIndex={0} role="button"
                        style={{ '--d': m } as CSSProperties}
                        aria-label={`Incident ${member.incident_id}, ${formatInt(member.n_anomalies)} flagged lines, cluster ${cluster.component}`}
                        onPointerEnter={() => setHover({ kind: 'incident', index, incidentId: member.incident_id })}
                        onFocus={() => { setPointer({ x: dx, y: dy - dotR }); setHover({ kind: 'incident', index, incidentId: member.incident_id }) }}
                        onBlur={() => setHover(null)}
                        onClick={() => onOpen(member.incident_id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(member.incident_id) } }} />
                    )
                  })}
                  </g>
                  <text x={x} y={y - r - 8} textAnchor="middle" className="cmap__name">{cluster.component}</text>
                  <text x={x} y={y + r + 18} textAnchor="middle" className="cmap__count">
                    {formatInt(cluster.n_incidents)} incident{cluster.n_incidents === 1 ? '' : 's'}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
        {hoveredCluster && (
          <div className={`cmap__tip${pointer.y < 150 ? ' cmap__tip--below' : ''}`} role="status"
            style={{ left: Math.min(Math.max(pointer.x, 120), Math.max(width - 120, 120)), top: pointer.y }}>
            {hoveredIncident ? (
              <>
                <strong>Incident No. {hoveredIncident.incident_id}</strong>
                <span>{formatLogTime(hoveredIncident.start_time)}</span>
                <span><span className="num">{formatInt(hoveredIncident.n_anomalies)}</span> flagged lines</span>
                <span className="cmap__hint">Select to open it</span>
              </>
            ) : (
              <>
                <strong>{hoveredCluster.component} cluster</strong>
                <span><span className="num">{formatInt(hoveredCluster.n_incidents)}</span> incidents, {Math.round((hoveredCluster.n_incidents / Math.max(totalIncidents, 1)) * 100)}% of all</span>
                <span><span className="num">{formatInt(hoveredCluster.n_anomalies)}</span> flagged lines</span>
                <span>Avg severity <span className="num">{formatScore(hoveredCluster.avg_severity, 2)}</span>, origin score <span className="num">{formatScore(hoveredCluster.avg_root_cause_score, 2)}</span></span>
                <span>Fails with {hoveredCluster.co_components.length ? hoveredCluster.co_components.join(', ') : 'nothing else'}</span>
              </>
            )}
          </div>
        )}
      </div>
      <p className="cmap__note muted">
        Each circle is a cluster of incidents with the same likely origin. The dots inside are its largest incidents,
        sized by flagged lines. Hover for the figures, select a dot to open that incident.
      </p>
    </div>
  )
}
