/** Entries of `GET /api/activity` (backend/api/dto/activity.dto.js): the asset timeline, read-only. */

export const ACTIVITY_ACTIONS = [
  'ASSET_CREATED',
  'ASSET_UPDATED',
  'ASSET_ARCHIVED',
  'ASSET_RESTORED',
  'ASSET_LOANED',
  'ASSET_RETURNED',
] as const

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]

export interface ActivityEntry {
  id: string
  action: ActivityAction
  occurredAt: string
  description: string
  /** Display name only; null for an event nobody performed. */
  actor: { id: string; displayName: string } | null
  asset: { id: string; tag: string; name: string }
}

export type ActivityParams = {
  page: number
  pageSize: number
  /** Omitted means every action. */
  action?: ActivityAction[]
}
