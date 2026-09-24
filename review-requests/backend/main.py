"""
Review Requests API — Experience.com

One table of review requests sent to customers. Searching, filtering, sorting
and paging all happen in SQL: a page response never carries more than
`page_size` rows, no matter how large the table gets.

Run:  python main.py      # http://localhost:3001
"""

import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

# Vercel loads this file via importlib from its absolute path rather than
# running it as a script, which — unlike `python main.py` — does not add
# this directory to sys.path. Without this, `from db import ...` below
# fails with ModuleNotFoundError in that environment even though it works
# locally.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from anthropic import Anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

from db import (
    DB_PATH,
    MAIL_BOUNCED,
    MAIL_NOT_OPENED,
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
    log_activity,
    reset_db,
)

PORT = int(os.getenv("PORT") or "3001")
PAGE_SIZE = 15
MAX_PAGE_SIZE = 100

CHAT_MODEL = "claude-haiku-4-5-20251001"

# Used whenever a request is created without its own subject/message — the
# form endpoint never collects either, and the chat assistant falls back to
# these if the user has no preference of their own.
DEFAULT_SUBJECT = "Your Feedback is Valuable!"
DEFAULT_MESSAGE = (
    "Thanks so much for working with us. We'd love to hear your thoughts — "
    "your feedback helps us keep providing the best experience possible."
)

# The one action the chat assistant can take — everything else is just
# conversation. Kept to a single tool so there's no ambiguity about what
# "done" means: the tool call itself is the completion signal.
CHAT_TOOLS = [
    {
        "name": "create_review_request",
        "description": (
            "Send a review request email to a customer. Call this only after the "
            "user has explicitly confirmed the name, email, subject and message "
            "you're about to send."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_name": {"type": "string", "description": "The customer's full name"},
                "customer_email": {"type": "string", "description": "The customer's email address"},
                "subject": {"type": "string", "description": "The email's subject line"},
                "message": {"type": "string", "description": "The email's body"},
            },
            "required": ["customer_name", "customer_email", "subject", "message"],
        },
    }
]

CHAT_SYSTEM_PROMPT = f"""You are a friendly assistant embedded in the "Request a Review" \
panel of a review-management dashboard. Your job is to collect the details of a \
review request email through brief, natural conversation, then send it — but only \
after the user has explicitly confirmed.

What you need, in order:
1. The customer's name.
2. The customer's email address.
3. A subject line and message body for the email. Offer this default and use it \
if the user is happy with it, doesn't care, or doesn't answer the question — \
don't stall here:
   Subject: "{DEFAULT_SUBJECT}"
   Message: "{DEFAULT_MESSAGE}"

Rules:
- Ask for whatever is still missing, one thing at a time. Keep every reply short \
(one to three sentences) — this is a chat panel, not an essay.
- Reply in plain text only — no markdown (no **bold**, no #headers, no bullet \
dashes). The chat bubble renders exactly what you send, asterisks included. For \
the summary, put each field on its own line as "Label: value".
- Once you have all four (name, email, subject, message), show the user a short \
summary of exactly what you're about to send and ask them to confirm.
- Only call create_review_request after the user replies affirmatively (e.g. \
"yes", "send it", "looks good") to that summary. Never call it in the same turn \
you first show the summary, even if you're confident every detail is right.
- If the user asks to change something after seeing the summary, update it and \
show the summary again before sending.
- If an email address looks malformed, point that out and ask for a corrected \
one instead of proceeding.
- Stay on topic: politely decline anything unrelated to sending this review request.
"""

_anthropic_client: Anthropic | None = None


def _get_anthropic_client() -> Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="ANTHROPIC_API_KEY is not configured on the server",
            )
        _anthropic_client = Anthropic(api_key=api_key)
    return _anthropic_client

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
    search: str,
    status: str | None,
    mail_status: str | None = None,
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
        "subject": row["subject"],
        "message": row["message"],
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


class NewReviewRequest(BaseModel):
    customer_name: str
    customer_email: str
    subject: str | None = None
    message: str | None = None


@app.post("/api/review-requests")
def create_review_request(payload: NewReviewRequest):
    """Send a brand-new review request to a customer.

    This is the one gap every other feature here assumed was already
    solved: nothing previously let a real new customer enter the system —
    the table was only ever the seeded demo dataset.
    """
    return _create_review_request(payload)


