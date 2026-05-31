import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TournamentCard } from '../TournamentCard.js'
import type { TournamentSummary } from '@diamondhub/contracts'

// ── Fixture ─────────────────────────────────────────────────────────────────

const BASE_TOURNAMENT: TournamentSummary = {
  id: 'aaaa-1111-bbbb-2222',
  name: 'Summer Slam Classic',
  organizer: 'USSSA',
  sport: 'BASEBALL',
  ageDivisions: ['10U', '12U'],
  format: 'POOL_BRACKET',
  startDate: '2026-07-10T00:00:00.000Z',
  endDate: '2026-07-12T00:00:00.000Z',
  city: 'Atlanta',
  state: 'GA',
  entryFee: 495,
  maxTeams: 32,
  currentTeams: 28,
  spotsRemaining: 4,
  status: 'OPEN',
  lat: 33.749,
  lng: -84.388,
}

function renderCard(props: Partial<React.ComponentProps<typeof TournamentCard>> = {}) {
  return render(
    <MemoryRouter>
      <TournamentCard tournament={BASE_TOURNAMENT} {...props} />
    </MemoryRouter>,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TournamentCard', () => {
  it('renders the tournament name', () => {
    renderCard()
    expect(screen.getByText('Summer Slam Classic')).toBeInTheDocument()
  })

  it('renders organizer label', () => {
    renderCard()
    expect(screen.getByText('USSSA')).toBeInTheDocument()
  })

  it('renders formatted start and end dates', () => {
    renderCard()
    // Dates are formatted from UTC ISO strings — accept any reasonable offset
    // The date row contains both dates joined by " – "
    const dateEl = screen.getByText(/Jul \d+ – Jul \d+, 2026/)
    expect(dateEl).toBeInTheDocument()
  })

  it('renders city and state', () => {
    renderCard()
    expect(screen.getByText('Atlanta, GA')).toBeInTheDocument()
  })

  it('renders age divisions', () => {
    renderCard()
    expect(screen.getByText('10U, 12U')).toBeInTheDocument()
  })

  it('renders entry fee', () => {
    renderCard()
    expect(screen.getByText('$495')).toBeInTheDocument()
  })

  it('renders "Free" when entry fee is 0', () => {
    renderCard({ tournament: { ...BASE_TOURNAMENT, entryFee: 0 } })
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('renders spots remaining', () => {
    renderCard()
    expect(screen.getByText('(4 left)')).toBeInTheDocument()
  })

  it('shows distance when distanceMeters is provided', () => {
    renderCard({ tournament: { ...BASE_TOURNAMENT, distanceMeters: 80467 } }) // ~50 miles
    expect(screen.getByText(/50 mi/)).toBeInTheDocument()
  })

  it('does not show distance when distanceMeters is absent', () => {
    renderCard()
    expect(screen.queryByText(/mi$/)).not.toBeInTheDocument()
  })

  it('renders a link pointing to /tournaments/:id', () => {
    renderCard()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', `/tournaments/${BASE_TOURNAMENT.id}`)
  })

  it('renders bookmark button when onBookmark provided', () => {
    const onBookmark = vi.fn()
    renderCard({ onBookmark })
    expect(screen.getByRole('button', { name: /bookmark/i })).toBeInTheDocument()
  })

  it('does not render bookmark button when onBookmark is absent', () => {
    renderCard()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows star (⭐) when isBookmarked=true', () => {
    const onBookmark = vi.fn()
    renderCard({ isBookmarked: true, onBookmark })
    expect(screen.getByText('⭐')).toBeInTheDocument()
  })

  it('shows hollow star (☆) when isBookmarked=false', () => {
    const onBookmark = vi.fn()
    renderCard({ isBookmarked: false, onBookmark })
    expect(screen.getByText('☆')).toBeInTheDocument()
  })

  it('calls onBookmark with (id, true) when not bookmarked and button clicked', () => {
    const onBookmark = vi.fn()
    renderCard({ isBookmarked: false, onBookmark })
    fireEvent.click(screen.getByRole('button', { name: /bookmark/i }))
    expect(onBookmark).toHaveBeenCalledTimes(1)
    expect(onBookmark).toHaveBeenCalledWith(BASE_TOURNAMENT.id, true)
  })

  it('calls onBookmark with (id, false) when already bookmarked and button clicked', () => {
    const onBookmark = vi.fn()
    renderCard({ isBookmarked: true, onBookmark })
    fireEvent.click(screen.getByRole('button', { name: /remove bookmark/i }))
    expect(onBookmark).toHaveBeenCalledTimes(1)
    expect(onBookmark).toHaveBeenCalledWith(BASE_TOURNAMENT.id, false)
  })

  it('bookmark button click calls onBookmark exactly once (propagation stopped)', () => {
    const onBookmark = vi.fn()
    renderCard({ onBookmark })
    const btn = screen.getByRole('button', { name: /bookmark/i })
    fireEvent.click(btn)
    // Propagation is stopped — onBookmark should fire once, not twice
    expect(onBookmark).toHaveBeenCalledTimes(1)
  })

  it('renders status badge with correct text', () => {
    renderCard()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
  })

  it('renders WAITLIST status correctly', () => {
    renderCard({ tournament: { ...BASE_TOURNAMENT, status: 'WAITLIST' } })
    expect(screen.getByText('WAITLIST')).toBeInTheDocument()
  })
})
