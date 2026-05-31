// E11 · Player stats — season batting/pitching line + game-by-game table
import { useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { playerStatsApi } from '../api/player-stats.api.js'
import { useAuthStore } from '../store/auth.store.js'

// ── StatsEntryForm ────────────────────────────────────────────────────────────

function StatsEntryForm({ playerId, onClose, onSaved }: { playerId: string; onClose: () => void; onSaved: () => void }) {
  const [gameId, setGameId] = useState('')
  const [batting, setBatting] = useState({ atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, walks: 0, strikeouts: 0 })
  const [pitching, setPitching] = useState({ inningsPitched: 0, earnedRuns: 0, pitchingWin: null as boolean | null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!gameId.trim()) { setError('Game ID is required'); return }
    setSaving(true)
    setError(null)
    try {
      await playerStatsApi.upsertGameStat(gameId, playerId, { ...batting, ...pitching })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to save stats')
    } finally {
      setSaving(false)
    }
  }

  const numInput = (label: string, value: number, onChange: (v: number) => void) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-gray-300 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(0, value - 1))} className="w-8 h-8 bg-gray-700 rounded-lg text-white text-lg flex items-center justify-center">−</button>
        <span className="text-white font-mono w-8 text-center">{value}</span>
        <button onClick={() => onChange(value + 1)} className="w-8 h-8 bg-gray-700 rounded-lg text-white text-lg flex items-center justify-center">+</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1">Game ID</label>
        <input
          type="text"
          value={gameId}
          onChange={e => setGameId(e.target.value)}
          placeholder="Paste game ID from game details"
          className="w-full h-12 px-3 bg-gray-800 rounded-xl text-white text-sm border border-gray-700 focus:border-blue-500 outline-none"
        />
      </div>
      <p className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wide">Batting</p>
      {numInput('At Bats (AB)', batting.atBats, v => setBatting(b => ({ ...b, atBats: v })))}
      {numInput('Hits (H)', batting.hits, v => setBatting(b => ({ ...b, hits: v })))}
      {numInput('2B', batting.doubles, v => setBatting(b => ({ ...b, doubles: v })))}
      {numInput('3B', batting.triples, v => setBatting(b => ({ ...b, triples: v })))}
      {numInput('HR', batting.homeRuns, v => setBatting(b => ({ ...b, homeRuns: v })))}
      {numInput('RBI', batting.rbi, v => setBatting(b => ({ ...b, rbi: v })))}
      {numInput('BB', batting.walks, v => setBatting(b => ({ ...b, walks: v })))}
      {numInput('K', batting.strikeouts, v => setBatting(b => ({ ...b, strikeouts: v })))}
      <p className="text-gray-400 text-xs font-medium mb-2 mt-4 uppercase tracking-wide">Pitching (if pitched)</p>
      {numInput('Innings Pitched (IP)', pitching.inningsPitched, v => setPitching(p => ({ ...p, inningsPitched: v })))}
      {numInput('Earned Runs (ER)', pitching.earnedRuns, v => setPitching(p => ({ ...p, earnedRuns: v })))}
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-12 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 disabled:opacity-50 mt-4 min-h-[44px]"
      >
        {saving ? 'Saving...' : 'Save Stats'}
      </button>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeasonBatting {
  avg: number
  hr: number
  rbi: number
  obp: number
  ab: number
  hits: number
  games: number
}

interface SeasonPitching {
  era: number
  ip: number
  wins: number
  losses: number
  strikeouts: number
}

interface GameStatRow {
  gameId: string
  date: string
  opponent: string
  ab: number
  hits: number
  hr: number
  rbi: number
  avg: number | null
  ip?: number
  er?: number
}

interface PlayerSeasonStats {
  playerId: string
  playerName: string
  seasonYear: number
  batting: SeasonBatting
  pitching: SeasonPitching | null
  games: GameStatRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAvg(val: number): string {
  return val.toFixed(3).replace(/^0/, '')
}

function fmtEra(val: number): string {
  return val.toFixed(2)
}

const SEASON_YEARS = [2026, 2025, 2024, 2023]

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center bg-gray-900 rounded-2xl px-4 py-3 flex-1 min-w-[68px]">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</span>
      <span className="text-xl font-bold text-white">{value}</span>
    </div>
  )
}

// ── PlayerStatsPage ───────────────────────────────────────────────────────────

