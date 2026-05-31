// E7-S1: Multi-step tournament registration flow
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { tournamentApi } from '../api/tournament.api.js'
import { teamApi } from '../api/team.api.js'
import { registrationApi } from '../api/registration.api.js'
import { Button } from '../components/ui/Button.js'

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'select' | 'roster' | 'payment' | 'confirm' | 'waitlisted'

interface RegistrationState {
  step: Step
  teamId: string | null
  teamName: string | null
  division: string | null
  registrationId: string | null
  waitlistPosition: number | null
  clientSecret: string | null
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'select', label: 'Team' },
  { key: 'roster', label: 'Roster' },
  { key: 'payment', label: 'Payment' },
  { key: 'confirm', label: 'Done' },
] as const

function StepIndicator({ current }: { current: Step }) {
  const activeIndex = STEPS.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center justify-center gap-0 mb-6" role="progressbar" aria-label="Registration progress">
      {STEPS.map((step, i) => {
        const isActive = step.key === current
        const isDone = i < activeIndex
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isDone
                  ? 'bg-green-600 text-white'
                  : isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-500'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isDone ? '✓' : i + 1}
            </div>
            <span className={`text-xs ml-1 mr-2 font-medium ${isActive ? 'text-white' : isDone ? 'text-green-400' : 'text-gray-600'}`}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-px mr-2 ${i < activeIndex ? 'bg-green-600' : 'bg-gray-800'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Select team + division ────────────────────────────────────────────

interface TeamSelectStepProps {
  tournamentName: string
  ageDivisions: string[]
  onContinue: (teamId: string, teamName: string, division: string) => void
}

function TeamSelectStep({ tournamentName, ageDivisions, onContinue }: TeamSelectStepProps) {
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedDivision, setSelectedDivision] = useState('')

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['my-teams'],
    queryFn: teamApi.getMyTeams,
  })

  function handleContinue() {
    const team = teams.find((t) => t.id === selectedTeamId)
    if (team && selectedDivision) {
      onContinue(selectedTeamId, team.name, selectedDivision)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-bold text-xl mb-1">Register for</h2>
        <p className="text-blue-400 font-semibold text-base">{tournamentName}</p>
      </div>

      {/* Team selection */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">
          Select Team
        </label>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
            <p className="text-gray-400 text-sm mb-3">You don't have any teams yet.</p>
            <Link to="/teams/create" className="text-blue-400 text-sm font-semibold hover:underline">
              Create a team →
            </Link>
          </div>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Select team">
            {teams.map((team) => (
              <button
                key={team.id}
                role="radio"
                aria-checked={selectedTeamId === team.id}
                onClick={() => setSelectedTeamId(team.id)}
                className={`w-full text-left h-14 px-4 rounded-xl border transition-colors flex items-center gap-3 ${
                  selectedTeamId === team.id
                    ? 'border-blue-500 bg-blue-600/10'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                    selectedTeamId === team.id ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{team.name}</p>
                  <p className="text-gray-500 text-xs">{team.ageDivision} · {team.sport}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Division selection */}
      <div>
        <label htmlFor="division-select" className="block text-sm font-semibold text-gray-300 mb-2">
          Age Division
        </label>
        <select
          id="division-select"
          value={selectedDivision}
          onChange={(e) => setSelectedDivision(e.target.value)}
          className="w-full h-12 bg-gray-900 border border-gray-800 rounded-xl px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a division…</option>
          {ageDivisions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <Button
        onClick={handleContinue}
        disabled={!selectedTeamId || !selectedDivision}
        className="w-full"
        size="lg"
      >
        Continue
      </Button>
    </div>
  )
}

// ── Step 2: Review roster ─────────────────────────────────────────────────────

interface RosterStepProps {
  teamId: string
  teamName: string
  tournamentCutoffDate?: string | undefined
  onConfirm: () => void
  onBack: () => void
}

function RosterStep({ teamId, teamName, tournamentCutoffDate, onConfirm, onBack }: RosterStepProps) {
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['roster', teamId],
    queryFn: () => teamApi.getRoster(teamId),
  })

  function isEligible(dob: string | null): boolean | null {
    if (!dob || !tournamentCutoffDate) return null
    return new Date(dob) < new Date(tournamentCutoffDate)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-bold text-xl mb-1">Review Roster</h2>
        <p className="text-gray-400 text-sm">{teamName}</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
          <p className="text-gray-400 text-sm">No active players on this roster.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roster.map((player: { id: string; name: string; jerseyNumber?: string | number; dob?: string | null; position?: string }) => {
            const eligible = isEligible(player.dob ?? null)
            return (
              <div
                key={player.id}
                className="flex items-center gap-3 h-14 px-4 bg-gray-900 rounded-xl border border-gray-800"
              >
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 text-xs font-bold flex-shrink-0">
                  {player.jerseyNumber ?? '#'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{player.name}</p>
                  {player.position && (
                    <p className="text-gray-500 text-xs">{player.position}</p>
                  )}
                </div>
                {eligible === true && (
                  <span className="text-xs text-green-400 font-semibold flex-shrink-0">Eligible</span>
                )}
                {eligible === false && (
                  <span className="text-xs text-red-400 font-semibold flex-shrink-0">Age violation</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1" size="lg">
          Back
        </Button>
        <Button onClick={onConfirm} className="flex-1" size="lg">
          Confirm Roster
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: Payment ──────────────────────────────────────────────────────────

interface PaymentFormProps {
  tournamentName: string
  entryFee: number
  teamName: string
  registrationId: string
  clientSecret: string | null
  onSuccess: () => void
  onBack: () => void
}

function PaymentForm({ tournamentName, entryFee, teamName, registrationId, clientSecret, onSuccess, onBack }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [payError, setPayError] = useState<string | null>(null)
  const [isPaying, setIsPaying] = useState(false)

  const handlePay = async () => {
    if (!stripe || !elements) {
      setPayError('Payment system not loaded. Please refresh and try again.')
      return
    }
    const cardElement = elements.getElement(CardElement)
    if (!cardElement) {
      setPayError('Card input not ready. Please refresh and try again.')
      return
    }
    setIsPaying(true)
    setPayError(null)

    try {
      // Create PaymentMethod from card element
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      })
      if (pmError) {
        setPayError(pmError.message ?? 'Card validation failed')
        return
      }

      if (!clientSecret) {
        setPayError('Payment session not found. Please go back and try again.')
        return
      }

      // Confirm the payment on the client side — this charges the card
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: paymentMethod!.id,
      })

      if (confirmError) {
        setPayError(confirmError.message ?? 'Payment failed')
        return
      }

      if (paymentIntent?.status === 'succeeded') {
        // Payment succeeded — backend webhook will confirm the registration
        // Show success immediately (optimistic — webhook may take a few seconds)
        onSuccess()
      } else if (paymentIntent?.status === 'requires_action') {
        setPayError('Your bank requires additional verification. Please try again.')
      } else {
        setPayError('Payment was not completed. Please try again.')
      }
    } catch (err: any) {
      setPayError(err?.message ?? 'Payment failed. Please try again.')
    } finally {
      setIsPaying(false)
    }
  }

  void registrationId

  const formattedFee = `$${(entryFee / 100).toFixed(2)}`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-bold text-xl mb-1">Payment</h2>
        <p className="text-gray-400 text-sm">Complete registration for {tournamentName}</p>
      </div>

      {/* Order summary */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Tournament</span>
          <span className="text-white font-semibold">{tournamentName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Team</span>
          <span className="text-white">{teamName}</span>
        </div>
        <div className="h-px bg-gray-800 my-1" />
        <div className="flex justify-between text-base font-bold">
          <span className="text-gray-300">Entry Fee</span>
          <span className="text-white">{formattedFee}</span>
        </div>
      </div>

      {/* Card input */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">
          Card Information
        </label>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3.5 focus-within:border-blue-500 transition-colors">
          <CardElement
            options={{
              style: {
                base: {
                  color: '#f3f4f6',
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: '15px',
                  '::placeholder': { color: '#6b7280' },
                },
                invalid: { color: '#f87171' },
              },
            }}
          />
        </div>
        {payError && (
          <p className="text-red-400 text-sm mt-2">{payError}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} disabled={isPaying} className="flex-1" size="lg">
          Back
        </Button>
        <Button
          onClick={() => void handlePay()}
          isLoading={isPaying}
          disabled={!stripe}
          className="flex-1"
          size="lg"
        >
          Pay {formattedFee}
        </Button>
      </div>

      <p className="text-center text-gray-600 text-xs">
        Secured by Stripe. Your card details are never stored on our servers.
      </p>
    </div>
  )
}

// ── Step 4: Confirmation ──────────────────────────────────────────────────────

interface ConfirmStepProps {
  registrationId: string
  tournamentName: string
  tournamentStartDate?: string
  teamName: string
}

function ConfirmStep({ registrationId, tournamentName, tournamentStartDate, teamName }: ConfirmStepProps) {
  const navigate = useNavigate()

  function downloadIcs() {
    const startDate = tournamentStartDate ? new Date(tournamentStartDate) : new Date()
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DiamondHub//EN',
      'BEGIN:VEVENT',
      `DTSTART:${format(startDate, "yyyyMMdd'T'HHmmss")}`,
      `SUMMARY:${tournamentName} - ${teamName}`,
      `DESCRIPTION:Registration ID: ${registrationId}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    const blob = new Blob([icsContent], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tournamentName.replace(/\s+/g, '-')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      <div className="w-20 h-20 rounded-full bg-green-600/20 flex items-center justify-center text-5xl" aria-hidden="true">
        ✅
      </div>
      <div>
        <h2 className="text-white font-bold text-2xl mb-1">Registration Confirmed!</h2>
        <p className="text-gray-400 text-sm">You're registered for {tournamentName}</p>
        <p className="text-gray-500 text-xs mt-2">Team: {teamName}</p>
      </div>

      <div className="w-full bg-gray-900 rounded-xl border border-gray-800 p-4 text-left">
        <p className="text-gray-500 text-xs uppercase tracking-wide font-semibold mb-1">Registration ID</p>
        <p className="text-white font-mono text-sm">{registrationId}</p>
      </div>

      <div className="w-full space-y-3">
        <Button
          variant="secondary"
          onClick={downloadIcs}
          className="w-full"
          size="lg"
        >
          Add to Calendar
        </Button>
        <Button
          onClick={() => navigate('/my-registrations')}
          className="w-full"
          size="lg"
        >
          View My Registrations
        </Button>
      </div>
    </div>
  )
}

// ── Waitlist state ────────────────────────────────────────────────────────────

function WaitlistStep({ position, tournamentName, teamName }: { position: number; tournamentName: string; teamName: string }) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      <div className="w-20 h-20 rounded-full bg-amber-600/20 flex items-center justify-center text-5xl" aria-hidden="true">
        ⏳
      </div>
      <div>
        <h2 className="text-white font-bold text-2xl mb-1">You're on the Waitlist</h2>
        <p className="text-gray-400 text-sm">{tournamentName}</p>
        <p className="text-gray-500 text-xs mt-1">Team: {teamName}</p>
      </div>

      <div className="w-full bg-amber-900/20 border border-amber-800/40 rounded-xl p-4">
        <p className="text-amber-400 font-bold text-3xl">{position}</p>
        <p className="text-amber-400/70 text-sm mt-1">Position in waitlist</p>
      </div>

      <p className="text-gray-400 text-sm max-w-xs">
        We'll notify you by email if a spot opens up. No payment is required until you're confirmed.
      </p>

      <Button onClick={() => navigate('/my-registrations')} className="w-full" size="lg">
        View My Registrations
      </Button>
    </div>
  )
}

// ── Main RegistrationPage ─────────────────────────────────────────────────────

export function RegistrationPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()

  const [state, setState] = useState<RegistrationState>({
    step: 'select',
    teamId: null,
    teamName: null,
    division: null,
    registrationId: null,
    waitlistPosition: null,
    clientSecret: null,
  })

  const { data: tournament, isLoading, isError } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentApi.getById(tournamentId!),
    enabled: !!tournamentId,
    staleTime: 1000 * 60 * 5,
  })

  const startRegistrationMutation = useMutation({
    mutationFn: (data: { tournamentId: string; teamId: string; division: string }) =>
      registrationApi.startRegistration(data),
    onSuccess: (result: { registration: { id: string; status: string; waitlistPosition?: number }; clientSecret?: string | null }) => {
      const reg = result.registration
      if (reg.status === 'WAITLISTED') {
        setState((s) => ({
          ...s,
          step: 'waitlisted',
          registrationId: reg.id,
          waitlistPosition: reg.waitlistPosition ?? 1,
        }))
      } else if (tournament && tournament.entryFee > 0) {
        setState((s) => ({ ...s, step: 'payment', registrationId: reg.id, clientSecret: result.clientSecret ?? null }))
      } else {
        setState((s) => ({ ...s, step: 'confirm', registrationId: reg.id }))
      }
    },
  })

  function handleTeamSelected(teamId: string, teamName: string, division: string) {
    setState((s) => ({ ...s, teamId, teamName, division, step: 'roster' }))
  }

  function handleRosterConfirmed() {
    if (!tournamentId || !state.teamId || !state.division) return
    startRegistrationMutation.mutate({
      tournamentId,
      teamId: state.teamId,
      division: state.division,
    })
  }

  function handlePaymentSuccess() {
    setState((s) => ({ ...s, step: 'confirm' }))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading tournament…</div>
      </div>
    )
  }

  if (isError || !tournament) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-400 text-sm mb-4">Tournament not found.</p>
        <Link to="/tournaments" className="text-blue-400 text-sm hover:underline">
          Back to tournaments
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <Link
          to={`/tournaments/${tournamentId}`}
          className="text-blue-400 text-sm font-medium hover:text-blue-300 min-h-[44px] flex items-center"
        >
          ← Back
        </Link>
        <h1 className="text-white font-bold text-base flex-1 truncate">Register</h1>
      </header>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {/* Step indicator — hide on waitlist/confirm */}
        {state.step !== 'confirm' && state.step !== 'waitlisted' && (
          <StepIndicator current={state.step} />
        )}

        {/* Error banner */}
        {startRegistrationMutation.isError && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800/40 rounded-xl text-red-400 text-sm">
            Failed to start registration. Please try again.
          </div>
        )}

        {/* Steps */}
        {state.step === 'select' && (
          <TeamSelectStep
            tournamentName={tournament.name}
            ageDivisions={tournament.ageDivisions}
            onContinue={handleTeamSelected}
          />
        )}

        {state.step === 'roster' && state.teamId && state.teamName && (
          <RosterStep
            teamId={state.teamId}
            teamName={state.teamName}
            tournamentCutoffDate={tournament.registrationDeadline ?? undefined}
            onConfirm={handleRosterConfirmed}
            onBack={() => setState((s) => ({ ...s, step: 'select' }))}
          />
        )}

        {state.step === 'payment' && state.registrationId && state.teamName && (
          <Elements stripe={stripePromise}>
            <PaymentForm
              tournamentName={tournament.name}
              entryFee={tournament.entryFee}
              teamName={state.teamName}
              registrationId={state.registrationId}
              clientSecret={state.clientSecret}
              onSuccess={handlePaymentSuccess}
              onBack={() => setState((s) => ({ ...s, step: 'roster' }))}
            />
          </Elements>
        )}

        {state.step === 'confirm' && state.registrationId && state.teamName && (
          <ConfirmStep
            registrationId={state.registrationId}
            tournamentName={tournament.name}
            tournamentStartDate={tournament.startDate}
            teamName={state.teamName}
          />
        )}

        {state.step === 'waitlisted' && state.waitlistPosition !== null && state.teamName && (
          <WaitlistStep
            position={state.waitlistPosition}
            tournamentName={tournament.name}
            teamName={state.teamName}
          />
        )}
      </div>
    </div>
  )
}
