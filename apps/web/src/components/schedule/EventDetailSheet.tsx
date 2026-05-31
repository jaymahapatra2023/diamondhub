// E4: EventDetailSheet — bottom sheet showing full event detail with RSVP, directions, ICS export
import { useState } from 'react'
import { parseISO, format } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ScheduleEventResponse } from '@diamondhub/contracts'
import { scheduleApi } from '../../api/schedule.api.js'
import { RsvpButton } from '../team/RsvpButton.js'
import { Button } from '../ui/Button.js'

// ── Event type labels & badge colors ─────────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  TOURNAMENT: { label: 'Tournament', className: 'bg-blue-900/50 text-blue-300 border-blue-800/50' },
  GAME:       { label: 'Game',       className: 'bg-red-900/50 text-red-300 border-red-800/50' },
  PRACTICE:   { label: 'Practice',   className: 'bg-green-900/50 text-green-300 border-green-800/50' },
  MEETING:    { label: 'Meeting',    className: 'bg-gray-800 text-gray-300 border-gray-700' },
  OTHER:      { label: 'Other',      className: 'bg-gray-800 text-gray-300 border-gray-700' },
}

// ── Directions URL ─────────────────────────────────────────────────────────────

function getDirectionsUrl(address: string): string {
  const encoded = encodeURIComponent(address)
  // Detect iOS via platform or userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.platform) ||
    (/Macintosh/i.test(navigator.userAgent) && 'ontouchend' in document)
  return isIOS ? `maps:?q=${encoded}` : `https://maps.google.com/?q=${encoded}`
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmDialogProps) {
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm mx-4 mb-8 sm:mb-0 bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl">
        <h3 id="confirm-dialog-title" className="text-lg font-bold text-white mb-2">
          {title}
        </h3>
        <p className="text-gray-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={!!isLoading}>
            Keep event
          </Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm} isLoading={!!isLoading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── EventDetailSheet ──────────────────────────────────────────────────────────

export interface EventDetailSheetProps {
  event: ScheduleEventResponse | null
  isOpen: boolean
  isCoach: boolean
  onClose: () => void
  onEdit?: (event: ScheduleEventResponse) => void
  onCancelled?: (eventId: string) => void
}

export function EventDetailSheet({
  event,
  isOpen,
  isCoach,
  onClose,
  onEdit,
  onCancelled,
}: EventDetailSheetProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const queryClient = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!event) throw new Error('No event')
      return scheduleApi.cancelEvent(event.teamId, event.id)
    },
    onSuccess: () => {
      setConfirmOpen(false)
      if (event) {
        void queryClient.invalidateQueries({ queryKey: ['schedule'] })
        onCancelled?.(event.id)
      }
      onClose()
    },
  })

  if (!isOpen || !event) return null

  const badge = TYPE_BADGE[event.type] ?? TYPE_BADGE.OTHER!
  const start = parseISO(event.startTime)
  const end = parseISO(event.endTime)
  const dateLabel = format(start, 'EEEE, MMMM d, yyyy')
  const timeLabel = `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`
  const directionAddress = event.locationAddress ?? event.locationName ?? ''

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto bg-gray-900 border-t border-gray-700 rounded-t-2xl shadow-2xl pb-safe"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" aria-hidden="true" />
        </div>

        <div className="px-4 pt-2 pb-8 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {event.isCancelled && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-red-400 font-semibold uppercase tracking-wide">
                    ⊘ Cancelled
                  </span>
                </div>
              )}
              <h2
                className={[
                  'text-xl font-bold text-white leading-tight',
                  event.isCancelled && 'line-through text-gray-400',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {event.title}
              </h2>
              <span
                className={`inline-flex mt-2 h-5 px-2 text-xs font-semibold border rounded-full items-center ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          {/* Date & time */}
          <div className="flex items-start gap-3">
            <span className="text-gray-500 mt-0.5 text-lg" aria-hidden="true">🗓</span>
            <div>
              <p className="text-white font-medium">{dateLabel}</p>
              <p className="text-gray-400 text-sm">{timeLabel}</p>
            </div>
          </div>

          {/* Location */}
          {(event.locationName ?? event.locationAddress) && (
            <div className="flex items-start gap-3">
              <span className="text-gray-500 mt-0.5 text-lg" aria-hidden="true">📍</span>
              <div className="flex-1 min-w-0">
                {event.locationName && (
                  <p className="text-white font-medium truncate">{event.locationName}</p>
                )}
                {event.locationAddress && (
                  <p className="text-gray-400 text-sm truncate">{event.locationAddress}</p>
                )}
                {directionAddress && (
                  <a
                    href={getDirectionsUrl(directionAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-blue-400 text-sm font-medium hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    Get Directions
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {event.notes && (
            <div className="flex items-start gap-3">
              <span className="text-gray-500 mt-0.5 text-lg" aria-hidden="true">📝</span>
              <p className="text-gray-300 text-sm whitespace-pre-wrap flex-1">{event.notes}</p>
            </div>
          )}

          {/* RSVP */}
          {!event.isCancelled && (
            <div className="border-t border-gray-800 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Your RSVP
              </p>
              <RsvpButton
                teamId={event.teamId}
                eventId={event.id}
                currentStatus={event.userRsvp ?? null}
                inline
                coachView={isCoach}
                {...(event.rsvpCounts ? { counts: event.rsvpCounts } : {})}
              />
            </div>
          )}

          {/* Export to Calendar */}
          <div className="border-t border-gray-800 pt-4">
            <a
              href={scheduleApi.exportIcs(event.teamId)}
              download
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <span aria-hidden="true">📥</span>
              Export team schedule to Calendar (.ics)
            </a>
          </div>

          {/* Coach actions */}
          {isCoach && !event.isCancelled && (
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => onEdit?.(event)}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmOpen(true)}
              >
                Cancel Event
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Cancel confirm dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Cancel this event?"
        message="This will notify all team members that the event is cancelled. This action cannot be undone."
        confirmLabel="Yes, cancel it"
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
        isLoading={cancelMutation.isPending}
      />
    </>
  )
}
