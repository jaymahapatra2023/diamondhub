import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookmarksPage } from '../BookmarksPage.js'
import type { TournamentSearchResponse } from '@diamondhub/contracts'

// ── Mock tournament API ───────────────────────────────────────────────────────

vi.mock('../../api/tournament.api.js', () => ({
  tournamentApi: {
    getBookmarks: vi.fn(),
    unbookmark: vi.fn(),
    bookmark: vi.fn(),
  },
}))

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_BOOKMARK = {
  id: 'tour-1',
  name: 'Diamond Classic 2026',
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
}

function buildBookmarksResponse(
  tournaments: typeof SAMPLE_BOOKMARK[] = [],
): TournamentSearchResponse {
  return {
    tournaments,
    total: tournaments.length,
    page: 1,
    limit: 20,
    hasMore: false,
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
        <BookmarksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Reset before each test ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BookmarksPage', () => {
  it('renders loading skeleton', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getBookmarks).mockImplementation(() => new Promise(() => {})) // Never resolves

    renderPage()

    // Page heading still renders
    expect(screen.getByText('Bookmarks')).toBeInTheDocument()
    // Skeleton is present (animate-pulse)
    const pulseEl = document.querySelector('.animate-pulse')
    expect(pulseEl).toBeInTheDocument()
  })

  it('shows empty state when no bookmarks', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getBookmarks).mockResolvedValue(buildBookmarksResponse([]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/No bookmarks yet/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /Find Tournaments/i })).toBeInTheDocument()
  })

  it('shows tournament cards when bookmarks exist', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getBookmarks).mockResolvedValue(
      buildBookmarksResponse([SAMPLE_BOOKMARK]),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Diamond Classic 2026')).toBeInTheDocument()
    })
    // Count label in header
    expect(screen.getByText(/1 saved tournament/i)).toBeInTheDocument()
  })

  it('unbookmark button calls api correctly', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getBookmarks).mockResolvedValue(
      buildBookmarksResponse([SAMPLE_BOOKMARK]),
    )
    vi.mocked(tournamentApi.unbookmark).mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Diamond Classic 2026')).toBeInTheDocument()
    })

    // Find and click the bookmark/star button (isBookmarked=true so it shows ⭐)
    const bookmarkBtn = screen.getByRole('button', { name: /remove bookmark/i })
    fireEvent.click(bookmarkBtn)

    await waitFor(() => {
      expect(tournamentApi.unbookmark).toHaveBeenCalledWith('tour-1')
    })
  })

  it('error state rendered when API fails', async () => {
    const { tournamentApi } = await import('../../api/tournament.api.js')
    vi.mocked(tournamentApi.getBookmarks).mockRejectedValue(new Error('Network error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load bookmarks/i)).toBeInTheDocument()
    })
  })
})