# Shared by the form-style endpoint above and the chat assistant below, so
# both paths enforce the same validation and quota rules through one place.
def _create_review_request(payload: NewReviewRequest) -> dict:
    name = payload.customer_name.strip()
    email = payload.customer_email.strip()
    subject = (payload.subject or "").strip() or DEFAULT_SUBJECT
    message = (payload.message or "").strip() or DEFAULT_MESSAGE
    if not name:
        raise HTTPException(status_code=400, detail="Customer name is required")
    if "@" not in email or not email:
        raise HTTPException(status_code=400, detail="A valid customer email is required")

    conn = connect()
    try:
        # Same rule the quota tile already displays — enforced here, not
        # just shown, so the tile's number is a promise the API keeps.
        monthly_used = conn.execute(
            "SELECT COUNT(*) AS n FROM review_requests "
            "WHERE requested_at >= datetime('now', 'start of month')"
        ).fetchone()["n"]
        if monthly_used >= MONTHLY_REQUEST_LIMIT:
            raise HTTPException(
                status_code=409,
                detail=f"Monthly send quota reached ({MONTHLY_REQUEST_LIMIT} requests)",
            )

        now = datetime.now(timezone.utc)
        cursor = conn.execute(
            """INSERT INTO review_requests
                   (customer_name, customer_email, date_requested, requested_at,
                    status, mail_status, subject, message)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (name, email, now.date().isoformat(), now.strftime(SQL_DATETIME),
             STATUS_REQUESTED, MAIL_NOT_OPENED, subject, message),
        )
        conn.commit()

        log_activity(conn, "request_created", request_id=cursor.lastrowid, customer_name=name)
        conn.commit()

        row = conn.execute(
            "SELECT * FROM review_requests WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    finally:
        conn.close()

    return _row_to_dict(row, now)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@app.post("/api/review-requests/chat")
def chat_review_request(payload: ChatRequest):
    """One turn of the "Request a Review" chat assistant.

    Stateless by design: the caller resends the whole conversation each
    turn, and the model itself decides when it has enough to act by
    calling `create_review_request` — that tool call is the only signal
    the request actually went out, so the reply text is never parsed for
    intent.
    """
    client = _get_anthropic_client()

    try:
        response = client.messages.create(
            model=CHAT_MODEL,
            max_tokens=400,
            system=CHAT_SYSTEM_PROMPT,
            tools=CHAT_TOOLS,
            messages=[{"role": m.role, "content": m.content} for m in payload.messages],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Assistant is unavailable: {exc}")

    reply_text = "".join(
        block.text for block in response.content if block.type == "text"
    ).strip()
    tool_use = next((block for block in response.content if block.type == "tool_use"), None)

    if tool_use is None:
        return {"reply": reply_text or "Could you tell me more?", "done": False, "request": None}

    try:
        row = _create_review_request(
            NewReviewRequest(
                customer_name=tool_use.input.get("customer_name", ""),
                customer_email=tool_use.input.get("customer_email", ""),
                subject=tool_use.input.get("subject"),
                message=tool_use.input.get("message"),
            )
        )
    except HTTPException as exc:
        return {
            "reply": f"I couldn't send that: {exc.detail} Could you give me the correct details?",
            "done": False,
            "request": None,
        }

    reply = reply_text or (
        f"Done! I've sent a review request to {row['customer_name']} at {row['customer_email']}."
    )
    return {"reply": reply, "done": True, "request": row}


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

        log_activity(conn, "reminder_sent", request_id=request_id, customer_name=row["customer_name"])
        conn.commit()
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

        if sent:
            log_activity(
                conn,
                "reminders_bulk_sent",
                detail=f"{sent} reminder{'s' if sent != 1 else ''}"
                + (f" (search: {search.strip()!r})" if search.strip() else ""),
            )
            conn.commit()
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

        log_activity(conn, "mail_event", request_id=request_id, customer_name=row["customer_name"], detail=event)
        conn.commit()
    finally:
        conn.close()

    return _row_to_dict(updated)


@app.get("/api/review-requests/trend")
def review_request_trend(weeks: int = Query(13, ge=1, le=52)):
    """Weekly completion/bounce rate, most recent `weeks` weeks.

    Bucketed by week rather than by day: at demo scale (tens of rows spread
    over months) a daily line is mostly zeros between sparse points. Weekly
    buckets are where the direction — better or worse than before — actually
    shows up. Each bucket is keyed by its Monday, and buckets with no requests
    are filled in as zero so the line has no gaps.
    """
    conn = connect()
    try:
        # SQLite's 'weekday 1' modifier finds the next Monday on/after the
        # date; '-7 days' backs it up to the start of *that* week (or the
        # current week, if the date already fell on one).
        rows = conn.execute(
            f"""SELECT date(date_requested, 'weekday 1', '-7 days') AS week_start,
                       COUNT(*)             AS total,
                       SUM(status = ?)      AS completed,
                       SUM(mail_status = ?) AS bounced
                FROM review_requests
                WHERE date_requested >= date('now', 'weekday 1', '-7 days', '-{(weeks - 1) * 7} days')
                GROUP BY week_start""",
            (STATUS_COMPLETED, MAIL_BOUNCED),
        ).fetchall()
    finally:
        conn.close()

    by_week = {r["week_start"]: r for r in rows}

    this_week_start = datetime.now(timezone.utc).date()
    this_week_start -= timedelta(days=this_week_start.weekday())  # back up to Monday

    weekly = []
    for i in range(weeks - 1, -1, -1):
        week_start = (this_week_start - timedelta(weeks=i)).isoformat()
        row = by_week.get(week_start)
        total = row["total"] if row else 0
        completed = row["completed"] if row else 0
        bounced = row["bounced"] if row else 0
        weekly.append({
            "week_start": week_start,
            "total": total,
            "completed": completed,
            "bounced": bounced,
            "completion_rate": round(completed / total * 100, 1) if total else None,
            "bounce_rate": round(bounced / total * 100, 1) if total else None,
        })

    return {"weeks": weekly}


@app.get("/api/activity-log")
def activity_log(limit: int = Query(50, ge=1, le=200)):
    """Most recent history first — every reminder, reset and mail event,
    logged alongside the write that caused it."""
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM activity_log ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    finally:
        conn.close()

    return {
        "entries": [
            {
                "id": r["id"],
                # 'T' separator, not the stored space — Date parsing of
                # "YYYY-MM-DD HH:MM:SSZ" isn't reliable across browsers.
                "created_at": r["created_at"].replace(" ", "T") + "Z",
                "action": r["action"],
                "request_id": r["request_id"],
                "customer_name": r["customer_name"],
                "detail": r["detail"],
            }
            for r in rows
        ]
    }


# Serve the built UI from the API when it exists, so `npm run build` gives a
# single-process deployment. Mounted last so it never shadows /api.
_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="ui")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
