import { useState } from 'react'
import { PageHeader, Select } from '@/components/ui'
import { useActivityQuery } from '../api/activity.api'
import { ActivityTable } from '../components/ActivityTable'
import { ACTIVITY_ACTIONS, type ActivityAction } from '../types'
import styles from './ActivityPage.module.css'

const PAGE_SIZE = 25

/** US-11-T5: what happened to assets, who did it and when. Read-only. */
export function ActivityPage() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<ActivityAction | ''>('')

  const { data, isLoading, isFetching, isError } = useActivityQuery({
    page,
    pageSize: PAGE_SIZE,
    action: action ? [action] : undefined,
  })

  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // The last page can vanish when the log shrinks under a filter; step back.
  if (data && page > pageCount) setPage(pageCount)

  return (
    <>
      <PageHeader title="Activity" subtitle="What happened to assets: what was done, by whom and when." />

      <div className={styles.toolbar}>
        <Select
          aria-label="Filter by action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value as ActivityAction | '')
            setPage(1)
          }}
        >
          <option value="">All actions</option>
          {ACTIVITY_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      <ActivityTable
        rows={data?.items ?? []}
        total={total}
        firstRow={(page - 1) * PAGE_SIZE + 1}
        page={page}
        pageCount={pageCount}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        hasFilter={action !== ''}
        onPageChange={setPage}
      />
    </>
  )
}
