/**
 * Loading skeleton — matches TournamentCard layout.
 * Renders 3 placeholder cards by default.
 */
interface Props {
  count?: number
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 animate-pulse">
      {/* Top row: status badge + distance + bookmark */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-5 w-16 bg-gray-700 rounded-full" />
            <div className="h-4 w-10 bg-gray-800 rounded-full" />
          </div>
          {/* Name */}
          <div className="h-4 w-3/4 bg-gray-700 rounded mb-1.5" />
          {/* Organizer */}
          <div className="h-3 w-24 bg-gray-800 rounded" />
        </div>
        {/* Bookmark icon */}
        <div className="h-11 w-11 bg-gray-800 rounded-lg flex-shrink-0" />
      </div>

      {/* Grid info row */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="h-3 w-28 bg-gray-800 rounded" />
        <div className="h-3 w-20 bg-gray-800 rounded" />
        <div className="h-3 w-16 bg-gray-800 rounded" />
        <div className="h-3 w-14 bg-gray-800 rounded" />
      </div>
    </div>
  )
}

export function TournamentSkeleton({ count = 3 }: Props) {
  return (
    <div className="space-y-3" aria-label="Loading tournaments" role="status">
      <span className="sr-only">Loading tournaments…</span>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
