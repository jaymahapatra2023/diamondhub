// E14 · Coach Analytics Dashboard
// Three cards: Season Costs, Attendance, Win Rates
// Export PDF button (placeholder)

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics.api.js'
import { useAuthStore } from '../store/auth.store.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegistrationEntry {
  tournamentName: string
  date: string
  amount: number
}

interface SeasonCosts {
  totalSpent: number
  perPlayerCost: number
  registrations: RegistrationEntry[]
}

interface AttendanceRecord {
  userId: string
  name: string
  attended: number
  total: number
  rate: number
  belowThreshold: boolean
}

interface WinRateRecord {
  organizer: string
  wins: number
  total: number
  winRate: number
}

// ── Season Costs Card ─────────────────────────────────────────────────────────

function SeasonCostsCard({ teamId }: { teamId: string }) {
  const { data, isLoading, isError } = useQuery<SeasonCosts>({
    queryKey: ['analytics', 'costs', teamId],
    queryFn: () => analyticsApi.getSeasonCosts(teamId),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <section
      className="bg-gray-900 rounded-2xl p-5 border border-gray-800"
      aria-label="Season Costs"
    >
      <h2 className="text-lg font-bold text-white mb-4">Season Costs</h2>

      {isLoading && (
        <div className="space-y-2 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-gray-800" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400 text-sm">Failed to load season costs.</p>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">
                ${data.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 mt-1">Total Spent</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">
                ${data.perPlayerCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 mt-1">Per Player</p>
            </div>
          </div>

          {/* Registration list */}
          {data.registrations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Registrations
              </p>
              <div className="divide-y divide-gray-800">
                {data.registrations.map((r, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5">
                    <div>
                      <p className="text-sm font-medium text-white">{r.tournamentName}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(r.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400">
                      ${r.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.registrations.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">No paid registrations yet.</p>
          )}
        </>
      )}
    </section>
  )
}

// ── Attendance Card ───────────────────────────────────────────────────────────

type SortKey = 'name' | 'rate' | 'attended'

function AttendanceCard({ teamId }: { teamId: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('rate')
  const [sortAsc, setSortAsc] = useState(false)

  const { data = [], isLoading, isError } = useQuery<AttendanceRecord[]>({
    queryKey: ['analytics', 'attendance', teamId],
    queryFn: () => analyticsApi.getAttendance(teamId),
    staleTime: 5 * 60 * 1000,
  })

  const sorted = [...data].sort((a, b) => {
    const valA = a[sortKey]
    const valB = b[sortKey]
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
    }
    return sortAsc
      ? (valA as number) - (valB as number)
      : (valB as number) - (valA as number)
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((prev) => !prev)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const ColHeader = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <button
      onClick={() => handleSort(colKey)}
      className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      aria-sort={sortKey === colKey ? (sortAsc ? 'ascending' : 'descending') : 'none'}
    >
      {label}{sortKey === colKey ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </button>
  )

  return (
    <section
      className="bg-gray-900 rounded-2xl p-5 border border-gray-800"
      aria-label="Attendance Rates"
    >
      <h2 className="text-lg font-bold text-white mb-4">Attendance</h2>

      {isLoading && (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-gray-800" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400 text-sm">Failed to load attendance data.</p>
      )}

      {!isLoading && !isError && data.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">
          No events recorded yet.
        </p>
      )}

      {!isLoading && !isError && sorted.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm" role="grid" aria-label="Player attendance">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left pb-2 pr-4">
                  <ColHeader label="Player" colKey="name" />
                </th>
                <th className="text-center pb-2 px-2">
                  <ColHeader label="Attended" colKey="attended" />
                </th>
                <th className="text-right pb-2">
                  <ColHeader label="Rate" colKey="rate" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.userId}
                  className={['border-b border-gray-800/60', r.belowThreshold && 'bg-amber-900/10'].filter(Boolean).join(' ')}
                >
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-white">{r.name}</span>
                    {r.belowThreshold && (
                      <span
                        className="ml-2 text-[10px] font-semibold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded"
                        aria-label="Below 70% attendance threshold"
                      >
                        LOW
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center text-gray-300">
                    {r.attended}/{r.total}
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={[
                        'font-semibold tabular-nums',
                        r.belowThreshold ? 'text-amber-400' : 'text-emerald-400',
                      ].join(' ')}
                    >
                      {r.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── Win Rates Card ────────────────────────────────────────────────────────────

function WinRatesCard({ teamId }: { teamId: string }) {
  const { data = [], isLoading, isError } = useQuery<WinRateRecord[]>({
    queryKey: ['analytics', 'win-rates', teamId],
    queryFn: () => analyticsApi.getWinRates(teamId),
    staleTime: 5 * 60 * 1000,
  })

  const maxTotal = Math.max(...data.map((r) => r.total), 1)

  return (
    <section
      className="bg-gray-900 rounded-2xl p-5 border border-gray-800"
      aria-label="Win Rates by Organizer"
    >
      <h2 className="text-lg font-bold text-white mb-4">Win Rates by Organizer</h2>

      {isLoading && (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-gray-800" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400 text-sm">Failed to load win rate data.</p>
      )}

      {!isLoading && !isError && data.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">
          No completed games yet.
        </p>
      )}

      {!isLoading && !isError && data.length > 0 && (
        <div className="space-y-4">
          {data
            .slice()
            .sort((a, b) => b.winRate - a.winRate)
            .map((r) => (
              <div key={r.organizer}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-medium text-white">{r.organizer}</span>
                  <span className="text-sm font-bold text-blue-400 tabular-nums">
                    {r.winRate}%
                  </span>
                </div>
                {/* Bar visualization */}
                <div className="relative h-3 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${r.winRate}%` }}
                    role="progressbar"
                    aria-valuenow={r.winRate}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${r.organizer} win rate`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {r.wins}W – {r.total - r.wins}L ({r.total} games)
                </p>
              </div>
            ))}
        </div>
      )}
    </section>
  )
}

// ── Analytics Page ─────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const activeRole = useAuthStore((s) => s.activeRole)
  const teamId = activeRole?.teamId ?? ''

  const [pdfToast, setPdfToast] = useState(false)

  const handleExportPdf = () => {
    setPdfToast(true)
    setTimeout(() => setPdfToast(false), 3000)
  }

  if (!teamId) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-center px-4">
        <span className="text-5xl mb-4" aria-hidden="true">📊</span>
        <h1 className="text-xl font-bold text-white mb-2">Coach Analytics</h1>
        <p className="text-gray-400 text-sm">
          You must be a coach with an active team to view analytics.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Season performance overview</p>
        </div>
        <button
          onClick={handleExportPdf}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors border border-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Export analytics as PDF"
        >
          <span aria-hidden="true">📄</span> Export PDF
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 px-4 pb-24 space-y-4">
        <SeasonCostsCard teamId={teamId} />
        <AttendanceCard teamId={teamId} />
        <WinRatesCard teamId={teamId} />
      </div>

      {/* PDF export toast */}
      {pdfToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50 pointer-events-none"
        >
          Feature coming soon
        </div>
      )}
    </div>
  )
}
