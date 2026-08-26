"""
SQLite storage for review requests.

The database file is created and seeded the first time it is opened, so a fresh
checkout can run the app with no migration or fixture step. Columns added after
the fact are patched in by `_migrate`, so an existing database keeps its rows.
"""

import os
import sqlite3
from datetime import datetime, timedelta, timezone

from seed_data import SEED_ROWS

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "review_requests.db"))

STATUS_REQUESTED = "Review Requested"
STATUS_COMPLETED = "Completed"
STATUSES = (STATUS_REQUESTED, STATUS_COMPLETED)

# How the *email* fared. Independent of whether a review came back: a customer
# can review without ever opening our mail, or open it and never review.
MAIL_NOT_OPENED = "Not Opened"
MAIL_OPENED = "Opened"
MAIL_BOUNCED = "Bounced"
MAIL_STATUSES = (MAIL_NOT_OPENED, MAIL_OPENED, MAIL_BOUNCED)

# Every customer gets this many reminders on top of the original request.
MAX_REMINDERS = 3

# A customer gets this long to respond on their own before the first reminder
# may go out.
REMINDER_DELAY_HOURS = 24

# Review requests sent, across all customers, in a calendar month.
MONTHLY_REQUEST_LIMIT = 15  # TEMP: lowered to eyeball the low-quota warning; restoring to 500 after.

# `requested_at` is stored in this format, in UTC, so it compares correctly
# against SQLite's own `datetime('now', ...)`.
SQL_DATETIME = "%Y-%m-%d %H:%M:%S"

SCHEMA = """
CREATE TABLE IF NOT EXISTS review_requests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name  TEXT    NOT NULL,
    customer_email TEXT    NOT NULL,
    -- Half-point steps (1.0 - 5.0), so REAL rather than INTEGER.
    star_rating    REAL,
    date_requested TEXT    NOT NULL,
    -- The exact instant the request went out. `date_requested` is the day it
    -- lands on, kept for display and sorting; the 24-hour reminder rule needs
    -- more precision than a date can carry.
    requested_at   TEXT    NOT NULL,
    date_completed TEXT,
    status         TEXT    NOT NULL CHECK (status IN ('Review Requested', 'Completed')),
    -- Counts up rather than down, so changing MAX_REMINDERS re-grants everyone
    -- the new allowance instead of stranding rows on the old one.
    reminders_used INTEGER NOT NULL DEFAULT 0 CHECK (reminders_used >= 0),
    mail_status    TEXT    NOT NULL DEFAULT 'Not Opened'
                   CHECK (mail_status IN ('Not Opened', 'Opened', 'Bounced'))
);

-- Search hits name/email, and every list query filters on status, so both are
-- worth indexing even at demo scale.
CREATE INDEX IF NOT EXISTS idx_rr_status ON review_requests (status);
CREATE INDEX IF NOT EXISTS idx_rr_name   ON review_requests (customer_name);
CREATE INDEX IF NOT EXISTS idx_rr_email  ON review_requests (customer_email);
CREATE INDEX IF NOT EXISTS idx_rr_mail   ON review_requests (mail_status);
"""

def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Add columns introduced after a database was first created."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(review_requests)")}
    if "reminders_used" not in existing:
        # No CHECK here: SQLite cannot add a constrained column to a populated
        # table. The one in SCHEMA covers every database created from scratch.
        conn.execute(
            "ALTER TABLE review_requests ADD COLUMN reminders_used INTEGER NOT NULL DEFAULT 0"
        )
        conn.commit()
        print("  migrated: added reminders_used")

    if "requested_at" not in existing:
        conn.execute(
            "ALTER TABLE review_requests ADD COLUMN requested_at TEXT NOT NULL DEFAULT ''"
        )
        # Rows predating the column only have a date, so assume start of day —
        # that is the earliest instant consistent with what was recorded, and
        # it keeps every historical request past the 24-hour mark.
        conn.execute(
            "UPDATE review_requests SET requested_at = date_requested || ' 00:00:00' "
            "WHERE requested_at = ''"
        )
        conn.commit()
        print("  migrated: added requested_at")

    if "mail_status" not in existing:
        conn.execute(
            "ALTER TABLE review_requests ADD COLUMN mail_status TEXT NOT NULL "
            "DEFAULT 'Not Opened'"
        )
        conn.commit()
        print("  migrated: added mail_status")


def _seed(conn: sqlite3.Connection) -> None:
    """Insert the static dataset. Assumes the table is empty.

    Nothing is invented here: every field comes straight from `seed_data.py`.
    The only arithmetic turns each row's "hours ago" offset into the timestamps
    the 24-hour reminder rule compares against.
    """
    now = datetime.now(timezone.utc)

    rows = []
    for name, email, rating, hours_ago, days_after, status, mail_status in SEED_ROWS:
        sent_at = now - timedelta(hours=hours_ago)
        completed = (
            (sent_at.date() + timedelta(days=days_after)).isoformat()
            if days_after is not None
            else None
        )
        rows.append((
            name, email, rating,
            sent_at.date().isoformat(), sent_at.strftime(SQL_DATETIME),
            completed, status, mail_status,
        ))

    conn.executemany(
        """INSERT INTO review_requests
               (customer_name, customer_email, star_rating,
                date_requested, requested_at, date_completed, status, mail_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    conn.commit()


def reset_db() -> int:
    """Throw the table away and rebuild it from the static dataset.

    For demoing: once the reminder quotas are spent there is no way back to a
    fresh state short of deleting the file. Rows are re-inserted from
    `seed_data.py`, so the reminder counts, the 24-hour holds and the mail
    statuses all return to exactly what a first run produces.
    """
    conn = connect()
    try:
        conn.execute("DELETE FROM review_requests")
        # Restart the ids too, so a reset really is indistinguishable from a
        # first run rather than continuing the sequence.
        conn.execute("DELETE FROM sqlite_sequence WHERE name = 'review_requests'")
        _seed(conn)
        return conn.execute("SELECT COUNT(*) FROM review_requests").fetchone()[0]
    finally:
        conn.close()


def init_db() -> int:
    """Create the schema if absent and seed it if empty. Returns the row count."""
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        count = conn.execute("SELECT COUNT(*) FROM review_requests").fetchone()[0]
        if count == 0:
            _seed(conn)
            count = conn.execute("SELECT COUNT(*) FROM review_requests").fetchone()[0]
        return count
    finally:
        conn.close()