export function PlayerStatsPage() {
  const { playerId: routePlayerId } = useParams<{ playerId: string }>()
  const { user, activeRole } = useAuthStore()
  const isCoach = activeRole?.role === 'COACH'

  // Players/parents view their own stats; coaches can view any
  const playerId = routePlayerId ?? user?.id ?? ''
  const [seasonYear, setSeasonYear] = useState(2026)
  const [showStatsEntry, setShowStatsEntry] = useState(false)

  const { data: stats, isLoading, isError, refetch } = useQuery<PlayerSeasonStats>({
    queryKey: ['player-season-stats', playerId, seasonYear],
    queryFn: () => playerStatsApi.getPlayerSeasonStats(playerId, seasonYear),
    enabled: !!playerId,
    staleTime: 5 * 60_000,
  })

  const handleShare = () => {
    const url = `${window.location.origin}/stats/${playerId}?season=${seasonYear}`
    if (navigator.share) {
      void navigator.share({ title: 'Player Stats', url })
    } else {
      void navigator.clipboard.writeText(url).then(() => {
        // Could show a toast here
      })
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-xl font-bold text-white truncate">
            {stats?.playerName ?? 'Player Stats'}
          </h1>
          <button
            type="button"
            aria-label="Share stats"
            onClick={handleShare}
            className="flex-shrink-0 h-9 px-3 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
            </svg>
            Share
          </button>
        </div>

        {/* Season selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="season-select" className="text-xs text-gray-500 font-medium">
            Season:
          </label>
          <select
            id="season-select"
            value={seasonYear}
            onChange={(e) => setSeasonYear(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SEASON_YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-6">
        {isLoading && (
          <div className="space-y-4" aria-label="Loading stats">
            <div className="h-8 w-40 bg-gray-800 rounded-xl animate-pulse" />
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex-1 h-20 bg-gray-800 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="h-40 bg-gray-800 rounded-2xl animate-pulse" />
          </div>
        )}

        {isError && (
          <div className="py-12 text-center">
            <p className="text-gray-400 text-sm">Failed to load stats</p>
          </div>
        )}

        {!isLoading && !isError && stats && (
          <>
            {/* Batting line */}
            <section aria-label="Season batting stats">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Batting — {stats.batting.games} games
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <StatCard label="AVG" value={fmtAvg(stats.batting.avg)} />
                <StatCard label="HR" value={String(stats.batting.hr)} />
                <StatCard label="RBI" value={String(stats.batting.rbi)} />
                <StatCard label="OBP" value={fmtAvg(stats.batting.obp)} />
                <StatCard label="AB" value={String(stats.batting.ab)} />
                <StatCard label="H" value={String(stats.batting.hits)} />
              </div>
            </section>

            {/* Pitching line — only if pitcher */}
            {stats.pitching && (
              <section aria-label="Season pitching stats">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Pitching
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <StatCard label="ERA" value={fmtEra(stats.pitching.era)} />
                  <StatCard label="IP" value={String(stats.pitching.ip)} />
                  <StatCard label="W" value={String(stats.pitching.wins)} />
                  <StatCard label="L" value={String(stats.pitching.losses)} />
                  <StatCard label="K" value={String(stats.pitching.strikeouts)} />
                </div>
              </section>
            )}

            {/* Coach: stats entry button */}
            {isCoach && (
              <button
                onClick={() => setShowStatsEntry(true)}
                className="w-full h-12 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 mb-4 min-h-[44px]"
              >
                + Enter Game Stats
              </button>
            )}

            {/* Game-by-game breakdown */}
            <section aria-label="Game by game stats">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Game Log
              </h2>

              {stats.games.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No game data for this season</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                        <th className="px-3 py-3 font-semibold">Date</th>
                        <th className="px-3 py-3 font-semibold">Opp.</th>
                        <th className="px-3 py-3 font-semibold text-right">AB</th>
                        <th className="px-3 py-3 font-semibold text-right">H</th>
                        <th className="px-3 py-3 font-semibold text-right">HR</th>
                        <th className="px-3 py-3 font-semibold text-right">RBI</th>
                        <th className="px-3 py-3 font-semibold text-right">AVG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.games.map((game, idx) => (
                        <tr
                          key={game.gameId}
                          className={`border-b border-gray-800/50 last:border-0 ${
                            idx % 2 === 0 ? 'bg-gray-900/30' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                            {new Date(game.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="px-3 py-2.5 text-gray-300 max-w-[100px] truncate">{game.opponent}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300">{game.ab}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300">{game.hits}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300">{game.hr}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300">{game.rbi}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-white">
                            {game.avg !== null ? fmtAvg(game.avg) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Stats entry modal (coach only) */}
      {showStatsEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Enter Game Stats</h3>
              <button
                onClick={() => setShowStatsEntry(false)}
                className="text-gray-400 text-2xl min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <StatsEntryForm
              playerId={playerId}
              onClose={() => setShowStatsEntry(false)}
              onSaved={() => { setShowStatsEntry(false); void refetch() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
