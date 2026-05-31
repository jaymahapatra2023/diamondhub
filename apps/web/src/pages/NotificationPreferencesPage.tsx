// E5-S8 · Notification Preferences Settings at /settings/notifications
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../store/auth.store.js'
import { notificationApi } from '../api/notification.api.js'
import type {
  NotificationPreferences,
  NotificationType,
  AlertPreference,
  DEFAULT_COACH_PREFS,
} from '@diamondhub/contracts'

// ── Category definitions ──────────────────────────────────────────────────

interface AlertCategory {
  label: string
  icon: string
  types: { type: NotificationType; label: string }[]
}

const CATEGORIES: AlertCategory[] = [
  {
    label: 'Game Updates',
    icon: '⚾',
    types: [
      { type: 'GAME_TIME_CHANGE', label: 'Game Time Change' },
      { type: 'GAME_CANCELLED', label: 'Game Cancelled' },
      { type: 'RAIN_DELAY', label: 'Rain Delay' },
      { type: 'FIELDS_CLOSED', label: 'Fields Closed' },
      { type: 'WEATHER_ALERT', label: 'Weather Alert' },
      { type: 'ALL_CLEAR', label: 'All Clear' },
    ],
  },
  {
    label: 'Tournaments',
    icon: '🏆',
    types: [
      { type: 'NEW_TOURNAMENT', label: 'New Tournament' },
      { type: 'REGISTRATION_CONFIRMED', label: 'Registration Confirmed' },
      { type: 'BRACKET_UPDATE', label: 'Bracket Update' },
      { type: 'WAITLIST_SPOT_OPEN', label: 'Waitlist Spot Open' },
      { type: 'PAYMENT_DUE', label: 'Payment Due' },
    ],
  },
  {
    label: 'Team',
    icon: '👥',
    types: [
      { type: 'RSVP_REMINDER', label: 'RSVP Reminder' },
      { type: 'TEAM_ANNOUNCEMENT', label: 'Team Announcement' },
      { type: 'NEW_MESSAGE', label: 'New Message' },
      { type: 'CONFLICT_DETECTED', label: 'Conflict Detected' },
      { type: 'ROSTER_APPROVED', label: 'Roster Approved' },
      { type: 'INVITE', label: 'Team Invite' },
    ],
  },
]

const DEFAULT_PREF: AlertPreference = { push: true, sms: false, email: false }

// ── Toggle switch component ───────────────────────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}

