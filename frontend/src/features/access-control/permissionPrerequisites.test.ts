import { describe, expect, it } from 'vitest'
import { missingPermissionPrerequisites } from './permissionPrerequisites'

describe('missingPermissionPrerequisites', () => {
  it('requires borrowings.view alongside borrowings.return, as the API does', () => {
    expect(missingPermissionPrerequisites(['borrowings.return'])).toEqual([
      { permission: 'borrowings.return', prerequisite: 'borrowings.view' },
    ])
    expect(missingPermissionPrerequisites(['borrowings.view', 'borrowings.return'])).toEqual([])
    expect(missingPermissionPrerequisites(['borrowings.view'])).toEqual([])
  })
})
