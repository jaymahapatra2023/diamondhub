import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TournamentsPage } from '../TournamentsPage.js'
import type { TournamentSearchResponse } from '@diamondhub/contracts'

// ── Shared mutable store state ────────────────────────────────────────────────
// We mutate this object between tests to control what the store returns.

const storeState = {
  filters: {
    ageDivisions: [] as string[],
    organizers: [] as string[],
    radiusMiles: 50,
    sport: undefined as string | undefined,
  },
  viewMode: 'list' as 'list' | 'map',
  searchLocation: null as null | { lat: number; lng: number; label: string },
  setFilters: vi.fn(),
  resetFilters: vi.fn(),
  setViewMode: vi.fn(),
  setSearchLocation: vi.fn(),
}

// Mock tournament store — always returns current storeState
vi.mock('../../store/tournament.store.js', () => ({
  useTournamentStore: (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState,
}))

// ── Mock tournament API ────────────────────────────────────────────────────────

vi.mock('../../api/tournament.api.js', () => ({
  tournamentApi: {
    search: vi.fn(),
    bookmark: vi.fn(),
    unbookmark: vi.fn(),
  },
}))

// ── Mock geolocation hook ─────────────────────────────────────────────────────

const mockRequestLocation = vi.fn()

vi.mock('../../hooks/useGeolocation.js', () => ({
  useGeolocation: () => ({
    lat: null,
    lng: null,
    loading: false,
    error: null,
    requestLocation: mockRequestLocation,
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildResponse(overrides: Partial<TournamentSearchResponse> = {}): TournamentSearchResponse {
  return {
    tournaments: [],
    total: 0,
    page: 1,
    limit: 20,
    hasMore: false,
    ...overrides,
  }
}

const SAMPLE_TOURNAMENT = {
  id: 'test-id-1',
  name: 'Diamond Classic',
  organizer: 'USSSA' as const,
  sport: 'BASEBALL' as const,
  ageDivisions: ['12U'],
  format: 'POOL_BRACKET' as const,
  startDate: '2026-08-01T00:00:00.000Z',
  endDate: '2026-08-03T00:00:00.000Z',
  city: 'Nashville',
  state: 'TN',
  entryFee: 400,
  maxTeams: 16,
  currentTeams: 10,
  spotsRemaining: 6,
  status: 'OPEN' as const,
  lat: 36.16,
  lng: -86.78,
  dataSource: 'SCRAPED' as const,
  registrationUrl: null,
}

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
        <TournamentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Reset shared state before each test ──────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  storeState.filters = {
    ageDivisions: [],
    organizers: [],
    radiusMiles: 50,
    sport: undefined,
  }
  storeState.viewMode = 'list'
  storeState.searchLocation = null
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TournamentsPage', () => {
  it('renders the search bar', () => {
    renderPage()
    expect(screen.getByRole('searchbox', { name: /search by zip/i })).toBeInTheDocument()
  })

  it('renders page heading', () => {
    renderPage()
    expect(screen.getByText('Find Tournaments')).toBeInTheDocument()
  })

  it('"Near Me" button is present', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /current location/i })).toBeInTheDocument()
  })

  it('"Near Me" button calls requestLocation when clicked', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /current location/i }))
    expect(mockRequestLocation).toHaveBeenCalledTimes(1)
  })

  it('shows empty location state when no searchLocation', () => {
    renderPage()
    expect(screen.getByText(/Where are you looking/i)).toBeInTheDocument()
  })

  it('shows filter button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })

  it('renders list/map toggle buttons', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /map view/i })).toBeInTheDocument()
  })

  it('shows loading skeleton while query is fetching', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.search).mockImplementation(
      () => new Promise(() => {}), // Never resolves
    )

    // Set a location so the query runs
    storeState.searchLocation = { lat: 33.74, lng: -84.38, label: '30301' }

    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('status', { name: /loading tournaments/i })).toBeInTheDocument()
    })
  })

  it('shows tournament cards when data loads', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.search).mockResolvedValue(
      buildResponse({ tournaments: [SAMPLE_TOURNAMENT], total: 1 }),
    )

    storeState.searchLocation = { lat: 36.16, lng: -86.78, label: 'Nashville, TN' }

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Diamond Classic')).toBeInTheDocument()
    })
  })

  it('shows empty state when results array is empty but location is set', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.search).mockResolvedValue(buildResponse())

    storeState.searchLocation = { lat: 36.16, lng: -86.78, label: 'Nashville, TN' }

    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/No tournaments found/i)).toBeInTheDocument()
    })
  })

  it('filter button shows count badge when filters are active', () => {
    storeState.filters = {
      ageDivisions: ['10U', '12U'],
      organizers: ['USSSA'],
      radiusMiles: 50,
      sport: 'BASEBALL',
    }

    renderPage()
    // 2 age divisions + 1 organizer + 1 sport = 4 active filters
    // aria-label updates to "Filters, 4 active"
    expect(screen.getByRole('button', { name: 'Filters, 4 active' })).toBeInTheDocument()
  })

  it('filter panel is present in DOM (slides in when opened)', () => {
    renderPage()
    // The filter dialog is always in the DOM, just hidden via translate-y-full
    expect(screen.getByRole('dialog', { name: /tournament filters/i })).toBeInTheDocument()
  })
})
