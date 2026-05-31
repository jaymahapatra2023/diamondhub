// E4: Month calendar grid — pure presentational, no overflow at 375px
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  format,
} from 'date-fns'
import type { ScheduleEventResponse } from '@diamondhub/contracts'

// ── Event type colors ──────────────────────────────────────────────────────────

const EVENT_DOT_COLORS: Record<string, string> = {
  TOURNAMENT: 'bg-blue-500',
  GAME: 'bg-red-500',
  PRACTICE: 'bg-green-500',
  MEETING: 'bg-gray-400',
  OTHER: 'bg-gray-400',
}

function getEventDotColor(type: string, isCancelled: boolean): string {
  if (isCancelled) return 'bg-gray-600'
  return EVENT_DOT_COLORS[type] ?? 'bg-gray-400'
}

// ── Day cell ───────────────────────────────────────────────────────────────────

interface DayCellProps {
  date: Date
  currentMonth: { year: number; month: number }
  isSelected: boolean
  events: ScheduleEventResponse[]
  onSelect: (date: Date) => void
}

function DayCell({ date, currentMonth, isSelected, events, onSelect }: DayCellProps) {
  const today = isToday(date)
  const inMonth = isSameMonth(date, new Date(currentMonth.year, currentMonth.month, 1))
  const past = date < new Date(new Date().setHours(0, 0, 0, 0))

  const maxDots = 3
  const dotEvents = events.slice(0, maxDots)
  const overflow = events.length - maxDots

  return (
    <button
      onClick={() => onSelect(date)}
      aria-label={format(date, 'MMMM d, yyyy')}
      aria-pressed={isSelected}
      className={[
        'relative flex flex-col items-center justify-start pt-1 pb-1 w-full min-h-[3.25rem]',
        'rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        !inMonth && 'opacity-30',
        past && inMonth && 'opacity-50',
        isSelected && !today && 'bg-white/10',
        'tap-highlight-transparent',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Day number */}
      <span
        className={[
          'flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium leading-none',
          today && !isSelected && 'bg-blue-600 text-white',
          today && isSelected && 'bg-blue-600 text-white ring-2 ring-white',
          !today && isSelected && 'bg-white text-gray-900',
          !today && !isSelected && 'text-gray-200',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {format(date, 'd')}
      </span>

      {/* Event dots row */}
      {events.length > 0 && (
        <div className="flex items-center gap-0.5 mt-0.5 h-2">
          {dotEvents.map((evt, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getEventDotColor(evt.type, evt.isCancelled)}`}
              aria-hidden="true"
            />
          ))}
          {overflow > 0 && (
            <span className="text-[9px] text-gray-400 leading-none ml-0.5">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </button>
  )
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

export interface MonthGridProps {
  year: number
  month: number // 0-indexed
  events: ScheduleEventResponse[]
  selectedDate: Date
  onDaySelect: (date: Date) => void
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function MonthGrid({ year, month, events, selectedDate, onDaySelect }: MonthGridProps) {
  const monthStart = startOfMonth(new Date(year, month, 1))
  const monthEnd = endOfMonth(monthStart)

  // Grid spans from start of first week to end of last week
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Build a map: dateKey → events
  const eventsByDay = new Map<string, ScheduleEventResponse[]>()
  for (const evt of events) {
    const key = format(parseISO(evt.startTime), 'yyyy-MM-dd')
    const existing = eventsByDay.get(key) ?? []
    existing.push(evt)
    eventsByDay.set(key, existing)
  }

  return (
    <div className="w-full">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1" role="row">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide py-1"
            role="columnheader"
            aria-label={d}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px" role="grid" aria-label="Calendar days">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayEvents = eventsByDay.get(key) ?? []
          return (
            <DayCell
              key={key}
              date={day}
              currentMonth={{ year, month }}
              isSelected={isSameDay(day, selectedDate)}
              events={dayEvents}
              onSelect={onDaySelect}
            />
          )
        })}
      </div>
    </div>
  )
}
