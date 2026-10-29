import { HttpResponse, http } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PermissionKey } from '@/features/auth'
import { authKeys } from '@/features/auth/api/auth.api'
import { sessionFixture } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/render'
import { server } from '@/test/server'
import { formatDateTimeDisplay } from '@/utils/formatDate'
import type { ActivityEntry } from '../types'
import { ActivityPage } from './ActivityPage'

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'e-1',
    action: 'ASSET_RETURNED',
    occurredAt: '2026-10-25T12:26:07.000Z',
    description: 'Asset LAP-1002 returned',
    actor: { id: USER_ID, displayName: 'Minh Quan' },
    asset: { id: 'a-1', tag: 'LAP-1002', name: 'MacBook Pro 14"' },
    ...overrides,
  }
}

const page = (items: ActivityEntry[], total = items.length) => ({ items, total, page: 1, pageSize: 25 })

function renderPage(permissions: PermissionKey[] = ['activity.view']) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), sessionFixture(permissions))
  return renderWithProviders(<ActivityPage />, { queryClient })
}

function serveActivity(respond: (url: URL) => Parameters<typeof HttpResponse.json>[0] = () => page([entry()])) {
  const urls: URL[] = []
  server.use(
    http.get('/api/activity', ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      return HttpResponse.json(respond(url))
    }),
  )
  return urls
}

describe('ActivityPage', () => {
  it('logs the return with its action, the user and the time', async () => {
    serveActivity()
    renderPage()

    // The filter's <option> carries the same text, so look in the table cells only.
    const row = (await screen.findByRole('cell', { name: 'ASSET_RETURNED' })).closest('tr')!
    expect(within(row).getByText('Minh Quan')).toBeInTheDocument()
    expect(within(row).getByText(USER_ID)).toBeInTheDocument()
    expect(within(row).getByText(formatDateTimeDisplay('2026-10-25T12:26:07.000Z', true))).toBeInTheDocument()
    expect(within(row).getByText('LAP-1002')).toBeInTheDocument()
    expect(within(row).getByText('MacBook Pro 14"')).toBeInTheDocument()
    expect(within(row).getByText('Asset LAP-1002 returned')).toBeInTheDocument()
    for (const name of ['Time', 'Action', 'User', 'Asset', 'Description']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
  })

  it('shows System for an event nobody performed', async () => {
    serveActivity(() => page([entry({ actor: null })]))
    renderPage()

    expect(await screen.findByText('System')).toBeInTheDocument()
  })

  it('filters by action and starts again from the first page', async () => {
    const urls = serveActivity(() => page([entry()], 60))
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'ASSET_RETURNED' })

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('page')).toBe('2'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by action' }), 'ASSET_RETURNED')

    await waitFor(() => {
      const query = urls.at(-1)!.searchParams
      expect([query.getAll('action'), query.get('page')]).toEqual([['ASSET_RETURNED'], '1'])
    })
  })

  it('says so when there is no activity, and when the log cannot be loaded', async () => {
    serveActivity(() => page([]))
    const view = renderPage()
    expect(await screen.findByText('No activity yet')).toBeInTheDocument()
    view.unmount()

    server.use(
      http.get('/api/activity', () => HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 })),
    )
    renderPage()
    expect(await screen.findByText("Couldn't load the activity log")).toBeInTheDocument()
  })
})
