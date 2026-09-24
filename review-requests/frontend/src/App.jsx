import { useState } from 'react'
import { HistoryOutlined } from '@ant-design/icons'
import { Alert, Button, Card } from 'antd'
import styled from 'styled-components'
import { DEFAULT_DIRECTION, STATUS_ALL, STATUS_REMINDABLE } from './constants.js'
import { useReviewRequests } from './useReviewRequests.js'
import { useTrend } from './useTrend.js'
import ActivityLogDrawer from './components/ActivityLogDrawer.jsx'
import ReminderAlerts from './components/ReminderAlerts.jsx'
import RequestsTable from './components/RequestsTable.jsx'
import ResetDataButton from './components/ResetDataButton.jsx'
import SelectionActions from './components/SelectionActions.jsx'
import StatsRow from './components/StatsRow.jsx'
import Toolbar from './components/Toolbar.jsx'
import TrendChart from './components/TrendChart.jsx'

const Header = styled.header`
  background: ${({ theme }) => theme.color.blue};
  padding: 14px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`

const Wordmark = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.blueInk};
  letter-spacing: 0.3px;
`

const PageTitle = styled.h1`
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  margin-top: 2px;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`

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

const Main = styled.main`
  /* Eight columns need the room; the table still scrolls sideways below this. */
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 24px 60px;
`

const Panel = styled(Card)`
  && .ant-card-body {
    padding: 0;
  }
`

const ErrorAlert = styled(Alert)`
  margin-bottom: 16px;
`

export default function App() {
  const {
    search,
    setSearch,
    status,
    setStatus,
    mailStatus,
    setMailStatus,
    sort,
    direction,
    applySort,
    setPage,
    data,
    stats,
    loading,
    error,
    remind,
    remindAll,
    resetData,
    autoSend,
    setAutoSend,
    reminderSchedule,
    setReminderSchedule,
    reloadKey,
    reload,
  } = useReviewRequests()
  const { weeks: trendWeeks, loading: trendLoading } = useTrend(reloadKey)

  const [selectedIds, setSelectedIds] = useState([])
  const [activityLogOpen, setActivityLogOpen] = useState(false)

  /** Jump straight to the rows the notification is talking about. */
  function showAvailable() {
    setStatus(STATUS_REMINDABLE)
    setMailStatus(STATUS_ALL)
    setSearch('')
  }

  /**
   * antd fires one `onChange` for sorting and paging alike, so work out which
   * actually moved. A header click is a two-state toggle: when antd cycles
   * past its directions and hands back no order, flip instead of unsorting.
   */
  function handleTableChange(pagination, _filters, sorter) {
    const field = sorter?.field || sort
    let nextDirection
    if (sorter?.order) {
      nextDirection = sorter.order === 'ascend' ? 'asc' : 'desc'
    } else if (field === sort) {
      nextDirection = direction === 'asc' ? 'desc' : 'asc'
    } else {
      nextDirection = DEFAULT_DIRECTION[field] || 'asc'
    }

    if (field !== sort || nextDirection !== direction) {
      // Sorting changed; the hook resets to page 1 on its own.
      applySort(field, nextDirection)
    } else if (pagination?.current) {
      setPage(pagination.current)
    }
  }

  return (
    <>
      <Header>
        <div>
          <Wordmark>experience.com</Wordmark>
          <PageTitle>Review Requests</PageTitle>
        </div>
        <HeaderActions>
          <GhostButton icon={<HistoryOutlined />} onClick={() => setActivityLogOpen(true)}>
            Activity log
          </GhostButton>
          <ResetDataButton onReset={resetData} />
          <ReminderAlerts count={stats?.remindable ?? 0} onShowAvailable={showAvailable} />
        </HeaderActions>
      </Header>

      <ActivityLogDrawer open={activityLogOpen} onClose={() => setActivityLogOpen(false)} />

      <Main>
        <StatsRow stats={stats} />

        <TrendChart weeks={trendWeeks} loading={trendLoading} />

        {error ? <ErrorAlert type="error" showIcon message={error} /> : null}

        <Panel variant="outlined">
          <Toolbar
            search={search}
            onSearch={setSearch}
            status={status}
            onStatus={setStatus}
            mailStatus={mailStatus}
            onMailStatus={setMailStatus}
            total={data.total}
            loading={loading}
            remindableCount={stats?.remindable ?? 0}
            onRemindAll={remindAll}
            autoSend={autoSend}
            onAutoSendChange={setAutoSend}
            reminderSchedule={reminderSchedule}
            onReminderScheduleChange={setReminderSchedule}
            onRequestCreated={reload}
          />

          <SelectionActions
            selectedIds={selectedIds}
            onClear={() => setSelectedIds([])}
            onRemind={remind}
          />

          <RequestsTable
            rows={data.rows}
            total={data.total}
            page={data.page}
            sort={sort}
            direction={direction}
            loading={loading}
            onChange={handleTableChange}
            onRemind={remind}
            selectedRowKeys={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        </Panel>
      </Main>
    </>
  )
}
