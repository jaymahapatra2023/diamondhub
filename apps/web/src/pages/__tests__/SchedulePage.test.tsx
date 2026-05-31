import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SchedulePage } from '../SchedulePage.js'
import { scheduleApi } from '../../api/schedule.api.js'
import type { ScheduleEventResponse } from '@diamondhub/contracts'

// ── Auth store mock ───────────────────────────────────────────────────────────

const authState = {
  activeRole: null as null | { role: string; teamId: string | null },
  user: null,
}

vi.mock('../../store/auth.store.js', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}))

// ── Schedule API mock ─────────────────────────────────────────────────────────

vi.mock('../../api/schedule.api.js', () => ({
  scheduleApi: {
    getUserEvents: vi.fn(),
    getTeamEvents: vi.fn(),
    cancelEvent: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    exportIcs: vi.fn((teamId: string) => `/api/v1/schedule/teams/${teamId}/export.ics`),
  },
}))

// ── Sample data ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ScheduleEventResponse> = {}): ScheduleEventResponse {
  return {
    id: 'evt-1',
    teamId: 'team-1',
    type: 'PRACTICE',
    title: 'Tuesday Practice',
    locationName: 'Diamond Field',
    locationAddress: null,
    lat: null,
    lng: null,
    // Use a date that is reliably in the current query range for any month
    startTime: new Date(new Date().getFullYear(), new Date().getMonth(), 15, 17, 0, 0).toISOString(),
    endTime: new Date(new Date().getFullYear(), new Date().getMonth(), 15, 19, 0, 0).toISOString(),
    notes: null,
    isCancelled: false,
    cancelledAt: null,
    createdAt: new Date(2026, 0, 1).toISOString(),
    updatedAt: new Date(2026, 0, 1).toISOString(),
    userRsvp: null,
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage(queryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SchedulePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SchedulePage', () => {
  const mockGetUserEvents = vi.mocked(scheduleApi.getUserEvents)

  beforeEach(() => {
    authState.activeRole = null
    vi.clearAllMocks()
    mockGetUserEvents.mockResolvedValue([])
  })

  it('renders month view by default', () => {
    renderPage()
    const monthTab = screen.getByRole('tab', { name: /month/i })
    expect(monthTab.getAttribute('aria-selected')).toBe('true')
  })

  it('shows month/year header', () => {
    renderPage()
    const currentYear = new Date().getFullYear().toString()
    const headerEl = screen.getByText(new RegExp(currentYear))
    expect(headerEl).toBeDefined()
  })

  it('renders Month, Week and Day view toggle buttons', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /month/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /week/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /day/i })).toBeDefined()
  })

  it('clicking Week tab switches to week view', async () => {
    renderPage()

    const weekTab = screen.getByRole('tab', { name: /week/i })
    fireEvent.click(weekTab)

    await waitFor(() => {
      expect(weekTab.getAttribute('aria-selected')).toBe('true')
    })

    const monthTab = screen.getByRole('tab', { name: /month/i })
    expect(monthTab.getAttribute('aria-selected')).toBe('false')
  })

  it('clicking Day tab switches to day view', async () => {
    renderPage()

    const dayTab = screen.getByRole('tab', { name: /day/i })
    fireEvent.click(dayTab)

    await waitFor(() => {
      expect(dayTab.getAttribute('aria-selected')).toBe('true')
    })
  })

  it('shows loading state while fetching events', () => {
    // Return a promise that never resolves — keeps isLoading=true
    mockGetUserEvents.mockReturnValue(new Promise(() => {}))

    renderPage()

    const loadingEl = screen.getByLabelText(/loading events/i)
    expect(loadingEl).toBeDefined()
  })

  it('shows event dots on correct days in month view after loading', async () => {
    const event = makeEvent({ type: 'PRACTICE' })
    mockGetUserEvents.mockResolvedValue([event])

    renderPage()

    await waitFor(() => {
      const dots = document.querySelectorAll('span.bg-green-500')
      expect(dots.length).toBeGreaterThan(0)
    })
  })

  it('does not render Add Event FAB for non-coach users', () => {
    authState.activeRole = { role: 'PARENT', teamId: 'team-1' }

    renderPage()

    const fab = screen.queryByRole('button', { name: /add event/i })
    expect(fab).toBeNull()
  })

  it('renders Add Event FAB for coaches', () => {
    authState.activeRole = { role: 'COACH', teamId: 'team-1' }

    renderPage()

    const fab = screen.getByRole('button', { name: /add event/i })
    expect(fab).toBeDefined()
  })

  it('switches to day view when a month cell is clicked', async () => {
    renderPage()

    // Wait for month grid to finish rendering
    await waitFor(() => {
      const allButtons = screen.getAllByRole('button')
      expect(allButtons.length).toBeGreaterThan(7)
    })

    // Find day cells — buttons with "Month D, YYYY" style labels
    const allButtons = screen.getAllByRole('button')
    const dayCells = allButtons.filter((b) => /\w+ \d+, \d{4}/.test(b.getAttribute('aria-label') ?? ''))
    expect(dayCells.length).toBeGreaterThan(0)

    const middleCell = dayCells[Math.floor(dayCells.length / 2)]
    if (middleCell) fireEvent.click(middleCell)

    await waitFor(() => {
      const dayTab = screen.getByRole('tab', { name: /day/i })
      expect(dayTab.getAttribute('aria-selected')).toBe('true')
    })
  })

  it('fetches events with correct date range when navigating to next month', async () => {
    renderPage()

    // Click next month button
    const nextBtn = screen.getByRole('button', { name: /next month/i })
    fireEvent.click(nextBtn)

    await waitFor(() => {
      // getUserEvents should have been called at least twice
      expect(mockGetUserEvents).toHaveBeenCalledTimes(2)
    })

    // The second call should have a later start date than the first
    const calls = mockGetUserEvents.mock.calls
    const firstCallStart = new Date(calls[0]![0])
    const secondCallStart = new Date(calls[1]![0])
    expect(secondCallStart.getTime()).toBeGreaterThan(firstCallStart.getTime())
  })
})
