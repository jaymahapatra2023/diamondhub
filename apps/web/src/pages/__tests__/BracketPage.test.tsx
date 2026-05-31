import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BracketPage } from '../BracketPage.js'
import type { BracketGame } from '@diamondhub/contracts'

// ── Mock api client ───────────────────────────────────────────────────────────

vi.mock('../../api/client.js', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

// ── Sample data ───────────────────────────────────────────────────────────────

const makeGame = (overrides: Partial<BracketGame> = {}): BracketGame => ({
  id: 'game-1',
  tournamentId: 'tour-1',
  homeTeamId: 'ht-1',
  awayTeamId: 'at-1',
  homeTeamName: 'Red Hawks',
  awayTeamName: 'Blue Jays',
  field: 'Field 1',
  round: 'Quarterfinal',
  pool: null,
  gameNumber: 1,
  scheduledTime: '2026-08-01T10:00:00.000Z',
  actualStartTime: null,
  scoreHome: 4,
  scoreAway: 2,
  inning: 7,
  half: 'BOTTOM',
  status: 'FINAL',
  winnerId: 'ht-1',
  inningsDetail: [],
  updatedAt: '2026-08-01T12:00:00.000Z',
  nextGameId: null,
  isUserTeam: false,
  ...overrides,
})

const SAMPLE_BRACKET: BracketGame[] = [
  makeGame({ id: 'game-1', round: 'Quarterfinal' }),
  makeGame({
    id: 'game-2',
    round: 'Semifinal',
    homeTeamName: 'Green Giants',
    awayTeamName: 'Yellow Jackets',
    status: 'SCHEDULED',
    scoreHome: 0,
    scoreAway: 0,
    winnerId: null,
  }),
]

const POOL_BRACKET: BracketGame[] = [
  makeGame({
    id: 'game-pool-1',
    pool: 'A',
    round: null,
    status: 'FINAL',
    homeTeamName: 'Pool Team A',
    awayTeamName: 'Pool Team B',
  }),
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function renderPage(tournamentId = 'tour-1', queryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tournaments/${tournamentId}/bracket`]}>
        <Routes>
          <Route path="/tournaments/:tournamentId/bracket" element={<BracketPage />} />
          <Route path="/live/:gameId" element={<div data-testid="live-score-page">Live Score</div>} />
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

describe('BracketPage', () => {
  it('renders loading state while fetching', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}))

    renderPage()

    expect(screen.getByText('Loading bracket...')).toBeInTheDocument()
    const pulseEl = document.querySelector('.animate-pulse')
    expect(pulseEl).toBeInTheDocument()
  })

  it('renders empty state when bracket has no games', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('No games scheduled yet.')).toBeInTheDocument()
    })
    expect(screen.getByText(/Check back once the bracket is set/i)).toBeInTheDocument()
  })

  it('renders error state when fetch fails', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Bracket not available')).toBeInTheDocument()
    })
  })

  it('renders game cards for bracket games with team names', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_BRACKET })

    renderPage()

    // Use regex to match team names that may have a "● " winner prefix
    await waitFor(() => {
      expect(screen.getByText(/Red Hawks/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Blue Jays/)).toBeInTheDocument()
    expect(screen.getByText(/Green Giants/)).toBeInTheDocument()
    expect(screen.getByText(/Yellow Jackets/)).toBeInTheDocument()
  })

  it('renders bracket round headers', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_BRACKET })

    renderPage()

    // Headers are rendered with CSS text-transform: uppercase but text content is original case
    await waitFor(() => {
      expect(screen.getByText('Quarterfinal')).toBeInTheDocument()
    })
    expect(screen.getByText('Semifinal')).toBeInTheDocument()
  })

  it('links to /live/:gameId on game card click', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_BRACKET })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Red Hawks/)).toBeInTheDocument()
    })

    // Find the link for game-1
    const gameLinks = screen.getAllByRole('link')
    const liveLink = gameLinks.find(el => el.getAttribute('href') === '/live/game-1')
    expect(liveLink).toBeTruthy()
  })

  it('renders pool play section when pool games are present', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: POOL_BRACKET })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Pool Play')).toBeInTheDocument()
    })
    expect(screen.getByText('Pool A')).toBeInTheDocument()
    expect(screen.getByText(/Pool Team A/)).toBeInTheDocument()
  })

  it('renders share button', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: SAMPLE_BRACKET })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
    })
  })

  it('shows FINAL status and scores for completed games', async () => {
    const { apiClient } = await import('../../api/client.js')
    vi.mocked(apiClient.get).mockResolvedValue({ data: [makeGame()] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('FINAL')).toBeInTheDocument()
    })
    // Scores should be shown for FINAL games
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
