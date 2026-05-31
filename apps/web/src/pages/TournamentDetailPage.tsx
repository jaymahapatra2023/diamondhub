import { useParams, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { tournamentApi } from '../api/tournament.api.js'
import { useAuthStore } from '../store/auth.store.js'
import { Button } from '../components/ui/Button.js'

function getOrCreateGuestToken(): string {
  const key = 'dh_guest_token'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const token = crypto.randomUUID()
  localStorage.setItem(key, token)
  return token
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="animate-pulse px-4 pt-4 pb-8 space-y-4">
      <div className="h-6 w-16 bg-gray-700 rounded-full" />
      <div className="h-8 w-3/4 bg-gray-700 rounded" />
      <div className="h-4 w-32 bg-gray-800 rounded" />
      <div className="h-px bg-gray-800" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-4 bg-gray-800 rounded flex-shrink-0 mt-0.5" />
          <div className="h-4 flex-1 bg-gray-800 rounded" />
        </div>
      ))}
      <div className="h-12 w-full bg-gray-700 rounded-xl mt-6" />
    </div>
  )
}

// ── 404 state ─────────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-5xl mb-4">⚾</div>
      <h2 className="text-white font-bold text-xl mb-2">Tournament not found</h2>
      <p className="text-gray-400 text-sm mb-6">
        This tournament may have been removed or the link is incorrect.
      </p>
      <Link
        to="/tournaments"
        className="inline-flex items-center justify-center h-11 px-6 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-500"
      >
        Back to Search
      </Link>
    </div>
  )
}

// ── Countdown ─────────────────────────────────────────────────────────────

function RegistrationCountdown({ deadline }: { deadline: string }) {
  const date = new Date(deadline)
  if (isPast(date)) {
    return (
      <span className="text-red-400 text-sm font-semibold">Registration closed</span>
    )
  }
  return (
    <span className="text-amber-400 text-sm font-semibold">
      Closes {formatDistanceToNow(date, { addSuffix: true })}
    </span>
  )
}

// ── Info row ─────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-800 last:border-0">
      <span className="text-base flex-shrink-0 mt-0.5" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <div className="text-sm text-gray-200">{value}</div>
      </div>
    </div>
  )
}

const ORGANIZER_LABELS: Record<string, string> = {
  PERFECT_GAME: 'Perfect Game',
  USSSA: 'USSSA',
  TOP_GUN: 'Top Gun',
  SWAT: 'SWAT',
  IMPACT: 'Impact',
  TRIPLE_CROWN: 'Triple Crown',
  TBS: 'TBS',
  OTHER: 'Other',
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400',
  WAITLIST: 'bg-amber-500/20 text-amber-400',
  CLOSED: 'bg-gray-500/20 text-gray-400',
  UPCOMING: 'bg-blue-500/20 text-blue-400',
  ONGOING: 'bg-purple-500/20 text-purple-400',
  COMPLETED: 'bg-gray-500/20 text-gray-500',
  CANCELLED: 'bg-red-500/20 text-red-400',
}

const FORMAT_LABELS: Record<string, string> = {
  POOL_BRACKET: 'Pool + Bracket',
  DOUBLE_ELIM: 'Double Elimination',
  ROUND_ROBIN: 'Round Robin',
  SINGLE_ELIM: 'Single Elimination',
}

