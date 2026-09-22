import { useState } from 'react'
import { App, Button, Input, Popconfirm, Segmented, Select, Spin, Switch } from 'antd'
import styled from 'styled-components'
import { MAIL_FILTERS, STATUS_FILTERS } from '../constants.js'
import AutoSendDrawer from './AutoSendDrawer.jsx'

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.line};
`

const SearchInput = styled(Input)`
  flex: 1;
  min-width: 240px;
`

// Pushed to the far right of the toolbar.
const BulkWrap = styled.div`
  margin-left: auto;
`

const AutoSendWrap = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  white-space: nowrap;
  cursor: pointer;
`

const Count = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  white-space: nowrap;

  @media (max-width: 900px) {
    width: 100%;
  }
`

export default function Toolbar({
  search,
  onSearch,
  status,
  onStatus,
  mailStatus,
  onMailStatus,
  total,
  loading,
  remindableCount,
  onRemindAll,
  autoSend,
  onAutoSendChange,
  reminderSchedule,
  onReminderScheduleChange,
}) {
  const { message } = App.useApp()
  const [sending, setSending] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Turning the toggle on opens the schedule drawer instead of enabling
  // auto-send outright — it only goes live once a schedule is saved.
  // Turning it off needs no confirmation.
  function handleToggle(checked) {
    if (checked) {
      setDrawerOpen(true)
    } else {
      onAutoSendChange(false)
    }
  }

  function saveSchedule(schedule) {
    onReminderScheduleChange(schedule)
    onAutoSendChange(true)
    setDrawerOpen(false)
  }

  async function sendAll() {
    setSending(true)
    try {
      const { sent } = await onRemindAll()
      message.success(
        sent === 1 ? '1 reminder sent' : `${sent} reminders sent`,
      )
    } catch (err) {
      message.error(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Bar>
      <SearchInput
        allowClear
        type="search"
        value={search}
        prefix={<span aria-hidden="true">⌕</span>}
        placeholder="Search by customer name or email…"
        aria-label="Search by customer name or email"
        onChange={(e) => onSearch(e.target.value)}
      />

      {/* One status at a time — the segmented control makes that explicit. */}
      <Segmented
        aria-label="Filter by status"
        value={status}
        options={STATUS_FILTERS}
        onChange={onStatus}
      />

      {/* Mail status is its own axis, so it filters independently of the
          review status beside it. */}
      <Select
        aria-label="Filter by mail status"
        value={mailStatus}
        options={MAIL_FILTERS}
        onChange={onMailStatus}
        style={{ minWidth: 132 }}
      />

      <Count aria-live="polite">
        {loading ? <Spin size="small" /> : null}
        {total} {total === 1 ? 'request' : 'requests'}
      </Count>

      {/* Turning this on opens the schedule drawer; once saved, each
          reminder fires on its own as rows clear their day threshold,
          bypassing the manual button's confirm step below. */}
      <AutoSendWrap>
        <Switch
          size="small"
          checked={autoSend}
          onChange={handleToggle}
          aria-label="Auto send request"
        />
        Auto send request
      </AutoSendWrap>

      {/* Sends to every eligible row at once, rather than one click per row.
          Bulk mail going out is worth a confirmation step. */}
      <BulkWrap>
        <Popconfirm
          title="Send all reminders"
          description={
            remindableCount === 1
              ? 'This sends 1 reminder email now.'
              : `This sends ${remindableCount} reminder emails now.`
          }
          okText="Send them"
          cancelText="Cancel"
          disabled={!remindableCount || sending}
          onConfirm={sendAll}
        >
          <Button type="primary" disabled={!remindableCount} loading={sending}>
            Send all {remindableCount} reminders
          </Button>
        </Popconfirm>
      </BulkWrap>

      <AutoSendDrawer
        open={drawerOpen}
        initialSchedule={reminderSchedule}
        onCancel={() => setDrawerOpen(false)}
        onSave={saveSchedule}
      />
    </Bar>
  )
}
