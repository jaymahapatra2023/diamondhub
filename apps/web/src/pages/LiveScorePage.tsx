import { useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '../store/auth.store.js'
import { apiClient } from '../api/client.js'
import type { GameResponse } from '@diamondhub/contracts'

// API call
const fetchGame = (gameId: string) =>
  apiClient.get<GameResponse>(`/games/${gameId}`).then(r => r.data)

export function LiveScorePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuthStore()
  const [socketConnected, setSocketConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const socketRef = useRef<any>(null)
  const queryClient = useQueryClient()

  // P3: REST baseline — refetch every 30s when WebSocket unavailable
  const { data: game, isLoading, isError, error } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => fetchGame(gameId!),
    enabled: !!gameId,
    refetchInterval: socketConnected ? false : 30000, // Only poll when WS is down
  })

  // P3: Progressive enhancement — WebSocket for real-time updates
  useEffect(() => {
    if (!gameId) return
    let io: any
    const connectSocket = async () => {
      try {
        const { io: socketIo } = await import('socket.io-client')
        io = socketIo(import.meta.env.VITE_API_URL ?? window.location.origin, {
          transports: ['websocket', 'polling'],
        })
        io.on('connect', () => {
          setSocketConnected(true)
          io.emit('join:game', gameId)
        })
        io.on('disconnect', () => setSocketConnected(false))
        io.on('score:update', (_data: Partial<GameResponse>) => {
          setLastUpdated(new Date())
          // Invalidate query so it re-fetches latest full game data
          void queryClient.invalidateQueries({ queryKey: ['game', gameId] })
        })
        socketRef.current = io
      } catch {
        setSocketConnected(false)
      }
    }
    void connectSocket()
    return () => { io?.disconnect() }
  }, [gameId, queryClient])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">⚾</div>
          <p className="text-gray-400">Loading game...</p>
        </div>
      </div>
    )
  }

  if (isError || !game) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Game not found</h1>
          <p className="text-gray-400 text-sm">This game link may be expired or invalid.</p>
        </div>
      </div>
    )
  }

  const innings = game.inningsDetail as Array<{ inning: number; home: number; away: number }>
  const totalInnings = Math.max(innings.length, 7) // Show at least 7 innings

  return (
    <div className="min-h-screen bg-gray-950 px-4 pt-6 pb-10">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {game.status === 'LIVE' ? (
            <span className="flex items-center gap-1 text-green-400 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          ) : game.status === 'FINAL' ? (
            <span className="text-gray-400 text-sm font-semibold">FINAL</span>
          ) : (
            <span className="text-gray-500 text-sm">{game.status}</span>
          )}
          {!socketConnected && game.status === 'LIVE' && (
            <span className="text-amber-400 text-xs">(polling)</span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-gray-500 text-xs">
            Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Score display */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4">
        <div className="grid grid-cols-3 gap-4 items-center text-center">
          <div>
            <p className="text-white font-bold text-lg leading-tight">{game.homeTeamName}</p>
            <p className="text-gray-500 text-xs mt-1">HOME</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-4">
              <span className="text-5xl font-bold text-white tabular-nums">{game.scoreHome}</span>
              <span className="text-gray-500 text-xl">–</span>
              <span className="text-5xl font-bold text-white tabular-nums">{game.scoreAway}</span>
            </div>
            {game.status === 'LIVE' && (
              <p className="text-green-400 text-sm mt-2">
                {game.half === 'TOP' ? '▲' : '▼'} {game.inning}
              </p>
            )}
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">{game.awayTeamName}</p>
            <p className="text-gray-500 text-xs mt-1">AWAY</p>
          </div>
        </div>
      </div>

      {/* Inning-by-inning grid */}
      {innings.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr>
                <th className="text-left text-gray-500 font-medium pb-2 w-20">Team</th>
                {Array.from({ length: totalInnings }, (_, i) => (
                  <th
                    key={i + 1}
                    className={`text-center text-gray-500 font-medium pb-2 w-10 ${game.inning === i + 1 && game.status === 'LIVE' ? 'text-green-400' : ''}`}
                  >
                    {i + 1}
                  </th>
                ))}
                <th className="text-center text-white font-bold pb-2 w-12">R</th>
              </tr>
            </thead>
            <tbody>
              {(['HOME', 'AWAY'] as const).map((side) => (
                <tr key={side}>
                  <td className="text-gray-300 font-medium py-1">
                    {side === 'HOME' ? game.homeTeamName : game.awayTeamName}
                  </td>
                  {Array.from({ length: totalInnings }, (_, i) => {
                    const inningData = innings.find(inn => inn.inning === i + 1)
                    const runs = inningData ? (side === 'HOME' ? inningData.home : inningData.away) : null
                    return (
                      <td key={i + 1} className="text-center text-gray-300 py-1">
                        {runs !== null ? runs : <span className="text-gray-700">–</span>}
                      </td>
                    )
                  })}
                  <td className="text-center text-white font-bold py-1">
                    {side === 'HOME' ? game.scoreHome : game.scoreAway}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Game info */}
      <div className="mt-4 text-center text-sm text-gray-500">
        {format(new Date(game.scheduledTime), 'EEE, MMM d · h:mm a')}
        {game.field && <span className="ml-2">· {game.field}</span>}
      </div>

      {/* Share button */}
      <div className="mt-6 text-center">
        <button
          onClick={() => {
            const url = window.location.href
            if (navigator.share) {
              void navigator.share({ title: `${game.homeTeamName} vs ${game.awayTeamName}`, url })
            } else {
              void navigator.clipboard.writeText(url)
            }
          }}
          className="inline-flex items-center gap-2 h-11 px-6 bg-gray-800 text-gray-300 rounded-xl text-sm hover:bg-gray-700 min-h-[44px]"
        >
          Share Live Score
        </button>
      </div>
    </div>
  )
}
