// E4: EventCard — color-coded left border, RSVP status, cancellation state
import { parseISO, format } from 'date-fns'
import type { ScheduleEventResponse } from '@diamondhub/contracts'

// ── Color mapping ──────────────────────────────────────────────────────────────

const EVENT_BORDER_COLORS: Record<string, string> = {
  TOURNAMENT: 'border-l-blue-500',
  GAME: 'border-l-red-500',
  PRACTICE: 'border-l-green-500',
  MEETING: 'border-l-gray-400',
  OTHER: 'border-l-gray-400',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  TOURNAMENT: 'Tournament',
  GAME: 'Game',
  PRACTICE: 'Practice',
  MEETING: 'Meeting',
  OTHER: 'Other',
}

const RSVP_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  YES: { icon: '✓', color: 'text-green-400', label: 'Going' },
  NO: { icon: '✕', color: 'text-red-400', label: "Can't go" },
  MAYBE: { icon: '?', color: 'text-amber-400', label: 'Maybe' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface EventCardProps {
  event: ScheduleEventResponse
  onClick?: (event: ScheduleEventResponse) => void
}

export function EventCard({ event, onClick }: EventCardProps) {
  const borderColor = event.isCancelled
    ? 'border-l-gray-700'
    : (EVENT_BORDER_COLORS[event.type] ?? 'border-l-gray-400')

  const startTime = parseISO(event.startTime)
  const endTime = parseISO(event.endTime)
  const timeRange = `${format(startTime, 'h:mm a')} – ${format(endTime, 'h:mm a')}`

  const rsvp = event.userRsvp ? RSVP_ICONS[event.userRsvp] : null

  return (
    <button
      onClick={() => onClick?.(event)}
      className={[
        'w-full text-left rounded-xl bg-gray-800/80 border',
        'border-l-4 pl-3 pr-3 py-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        'active:bg-gray-700/80 transition-colors',
        borderColor,
        (event as any).hasConflict ? 'border-red-500/30' : 'border-gray-700/60',
        event.isCancelled && 'opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${event.title}${event.isCancelled ? ', cancelled' : ''}, ${timeRange}`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Left: content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 min-w-0">
            <p
              className={[
                'text-sm font-semibold text-white truncate',
                event.isCancelled && 'line-through text-gray-400',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {event.title}
            </p>
            {(event as any).hasConflict && (
              <span className="ml-1 text-red-400 text-xs" title="Scheduling conflict detected">⚠</span>
            )}
            {event.isCancelled && (
              <span className="inline-flex items-center gap-0.5 text-xs text-gray-500 font-medium flex-shrink-0">
                <span aria-hidden="true">⊘</span>
                <span>Cancelled</span>
              </span>
            )}
          </div>

          {/* Time */}
          <p className="text-xs text-gray-400 mt-0.5">{timeRange}</p>

          {/* Location */}
          {event.locationName && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{event.locationName}</p>
          )}
        </div>

        {/* Right: type label + RSVP */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {EVENT_TYPE_LABELS[event.type] ?? event.type}
          </span>
          {rsvp && !event.isCancelled && (
            <span
              className={`text-xs font-semibold ${rsvp.color}`}
              aria-label={`RSVP: ${rsvp.label}`}
            >
              <span aria-hidden="true">{rsvp.icon}</span>{' '}
              <span className="sr-only">{rsvp.label}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
