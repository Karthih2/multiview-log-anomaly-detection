const integer = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const formatInt = (value: number | null | undefined) => (value == null ? '-' : integer.format(value))
export const formatCompact = (value: number) => compact.format(value)

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null) return '-'
  const smallest = 10 ** -digits
  // A real but tiny share must not print as a flat zero.
  if (fraction > 0 && fraction * 100 < smallest) return `under ${smallest.toFixed(digits)}%`
  return `${(fraction * 100).toFixed(digits)}%`
}

export function formatScore(value: number | null | undefined, digits = 3): string {
  return value == null ? '-' : value.toFixed(digits)
}

/** Timestamps the backend generates are UTC without a zone suffix. */
export function parseServerTime(iso: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Log timestamps are shown exactly as logged: no time-zone conversion. */
export function formatLogDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
}

export function formatLogTime(iso: string): string {
  return `${formatLogDate(iso)}, ${iso.slice(11, 19)}`
}

export function formatClock(iso: string): string {
  return iso.slice(11, 23)
}

export function logSpan(startIso: string, endIso: string): string {
  return formatDuration(Date.parse(endIso) - Date.parse(startIso))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

/** Left-pad a run id the way a ticket serial is printed. */
export const serial = (id: number) => String(id).padStart(4, '0')
