import { useState } from 'react'
import { PageHeader, SearchField } from '@/components/ui'
import { hasPermission, useCurrentSessionQuery } from '@/features/auth'
import { useDebouncedValue } from '@/utils/useDebouncedValue'
import { useBorrowingHistoryQuery } from '../api/borrowings.api'
import { BorrowingDetailModal } from '../components/BorrowingDetailModal'
import { BorrowingTable } from '../components/BorrowingTable'
import { ReturnBorrowingModal } from '../components/ReturnBorrowingModal'
import type { Borrowing, BorrowingHistoryParams } from '../types'
import styles from './BorrowingsPage.module.css'

const PAGE_SIZE = 25

type Tab = 'active' | 'history'

const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'history', label: 'History' },
]

/** Active: what is still out, most urgent due date first. History: every record, newest first. */
const TAB_QUERY: Record<Tab, Pick<BorrowingHistoryParams, 'status' | 'sort' | 'direction'>> = {
  active: { status: ['ACTIVE'], sort: 'dueAt', direction: 'asc' },
  history: { sort: 'borrowedAt', direction: 'desc' },
}

export function BorrowingsPage() {
  const { data: session } = useCurrentSessionQuery()
  const canReturn = hasPermission(session, 'borrowings.return')
  // Without borrowings.view the API only returns the caller's own records.
  const seesEveryone = hasPermission(session, 'borrowings.view')

  const [tab, setTab] = useState<Tab>('active')
  const [page, setPage] = useState(1)
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim())
  // Start again from the first page when the (debounced) search changes, not on every keystroke.
  const [searched, setSearched] = useState(search)
  if (search !== searched) {
    setSearched(search)
    setPage(1)
  }
  const [returning, setReturning] = useState<Borrowing | null>(null)
  const [viewing, setViewing] = useState<Borrowing | null>(null)

  const { data, isLoading, isFetching, isError } = useBorrowingHistoryQuery({
    ...TAB_QUERY[tab],
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
  })

  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Returning the last row of the last page leaves that page empty; step back.
  // Adjusting state during render (guarded, so it settles in one pass) avoids
  // an extra effect-driven render.
  if (data && page > pageCount) setPage(pageCount)

  function selectTab(next: Tab) {
    setTab(next)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title={seesEveryone ? 'Borrowings' : 'My borrowings'}
        subtitle={
          seesEveryone
            ? 'Assets that are out on loan, and the history of everything borrowed and returned.'
            : 'The assets you have borrowed, and the history of what you returned.'
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Borrowing view">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={tab === id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              aria-pressed={tab === id}
              onClick={() => selectTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchField
          className={styles.search}
          aria-label="Search borrowings"
          placeholder="Search asset tag, asset or borrower"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      <BorrowingTable
        mode={tab}
        rows={data?.items ?? []}
        total={total}
        firstRow={(page - 1) * PAGE_SIZE + 1}
        page={page}
        pageCount={pageCount}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        hasSearch={search !== ''}
        canReturn={canReturn}
        onPageChange={setPage}
        onReturn={setReturning}
        onOpen={setViewing}
      />

      {returning && canReturn && (
        <ReturnBorrowingModal borrowing={returning} onClose={() => setReturning(null)} />
      )}
      {viewing && <BorrowingDetailModal borrowing={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
