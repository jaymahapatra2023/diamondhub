import { Link } from 'react-router'
import { format } from 'date-fns'
import clsx from 'clsx'
import type { TournamentSummary } from '@diamondhub/contracts'

const ORGANIZER_LABELS: Record<string, string> = {
  PERFECT_GAME: 'Perfect Game',
  USSSA: 'USSSA',
  USA_BASEBALL: 'USA Baseball',
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
}

const CARD_CLASS = 'block bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 active:bg-gray-800/50 transition-colors'

interface Props {
  tournament: TournamentSummary
  isBookmarked?: boolean
  onBookmark?: (id: string, bookmarked: boolean) => void
}

export function TournamentCard({ tournament, isBookmarked, onBookmark }: Props) {
  const distanceMi = tournament.distanceMeters
    ? (tournament.distanceMeters / 1609.344).toFixed(0)
    : null

  const isExternal = tournament.dataSource === 'SCRAPED' && !!tournament.registrationUrl

  const cardInner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={clsx(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                STATUS_STYLES[tournament.status] ?? 'bg-gray-700 text-gray-400',
              )}
            >
              {tournament.status}
            </span>
            {distanceMi && (
              <span className="text-xs text-gray-500">{distanceMi} mi</span>
            )}
          </div>
          <h3 className="text-white font-semibold text-sm leading-tight truncate">
            {tournament.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-gray-400 text-xs">
              {ORGANIZER_LABELS[tournament.organizer] ?? tournament.organizer}
            </p>
            {isExternal && (
              <span className="text-xs px-1.5 py-0 rounded bg-indigo-500/20 text-indigo-400 font-medium">
                External ↗
              </span>
            )}
            {tournament.dataSource === 'MANUAL' && (
              <span className="text-xs px-1.5 py-0 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                DiamondHub
              </span>
            )}
          </div>
        </div>
        {onBookmark && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onBookmark(tournament.id, !isBookmarked)
            }}
            className="p-2 rounded-lg hover:bg-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark tournament'}
            aria-pressed={isBookmarked}
          >
            <span className="text-xl">{isBookmarked ? '⭐' : '☆'}</span>
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span aria-hidden>📅</span>
          <span>
            {format(new Date(tournament.startDate), 'MMM d')}
            {' – '}
            {format(new Date(tournament.endDate), 'MMM d, yyyy')}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span aria-hidden>📍</span>
          <span className="truncate">
            {tournament.city}, {tournament.state}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span aria-hidden>👥</span>
          <span>{tournament.ageDivisions.join(', ')}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span aria-hidden>💰</span>
          <span>{tournament.entryFee === 0 ? 'Free' : `$${tournament.entryFee}`}</span>
          {tournament.spotsRemaining !== null && (
            <span className="ml-1 text-amber-400">
              ({tournament.spotsRemaining} left)
            </span>
          )}
        </div>
      </div>
    </>
  )

  if (isExternal) {
    return (
      <a
        href={tournament.registrationUrl!}
        target="_blank"
        rel="noopener noreferrer"
        className={CARD_CLASS}
      >
        {cardInner}
      </a>
    )
  }

  return (
    <Link to={`/tournaments/${tournament.id}`} className={CARD_CLASS}>
      {cardInner}
    </Link>
  )
}
