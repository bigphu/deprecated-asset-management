import { useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { describeError } from '@/lib/apiClient'
import { formatDateTimeDisplay } from '@/utils/formatDate'
import { useReturnBorrowingMutation } from '../api/borrowings.api'
import type { Borrowing } from '../types'
import styles from './BorrowingDialogs.module.css'

export interface ReturnBorrowingModalProps {
  borrowing: Borrowing
  onClose: () => void
}

/** US-11: confirm before the return is recorded; the server stamps the time. */
export function ReturnBorrowingModal({ borrowing, onClose }: ReturnBorrowingModalProps) {
  const returnBorrowing = useReturnBorrowingMutation()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  // mutate()'s callbacks are discarded if this unmounts, so closing mid-flight would lose the
  // confirmation toast and any error. Stay open until the server has answered.
  const close = () => {
    if (!returnBorrowing.isPending) onClose()
  }

  function confirm() {
    setError(null)
    returnBorrowing.mutate(borrowing.id, {
      onSuccess: () => {
        toast.show(`Returned ${borrowing.asset.tag}.`)
        onClose()
      },
      onError: (failure) => setError(describeError(failure)),
    })
  }

  return (
    <Modal
      open
      onClose={close}
      title={`Return ${borrowing.asset.tag}`}
      // The server only frees an ON_LOAN asset; any other status is left as it is.
      description={
        borrowing.asset.status === 'ON_LOAN'
          ? 'The return time is recorded now and the asset becomes Available.'
          : 'The return time is recorded now.'
      }
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={returnBorrowing.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={returnBorrowing.isPending}>
            {returnBorrowing.isPending ? 'Returning…' : 'Confirm return'}
          </Button>
        </>
      }
    >
      <dl className={styles.facts}>
        <dt>Asset</dt>
        <dd>{borrowing.asset.name}</dd>
        <dt>Borrower</dt>
        <dd>{borrowing.borrowerName}</dd>
        <dt>Due</dt>
        <dd>{borrowing.dueAt ? formatDateTimeDisplay(borrowing.dueAt) : 'No due date'}</dd>
      </dl>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </Modal>
  )
}
