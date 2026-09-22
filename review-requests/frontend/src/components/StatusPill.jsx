import { Tag } from 'antd'
import styled from 'styled-components'
import { STATUS_COMPLETED } from '../constants.js'

const Pill = styled(Tag)`
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

export default function StatusPill({ status }) {
  return <Pill color={status === STATUS_COMPLETED ? 'green' : 'gold'}>{status}</Pill>
}
