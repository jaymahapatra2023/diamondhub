import { useState, useEffect, useRef, useCallback } from 'react'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store.js'
import { useTournamentStore } from '../store/tournament.store.js'
import { useGeolocation } from '../hooks/useGeolocation.js'
import { tournamentApi } from '../api/tournament.api.js'
import { TournamentCard } from '../components/tournament/TournamentCard.js'
import { TournamentFilters } from '../components/tournament/TournamentFilters.js'
import { TournamentSkeleton } from '../components/tournament/TournamentSkeleton.js'
import { Button } from '../components/ui/Button.js'
import type { TournamentSummary } from '@diamondhub/contracts'

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

// ── Active filter count ───────────────────────────────────────────────────────

function countActiveFilters(filters: { sport?: unknown; ageDivisions: unknown[]; organizers: unknown[]; entryFeeMin?: unknown; entryFeeMax?: unknown; surface?: unknown; radiusMiles: number }): number {
  return (
    (filters.sport ? 1 : 0) +
    filters.ageDivisions.length +
    filters.organizers.length +
    (filters.entryFeeMin !== undefined ? 1 : 0) +
    (filters.entryFeeMax !== undefined ? 1 : 0) +
    (filters.surface ? 1 : 0) +
    (filters.radiusMiles !== 50 ? 1 : 0)
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasLocation }: { hasLocation: boolean }) {
  if (!hasLocation) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-5xl mb-4">📍</div>
        <h3 className="text-white font-bold text-lg mb-2">Where are you looking?</h3>
        <p className="text-gray-400 text-sm">
          Enter a ZIP code or city above, or tap <strong className="text-white">Near Me</strong> to
          find tournaments in your area.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4">🏆</div>
      <h3 className="text-white font-bold text-lg mb-2">No tournaments found</h3>
      <p className="text-gray-400 text-sm mb-4">
        Try expanding your search radius, adjusting filters, or searching a different location.
      </p>
      <ul className="text-gray-500 text-xs space-y-1">
        <li>• Increase the search radius to 100+ miles</li>
        <li>• Clear age division or organizer filters</li>
        <li>• Try a broader date range</li>
      </ul>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TournamentsPage() {
  const activeRole = useAuthStore((s) => s.activeRole)
  const user = useAuthStore((s) => s.user)
  const { filters, sortBy, sortOrder, viewMode, searchLocation, setViewMode, setSearchLocation, setSort } = useTournamentStore()
  const { lat, lng, loading: geoLoading, error: geoError, requestLocation } = useGeolocation()

  const [searchInput, setSearchInput] = useState(searchLocation?.label ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)

  const debouncedSearch = useDebounce(searchInput, 300)
  const queryClient = useQueryClient()

  // Derive query params from filters + location.
  // ZIP searches carry a `zip` (API geocodes server-side); geolocation carries lat/lng.
  const locationParam = searchLocation
    ? (searchLocation.zip
        ? { zip: searchLocation.zip }
        : { lat: searchLocation.lat, lng: searchLocation.lng })
    : {}
  const queryParams = {
    ...locationParam,
    radiusMiles: filters.radiusMiles,
    ...(filters.sport ? { sport: filters.sport } : {}),
    ...(filters.ageDivisions.length ? { ageDivisions: filters.ageDivisions } : {}),
    ...(filters.organizers.length ? { organizers: filters.organizers } : {}),
    ...(filters.entryFeeMin !== undefined ? { entryFeeMin: filters.entryFeeMin } : {}),
    ...(filters.entryFeeMax !== undefined ? { entryFeeMax: filters.entryFeeMax } : {}),
    ...(filters.surface ? { surface: filters.surface } : {}),
    sortBy,
    sortOrder,
    limit: 20,
  }

  const hasLocation = searchLocation !== null

  // Search history for authenticated users
  const { data: searchHistory } = useQuery({
    queryKey: ['search-history'],
    queryFn: tournamentApi.getSearchHistory,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['tournaments', queryParams],
    queryFn: ({ pageParam = 1 }) =>
      tournamentApi.search({ ...queryParams, page: pageParam as number }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: hasLocation,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  const allTournaments: TournamentSummary[] =
    data?.pages.flatMap((p) => p.tournaments) ?? []

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // When geolocation resolves, update store
  useEffect(() => {
    if (lat !== null && lng !== null) {
      setSearchLocation({ lat, lng, label: 'Current Location' })
      setSearchInput('Current Location')
    }
  }, [lat, lng, setSearchLocation])

  // Debounced ZIP/city search — only fires when 5 digits or 3+ chars
  useEffect(() => {
    const trimmed = debouncedSearch.trim()
    if (trimmed.length === 0) return
    const isZip = /^\d{5}$/.test(trimmed)
    const isCity = trimmed.length >= 3 && !/^\d/.test(trimmed)
    if (!isZip && !isCity) return
    // For ZIP we pass it directly; city search would need geocoding (future)
    if (isZip) {
      setSearchLocation({ lat: 0, lng: 0, label: trimmed, zip: trimmed })
    }
  }, [debouncedSearch, setSearchLocation])

  // Bookmark mutations
  const bookmarkMutation = useMutation({
    mutationFn: ({ id, add }: { id: string; add: boolean }) =>
      add ? tournamentApi.bookmark(id) : tournamentApi.unbookmark(id),
    onMutate: ({ id, add }) => {
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        if (add) next.add(id)
        else next.delete(id)
        return next
      })
    },
    onError: (_err, { id, add }) => {
      // Revert optimistic update
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        if (add) next.delete(id)
        else next.add(id)
        return next
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tournaments', 'bookmarks'] })
    },
  })

  const handleBookmark = useCallback(
    (id: string, bookmarked: boolean) => {
      bookmarkMutation.mutate({ id, add: bookmarked })
    },
    [bookmarkMutation],
  )

  const filterCount = countActiveFilters(filters)

  return (
    <div className="flex flex-col min-h-full bg-gray-950">
      {/* ── Sticky header ── */}
      <div className="sticky top-14 z-30 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3 space-y-3">
        <h1 className="text-xl font-bold text-white">Find Tournaments</h1>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-base" aria-hidden>
              🔍
            </span>
            <input
              type="search"
              placeholder="ZIP code or city…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => { if (!searchInput) setShowHistory(true) }}
              onBlur={() => setTimeout(() => setShowHistory(false), 150)}
              className="w-full h-11 pl-9 pr-4 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              aria-label="Search by ZIP code or city"
            />
            {showHistory && searchHistory && (searchHistory as unknown[]).length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-gray-900 border border-gray-700 rounded-xl z-10 mt-1 overflow-hidden">
                <p className="text-xs text-gray-500 px-3 pt-2 pb-1">Recent searches</p>
                {(searchHistory as unknown[]).slice(0, 5).map((s: unknown, i: number) => {
                  const entry = s as { zip?: string; city?: string; state?: string }
                  return (
                    <button
                      key={i}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2 min-h-[44px]"
                      onMouseDown={() => {
                        if (entry.zip) setSearchInput(entry.zip)
                        else if (entry.city) setSearchInput(`${entry.city}, ${entry.state ?? ''}`)
                        setShowHistory(false)
                      }}
                    >
                      <span>🕐</span>
                      <span>{entry.zip || [entry.city, entry.state].filter(Boolean).join(', ') || 'Nearby search'}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <button
            onClick={requestLocation}
            disabled={geoLoading}
            className="h-11 px-3 rounded-xl bg-gray-800 border border-gray-700 text-sm font-semibold text-blue-400 hover:bg-gray-700 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap min-w-[44px]"
            aria-label="Use my current location"
            title="Use current location"
          >
            {geoLoading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <>
                <span aria-hidden>📍</span>
                <span className="hidden sm:inline">Near Me</span>
              </>
            )}
          </button>
        </div>

        {geoError && (
          <p className="text-xs text-amber-400" role="alert">{geoError}</p>
        )}

        {/* Filter + view toggle row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-300 hover:border-gray-600 transition-colors"
            aria-label={`Filters${filterCount > 0 ? `, ${filterCount} active` : ''}`}
          >
            <span aria-hidden>⚙️</span>
            <span>Filters</span>
            {filterCount > 0 && (
              <span className="ml-0.5 h-5 min-w-[1.25rem] px-1 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {filterCount}
              </span>
            )}
          </button>

          {/* Sort control */}
          <div className="flex items-center gap-1">
            <select
              value={sortBy}
              onChange={(e) => setSort(e.target.value as any, sortOrder)}
              className="h-9 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-l-xl px-2 focus:outline-none focus:border-blue-500"
              aria-label="Sort by"
            >
              <option value="date">Date</option>
              <option value="distance">Distance</option>
              <option value="entryFee">Entry Fee</option>
            </select>
            <button
              onClick={() => setSort(sortBy, sortOrder === 'asc' ? 'desc' : 'asc')}
              className="h-9 w-9 bg-gray-800 border border-l-0 border-gray-700 text-gray-300 text-sm rounded-r-xl flex items-center justify-center hover:border-gray-600 transition-colors"
              aria-label={sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <div className="flex ml-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`h-9 w-10 rounded-l-xl border text-sm flex items-center justify-center transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`h-9 w-10 rounded-r-xl border-t border-b border-r text-sm flex items-center justify-center transition-colors ${
                viewMode === 'map'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
              aria-label="Map view"
              aria-pressed={viewMode === 'map'}
            >
              🗺
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 px-4 py-4">
        {/* Map view placeholder — P3: Mapbox loads after initial render */}
        {viewMode === 'map' && (
          <div className="rounded-2xl bg-gray-900 border border-gray-800 h-64 flex items-center justify-center mb-4">
            <div className="text-center">
              <div className="text-3xl mb-2">🗺️</div>
              <p className="text-gray-400 text-sm">Map view coming soon</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && <TournamentSkeleton count={3} />}

        {/* Error state */}
        {isError && (
          <div className="rounded-2xl bg-red-900/20 border border-red-800 p-4 text-center">
            <p className="text-red-400 text-sm">Failed to load tournaments. Please try again.</p>
          </div>
        )}

        {/* Results list */}
        {!isLoading && !isError && (
          <>
            {allTournaments.length > 0 ? (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {data?.pages[0]?.total ?? 0} tournaments found
                  {searchLocation ? ` near ${searchLocation.label}` : ''}
                </p>
                <div className="space-y-3">
                  {allTournaments.map((t) => (
                    <TournamentCard
                      key={t.id}
                      tournament={t}
                      isBookmarked={bookmarkedIds.has(t.id)}
                      onBookmark={handleBookmark}
                    />
                  ))}
                </div>

                {/* Infinite scroll sentinel */}
                <div ref={sentinelRef} className="h-4" />

                {isFetchingNextPage && (
                  <div className="py-4">
                    <TournamentSkeleton count={2} />
                  </div>
                )}

                {!hasNextPage && allTournaments.length > 0 && (
                  <p className="text-center text-gray-600 text-xs py-6">
                    All {allTournaments.length} tournaments loaded
                  </p>
                )}
              </>
            ) : (
              <EmptyState hasLocation={hasLocation} />
            )}
          </>
        )}
      </div>

      {/* ── Filters panel ── */}
      <TournamentFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onApply={() => {
          // TanStack Query will re-run automatically via queryKey change
        }}
      />
    </div>
  )
}