// ── Main component ────────────────────────────────────────────────────────

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const activeRole = useAuthStore((s) => s.activeRole)
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const { data: tournament, isLoading, isError, error } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentApi.getById(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    retry: (count, err) => {
      // Don't retry 404s
      const status = (err as { response?: { status?: number } }).response?.status
      if (status === 404) return false
      return count < 2
    },
  })

  const bookmarkMutation = useMutation({
    mutationFn: () =>
      tournament?.isBookmarked
        ? tournamentApi.unbookmark(id!)
        : tournamentApi.bookmark(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tournament', id] })
      void queryClient.invalidateQueries({ queryKey: ['tournaments', 'bookmarks'] })
    },
  })

  const followMutation = useMutation({
    mutationFn: () => {
      const guestToken = user ? undefined : getOrCreateGuestToken()
      return tournament?.isFollowing
        ? tournamentApi.unfollow(id!, guestToken)
        : tournamentApi.follow(id!, guestToken)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tournament', id] })
    },
  })

  async function handleShare() {
    const url = window.location.href
    const title = tournament?.name ?? 'Tournament'
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // User cancelled — ignore
      }
    } else {
      await navigator.clipboard.writeText(url)
      // Would show a toast in production — log for now
    }
  }

  if (isLoading) return <DetailSkeleton />

  const is404 = (error as { response?: { status?: number } } | null)?.response?.status === 404
  if (isError && is404) return <NotFound />

  if (isError) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-red-400 text-sm">Failed to load tournament details. Please try again.</p>
        <Link to="/tournaments" className="text-blue-400 text-sm mt-2 block hover:underline">
          Back to Search
        </Link>
      </div>
    )
  }

  if (!tournament) return null

  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(`${tournament.address}, ${tournament.city}, ${tournament.state} ${tournament.zip}`)}`
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tournament.address}, ${tournament.city}, ${tournament.state}`)}`
  const isCoach = activeRole?.role === 'COACH'

  return (
    <div className="bg-gray-950 min-h-full pb-8">
      {/* ── Back nav ── */}
      <div className="sticky top-14 z-20 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <Link
          to="/tournaments"
          className="flex items-center gap-1.5 text-blue-400 text-sm font-medium hover:text-blue-300 min-h-[44px]"
          aria-label="Back to tournament search"
        >
          ← Back
        </Link>
        <div className="flex-1" />
        {/* Action icons */}
        <button
          onClick={() => followMutation.mutate()}
          disabled={followMutation.isPending}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-gray-800 text-gray-400 transition-colors"
          aria-label={tournament.isFollowing ? 'Unfollow tournament' : 'Follow tournament'}
          aria-pressed={tournament.isFollowing}
          title={tournament.isFollowing ? 'Unfollow' : 'Follow for updates'}
        >
          <span className="text-xl">{tournament.isFollowing ? '🔔' : '🔕'}</span>
        </button>
        <button
          onClick={() => bookmarkMutation.mutate()}
          disabled={bookmarkMutation.isPending}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-gray-800 text-gray-400 transition-colors"
          aria-label={tournament.isBookmarked ? 'Remove bookmark' : 'Bookmark tournament'}
          aria-pressed={tournament.isBookmarked}
        >
          <span className="text-xl">{tournament.isBookmarked ? '⭐' : '☆'}</span>
        </button>
        <button
          onClick={() => void handleShare()}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-gray-800 text-gray-400 transition-colors"
          aria-label="Share tournament"
        >
          <span className="text-xl">⬆️</span>
        </button>
      </div>

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[tournament.status] ?? 'bg-gray-700 text-gray-400'}`}
          >
            {tournament.status}
          </span>
          <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full font-medium">
            {tournament.sport}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white leading-tight">{tournament.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {ORGANIZER_LABELS[tournament.organizer] ?? tournament.organizer}
        </p>
      </div>

      {/* ── Details ── */}
      <div className="px-4 py-2">
        <InfoRow
          icon="📅"
          label="Dates"
          value={`${format(new Date(tournament.startDate), 'MMMM d')} – ${format(new Date(tournament.endDate), 'MMMM d, yyyy')}`}
        />

        <InfoRow
          icon="📍"
          label="Location"
          value={
            <div>
              <p>{tournament.address}</p>
              <p>{tournament.city}, {tournament.state} {tournament.zip}</p>
              <div className="flex gap-3 mt-1">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 text-xs hover:underline"
                >
                  Open in Apple Maps
                </a>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 text-xs hover:underline"
                >
                  Google Maps
                </a>
              </div>
            </div>
          }
        />

        {tournament.registrationDeadline && (
          <InfoRow
            icon="⏰"
            label="Registration Deadline"
            value={
              <div>
                <p>{format(new Date(tournament.registrationDeadline), 'MMMM d, yyyy')}</p>
                <RegistrationCountdown deadline={tournament.registrationDeadline} />
              </div>
            }
          />
        )}

        <InfoRow
          icon="👥"
          label="Age Divisions"
          value={
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {tournament.ageDivisions.map((d) => (
                <span key={d} className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded-full">
                  {d}
                </span>
              ))}
            </div>
          }
        />

        <InfoRow
          icon="🏟️"
          label="Format"
          value={FORMAT_LABELS[tournament.format] ?? tournament.format}
        />

        <InfoRow
          icon="⛳"
          label="Fields"
          value={`${tournament.fieldsCount} field${tournament.fieldsCount !== 1 ? 's' : ''} · ${tournament.surface}`}
        />

        <InfoRow
          icon="💰"
          label="Entry Fee"
          value={
            <div className="flex items-center gap-3">
              <span>{tournament.entryFee === 0 ? 'Free' : `$${tournament.entryFee}`}</span>
              {tournament.spotsRemaining !== null && (
                <span className="text-amber-400 text-xs font-semibold">
                  {tournament.spotsRemaining === 0
                    ? 'Waitlist only'
                    : `${tournament.spotsRemaining} spot${tournament.spotsRemaining !== 1 ? 's' : ''} remaining`}
                </span>
              )}
              {tournament.maxTeams && (
                <span className="text-gray-500 text-xs">
                  {tournament.currentTeams}/{tournament.maxTeams} teams
                </span>
              )}
            </div>
          }
        />

        {tournament.hotelDealUrl && (
          <InfoRow
            icon="🏨"
            label="Hotel Deal"
            value={
              <a
                href={tournament.hotelDealUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                View hotel deals →
              </a>
            }
          />
        )}

        {tournament.umpireInfo && (
          <InfoRow
            icon="👔"
            label="Umpires"
            value={tournament.umpireInfo}
          />
        )}

        {tournament.notes && (
          <InfoRow
            icon="📝"
            label="Notes"
            value={<p className="whitespace-pre-wrap">{tournament.notes}</p>}
          />
        )}
      </div>

      {/* ── Register CTA — P2 ── */}
      <div className="px-4 mt-4">
        {isCoach ? (
          <>
            {tournament.registrationUrl && tournament.status !== 'CLOSED' && tournament.status !== 'COMPLETED' && tournament.status !== 'CANCELLED' && (
              <div>
                <a
                  href={tournament.registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-bold text-base rounded-2xl transition-colors"
                  aria-label={`Register for ${tournament.name}`}
                >
                  Register Your Team
                </a>
                <p className="text-center text-gray-500 text-xs mt-2">
                  Opens registration site in browser
                </p>
              </div>
            )}
            {/* Show waitlist option if full */}
            {tournament.status === 'WAITLIST' && tournament.registrationUrl && (
              <a
                href={tournament.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full h-14 bg-amber-600 hover:bg-amber-500 text-white font-bold text-base rounded-2xl transition-colors"
              >
                Join Waitlist
              </a>
            )}
          </>
        ) : user ? (
          // Logged-in but not a coach
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 text-center">
            <p className="text-gray-400 text-sm">
              Only team coaches can register via DiamondHub.
            </p>
            {tournament.registrationUrl && (
              <a
                href={tournament.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center justify-center h-12 px-6 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-600 min-h-[44px]"
              >
                Register via Organizer →
              </a>
            )}
          </div>
        ) : (
          // Guest — not logged in
          <Link to="/register" className="block">
            <div className="bg-blue-600/10 border border-blue-500/30 rounded-2xl p-4 text-center">
              <p className="text-blue-400 font-medium mb-2">Sign in to register your team</p>
              <span className="inline-flex items-center justify-center h-12 px-6 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-500 min-h-[44px]">
                Sign In / Create Account
              </span>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
