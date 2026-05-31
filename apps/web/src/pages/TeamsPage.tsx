// E3-S2: Multi-team dashboard
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../store/auth.store.js'
import { teamApi } from '../api/team.api.js'
import type { TeamResponse } from '@diamondhub/contracts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sportEmoji(sport: string): string {
  return sport === 'SOFTBALL' ? '🥎' : '⚾'
}

function formatNextEvent(nextEvent: unknown): string | null {
  if (!nextEvent || typeof nextEvent !== 'object') return null
  const ev = nextEvent as Record<string, unknown>
  if (!ev.name || !ev.startDate) return null
  const date = new Date(ev.startDate as string)
  return `${ev.name as string} · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TeamCardSkeleton() {
  return (
    <div
      className="bg-gray-900 rounded-2xl p-4 border border-gray-800 animate-pulse"
      aria-hidden="true"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <div className="h-5 w-36 bg-gray-700 rounded" />
          <div className="h-4 w-20 bg-gray-800 rounded" />
        </div>
        <div className="h-8 w-8 bg-gray-700 rounded-lg" />
      </div>
      <div className="flex gap-3">
        <div className="h-4 w-20 bg-gray-800 rounded" />
        <div className="h-4 w-24 bg-gray-800 rounded" />
      </div>
    </div>
  )
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ team, onPress }: { team: TeamResponse; onPress: () => void }) {
  const nextEventLabel = formatNextEvent(team.nextEvent)

  return (
    <button
      onClick={onPress}
      className="w-full text-left bg-gray-900 rounded-2xl p-4 border border-gray-800 hover:border-gray-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[44px]"
      aria-label={`${team.name}, ${team.ageDivision} ${team.sport.toLowerCase()}, navigate to team`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Name + sport emoji */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg leading-none" aria-hidden="true">
              {sportEmoji(team.sport)}
            </span>
            <h3 className="text-white font-bold text-base truncate">{team.name}</h3>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center h-6 px-2.5 bg-blue-900/40 border border-blue-800/50 text-blue-300 text-xs font-semibold rounded-full">
              {team.ageDivision}
            </span>
            <span className="text-gray-500 text-xs">{team.seasonYear}</span>
          </div>
        </div>

        {/* Chevron */}
        <span className="text-gray-600 mt-1 flex-shrink-0" aria-hidden="true">
          ›
        </span>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span>
          <span className="text-gray-300 font-medium">{team.memberCount}</span> members
        </span>

        {team.pendingRsvpCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            <span className="text-amber-300 font-medium">{team.pendingRsvpCount}</span> RSVPs pending
          </span>
        )}
      </div>

      {/* Next event */}
      {nextEventLabel && (
        <div className="mt-2 text-xs text-gray-500">
          <span aria-hidden="true">📅 </span>
          {nextEventLabel}
        </div>
      )}
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isCoach, onCreateTeam }: { isCoach: boolean; onCreateTeam: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">
        ⚾
      </div>
      <h3 className="text-white font-bold text-lg mb-2">No teams yet</h3>
      {isCoach ? (
        <>
          <p className="text-gray-400 text-sm mb-6">
            Create your first team to start managing your roster, schedule events, and communicate
            with players and parents.
          </p>
          <button
            onClick={onCreateTeam}
            className="h-12 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 active:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Create Your First Team
          </button>
        </>
      ) : (
        <p className="text-gray-400 text-sm">
          Ask your coach to send you an invite link to join a team.
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TeamsPage() {
  const navigate = useNavigate()
  const activeRole = useAuthStore((s) => s.activeRole)
  const isCoach =
    activeRole?.role === 'COACH' ||
    activeRole?.role === ('HEAD_COACH' as string) ||
    activeRole?.role === ('ASSISTANT_COACH' as string)

  const { data: teams, isLoading, isError, refetch } = useQuery({
    queryKey: ['teams'],
    queryFn: teamApi.getMyTeams,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  return (
    <div className="flex flex-col min-h-full bg-gray-950 relative">
      {/* Header */}
      <div className="sticky top-14 z-30 bg-gray-950 border-b border-gray-800 px-4 pt-safe-top pt-4 pb-3">
        <h1 className="text-xl font-bold text-white">My Teams</h1>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-3" aria-label="Loading teams" role="status">
            <TeamCardSkeleton />
            <TeamCardSkeleton />
            <TeamCardSkeleton />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-2xl bg-red-900/20 border border-red-800 p-4 text-center">
            <p className="text-red-400 text-sm mb-3">Failed to load teams.</p>
            <button
              onClick={() => void refetch()}
              className="text-red-300 underline text-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* Teams list */}
        {!isLoading && !isError && teams && (
          <>
            {teams.length > 0 ? (
              <div className="space-y-3">
                {teams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    onPress={() => navigate(`/teams/${team.id}`)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState isCoach={isCoach} onCreateTeam={() => navigate('/teams/create')} />
            )}
          </>
        )}
      </div>

      {/* FAB — coach only */}
      {isCoach && (
        <button
          onClick={() => navigate('/teams/create')}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-900/40 flex items-center justify-center text-2xl hover:bg-blue-500 active:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          aria-label="Create team"
        >
          +
        </button>
      )}
    </div>
  )
}
