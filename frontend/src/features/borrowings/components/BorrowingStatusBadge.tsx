import { Badge, type BadgeTone } from '@/components/ui'
import type { Borrowing } from '../types'

/**
 * "Overdue" is not a status the server stores (it depends on the clock), so
 * it is shown instead of "Borrowed" for an open record past its due date.
 */
export function BorrowingStatusBadge({ borrowing }: { borrowing: Pick<Borrowing, 'status' | 'isOverdue'> }) {
  let tone: BadgeTone = 'warn'
  let label = 'Borrowed'
  if (borrowing.status === 'RETURNED') {
    tone = 'good'
    label = 'Returned'
  } else if (borrowing.status === 'OVERDUE_RETURNED') {
    label = 'Returned late'
  } else if (borrowing.isOverdue) {
    tone = 'critical'
    label = 'Overdue'
  }
  return <Badge tone={tone}>{label}</Badge>
}
