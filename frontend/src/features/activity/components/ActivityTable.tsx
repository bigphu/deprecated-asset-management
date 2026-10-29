import { Badge, EmptyState, Pagination, Table } from '@/components/ui'
import { formatDateTimeDisplay } from '@/utils/formatDate'
import type { ActivityEntry } from '../types'
import styles from './ActivityTable.module.css'

export interface ActivityTableProps {
  rows: ActivityEntry[]
  total: number
  /** 1-based index of `rows[0]` in the full result. */
  firstRow: number
  page: number
  pageCount: number
  isLoading: boolean
  /** Another page is loading; the current rows stay visible, marked busy. */
  isFetching: boolean
  isError: boolean
  hasFilter: boolean
  onPageChange: (page: number) => void
}

export function ActivityTable({
  rows,
  total,
  firstRow,
  page,
  pageCount,
  isLoading,
  isFetching,
  isError,
  hasFilter,
  onPageChange,
}: ActivityTableProps) {
  return (
    <>
      <Table.Container>
        <Table.Root aria-busy={isFetching} className={isFetching ? styles.fetching : undefined}>
          {/* Fixed layout: Asset takes the slack and ellipsizes inside its own cell. */}
          <colgroup>
            <col style={{ width: 200 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 330 }} />
            <col />
            <col style={{ width: '24%' }} />
          </colgroup>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>Time</Table.HeaderCell>
              <Table.HeaderCell>Action</Table.HeaderCell>
              <Table.HeaderCell>User</Table.HeaderCell>
              <Table.HeaderCell>Asset</Table.HeaderCell>
              <Table.HeaderCell>Description</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <tbody>
            {isLoading ? (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <EmptyState title="Loading activity…" />
                </Table.Cell>
              </Table.Row>
            ) : isError ? (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <EmptyState
                    title="Couldn't load the activity log"
                    description="Something went wrong fetching the entries. Try again shortly."
                  />
                </Table.Cell>
              </Table.Row>
            ) : total === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <EmptyState title={hasFilter ? 'No activity matches this filter' : 'No activity yet'} />
                </Table.Cell>
              </Table.Row>
            ) : (
              rows.map((entry) => (
                <Table.Row key={entry.id}>
                  <Table.Cell className={styles.time}>{formatDateTimeDisplay(entry.occurredAt, true)}</Table.Cell>
                  <Table.Cell>
                    <Badge shape="rect" className={styles.action}>
                      {entry.action}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {entry.actor ? (
                      <div className={styles.actor}>
                        <span className={styles.actorName}>{entry.actor.displayName}</span>
                        <span className={styles.actorId}>{entry.actor.id}</span>
                      </div>
                    ) : (
                      <span className={styles.system}>System</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <div className={styles.asset}>
                      <span className={styles.assetName}>{entry.asset.name}</span>
                      <span className={styles.assetTag}>{entry.asset.tag}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className={styles.ellipsis}>{entry.description}</Table.Cell>
                </Table.Row>
              ))
            )}
          </tbody>
        </Table.Root>
      </Table.Container>

      <div className={styles.footer}>
        <span className={styles.time}>
          {total === 0
            ? 'No entries found'
            : `Showing ${firstRow}–${firstRow + rows.length - 1} of ${total} entr${total === 1 ? 'y' : 'ies'}`}
        </span>
        <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
      </div>
    </>
  )
}
