import { Link } from 'react-router'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store.js'
import { useGeolocation } from '../hooks/useGeolocation.js'
import { tournamentApi } from '../api/tournament.api.js'
import type { Role } from '@diamondhub/contracts'

// ── Placeholder data shapes for future epics ─────────────────────────────────

interface TeamCard {
  id: string
  name: string
  division: string
  record: string
  nextGame: string | null
}

interface UpcomingGame {
  id: string
  date: string
  opponent: string
  location: string
  isHome: boolean
}

// ── This Weekend Near Me card ─────────────────────────────────────────────────

function ThisWeekendCard() {
  const { lat, lng, requestLocation } = useGeolocation()
  const { data, isLoading } = useQuery({
    queryKey: ['this-weekend', lat, lng],
    queryFn: () => lat && lng ? tournamentApi.getThisWeekend(lat, lng) : Promise.resolve(null),
    enabled: !!(lat && lng),
  })

  return (
    <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span aria-hidden>🗓</span>
        <span className="text-blue-400 text-sm font-semibold uppercase tracking-wide">This Weekend</span>
      </div>
      {isLoading ? (
        <div className="animate-pulse h-4 bg-gray-700 rounded w-3/4 mt-1" />
      ) : !lat && !lng ? (
        <div>
          <p className="text-white font-medium text-sm">Tournaments Near You</p>
          <button
            onClick={requestLocation}
            className="mt-2 text-blue-400 text-sm underline hover:text-blue-300 min-h-[44px] flex items-center"
          >
            Enable location to see tournaments
          </button>
        </div>
      ) : data?.tournaments.length === 0 ? (
        <p className="text-gray-400 text-sm">No tournaments this weekend within 50 miles.</p>
      ) : (
        <div>
          <p className="text-white font-medium">{data?.total ?? 0} tournament{(data?.total ?? 0) !== 1 ? 's' : ''} this weekend nearby</p>
          <Link to="/tournaments?thisWeekend=1" className="text-blue-400 text-sm mt-1 block hover:text-blue-300">
            View all →
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Role-aware sections ───────────────────────────────────────────────────────

function CoachHome() {
  // E3 stub — replace with real query when team epic lands
  const teams: TeamCard[] = []

  return (
    <div className="space-y-6">
      <ThisWeekendCard />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">My Teams</h2>
          <Link
            to="/teams/new"
            className="text-sm text-blue-400 hover:text-blue-300 font-medium"
            style={{ minHeight: 'auto' }}
          >
            + New Team
          </Link>
        </div>

        {teams.length === 0 ? (
          <div className="bg-gray-900 rounded-2xl p-6 text-center border border-dashed border-gray-700">
            <div className="text-4xl mb-3">🏆</div>
            <p className="text-white font-semibold mb-1">No teams yet</p>
            <p className="text-gray-400 text-sm mb-4">
              Create your first team to get started managing your roster,
              schedule, and stats.
            </p>
            <Link
              to="/teams/new"
              className="inline-flex items-center justify-center h-11 px-6 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-500"
            >
              Create a Team
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className="block bg-gray-900 rounded-2xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-white">{team.name}</p>
                    <p className="text-gray-400 text-sm">{team.division}</p>
                  </div>
                  <span className="text-blue-400 font-mono text-sm font-semibold">
                    {team.record}
                  </span>
                </div>
                {team.nextGame && (
                  <p className="text-gray-500 text-xs mt-2">
                    Next: {team.nextGame}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-lg font-bold text-white mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: '📋', label: 'Roster', to: '/roster' },
            { icon: '📅', label: 'Schedule', to: '/schedule' },
            { icon: '📊', label: 'Stats', to: '/stats' },
            { icon: '💬', label: 'Messages', to: '/messages' },
          ].map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex flex-col items-center justify-center bg-gray-900 rounded-2xl p-4 border border-gray-800 hover:border-blue-500/50 transition-colors gap-2 h-20"
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="text-sm text-gray-300 font-medium">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function ParentHome() {
  const upcomingGames: UpcomingGame[] = []

  return (
    <div className="space-y-6">
      <ThisWeekendCard />

      <section>
        <h2 className="text-lg font-bold text-white mb-3">Next Game</h2>
        {upcomingGames.length === 0 ? (
          <div className="bg-gray-900 rounded-2xl p-6 text-center border border-dashed border-gray-700">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-white font-semibold mb-1">No upcoming games</p>
            <p className="text-gray-400 text-sm">
              Your child&apos;s next game will appear here once it&apos;s been
              scheduled.
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            {upcomingGames.slice(0, 1).map((game) => (
              <Link key={game.id} to={`/games/${game.id}`} className="block">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${game.isHome ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-300'}`}
                  >
                    {game.isHome ? 'HOME' : 'AWAY'}
                  </span>
                  <span className="text-gray-400 text-sm">
                    {format(new Date(game.date), 'EEE, MMM d · h:mm a')}
                  </span>
                </div>
                <p className="text-white font-bold text-lg">
                  vs {game.opponent}
                </p>
                <p className="text-gray-400 text-sm mt-1 flex items-center gap-1">
                  <span>📍</span>
                  {game.location}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-3">
          Upcoming Schedule
        </h2>
        {upcomingGames.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No games scheduled yet. Check back later.
          </p>
        ) : (
          <div className="space-y-2">
            {upcomingGames.slice(1, 5).map((game) => (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="flex items-center justify-between bg-gray-900 rounded-xl p-3 border border-gray-800 hover:border-gray-700"
              >
                <div>
                  <p className="text-white text-sm font-medium">
                    vs {game.opponent}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {format(new Date(game.date), 'EEE, MMM d · h:mm a')}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${game.isHome ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-300'}`}
                >
                  {game.isHome ? 'HOME' : 'AWAY'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PlayerHome() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-white mb-3">My Schedule</h2>
        <div className="bg-gray-900 rounded-2xl p-6 text-center border border-dashed border-gray-700">
          <div className="text-4xl mb-3">⚾</div>
          <p className="text-white font-semibold mb-1">No upcoming games</p>
          <p className="text-gray-400 text-sm">
            Your schedule will appear here once your coach adds games.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-3">My Stats</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'AVG', value: '.---' },
            { label: 'HR', value: '0' },
            { label: 'RBI', value: '0' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-900 rounded-2xl p-4 text-center border border-gray-800"
            >
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-gray-400 text-xs mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function HomePage() {
  const { user, activeRole } = useAuthStore()

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const renderByRole = (role: Role | undefined) => {
    switch (role) {
      case 'COACH':
        return <CoachHome />
      case 'PARENT':
        return <ParentHome />
      case 'PLAYER':
        return <PlayerHome />
      default:
        return (
          <div className="space-y-6">
            <ThisWeekendCard />
            <div className="bg-gray-900 rounded-2xl p-6 text-center border border-dashed border-gray-700">
              <div className="text-4xl mb-3">👋</div>
              <p className="text-white font-semibold mb-1">Welcome to DiamondHub!</p>
              <p className="text-gray-400 text-sm mb-4">
                Set up your role to get a personalized experience.
              </p>
              <Link
                to="/onboarding"
                className="inline-flex items-center justify-center h-11 px-6 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-500"
              >
                Get Started
              </Link>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="px-4 pt-4 pb-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-gray-400 text-sm">{greeting}</p>
        <h1 className="text-2xl font-bold text-white">
          {user?.name?.split(' ')[0] ?? 'Athlete'}
        </h1>
        {activeRole && (
          <span className="inline-flex items-center mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
            {activeRole.role}
          </span>
        )}
      </div>

      {/* Email verification banner */}
      {user && !user.emailVerified && (
        <div className="mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-yellow-400 text-lg flex-shrink-0">⚠️</span>
          <div>
            <p className="text-yellow-300 text-sm font-medium">
              Verify your email
            </p>
            <p className="text-yellow-400/80 text-xs mt-0.5">
              Check your inbox at {user.email} and click the verification link.
            </p>
          </div>
        </div>
      )}

      {/* Role-specific content */}
      {renderByRole(activeRole?.role)}
    </div>
  )
}
