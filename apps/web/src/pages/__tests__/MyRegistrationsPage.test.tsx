import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MyRegistrationsPage } from '../MyRegistrationsPage.js'
import { teamApi } from '../../api/team.api.js'
import { registrationApi } from '../../api/registration.api.js'
import type { TeamResponse } from '@diamondhub/contracts'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../api/team.api.js', () => ({
  teamApi: {
    getMyTeams: vi.fn(),
  },
}))

vi.mock('../../api/registration.api.js', () => ({
  registrationApi: {
    getTeamRegistrations: vi.fn(),
    withdraw: vi.fn(),
    lockRoster: vi.fn(),
    getPaymentHistory: vi.fn(),
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM: TeamResponse = {
  id: 'team-1',
  name: 'Westside Warriors',
  sport: 'BASEBALL',
  ageDivision: '12U',
  seasonYear: 2026,
  inviteCode: 'WW12',
  coachId: 'coach-1',
  homeFieldName: null,
  homeFieldCity: null,
  photoUrl: null,
  isActive: true,
  memberCount: 12,
  nextEvent: null,
  pendingRsvpCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const CONFIRMED_REG = {
  id: 'reg-1',
  tournamentId: 'tourney-1',
  teamId: 'team-uuid-1',
  tournamentName: 'Spring Classic 2026',
  tournamentStartDate: '2026-07-10T09:00:00.000Z',
  tournamentEndDate: '2026-07-12T18:00:00.000Z',
  division: '12U',
  status: 'CONFIRMED' as const,
  paymentStatus: 'PAID' as const,
  rosterLocked: false,
}

const PENDING_REG = {
  id: 'reg-2',
  tournamentId: 'tourney-2',
  tournamentName: 'Summer Slam 2026',
  tournamentStartDate: '2026-08-01T09:00:00.000Z',
  tournamentEndDate: '2026-08-03T18:00:00.000Z',
  division: '12U',
  status: 'PENDING_PAYMENT' as const,
  paymentStatus: 'UNPAID' as const,
  rosterLocked: false,
}

const WAITLISTED_REG = {
  id: 'reg-3',
  tournamentId: 'tourney-3',
  tournamentName: 'Fall Tournament 2026',
  tournamentStartDate: '2026-09-15T09:00:00.000Z',
  tournamentEndDate: '2026-09-17T18:00:00.000Z',
  division: '12U',
  status: 'WAITLISTED' as const,
  paymentStatus: 'FREE' as const,
  rosterLocked: false,
  waitlistPosition: 2,
}

const WITHDRAWN_REG = {
  id: 'reg-4',
  tournamentId: 'tourney-4',
  tournamentName: 'Old Tournament 2026',
  tournamentStartDate: '2026-06-01T09:00:00.000Z',
  tournamentEndDate: '2026-06-02T18:00:00.000Z',
  division: '12U',
  status: 'WITHDRAWN' as const,
  paymentStatus: 'REFUNDED' as const,
  rosterLocked: false,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderPage(qc = makeQueryClient()) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MyRegistrationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(teamApi.getMyTeams).mockResolvedValue([TEAM] as never)
  vi.mocked(registrationApi.getTeamRegistrations).mockResolvedValue([
    CONFIRMED_REG,
    PENDING_REG,
    WAITLISTED_REG,
    WITHDRAWN_REG,
  ] as never)
  vi.mocked(registrationApi.withdraw).mockResolvedValue({ success: true } as never)
  vi.mocked(registrationApi.lockRoster).mockResolvedValue({ success: true } as never)
  vi.mocked(registrationApi.getPaymentHistory).mockResolvedValue([] as never)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MyRegistrationsPage', () => {
  it('shows registrations list', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    })
    expect(screen.getByText('Summer Slam 2026')).toBeInTheDocument()
    expect(screen.getByText('Fall Tournament 2026')).toBeInTheDocument()
    expect(screen.getByText('Old Tournament 2026')).toBeInTheDocument()
  })

  it('status badges render correctly', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Confirmed')).toBeInTheDocument()
    })
    expect(screen.getByText('Pending Payment')).toBeInTheDocument()
    expect(screen.getByText('Waitlisted')).toBeInTheDocument()
    expect(screen.getByText('Withdrawn')).toBeInTheDocument()
  })

  it('shows Lock Roster button only for CONFIRMED registrations', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    })

    // Lock Roster should appear once (only for confirmed, unlocked reg)
    const lockButtons = screen.getAllByRole('button', { name: /lock roster/i })
    expect(lockButtons).toHaveLength(1)
  })

  it('does not show Lock Roster for PENDING, WAITLISTED, or WITHDRAWN registrations', async () => {
    // Only return non-confirmed registrations
    vi.mocked(registrationApi.getTeamRegistrations).mockResolvedValue([
      PENDING_REG,
      WAITLISTED_REG,
      WITHDRAWN_REG,
    ] as never)

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Summer Slam 2026')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /lock roster/i })).not.toBeInTheDocument()
  })

  it('does not show Lock Roster for already-locked CONFIRMED registration', async () => {
    vi.mocked(registrationApi.getTeamRegistrations).mockResolvedValue([
      { ...CONFIRMED_REG, rosterLocked: true },
    ] as never)

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /lock roster/i })).not.toBeInTheDocument()
    expect(screen.getByText('Roster locked ✓')).toBeInTheDocument()
  })

  it('Withdraw shows confirmation dialog', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    })

    // Click the first Withdraw button (for CONFIRMED reg)
    const withdrawButtons = screen.getAllByRole('button', { name: /withdraw/i })
    fireEvent.click(withdrawButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(screen.getByText('Withdraw Registration?')).toBeInTheDocument()
    expect(screen.getAllByText(/Spring Classic 2026/i).length).toBeGreaterThan(0)
  })

  it('closes dialog on cancel', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    })

    const withdrawButtons = screen.getAllByRole('button', { name: /withdraw/i })
    fireEvent.click(withdrawButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('calls withdraw API on confirm', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    })

    const withdrawButtons = screen.getAllByRole('button', { name: /withdraw/i })
    fireEvent.click(withdrawButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click confirm withdraw in dialog — scope to dialog to avoid list button ambiguity
    const dialog = screen.getByRole('dialog')
    const confirmButton = within(dialog).getByRole('button', { name: /^withdraw$/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      // withdraw now takes (registrationId, teamId)
      expect(registrationApi.withdraw).toHaveBeenCalledWith(CONFIRMED_REG.id, CONFIRMED_REG.teamId)
    })
  })

  it('shows empty state when team has no registrations', async () => {
    vi.mocked(registrationApi.getTeamRegistrations).mockResolvedValue([] as never)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/No registrations for Westside Warriors/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Find tournaments/i)).toBeInTheDocument()
  })

  it('shows empty state when user has no teams', async () => {
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([] as never)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No teams yet')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Create a Team' })).toBeInTheDocument()
  })

  it('shows team tab selector when multiple teams', async () => {
    const TEAM_2: TeamResponse = {
      ...TEAM,
      id: 'team-2',
      name: 'East Side Eagles',
    }
    vi.mocked(teamApi.getMyTeams).mockResolvedValue([TEAM, TEAM_2] as never)
    vi.mocked(registrationApi.getTeamRegistrations).mockResolvedValue([CONFIRMED_REG] as never)

    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Westside Warriors' })).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'East Side Eagles' })).toBeInTheDocument()
  })
})
