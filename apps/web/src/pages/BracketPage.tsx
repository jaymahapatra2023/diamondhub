import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { apiClient } from '../api/client.js'
import type { BracketGame } from '@diamondhub/contracts'

// Fetch bracket (public endpoint)
const fetchBracket = (tournamentId: string) =>
  apiClient.get<BracketGame[]>(`/games/tournaments/${tournamentId}/bracket`).then(r => r.data)

const STATUS_COLORS: Record<string, string> = {
  LIVE: 'text-green-400 border-green-400/40',
  FINAL: 'text-gray-400 border-gray-600',
  SCHEDULED: 'text-blue-400 border-blue-400/40',
  DELAYED: 'text-amber-400 border-amber-400/40',
  CANCELLED: 'text-red-400/60 border-red-400/20',
}

export function BracketPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()

  const { data: bracket, isLoading, isError } = useQuery({
    queryKey: ['bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId!),
    enabled: !!tournamentId,
    refetchInterval: 60000, // Poll every minute for live updates
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🏆</div>
          <p className="text-gray-400">Loading bracket...</p>
        </div>
      </div>
    )
  }

  if (isError || !bracket) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Bracket not available</h1>
          <p className="text-gray-400 text-sm">The bracket for this tournament hasn't been posted yet.</p>
        </div>
      </div>
    )
  }

  // Group by round
  const rounds = new Map<string, BracketGame[]>()
  const poolGames = bracket.filter(g => g.pool)
  const bracketGames = bracket.filter(g => !g.pool)

  for (const game of bracketGames) {
    const round = game.round ?? 'Bracket'
    if (!rounds.has(round)) rounds.set(round, [])
    rounds.get(round)!.push(game)
  }

  // Group pool games by pool
  const pools = new Map<string, BracketGame[]>()
  for (const game of poolGames) {
    const pool = game.pool!
    if (!pools.has(pool)) pools.set(pool, [])
    pools.get(pool)!.push(game)
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 pt-6 pb-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tournament Bracket</h1>
        <button
          onClick={() => {
            const url = window.location.href
            if (navigator.share) void navigator.share({ title: 'Tournament Bracket', url })
            else void navigator.clipboard.writeText(url)
          }}
          className="h-11 px-4 bg-gray-800 text-gray-300 rounded-xl text-sm hover:bg-gray-700 min-h-[44px]"
        >
          Share
        </button>
      </div>

      {/* Pool Play */}
      {pools.size > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">Pool Play</h2>
          {Array.from(pools.entries()).map(([pool, games]) => (
            <div key={pool} className="mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase">Pool {pool}</h3>
              <div className="space-y-2">
                {games.map(game => <GameCard key={game.id} game={game} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bracket rounds */}
      {rounds.size > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">Bracket</h2>
          <div className="overflow-x-auto">
            <div className="flex gap-6 min-w-max pb-4">
              {Array.from(rounds.entries()).map(([round, games]) => (
                <div key={round} className="w-64">
                  <h3 className="text-sm font-medium text-gray-400 mb-3 text-center uppercase">{round}</h3>
                  <div className="space-y-3">
                    {games.map(game => <GameCard key={game.id} game={game} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {bracket.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-400">No games scheduled yet.</p>
          <p className="text-gray-500 text-sm mt-1">Check back once the bracket is set.</p>
        </div>
      )}
    </div>
  )
}

function GameCard({ game }: { game: BracketGame }) {
  const colors = STATUS_COLORS[game.status] ?? 'text-gray-400 border-gray-700'
  const isFinal = game.status === 'FINAL'
  const homeWon = isFinal && game.winnerId === game.homeTeamId
  const awayWon = isFinal && game.winnerId === game.awayTeamId

  return (
    <Link
      to={`/live/${game.id}`}
      className={`block bg-gray-900 border rounded-xl p-3 hover:bg-gray-800 transition-colors ${game.isUserTeam ? 'border-blue-500/50' : 'border-gray-800'}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${colors.split(' ')[0]}`}>{game.status}</span>
        {game.field && <span className="text-xs text-gray-500">{game.field}</span>}
      </div>
      <div className="space-y-1">
        {[
          { name: game.homeTeamName, score: game.scoreHome, won: homeWon },
          { name: game.awayTeamName, score: game.scoreAway, won: awayWon },
        ].map((team, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className={`text-sm truncate ${team.won ? 'text-white font-semibold' : 'text-gray-300'}`}>
              {team.won ? '● ' : ''}{team.name}
            </span>
            <span className={`text-sm font-bold ml-2 tabular-nums ${team.won ? 'text-white' : 'text-gray-400'}`}>
              {isFinal || game.status === 'LIVE' ? team.score : '—'}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs text-gray-600">
        {format(new Date(game.scheduledTime), 'h:mm a')}
      </div>
    </Link>
  )
}
