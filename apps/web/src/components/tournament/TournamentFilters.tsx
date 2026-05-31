/**
 * Slide-up filter panel for tournament search.
 * Reads/writes useTournamentStore.
 */
import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { Sport, Organizer, AgeDivision, Surface } from '@diamondhub/contracts'
import { AGE_DIVISIONS } from '@diamondhub/contracts'
import { useTournamentStore } from '../../store/tournament.store.js'
import { Button } from '../ui/Button.js'

const ORGANIZERS: Array<{ value: Organizer; label: string }> = [
  { value: 'PERFECT_GAME', label: 'Perfect Game' },
  { value: 'USSSA', label: 'USSSA' },
  { value: 'TOP_GUN', label: 'Top Gun' },
  { value: 'SWAT', label: 'SWAT' },
  { value: 'IMPACT', label: 'Impact' },
  { value: 'TRIPLE_CROWN', label: 'Triple Crown' },
  { value: 'TBS', label: 'TBS' },
  { value: 'OTHER', label: 'Other' },
]

const SURFACES: Array<{ value: Surface | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'TURF', label: 'Turf' },
  { value: 'GRASS', label: 'Grass' },
  { value: 'MIXED', label: 'Mixed' },
]

const RADIUS_OPTIONS = [10, 25, 50, 100, 200]

interface Props {
  open: boolean
  onClose: () => void
  onApply: () => void
}

export function TournamentFilters({ open, onClose, onApply }: Props) {
  const { filters, setFilters, resetFilters } = useTournamentStore()
  const panelRef = useRef<HTMLDivElement>(null)

  // Trap focus / close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  function toggleAgeDivision(div: AgeDivision) {
    const next = filters.ageDivisions.includes(div)
      ? filters.ageDivisions.filter(d => d !== div)
      : [...filters.ageDivisions, div]
    setFilters({ ageDivisions: next })
  }

  function toggleOrganizer(org: Organizer) {
    const next = filters.organizers.includes(org)
      ? filters.organizers.filter(o => o !== org)
      : [...filters.organizers, org]
    setFilters({ organizers: next })
  }

  function handleApply() {
    onApply()
    onClose()
  }

  function handleReset() {
    resetFilters()
  }

  const activeCount =
    (filters.sport ? 1 : 0) +
    filters.ageDivisions.length +
    filters.organizers.length +
    (filters.entryFeeMin !== undefined ? 1 : 0) +
    (filters.entryFeeMax !== undefined ? 1 : 0) +
    (filters.surface ? 1 : 0) +
    (filters.radiusMiles !== 50 ? 1 : 0)

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/60 z-40 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tournament filters"
        className={clsx(
          'fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl',
          'transition-transform duration-300 ease-out',
          'max-h-[90dvh] overflow-y-auto',
          'pb-[env(safe-area-inset-bottom)]',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-700 rounded-full" />
        </div>

        <div className="px-4 pb-6">
          {/* Header */}
          <div className="flex items-center justify-between py-3 mb-2">
            <h2 className="text-lg font-bold text-white">
              Filters
              {activeCount > 0 && (
                <span className="ml-2 text-sm font-semibold bg-blue-600 text-white rounded-full px-2 py-0.5">
                  {activeCount}
                </span>
              )}
            </h2>
            <button
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-gray-800 text-gray-400"
              aria-label="Close filters"
            >
              ✕
            </button>
          </div>

          {/* Sport */}
          <section className="mb-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sport</h3>
            <div className="flex gap-2">
              {(['BASEBALL', 'SOFTBALL', 'BOTH'] as Sport[]).map(s => (
                <button
                  key={s}
                  onClick={() => setFilters({ sport: filters.sport === s ? undefined : s } as Parameters<typeof setFilters>[0])}
                  className={clsx(
                    'flex-1 h-11 rounded-xl text-sm font-semibold border transition-colors',
                    filters.sport === s
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600',
                  )}
                >
                  {s === 'BASEBALL' ? 'Baseball' : s === 'SOFTBALL' ? 'Softball' : 'Both'}
                </button>
              ))}
            </div>
          </section>

          {/* Age Divisions */}
          <section className="mb-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Age Divisions</h3>
            <div className="flex flex-wrap gap-2">
              {(AGE_DIVISIONS as readonly AgeDivision[]).map(div => (
                <button
                  key={div}
                  onClick={() => toggleAgeDivision(div)}
                  className={clsx(
                    'px-3 h-9 rounded-full text-xs font-semibold border transition-colors',
                    filters.ageDivisions.includes(div)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600',
                  )}
                >
                  {div}
                </button>
              ))}
            </div>
          </section>

          {/* Organizers */}
          <section className="mb-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Organizer</h3>
            <div className="flex flex-wrap gap-2">
              {ORGANIZERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => toggleOrganizer(value)}
                  className={clsx(
                    'px-3 h-9 rounded-full text-xs font-semibold border transition-colors',
                    filters.organizers.includes(value)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Entry Fee */}
          <section className="mb-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Entry Fee</h3>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Min ($)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  placeholder="0"
                  value={filters.entryFeeMin ?? ''}
                  onChange={e => setFilters({ entryFeeMin: e.target.value === '' ? undefined : Number(e.target.value) } as Parameters<typeof setFilters>[0])}
                  className="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <span className="text-gray-500 mt-5">–</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Max ($)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  placeholder="2000"
                  value={filters.entryFeeMax ?? ''}
                  onChange={e => setFilters({ entryFeeMax: e.target.value === '' ? undefined : Number(e.target.value) } as Parameters<typeof setFilters>[0])}
                  className="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </section>

          {/* Surface */}
          <section className="mb-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Surface</h3>
            <div className="flex gap-2">
              {SURFACES.map(({ value, label }) => (
                <button
                  key={value || 'all'}
                  onClick={() => setFilters({ surface: value === '' ? undefined : (value as Surface) } as Parameters<typeof setFilters>[0])}
                  className={clsx(
                    'flex-1 h-10 rounded-xl text-xs font-semibold border transition-colors',
                    (value === '' ? !filters.surface : filters.surface === value)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Radius */}
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Search Radius
              <span className="ml-2 text-blue-400 normal-case font-bold">{filters.radiusMiles} mi</span>
            </h3>
            <div className="flex gap-2">
              {RADIUS_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setFilters({ radiusMiles: r })}
                  className={clsx(
                    'flex-1 h-10 rounded-xl text-xs font-semibold border transition-colors',
                    filters.radiusMiles === r
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </section>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleReset}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleApply}
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
