"""
Review Requests API — Experience.com

One table of review requests sent to customers. Searching, filtering, sorting
and paging all happen in SQL: a page response never carries more than
`page_size` rows, no matter how large the table gets.

Run:  python main.py      # http://localhost:3001
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db import (
    DB_PATH,
    MAIL_BOUNCED,
    MAIL_OPENED,
    MAIL_STATUSES,
    MAX_REMINDERS,
    MONTHLY_REQUEST_LIMIT,
    REMINDER_DELAY_HOURS,
    SQL_DATETIME,
    STATUSES,
    STATUS_COMPLETED,
    STATUS_REQUESTED,
    connect,
    init_db,
    reset_db,
)

PORT = int(os.getenv("PORT") or "3001")
PAGE_SIZE = 15
MAX_PAGE_SIZE = 100

# Whitelist of sortable columns. Anything not in here is rejected, so the
# client-supplied sort key can never reach the SQL string as arbitrary text.
SORT_COLUMNS = {
    "customer_name": "customer_name",
    "customer_email": "customer_email",
    "star_rating": "star_rating",
    "date_requested": "date_requested",
    "date_completed": "date_completed",
    "status": "status",
    "mail_status": "mail_status",
}

# What a mail provider may report, mapped onto the stored value.
MAIL_EVENTS = {"opened": MAIL_OPENED, "bounced": MAIL_BOUNCED}

# Not a stored status — a filter for "a reminder could go out right now".
STATUS_REMINDABLE = "Request Available"


def _remindable_clause() -> tuple[str, list]:
    """SQL for a row whose reminder is unblocked, and its params.

    Defined once because three things must agree exactly: the filter, the count
    behind the badge, and the bulk send. If they drifted, the button would
    promise a number it could not deliver.
    """
    return (
        "(status = ? AND reminders_used < ? "
        f"AND requested_at <= datetime('now', '-{REMINDER_DELAY_HOURS} hours'))",
        [STATUS_REQUESTED, MAX_REMINDERS],
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    count = init_db()
    print("=" * 58)
    print("  Review Requests API — Experience.com")
    print("=" * 58)
    print(f"  Database:   {DB_PATH}")
    print(f"  Rows:       {count}")
    print(f"  Serving on: http://localhost:{PORT}")
    print("=" * 58, flush=True)
    yield


app = FastAPI(title="Review Requests", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Query building
# ---------------------------------------------------------------------------
def _filter_clause(
    search: str, status: str | None, mail_status: str | None = None
) -> tuple[str, list]:
    """Build the shared WHERE fragment for the list and stats queries."""
    clauses: list[str] = []
    params: list = []

    if search:
        # Escape the LIKE wildcards so a customer searching for "100%" does not
        # match everything.
        needle = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append(
            "(customer_name LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\')"
        )
        params += [f"%{needle}%", f"%{needle}%"]

    if status == STATUS_REMINDABLE:
        clause, clause_params = _remindable_clause()
        clauses.append(clause)
        params += clause_params
    elif status:
        clauses.append("status = ?")
        params.append(status)

    # Mail status is a separate axis from review status — every combination of
    # the two is possible, so they filter independently.
    if mail_status:
        clauses.append("mail_status = ?")
        params.append(mail_status)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


def _order_clause(sort: str, direction: str) -> str:
    column = SORT_COLUMNS[sort]
    dir_sql = "DESC" if direction == "desc" else "ASC"
    # Pending rows have no rating and no completion date. Keep those NULLs at
    # the bottom in both directions so sorting surfaces real values first, and
    # tie-break on id so paging stays stable across requests.
    return f"ORDER BY {column} IS NULL, {column} {dir_sql}, id ASC"


def _normalise(value: str | None, allowed: tuple[str, ...], label: str) -> str | None:
    """Map a one-at-a-time filter onto a stored value. 'all' means no clause."""
    if not value or value.lower() == "all":
        return None
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"Unknown {label}: {value}")
    return value


REMINDER_DELAY = timedelta(hours=REMINDER_DELAY_HOURS)


def _reminder_state(row, now: datetime) -> tuple[str | None, datetime]:
    """Why this row cannot be reminded (or None), and when it becomes eligible.

    Decided server-side rather than in the browser: the 24-hour hold is a rule
    about our clock, and a client with a skewed one would show the wrong state.
    """
    available_at = (
        datetime.strptime(row["requested_at"], SQL_DATETIME).replace(tzinfo=timezone.utc)
        + REMINDER_DELAY
    )
    if row["status"] == STATUS_COMPLETED:
        return "completed", available_at
    if MAX_REMINDERS - row["reminders_used"] <= 0:
        return "exhausted", available_at
    if now < available_at:
        return "too_soon", available_at
    return None, available_at


def _row_to_dict(row, now: datetime | None = None) -> dict:
    used = row["reminders_used"]
    now = now or datetime.now(timezone.utc)
    reason, available_at = _reminder_state(row, now)
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "customer_email": row["customer_email"],
        "star_rating": row["star_rating"],
        "date_requested": row["date_requested"],
        "date_completed": row["date_completed"],
        "status": row["status"],
        # The client renders "N/M left", so send both halves rather than making
        # it hardcode the allowance.
        "mail_status": row["mail_status"],
        "reminders_left": max(0, MAX_REMINDERS - used),
        "reminders_total": MAX_REMINDERS,
        # The client renders the copy; the server owns the rule.
        "can_remind": reason is None,
        "remind_block_reason": reason,
        "remind_available_at": available_at.isoformat().replace("+00:00", "Z"),
        "reminder_delay_hours": REMINDER_DELAY_HOURS,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/review-requests")
def list_review_requests(
    search: str = Query("", max_length=200),
    status: str | None = Query(None),
    mail_status: str | None = Query(None),
    sort: str = Query("date_requested"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    if sort not in SORT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Cannot sort by: {sort}")

    where, params = _filter_clause(
        search.strip(),
        _normalise(status, STATUSES + (STATUS_REMINDABLE,), "status"),
        _normalise(mail_status, MAIL_STATUSES, "mail status"),
    )

    conn = connect()
    try:
        total = conn.execute(
            f"SELECT COUNT(*) FROM review_requests {where}", params
        ).fetchone()[0]

        # Clamp the page so deleting rows or tightening a filter cannot strand
        # the client on an empty page past the end.
        total_pages = max(1, -(-total // page_size))
        page = min(page, total_pages)
        offset = (page - 1) * page_size

        rows = conn.execute(
            f"SELECT * FROM review_requests {where} "
            f"{_order_clause(sort, direction)} LIMIT ? OFFSET ?",
            params + [page_size, offset],
        ).fetchall()
    finally:
        conn.close()

    now = datetime.now(timezone.utc)
    return {
        "rows": [_row_to_dict(r, now) for r in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


@app.get("/api/review-requests/stats")
def review_request_stats(search: str = Query("", max_length=200)):
    """Summary tiles for the current search.

    Deliberately ignores the status filter: the tiles break the data down *by*
    status, so scoping them to one status would zero out the others and make
    the completion rate meaningless.
    """
    where, params = _filter_clause(search.strip(), None, None)

    remindable_sql, remindable_params = _remindable_clause()

    conn = connect()
    try:
        row = conn.execute(
            f"""SELECT COUNT(*)              AS total,
                       SUM({remindable_sql}) AS remindable,
                       SUM(status = ?)       AS completed,
                       SUM(status = ?)       AS pending,
                       SUM(mail_status = ?)  AS mail_opened,
                       SUM(mail_status = ?)  AS bounced,
                       AVG(star_rating)      AS avg_rating
                FROM review_requests {where}""",
            remindable_params
            + [STATUS_COMPLETED, STATUS_REQUESTED, MAIL_OPENED, MAIL_BOUNCED]
            + params,
        ).fetchone()

        # The monthly send quota is account-wide, not scoped to the current
        # search/filter — it counts every request sent this calendar month.
        monthly_used = conn.execute(
            "SELECT COUNT(*) AS n FROM review_requests "
            "WHERE requested_at >= datetime('now', 'start of month')"
        ).fetchone()["n"]
    finally:
        conn.close()

    total = row["total"] or 0
    completed = row["completed"] or 0
    return {
        "total": total,
        "completed": completed,
        "pending": row["pending"] or 0,
        "remindable": row["remindable"] or 0,
        "mail_opened": row["mail_opened"] or 0,
        "bounced": row["bounced"] or 0,
        # AVG skips NULLs, so this is the average over rated rows only.
        "avg_rating": round(row["avg_rating"], 2) if row["avg_rating"] is not None else None,
        "completion_rate": round(completed / total * 100, 1) if total else 0.0,
        "monthly_requests_used": monthly_used,
        "monthly_requests_limit": MONTHLY_REQUEST_LIMIT,
        "monthly_requests_remaining": max(0, MONTHLY_REQUEST_LIMIT - monthly_used),
    }


@app.post("/api/review-requests/{request_id}/remind")
def send_reminder(request_id: int):
    """Spend one of the customer's reminders.

    A reminder deliberately leaves `date_requested` alone — it nudges the
    request that already went out rather than replacing it.
    """
    # SQLite's datetime('now') is UTC, and `requested_at` is stored in the same
    # format, so the 24-hour hold is enforced by the UPDATE itself.
    conn = connect()
    try:
        # The guard lives in the UPDATE so two clicks racing each other cannot
        # both read the same count and spend the same reminder twice.
        cursor = conn.execute(
            f"""UPDATE review_requests
                   SET reminders_used = reminders_used + 1
                 WHERE id = ? AND status = ? AND reminders_used < ?
                   AND requested_at <= datetime('now', '-{REMINDER_DELAY_HOURS} hours')""",
            (request_id, STATUS_REQUESTED, MAX_REMINDERS),
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM review_requests WHERE id = ?", (request_id,)
        ).fetchone()

        if cursor.rowcount == 0:
            # Nothing changed — work out which rule stopped it.
            if row is None:
                raise HTTPException(status_code=404, detail="Review request not found")
            reason, available_at = _reminder_state(row, datetime.now(timezone.utc))
            if reason == "completed":
                raise HTTPException(
                    status_code=409,
                    detail="That customer has already left a review",
                )
            if reason == "too_soon":
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Reminders can only be sent {REMINDER_DELAY_HOURS} hours "
                        "after the review request"
                    ),
                )
            raise HTTPException(
                status_code=409,
                detail=f"No reminders left — all {MAX_REMINDERS} have been sent",
            )
    finally:
        conn.close()

    return _row_to_dict(row)


@app.post("/api/review-requests/reset")
def reset_demo_data():
    """Restore the seeded dataset, discarding every reminder and mail event."""
    count = reset_db()
    print(f"[reset] rebuilt {count} rows from the static dataset")
    return {"rows": count}


@app.post("/api/review-requests/remind-all")
def remind_all(search: str = Query("", max_length=200)):
    """Send a reminder to every row that is eligible right now.

    Scoped by the same search as the count on the button, so the number the
    user was shown is the number that actually goes out. One statement, so a
    row that stops being eligible mid-flight is simply skipped.
    """
    remindable_sql, remindable_params = _remindable_clause()
    where, where_params = _filter_clause(search.strip(), None, None)
    extra = where.replace("WHERE ", "AND ") if where else ""

    conn = connect()
    try:
        cursor = conn.execute(
            f"""UPDATE review_requests
                   SET reminders_used = reminders_used + 1
                 WHERE {remindable_sql} {extra}""",
            remindable_params + where_params,
        )
        conn.commit()
        sent = cursor.rowcount
    finally:
        conn.close()

    return {"sent": sent}


class MailEvent(BaseModel):
    event: str


@app.post("/api/review-requests/{request_id}/mail-event")
def record_mail_event(request_id: int, payload: MailEvent):
    """Endpoint for the mail provider to report what happened to the email.

    Idempotent — providers retry — but a bounced mail can never later be
    reported as opened, since nothing was delivered to open.
    """
    event = payload.event.strip().lower()
    if event not in MAIL_EVENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown event: {payload.event}. Expected one of {sorted(MAIL_EVENTS)}",
        )
    new_status = MAIL_EVENTS[event]

    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM review_requests WHERE id = ?", (request_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Review request not found")
        if new_status == MAIL_OPENED and row["mail_status"] == MAIL_BOUNCED:
            raise HTTPException(
                status_code=409, detail="A bounced email cannot be opened"
            )

        conn.execute(
            "UPDATE review_requests SET mail_status = ? WHERE id = ?",
            (new_status, request_id),
        )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM review_requests WHERE id = ?", (request_id,)
        ).fetchone()
    finally:
        conn.close()

    return _row_to_dict(updated)


# Serve the built UI from the API when it exists, so `npm run build` gives a
# single-process deployment. Mounted last so it never shadows /api.
_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="ui")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
