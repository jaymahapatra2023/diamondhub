import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
} from 'date-fns'
import { MonthGrid } from '../MonthGrid.js'
import type { ScheduleEventResponse } from '@diamondhub/contracts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ScheduleEventResponse> = {}): ScheduleEventResponse {
  return {
    id: 'evt-1',
    teamId: 'team-1',
    type: 'PRACTICE',
    title: 'Saturday Practice',
    locationName: 'Riverside Field',
    locationAddress: null,
    lat: null,
    lng: null,
    startTime: '2026-05-10T10:00:00.000Z',
    endTime: '2026-05-10T12:00:00.000Z',
    notes: null,
    isCancelled: false,
    cancelledAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

// Count day cells in the grid for a given month
function expectedDayCells(year: number, month: number): number {
  const ms = startOfMonth(new Date(year, month, 1))
  const me = endOfMonth(ms)
  const gs = startOfWeek(ms, { weekStartsOn: 0 })
  const ge = endOfWeek(me, { weekStartsOn: 0 })
  return eachDayOfInterval({ start: gs, end: ge }).length
}

function renderGrid({
  year = 2026,
  month = 4, // May — 0-indexed
  events = [] as ScheduleEventResponse[],
  selectedDate = new Date(2026, 4, 1),
  onDaySelect = vi.fn(),
} = {}) {
  return render(
    <MonthGrid
      year={year}
      month={month}
      events={events}
      selectedDate={selectedDate}
      onDaySelect={onDaySelect}
    />,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonthGrid', () => {
  it('renders the correct number of day cells for May 2026', () => {
    renderGrid({ year: 2026, month: 4 })
    const expected = expectedDayCells(2026, 4)
    // Each cell is a <button> with an aria-label like "May X, 2026"
    const cells = screen.getAllByRole('button')
    // May 2026: starts Friday → grid starts Sun Apr 26, ends Sat Jun 6 → 42 cells
    expect(cells.length).toBe(expected)
  })

  it('renders the correct number of day cells for February 2026', () => {
    renderGrid({ year: 2026, month: 1 })
    const expected = expectedDayCells(2026, 1)
    const cells = screen.getAllByRole('button')
    expect(cells.length).toBe(expected)
  })

  it('shows today with the highlighted indicator', () => {
    // We can't easily control "today", so we test that TODAY's date button
    // gets aria-pressed="true" when it's the selectedDate
    const today = new Date()
    renderGrid({ selectedDate: today, year: today.getFullYear(), month: today.getMonth() })
    const todayLabel = format(today, 'MMMM d, yyyy')
    const todayCell = screen.getByRole('button', { name: todayLabel })
    expect(todayCell).toBeDefined()
    expect(todayCell.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows a colored dot for a day that has an event', () => {
    const eventDay = new Date(2026, 4, 10) // May 10, 2026
    const events = [makeEvent({ startTime: '2026-05-10T10:00:00.000Z', type: 'PRACTICE' })]
    renderGrid({ events, year: 2026, month: 4 })

    // The dot is an aria-hidden span inside the cell — we verify the cell renders children
    const cellLabel = format(eventDay, 'MMMM d, yyyy')
    const cell = screen.getByRole('button', { name: cellLabel })
    // Find colored dot inside the cell
    const dots = cell.querySelectorAll('span.bg-green-500, span.bg-blue-500, span.bg-red-500')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('calls onDaySelect with the correct Date when a day is clicked', () => {
    const onDaySelect = vi.fn()
    renderGrid({ year: 2026, month: 4, onDaySelect })

    const cell = screen.getByRole('button', { name: 'May 15, 2026' })
    fireEvent.click(cell)

    expect(onDaySelect).toHaveBeenCalledOnce()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const called = onDaySelect.mock.calls[0]?.[0] as Date
    expect(called).toBeDefined()
    expect(called.getFullYear()).toBe(2026)
    expect(called.getMonth()).toBe(4)
    expect(called.getDate()).toBe(15)
  })

  it('shows "+N" overflow label when a day has more than 3 events', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({
        id: `evt-${i}`,
        startTime: '2026-05-10T10:00:00.000Z',
        endTime: '2026-05-10T11:00:00.000Z',
        type: 'PRACTICE',
      }),
    )
    renderGrid({ events, year: 2026, month: 4 })

    const cell = screen.getByRole('button', { name: 'May 10, 2026' })
    // overflow = 5 - 3 = 2
    expect(cell.textContent).toContain('+2')
  })

  it('shows cancelled events as muted dots (bg-gray-600), not colored', () => {
    const events = [
      makeEvent({
        id: 'evt-cancelled',
        startTime: '2026-05-10T10:00:00.000Z',
        type: 'PRACTICE',
        isCancelled: true,
        cancelledAt: '2026-05-09T00:00:00.000Z',
      }),
    ]
    renderGrid({ events, year: 2026, month: 4 })

    const cell = screen.getByRole('button', { name: 'May 10, 2026' })
    const mutedDots = cell.querySelectorAll('span.bg-gray-600')
    expect(mutedDots.length).toBeGreaterThan(0)
    // Should NOT have a green dot
    const greenDots = cell.querySelectorAll('span.bg-green-500')
    expect(greenDots.length).toBe(0)
  })
})
