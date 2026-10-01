import type { ReactNode } from 'react'
import type { ApiError } from '../api/client'

export function ErrorNotice({ error, onRetry, title = 'This could not be loaded' }: {
  error: ApiError
  onRetry?: () => void
  title?: string
}) {
  return (
    <div className="notice notice--error" role="alert">
      <h3>{title}</h3>
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="notice">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

/** Placeholder lines shaped like the text they stand in for. */
export function SkeletonLines({ widths }: { widths: string[] }) {
  return (
    <div aria-hidden="true">
      {widths.map((width, i) => (
        <span key={i} className="skeleton skeleton--line" style={{ width }} />
      ))}
    </div>
  )
}

export function SkeletonBlock({ height, width = '100%' }: { height: string; width?: string }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden="true" />
}

export function SkeletonRows({ rows, height = '2.75rem' }: { rows: number; height?: string }) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: '0.5rem' }}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="sr-only" role="status">
      {label}
    </span>
  )
}
