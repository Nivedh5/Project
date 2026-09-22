import { BellOutlined } from '@ant-design/icons'
import { Badge, Button, Dropdown } from 'antd'
import styled from 'styled-components'

const BellButton = styled(Button)`
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

const Panel = styled.div`
  width: 288px;
  background: ${({ theme }) => theme.color.surface};
  border: 1px solid ${({ theme }) => theme.color.line};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  overflow: hidden;
`

const PanelHead = styled.div`
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.color.line};
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: ${({ theme }) => theme.color.muted};
`

const Item = styled.button`
  display: block;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: ${({ $actionable }) => ($actionable ? 'pointer' : 'default')};

  &:hover {
    background: ${({ theme, $actionable }) => ($actionable ? theme.color.bg : 'transparent')};
  }
`

const Title = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.ink};
`

const Body = styled.div`
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
`

const Cta = styled.span`
  color: ${({ theme }) => theme.color.blue};
  font-weight: 600;
`

/**
 * Tells the user when reminder holds have expired, since the 24-hour wait is
 * otherwise invisible — nothing on screen changes at the moment a row becomes
 * eligible. Clicking through filters the table to exactly those rows.
 */
export default function ReminderAlerts({ count, onShowAvailable }) {
  const has = count > 0

  const panel = (
    <Panel>
      <PanelHead>Notifications</PanelHead>
      <Item
        type="button"
        $actionable={has}
        onClick={has ? onShowAvailable : undefined}
        disabled={!has}
      >
        {has ? (
          <>
            <Title>Reminder hold cleared</Title>
            <Body>
              {count === 1
                ? '1 customer has passed the 24-hour wait and can be reminded.'
                : `${count} customers have passed the 24-hour wait and can be reminded.`}
              <br />
              <Cta>Show them →</Cta>
            </Body>
          </>
        ) : (
          <>
            <Title>Nothing due</Title>
            <Body>No reminders have cleared their 24-hour hold yet.</Body>
          </>
        )}
      </Item>
    </Panel>
  )

  return (
    <Dropdown popupRender={() => panel} trigger={['click']} placement="bottomRight">
      <Badge count={count} size="small" offset={[-2, 2]}>
        <BellButton
          type="default"
          icon={<BellOutlined />}
          aria-label={`Notifications: ${count} reminders available`}
        />
      </Badge>
    </Dropdown>
  )
}
