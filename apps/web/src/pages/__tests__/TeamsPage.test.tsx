import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamsPage } from '../TeamsPage.js'
import { teamApi } from '../../api/team.api.js'
import type { TeamResponse } from '@diamondhub/contracts'

// ── Mock auth store ────────────────────────────────────────────────────────────

const authState = {
  activeRole: null as null | { role: string; teamId: string | null },
}

vi.mock('../../store/auth.store.js', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}))

// ── Mock team API ──────────────────────────────────────────────────────────────

vi.mock('../../api/team.api.js', () => ({
  teamApi: {
    getMyTeams: vi.fn(),
  },
}))

// ── Mock useNavigate ───────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

const SAMPLE_TEAM: TeamResponse = {
  id: 'team-uuid-1',
  name: 'Westside Warriors',
  sport: 'BASEBALL',
  ageDivision: '12U',
  seasonYear: 2026,
  inviteCode: 'ABC123',
  coachId: 'coach-uuid-1',
  homeFieldName: 'Riverside Park',
  homeFieldCity: 'Nashville',
  photoUrl: null,
  isActive: true,
  memberCount: 15,
  nextEvent: null,
  pendingRsvpCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const TEAM_WITH_EVENTS: TeamResponse = {
  ...SAMPLE_TEAM,
  id: 'team-uuid-2',
  name: 'East Side Eagles',
  pendingRsvpCount: 3,
  nextEvent: { name: 'Spring Classic', startDate: '2026-08-10T09:00:00.000Z' },
}

function renderPage(queryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TeamsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.activeRole = null
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TeamsPage', () => {
  it('renders page heading', () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([])
    renderPage()
    expect(screen.getByText('My Teams')).toBeInTheDocument()
  })

  it('shows loading skeleton while data fetches', () => {
    vi.mocked(teamApi.getMyTeams).mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows team cards when data loads', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    renderPage()
    await waitFor(() => expect(screen.getByText('Westside Warriors')).toBeInTheDocument())
  })

  it('shows age division badge on team card', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    renderPage()
    await waitFor(() => expect(screen.getByText('12U')).toBeInTheDocument())
  })

  it('shows member count on team card', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    renderPage()
    await waitFor(() => expect(screen.getByText('15')).toBeInTheDocument())
  })

  it('shows pending RSVP count when > 0', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([TEAM_WITH_EVENTS])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText(/RSVPs pending/i)).toBeInTheDocument()
    })
  })

  it('shows next event label when nextEvent is set', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([TEAM_WITH_EVENTS])
    renderPage()
    await waitFor(() => expect(screen.getByText(/Spring Classic/i)).toBeInTheDocument())
  })

  it('shows empty state for new user with no teams (non-coach)', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([])
    authState.activeRole = { role: 'PARENT', teamId: null }
    renderPage()
    await waitFor(() => expect(screen.getByText(/No teams yet/i)).toBeInTheDocument())
  })

  it('shows "Create Your First Team" CTA in empty state for COACH', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([])
    authState.activeRole = { role: 'COACH', teamId: null }
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create your first team/i })).toBeInTheDocument(),
    )
  })

  it('shows "Create Team" FAB for COACH role', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    authState.activeRole = { role: 'COACH', teamId: null }
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create team/i })).toBeInTheDocument(),
    )
  })

  it('does NOT show "Create Team" FAB for PARENT role', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    authState.activeRole = { role: 'PARENT', teamId: null }
    renderPage()
    await waitFor(() => expect(screen.getByText('Westside Warriors')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /create team/i })).not.toBeInTheDocument()
  })

  it('does NOT show "Create Team" FAB for PLAYER role', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    authState.activeRole = { role: 'PLAYER', teamId: null }
    renderPage()
    await waitFor(() => expect(screen.getByText('Westside Warriors')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /create team/i })).not.toBeInTheDocument()
  })

  it('navigates to /teams/create when FAB is clicked (coach)', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    authState.activeRole = { role: 'COACH', teamId: null }
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create team/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /create team/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/teams/create')
  })

  it('navigates to /teams/:id when team card is clicked', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM])
    renderPage()
    await waitFor(() => screen.getByText('Westside Warriors'))
    fireEvent.click(screen.getByRole('button', { name: /Westside Warriors/i }))
    expect(mockNavigate).toHaveBeenCalledWith(`/teams/${SAMPLE_TEAM.id}`)
  })

  it('shows error state when API fails', async () => {
    vi.mocked(teamApi.getMyTeams).mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Failed to load teams/i)).toBeInTheDocument(),
    )
  })

  it('renders multiple team cards', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([SAMPLE_TEAM, TEAM_WITH_EVENTS])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Westside Warriors')).toBeInTheDocument()
      expect(screen.getByText('East Side Eagles')).toBeInTheDocument()
    })
  })
})
