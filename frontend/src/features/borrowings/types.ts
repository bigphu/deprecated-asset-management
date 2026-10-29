/**
 * Borrowing records as `GET /api/borrowings/history` returns them
 * (backend/api/dto/borrowings.dto.js). One DTO carries everything the list
 * and the detail dialog show, so there is no separate detail request.
 */

/** Derived by the database from the return and due timestamps. */
export type BorrowingStatus = 'ACTIVE' | 'RETURNED' | 'OVERDUE_RETURNED'

/** Staff appear by display name only. */
export interface BorrowingPerson {
  id: string
  displayName: string
}

export interface BorrowingAsset {
  id: string
  tag: string
  name: string
  /** Asset type code, e.g. `LAPTOP`. */
  type: string
  typeName: string
  /** Asset status code, e.g. `ON_LOAN`. */
  status: string
  statusName: string
  /** The asset was archived (soft-deleted); its borrowing history stays. */
  archived: boolean
}

export interface Borrowing {
  id: string
  status: BorrowingStatus
  /** Not returned and past the due date. Always false once returned. */
  isOverdue: boolean
  borrowerName: string
  /** The borrower's user account, when they have one. */
  borrowerUserId: string | null
  borrowedAt: string
  dueAt: string | null
  returnedAt: string | null
  note: string | null
  asset: BorrowingAsset
  createdBy: BorrowingPerson | null
  returnedBy: BorrowingPerson | null
}

export type BorrowingSortKey = 'borrowedAt' | 'dueAt' | 'returnedAt' | 'borrower' | 'asset'

export type BorrowingHistoryParams = {
  page: number
  pageSize: number
  /** Omitted means every status. */
  status?: BorrowingStatus[]
  search?: string
  sort?: BorrowingSortKey
  direction?: 'asc' | 'desc'
}
