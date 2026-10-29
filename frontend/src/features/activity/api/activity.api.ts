import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient, type Page } from '@/lib/apiClient'
import type { ActivityEntry, ActivityParams } from '../types'

// Contract: backend/api/routes/activity.js, browsable at /api/docs.
const fetchActivityPage = (params: ActivityParams) => apiClient.get<Page<ActivityEntry>>('/activity', params)

export const activityKeys = {
  all: ['activity'] as const,
  list: (params: ActivityParams) => [...activityKeys.all, 'list', params] as const,
}

export function useActivityQuery(params: ActivityParams) {
  return useQuery({
    queryKey: activityKeys.list(params),
    queryFn: () => fetchActivityPage(params),
    // Keep the current rows on screen while the next page or filter loads.
    placeholderData: keepPreviousData,
  })
}
