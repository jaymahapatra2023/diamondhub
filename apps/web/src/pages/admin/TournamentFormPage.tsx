// E12 · Tournament create/edit form — all CreateTournamentSchema fields
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { adminApi } from '../../api/admin.api.js'
import { tournamentApi } from '../../api/tournament.api.js'
import type {
  CreateTournament,
  TournamentFormat,
  Surface,
  Organizer,
  Sport,
  AgeDivision,
} from '@diamondhub/contracts'
import {
  AGE_DIVISIONS,
  OrganizerSchema,
  SportSchema,
  TournamentFormatSchema,
  SurfaceSchema,
} from '@diamondhub/contracts'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORGANIZER_OPTIONS = OrganizerSchema.options
const SPORT_OPTIONS = SportSchema.options
const FORMAT_OPTIONS = TournamentFormatSchema.options
const SURFACE_OPTIONS = SurfaceSchema.options

function labelFor(val: string): string {
  return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Form state ────────────────────────────────────────────────────────────────

function emptyForm(): Omit<CreateTournament, never> {
  return {
    name: '',
    organizer: 'USSSA' as Organizer,
    sport: 'BASEBALL' as Sport,
    ageDivisions: [] as AgeDivision[],
    format: 'POOL_BRACKET' as TournamentFormat,
    startDate: '',
    endDate: '',
    registrationDeadline: undefined,
    locationName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    lat: 0,
    lng: 0,
    entryFee: 0,
    maxTeams: undefined,
    fieldsCount: 1,
    surface: 'GRASS' as Surface,
    hotelDealUrl: undefined,
    registrationUrl: undefined,
    umpireInfo: undefined,
    notes: undefined,
  }
}

// ── Field components ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  children: React.ReactNode
  error?: string | undefined
  required?: boolean | undefined
}

