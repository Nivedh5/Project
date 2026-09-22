import { STATUS_ALL } from './constants.js'

async function apiJson(path, options) {
  const res = await fetch(path, options)
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json()).detail || ''
    } catch {
      // Non-JSON error body — fall back to the status text.
    }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

// Every list parameter goes to the server: the API returns one page of rows,
// already filtered and sorted, and the browser renders exactly what it gets.
export function fetchReviewRequests(
  { search, status, mailStatus, sort, direction, page, pageSize },
  signal,
) {
  const params = new URLSearchParams({
    sort,
    direction,
    page: String(page),
    page_size: String(pageSize),
  })
  if (search) params.set('search', search)
  if (status && status !== STATUS_ALL) params.set('status', status)
  if (mailStatus && mailStatus !== STATUS_ALL) params.set('mail_status', mailStatus)
  return apiJson(`/api/review-requests?${params}`, { signal })
}

export function fetchStats(search, signal) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  return apiJson(`/api/review-requests/stats?${params}`, { signal })
}

export function resetDemoData() {
  return apiJson('/api/review-requests/reset', { method: 'POST' })
}

export function sendAllReminders(search) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  return apiJson(`/api/review-requests/remind-all?${params}`, { method: 'POST' })
}

export function sendReminder(id) {
  return apiJson(`/api/review-requests/${id}/remind`, { method: 'POST' })
}

export function fetchTrend(weeks, signal) {
  const params = new URLSearchParams({ weeks: String(weeks) })
  return apiJson(`/api/review-requests/trend?${params}`, { signal })
}

export function fetchActivityLog(limit, signal) {
  const params = new URLSearchParams({ limit: String(limit) })
  return apiJson(`/api/activity-log?${params}`, { signal })
}
