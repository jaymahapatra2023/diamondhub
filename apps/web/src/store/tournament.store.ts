import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Sport, Organizer, AgeDivision, Surface, SortBy } from '@diamondhub/contracts'

interface TournamentFilters {
  sport?: Sport
  ageDivisions: AgeDivision[]
  organizers: Organizer[]
  entryFeeMin?: number
  entryFeeMax?: number
  surface?: Surface
  radiusMiles: number
}

interface TournamentSearchState {
  filters: TournamentFilters
  sortBy: SortBy
  sortOrder: 'asc' | 'desc'
  viewMode: 'list' | 'map'
  searchLocation: { lat: number; lng: number; label: string; zip?: string } | null
  setFilters: (filters: Partial<TournamentFilters>) => void
  resetFilters: () => void
  setSort: (sortBy: SortBy, sortOrder?: 'asc' | 'desc') => void
  setViewMode: (mode: 'list' | 'map') => void
  setSearchLocation: (loc: { lat: number; lng: number; label: string; zip?: string } | null) => void
}

const DEFAULT_FILTERS: TournamentFilters = {
  ageDivisions: [],
  organizers: [],
  radiusMiles: 50,
}

export const useTournamentStore = create<TournamentSearchState>()(
  persist(
    (set) => ({
      filters: DEFAULT_FILTERS,
      sortBy: 'date',
      sortOrder: 'asc',
      viewMode: 'list',
      searchLocation: null,

      setFilters: (partial) =>
        set((s) => ({ filters: { ...s.filters, ...partial } })),

      resetFilters: () =>
        set({ filters: DEFAULT_FILTERS }),

      setSort: (sortBy, sortOrder) =>
        set((s) => ({ sortBy, sortOrder: sortOrder ?? s.sortOrder })),

      setViewMode: (viewMode) => set({ viewMode }),

      setSearchLocation: (searchLocation) => set({ searchLocation }),
    }),
    {
      name: 'tournament-search',
      partialize: (s) => ({ filters: s.filters, sortBy: s.sortBy, sortOrder: s.sortOrder, viewMode: s.viewMode }),
    },
  ),
)
