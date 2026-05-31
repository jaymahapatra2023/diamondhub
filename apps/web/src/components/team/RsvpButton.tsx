// E3: RSVP button — optimistic update, three states, coach summary view
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { teamApi } from '../../api/team.api.js'
import { apiClient } from '../../api/client.js'
import type { RsvpCounts } from '@diamondhub/contracts'

async function checkRsvpConflict(eventId: string): Promise<{ hasConflict: boolean; conflictingEvents: any[] }> {
  try {
    const res = await apiClient.get(`/conflicts/check-rsvp?eventId=${eventId}`)
    return res.data
  } catch {
    return { hasConflict: false, conflictingEvents: [] }
  }
}

type RsvpStatus = 'YES' | 'NO' | 'MAYBE' | null

interface RsvpConfig {
  label: string
  activeClass: string
  idleClass: string
  emoji: string
}

const RSVP_CONFIG: Record<'YES' | 'NO' | 'MAYBE', RsvpConfig> = {
  YES: {
    label: 'Going',
    emoji: '✓',
    activeClass: 'bg-green-600 border-green-500 text-white',
    idleClass: 'bg-gray-800 border-gray-700 text-gray-300 hover:border-green-700',
  },
  MAYBE: {
    label: 'Maybe',
    emoji: '?',
    activeClass: 'bg-amber-600 border-amber-500 text-white',
    idleClass: 'bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-700',
  },
  NO: {
    label: "Can't go",
    emoji: '✕',
    activeClass: 'bg-red-700 border-red-600 text-white',
    idleClass: 'bg-gray-800 border-gray-700 text-gray-300 hover:border-red-700',
  },
}

export interface RsvpButtonProps {
  teamId: string
  eventId: string
  currentStatus: RsvpStatus
  playerId?: string
  /** When true, renders a compact 3-button row; when false, single toggle button */
  inline?: boolean
  /** Coach view: show YES/NO/MAYBE counts below the buttons */
  coachView?: boolean
  counts?: RsvpCounts
  onStatusChange?: (newStatus: RsvpStatus) => void
}

export function RsvpButton({
  teamId,
  eventId,
  currentStatus,
  playerId,
  inline = false,
  coachView = false,
  counts,
  onStatusChange,
}: RsvpButtonProps) {
  const queryClient = useQueryClient()
  const [optimisticStatus, setOptimisticStatus] = useState<RsvpStatus>(currentStatus)
  const [conflictWarning, setConflictWarning] = useState<any[]>([])

  const mutation = useMutation({
    mutationFn: (newStatus: 'YES' | 'NO' | 'MAYBE') =>
      teamApi.setRsvp(teamId, eventId, { status: newStatus, playerId }),
    onMutate: (newStatus) => {
      setOptimisticStatus(newStatus)
      onStatusChange?.(newStatus)
    },
    onError: () => {
      // Revert optimistic update
      setOptimisticStatus(currentStatus)
      onStatusChange?.(currentStatus)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['rsvps', teamId, eventId] })
    },
  })

  const handleRsvp = async (newStatus: 'YES' | 'NO' | 'MAYBE') => {
    if (newStatus === 'YES') {
      const { hasConflict, conflictingEvents } = await checkRsvpConflict(eventId)
      if (hasConflict && conflictingEvents.length > 0) {
        setConflictWarning(conflictingEvents)
        return
      }
    }
    mutation.mutate(newStatus)
  }

  const handleSelect = (status: 'YES' | 'NO' | 'MAYBE') => {
    if (mutation.isPending) return
    // Tapping same status de-selects (no response)
    if (optimisticStatus === status) {
      return
    }
    void handleRsvp(status)
  }

  if (inline) {
    // Three-button inline row
    return (
      <div className="space-y-2">
        {conflictWarning.length > 0 && (
          <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <p className="text-amber-400 text-sm font-medium mb-1">⚠ Scheduling conflict</p>
            {conflictWarning.map((e: any) => (
              <p key={e.id} className="text-gray-400 text-xs">
                {e.title} · {new Date(e.startTime).toLocaleDateString()}
              </p>
            ))}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setConflictWarning([]); mutation.mutate('YES') }}
                className="h-9 px-4 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-500 min-h-[36px]"
              >
                RSVP Yes Anyway
              </button>
              <button
                onClick={() => setConflictWarning([])}
                className="h-9 px-4 bg-gray-700 text-gray-300 rounded-lg text-xs hover:bg-gray-600 min-h-[36px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2" role="group" aria-label="RSVP for event">
          {(['YES', 'MAYBE', 'NO'] as const).map((status) => {
            const cfg = RSVP_CONFIG[status]
            const isActive = optimisticStatus === status
            return (
              <button
                key={status}
                onClick={() => handleSelect(status)}
                disabled={mutation.isPending}
                aria-pressed={isActive}
                aria-label={cfg.label}
                className={`flex-1 h-11 rounded-xl text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 ${
                  isActive ? cfg.activeClass : cfg.idleClass
                }`}
              >
                <span aria-hidden="true">{cfg.emoji}</span>{' '}
                <span className="sr-only sm:not-sr-only">{cfg.label}</span>
              </button>
            )
          })}
        </div>

        {/* Coach summary counts */}
        {coachView && counts && (
          <div className="flex gap-3 text-xs text-gray-400 px-1">
            <span>
              <span className="text-green-400 font-semibold">{counts.yes}</span> yes
            </span>
            <span>
              <span className="text-red-400 font-semibold">{counts.no}</span> no
            </span>
            <span>
              <span className="text-amber-400 font-semibold">{counts.maybe}</span> maybe
            </span>
            <span>
              <span className="text-gray-500 font-semibold">{counts.noResponse}</span> no response
            </span>
          </div>
        )}
      </div>
    )
  }

  // Compact single button — cycles on tap
  const cycleOrder: ('YES' | 'MAYBE' | 'NO')[] = ['YES', 'MAYBE', 'NO']
  const handleCycle = () => {
    if (mutation.isPending) return
    const currentIdx = optimisticStatus
      ? cycleOrder.indexOf(optimisticStatus as 'YES' | 'MAYBE' | 'NO')
      : -1
    const nextStatus = cycleOrder[(currentIdx + 1) % cycleOrder.length]!
    void handleRsvp(nextStatus)
  }

  const cfg = optimisticStatus ? RSVP_CONFIG[optimisticStatus] : null
  const activeClass = cfg?.activeClass ?? 'bg-gray-800 border-gray-700 text-gray-400'

  return (
    <button
      onClick={handleCycle}
      disabled={mutation.isPending}
      aria-label={`RSVP: ${optimisticStatus ? RSVP_CONFIG[optimisticStatus].label : 'Tap to RSVP'}`}
      className={`h-11 min-w-[100px] px-4 rounded-xl text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 ${activeClass}`}
    >
      {cfg ? `${cfg.emoji} ${cfg.label}` : 'RSVP'}
    </button>
  )
}
