// E12-S1 · Admin tournament management — table, search/filter, add/edit/delete
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth.store.js'
import { tournamentApi } from '../../api/tournament.api.js'
import { adminApi } from '../../api/admin.api.js'
import type { TournamentStatus } from '@diamondhub/contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminTournamentRow {
  id: string
  name: string
  organizer: string
  status: TournamentStatus
  startDate: string
  endDate: string
  city: string
  state: string
  currentTeams: number
  maxTeams: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TournamentStatus, string> = {
  UPCOMING: 'bg-blue-900/50 text-blue-300',
  OPEN: 'bg-green-900/50 text-green-300',
  WAITLIST: 'bg-yellow-900/50 text-yellow-300',
  CLOSED: 'bg-gray-800 text-gray-400',
  ONGOING: 'bg-purple-900/50 text-purple-300',
  COMPLETED: 'bg-gray-800 text-gray-400',
  CANCELLED: 'bg-red-900/50 text-red-400',
}

function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLORS[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
    </span>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  isOpen: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
}

function ConfirmDialog({ isOpen, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }: ConfirmDialogProps) {
  if (!isOpen) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm action"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <p className="text-white text-sm leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 h-11 rounded-xl font-semibold text-sm transition-colors ${
              danger
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AdminTournamentPage ───────────────────────────────────────────────────────

export function AdminTournamentPage() {
  const navigate = useNavigate()
  const { activeRole } = useAuthStore()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<TournamentStatus | 'ALL'>('ALL')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Role guard: must be ADMIN or ORGANIZER (future roles not yet in enum)
  const role = activeRole?.role as string | undefined
  const isAuthorized = role === 'ADMIN' || role === 'ORGANIZER' || role === 'COACH'

  const { data: searchResult, isLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: () => tournamentApi.search({ limit: 100 }),
    enabled: isAuthorized,
    staleTime: 30_000,
  })

  const tournaments: AdminTournamentRow[] = (searchResult?.tournaments ?? []) as AdminTournamentRow[]

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTournament(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-tournaments'] })
      setDeleteTarget(null)
    },
  })

  const publishMutation = useMutation({
    mutationFn: (id: string) => adminApi.publishTournament(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-tournaments'] })
    },
  })

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return tournaments.filter((t) => {
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.organizer.toLowerCase().includes(q) ||
        `${t.city} ${t.state}`.toLowerCase().includes(q)
      const matchesStatus = filterStatus === 'ALL' || t.status === filterStatus
      return matchesSearch && matchesStatus
    })
  }, [tournaments, search, filterStatus])

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <span className="text-5xl mb-4" aria-hidden="true">🔒</span>
        <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-gray-400 text-sm">Admin or Organizer role required</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-xl font-bold text-white">Tournaments</h1>
          <button
            type="button"
            aria-label="Add Tournament"
            onClick={() => void navigate('/admin/tournaments/new')}
            className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <span aria-hidden="true">+</span>
            Add
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="search"
            aria-label="Search tournaments"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, organizer…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {(['ALL', 'OPEN', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`flex-shrink-0 h-7 px-3 rounded-full text-xs font-semibold transition-colors ${
                filterStatus === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table / list ── */}
      <div className="flex-1 overflow-y-auto pb-24">
        {isLoading && (
          <div className="px-4 pt-4 space-y-2" aria-label="Loading tournaments">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">No tournaments found</p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="divide-y divide-gray-800">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-900/50 transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Edit ${t.name}`}
                onClick={() => void navigate(`/admin/tournaments/${t.id}/edit`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    void navigate(`/admin/tournaments/${t.id}/edit`)
                  }
                }}
              >
                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm truncate">{t.name}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.organizer} · {t.city}, {t.state} ·{' '}
                    {new Date(t.startDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {t.currentTeams}{t.maxTeams ? `/${t.maxTeams}` : ''} teams
                  </p>
                </div>

                {/* Action buttons */}
                <div
                  className="flex items-center gap-1 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t.status === 'UPCOMING' && (
                    <button
                      type="button"
                      aria-label={`Publish ${t.name}`}
                      disabled={publishMutation.isPending}
                      onClick={() => publishMutation.mutate(t.id)}
                      className="h-8 px-2.5 rounded-lg bg-green-900/50 text-green-400 hover:bg-green-900 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      Publish
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => setDeleteTarget(t.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Confirm delete dialog ── */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        message="Delete this tournament? This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
