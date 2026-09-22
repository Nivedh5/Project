import { useEffect, useState } from 'react'
import { Button, Drawer, Slider, Space } from 'antd'
import styled from 'styled-components'

const MIN_DAYS = 1
const MAX_DAYS = 10

const Field = styled.div`
  margin-bottom: 28px;
`

const Label = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
`

const Value = styled.span`
  color: ${({ theme }) => theme.color.blue};
  font-weight: 700;
`

const Hint = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  margin: 0 0 24px;
`

const REMINDER_LABELS = ['Reminder 1', 'Reminder 2', 'Reminder 3']

export default function AutoSendDrawer({ open, initialSchedule, onCancel, onSave }) {
  const [schedule, setSchedule] = useState(initialSchedule)

  // Re-seed from the saved schedule every time the drawer opens, so a
  // cancelled edit never leaks into the next open.
  useEffect(() => {
    if (open) setSchedule(initialSchedule)
  }, [open, initialSchedule])

  function setDay(index, value) {
    setSchedule((prev) => prev.map((d, i) => (i === index ? value : d)))
  }

  return (
    <Drawer
      title="Auto send request"
      open={open}
      onClose={onCancel}
      width={360}
      extra={
        <Space>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" onClick={() => onSave(schedule)}>
            Save
          </Button>
        </Space>
      }
    >
      <Hint>
        Each reminder fires on its own once an outstanding request has waited
        this many days — still subject to the 24-hour hold and the 3-reminder
        limit per customer.
      </Hint>
      {REMINDER_LABELS.map((label, i) => (
        <Field key={label}>
          <Label>
            {label}
            <Value>
              {schedule[i]} day{schedule[i] === 1 ? '' : 's'}
            </Value>
          </Label>
          <Slider
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            value={schedule[i]}
            onChange={(value) => setDay(i, value)}
            marks={{ [MIN_DAYS]: `${MIN_DAYS}`, [MAX_DAYS]: `${MAX_DAYS}` }}
          />
        </Field>
      ))}
    </Drawer>
  )
}
