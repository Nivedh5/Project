import { useEffect, useRef, useState } from 'react'
import { CheckCircleFilled, RobotOutlined, SendOutlined, ThunderboltFilled } from '@ant-design/icons'
import { App, Button, Drawer, Input, Steps } from 'antd'
import styled, { keyframes } from 'styled-components'
import { chatReviewRequest } from '../api.js'

const GREETING =
  "STAGE: details\n\nHi! I can send a review request for you — who's the customer, and what's their email address?"

const STAGES = ['details', 'message', 'confirm', 'sent']
const STEP_ITEMS = [{ title: 'Details' }, { title: 'Message' }, { title: 'Confirm' }, { title: 'Sent' }]

const TitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`

const TitleMain = styled.span`
  font-size: 15px;
  font-weight: 600;
`

const TitleSub = styled.span`
  font-size: 12px;
  font-weight: 400;
  color: ${({ theme }) => theme.color.muted};
`

const StepsWrap = styled.div`
  padding-bottom: 16px;
  margin-bottom: 4px;
  border-bottom: 1px solid ${({ theme }) => theme.color.line};

  .ant-steps-item-title {
    font-size: 12px;
  }
`

const Thread = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`

const Entry = styled.div`
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.line};
  animation: ${fadeIn} 0.18s ease-out;

  &:last-child {
    border-bottom: none;
  }
`

const EntryHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  color: ${({ theme, $mine }) => ($mine ? theme.color.blue : theme.color.muted)};
`

const EntryLabel = styled.span`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.7px;
  text-transform: uppercase;
`

const EntryText = styled.div`
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: ${({ theme }) => theme.color.ink};
  padding-left: ${({ $mine }) => ($mine ? '10px' : '0')};
  border-left: ${({ theme, $mine }) => ($mine ? `2px solid ${theme.color.bluePale}` : 'none')};
`

const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
`

const TypingDots = styled.div`
  display: flex;
  gap: 4px;
  padding: 2px 0;
`

const Dot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.muted};
  animation: ${bounce} 1.1s infinite ease-in-out;
  animation-delay: ${({ $delay }) => $delay};
`

const ActionEntry = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 12px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #eef8f0;
  border: 1px solid #cdead2;
  font-size: 12px;
  color: ${({ theme }) => theme.color.green};
`

const ActionMono = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
`

const InputBar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-top: 14px;
  padding: 6px 6px 6px 14px;
  border: 1px solid ${({ theme }) => theme.color.line};
  border-radius: 20px;
  background: ${({ theme }) => theme.color.surface};
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus-within {
    border-color: ${({ theme }) => theme.color.blue};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.color.bluePale};
  }
`

const PlainTextArea = styled(Input.TextArea)`
  &.ant-input {
    border: none;
    box-shadow: none !important;
    padding: 5px 0;
    resize: none;
    background: transparent;
  }
`

const SuccessPanel = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #eef8f0;
  border: 1px solid #cdead2;
`

const SuccessIcon = styled(CheckCircleFilled)`
  flex-shrink: 0;
  font-size: 16px;
  color: ${({ theme }) => theme.color.green};
`

const SuccessText = styled.div`
  flex: 1;
  font-size: 13px;
  color: ${({ theme }) => theme.color.ink};
`

// The assistant tags its own progress on the first line of every reply
// (see the backend system prompt); the UI never guesses this from prose.
function splitStageTag(content) {
  const match = /^STAGE:\s*(details|message|confirm)\s*\n+/i.exec(content)
  return match ? content.slice(match[0].length) : content
}

// The assistant is stateless per turn, so what we send it is not quite what
// we render: the greeting's stage tag is stripped for display but the raw
// text is never sent to the API at all — conversation with the model starts
// at the first real user message.
function toApiHistory(messages) {
  return messages.slice(1).map(({ role, content }) => ({ role, content }))
}

export default function RequestReviewDrawer({ open, onClose, onCreated }) {
  const { message } = App.useApp()
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }])
  const [stage, setStage] = useState('details')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const threadRef = useRef(null)

  function resetConversation() {
    setMessages([{ role: 'assistant', content: GREETING }])
    setStage('details')
    setInput('')
    setSending(false)
    setDone(false)
  }

  // Each open starts a fresh workflow run rather than resuming the last one.
  useEffect(() => {
    if (open) resetConversation()
  }, [open])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || done) return

    const history = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setInput('')
    setSending(true)

    try {
      const { reply, done: isDone, request, stage: nextStage } = await chatReviewRequest(
        toApiHistory(history),
      )
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      setStage(nextStage || (isDone ? 'sent' : 'details'))
      if (isDone && request) {
        setDone(true)
        message.success(`Review request sent to ${request.customer_name}`)
        onCreated()
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Something went wrong: ${err.message}` },
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
      title={
        <TitleWrap>
          <TitleMain>Request a Review</TitleMain>
          <TitleSub>An AI agent runs this — step through it below</TitleSub>
        </TitleWrap>
      }
      open={open}
      onClose={onClose}
      width={400}
      destroyOnHidden
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: 20 } }}
    >
      <StepsWrap>
        <Steps size="small" current={STAGES.indexOf(stage)} items={STEP_ITEMS} />
      </StepsWrap>

      <Thread ref={threadRef}>
        {messages.map((m, i) => {
          const mine = m.role === 'user'
          return (
            <Entry key={i}>
              <EntryHead $mine={mine}>
                {mine ? <ThunderboltFilled /> : <RobotOutlined />}
                <EntryLabel>{mine ? 'You' : 'Agent'}</EntryLabel>
              </EntryHead>
              <EntryText $mine={mine}>{mine ? m.content : splitStageTag(m.content)}</EntryText>
            </Entry>
          )
        })}
        {sending ? (
          <Entry>
            <EntryHead>
              <RobotOutlined />
              <EntryLabel>Agent</EntryLabel>
            </EntryHead>
            <TypingDots>
              <Dot $delay="0s" />
              <Dot $delay="0.15s" />
              <Dot $delay="0.3s" />
            </TypingDots>
          </Entry>
        ) : null}
        {done ? (
          <ActionEntry>
            <CheckCircleFilled />
            <span>
              Action <ActionMono>create_review_request()</ActionMono> executed
            </span>
          </ActionEntry>
        ) : null}
      </Thread>

      {done ? (
        <SuccessPanel>
          <SuccessIcon />
          <SuccessText>Workflow complete — start another run?</SuccessText>
          <Button size="small" onClick={resetConversation}>
            New request
          </Button>
        </SuccessPanel>
      ) : (
        <InputBar>
          <PlainTextArea
            autoSize={{ minRows: 1, maxRows: 4 }}
            placeholder="Respond to the agent…"
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            type="primary"
            shape="circle"
            icon={<SendOutlined />}
            loading={sending}
            disabled={!input.trim()}
            onClick={handleSend}
          />
        </InputBar>
      )}
    </Drawer>
  )
}