function Toggle({ checked, onChange, disabled = false, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
        disabled
          ? 'cursor-not-allowed opacity-40 bg-gray-700'
          : checked
          ? 'bg-blue-600 cursor-pointer'
          : 'bg-gray-700 cursor-pointer'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ── Preference row (one alert type, three channel toggles) ────────────────

interface PrefRowProps {
  label: string
  pref: AlertPreference
  hasPhone: boolean
  onChange: (updated: AlertPreference) => void
}

function PrefRow({ label, pref, hasPhone, onChange }: PrefRowProps) {
  return (
    <div className="flex items-center py-3 border-b border-gray-800/60 last:border-b-0 gap-3">
      <span className="flex-1 text-sm text-gray-300 truncate">{label}</span>
      <div className="flex items-center gap-4 flex-shrink-0">
        {/* Push */}
        <div className="flex flex-col items-center gap-1 w-10">
          <Toggle
            checked={pref.push}
            onChange={(v) => onChange({ ...pref, push: v })}
            label={`Push notification for ${label}`}
          />
          <span className="text-[10px] text-gray-500">Push</span>
        </div>

        {/* SMS — disabled if no phone */}
        <div className="flex flex-col items-center gap-1 w-10">
          <Toggle
            checked={pref.sms}
            onChange={(v) => onChange({ ...pref, sms: v })}
            disabled={!hasPhone}
            label={
              hasPhone
                ? `SMS for ${label}`
                : `SMS for ${label} (add phone number to enable)`
            }
          />
          <span
            className={`text-[10px] ${hasPhone ? 'text-gray-500' : 'text-gray-600'}`}
          >
            SMS
          </span>
        </div>

        {/* Email */}
        <div className="flex flex-col items-center gap-1 w-10">
          <Toggle
            checked={pref.email}
            onChange={(v) => onChange({ ...pref, email: v })}
            label={`Email for ${label}`}
          />
          <span className="text-[10px] text-gray-500">Email</span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export function NotificationPreferencesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const hasPhone = Boolean(user?.phone?.trim())

  const { data: prefs, isLoading } = useQuery<NotificationPreferences>({
    queryKey: ['notifications', 'preferences'],
    queryFn: notificationApi.getPreferences,
    staleTime: 60_000,
  })

  // Auto-save on change (optimistic)
  const updateMutation = useMutation({
    mutationFn: notificationApi.updatePreferences,
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', 'preferences'] })
      const previous = queryClient.getQueryData<NotificationPreferences>([
        'notifications',
        'preferences',
      ])
      queryClient.setQueryData(['notifications', 'preferences'], updated)
      return { previous }
    },
    onError: (_err, _updated, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications', 'preferences'], context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] })
    },
  })

  const handleChange = (type: NotificationType, updated: AlertPreference) => {
    const current = prefs ?? {}
    const next: NotificationPreferences = {
      ...current,
      [type]: updated,
    } as NotificationPreferences
    updateMutation.mutate(next)
  }

  const getPref = (type: NotificationType): AlertPreference =>
    (prefs?.[type] as AlertPreference | undefined) ?? DEFAULT_PREF

  return (
    <div className="flex flex-col min-h-full bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => void navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0 -ml-1"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-white">Notification Settings</h1>
        {updateMutation.isPending && (
          <svg
            className="ml-auto animate-spin h-4 w-4 text-blue-400"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
      </div>

      {/* No-phone banner */}
      {!hasPhone && (
        <div className="mx-4 mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-yellow-400 text-lg flex-shrink-0">📱</span>
          <div>
            <p className="text-yellow-300 text-sm font-medium">
              SMS notifications unavailable
            </p>
            <p className="text-yellow-400/80 text-xs mt-0.5">
              Add a phone number to your{' '}
              <button
                type="button"
                className="underline hover:text-yellow-300"
                onClick={() => void navigate('/profile')}
              >
                profile
              </button>{' '}
              to enable SMS alerts.
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="px-4 py-4 space-y-6">
          {Array.from({ length: 3 }).map((_, ci) => (
            <div key={ci} className="animate-pulse">
              <div className="h-5 bg-gray-800 rounded w-36 mb-3" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, ri) => (
                  <div
                    key={ri}
                    className="h-12 bg-gray-800 rounded-xl"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      {!isLoading && (
        <div className="px-4 py-4 pb-24 space-y-6">
          {/* Channel legend */}
          <div className="flex items-center justify-end gap-4 pr-1">
            <span className="text-[11px] text-gray-500 w-10 text-center">Push</span>
            <span className="text-[11px] text-gray-500 w-10 text-center">SMS</span>
            <span className="text-[11px] text-gray-500 w-10 text-center">Email</span>
          </div>

          {CATEGORIES.map((cat) => (
            <section key={cat.label}>
              <h2 className="flex items-center gap-2 text-base font-bold text-white mb-1">
                <span aria-hidden="true">{cat.icon}</span>
                {cat.label}
              </h2>
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                {cat.types.map(({ type, label }) => (
                  <PrefRow
                    key={type}
                    label={label}
                    pref={getPref(type)}
                    hasPhone={hasPhone}
                    onChange={(updated) => handleChange(type, updated)}
                  />
                ))}
              </div>
            </section>
          ))}

          {updateMutation.isError && (
            <p className="text-red-400 text-sm text-center">
              Failed to save preferences. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
