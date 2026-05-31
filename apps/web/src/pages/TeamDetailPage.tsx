// E3: Single team view — Roster / Schedule / Invites tabs
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store.js'
import { teamApi } from '../api/team.api.js'
import { RosterList } from '../components/team/RosterList.js'
import { InviteSheet } from '../components/team/InviteSheet.js'
import type { InviteRequest, PlayerResponse } from '@diamondhub/contracts'

type Tab = 'roster' | 'schedule' | 'invites'

// ── Pending invites list ───────────────────────────────────────────────────────

function PendingInviteRow({
  invite,
  onRevoke,
}: {
  invite: Record<string, unknown>
  onRevoke: () => void
}) {
  const expires = invite.expiresAt
    ? new Date(invite.expiresAt as string).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null

  const roleLabel: Record<string, string> = {
    PLAYER: 'Player',
    PARENT: 'Parent',
    ASSISTANT_COACH: 'Asst. Coach',
  }

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium">
            {(invite.email as string | undefined) ?? 'Link invite'}
          </span>
          <span className="inline-flex h-5 px-2 bg-blue-900/40 border border-blue-800/50 text-blue-300 text-xs font-semibold rounded-full">
            {roleLabel[invite.role as string] ?? (invite.role as string)}
          </span>
        </div>
        {expires && <p className="text-gray-500 text-xs mt-0.5">Expires {expires}</p>}
      </div>
      <button
        onClick={onRevoke}
        className="h-9 px-3 rounded-xl text-xs font-semibold text-red-400 border border-red-900/50 hover:bg-red-900/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        Revoke
      </button>
    </div>
  )
}

// ── Invites tab content ────────────────────────────────────────────────────────

function InvitesTab({
  teamId,
  onOpenSheet,
}: {
  teamId: string
  onOpenSheet: () => void
}) {
  const queryClient = useQueryClient()

  const { data: invites, isLoading } = useQuery({
    queryKey: ['invites', teamId],
    queryFn: () => teamApi.getPendingInvites(teamId),
  })

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => teamApi.revokeInvite(teamId, inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invites', teamId] })
    },
  })

  return (
    <div className="space-y-4">
      <button
        onClick={onOpenSheet}
        className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        + Invite Player / Parent
      </button>

      {isLoading ? (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 animate-pulse space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 bg-gray-800 rounded-xl" />
          ))}
        </div>
      ) : invites && invites.length > 0 ? (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          {invites.map((invite) => (
            <PendingInviteRow
              key={invite.id as string}
              invite={invite as Record<string, unknown>}
              onRevoke={() =>
                revokeMutation.mutate(invite.id as string)
              }
            />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 py-10 text-center">
          <p className="text-gray-500 text-sm">No pending invites</p>
        </div>
      )}
    </div>
  )
}

// ── Schedule placeholder ──────────────────────────────────────────────────────

function ScheduleTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">
        📅
      </div>
      <h3 className="text-white font-bold text-lg mb-2">Schedule coming soon</h3>
      <p className="text-gray-400 text-sm">
        Event scheduling (E4) will appear here. Stay tuned!
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const activeRole = useAuthStore((s) => s.activeRole)
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<Tab>('roster')
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false)

  const isCoach =
    activeRole?.role === 'COACH' ||
    activeRole?.role === ('HEAD_COACH' as string) ||
    activeRole?.role === ('ASSISTANT_COACH' as string)

  const canManageInvites = isCoach

  // Team data
  const { data: team, isLoading: teamLoading, isError: teamError } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => teamApi.getTeam(teamId!),
    enabled: !!teamId,
  })

  // Roster data
  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ['roster', teamId],
    queryFn: () => teamApi.getRoster(teamId!),
    enabled: !!teamId && activeTab === 'roster',
  })

  // Mutations
  const addPlayerMutation = useMutation({
    mutationFn: (data: Parameters<typeof teamApi.addPlayer>[1]) =>
      teamApi.addPlayer(teamId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', teamId] })
      void queryClient.invalidateQueries({ queryKey: ['team', teamId] })
    },
  })

  const archivePlayerMutation = useMutation({
    mutationFn: (memberId: string) => teamApi.archivePlayer(teamId!, memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', teamId] })
      void queryClient.invalidateQueries({ queryKey: ['team', teamId] })
    },
  })

  const createInviteMutation = useMutation({
    mutationFn: (data: InviteRequest) => teamApi.createInvite(teamId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invites', teamId] })
    },
  })

  if (teamLoading) {
    return (
      <div className="flex flex-col min-h-full bg-gray-950">
        <div className="sticky top-14 z-30 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3 flex items-center gap-3">
          <div className="h-8 w-8 bg-gray-800 rounded-lg animate-pulse" />
          <div className="h-5 w-36 bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="px-4 py-4 space-y-4">
          <div className="h-10 bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-24 bg-gray-900 rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (teamError || !team) {
    return (
      <div className="flex flex-col min-h-full bg-gray-950 items-center justify-center px-6">
        <p className="text-red-400 text-sm mb-4">Could not load team.</p>
        <button
          onClick={() => navigate('/teams')}
          className="h-11 px-5 bg-gray-800 text-white font-semibold rounded-xl"
        >
          Back to Teams
        </button>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; hidden?: boolean }[] = [
    { key: 'roster', label: 'Roster' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'invites', label: 'Invites', hidden: !canManageInvites },
  ]

  return (
    <>
      <div className="flex flex-col min-h-full bg-gray-950">
        {/* Header */}
        <div className="sticky top-14 z-30 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-0">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate('/teams')}
              className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-white rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Back to teams"
            >
              ‹
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-white truncate">{team.name}</h1>
              <p className="text-xs text-gray-500">
                {team.ageDivision} · {team.sport === 'SOFTBALL' ? 'Softball' : 'Baseball'} ·{' '}
                {team.seasonYear}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex" role="tablist" aria-label="Team sections">
            {tabs
              .filter((t) => !t.hidden)
              .map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    activeTab === tab.key
                      ? 'text-blue-400 border-blue-400'
                      : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 px-4 py-4" role="tabpanel">
          {activeTab === 'roster' && (
            <RosterList
              players={(roster as PlayerResponse[] | undefined) ?? []}
              teamId={teamId!}
              isCoach={isCoach}
              isLoading={rosterLoading}
              onAddPlayer={(data) => addPlayerMutation.mutateAsync(data)}
              onArchivePlayer={(memberId) => archivePlayerMutation.mutateAsync(memberId)}
              onFetchEmergencyContact={teamApi.getEmergencyContact}
            />
          )}

          {activeTab === 'schedule' && <ScheduleTab />}

          {activeTab === 'invites' && canManageInvites && (
            <InvitesTab teamId={teamId!} onOpenSheet={() => setInviteSheetOpen(true)} />
          )}
        </div>
      </div>

      {/* Invite sheet */}
      <InviteSheet
        open={inviteSheetOpen}
        teamId={teamId!}
        onClose={() => setInviteSheetOpen(false)}
        onCreateInvite={(_teamId, data) => createInviteMutation.mutateAsync(data)}
      />
    </>
  )
}
