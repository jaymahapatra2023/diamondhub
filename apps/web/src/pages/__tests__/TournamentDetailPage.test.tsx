import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TournamentDetailPage } from '../TournamentDetailPage.js'
import type { TournamentDetail } from '@diamondhub/contracts'

// ── Mock auth store ───────────────────────────────────────────────────────────

const authState = {
  user: null as null | { id: string; name: string; email: string; emailVerified: boolean; roles: unknown[] },
  activeRole: null as null | { role: string; teamId: string | null },
}

vi.mock('../../store/auth.store.js', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}))

// ── Mock tournament API ───────────────────────────────────────────────────────

vi.mock('../../api/tournament.api.js', () => ({
  tournamentApi: {
    getById: vi.fn(),
    bookmark: vi.fn(),
    unbookmark: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
  },
}))

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_TOURNAMENT: TournamentDetail = {
  id: 'tour-1',
  name: 'Diamond Classic 2026',
  organizer: 'USSSA',
  sport: 'BASEBALL',
  ageDivisions: ['12U', '14U'],
  format: 'POOL_BRACKET',
  startDate: '2026-08-01T00:00:00.000Z',
  endDate: '2026-08-03T00:00:00.000Z',
  registrationDeadline: '2026-07-15T00:00:00.000Z',
  city: 'Nashville',
  state: 'TN',
  address: '100 Main St',
  zip: '37201',
  entryFee: 400,
  maxTeams: 16,
  currentTeams: 10,
  spotsRemaining: 6,
  fieldsCount: 4,
  surface: 'TURF',
  hotelDealUrl: null,
  registrationUrl: 'https://usssa.com/register',
  umpireInfo: null,
  notes: null,
  status: 'OPEN',
  lat: 36.16,
  lng: -86.78,
  isBookmarked: false,
  isFollowing: false,
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

function renderPage(tournamentId = 'tour-1', queryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tournaments/${tournamentId}`]}>
        <Routes>
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          <Route path="/tournaments" element={<div>Search Page</div>} />
          <Route path="/register" element={<div>Register Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Reset before each test ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  authState.user = null
  authState.activeRole = null
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TournamentDetailPage', () => {
  it('renders loading skeleton while fetching', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockImplementation(() => new Promise(() => {})) // Never resolves

    renderPage()

    // Skeleton is rendered via animate-pulse divs; verify the page is in loading state
    // (no tournament name visible yet)
    expect(screen.queryByText('Diamond Classic 2026')).not.toBeInTheDocument()
    // The skeleton container should be present
    const pulseEl = document.querySelector('.animate-pulse')
    expect(pulseEl).toBeInTheDocument()
  })

  it('renders 404 state for unknown tournament', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockRejectedValue({
      response: { status: 404 },
    })

    renderPage('unknown-id')

    await waitFor(() => {
      expect(screen.getByText(/Tournament not found/i)).toBeInTheDocument()
    })
  })

  it('renders tournament name, organizer, dates when loaded', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockResolvedValue(SAMPLE_TOURNAMENT)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Diamond Classic 2026')).toBeInTheDocument()
    })
    expect(screen.getByText('USSSA')).toBeInTheDocument()
    // Dates are formatted — check for year (multiple elements may show 2026)
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0)
  })

  it('shows Register button for COACH role', async () => {
    authState.user = { id: 'u1', name: 'Coach Joe', email: 'joe@test.com', emailVerified: true, roles: [] }
    authState.activeRole = { role: 'COACH', teamId: 'team-1' }

    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockResolvedValue(SAMPLE_TOURNAMENT)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /register for diamond classic/i })).toBeInTheDocument()
    })
    expect(screen.getByText('Register Your Team')).toBeInTheDocument()
  })

  it('shows "Sign in to register" for guest (no user)', async () => {
    authState.user = null
    authState.activeRole = null

    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockResolvedValue(SAMPLE_TOURNAMENT)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Sign in to register your team/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Sign In \/ Create Account/i)).toBeInTheDocument()
  })

  it('shows bookmark star button', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockResolvedValue(SAMPLE_TOURNAMENT)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bookmark tournament/i })).toBeInTheDocument()
    })
  })

  it('Get Directions link present when locationAddress set', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockResolvedValue(SAMPLE_TOURNAMENT)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Open in Apple Maps/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Google Maps/i)).toBeInTheDocument()
  })

  it('Share button present', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockResolvedValue(SAMPLE_TOURNAMENT)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /share tournament/i })).toBeInTheDocument()
    })
  })

  it('shows "Only team coaches can register" for logged-in non-coach', async () => {
    authState.user = { id: 'u2', name: 'Parent Pat', email: 'pat@test.com', emailVerified: true, roles: [] }
    authState.activeRole = { role: 'PARENT', teamId: null }

    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getById).mockResolvedValue(SAMPLE_TOURNAMENT)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Only team coaches can register via DiamondHub/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Register via Organizer/i)).toBeInTheDocument()
  })
})
