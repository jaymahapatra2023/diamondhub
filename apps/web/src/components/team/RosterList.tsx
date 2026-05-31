// E3: Roster display — coach gets edit controls, parents/players read-only
import { useState } from 'react'
import type { PlayerResponse } from '@diamondhub/contracts'

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  return (
    <div
      className="h-10 w-10 rounded-full bg-blue-800 flex items-center justify-center text-sm font-bold text-blue-100 flex-shrink-0"
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

// ── Position pills ─────────────────────────────────────────────────────────────

function PositionPill({ pos }: { pos: string }) {
  return (
    <span className="inline-flex h-5 px-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-[10px] font-semibold rounded uppercase tracking-wide">
      {pos}
    </span>
  )
}

// ── Confirm archive modal ──────────────────────────────────────────────────────

function ArchiveConfirmDialog({
  player,
  onConfirm,
  onCancel,
}: {
  player: PlayerResponse
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-safe"
      role="dialog"
      aria-modal="true"
      aria-label={`Archive ${player.firstName} ${player.lastName}`}
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-2">Archive player?</h2>
        <p className="text-gray-400 text-sm mb-6">
          {player.firstName} {player.lastName} will be removed from the active roster. This can be
          undone by a coach.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-12 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-12 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            aria-label={`Confirm archive ${player.firstName} ${player.lastName}`}
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Kebab menu ─────────────────────────────────────────────────────────────────

function KebabMenu({
  player,
  onArchive,
  onViewEmergencyContact,
}: {
  player: PlayerResponse
  onArchive: () => void
  onViewEmergencyContact: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`Actions for ${player.firstName} ${player.lastName}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ⋮
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-20"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-11 z-30 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden"
            role="menu"
            aria-label={`Player actions`}
          >
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onViewEmergencyContact()
              }}
              className="w-full text-left px-4 py-3 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
            >
              Emergency Contact
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onArchive()
              }}
              className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-800 transition-colors border-t border-gray-800"
            >
              Archive Player
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Emergency contact modal ────────────────────────────────────────────────────

function EmergencyContactModal({
  player,
  teamId,
  onClose,
  onFetchContact,
}: {
  player: PlayerResponse
  teamId: string
  onClose: () => void
  onFetchContact: (teamId: string, memberId: string) => Promise<unknown>
}) {
  const [contact, setContact] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useState(() => {
    let cancelled = false
    onFetchContact(teamId, player.id)
      .then((c) => {
        if (!cancelled) setContact(c as Record<string, unknown>)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load emergency contact.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-safe"
      role="dialog"
      aria-modal="true"
      aria-label="Emergency contact"
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">Emergency Contact</h2>
          <button
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-white rounded-xl"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          {player.firstName} {player.lastName}
        </p>
        {loading && <p className="text-gray-500 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {contact && !loading && (
          <dl className="space-y-3">
            {([
              ['Name', contact.contactName],
              ['Relationship', contact.relationship],
              ['Phone (primary)', contact.phone1],
              ['Phone (secondary)', contact.phone2],
            ] as [string, string | undefined][]).map(
              ([label, value]) =>
                value && (
                  <div key={label}>
                    <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
                    <dd className="text-white text-sm font-medium">{value}</dd>
                  </div>
                ),
            )}
          </dl>
        )}
        {contact && !contact.contactName && !loading && (
          <p className="text-gray-500 text-sm">No emergency contact on file.</p>
        )}
      </div>
    </div>
  )
}

// ── Player row ─────────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  isCoach,
  teamId,
  onArchive,
  onFetchContact,
}: {
  player: PlayerResponse
  isCoach: boolean
  teamId: string
  onArchive: (player: PlayerResponse) => void
  onFetchContact: (teamId: string, memberId: string) => Promise<unknown>
}) {
  const [showEmergency, setShowEmergency] = useState(false)

  return (
    <>
      <div className="flex items-center gap-3 py-3 px-4 border-b border-gray-800 last:border-0">
        <Avatar firstName={player.firstName} lastName={player.lastName} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">
              {player.firstName} {player.lastName}
            </span>
            {player.jerseyNumber !== null && (
              <span className="text-gray-500 text-xs font-mono">#{player.jerseyNumber}</span>
            )}
          </div>
          {player.positions.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {player.positions.map((pos) => (
                <PositionPill key={pos} pos={pos} />
              ))}
            </div>
          )}
        </div>

        {/* Status badge */}
        {player.status === 'INACTIVE' && (
          <span className="text-xs text-amber-400 font-medium">Inactive</span>
        )}

        {/* Emergency contact indicator */}
        {player.hasEmergencyContact && (
          <span
            className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0"
            title="Has emergency contact"
            aria-label="Emergency contact on file"
          />
        )}

        {isCoach && (
          <KebabMenu
            player={player}
            onArchive={() => onArchive(player)}
            onViewEmergencyContact={() => setShowEmergency(true)}
          />
        )}
      </div>

      {showEmergency && (
        <EmergencyContactModal
          player={player}
          teamId={teamId}
          onClose={() => setShowEmergency(false)}
          onFetchContact={onFetchContact}
        />
      )}
    </>
  )
}

// ── Add player form ────────────────────────────────────────────────────────────

function AddPlayerForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (data: {
    firstName: string
    lastName: string
    jerseyNumber: number | undefined
    positions: string[]
  }) => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [jersey, setJersey] = useState('')
  const [posInput, setPosInput] = useState('')

  const positions = posInput
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) return
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      jerseyNumber: jersey !== '' ? parseInt(jersey, 10) : undefined,
      positions,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-safe"
      role="dialog"
      aria-modal="true"
      aria-label="Add player"
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">Add Player</h2>
          <button
            onClick={onCancel}
            className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-white rounded-xl"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5" htmlFor="add-first-name">
                First name <span className="text-red-400">*</span>
              </label>
              <input
                id="add-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder="Alex"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5" htmlFor="add-last-name">
                Last name <span className="text-red-400">*</span>
              </label>
              <input
                id="add-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder="Smith"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5" htmlFor="add-jersey">
              Jersey #
            </label>
            <input
              id="add-jersey"
              type="number"
              min="0"
              max="99"
              value={jersey}
              onChange={(e) => setJersey(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              placeholder="e.g. 14"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5" htmlFor="add-positions">
              Positions (comma-separated)
            </label>
            <input
              id="add-positions"
              value={posInput}
              onChange={(e) => setPosInput(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              placeholder="e.g. SS, 2B, P"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-12 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !firstName.trim() || !lastName.trim()}
              className="flex-1 h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Adding…' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface RosterListProps {
  players: PlayerResponse[]
  teamId: string
  isCoach: boolean
  isLoading?: boolean
  onAddPlayer: (data: {
    firstName: string
    lastName: string
    jerseyNumber: number | undefined
    positions: string[]
  }) => Promise<void>
  onArchivePlayer: (memberId: string) => Promise<void>
  onFetchEmergencyContact: (teamId: string, memberId: string) => Promise<unknown>
}

export function RosterList({
  players,
  teamId,
  isCoach,
  isLoading,
  onAddPlayer,
  onArchivePlayer,
  onFetchEmergencyContact,
}: RosterListProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [playerToArchive, setPlayerToArchive] = useState<PlayerResponse | null>(null)

  const activePlayers = players.filter((p) => p.status !== 'ARCHIVED')

  const handleAdd = async (data: {
    firstName: string
    lastName: string
    jerseyNumber: number | undefined
    positions: string[]
  }) => {
    setIsSubmitting(true)
    try {
      await onAddPlayer(data)
      setShowAddForm(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmArchive = async () => {
    if (!playerToArchive) return
    await onArchivePlayer(playerToArchive.id)
    setPlayerToArchive(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-0 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 bg-gray-700 rounded" />
              <div className="h-3 w-16 bg-gray-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {activePlayers.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <p className="text-gray-500 text-sm">No players on roster yet.</p>
            {isCoach && (
              <p className="text-gray-600 text-xs mt-1">Add a player below or send an invite.</p>
            )}
          </div>
        ) : (
          activePlayers.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              isCoach={isCoach}
              teamId={teamId}
              onArchive={setPlayerToArchive}
              onFetchContact={onFetchEmergencyContact}
            />
          ))
        )}
      </div>

      {/* Add Player button — coach only */}
      {isCoach && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full mt-3 h-12 border-2 border-dashed border-gray-700 text-gray-400 rounded-2xl text-sm font-semibold hover:border-blue-600 hover:text-blue-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Add player"
        >
          + Add Player
        </button>
      )}

      {/* Add player form modal */}
      {showAddForm && (
        <AddPlayerForm
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Archive confirmation */}
      {playerToArchive && (
        <ArchiveConfirmDialog
          player={playerToArchive}
          onConfirm={() => void handleConfirmArchive()}
          onCancel={() => setPlayerToArchive(null)}
        />
      )}
    </>
  )
}
