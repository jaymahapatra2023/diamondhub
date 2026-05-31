import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  UpdateProfileRequestSchema,
  type UpdateProfileRequest,
  type Role,
} from '@diamondhub/contracts'
import { authApi } from '../api/auth.api.js'
import { useAuthStore } from '../store/auth.store.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'

const ROLE_META: Record<Role, { label: string; icon: string; color: string }> = {
  COACH: { label: 'Coach', icon: '🏆', color: 'text-blue-400' },
  PARENT: { label: 'Parent', icon: '👨‍👧', color: 'text-green-400' },
  PLAYER: { label: 'Player', icon: '⚾', color: 'text-yellow-400' },
  GUEST: { label: 'Guest', icon: '👤', color: 'text-gray-400' },
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export function ProfilePage() {
  const queryClient = useQueryClient()
  const { user, setUser, logout, activeRole, setActiveRole } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileRequest>({
    resolver: zodResolver(UpdateProfileRequestSchema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      timezone: user?.timezone ?? 'America/New_York',
    },
  })

  const updateMutation = useMutation({
    mutationFn: authApi.updateMe,
    onSuccess: (updated) => {
      setUser(updated)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      setIsEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      setServerError(null)
    },
    onError: () => {
      setServerError('Failed to update profile. Please try again.')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      logout()
      window.location.replace('/login')
    },
    onError: () => {
      logout()
      window.location.replace('/login')
    },
  })

  const logoutAllMutation = useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: () => {
      logout()
      window.location.replace('/login')
    },
    onError: () => {
      logout()
      window.location.replace('/login')
    },
  })

  const handleCancel = () => {
    reset({
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      timezone: user?.timezone ?? 'America/New_York',
    })
    setIsEditing(false)
    setServerError(null)
  }

  if (!user) return null

  return (
    <div className="px-4 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Profile</h1>
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="text-blue-400"
          >
            Edit
          </Button>
        )}
      </div>

      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0 overflow-hidden">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          ) : (
            user.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-white font-bold text-xl">{user.name}</p>
          <p className="text-gray-400 text-sm">{user.email}</p>
          <div className="mt-1">
            {user.emailVerified ? (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Verified
              </span>
            ) : (
              <span className="text-xs text-yellow-400">⚠ Email not verified</span>
            )}
          </div>
        </div>
      </div>

      {/* Success banner */}
      {saveSuccess && (
        <div
          role="status"
          className="mb-4 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-400 flex items-center gap-2"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Profile updated successfully
        </div>
      )}

      {/* Edit form or read-only info */}
      {isEditing ? (
        <form
          onSubmit={handleSubmit((d) => {
            setServerError(null)
            updateMutation.mutate({
              ...d,
              phone: d.phone?.trim() ? d.phone.trim() : null,
            })
          })}
          className="space-y-4 mb-6"
          noValidate
        >
          <Input
            label="Full Name"
            type="text"
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            placeholder="+14155551234"
            helperText="E.164 format"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <div className="w-full">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Timezone
            </label>
            <select
              className="w-full h-12 px-4 rounded-xl bg-gray-800 text-white border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-base"
              {...register('timezone')}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {serverError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {serverError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="md"
              className="flex-1"
              isLoading={updateMutation.isPending}
              disabled={!isDirty}
            >
              Save Changes
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 mb-6">
          {[
            { label: 'Phone', value: user.phone ?? 'Not set' },
            { label: 'Timezone', value: user.timezone.replace(/_/g, ' ') },
            {
              label: 'Member since',
              value: new Date(user.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
              }),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between bg-gray-900 rounded-xl px-4 py-3 border border-gray-800"
            >
              <span className="text-gray-400 text-sm">{item.label}</span>
              <span className="text-white text-sm font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Roles section */}
      <div className="mb-6">
        <h2 className="text-base font-bold text-white mb-3">My Roles</h2>
        {user.roles.length === 0 ? (
          <p className="text-gray-500 text-sm">No roles assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {user.roles.map((r, idx) => {
              const meta = ROLE_META[r.role]
              const isActive = activeRole?.role === r.role
              return (
                <button
                  key={`${r.role}-${r.teamId ?? idx}`}
                  type="button"
                  onClick={() => setActiveRole({ role: r.role, teamId: r.teamId })}
                  className={clsx(
                    'w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-all text-left',
                    isActive
                      ? 'bg-blue-600/10 border-blue-500/50'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700',
                  )}
                  aria-pressed={isActive}
                  aria-label={`Switch to ${meta.label} role`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{meta.icon}</span>
                    <div>
                      <p
                        className={clsx(
                          'font-semibold text-sm',
                          isActive ? meta.color : 'text-white',
                        )}
                      >
                        {meta.label}
                      </p>
                      {r.isPrimary && (
                        <p className="text-gray-500 text-xs">Primary role</p>
                      )}
                    </div>
                  </div>
                  {isActive && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      Active
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Account / sign out */}
      <div className="border border-gray-800 rounded-2xl p-4">
        <h2 className="text-base font-bold text-white mb-3">Account</h2>
        <div className="space-y-2">
          {!showLogoutConfirm ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => setShowLogoutConfirm(true)}
            >
              Sign Out
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-400 text-sm text-center">
                Are you sure you want to sign out?
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="flex-1"
                  isLoading={logoutMutation.isPending}
                  onClick={() => logoutMutation.mutate()}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-gray-500 text-xs"
            isLoading={logoutAllMutation.isPending}
            onClick={() => logoutAllMutation.mutate()}
          >
            Sign out of all devices
          </Button>
        </div>
      </div>
    </div>
  )
}
