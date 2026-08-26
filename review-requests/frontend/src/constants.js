export const PAGE_SIZE = 15
export const SEARCH_DEBOUNCE_MS = 300

export const STATUS_REQUESTED = 'Review Requested'
export const STATUS_COMPLETED = 'Completed'

// The one-at-a-time status filter. ALL is a sentinel, not a stored status —
// api.js drops it rather than sending it.
export const STATUS_ALL = 'all'

// Not a stored status — the server reads it as "a reminder could go out now".
export const STATUS_REMINDABLE = 'Request Available'

export const STATUS_FILTERS = [
  { value: STATUS_ALL, label: 'All' },
  { value: STATUS_COMPLETED, label: 'Completed' },
  { value: STATUS_REQUESTED, label: 'Review Requested' },
  { value: STATUS_REMINDABLE, label: 'Request Available' },
]

// How the email itself fared — a separate axis from the review status. Every
// combination of the two is possible.
export const MAIL_NOT_OPENED = 'Not Opened'
export const MAIL_OPENED = 'Opened'
export const MAIL_BOUNCED = 'Bounced'

export const MAIL_FILTERS = [
  { value: STATUS_ALL, label: 'All mail' },
  { value: MAIL_OPENED, label: 'Opened' },
  { value: MAIL_NOT_OPENED, label: 'Not Opened' },
  { value: MAIL_BOUNCED, label: 'Bounced' },
]

// Dates and ratings read best newest/highest first, text A→Z. The first entry
// of `sortDirections` is what a first click on that header gives you.
export const DEFAULT_DIRECTION = {
  customer_name: 'asc',
  customer_email: 'asc',
  star_rating: 'desc',
  date_requested: 'desc',
  date_completed: 'desc',
  status: 'asc',
  mail_status: 'asc',
}

export const DEFAULT_SORT = 'date_requested'
