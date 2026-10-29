import type { ReactNode } from 'react'
import { Modal } from '@/components/ui'
import { formatDateTimeDisplay } from '@/utils/formatDate'
import type { Borrowing } from '../types'
import { BorrowingStatusBadge } from './BorrowingStatusBadge'
import styles from './BorrowingDialogs.module.css'

export interface BorrowingDetailModalProps {
  borrowing: Borrowing
  onClose: () => void
}

const NONE = '—'

/** US-12: every field of one borrowing record; it reuses the list row, so no extra request. */
export function BorrowingDetailModal({ borrowing, onClose }: BorrowingDetailModalProps) {
  const { asset } = borrowing
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Asset', value: asset.archived ? `${asset.name} (archived)` : asset.name },
    { label: 'Asset tag', value: <span className={styles.mono}>{asset.tag}</span> },
    { label: 'Type', value: asset.typeName },
    { label: 'Asset status', value: asset.statusName },
    { label: 'Borrower', value: borrowing.borrowerName },
    { label: 'Status', value: <BorrowingStatusBadge borrowing={borrowing} /> },
    { label: 'Borrow date', value: formatDateTimeDisplay(borrowing.borrowedAt) },
    { label: 'Due date', value: borrowing.dueAt ? formatDateTimeDisplay(borrowing.dueAt) : NONE },
    { label: 'Actual return date', value: borrowing.returnedAt ? formatDateTimeDisplay(borrowing.returnedAt) : NONE },
    { label: 'Recorded by', value: borrowing.createdBy?.displayName ?? NONE },
    { label: 'Returned to', value: borrowing.returnedBy?.displayName ?? NONE },
    { label: 'Note', value: borrowing.note ?? NONE },
  ]

  return (
    <Modal open onClose={onClose} title="Borrowing details">
      <dl className={styles.facts}>
        {rows.map(({ label, value }) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
