import { Tag } from 'antd'
import styled from 'styled-components'
import { MAIL_BOUNCED, MAIL_OPENED, STATUS_COMPLETED } from '../constants.js'

const Badge = styled(Tag)`
  && {
    margin-inline-end: 0;
    border-radius: 10px;
    padding: 1px 9px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`

const Note = styled.div`
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  white-space: nowrap;
`

const TAG_COLOR = {
  [MAIL_OPENED]: 'blue',
  [MAIL_BOUNCED]: 'red',
}

/**
 * Whether the mail landed is a different question from whether a review came
 * back, so the note only calls out the two combinations that would otherwise
 * look like a contradiction.
 */
function noteFor(status, mailStatus) {
  const reviewed = status === STATUS_COMPLETED
  const opened = mailStatus === MAIL_OPENED

  // A review arrived, but not through our email — they used another page.
  if (reviewed && !opened) return 'reviewed elsewhere'
  // They read it and still haven't reviewed.
  if (!reviewed && opened) return 'opened, no review'
  return null
}

export default function MailStatusCell({ request }) {
  const { mail_status: mailStatus, status } = request
  const note = noteFor(status, mailStatus)

  return (
    <>
      <Badge color={TAG_COLOR[mailStatus] ?? 'default'}>{mailStatus}</Badge>
      {note ? <Note>{note}</Note> : null}
    </>
  )
}
