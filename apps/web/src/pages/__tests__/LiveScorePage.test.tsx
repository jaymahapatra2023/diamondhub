import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LiveScorePage } from '../LiveScorePage.js'
import type { GameResponse } from '@diamondhub/contracts'

// ── Mock auth store ───────────────────────────────────────────────────────────

vi.mock('../../store/auth.store.js', () => ({
  useAuthStore: (selector?: (s: { user: null }) => unknown) => {
    const state = { user: null }
    return selector ? selector(state) : state
  },
}))

// ── Mock api client ───────────────────────────────────────────────────────────

vi.mock('../../api/client.js', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

// ── Mock socket.io-client (dynamic import) ────────────────────────────────────

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

// ── Sample game data ──────────────────────────────────────────────────────────

const SAMPLE_GAME: GameResponse = {
  id: 'game-1',
  tournamentId: 'tour-1',
  homeTeamId: 'ht-1',
  awayTeamId: 'at-1',
  homeTeamName: 'Red Hawks',
  awayTeamName: 'Blue Jays',
  field: 'Field 3',
  round: null,
  pool: null,
  gameNumber: 1,
  scheduledTime: '2026-08-01T10:00:00.000Z',
  actualStartTime: null,
  scoreHome: 5,
  scoreAway: 3,
  inning: 4,
  half: 'TOP',
  status: 'LIVE',
  winnerId: null,
  inningsDetail: [
    { inning: 1, home: 2, away: 1 },
    { inning: 2, home: 1, away: 0 },
    { inning: 3, home: 2, away: 2 },
  ],
  updatedAt: '2026-08-01T11:00:00.000Z',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function renderPage(gameId = 'game-1', queryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/live/${gameId}`]}>
        <Routes>
          <Route path="/live/:gameId" element={<LiveScorePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Reset ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LiveScorePage', () => {
  it('renders loading state while fetching', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {})) // Never resolves

    renderPage()

    expect(screen.getByText('Loading game...')).toBeInTheDocument()
    const pulseEl = document.querySelector('.animate-pulse')
    expect(pulseEl).toBeInTheDocument()
  })

  it('renders game not found on 404 error', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockRejectedValue({ response: { status: 404 } })

    renderPage('unknown-id')

    await waitFor(() => {
      expect(screen.getByText('Game not found')).toBeInTheDocument()
    })
    expect(screen.getByText(/This game link may be expired or invalid/i)).toBeInTheDocument()
  })

  it('renders score display with home and away team names', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_GAME })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('Red Hawks').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('Blue Jays').length).toBeGreaterThan(0)
    // Scores are shown as separate elements — check both
    const scores = screen.getAllByText(/^[0-9]+$/)
    const scoreValues = scores.map(el => el.textContent)
    expect(scoreValues).toContain('5')
    expect(scoreValues).toContain('3')
  })

  it('shows inning grid when inningsDetail is present', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_GAME })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('Red Hawks').length).toBeGreaterThan(0)
    })

    // Column headers for innings 1-7 (minimum) should appear
    const headers = screen.getAllByRole('columnheader')
    // Should have Team + innings 1-7 + R = 9 headers minimum
    expect(headers.length).toBeGreaterThanOrEqual(9)
    // Check inning numbers are rendered
    expect(screen.getByRole('columnheader', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'R' })).toBeInTheDocument()
  })

  it('shows LIVE status and polling indicator when socket is not connected', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_GAME })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument()
    })
    // Socket is not connected in test (mocked io doesn't trigger 'connect')
    // so polling indicator should show
    expect(screen.getByText('(polling)')).toBeInTheDocument()
  })

  it('renders share button', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_GAME })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('Red Hawks').length).toBeGreaterThan(0)
    })
    expect(screen.getByRole('button', { name: /share live score/i })).toBeInTheDocument()
  })

  it('renders FINAL status for completed games', async () => {
    const { apiClient } = await import('../../api/client.js')
    const finalGame: GameResponse = {
      ...SAMPLE_GAME,
      status: 'FINAL',
      winnerId: 'ht-1',
    }
    vi.mocked(apiClient.get).mockResolvedValue({ data: finalGame })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('FINAL')).toBeInTheDocument()
    })
    // No polling indicator for FINAL games
    expect(screen.queryByText('(polling)')).not.toBeInTheDocument()
  })
})
