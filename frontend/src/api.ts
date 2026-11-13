// Small fetch wrapper for the Django API.
// Django checks a CSRF token on every POST/PATCH/DELETE: we read it from the
// `csrftoken` cookie and send it back in the X-CSRFToken header.

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, data: unknown) {
    super(`API request failed with status ${status}`)
    this.status = status
    this.data = data
  }

  /** The general message, e.g. "Incorrect username or password." */
  get detail(): string {
    const data = this.data as { detail?: unknown; non_field_errors?: unknown } | null
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.non_field_errors)) return data.non_field_errors.join(' ')
    if (this.status === 429) return 'Too many attempts. Please wait a minute and try again.'
    if (this.status >= 500) return 'Something went wrong on our side. Please try again.'
    return ''
  }

  /** Errors for one form field, joined into a sentence. */
  field(name: string): string {
    const value = (this.data as Record<string, unknown> | null)?.[name]
    return Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : ''
  }
}

function getCookie(name: string): string {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=')[1]) : ''
}

async function ensureCsrfCookie() {
  if (!getCookie('csrftoken')) {
    await fetch('/api/auth/csrf/', { credentials: 'same-origin' })
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') {
    await ensureCsrfCookie()
    headers['X-CSRFToken'] = getCookie('csrftoken')
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { detail: "Can't reach the server. Check your connection." })
  }

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data)
  return data as T
}
