// E7-S5: My Registrations — shows all team registrations with status, payment, and actions
import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { teamApi } from '../api/team.api.js'
import { registrationApi } from '../api/registration.api.js'
import { Button } from '../components/ui/Button.js'
import type { TeamResponse } from '@diamondhub/contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

type RegistrationStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'WAITLISTED' | 'WITHDRAWN'
type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED' | 'FREE'

interface Registration {
  id: string
  teamId: string
  tournamentId: string
  tournamentName: string
  tournamentStartDate: string
  tournamentEndDate: string
  division: string
  status: RegistrationStatus
  paymentStatus: PaymentStatus
  waitlistPosition?: number
  rosterLocked: boolean
  ageViolations?: string[]
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RegistrationStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: 'Pending Payment', className: 'bg-amber-500/20 text-amber-400' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-green-500/20 text-green-400' },
  WAITLISTED: { label: 'Waitlisted', className: 'bg-blue-500/20 text-blue-400' },
  WITHDRAWN: { label: 'Withdrawn', className: 'bg-gray-500/20 text-gray-400' },
}

const PAYMENT_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  UNPAID: { label: 'Unpaid', className: 'text-amber-400' },
  PAID: { label: 'Paid', className: 'text-green-400' },
  REFUNDED: { label: 'Refunded', className: 'text-gray-400' },
  FREE: { label: 'Free', className: 'text-gray-400' },
}

