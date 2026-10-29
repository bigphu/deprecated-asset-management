import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { authKeys } from '@/features/auth/api/auth.api'
import { sessionFixture } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/render'
import { Sidebar } from './Sidebar'

function renderSidebar(permissions: Parameters<typeof sessionFixture>[0]) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), sessionFixture(permissions))
  return renderWithProviders(<Sidebar />, { queryClient })
}

describe('Sidebar permission filtering', () => {
  it('shows a viewer only the destinations their permissions reach', () => {
    renderSidebar(['assets.view'])
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })

    expect(within(nav).getByRole('link', { name: 'Inventory' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Asset types' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Export profiles' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Access control' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows access control to a roles administrator without inventory access', () => {
    renderSidebar(['users.view'])
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })

    expect(within(nav).getByRole('link', { name: 'Access control' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Asset types' })).not.toBeInTheDocument()
  })

  it('lists Borrowings only for a session that may view borrowings', () => {
    const { unmount } = renderSidebar(['assets.view'])
    expect(screen.queryByRole('link', { name: 'Borrowings' })).not.toBeInTheDocument()
    unmount()

    renderSidebar(['borrowings.view'])
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(nav).getByRole('link', { name: 'Borrowings' })).toHaveAttribute('href', '/borrowings')
    expect(within(nav).queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument()
  })

  it('shows a borrower Borrowings but not Activity, and Activity only to someone who may read the log', () => {
    const { unmount } = renderSidebar(['borrowings.viewOwn'])
    let nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(nav).getByRole('link', { name: 'Borrowings' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Activity' })).not.toBeInTheDocument()
    unmount()

    renderSidebar(['activity.view'])
    nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(nav).getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/activity')
    expect(within(nav).queryByRole('link', { name: 'Borrowings' })).not.toBeInTheDocument()
  })

  it('renders no navigation entries for a session without permissions', () => {
    renderSidebar([])
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })

    expect(within(nav).queryAllByRole('link')).toHaveLength(0)
  })
})
