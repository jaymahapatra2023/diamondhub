// E4: Schedule & Calendar page — month/week/day views, 375px-safe, role-aware
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isToday,
  parseISO,
  formatISO,
} from 'date-fns'
import { scheduleApi } from '../api/schedule.api.js'
import { useAuthStore } from '../store/auth.store.js'
import { MonthGrid } from '../components/schedule/MonthGrid.js'
import { EventCard } from '../components/schedule/EventCard.js'
import { EventDetailSheet } from '../components/schedule/EventDetailSheet.js'
import { AddEventSheet } from '../components/schedule/AddEventSheet.js'
import type { ScheduleEventResponse } from '@diamondhub/contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day'

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventColor(type: string, cancelled: boolean): string {
  if (cancelled) return 'text-gray-500'
  const colors: Record<string, string> = {
    TOURNAMENT: 'text-blue-400',
    GAME: 'text-red-400',
    PRACTICE: 'text-green-400',
    MEETING: 'text-gray-400',
    OTHER: 'text-gray-400',
  }
  return colors[type] ?? 'text-gray-400'
}

// ── Week view strip ────────────────────────────────────────────────────────────

interface WeekStripProps {
  weekStart: Date
  events: ScheduleEventResponse[]
  selectedDate: Date
  onDaySelect: (date: Date) => void
  onEventClick: (evt: ScheduleEventResponse) => void
}

function WeekStrip({ weekStart, events, selectedDate, onDaySelect, onEventClick }: WeekStripProps) {
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 0 }) })

  // Group events by day key
  const byDay = new Map<string, ScheduleEventResponse[]>()
  for (const evt of events) {
    const key = format(parseISO(evt.startTime), 'yyyy-MM-dd')
    const existing = byDay.get(key) ?? []
    existing.push(evt)
    byDay.set(key, existing)
  }

  return (
    <div className="space-y-4">
      {/* Day header strip */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDate)
          const today = isToday(day)
          return (
            <button
              key={day.toISOString()}
              onClick={() => onDaySelect(day)}
              aria-label={format(day, 'EEEE, MMMM d')}
              aria-pressed={isSelected}
              className={[
                'flex flex-col items-center py-2 rounded-xl transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isSelected && !today && 'bg-white/10',
                isSelected && today && 'bg-blue-600/20',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="text-[10px] font-semibold uppercase text-gray-500">
                {format(day, 'E')}
              </span>
              <span
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mt-0.5',
                  today && !isSelected && 'bg-blue-600 text-white',
                  today && isSelected && 'bg-blue-600 text-white ring-2 ring-white',
                  !today && isSelected && 'bg-white text-gray-900',
                  !today && !isSelected && 'text-gray-200',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {format(day, 'd')}
              </span>
              {/* Event indicator dot */}
              {(byDay.get(format(day, 'yyyy-MM-dd')) ?? []).length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-0.5" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>

      {/* Events for each day */}
      <div className="space-y-4">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayEvents = byDay.get(key) ?? []
          if (dayEvents.length === 0) return null
          return (
            <div key={key}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {format(day, 'EEEE, MMM d')}
              </p>
              <div className="space-y-2">
                {dayEvents
                  .slice()
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((evt) => (
                    <EventCard key={evt.id} event={evt} onClick={onEventClick} />
                  ))}
              </div>
            </div>
          )
        })}
        {days.every((d) => (byDay.get(format(d, 'yyyy-MM-dd')) ?? []).length === 0) && (
          <p className="text-center text-gray-500 text-sm py-8">No events this week</p>
        )}
      </div>
    </div>
  )
}

// ── Day view ──────────────────────────────────────────────────────────────────

interface DayViewProps {
  date: Date
  events: ScheduleEventResponse[]
  onEventClick: (evt: ScheduleEventResponse) => void
}

