import { useState } from 'react'
import { App, Button, Tooltip } from 'antd'
import styled from 'styled-components'
import { formatDateTime } from '../format.js'

const Wrap = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 5px;
  white-space: nowrap;
`

const RemindButton = styled(Button)`
  && {
    height: auto;
    padding: 0;
    font-size: 12px;
  }
`

/**
 * A disabled <button> fires no mouse events at all — not on itself, and not
 * bubbling to its parent — so a tooltip anchored to either never triggers.
 * Taking the button out of hit-testing lets the hover land on this wrapper
 * instead, which is what the tooltip is actually attached to.
 */
const LockedWrap = styled.span`
  display: inline-flex;
  cursor: not-allowed;

  > button {
    pointer-events: none;
  }
`

const REMINDER_RULE = 'Reminders can only be sent after 24 hours from the review request.'

const Count = styled.span`
  font-size: 11px;
  color: ${({ theme, $exhausted }) => ($exhausted ? theme.color.red : theme.color.muted)};
  font-weight: ${({ $exhausted }) => ($exhausted ? 700 : 400)};
`

/**
 * Sits under the status label. The count shows on every row so the rows line
 * up, but only an outstanding request with reminders left can actually send
 * one — a customer who already left a review has nothing to be reminded about.
 */
export default function ReminderControl({ request, onRemind }) {
  const { message } = App.useApp()
  const [sending, setSending] = useState(false)

  const {
    reminders_left: left,
    reminders_total: total,
    can_remind: canRemind,
    remind_block_reason: blockReason,
    remind_available_at: availableAt,
    reminder_delay_hours: delayHours,
  } = request

  const exhausted = left === 0
  const disabled = !canRemind || sending

  // The server decides *whether* a reminder can go out; this only phrases it.
  const reason = {
    completed: REMINDER_RULE,
    exhausted: `All ${total} reminders have been sent`,
    too_soon: `${REMINDER_RULE} Available ${formatDateTime(availableAt)}.`,
  }[blockReason] ?? null

  async function send() {
    setSending(true)
    try {
      const updated = await onRemind(request.id)
      message.success(
        `Reminder sent to ${request.customer_name} — ${updated.reminders_left} of ${total} left`,
      )
    } catch (err) {
      message.error(err.message)
    } finally {
      setSending(false)
    }
  }

  const button = (
    <RemindButton type="link" size="small" disabled={disabled} onClick={send}>
      Send reminder
    </RemindButton>
  )

  return (
    <Wrap>
      {/* Only the locked states get a wrapper — an enabled button has to keep
          its own pointer events to be clickable. */}
      {reason ? (
        <Tooltip title={reason}>
          <LockedWrap>{button}</LockedWrap>
        </Tooltip>
      ) : (
        button
      )}
      <Count $exhausted={exhausted}>
        {left}/{total} left
      </Count>
    </Wrap>
  )
}
