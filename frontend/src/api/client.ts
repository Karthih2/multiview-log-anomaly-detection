import type { Run, RunDetail } from './types'

export const API_PREFIX: string = import.meta.env.VITE_API_PREFIX || '/api/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let message = `The server answered ${response.status}.`
  try {
    const body = await response.json()
    if (typeof body.detail === 'string') message = body.detail
  } catch {
    // Not JSON: usually means the backend is not running behind the proxy.
    if (response.status >= 500) message = 'The backend is not reachable. Start it and try again.'
  }
  return new ApiError(response.status, message)
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_PREFIX + path, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'The backend is not reachable. Start it and try again.')
  }
  if (!response.ok) throw await parseError(response)
  return response.json() as Promise<T>
}

export function uploadLog(
  file: File,
  name: string,
  onProgress: (fraction: number) => void,
): Promise<Run> {
  // XMLHttpRequest because fetch cannot report upload progress.
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    if (name.trim()) form.append('name', name.trim())

    const request = new XMLHttpRequest()
    request.open('POST', `${API_PREFIX}/runs`)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    request.onerror = () => reject(new ApiError(0, 'The backend is not reachable. Start it and try again.'))
    request.onload = () => {
      let body: { detail?: unknown } | Run | null = null
      try {
        body = JSON.parse(request.responseText)
      } catch {
        body = null
      }
      if (request.status >= 200 && request.status < 300 && body) return resolve(body as Run)
      const detail = body && 'detail' in body && typeof body.detail === 'string' ? body.detail : null
      reject(new ApiError(request.status, detail ?? `Upload failed (${request.status}).`))
    }
    request.send(form)
  })
}

export async function deleteRun(id: number): Promise<void> {
  const response = await fetch(`${API_PREFIX}/runs/${id}`, { method: 'DELETE' })
  if (!response.ok) throw await parseError(response)
}

export const getRun = (id: number | string, signal?: AbortSignal) => apiGet<RunDetail>(`/runs/${id}`, signal)
