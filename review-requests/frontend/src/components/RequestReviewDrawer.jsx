import { useEffect, useRef, useState } from 'react'
import { RobotOutlined, SendOutlined, UserOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Drawer, Input } from 'antd'
import styled from 'styled-components'
import { chatReviewRequest } from '../api.js'

const GREETING =
  "Hi! I can send a review request for you — who's the customer, and what's their email address?"

const Thread = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 2px 12px;
`

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  flex-direction: ${({ $mine }) => ($mine ? 'row-reverse' : 'row')};
`

const Bubble = styled.div`
  max-width: 78%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  background: ${({ theme, $mine }) => ($mine ? theme.color.blue : theme.color.bg)};
  color: ${({ $mine }) => ($mine ? '#fff' : 'inherit')};
`

const TypingBubble = styled(Bubble)`
  color: ${({ theme }) => theme.color.muted};
  font-style: italic;
`

const InputBar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.color.line};
`

// The assistant is stateless per turn, so what we send it is not quite what
// we render: the greeting above is local UI chrome, never part of the
// conversation the model sees.
function toApiHistory(messages) {
  return messages.slice(1).map(({ role, content }) => ({ role, content }))
}

export default function RequestReviewDrawer({ open, onClose, onCreated }) {
  const { message } = App.useApp()
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const threadRef = useRef(null)

  // Each open starts a fresh conversation rather than resuming the last one.
  useEffect(() => {
    if (!open) return
    setMessages([{ role: 'assistant', content: GREETING }])
    setInput('')
    setSending(false)
    setDone(false)
  }, [open])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || done) return

    const history = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setInput('')
    setSending(true)

    try {
      const { reply, done: isDone, request } = await chatReviewRequest(toApiHistory(history))
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      if (isDone && request) {
        setDone(true)
        message.success(`Review request sent to ${request.customer_name}`)
        onCreated()
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, something went wrong: ${err.message}` },
      ])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Drawer
      title="Request a Review"
      open={open}
      onClose={onClose}
      width={380}
      destroyOnHidden
      styles={{ body: { display: 'flex', flexDirection: 'column', paddingBottom: 16 } }}
    >
      <Thread ref={threadRef}>
        {messages.map((m, i) => (
          <Row key={i} $mine={m.role === 'user'}>
            <Avatar size="small" icon={m.role === 'user' ? <UserOutlined /> : <RobotOutlined />} />
            <Bubble $mine={m.role === 'user'}>{m.content}</Bubble>
          </Row>
        ))}
        {sending ? (
          <Row $mine={false}>
            <Avatar size="small" icon={<RobotOutlined />} />
            <TypingBubble>Thinking…</TypingBubble>
          </Row>
        ) : null}
      </Thread>

      <InputBar>
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder={done ? 'Request sent — close this panel to send another' : 'Type a message…'}
          value={input}
          disabled={done}
          autoFocus
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={sending}
          disabled={done || !input.trim()}
          onClick={handleSend}
        />
      </InputBar>
    </Drawer>
  )
}
