import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { RosterList } from '../RosterList.js'
import type { PlayerResponse } from '@diamondhub/contracts'

// ── Sample data ────────────────────────────────────────────────────────────────

const PLAYER_1: PlayerResponse = {
  id: 'player-1',
  userId: 'user-1',
  teamId: 'team-1',
  firstName: 'Alex',
  lastName: 'Smith',
  jerseyNumber: 14,
  positions: ['SS', '2B'],
  dateOfBirth: null,
  bats: 'RIGHT',
  throws: 'RIGHT',
  status: 'ACTIVE',
  hasEmergencyContact: true,
  documentsCount: 0,
}

const PLAYER_2: PlayerResponse = {
  id: 'player-2',
  userId: 'user-2',
  teamId: 'team-1',
  firstName: 'Jordan',
  lastName: 'Lee',
  jerseyNumber: 7,
  positions: ['P', 'CF'],
  dateOfBirth: null,
  bats: 'LEFT',
  throws: 'RIGHT',
  status: 'ACTIVE',
  hasEmergencyContact: false,
  documentsCount: 1,
}

const ARCHIVED_PLAYER: PlayerResponse = {
  ...PLAYER_1,
  id: 'player-archived',
  firstName: 'Marcus',
  lastName: 'Johnson',
  status: 'ARCHIVED',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

const defaultProps = {
  players: [PLAYER_1, PLAYER_2],
  teamId: 'team-1',
  isCoach: false,
  onAddPlayer: vi.fn().mockResolvedValue(undefined),
  onArchivePlayer: vi.fn().mockResolvedValue(undefined),
  onFetchEmergencyContact: vi.fn().mockResolvedValue({
    contactName: 'Jane Smith',
    relationship: 'Mother',
    phone1: '+16155550001',
    phone2: null,
  }),
}

function renderList(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides }
  const queryClient = makeQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RosterList {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Reset ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('RosterList', () => {
  it('renders player names', () => {
    renderList()
    expect(screen.getByText('Alex Smith')).toBeInTheDocument()
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument()
  })

  it('renders jersey numbers', () => {
    renderList()
    expect(screen.getByText('#14')).toBeInTheDocument()
    expect(screen.getByText('#7')).toBeInTheDocument()
  })

  it('renders position pills', () => {
    renderList()
    // Player 1 has SS, 2B
    expect(screen.getByText('SS')).toBeInTheDocument()
    expect(screen.getByText('2B')).toBeInTheDocument()
  })

  it('does NOT show "Add Player" button for parent/non-coach', () => {
    renderList({ isCoach: false })
    expect(screen.queryByRole('button', { name: /add player/i })).not.toBeInTheDocument()
  })

  it('shows "Add Player" button for coach', () => {
    renderList({ isCoach: true })
    expect(screen.getByRole('button', { name: /add player/i })).toBeInTheDocument()
  })

  it('does NOT show kebab menu for non-coach', () => {
    renderList({ isCoach: false })
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument()
  })

  it('shows kebab menu for each player when coach', () => {
    renderList({ isCoach: true })
    const menuButtons = screen.getAllByRole('button', { name: /actions for/i })
    expect(menuButtons).toHaveLength(2)
  })

  it('does NOT render archived players', () => {
    renderList({ players: [PLAYER_1, ARCHIVED_PLAYER] })
    expect(screen.getByText('Alex Smith')).toBeInTheDocument()
    expect(screen.queryByText('Marcus Johnson')).not.toBeInTheDocument()
  })

  it('shows empty state message when no active players', () => {
    renderList({ players: [] })
    expect(screen.getByText(/no players on roster/i)).toBeInTheDocument()
  })

  it('shows loading skeleton when isLoading is true', () => {
    const { container } = renderList({ isLoading: true })
    // Skeleton rows are rendered as animated divs
    const skeletonRows = container.querySelectorAll('.animate-pulse')
    expect(skeletonRows.length).toBeGreaterThan(0)
  })

  it('opens archive confirmation when coach clicks Archive from kebab', async () => {
    renderList({ isCoach: true })

    // Open kebab for first player
    const kebabButtons = screen.getAllByRole('button', { name: /actions for/i })
    fireEvent.click(kebabButtons[0]!)

    // Click Archive Player
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /archive player/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /archive player/i }))

    // Confirm dialog should appear
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /archive/i })).toBeInTheDocument(),
    )
  })

  it('calls onArchivePlayer when coach confirms archive', async () => {
    const onArchivePlayer = vi.fn().mockResolvedValue(undefined)
    renderList({ isCoach: true, onArchivePlayer })

    // Open kebab and click Archive
    const kebabButtons = screen.getAllByRole('button', { name: /actions for/i })
    fireEvent.click(kebabButtons[0]!)

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /archive player/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /archive player/i }))

    // Confirm
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm archive/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm archive/i }))

    await waitFor(() => {
      expect(onArchivePlayer).toHaveBeenCalledWith(PLAYER_1.id)
    })
  })

  it('does NOT call onArchivePlayer when coach cancels archive', async () => {
    const onArchivePlayer = vi.fn().mockResolvedValue(undefined)
    renderList({ isCoach: true, onArchivePlayer })

    const kebabButtons = screen.getAllByRole('button', { name: /actions for/i })
    fireEvent.click(kebabButtons[0]!)

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /archive player/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /archive player/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(onArchivePlayer).not.toHaveBeenCalled()
  })

  it('opens add player form when coach clicks Add Player', async () => {
    renderList({ isCoach: true })

    fireEvent.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /add player/i })).toBeInTheDocument(),
    )
  })

  it('calls onAddPlayer with form data when coach submits', async () => {
    const onAddPlayer = vi.fn().mockResolvedValue(undefined)
    renderList({ isCoach: true, onAddPlayer })

    fireEvent.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /add player/i })).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Sam' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Rivera' } })
    fireEvent.change(screen.getByLabelText(/jersey/i), { target: { value: '22' } })

    const dialog = screen.getByRole('dialog', { name: /add player/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^add player$/i }))

    await waitFor(() => {
      expect(onAddPlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Sam',
          lastName: 'Rivera',
          jerseyNumber: 22,
        }),
      )
    })
  })
})
