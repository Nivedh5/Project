const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Render a stored 'YYYY-MM-DD' date. Parsed by hand rather than via `new Date`,
 * which reads a bare date string as UTC and can show the previous day for
 * anyone west of Greenwich.
 */
export function formatDate(iso) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

/** Render a stored 'YYYY-MM-DD' date compactly, for chart axis labels. */
export function formatShortDate(iso) {
  if (!iso) return ''
  const [, month, day] = iso.split('-').map(Number)
  if (!month || !day) return iso
  return `${MONTHS[month - 1]} ${day}`
}

/** Render an ISO instant from the API as a short local date + time. */
export function formatDateTime(iso) {
  if (!iso) return ''
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  return when.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
