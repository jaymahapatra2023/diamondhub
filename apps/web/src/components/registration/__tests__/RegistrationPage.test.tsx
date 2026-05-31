import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationPage } from '../../../pages/RegistrationPage.js'
import { tournamentApi } from '../../../api/tournament.api.js'
import { teamApi } from '../../../api/team.api.js'
import { registrationApi } from '../../../api/registration.api.js'

// ── Mock Stripe ───────────────────────────────────────────────────────────────

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CardElement: () => <div data-testid="card-element">Card Input</div>,
  useStripe: () => null,
  useElements: () => null,
}))

// ── Mock APIs ─────────────────────────────────────────────────────────────────

vi.mock('../../../api/tournament.api.js', () => ({
  tournamentApi: {
    getById: vi.fn(),
  },
}))

vi.mock('../../../api/team.api.js', () => ({
  teamApi: {
    getMyTeams: vi.fn(),
    getRoster: vi.fn(),
  },
}))

vi.mock('../../../api/registration.api.js', () => ({
  registrationApi: {
    startRegistration: vi.fn(),
  },
}))

// ── Mock useNavigate ──────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TOURNAMENT = {
  id: 'tourney-1',
  name: 'Spring Classic 2026',
  status: 'OPEN',
  sport: 'BASEBALL',
  organizer: 'USSSA',
  startDate: '2026-07-10T09:00:00.000Z',
  endDate: '2026-07-12T18:00:00.000Z',
  address: '123 Field Rd',
  city: 'Nashville',
  state: 'TN',
  zip: '37201',
  ageDivisions: ['10U', '12U', '14U'],
  format: 'POOL_BRACKET',
  entryFee: 0,
  spotsRemaining: 5,
  maxTeams: 16,
  currentTeams: 11,
  fieldsCount: 4,
  surface: 'GRASS',
  registrationDeadline: '2026-06-30T23:59:00.000Z',
  registrationUrl: null,
  hotelDealUrl: null,
  umpireInfo: null,
  notes: null,
  isBookmarked: false,
  isFollowing: false,
}

const TOURNAMENT_PAID = { ...TOURNAMENT, id: 'tourney-2', name: 'Paid Classic', entryFee: 35000 }

const TEAMS = [
  {
    id: 'team-1',
    name: 'Westside Warriors',
    sport: 'BASEBALL',
    ageDivision: '12U',
    seasonYear: 2026,
    inviteCode: 'ABC1',
    coachId: 'coach-1',
    homeFieldName: null,
    homeFieldCity: null,
    photoUrl: null,
    isActive: true,
    memberCount: 12,
    nextEvent: null,
    pendingRsvpCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'team-2',
    name: 'East Side Eagles',
    sport: 'BASEBALL',
    ageDivision: '14U',
    seasonYear: 2026,
    inviteCode: 'ABC2',
    coachId: 'coach-1',
    homeFieldName: null,
    homeFieldCity: null,
    photoUrl: null,
    isActive: true,
    memberCount: 14,
    nextEvent: null,
    pendingRsvpCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

const ROSTER = [
  { id: 'p1', name: 'Jake Smith', jerseyNumber: '10', position: 'P', dob: '2014-03-15' },
  { id: 'p2', name: 'Liam Davis', jerseyNumber: '22', position: 'C', dob: '2013-11-20' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function renderWithTournament(tournamentId = 'tourney-1') {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/registrations/new/${tournamentId}`]}>
        <Routes>
          <Route path="/registrations/new/:tournamentId" element={<RegistrationPage />} />
          <Route path="/my-registrations" element={<div>My Registrations</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tournamentApi.getById).mockResolvedValue(TOURNAMENT as never)
  vi.mocked(teamApi.getMyTeams).mockResolvedValue(TEAMS as never)
  vi.mocked(teamApi.getRoster).mockResolvedValue(ROSTER as never)
  vi.mocked(registrationApi.startRegistration).mockResolvedValue({
    id: 'reg-123',
    status: 'CONFIRMED',
  } as never)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RegistrationPage', () => {
  it('renders step 1 team selection', async () => {
    renderWithTournament()
    await waitFor(() => {
      expect(screen.getByText('Register for')).toBeInTheDocument()
    })
    expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    expect(screen.getByText('Select Team')).toBeInTheDocument()
  })

  it('shows team options from API', async () => {
    renderWithTournament()
    await waitFor(() => {
      expect(screen.getByText('Westside Warriors')).toBeInTheDocument()
    })
    expect(screen.getByText('East Side Eagles')).toBeInTheDocument()
  })

  it('shows tournament name in header', async () => {
    renderWithTournament()
    await waitFor(() => {
      expect(screen.getByText('Spring Classic 2026')).toBeInTheDocument()
    })
  })

  it('continues to step 2 on team + division selection', async () => {
    renderWithTournament()
    await waitFor(() => {
      expect(screen.getByText('Westside Warriors')).toBeInTheDocument()
    })

    // Select team
    fireEvent.click(screen.getByText('Westside Warriors'))

    // Select division
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '12U' } })

    // Click continue
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Review Roster')).toBeInTheDocument()
    })
  })

  it('shows roster on step 2', async () => {
    renderWithTournament()

    // Advance to step 2
    await waitFor(() => {
      expect(screen.getByText('Westside Warriors')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Westside Warriors'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '12U' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Jake Smith')).toBeInTheDocument()
    })
    expect(screen.getByText('Liam Davis')).toBeInTheDocument()
  })

  it('shows payment step for paid tournaments', async () => {
    vi.mocked(tournamentApi.getById).mockResolvedValue(TOURNAMENT_PAID as never)
    vi.mocked(registrationApi.startRegistration).mockResolvedValue({
      id: 'reg-456',
      status: 'CONFIRMED',
    } as never)

    renderWithTournament('tourney-2')

    // Advance to step 2
    await waitFor(() => {
      expect(screen.getByText('Westside Warriors')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Westside Warriors'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '12U' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Confirm Roster')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Roster' }))

    await waitFor(() => {
      expect(screen.getByText('Payment')).toBeInTheDocument()
    })
    // Text may be split across elements — check for partial match
    expect(screen.getByText((_, el) => el?.textContent?.includes('350') ?? false)).toBeInTheDocument()
  })

  it('shows confirmation on success for free tournament', async () => {
    renderWithTournament()

    await waitFor(() => {
      expect(screen.getByText('Westside Warriors')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Westside Warriors'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '12U' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Confirm Roster')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Roster' }))

    await waitFor(() => {
      expect(screen.getByText((_, el) => el?.textContent?.includes('Registration Confirmed') ?? false)).toBeInTheDocument()
    })
    expect(screen.getByText('reg-123')).toBeInTheDocument()
  })

  it('shows waitlist state when tournament is full', async () => {
    vi.mocked(registrationApi.startRegistration).mockResolvedValue({
      id: 'reg-789',
      status: 'WAITLISTED',
      waitlistPosition: 3,
    } as never)

    renderWithTournament()

    await waitFor(() => {
      expect(screen.getByText('Westside Warriors')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Westside Warriors'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '12U' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Confirm Roster')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Roster' }))

    await waitFor(() => {
      expect(screen.getByText((_, el) => (el?.textContent?.includes('Waitlist') || el?.textContent?.includes('waitlist')) ?? false)).toBeInTheDocument()
    })
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Position in waitlist')).toBeInTheDocument()
  })
})