function DayView({ date, events, onEventClick }: DayViewProps) {
  const key = format(date, 'yyyy-MM-dd')
  const dayEvents = events
    .filter((e) => format(parseISO(e.startTime), 'yyyy-MM-dd') === key)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <div>
      <p className="text-sm font-semibold text-gray-400 mb-3">
        {isToday(date) ? 'Today — ' : ''}{format(date, 'EEEE, MMMM d')}
      </p>
      {dayEvents.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2 text-center">
          <span className="text-3xl" aria-hidden="true">📅</span>
          <p className="text-gray-500 text-sm">No events today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayEvents.map((evt) => (
            <EventCard key={evt.id} event={evt} onClick={onEventClick} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── SchedulePage ──────────────────────────────────────────────────────────────

export function SchedulePage() {
  const activeRole = useAuthStore((s) => s.activeRole)
  const isCoach = activeRole?.role === 'COACH'

  const [view, setView] = useState<ViewMode>('month')
  const [today] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(today)

  // Month nav state
  const [navDate, setNavDate] = useState<Date>(today)

  // Sheets
  const [detailEvent, setDetailEvent] = useState<ScheduleEventResponse | null>(null)
  const [editEvent, setEditEvent] = useState<ScheduleEventResponse | null>(null)
  const [addSheetOpen, setAddSheetOpen] = useState(false)

  // ── Compute date range for query ───────────────────────────────────────────

  const { start, end } = useMemo(() => {
    if (view === 'month') {
      const ms = startOfMonth(navDate)
      const me = endOfMonth(navDate)
      return {
        start: formatISO(startOfWeek(ms, { weekStartsOn: 0 })),
        end: formatISO(endOfWeek(me, { weekStartsOn: 0 })),
      }
    }
    if (view === 'week') {
      const ws = startOfWeek(navDate, { weekStartsOn: 0 })
      return {
        start: formatISO(ws),
        end: formatISO(endOfWeek(ws, { weekStartsOn: 0 })),
      }
    }
    // Day
    return {
      start: formatISO(startOfWeek(navDate, { weekStartsOn: 0 })),
      end: formatISO(endOfWeek(navDate, { weekStartsOn: 0 })),
    }
  }, [view, navDate])

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['schedule', start, end],
    queryFn: () => scheduleApi.getUserEvents(start, end),
    staleTime: 2 * 60 * 1000, // 2 min
  })

  // ── Navigation ─────────────────────────────────────────────────────────────

  function handlePrev() {
    if (view === 'month') setNavDate((d) => subMonths(d, 1))
    else setNavDate((d) => subWeeks(d, 1))
  }

  function handleNext() {
    if (view === 'month') setNavDate((d) => addMonths(d, 1))
    else setNavDate((d) => addWeeks(d, 1))
  }

  function handleToday() {
    setNavDate(today)
    setSelectedDate(today)
  }

  // ── Header label ───────────────────────────────────────────────────────────

  const headerLabel = useMemo(() => {
    if (view === 'month') return format(navDate, 'MMMM yyyy')
    if (view === 'week') {
      const ws = startOfWeek(navDate, { weekStartsOn: 0 })
      const we = endOfWeek(navDate, { weekStartsOn: 0 })
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`
    }
    return format(selectedDate, 'MMMM d, yyyy')
  }, [view, navDate, selectedDate])

  // ── Day select (month view) ────────────────────────────────────────────────

  function handleDaySelect(date: Date) {
    setSelectedDate(date)
    setNavDate(date)
    setView('day')
  }

  // ── Event click ───────────────────────────────────────────────────────────

  function handleEventClick(evt: ScheduleEventResponse) {
    setDetailEvent(evt)
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 space-y-3">
        <h1 className="text-xl font-bold text-white">Schedule</h1>
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1" role="tablist" aria-label="Calendar view">
          {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={[
                'flex-1 h-9 rounded-lg text-sm font-semibold capitalize transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                view === v
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white',
              ].join(' ')}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Month/week navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </button>

          <button
            onClick={handleToday}
            className="flex-1 text-center font-semibold text-white text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg py-1"
            aria-label="Jump to today"
          >
            {headerLabel}
          </button>

          <button
            onClick={handleNext}
            aria-label={view === 'month' ? 'Next month' : 'Next week'}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2 mt-2" aria-label="Loading events">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {view === 'month' && (
              <MonthGrid
                year={navDate.getFullYear()}
                month={navDate.getMonth()}
                events={events}
                selectedDate={selectedDate}
                onDaySelect={handleDaySelect}
              />
            )}

            {view === 'week' && (
              <WeekStrip
                weekStart={startOfWeek(navDate, { weekStartsOn: 0 })}
                events={events}
                selectedDate={selectedDate}
                onDaySelect={(d) => {
                  setSelectedDate(d)
                  setNavDate(d)
                }}
                onEventClick={handleEventClick}
              />
            )}

            {view === 'day' && (
              <DayView
                date={selectedDate}
                events={events}
                onEventClick={handleEventClick}
              />
            )}
          </>
        )}
      </div>

      {/* ── Coach FAB ── */}
      {isCoach && (
        <button
          onClick={() => {
            setEditEvent(null)
            setAddSheetOpen(true)
          }}
          aria-label="Add event"
          className="fixed right-4 bottom-24 z-30 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/40 flex items-center justify-center text-2xl hover:bg-blue-500 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
        >
          <span aria-hidden="true">+</span>
        </button>
      )}

      {/* ── Event detail sheet ── */}
      <EventDetailSheet
        event={detailEvent}
        isOpen={detailEvent !== null}
        isCoach={isCoach}
        onClose={() => setDetailEvent(null)}
        onEdit={(evt) => {
          setDetailEvent(null)
          setEditEvent(evt)
          setAddSheetOpen(true)
        }}
        onCancelled={() => {
          setDetailEvent(null)
        }}
      />

      {/* ── Add/edit event sheet ── */}
      {isCoach && (
        <AddEventSheet
          isOpen={addSheetOpen}
          teamId={activeRole?.teamId ?? ''}
          existingEvent={editEvent}
          onClose={() => {
            setAddSheetOpen(false)
            setEditEvent(null)
          }}
          onSaved={() => {
            setAddSheetOpen(false)
            setEditEvent(null)
          }}
        />
      )}
    </div>
  )
}