function StatusBadge({ status }: { status: RegistrationStatus }) {
  const { label, className } = STATUS_CONFIG[status]
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${className}`}>
      {label}
    </span>
  )
}

// ── Withdraw confirm dialog ───────────────────────────────────────────────────

interface WithdrawDialogProps {
  tournamentName: string
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function WithdrawDialog({ tournamentName, onConfirm, onCancel, isLoading }: WithdrawDialogProps) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-4 pb-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="withdraw-dialog-title"
    >
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-sm">
        <h3 id="withdraw-dialog-title" className="text-white font-bold text-lg mb-2">
          Withdraw Registration?
        </h3>
        <p className="text-gray-400 text-sm mb-6">
          Are you sure you want to withdraw from <strong className="text-white">{tournamentName}</strong>?
          This action may not be reversible and entry fees may not be refunded.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading} className="flex-1">
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={isLoading} className="flex-1">
            Withdraw
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Registration card ─────────────────────────────────────────────────────────

interface RegistrationCardProps {
  reg: Registration
  onWithdraw: (reg: Registration) => void
  onLockRoster: (reg: Registration) => void
  lockRosterLoading: boolean
}

function RegistrationCard({ reg, onWithdraw, onLockRoster, lockRosterLoading }: RegistrationCardProps) {
  const paymentConfig = PAYMENT_CONFIG[reg.paymentStatus]
  const startDate = new Date(reg.tournamentStartDate)
  const endDate = new Date(reg.tournamentEndDate)
  const dateRange = `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`
  const hasAgeViolations = (reg.ageViolations?.length ?? 0) > 0

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link
            to={`/tournaments/${reg.tournamentId}`}
            className="text-white font-bold text-base hover:text-blue-400 transition-colors block truncate"
          >
            {reg.tournamentName}
          </Link>
          <p className="text-gray-500 text-xs mt-0.5">{dateRange} · {reg.division}</p>
        </div>
        <StatusBadge status={reg.status} />
      </div>

      {/* Payment row */}
      <div className="flex items-center gap-2">
        <span className="text-gray-600 text-xs">Payment:</span>
        <span className={`text-xs font-semibold ${paymentConfig.className}`}>
          {paymentConfig.label}
        </span>
        {reg.rosterLocked && (
          <span className="text-xs text-gray-500 ml-auto">Roster locked ✓</span>
        )}
      </div>

      {/* Waitlist position */}
      {reg.status === 'WAITLISTED' && reg.waitlistPosition !== undefined && (
        <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl px-3 py-2">
          <p className="text-blue-400 text-sm font-semibold">
            Waitlist position: #{reg.waitlistPosition}
          </p>
        </div>
      )}

      {/* Age violation warning */}
      {hasAgeViolations && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-3 py-2">
          <p className="text-red-400 text-xs font-semibold">
            Age violations: {reg.ageViolations!.join(', ')}
          </p>
        </div>
      )}

      {/* Actions */}
      {reg.status !== 'WITHDRAWN' && (
        <div className="flex gap-2 pt-1">
          {reg.status === 'CONFIRMED' && !reg.rosterLocked && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onLockRoster(reg)}
              isLoading={lockRosterLoading}
              className="flex-1"
            >
              Lock Roster
            </Button>
          )}
          {reg.status === 'PENDING_PAYMENT' && (
            <Link
              to={`/registrations/new/${reg.tournamentId}`}
              className="flex-1 h-10 inline-flex items-center justify-center text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors"
            >
              Complete Payment
            </Link>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onWithdraw(reg)}
            className="text-gray-500 hover:text-red-400"
          >
            Withdraw
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Team registrations section ────────────────────────────────────────────────

interface TeamRegistrationsSectionProps {
  team: TeamResponse
}

function TeamRegistrationsSection({ team }: TeamRegistrationsSectionProps) {
  const queryClient = useQueryClient()
  const [withdrawTarget, setWithdrawTarget] = useState<Registration | null>(null)
  const [lockingId, setLockingId] = useState<string | null>(null)
  const [showPaymentHistory, setShowPaymentHistory] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])

  const { data: registrations = [], isLoading } = useQuery<Registration[]>({
    queryKey: ['registrations', team.id],
    queryFn: () => registrationApi.getTeamRegistrations(team.id),
    staleTime: 1000 * 60 * 2,
  })

  const withdrawMutation = useMutation({
    mutationFn: ({ registrationId, teamId }: { registrationId: string; teamId: string }) =>
      registrationApi.withdraw(registrationId, teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['registrations', team.id] })
      setWithdrawTarget(null)
    },
  })

  const lockRosterMutation = useMutation({
    mutationFn: (registrationId: string) => registrationApi.lockRoster(registrationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['registrations', team.id] })
      setLockingId(null)
    },
    onSettled: () => setLockingId(null),
  })

  function handleLockRoster(reg: Registration) {
    setLockingId(reg.id)
    lockRosterMutation.mutate(reg.id)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 bg-gray-900 rounded-2xl border border-gray-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (registrations.length === 0) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 text-center">
        <p className="text-gray-500 text-sm">No registrations for {team.name} yet.</p>
        <Link
          to="/tournaments"
          className="text-blue-400 text-sm font-semibold hover:underline mt-2 block"
        >
          Find tournaments →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {registrations.map((reg) => (
        <RegistrationCard
          key={reg.id}
          reg={reg}
          onWithdraw={setWithdrawTarget}
          onLockRoster={handleLockRoster}
          lockRosterLoading={lockingId === reg.id && lockRosterMutation.isPending}
        />
      ))}

      {/* Payment history link */}
      <div className="text-center pt-1">
        <button
          onClick={() => {
            const handleViewPaymentHistory = async () => {
              try {
                const history = await registrationApi.getPaymentHistory(team.id)
                setPaymentHistory(history)
                setShowPaymentHistory(true)
              } catch {
                // Show error
              }
            }
            void handleViewPaymentHistory()
          }}
          className="text-blue-400 text-sm hover:underline font-medium"
        >
          View Payment History
        </button>
      </div>

      {showPaymentHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Payment History</h3>
              <button onClick={() => setShowPaymentHistory(false)} className="text-gray-400 text-2xl min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>
            {paymentHistory.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No payments recorded.</p>
            ) : (
              <div className="space-y-3">
                {paymentHistory.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-800">
                    <div>
                      <p className="text-white text-sm font-medium">{p.tournament?.name ?? 'Tournament'}</p>
                      <p className="text-gray-500 text-xs">{p.confirmedAt ? new Date(p.confirmedAt).toLocaleDateString() : '—'}</p>
                    </div>
                    <span className="text-green-400 font-semibold">${Number(p.entryFeePaid).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-400 text-sm font-medium">Total</span>
                  <span className="text-white font-bold">${paymentHistory.reduce((sum: number, p: any) => sum + Number(p.entryFeePaid), 0).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Withdraw confirm dialog */}
      {withdrawTarget && (
        <WithdrawDialog
          tournamentName={withdrawTarget.tournamentName}
          onConfirm={() => withdrawMutation.mutate({ registrationId: withdrawTarget.id, teamId: withdrawTarget.teamId })}
          onCancel={() => setWithdrawTarget(null)}
          isLoading={withdrawMutation.isPending}
        />
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function MyRegistrationsPage() {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  const { data: teams = [], isLoading: teamsLoading } = useQuery<TeamResponse[]>({
    queryKey: ['my-teams'],
    queryFn: teamApi.getMyTeams,
    staleTime: 1000 * 60 * 5,
  })

  const activeTeamId = selectedTeamId ?? teams[0]?.id ?? null
  const activeTeam = teams.find((t) => t.id === activeTeamId)

  return (
    <div className="bg-gray-950 min-h-full pb-8">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800 px-4 py-3">
        <h1 className="text-white font-bold text-xl">My Registrations</h1>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {teamsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-900 rounded-2xl border border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4" aria-hidden="true">⚾</div>
            <h2 className="text-white font-bold text-xl mb-2">No teams yet</h2>
            <p className="text-gray-400 text-sm mb-6">
              Create or join a team to start registering for tournaments.
            </p>
            <Link
              to="/teams/create"
              className="h-12 px-6 inline-flex items-center justify-center bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors"
            >
              Create a Team
            </Link>
          </div>
        ) : (
          <>
            {/* Team selector tabs — show only if multiple teams */}
            {teams.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" role="tablist" aria-label="Select team">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    role="tab"
                    aria-selected={team.id === activeTeamId}
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`flex-shrink-0 h-10 px-4 rounded-full text-sm font-semibold transition-colors ${
                      team.id === activeTeamId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            )}

            {/* Team name header when single team */}
            {teams.length === 1 && (
              <div className="flex items-center gap-2 py-1">
                <span className="text-gray-400 text-sm font-semibold">{teams[0]!.name}</span>
                <span className="text-gray-600 text-xs">· {teams[0]!.ageDivision}</span>
              </div>
            )}

            {/* Registrations list for active team */}
            {activeTeam && (
              <TeamRegistrationsSection team={activeTeam} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
