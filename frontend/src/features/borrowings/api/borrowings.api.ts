import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, type Page } from '@/lib/apiClient'
import { assetKeys } from '@/features/assets'
import type { Borrowing, BorrowingHistoryParams } from '../types'

// ---------------------------------------------------------------------------
// Backend calls. Contract: backend/api/routes/borrowings.js, browsable at /api/docs.
// ---------------------------------------------------------------------------

/** One page of borrowing records (ADR-0003); `status=ACTIVE` is the assets still out. */
const fetchBorrowingPage = (params: BorrowingHistoryParams) =>
  apiClient.get<Page<Borrowing>>('/borrowings/history', params)

/** The server stamps the return time and the caller; there is no request body. */
const returnBorrowing = (id: string) =>
  apiClient.post<Borrowing>(`/borrowings/${encodeURIComponent(id)}/return`)

export const borrowingKeys = {
  all: ['borrowings'] as const,
  lists: () => [...borrowingKeys.all, 'list'] as const,
  list: (params: BorrowingHistoryParams) => [...borrowingKeys.lists(), params] as const,
}

export function useBorrowingHistoryQuery(params: BorrowingHistoryParams) {
  return useQuery({
    queryKey: borrowingKeys.list(params),
    queryFn: () => fetchBorrowingPage(params),
    // Keep the current rows on screen while the next page, tab or search loads.
    placeholderData: keepPreviousData,
  })
}

export function useReturnBorrowingMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => returnBorrowing(id),
    // Refresh on failure too: a 409 means the list was stale, and a stale row
    // that keeps offering "Return" would only fail again. A return also frees
    // the asset, so the inventory's cached pages are stale as well.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: borrowingKeys.all }),
        queryClient.invalidateQueries({ queryKey: assetKeys.all }),
      ]),
  })
}
