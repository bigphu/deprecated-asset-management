import { HttpResponse, delay, http } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PermissionKey } from '@/features/auth'
import { authKeys } from '@/features/auth/api/auth.api'
import { sessionFixture } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/render'
import { server } from '@/test/server'
import type { Borrowing } from '../types'
import { BorrowingsPage } from './BorrowingsPage'

function borrowing(overrides: Partial<Borrowing> = {}): Borrowing {
  return {
    id: 'b-1',
    status: 'ACTIVE',
    isOverdue: false,
    borrowerName: 'Nguyễn Văn An',
    borrowerUserId: 'u-9',
    borrowedAt: '2026-10-20T08:30:00.000Z',
    dueAt: '2026-10-30T08:30:00.000Z',
    returnedAt: null,
    note: null,
    asset: {
      id: 'a-1',
      tag: 'LAP-1001',
      name: 'Dell Latitude 5440',
      type: 'LAPTOP',
      typeName: 'Laptop',
      status: 'ON_LOAN',
      statusName: 'On loan',
      archived: false,
    },
    createdBy: { id: 'u-1', displayName: 'Alex Morgan' },
    returnedBy: null,
    ...overrides,
  }
}

const returnedLate = borrowing({
  id: 'b-2',
  status: 'OVERDUE_RETURNED',
  borrowerName: 'Trần Thị Bích',
  dueAt: '2026-10-21T08:30:00.000Z',
  returnedAt: '2026-10-23T09:00:00.000Z',
  returnedBy: { id: 'u-2', displayName: 'Manager User' },
  asset: { ...borrowing().asset, id: 'a-2', tag: 'MON-2001', name: 'Dell U2723QE', statusName: 'Available', status: 'AVAILABLE' },
})

const page = (items: Borrowing[], total = items.length) => ({ items, total, page: 1, pageSize: 25 })

function renderPage(permissions: PermissionKey[]) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(authKeys.session(), sessionFixture(permissions))
  return renderWithProviders(<BorrowingsPage />, { queryClient })
}

/** Records every history request and answers with `respond(url)`. */
function serveHistory(respond: (url: URL) => Parameters<typeof HttpResponse.json>[0] = () => page([borrowing()])) {
  const urls: URL[] = []
  server.use(
    http.get('/api/borrowings/history', ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      return HttpResponse.json(respond(url))
    }),
  )
  return urls
}

