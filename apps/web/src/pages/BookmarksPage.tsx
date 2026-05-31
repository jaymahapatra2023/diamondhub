import { useCallback, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { tournamentApi } from '../api/tournament.api.js'
import { TournamentCard } from '../components/tournament/TournamentCard.js'
import { TournamentSkeleton } from '../components/tournament/TournamentSkeleton.js'

function EmptyBookmarks() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-5xl mb-4">☆</div>
      <h2 className="text-white font-bold text-xl mb-2">No bookmarks yet</h2>
      <p className="text-gray-400 text-sm mb-6">
        Star tournaments from the search page to save them here for quick access.
      </p>
      <Link
        to="/tournaments"
        className="inline-flex items-center justify-center h-11 px-6 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-500"
      >
        Find Tournaments
      </Link>
    </div>
  )
}

export function BookmarksPage() {
  const queryClient = useQueryClient()
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tournaments', 'bookmarks'],
    queryFn: () => tournamentApi.getBookmarks(),
    staleTime: 1000 * 60 * 2,
  })

  const unbookmarkMutation = useMutation({
    mutationFn: (id: string) => tournamentApi.unbookmark(id),
    onMutate: (id) => {
      setRemovingIds((prev) => new Set([...prev, id]))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tournaments', 'bookmarks'] })
    },
    onSettled: (_data, _err, id) => {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
  })

  const handleBookmark = useCallback(
    (id: string, bookmarked: boolean) => {
      if (!bookmarked) {
        unbookmarkMutation.mutate(id)
      }
    },
    [unbookmarkMutation],
  )

  const tournaments = data?.tournaments ?? []

  return (
    <div className="bg-gray-950 min-h-full">
      <div className="sticky top-14 z-20 bg-gray-950 border-b border-gray-800 px-4 py-4">
        <h1 className="text-xl font-bold text-white">Bookmarks</h1>
        {tournaments.length > 0 && (
          <p className="text-gray-400 text-sm mt-0.5">
            {tournaments.length} saved tournament{tournaments.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="px-4 py-4">
        {isLoading && <TournamentSkeleton count={3} />}

        {isError && (
          <div className="rounded-2xl bg-red-900/20 border border-red-800 p-4 text-center">
            <p className="text-red-400 text-sm">Failed to load bookmarks. Please try again.</p>
          </div>
        )}

        {!isLoading && !isError && tournaments.length === 0 && <EmptyBookmarks />}

        {!isLoading && !isError && tournaments.length > 0 && (
          <div className="space-y-3">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className={removingIds.has(t.id) ? 'opacity-50 pointer-events-none transition-opacity' : ''}
              >
                <TournamentCard
                  tournament={t}
                  isBookmarked
                  onBookmark={handleBookmark}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
