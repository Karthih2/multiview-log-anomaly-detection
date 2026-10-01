import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet, getRun } from './client'
import type { RunDetail } from './types'

export interface Resource<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/** Fetch a GET endpoint. Pass `null` to skip. Refetches when the path changes. */
export function useApi<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: ApiError | null }>({
    path: null, data: null, error: null,
  })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (path === null) return
    const controller = new AbortController()
    apiGet<T>(path, controller.signal)
      .then((data) => setState({ path, data, error: null }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ path, data: null, error: error as ApiError })
      })
    return () => controller.abort()
  }, [path, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const current = state.path === path
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: path !== null && !current,
    reload,
  }
}

/** A paged list that grows with "show more". `basePath` may already carry a query string. */
export function usePaged<T>(basePath: string, pageSize: number) {
  const [state, setState] = useState<{ base: string; items: T[]; total: number | null }>({
    base: basePath, items: [], total: null,
  })
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [request, setRequest] = useState({ base: basePath, offset: 0 })

  // A new filter starts the list over.
  if (request.base !== basePath) setRequest({ base: basePath, offset: 0 })

  useEffect(() => {
    const controller = new AbortController()
    const separator = request.base.includes('?') ? '&' : '?'
    setLoading(true)
    setError(null)
    apiGet<{ items: T[]; total: number }>(
      `${request.base}${separator}limit=${pageSize}&offset=${request.offset}`, controller.signal)
      .then((page) => {
        setState((previous) => ({
          base: request.base,
          total: page.total,
          items: request.offset === 0 || previous.base !== request.base ? page.items : [...previous.items, ...page.items],
        }))
        setLoading(false)
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught as ApiError)
        setLoading(false)
      })
    return () => controller.abort()
  }, [request, pageSize])

  const current = state.base === basePath
  const items = current ? state.items : []
  const total = current ? state.total : null
  return {
    items,
    total,
    error,
    loading,
    initialLoading: loading && items.length === 0,
    hasMore: total !== null && items.length < total,
    more: () => setRequest({ base: basePath, offset: items.length }),
    retry: () => setRequest({ base: basePath, offset: items.length }),
  }
}

const POLL_INTERVAL_MS = 1000

/** Load a run and keep polling while it is queued or running. */
export function useRun(id: string | undefined) {
  const [run, setRun] = useState<RunDetail | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const controller = new AbortController()
    setRun(null)
    setError(null)

    const tick = async () => {
      try {
        const next = await getRun(id, controller.signal)
        if (cancelled) return
        setRun(next)
        setError(null)
        if (next.status === 'queued' || next.status === 'running') {
          timer.current = window.setTimeout(tick, POLL_INTERVAL_MS)
        }
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === 'AbortError')) return
        const apiError = caught as ApiError
        setError(apiError)
        // A dropped connection may come back; a 404 will not.
        if (apiError.status !== 404) timer.current = window.setTimeout(tick, POLL_INTERVAL_MS * 3)
      }
    }
    tick()
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer.current)
    }
  }, [id])

  return { run, error }
}

/** Seconds since mount-independent clock, ticking while `active`. Used for live elapsed times. */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(handle)
  }, [active, intervalMs])
  return now
}
