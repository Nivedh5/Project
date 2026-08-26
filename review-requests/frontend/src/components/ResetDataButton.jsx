import { useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { App, Button, Popconfirm } from 'antd'
import styled from 'styled-components'

const GhostButton = styled(Button)`
  && {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.45);
    background: transparent;

    &:hover {
      color: #fff;
      border-color: #fff;
      background: rgba(255, 255, 255, 0.12);
    }
  }
`

/**
 * Demo affordance. Once every reminder quota is spent there is no way back to
 * a state worth showing, so this rebuilds the seeded dataset in place.
 */
export default function ResetDataButton({ onReset }) {
  const { message } = App.useApp()
  const [resetting, setResetting] = useState(false)

  async function reset() {
    setResetting(true)
    try {
      const { rows } = await onReset()
      message.success(`Data reset — ${rows} requests restored`)
    } catch (err) {
      message.error(err.message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <Popconfirm
      title="Reset the data"
      description="Restores the seeded rows. Every reminder sent and mail event is discarded."
      okText="Reset"
      cancelText="Cancel"
      onConfirm={reset}
    >
      <GhostButton icon={<ReloadOutlined />} loading={resetting}>
        Reset data
      </GhostButton>
    </Popconfirm>
  )
}