describe('BorrowingsPage', () => {
  it('lists the assets still out on the Active tab, most urgent due date first', async () => {
    const urls = serveHistory(() =>
      page([borrowing(), borrowing({ id: 'b-3', isOverdue: true, borrowerName: 'Lê Minh', asset: { ...borrowing().asset, id: 'a-3', tag: 'LAP-1003', name: 'ThinkPad T14' } })]),
    )
    renderPage(['borrowings.view'])

    expect(await screen.findByText('Dell Latitude 5440')).toBeInTheDocument()
    expect(screen.getByText('LAP-1001')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.getByText('Borrowed')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()

    const query = urls[0].searchParams
    expect(query.getAll('status')).toEqual(['ACTIVE'])
    expect([query.get('sort'), query.get('direction'), query.get('page')]).toEqual(['dueAt', 'asc', '1'])
  })

  it('shows Return only to someone who may return', async () => {
    serveHistory()
    const view = renderPage(['borrowings.view'])
    expect(await screen.findByText('LAP-1001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Return / })).not.toBeInTheDocument()
    view.unmount()

    serveHistory()
    renderPage(['borrowings.view', 'borrowings.return'])
    expect(await screen.findByRole('button', { name: 'Return LAP-1001' })).toBeInTheDocument()
  })

  it('confirms before returning, then records the return and refreshes the list', async () => {
    let returned = false
    let posted = 0
    serveHistory(() => page(returned ? [] : [borrowing()]))
    server.use(
      http.post('/api/borrowings/b-1/return', () => {
        posted += 1
        returned = true
        return HttpResponse.json(borrowing({ status: 'RETURNED', returnedAt: '2026-10-25T10:00:00.000Z' }))
      }),
    )
    const { user, queryClient } = renderPage(['borrowings.view', 'borrowings.return'])
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(await screen.findByRole('button', { name: 'Return LAP-1001' }))
    const dialog = await screen.findByRole('dialog', { name: 'Return LAP-1001' })
    expect(within(dialog).getByText(/Nguyễn Văn An/)).toBeInTheDocument()
    expect(within(dialog).getByText(/asset becomes Available/)).toBeInTheDocument()
    expect(posted).toBe(0)

    await user.click(within(dialog).getByRole('button', { name: 'Confirm return' }))

    expect(await screen.findByText('Returned LAP-1001.')).toBeInTheDocument()
    expect(posted).toBe(1)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Return LAP-1001' })).not.toBeInTheDocument())
    expect(await screen.findByText('No assets are out on loan')).toBeInTheDocument()
    // Returning frees the asset, so the inventory's cached pages are stale too.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['borrowings'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['assets'] })
  })

  it('cancelling the confirmation sends nothing', async () => {
    let posted = 0
    serveHistory()
    server.use(http.post('/api/borrowings/b-1/return', () => { posted += 1; return HttpResponse.json(borrowing()) }))
    const { user } = renderPage(['borrowings.view', 'borrowings.return'])

    await user.click(await screen.findByRole('button', { name: 'Return LAP-1001' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Return LAP-1001' })).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Return LAP-1001' })).not.toBeInTheDocument())
    expect(posted).toBe(0)
  })

  it('keeps the dialog open and shows the server message when the record was already returned', async () => {
    const urls = serveHistory()
    server.use(
      http.post('/api/borrowings/b-1/return', () =>
        HttpResponse.json(
          { error: { code: 'ALREADY_RETURNED', message: 'This asset has already been returned' } },
          { status: 409 },
        ),
      ),
    )
    const { user } = renderPage(['borrowings.view', 'borrowings.return'])

    await user.click(await screen.findByRole('button', { name: 'Return LAP-1001' }))
    const dialog = await screen.findByRole('dialog', { name: 'Return LAP-1001' })
    const requestsBefore = urls.length
    await user.click(within(dialog).getByRole('button', { name: 'Confirm return' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This asset has already been returned')
    expect(screen.getByRole('dialog', { name: 'Return LAP-1001' })).toBeInTheDocument()
    // The list was stale, so it is refreshed rather than left offering a Return that would fail again.
    await waitFor(() => expect(urls.length).toBeGreaterThan(requestsBefore))
  })

  it('History tab asks for every status, newest first, and shows who took the asset back', async () => {
    const urls = serveHistory((url) => (url.searchParams.has('status') ? page([borrowing()]) : page([returnedLate, borrowing()])))
    const { user } = renderPage(['borrowings.view', 'borrowings.return'])
    await screen.findByText('LAP-1001')

    await user.click(screen.getByRole('button', { name: 'History' }))

    expect(await screen.findByText('MON-2001')).toBeInTheDocument()
    expect(screen.getByText('Returned late')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute('aria-pressed', 'true')
    const query = urls.at(-1)!.searchParams
    expect(query.has('status')).toBe(false)
    expect([query.get('sort'), query.get('direction')]).toEqual(['borrowedAt', 'desc'])
    // An open record can still be returned from the history; a returned one cannot.
    expect(screen.getByRole('button', { name: 'Return LAP-1001' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return MON-2001' })).not.toBeInTheDocument()
  })

  it('opens the full record from a row', async () => {
    serveHistory(() => page([returnedLate]))
    const { user } = renderPage(['borrowings.view'])

    await user.click(await screen.findByRole('button', { name: /MON-2001, view details/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Borrowing details' })
    for (const text of ['Dell U2723QE', 'Trần Thị Bích', 'Alex Morgan', 'Manager User', 'Returned late']) {
      expect(within(dialog).getByText(text)).toBeInTheDocument()
    }
    for (const label of ['Borrow date', 'Due date', 'Actual return date']) {
      expect(within(dialog).getByText(label)).toBeInTheDocument()
    }
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Borrowing details' })).not.toBeInTheDocument())
  })

  it('searches after typing stops and starts again from the first page', async () => {
    const urls = serveHistory(() => page([borrowing()], 60))
    const { user } = renderPage(['borrowings.view'])
    await screen.findByText('LAP-1001')

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('page')).toBe('2'))
    const requestsBeforeTyping = urls.length

    await user.type(screen.getByRole('textbox', { name: 'Search borrowings' }), 'laptop')
    await waitFor(() => {
      const query = urls.at(-1)!.searchParams
      expect([query.get('search'), query.get('page')]).toEqual(['laptop', '1'])
    })
    // One request for the finished term: nothing per keystroke, and no page reset before the debounce.
    expect(urls.slice(requestsBeforeTyping).map((url) => url.searchParams.get('search'))).toEqual(['laptop'])
  })

  it('says so when nothing matches, and when the list cannot be loaded', async () => {
    serveHistory(() => page([]))
    const view = renderPage(['borrowings.view'])
    expect(await screen.findByText('No assets are out on loan')).toBeInTheDocument()
    view.unmount()

    server.use(
      http.get('/api/borrowings/history', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
      ),
    )
    renderPage(['borrowings.view'])
    expect(await screen.findByText("Couldn't load borrowings")).toBeInTheDocument()
  })

  it('labels the columns with the borrower, asset, borrow, due and actual return dates and the status', async () => {
    serveHistory(() => page([returnedLate, borrowing()]))
    const { user } = renderPage(['borrowings.view'])
    expect(await screen.findByRole('heading', { name: 'Borrowings' })).toBeInTheDocument()
    await screen.findByText('LAP-1001')
    expect(screen.queryByRole('columnheader', { name: 'Actual return date' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'History' }))

    for (const name of ['Asset', 'Borrower', 'Borrow date', 'Due date', 'Actual return date', 'Status']) {
      expect(await screen.findByRole('columnheader', { name })).toBeInTheDocument()
    }
    expect(await screen.findByText('Returned late')).toBeInTheDocument()
  })

  it('shows a borrower only "My borrowings" and never offers Return', async () => {
    serveHistory()
    renderPage(['borrowings.viewOwn'])

    expect(await screen.findByRole('heading', { name: 'My borrowings' })).toBeInTheDocument()
    expect(await screen.findByText('LAP-1001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Return / })).not.toBeInTheDocument()
  })

  it('only promises "Available" when the asset was on loan', async () => {
    serveHistory(() =>
      page([borrowing({ asset: { ...borrowing().asset, status: 'RETIRED', statusName: 'Retired' } })]),
    )
    const { user } = renderPage(['borrowings.view', 'borrowings.return'])

    await user.click(await screen.findByRole('button', { name: 'Return LAP-1001' }))
    const dialog = await screen.findByRole('dialog', { name: 'Return LAP-1001' })
    expect(within(dialog).getByText('The return time is recorded now.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/becomes Available/)).not.toBeInTheDocument()
  })

  it('cannot be dismissed while the return is being recorded', async () => {
    serveHistory()
    server.use(
      http.post('/api/borrowings/b-1/return', async () => {
        await delay(150)
        return HttpResponse.json(borrowing({ status: 'RETURNED', returnedAt: '2026-10-25T10:00:00.000Z' }))
      }),
    )
    const { user } = renderPage(['borrowings.view', 'borrowings.return'])

    await user.click(await screen.findByRole('button', { name: 'Return LAP-1001' }))
    const dialog = await screen.findByRole('dialog', { name: 'Return LAP-1001' })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm return' }))

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Return LAP-1001' })).toBeInTheDocument()
    // Still mounted when the answer arrives, so the confirmation is not lost.
    expect(await screen.findByText('Returned LAP-1001.')).toBeInTheDocument()
  })

  it('shows a dash for what is missing and marks an archived asset', async () => {
    serveHistory(() =>
      page([borrowing({ dueAt: null, createdBy: null, asset: { ...borrowing().asset, archived: true } })]),
    )
    const { user } = renderPage(['borrowings.view'])

    await user.click(await screen.findByRole('button', { name: /LAP-1001, view details/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Borrowing details' })
    expect(within(dialog).getByText('Dell Latitude 5440 (archived)')).toBeInTheDocument()
    // Due, returned on, recorded by, returned to and note.
    expect(within(dialog).getAllByText('—')).toHaveLength(5)
  })

  it('steps back to the last page when the current page has emptied', async () => {
    const urls = serveHistory((url) =>
      url.searchParams.get('page') === '2' ? page([], 1) : page([borrowing()], 60),
    )
    const { user } = renderPage(['borrowings.view'])
    await screen.findByText('LAP-1001')

    await user.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => expect(urls.at(-1)!.searchParams.get('page')).toBe('1'))
    expect(urls.some((url) => url.searchParams.get('page') === '2')).toBe(true)
    expect(await screen.findByText('LAP-1001')).toBeInTheDocument()
  })
})
