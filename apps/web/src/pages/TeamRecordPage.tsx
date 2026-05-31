// E11-S3 · Team win/loss record — W-L-T badge, per-tournament breakdown, season selector
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store.js'
import { playerStatsApi } from '../api/player-stats.api.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TournamentResult {
  tournamentId: string
  tournamentName: string
  startDate: string
  wins: number
  losses: number
  ties: number
  placement?: string
}

interface TeamRecord {
  teamId: string
  teamName: string
  seasonYear: number
  wins: number
  losses: number
  ties: number
  tournaments: TournamentResult[]
}

const SEASON_YEARS = [2026, 2025, 2024, 2023]

// ── RecordBadge ────────────────────────────────────────────────────────────────

function RecordBadge({ wins, losses, ties }: { wins: number; losses: number; ties: number }) {
  return (
    <div className="flex items-center justify-center gap-3 bg-gray-900 rounded-3xl px-6 py-5 border border-gray-800">
      <div className="flex flex-col items-center">
        <span className="text-4xl font-black text-green-400">{wins}</span>
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-0.5">W</span>
      </div>
      <span className="text-3xl font-thin text-gray-700">-</span>
      <div className="flex flex-col items-center">
        <span className="text-4xl font-black text-red-400">{losses}</span>
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-0.5">L</span>
      </div>
      {ties > 0 && (
        <>
          <span className="text-3xl font-thin text-gray-700">-</span>
          <div className="flex flex-col items-center">
            <span className="text-4xl font-black text-gray-400">{ties}</span>
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide mt-0.5">T</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── TeamRecordPage ────────────────────────────────────────────────────────────

export function TeamRecordPage() {
  const { activeRole } = useAuthStore()
  const teamId = activeRole?.teamId ?? ''
  const [seasonYear, setSeasonYear] = useState(2026)

  const { data: record, isLoading, isError } = useQuery<TeamRecord>({
    queryKey: ['team-record', teamId, seasonYear],
    queryFn: () => playerStatsApi.getTeamRecord(teamId, seasonYear),
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  })

  const handleShareAsImage = () => {
    // Placeholder: in production, use html2canvas or a server-side image endpoint
    alert('Share as image — coming soon!')
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-xl font-bold text-white">
            {record?.teamName ?? 'Team Record'}
          </h1>
          <button
            type="button"
            aria-label="Share record as image"
            onClick={handleShareAsImage}
            className="flex-shrink-0 h-9 px-3 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L6.53 8.091a.75.75 0 00-1.06 0l-2.97 2.97zM12 7a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
            </svg>
            Share
          </button>
        </div>

        {/* Season selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="record-season" className="text-xs text-gray-500 font-medium">
            Season:
          </label>
          <select
            id="record-season"
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
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 space-y-6">
        {isLoading && (
          <div className="space-y-4" aria-label="Loading record">
            <div className="h-32 bg-gray-800 rounded-3xl animate-pulse" />
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {isError && (
          <div className="py-12 text-center">
            <p className="text-gray-400 text-sm">Failed to load team record</p>
          </div>
        )}

        {!isLoading && !isError && record && (
          <>
            {/* W-L-T badge */}
            <section aria-label="Overall record">
              <RecordBadge wins={record.wins} losses={record.losses} ties={record.ties} />
              <p className="text-center text-xs text-gray-500 mt-2">
                {seasonYear} Season · {record.tournaments.length} tournament{record.tournaments.length !== 1 ? 's' : ''}
              </p>
            </section>

            {/* Per-tournament breakdown */}
            {record.tournaments.length === 0 ? (
              <div className="py-12 text-center">
                <span className="text-4xl" aria-hidden="true">🏆</span>
                <p className="text-gray-400 text-sm mt-3">No tournaments played yet</p>
              </div>
            ) : (
              <section aria-label="Tournament breakdown">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Tournament Results
                </h2>
                <div className="space-y-2">
                  {record.tournaments.map((t) => (
                    <div
                      key={t.tournamentId}
                      className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{t.tournamentName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(t.startDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          {t.placement && (
                            <span className="ml-2 text-yellow-400 font-medium">{t.placement}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="px-2.5 py-1 rounded-xl bg-green-900/50 text-green-400 text-sm font-bold">
                          {t.wins}W
                        </span>
                        <span className="text-gray-600">-</span>
                        <span className="px-2.5 py-1 rounded-xl bg-red-900/50 text-red-400 text-sm font-bold">
                          {t.losses}L
                        </span>
                        {t.ties > 0 && (
                          <>
                            <span className="text-gray-600">-</span>
                            <span className="px-2.5 py-1 rounded-xl bg-gray-800 text-gray-400 text-sm font-bold">
                              {t.ties}T
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
