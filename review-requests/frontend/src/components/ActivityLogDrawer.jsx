import { useEffect, useState } from 'react'
import { Drawer, Empty, Spin } from 'antd'
import styled from 'styled-components'
import { fetchActivityLog } from '../api.js'
import { formatDateTime } from '../format.js'

const LIMIT = 50

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 11px 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.line};

  &:first-child {
    padding-top: 0;
  }

  &:last-child {
    border-bottom: none;
  }
`

const Top = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
`

const When = styled.span`
  font-size: 11px;
  font-weight: 400;
  color: ${({ theme }) => theme.color.muted};
  white-space: nowrap;
`

const Sub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
`

const CenteredSpin = styled.div`
  display: flex;
  justify-content: center;
  padding: 40px 0;
`

// Human-readable per action, kept separate from the raw value the server
// logs so the wording can change without touching stored history.
const ACTION_LABEL = {
  reminder_sent: 'Reminder sent',
  reminders_bulk_sent: 'Bulk reminders sent',
  mail_event: 'Mail event',
  data_reset: 'Demo data reset',
}

function describe(entry) {
  return ACTION_LABEL[entry.action] || entry.action
}

export default function ActivityLogDrawer({ open, onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  // Re-fetch every time the drawer opens, so it never shows a stale list
  // from whenever it was last opened.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    fetchActivityLog(LIMIT, controller.signal)
      .then((payload) => setEntries(payload.entries))
      .catch((err) => {
        if (err.name !== 'AbortError') setEntries([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open])

  return (
    <Drawer title="Activity Log" open={open} onClose={onClose} width={420}>
      {loading ? (
        <CenteredSpin>
          <Spin />
        </CenteredSpin>
      ) : entries.length === 0 ? (
        <Empty description="Nothing has happened yet" />
      ) : (
        entries.map((entry) => (
          <Row key={entry.id}>
            <Top>
              <span>{describe(entry)}</span>
              <When>{formatDateTime(entry.created_at)}</When>
            </Top>
            {(entry.customer_name || entry.detail) && (
              <Sub>
                {entry.customer_name}
                {entry.customer_name && entry.detail ? ' — ' : ''}
                {entry.detail}
              </Sub>
            )}
          </Row>
        ))
      )}
    </Drawer>
  )
}
