import { useEffect, useState } from 'react'
import { fetchTrend } from './api.js'

const TREND_WEEKS = 13

/**
 * Weekly completion/bounce rate for the trend chart. Kept separate from
 * `useReviewRequests` — it doesn't follow the search/filter state, since the
 * point is to see the account's overall direction, not a filtered slice of it.
 */
export function useTrend(reloadKey) {
  const [weeks, setWeeks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchTrend(TREND_WEEKS, controller.signal)
      .then((payload) => setWeeks(payload.weeks))
      .catch((err) => {
        if (err.name !== 'AbortError') setWeeks([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadKey])

  return { weeks, loading }
}
