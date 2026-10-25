import { Button, EmptyState, Pagination, Table } from '@/components/ui'
import { formatDateTimeDisplay } from '@/utils/formatDate'
import type { Borrowing } from '../types'
import { BorrowingStatusBadge } from './BorrowingStatusBadge'
import styles from './BorrowingTable.module.css'

export interface BorrowingTableProps {
  /** Active lists what is still out; history also shows when each record came back. */
  mode: 'active' | 'history'
  rows: Borrowing[]
  total: number
  /** 1-based index of `rows[0]` in the full result. */
  firstRow: number
  page: number
  pageCount: number
  isLoading: boolean
  /** Another page is loading; the current rows stay visible, marked busy. */
  isFetching: boolean
  isError: boolean
  hasSearch: boolean
  canReturn: boolean
  onPageChange: (page: number) => void
  onReturn: (borrowing: Borrowing) => void
  onOpen: (borrowing: Borrowing) => void
}

const NONE = '—'

export function BorrowingTable({
  mode,
  rows,
  total,
  firstRow,
  page,
  pageCount,
  isLoading,
  isFetching,
  isError,
  hasSearch,
  canReturn,
  onPageChange,
  onReturn,
  onOpen,
}: BorrowingTableProps) {
  const showReturned = mode === 'history'
  const columnCount = showReturned ? 7 : 6

  const empty = hasSearch
    ? {
        title: 'No records match your search',
        description: 'Try a different asset tag, asset name or borrower.',
      }
    : mode === 'active'
      ? { title: 'No assets are out on loan', description: 'Everything borrowed has been returned.' }
      : { title: 'No borrowing records yet' }

  return (
    <>
      <Table.Container>
        <Table.Root aria-busy={isFetching} className={isFetching ? styles.fetching : undefined}>
          {/* Fixed layout: every column but Asset is pinned, so Asset takes the slack and its name
              ellipsizes inside its own cell instead of running under Borrower. */}
          <colgroup>
            <col />
            <col style={{ width: '18%' }} />
            <col style={{ width: 168 }} />
            <col style={{ width: 168 }} />
            {showReturned && <col style={{ width: 168 }} />}
            <col style={{ width: 132 }} />
            <col style={{ width: 104 }} />
          </colgroup>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>Asset</Table.HeaderCell>
              <Table.HeaderCell>Borrower</Table.HeaderCell>
              <Table.HeaderCell>Borrowed on</Table.HeaderCell>
              <Table.HeaderCell>Due</Table.HeaderCell>
              {showReturned && <Table.HeaderCell>Returned on</Table.HeaderCell>}
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell aria-label="Actions" />
            </Table.Row>
          </Table.Head>
          <tbody>
            {isLoading ? (
              <Table.Row>
                <Table.Cell colSpan={columnCount}>
                  <EmptyState title="Loading borrowings…" />
                </Table.Cell>
              </Table.Row>
            ) : isError ? (
              <Table.Row>
                <Table.Cell colSpan={columnCount}>
                  <EmptyState
                    title="Couldn't load borrowings"
                    description="Something went wrong fetching the records. Try again shortly."
                  />
                </Table.Cell>
              </Table.Row>
            ) : total === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={columnCount}>
                  <EmptyState title={empty.title} description={empty.description} />
                </Table.Cell>
              </Table.Row>
            ) : (
              rows.map((borrowing) => (
                <Table.Row key={borrowing.id}>
                  <Table.Cell>
                    <button
                      type="button"
                      className={styles.assetButton}
                      aria-label={`${borrowing.asset.name} ${borrowing.asset.tag}, view details`}
                      onClick={() => onOpen(borrowing)}
                    >
                      <span className={styles.assetName}>{borrowing.asset.name}</span>
                      <span className={styles.assetTag}>{borrowing.asset.tag}</span>
                    </button>
                  </Table.Cell>
                  <Table.Cell className={styles.ellipsis}>{borrowing.borrowerName}</Table.Cell>
                  <Table.Cell className={styles.date}>{formatDateTimeDisplay(borrowing.borrowedAt)}</Table.Cell>
                  <Table.Cell className={borrowing.isOverdue ? styles.overdue : styles.date}>
                    {borrowing.dueAt ? formatDateTimeDisplay(borrowing.dueAt) : NONE}
                  </Table.Cell>
                  {showReturned && (
                    <Table.Cell className={styles.date}>
                      {borrowing.returnedAt ? formatDateTimeDisplay(borrowing.returnedAt) : NONE}
                    </Table.Cell>
                  )}
                  <Table.Cell>
                    <BorrowingStatusBadge borrowing={borrowing} />
                  </Table.Cell>
                  <Table.Cell className={styles.actions}>
                    {canReturn && borrowing.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Return ${borrowing.asset.tag}`}
                        onClick={() => onReturn(borrowing)}
                      >
                        Return
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </tbody>
        </Table.Root>
      </Table.Container>

      <div className={styles.footer}>
        <span className={styles.date}>
          {total === 0
            ? 'No records found'
            : `Showing ${firstRow}–${firstRow + rows.length - 1} of ${total} record${total === 1 ? '' : 's'}`}
        </span>
        <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
      </div>
    </>
  )
}
