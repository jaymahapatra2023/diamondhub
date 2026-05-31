// E15 · Organization / Club Admin Dashboard
// Stats, teams grid, members tab, cross-team player search

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { organizationApi } from '../api/organization.api.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgStats {
  teamCount: number
  memberCount: number
  registrationCount: number
  totalSpent: number
}

interface OrgTeam {
  team: {
    id: string
    name: string
    sport: string
    ageDivision: string
  }
}

interface OrgMember {
  userId: string
  role: string
  user: { id: string; name: string; email: string }
}

interface Organization {
  id: string
  name: string
  members: OrgMember[]
  teams: OrgTeam[]
}

interface PlayerResult {
  userId: string
  name: string
  teams: Array<{ teamId: string; teamName: string; ageDivision: string }>
  isDuplicate: boolean
  sameDivisionDuplicate: boolean
}

type Tab = 'overview' | 'teams' | 'members' | 'players'

// ── Stat Badge ────────────────────────────────────────────────────────────────

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ org, stats }: { org: Organization; stats: OrgStats }) {
  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatBadge label="Teams" value={stats.teamCount} />
        <StatBadge label="Active Members" value={stats.memberCount} />
        <StatBadge label="Registrations" value={stats.registrationCount} />
        <StatBadge
          label="Total Spent"
          value={`$${stats.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        />
      </div>
    </div>
  )
}

// ── Teams tab ─────────────────────────────────────────────────────────────────

function TeamsTab({ teams }: { teams: OrgTeam[] }) {
  if (teams.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl" aria-hidden="true">⚾</span>
        <p className="text-gray-400 text-sm mt-3">No teams linked to this organization yet.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {teams.map(({ team }) => (
        <div
          key={team.id}
          className="bg-gray-800 rounded-xl p-4 flex items-center justify-between border border-gray-700"
        >
          <div>
            <p className="font-semibold text-white">{team.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{team.ageDivision} · {team.sport}</p>
          </div>
          <span className="text-gray-500 text-xl" aria-hidden="true">›</span>
        </div>
      ))}
    </div>
  )
}

// ── Members tab ───────────────────────────────────────────────────────────────

function MembersTab({ members }: { members: OrgMember[] }) {
  const roleLabel: Record<string, string> = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    COACH: 'Coach',
  }

  return (
    <div className="space-y-2">
      {members.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">No members found.</p>
      )}
      {members.map((m) => (
        <div
          key={m.userId}
          className="bg-gray-800 rounded-xl p-4 flex items-center justify-between border border-gray-700"
        >
          <div>
            <p className="font-semibold text-white">{m.user.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.user.email}</p>
          </div>
          <span
            className={[
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              m.role === 'OWNER' && 'bg-yellow-500/20 text-yellow-400',
              m.role === 'ADMIN' && 'bg-blue-500/20 text-blue-400',
              m.role === 'COACH' && 'bg-green-500/20 text-green-400',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {roleLabel[m.role] ?? m.role}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Cross-team Player Search tab ──────────────────────────────────────────────

function PlayersTab({ orgId }: { orgId: string }) {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { data: players = [], isLoading, isError, refetch } = useQuery<PlayerResult[]>({
    queryKey: ['org-players', orgId, name, dob],
    queryFn: () =>
      organizationApi.getPlayers(orgId, {
        ...(name && { name }),
        ...(dob && { dateOfBirth: dob }),
      }),
    enabled: submitted,
    staleTime: 60 * 1000,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!submitted) setSubmitted(true)
    else refetch()
  }

  const duplicates = players.filter((p) => p.sameDivisionDuplicate)

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={handleSearch} className="space-y-3">
        <div>
          <label htmlFor="player-name" className="block text-xs font-semibold text-gray-400 mb-1">
            Player Name
          </label>
          <input
            id="player-name"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSubmitted(false) }}
            placeholder="Search by name…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="player-dob" className="block text-xs font-semibold text-gray-400 mb-1">
            Date of Birth
          </label>
          <input
            id="player-dob"
            type="date"
            value={dob}
            onChange={(e) => { setDob(e.target.value); setSubmitted(false) }}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={!name && !dob}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Search Players
        </button>
      </form>

      {/* Duplicate warning */}
      {submitted && duplicates.length > 0 && (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400"
        >
          <span className="font-semibold">Duplicate warning:</span>{' '}
          {duplicates.length} player{duplicates.length > 1 ? 's' : ''} found on multiple teams in the same division.
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-800" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400 text-sm">Failed to search players. Please try again.</p>
      )}

      {/* Results */}
      {submitted && !isLoading && !isError && players.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-6">No players found.</p>
      )}

      {!isLoading && players.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
            {players.length} result{players.length !== 1 ? 's' : ''}
          </p>
          {players.map((p) => (
            <div
              key={p.userId}
              className={[
                'bg-gray-800 rounded-xl p-4 border',
                p.sameDivisionDuplicate
                  ? 'border-red-500/50'
                  : p.isDuplicate
                  ? 'border-amber-500/50'
                  : 'border-gray-700',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-white">{p.name}</p>
                {p.sameDivisionDuplicate && (
                  <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded flex-shrink-0">
                    SAME DIV DUPE
                  </span>
                )}
                {!p.sameDivisionDuplicate && p.isDuplicate && (
                  <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded flex-shrink-0">
                    MULTI-TEAM
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.teams.map((t) => (
                  <span
                    key={t.teamId}
                    className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full"
                  >
                    {t.teamName} · {t.ageDivision}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Organization Page ─────────────────────────────────────────────────────────

export function OrganizationPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const {
    data: org,
    isLoading,
    isError,
    error,
  } = useQuery<Organization>({
    queryKey: ['my-org'],
    queryFn: () => organizationApi.getMyOrg(),
    retry: false,
  })

  const { data: stats } = useQuery<OrgStats>({
    queryKey: ['org-dashboard', org?.id],
    queryFn: () => organizationApi.getDashboard(org!.id),
    enabled: !!org?.id,
    staleTime: 2 * 60 * 1000,
  })

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'teams', label: 'Teams' },
    { key: 'members', label: 'Members' },
    { key: 'players', label: 'Players' },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-gray-950 px-4 pt-6">
        <div className="h-8 w-48 rounded-xl bg-gray-800 animate-pulse mb-6" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !org) {
    const status = (error as any)?.response?.status
    if (status === 404) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-24 px-4 text-center">
          <span className="text-5xl mb-4" aria-hidden="true">🏢</span>
          <h1 className="text-xl font-bold text-white mb-2">No Organization Found</h1>
          <p className="text-gray-400 text-sm mb-6">
            You are not a member of any organization yet. Create one or ask your admin to add you.
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 px-4 text-center">
        <p className="text-red-400 text-sm">Failed to load organization. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-white">{org.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">Club Admin Dashboard</p>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 px-4 mt-4">
        <div
          role="tablist"
          aria-label="Organization sections"
          className="flex gap-1 bg-gray-800 p-1 rounded-xl"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={[
                'flex-1 py-2 rounded-lg text-xs font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                activeTab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-4 pb-24">
        {activeTab === 'overview' && stats && (
          <OverviewTab org={org} stats={stats} />
        )}
        {activeTab === 'overview' && !stats && (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}
        {activeTab === 'teams' && <TeamsTab teams={org.teams} />}
        {activeTab === 'members' && <MembersTab members={org.members} />}
        {activeTab === 'players' && <PlayersTab orgId={org.id} />}
      </div>
    </div>
  )
}
