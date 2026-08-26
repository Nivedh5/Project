import { Table } from 'antd'
import styled from 'styled-components'
import { DEFAULT_DIRECTION, PAGE_SIZE } from '../constants.js'
import { formatDate } from '../format.js'
import MailStatusCell from './MailStatusCell.jsx'
import ReminderControl from './ReminderControl.jsx'
import RowActions from './RowActions.jsx'
import StarRating from './StarRating.jsx'
import StatusPill from './StatusPill.jsx'

const StyledTable = styled(Table)`
  && {
    .ant-table-thead > tr > th {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      white-space: nowrap;
    }

    .ant-table-tbody > tr > td {
      border-bottom-color: #eef1f5;
    }

    .ant-pagination {
      padding: 0 16px;
    }
  }
`

const Name = styled.span`
  font-weight: 600;
  white-space: nowrap;
`

const Email = styled.span`
  color: ${({ theme }) => theme.color.muted};
`

const DateCell = styled.span`
  white-space: nowrap;
  color: #555;
`

/** antd cycles through `sortDirections` on repeated clicks; leading with the
 *  column's natural direction means one click gives the useful order. */
function directionsFor(key) {
  return DEFAULT_DIRECTION[key] === 'desc' ? ['descend', 'ascend'] : ['ascend', 'descend']
}

function buildColumns(sort, direction, onRemind) {
  const sortOrder = (key) =>
    sort === key ? (direction === 'asc' ? 'ascend' : 'descend') : null

  const sortable = (key) => ({
    key,
    dataIndex: key,
    sorter: true,
    sortDirections: directionsFor(key),
    sortOrder: sortOrder(key),
  })

  return [
    {
      ...sortable('customer_name'),
      title: 'Customer Name',
      render: (value) => <Name>{value}</Name>,
    },
    {
      ...sortable('customer_email'),
      title: 'Customer Email',
      render: (value) => <Email>{value}</Email>,
    },
    {
      ...sortable('star_rating'),
      title: 'Star Ratings',
      align: 'center',
      render: (value) => <StarRating rating={value} />,
    },
    {
      ...sortable('date_requested'),
      title: 'Date Requested',
      render: (value) => <DateCell>{formatDate(value)}</DateCell>,
    },
    {
      ...sortable('date_completed'),
      title: 'Date Completed',
      render: (value) => <DateCell>{formatDate(value)}</DateCell>,
    },
    {
      ...sortable('status'),
      title: 'Status',
      render: (value, record) => (
        <>
          <StatusPill status={value} />
          <ReminderControl request={record} onRemind={onRemind} />
        </>
      ),
    },
    {
      ...sortable('mail_status'),
      title: 'Mail Status',
      render: (_, record) => <MailStatusCell request={record} />,
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (_, record) => <RowActions request={record} />,
    },
  ]
}

export default function RequestsTable({
  rows,
  total,
  page,
  sort,
  direction,
  loading,
  onChange,
  onRemind,
  selectedRowKeys,
  onSelectionChange,
}) {
  return (
    <StyledTable
      rowKey="id"
      dataSource={rows}
      columns={buildColumns(sort, direction, onRemind)}
      loading={loading}
      onChange={onChange}
      rowSelection={{
        selectedRowKeys,
        onChange: onSelectionChange,
        // Only a row a reminder could actually go out to is selectable —
        // matches the row's own "Send reminder" link being disabled.
        getCheckboxProps: (record) => ({ disabled: !record.can_remind }),
      }}
      scroll={{ x: 'max-content' }}
      locale={{ emptyText: 'No review requests match this search.' }}
      // `dataSource` holds only the current page, so antd renders it as-is
      // rather than slicing — the server has already done the paging.
      pagination={{
        current: page,
        pageSize: PAGE_SIZE,
        total,
        showSizeChanger: false,
        showTotal: (count, range) => `Showing ${range[0]}–${range[1]} of ${count}`,
      }}
    />
  )
}
