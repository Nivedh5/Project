import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchReviewRequests,
  fetchStats,
  resetDemoData,
  sendAllReminders,
  sendReminder,
} from './api.js'
import { DEFAULT_SORT, PAGE_SIZE, SEARCH_DEBOUNCE_MS, STATUS_ALL } from './constants.js'

const EMPTY_PAGE = { rows: [], page: 1, page_size: PAGE_SIZE, total: 0, total_pages: 1 }

// `date_requested` is a plain date (no time); compare at UTC midnight so a
// request made earlier today already counts as day 0, not day -1.
function daysSince(dateStr) {
  if (!dateStr) return 0
  const requested = new Date(`${dateStr}T00:00:00Z`)
  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  return Math.floor((todayUtc - requested) / 86400000)
}

/**
 * Owns the whole query — search, status, sort, page — and keeps it in sync with
 * the server. Nothing here filters or sorts rows locally; `data.rows` is
 * rendered exactly as the API returned it.
 */
export function useReviewRequests() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState(STATUS_ALL)
  const [mailStatus, setMailStatus] = useState(STATUS_ALL)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [direction, setDirection] = useState('desc')
  const [page, setPage] = useState(1)

  const [data, setData] = useState(EMPTY_PAGE)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [autoSend, setAutoSend] = useState(false)
  // Days to wait, per reminder number (index 0 = reminder 1), before an
  // outstanding request's next reminder auto-fires. Configured in the drawer.
  const [reminderSchedule, setReminderSchedule] = useState([1, 3, 7])

  // Bumped after a write so the list and tiles re-read the server.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  // Any change to what is being looked at starts again from the first page.
  const firstQuery = useRef(true)
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false
      return
    }
    setPage(1)
  }, [debouncedSearch, status, mailStatus, sort, direction])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchReviewRequests(
      {
        search: debouncedSearch,
        status,
        mailStatus,
        sort,
        direction,
        page,
        pageSize: PAGE_SIZE,
      },
      controller.signal,
    )
      .then((payload) => {
        setData(payload)
        setError(null)
        // The server clamps a page past the end; follow it so the pager and
        // the rows agree.
        if (payload.page !== page) setPage(payload.page)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message)
        setData(EMPTY_PAGE)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [debouncedSearch, status, mailStatus, sort, direction, page, reloadKey])

  // The tiles follow the search but neither status filter — they are the
  // breakdown itself, so scoping them would zero out the other categories.
  useEffect(() => {
    const controller = new AbortController()
    fetchStats(debouncedSearch, controller.signal)
      .then(setStats)
      .catch((err) => {
        if (err.name !== 'AbortError') setStats(null)
      })
    return () => controller.abort()
  }, [debouncedSearch, reloadKey])

  // Sends to everything currently eligible under the same search the count
  // was taken with, so the button cannot promise more than it delivers.
  const remindAll = useCallback(async () => {
    const result = await sendAllReminders(debouncedSearch)
    reload()
    return result
  }, [debouncedSearch, reload])

  // The server owns the reminder count, so re-read rather than adjusting a
  // local copy — a reload also picks up anything another tab has spent.
  const remind = useCallback(
    async (id) => {
      const updated = await sendReminder(id)
      reload()
      return updated
    },
    [reload],
  )

  // While auto-send is on, walk the rows already on the current page (no
  // extra fetch) and fire any row whose next reminder has cleared its
  // configured day threshold. `can_remind` is still the server's own
  // eligibility (24-hour hold + quota) — the schedule only adds an earlier
  // gate on top of it, never a way around it.
  useEffect(() => {
    if (!autoSend) return
    data.rows.forEach((row) => {
      if (!row.can_remind) return
      const remindersUsed = row.reminders_total - row.reminders_left
      const thresholdDays = reminderSchedule[remindersUsed]
      if (thresholdDays == null) return
      if (daysSince(row.date_requested) >= thresholdDays) {
        remind(row.id).catch(() => {})
      }
    })
  }, [autoSend, reminderSchedule, data.rows, remind])

  // Puts the seeded dataset back: reminder counts, 24-hour holds and mail
  // statuses all return to a first-run state.
  const resetData = useCallback(async () => {
    const result = await resetDemoData()
    reload()
    return result
  }, [reload])

  const applySort = useCallback((field, nextDirection) => {
    setSort(field)
    setDirection(nextDirection)
  }, [])

  return {
    search,
    setSearch,
    status,
    setStatus,
    mailStatus,
    setMailStatus,
    sort,
    direction,
    applySort,
    // `page` itself is deliberately not returned: `data.page` is the
    // server-clamped value, and the two can differ for a frame.
    setPage,
    data,
    stats,
    loading,
    error,
    remind,
    remindAll,
    resetData,
    autoSend,
    setAutoSend,
    reminderSchedule,
    setReminderSchedule,
    // Exposed so other data views (the trend chart) can refresh in step with
    // writes made here, without duplicating reset/remind logic of their own.
    reloadKey,
    // For writes made outside this hook (creating a new request) that still
    // need the list, tiles and trend chart to pick up the change.
    reload,
  }
}
