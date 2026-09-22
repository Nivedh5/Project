import { Rate } from 'antd'
import styled from 'styled-components'

const MAX_STARS = 5

const NoRating = styled.span`
  color: #ccc;
`

const Stars = styled(Rate)`
  && {
    /* antd greys out disabled ratings; these are display-only, not disabled
       controls, so keep them at full strength. */
    &.ant-rate-disabled {
      cursor: default;
      opacity: 1;
    }

    .ant-rate-star:not(:last-child) {
      margin-inline-end: 2px;
    }
  }
`

export default function StarRating({ rating }) {
  // Outstanding requests have no rating yet.
  if (rating == null) return <NoRating>—</NoRating>

  return (
    <Stars
      disabled
      value={rating}
      count={MAX_STARS}
      aria-label={`${rating} out of ${MAX_STARS} stars`}
    />
  )
}
