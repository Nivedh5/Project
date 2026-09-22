import { useState } from 'react'
import { App, Button, Popconfirm } from 'antd'
import styled from 'styled-components'

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: ${({ theme }) => theme.color.bluePale};
  border-bottom: 1px solid ${({ theme }) => theme.color.line};
  font-size: 12px;
`

const Count = styled.span`
  font-weight: 600;
`

/**
 * Appears above the table only once a row is checked. Sends one reminder
 * per selected id through the same single-row endpoint the row-level "Send
 * reminder" link uses — there's no bulk-by-id endpoint, so this just fires
 * them concurrently and reports how many actually went out.
 */
export default function SelectionActions({ selectedIds, onClear, onRemind }) {
  const { message } = App.useApp()
  const [sending, setSending] = useState(false)

  if (!selectedIds.length) return null

  async function sendToSelected() {
    setSending(true)
    const results = await Promise.allSettled(selectedIds.map((id) => onRemind(id)))
    const sent = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - sent
    setSending(false)
    onClear()
    if (failed === 0) {
      message.success(sent === 1 ? '1 reminder sent' : `${sent} reminders sent`)
    } else {
      message.warning(`${sent} sent, ${failed} skipped — no longer eligible`)
    }
  }

  return (
    <Bar>
      <Count>
        {selectedIds.length} selected
      </Count>
      <Popconfirm
        title="Send reminders"
        description={`This sends ${selectedIds.length} reminder email${
          selectedIds.length === 1 ? '' : 's'
        } now.`}
        okText="Send them"
        cancelText="Cancel"
        disabled={sending}
        onConfirm={sendToSelected}
      >
        <Button type="primary" size="small" loading={sending}>
          Send reminder to selected
        </Button>
      </Popconfirm>
      <Button size="small" type="text" onClick={onClear} disabled={sending}>
        Clear
      </Button>
    </Bar>
  )
}
