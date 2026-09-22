import { useMemo, useRef, useState } from 'react'
import { Card, Empty } from 'antd'
import styled from 'styled-components'
import { formatShortDate } from '../format.js'
import { theme } from '../theme.js'

const COMPLETION_COLOR = theme.color.blue
const BOUNCE_COLOR = theme.color.red
const CROSSHAIR_COLOR = '#c7cdd6'

const Panel = styled(Card)`
  margin-bottom: 22px;

  && .ant-card-body {
    padding: 18px 20px 12px;
  }
`

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
`

const Title = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${({ theme }) => theme.color.muted};
`

const Legend = styled.div`
  display: flex;
  gap: 16px;
`

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.ink};
`

const Swatch = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`

const ChartWrap = styled.div`
  position: relative;
`

const AxisLabel = styled.text`
  font-size: 9px;
  fill: ${({ theme }) => theme.color.muted};
`

const GridLine = styled.line`
  stroke: ${({ theme }) => theme.color.line};
  stroke-width: 1;
`

const Tooltip = styled.div`
  position: absolute;
  pointer-events: none;
  z-index: 1;
  background: ${({ theme }) => theme.color.ink};
  color: #fff;
  font-size: 11px;
  line-height: 1.5;
  border-radius: 4px;
  padding: 7px 10px;
  transform: translate(-50%, -100%);
  white-space: nowrap;
  top: -10px;
`

const TooltipRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const WIDTH = 780
const HEIGHT = 190
const PAD_LEFT = 30
const PAD_RIGHT = 12
const PAD_TOP = 10
const PAD_BOTTOM = 22
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM

const GRID_VALUES = [0, 25, 50, 75, 100]

// Series drawn in fixed order — never re-cycled by whatever data happens to
// be present, per the categorical-color rule.
function useSeriesPaths(weeks, key) {
  return useMemo(() => {
    const points = weeks.map((w, i) => ({
      x: PAD_LEFT + (weeks.length === 1 ? PLOT_W / 2 : (i / (weeks.length - 1)) * PLOT_W),
      y: PAD_TOP + PLOT_H - ((w[key] ?? 0) / 100) * PLOT_H,
      value: w[key],
      index: i,
    }))

    // Break the line across weeks with no requests (null rate) rather than
    // drawing a misleading 0% dip or bridging the gap.
    const segments = []
    let current = []
    for (const p of points) {
      if (p.value == null) {
        if (current.length) segments.push(current)
        current = []
      } else {
        current.push(p)
      }
    }
    if (current.length) segments.push(current)

    const path = segments
      .map((seg) => 'M' + seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L'))
      .join(' ')

    return { path, points }
  }, [weeks, key])
}

export default function TrendChart({ weeks, loading }) {
  const svgRef = useRef(null)
  const [hoverIndex, setHoverIndex] = useState(null)

  const completion = useSeriesPaths(weeks, 'completion_rate')
  const bounce = useSeriesPaths(weeks, 'bounce_rate')

  function handleMove(e) {
    if (!weeks.length || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH
    const ratio = weeks.length === 1 ? 0 : (relX - PAD_LEFT) / PLOT_W
    const index = Math.round(ratio * (weeks.length - 1))
    setHoverIndex(Math.min(weeks.length - 1, Math.max(0, index)))
  }

  const hovered = hoverIndex != null ? weeks[hoverIndex] : null
  const hoverX = hoverIndex != null ? completion.points[hoverIndex].x : null

  // Skip every other/third label once there are more weeks than fit legibly.
  const labelStride = weeks.length > 8 ? Math.ceil(weeks.length / 7) : 1

  const hasAnyData = weeks.some((w) => w.total > 0)

  return (
    <Panel variant="outlined">
      <Head>
        <Title>Weekly Trend</Title>
        <Legend>
          <LegendItem>
            <Swatch $color={COMPLETION_COLOR} />
            Completion rate
          </LegendItem>
          <LegendItem>
            <Swatch $color={BOUNCE_COLOR} />
            Bounce rate
          </LegendItem>
        </Legend>
      </Head>

      {!loading && !hasAnyData ? (
        <Empty description="No requests in this window yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ChartWrap>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            height={HEIGHT}
            role="img"
            aria-label="Weekly completion rate and bounce rate trend"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {GRID_VALUES.map((v) => {
              const y = PAD_TOP + PLOT_H - (v / 100) * PLOT_H
              return (
                <g key={v}>
                  <GridLine x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} />
                  <AxisLabel x={4} y={y + 3}>
                    {v}%
                  </AxisLabel>
                </g>
              )
            })}

            {weeks.map((w, i) =>
              i % labelStride === 0 ? (
                <AxisLabel key={w.week_start} x={completion.points[i].x} y={HEIGHT - 6} textAnchor="middle">
                  {formatShortDate(w.week_start)}
                </AxisLabel>
              ) : null,
            )}

            {hoverX != null && (
              <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={PAD_TOP + PLOT_H} stroke={CROSSHAIR_COLOR} strokeWidth="1" />
            )}

            <path d={bounce.path} fill="none" stroke={BOUNCE_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d={completion.path} fill="none" stroke={COMPLETION_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {bounce.points.map(
              (p) => p.value != null && <circle key={`b${p.index}`} cx={p.x} cy={p.y} r="3" fill={BOUNCE_COLOR} />,
            )}
            {completion.points.map(
              (p) => p.value != null && <circle key={`c${p.index}`} cx={p.x} cy={p.y} r="3" fill={COMPLETION_COLOR} />,
            )}

            {hovered && hovered.completion_rate != null && (
              <circle cx={hoverX} cy={completion.points[hoverIndex].y} r="5" fill={COMPLETION_COLOR} stroke="#fff" strokeWidth="1.5" />
            )}
            {hovered && hovered.bounce_rate != null && (
              <circle cx={hoverX} cy={bounce.points[hoverIndex].y} r="5" fill={BOUNCE_COLOR} stroke="#fff" strokeWidth="1.5" />
            )}
          </svg>

          {hovered && (
            <Tooltip style={{ left: `${(hoverX / WIDTH) * 100}%` }}>
              <strong>{formatShortDate(hovered.week_start)}</strong>
              {hovered.total === 0 ? (
                <TooltipRow>No requests sent</TooltipRow>
              ) : (
                <>
                  <TooltipRow>
                    Completion: {hovered.completion_rate}% ({hovered.completed}/{hovered.total})
                  </TooltipRow>
                  <TooltipRow>
                    Bounced: {hovered.bounce_rate}% ({hovered.bounced}/{hovered.total})
                  </TooltipRow>
                </>
              )}
            </Tooltip>
          )}
        </ChartWrap>
      )}
    </Panel>
  )
}
