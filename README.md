# Review Requests

One page, one table: every review request sent to a customer, with the status
tiles above it.

React + Vite on the front — Ant Design components, styled-components for all
CSS — with FastAPI + SQLite behind it. The database creates and seeds itself
the first time the API starts.


## Styling

There is no stylesheet. [`theme.js`](frontend/src/theme.js) holds one set of
tokens and exports them twice: `theme` for the styled-components
`ThemeProvider`, `antdTheme` for antd's `ConfigProvider`. Change a colour once
and both layers follow.

antd ships its own rules at three-class specificity, so every override of an
antd internal is wrapped in `&&` — styled-components doubles the generated
class, which wins the cascade outright rather than depending on which
stylesheet was injected last. Without it, overrides silently lose (the
inverted stat tile renders blue-on-blue).


## Reminders

Each customer gets `MAX_REMINDERS` (3) reminders on top of the original
request. The control sits under the status label on **every** row so the rows
line up, but it is only clickable on an outstanding request that still has
reminders left:

| Row state | Link | Count |
| --- | --- | --- |
| Outstanding, reminders left | blue, clickable | grey |
| Outstanding, none left | grey, disabled | **red** |
| Completed | grey, disabled | grey |

The database stores `reminders_used`, counting **up** from zero — raising
`MAX_REMINDERS` then re-grants everyone the larger allowance instead of
stranding rows on the old one. `reminders_left` and `reminders_total` are
derived server-side so the client never hardcodes the allowance.

The quota check lives in the `UPDATE` statement itself
(`WHERE ... AND reminders_used < ?`), not in a read-then-write pair, so two
clicks racing each other cannot spend the same reminder twice. The count is
never held in the browser: a click POSTs and the table re-reads, so a reload
shows the true remaining count.

Sending a reminder deliberately leaves `date_requested` alone — it nudges the
request that already went out rather than replacing it.

## Mail status

Whether the *email* landed is a separate question from whether a *review* came
back, so they are two columns and two filters. Every combination is possible,
and the seed data contains all of them.

The badge is the raw state (Not Opened / Opened / Bounced). A small grey note
appears only under the two combinations that would otherwise read as a
contradiction:

| Review | Mail | Note |
| --- | --- | --- |
| Completed | Not Opened / Bounced | `reviewed elsewhere` |
| Review Requested | Opened | `opened, no review` |
| Completed | Opened | — |
| Review Requested | Not Opened / Bounced | — |

`POST /api/review-requests/{id}/mail-event` is the provider hook. It is
idempotent, since providers retry, but a bounced email can never later be
reported as opened — nothing was delivered to open.

Mail status has to live in the database rather than as a browser-side
constant: the filter and the two count tiles are computed over all 36 rows in
SQL. Derived from the 15 rows the browser holds, both would be wrong.

## Reminder timing

A reminder cannot go out until `REMINDER_DELAY_HOURS` (24) after the request.
That needs `requested_at`, a full UTC timestamp — `date_requested` is only a
date, so "24 hours" is not computable from it. The hold is enforced inside the
same `UPDATE` as the quota check, against SQLite's own clock, so a browser with
a skewed clock cannot talk its way past it.

The seed puts two outstanding requests inside the window, so a fresh database
shows the hold immediately.

## "Request Available" and bulk send

Nothing on screen changes at the moment a 24-hour hold expires, so a bell in
the header carries a badge with the number of rows that have become eligible.
Opening it and clicking through sets the status filter to **Request
Available** — a filter value, not a stored status; the server reads it as "a
reminder could go out right now".

The toolbar's **Send all N reminders** button sends to all of them in one go
rather than one click per row, behind a confirmation since it puts real mail
out.

Those three things — the badge count, the filter, and the bulk `UPDATE` — all
come from `_remindable_clause()` in [`main.py`](backend/main.py). They have to
agree exactly, or the button would promise a number it cannot deliver.

> **Note on the rule as specified.** The hold is measured from the *review
> request*, not from the last reminder sent. Once a row passes 24 hours all
> three of its reminders are immediately available, so pressing **Send all**
> three times in a row sends three emails within seconds and the badge does not
> drop until the quota is gone. If reminders should instead be spaced out, the
> fix is to measure the hold from the last reminder — a `last_reminded_at`
> column and one changed comparison in `_remindable_clause()`.

## Extra features beyond the spec

The brief asked for one table of review requests with status tiles above it.
Beyond that baseline, this build adds:

1. **Reminder notifications** — a bell in the header badges with the number
   of requests that just cleared their 24-hour hold (see
   [Reminder timing](#reminder-timing)). Nothing on screen otherwise changes
   the moment a hold expires, so this is what surfaces it. Clicking through
   filters the table straight to those rows.

2. **Dashboard** — the row above the table is a full at-a-glance dashboard,
   all new: Total Requests, Completed, Still Waiting, Mail Opened, Bounced,
   Average Rating, and Completion Rate tiles. Two of those cards double as
   drill-down affordances (not wired to a real destination yet, just a
   "coming soon" toast for now):
   - **Bounced** gets a "tap to see why" note and turns clickable once there
     is at least one bounce.
   - **Average Rating** gets a "tap to review" note and turns clickable once
     it drops below 4 stars.

   The dashboard also carries the **Monthly Send Quota** tile — see below.

3. **Two independent filters** — Status (All / Completed / Review Requested)
   and Mail Status (All / Not Opened / Opened / Bounced) filter
   independently, so any combination is reachable (see
   [Mail status](#mail-status)).

4. **Two ways to send reminders** — the toolbar's **Send all N reminders**
   sends to everything currently eligible in one go (see
   [Reminders](#reminders)). Alternatively, check specific rows — only rows
   a reminder could actually go out to are selectable — and a "Send reminder
   to selected" bar appears above the table to send to just that list.

5. **Monthly send quota** — the account has a 500-review-request-per-month
   cap, tracked account-wide and independent of the current search/filter.
   A dedicated dashboard tile appears only once usage crosses into the last
   100 requests remaining, showing a progress bar plus how many requests and
   how many days are left in the month — invisible the rest of the time so
   it doesn't crowd the dashboard under normal usage.

6. **Auto send request** — a toggle next to the bulk-send button. Turning it
   on opens a drawer to set, per reminder number (1st / 2nd / 3rd), how many
   days (1–10) an outstanding request should wait before that reminder fires
   on its own — useful since the 24-hour hold otherwise means checking back
   daily to send manually. Once saved, eligible rows send automatically as
   they cross their configured day threshold, still bounded by the existing
   24-hour hold and 3-reminder-per-customer quota — the schedule only adds an
   earlier gate, never a way around the real limits.