function Field({ label, children, error, required }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

const inputCls =
  'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

const selectCls =
  'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

// ── TournamentFormPage ────────────────────────────────────────────────────────

export function TournamentFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  const [form, setForm] = useState<CreateTournament>(() => emptyForm() as CreateTournament)
  const [errors, setErrors] = useState<Partial<Record<keyof CreateTournament | '_root', string>>>({})

  // ── Load existing tournament for edit ────────────────────────────────────
  const { data: existing } = useQuery({
    queryKey: ['tournament-detail', id],
    queryFn: () => tournamentApi.getById(id!),
    enabled: isEdit,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        name: existing.name,
        organizer: existing.organizer,
        sport: existing.sport,
        ageDivisions: existing.ageDivisions as AgeDivision[],
        format: existing.format,
        startDate: existing.startDate,
        endDate: existing.endDate,
        registrationDeadline: existing.registrationDeadline ?? undefined,
        locationName: '',
        address: existing.address,
        city: existing.city,
        state: existing.state,
        zip: existing.zip,
        lat: existing.lat,
        lng: existing.lng,
        entryFee: existing.entryFee,
        maxTeams: existing.maxTeams ?? undefined,
        fieldsCount: existing.fieldsCount,
        surface: existing.surface,
        hotelDealUrl: existing.hotelDealUrl ?? undefined,
        registrationUrl: existing.registrationUrl ?? undefined,
        umpireInfo: existing.umpireInfo ?? undefined,
        notes: existing.notes ?? undefined,
      })
    }
  }, [existing, isEdit])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: CreateTournament) => adminApi.createTournament(data),
    onSuccess: () => void navigate('/admin/tournaments'),
    onError: (err: any) => {
      setErrors({ _root: err?.response?.data?.message ?? 'Failed to create tournament' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateTournament>) => adminApi.updateTournament(id!, data),
    onSuccess: () => void navigate('/admin/tournaments'),
    onError: (err: any) => {
      setErrors({ _root: err?.response?.data?.message ?? 'Failed to update tournament' })
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  // ── Age division multi-select ─────────────────────────────────────────────
  const toggleAgeDivision = (div: AgeDivision) => {
    setForm((prev) => ({
      ...prev,
      ageDivisions: prev.ageDivisions.includes(div)
        ? prev.ageDivisions.filter((d) => d !== div)
        : [...prev.ageDivisions, div],
    }))
  }

  // ── Geocoding hint ────────────────────────────────────────────────────────
  const [geocoding, setGeocoding] = useState(false)
  const lookupCoords = async () => {
    const addr = `${form.address}, ${form.city}, ${form.state} ${form.zip}`
    if (!addr.trim()) return
    setGeocoding(true)
    try {
      // Use browser Nominatim (OpenStreetMap) — free, no API key
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      const data = await res.json() as Array<{ lat: string; lon: string }>
      if (data[0]) {
        setForm((prev) => ({
          ...prev,
          lat: parseFloat(data[0]!.lat),
          lng: parseFloat(data[0]!.lon),
        }))
      }
    } catch {
      // Silent fail — user can enter coords manually
    } finally {
      setGeocoding(false)
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const newErrors: typeof errors = {}
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.startDate) newErrors.startDate = 'Start date is required'
    if (!form.endDate) newErrors.endDate = 'End date is required'
    if (form.ageDivisions.length === 0) newErrors.ageDivisions = 'Select at least one age division'
    if (!form.address.trim()) newErrors.address = 'Address is required'
    if (!form.city.trim()) newErrors.city = 'City is required'
    if (!form.state.trim()) newErrors.state = 'State is required'
    if (!form.zip.trim()) newErrors.zip = 'ZIP is required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (isEdit) {
      updateMutation.mutate(form)
    } else {
      createMutation.mutate(form)
    }
  }

  const set = <K extends keyof CreateTournament>(key: K, value: CreateTournament[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => void navigate(-1)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors -ml-1"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-white">
          {isEdit ? 'Edit Tournament' : 'New Tournament'}
        </h1>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-5 pb-32 space-y-5">
        {errors._root && (
          <div className="rounded-xl bg-red-900/30 border border-red-800 px-4 py-3 text-red-400 text-sm">
            {errors._root}
          </div>
        )}

        {/* Basic info */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Basic Info</h2>

          <Field label="Tournament Name" required error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Diamond Classic 2026"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sport" required>
              <select value={form.sport} onChange={(e) => set('sport', e.target.value as Sport)} className={selectCls}>
                {SPORT_OPTIONS.map((o) => <option key={o} value={o}>{labelFor(o)}</option>)}
              </select>
            </Field>

            <Field label="Organizer" required>
              <select value={form.organizer} onChange={(e) => set('organizer', e.target.value as Organizer)} className={selectCls}>
                {ORGANIZER_OPTIONS.map((o) => <option key={o} value={o}>{labelFor(o)}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Format" required>
              <select value={form.format} onChange={(e) => set('format', e.target.value as TournamentFormat)} className={selectCls}>
                {FORMAT_OPTIONS.map((o) => <option key={o} value={o}>{labelFor(o)}</option>)}
              </select>
            </Field>

            <Field label="Surface" required>
              <select value={form.surface} onChange={(e) => set('surface', e.target.value as Surface)} className={selectCls}>
                {SURFACE_OPTIONS.map((o) => <option key={o} value={o}>{labelFor(o)}</option>)}
              </select>
            </Field>
          </div>
        </section>

        {/* Age divisions */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Age Divisions</h2>
          {errors.ageDivisions && <p className="text-xs text-red-400">{errors.ageDivisions}</p>}
          <div className="flex flex-wrap gap-2">
            {AGE_DIVISIONS.map((div) => {
              const selected = form.ageDivisions.includes(div)
              return (
                <button
                  key={div}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleAgeDivision(div)}
                  className={`h-8 px-3 rounded-xl text-sm font-semibold transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {div}
                </button>
              )
            })}
          </div>
        </section>

        {/* Dates */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dates</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date" required error={errors.startDate}>
              <input
                type="date"
                value={form.startDate ? form.startDate.slice(0, 10) : ''}
                onChange={(e) => set('startDate', e.target.value ? `${e.target.value}T00:00:00.000Z` : '')}
                className={inputCls}
              />
            </Field>

            <Field label="End Date" required error={errors.endDate}>
              <input
                type="date"
                value={form.endDate ? form.endDate.slice(0, 10) : ''}
                onChange={(e) => set('endDate', e.target.value ? `${e.target.value}T23:59:59.000Z` : '')}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Registration Deadline">
            <input
              type="date"
              value={form.registrationDeadline ? form.registrationDeadline.slice(0, 10) : ''}
              onChange={(e) =>
                set('registrationDeadline', e.target.value ? `${e.target.value}T23:59:59.000Z` : undefined)
              }
              className={inputCls}
            />
          </Field>
        </section>

        {/* Location */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</h2>

          <Field label="Venue / Field Name" required>
            <input
              type="text"
              value={form.locationName}
              onChange={(e) => set('locationName', e.target.value)}
              placeholder="e.g. Big League Dreams"
              className={inputCls}
            />
          </Field>

          <Field label="Street Address" required error={errors.address}>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="123 Main St"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City" required error={errors.city}>
              <input
                type="text"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Nashville"
                className={inputCls}
              />
            </Field>
            <Field label="State (2-letter)" required error={errors.state}>
              <input
                type="text"
                maxLength={2}
                value={form.state}
                onChange={(e) => set('state', e.target.value.toUpperCase())}
                placeholder="TN"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="ZIP Code" required error={errors.zip}>
            <input
              type="text"
              maxLength={5}
              value={form.zip}
              onChange={(e) => set('zip', e.target.value)}
              placeholder="37201"
              className={inputCls}
            />
          </Field>

          {/* Lat/Lng */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input
                type="number"
                step="any"
                value={form.lat || ''}
                onChange={(e) => set('lat', parseFloat(e.target.value) || 0)}
                placeholder="36.162"
                className={inputCls}
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                step="any"
                value={form.lng || ''}
                onChange={(e) => set('lng', parseFloat(e.target.value) || 0)}
                placeholder="-86.781"
                className={inputCls}
              />
            </Field>
          </div>

          <button
            type="button"
            disabled={geocoding}
            onClick={() => void lookupCoords()}
            className="h-10 px-4 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {geocoding ? (
              <>
                <span className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
                Looking up…
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                </svg>
                Look up coordinates
              </>
            )}
          </button>
        </section>

        {/* Fees & capacity */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fees & Capacity</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Entry Fee ($)">
              <input
                type="number"
                min={0}
                step={25}
                value={form.entryFee}
                onChange={(e) => set('entryFee', parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>

            <Field label="Max Teams">
              <input
                type="number"
                min={1}
                step={1}
                value={form.maxTeams ?? ''}
                onChange={(e) => set('maxTeams', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="Unlimited"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Fields Count">
            <input
              type="number"
              min={1}
              step={1}
              value={form.fieldsCount}
              onChange={(e) => set('fieldsCount', parseInt(e.target.value, 10) || 1)}
              className={inputCls}
            />
          </Field>
        </section>

        {/* Links & notes */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Links & Notes</h2>

          <Field label="Registration URL">
            <input
              type="url"
              value={form.registrationUrl ?? ''}
              onChange={(e) => set('registrationUrl', e.target.value || undefined)}
              placeholder="https://…"
              className={inputCls}
            />
          </Field>

          <Field label="Hotel Deal URL">
            <input
              type="url"
              value={form.hotelDealUrl ?? ''}
              onChange={(e) => set('hotelDealUrl', e.target.value || undefined)}
              placeholder="https://…"
              className={inputCls}
            />
          </Field>

          <Field label="Umpire Info">
            <input
              type="text"
              value={form.umpireInfo ?? ''}
              onChange={(e) => set('umpireInfo', e.target.value || undefined)}
              placeholder="e.g. NAUB certified"
              className={inputCls}
            />
          </Field>

          <Field label="Notes">
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || undefined)}
              placeholder="Additional information…"
              className={`${inputCls} resize-none`}
            />
          </Field>
        </section>
      </form>

      {/* ── Sticky submit bar ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-950/95 backdrop-blur-sm border-t border-gray-800 px-4 py-3 pb-safe-bottom">
        <button
          type="submit"
          form=""
          disabled={isPending}
          onClick={handleSubmit}
          className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.99] transition-all"
        >
          {isPending
            ? isEdit ? 'Saving…' : 'Creating…'
            : isEdit ? 'Save Changes' : 'Create Tournament'}
        </button>
      </div>
    </div>
  )
}
