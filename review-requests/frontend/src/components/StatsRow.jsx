import { App, Card, Progress, Statistic } from 'antd'
import styled from 'styled-components'
import { theme } from '../theme.js'

const Grid = styled.div`
  display: grid;
  /* Narrow enough that all seven metric tiles plus the quota tile hold one
     row on a laptop; only wraps once the viewport gets tight. */
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 22px;
`

/* The last tile is the headline number, so it inverts.
   antd v6 ships its rules at three-class specificity, so every override here
   sits inside `&&` (which doubles the generated class) to win the cascade
   outright instead of relying on stylesheet order. */
const Tile = styled(Card)`
  && {
    .ant-card-body {
      padding: 11px 13px;
    }

    .ant-statistic-title {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 5px;
    }

    .ant-statistic-content {
      color: ${({ theme }) => theme.color.blue};
      font-weight: 700;
      line-height: 1;
      font-size: 20px;
    }

    .ant-statistic-content-suffix {
      font-size: 12px;
      font-weight: 600;
    }

    ${({ $highlight, theme }) =>
      $highlight &&
      `
        background: ${theme.color.blue};
        border-color: ${theme.color.blue};

        .ant-statistic-title { color: ${theme.color.blueInk}; }
        .ant-statistic-content { color: #fff; }
      `}
  }

  ${({ $clickable }) => $clickable && `cursor: pointer;`}
`

const TileNote = styled.div`
  margin-top: 6px;
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.red};
`

const PLACEHOLDER = '—'

// Only appears once the account is close to its monthly send cap. Sits on
// its own line below the metric grid rather than sharing a row with it.
const QuotaTile = styled(Card)`
  margin: 10px 0 22px;
  max-width: 420px;

  && {
    .ant-card-body {
      padding: 20px 22px;
    }
  }
`

const QuotaTitle = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${({ theme }) => theme.color.muted};
  margin-bottom: 12px;
`

const QuotaSub = styled.div`
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.amber};
`

function daysLeftInMonth() {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return lastDay - now.getDate()
}

export default function StatsRow({ stats }) {
  const { message } = App.useApp()

  // Only surfaced once the account is close to its monthly send cap —
  // otherwise this tile looks exactly like it always has.
  const remaining = stats?.monthly_requests_remaining
  const showQuotaWarning = remaining != null && remaining <= 100

  // Below 4 stars is worth a nudge toward whatever the drill-down/coaching
  // feature ends up being. That feature doesn't exist yet, so the tile is
  // just clickable for now.
  const lowRating = stats?.avg_rating != null && stats.avg_rating < 4
  const hasBounces = (stats?.bounced ?? 0) > 0

  const tiles = [
    { title: 'Total Requests', value: stats?.total },
    { title: 'Completed', value: stats?.completed },
    { title: 'Still Waiting', value: stats?.pending },
    { title: 'Mail Opened', value: stats?.mail_opened },
    {
      title: 'Bounced',
      value: stats?.bounced,
      // No per-bounce reason is captured yet, so this is a stand-in for a
      // future bounce-detail view — e.g. invalid address, mailbox full,
      // domain rejected, or a validation issue upstream.
      clickable: hasBounces,
      note: hasBounces && 'Tap to see why',
      onNoteClick: () =>
        message.info('Bounce reasons (e.g. a validation issue) — detail view coming soon.'),
    },
    {
      title: 'Average Rating',
      // Null when nothing in scope has been rated yet.
      value: stats?.avg_rating,
      precision: 2,
      suffix: '★',
      clickable: lowRating,
      note: lowRating && 'Below target — tap to review',
      onNoteClick: () => message.info('Rating drill-down is coming soon.'),
    },
    {
      title: 'Completion Rate',
      value: stats?.completion_rate,
      precision: 1,
      suffix: '%',
      highlight: true,
    },
  ]

  const used = stats?.monthly_requests_used
  const limit = stats?.monthly_requests_limit
  const percentUsed = limit ? Math.round((used / limit) * 100) : 0

  return (
    <>
      <Grid>
        {tiles.map((t) => {
          const missing = t.value == null
          return (
            <Tile
              key={t.title}
              $highlight={t.highlight}
              $clickable={t.clickable}
              variant="outlined"
              onClick={t.clickable ? t.onNoteClick : undefined}
            >
              <Statistic
                title={t.title}
                value={missing ? PLACEHOLDER : t.value}
                precision={missing ? undefined : t.precision}
                suffix={missing ? undefined : t.suffix}
              />
              {t.note && <TileNote>{t.note}</TileNote>}
            </Tile>
          )
        })}
      </Grid>

      {showQuotaWarning && (
        <QuotaTile variant="outlined">
          <QuotaTitle>Monthly Send Quota</QuotaTitle>
          <Progress
            percent={percentUsed}
            status={percentUsed >= 100 ? 'exception' : 'active'}
            strokeColor={theme.color.amber}
          />
          <QuotaSub>
            {remaining} left · {daysLeftInMonth()}d left this month
          </QuotaSub>
        </QuotaTile>
      )}
    </>
  )
}
