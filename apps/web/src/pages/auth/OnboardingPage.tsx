import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import clsx from 'clsx'
import type { Role, AssignRoleRequest } from '@diamondhub/contracts'
import { authApi } from '../../api/auth.api.js'
import { useAuthStore } from '../../store/auth.store.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'

interface RoleCard {
  role: Role
  label: string
  icon: string
  description: string
  color: string
  borderColor: string
  bgColor: string
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: 'COACH',
    label: 'Coach',
    icon: '🏆',
    description:
      'Manage your team roster, schedule games, track stats, and communicate with parents.',
    color: 'text-blue-400',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    role: 'PARENT',
    label: 'Parent',
    icon: '👨‍👧',
    description:
      "Track your child's schedule, receive game notifications, and stay connected with the team.",
    color: 'text-green-400',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    role: 'PLAYER',
    label: 'Player',
    icon: '⚾',
    description:
      'View your schedule, track your personal stats, and stay up to date with team events.',
    color: 'text-yellow-400',
    borderColor: 'border-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const { setUser, setActiveRole, user } = useAuthStore()
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [step, setStep] = useState<'select-role' | 'next-steps'>('select-role')
  const [assignedRole, setAssignedRole] = useState<Role | null>(null)
  const [inviteCode, setInviteCode] = useState('')

  const assignRoleMutation = useMutation({
    mutationFn: (data: AssignRoleRequest) => authApi.assignRole(data),
    onSuccess: async () => {
      try {
        const updatedUser = await authApi.getMe()
        setUser(updatedUser)
        const assigned = updatedUser.roles.find(
          (r) => r.role === selectedRole,
        )
        if (assigned) {
          setActiveRole({ role: assigned.role, teamId: assigned.teamId })
        }
      } catch {
        // profile refresh failed — continue to next steps anyway
      }
      setAssignedRole(selectedRole)
      setStep('next-steps')
    },
    onError: () => {
      setServerError('Failed to assign role. Please try again.')
    },
  })

  const handleContinue = () => {
    if (!selectedRole) return
    setServerError(null)
    assignRoleMutation.mutate({ role: selectedRole as 'COACH' | 'PARENT' | 'PLAYER' })
  }

  if (step === 'next-steps') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col px-4 py-8">
        <div className="flex-1 flex flex-col max-w-sm mx-auto w-full">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🎉</div>
            <h1 className="text-2xl font-bold text-white mb-2">You&apos;re all set!</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              {assignedRole === 'COACH' && "Ready to build your team?"}
              {assignedRole === 'PARENT' && "Join your child's team to stay connected."}
              {assignedRole === 'PLAYER' && "Enter your team's invite code to get started."}
            </p>
          </div>

          {assignedRole === 'COACH' && (
            <div className="space-y-3">
              <Button
                type="button"
                className="w-full"
                size="lg"
                onClick={() => navigate('/teams/create')}
              >
                Create Team
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                size="lg"
                onClick={() => navigate('/', { replace: true })}
              >
                Skip for now
              </Button>
            </div>
          )}

          {(assignedRole === 'PARENT' || assignedRole === 'PLAYER') && (
            <div className="space-y-3">
              <Input
                label="Team Invite Code"
                type="text"
                placeholder="Enter invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={!inviteCode.trim()}
                onClick={() => navigate(`/join/${inviteCode.trim()}`)}
              >
                Join Team
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                size="lg"
                onClick={() => navigate('/', { replace: true })}
              >
                Skip for now
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col px-4 py-8">
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚾</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Tell us how you&apos;re involved with travel baseball so we can
            personalize your experience.
          </p>
        </div>

        {/* Role cards */}
        <div className="space-y-3 flex-1">
          {ROLE_CARDS.map((card) => {
            const isSelected = selectedRole === card.role
            return (
              <button
                key={card.role}
                type="button"
                onClick={() => setSelectedRole(card.role)}
                className={clsx(
                  'w-full text-left rounded-2xl border-2 p-4 transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                  isSelected
                    ? `${card.borderColor} ${card.bgColor}`
                    : 'border-gray-700 bg-gray-900 hover:border-gray-600',
                )}
                aria-pressed={isSelected}
                aria-label={`Select ${card.label} role`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl mt-0.5">{card.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          'font-bold text-lg',
                          isSelected ? card.color : 'text-white',
                        )}
                      >
                        {card.label}
                      </span>
                      {isSelected && (
                        <span
                          className={clsx(
                            'text-xs font-semibold px-2 py-0.5 rounded-full',
                            card.bgColor,
                            card.color,
                          )}
                        >
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mt-0.5 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                  {/* Checkmark */}
                  <div
                    className={clsx(
                      'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-all',
                      isSelected
                        ? `${card.borderColor} ${card.bgColor}`
                        : 'border-gray-600',
                    )}
                  >
                    {isSelected && (
                      <svg
                        className={clsx('w-3 h-3', card.color)}
                        fill="currentColor"
                        viewBox="0 0 12 12"
                      >
                        <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {serverError && (
          <div
            role="alert"
            className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {serverError}
          </div>
        )}

        {/* CTA */}
        <div className="mt-6 pb-safe">
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={!selectedRole}
            isLoading={assignRoleMutation.isPending}
            onClick={handleContinue}
          >
            Continue as {selectedRole ? ROLE_CARDS.find((c) => c.role === selectedRole)?.label : '...'}
          </Button>
          <p className="text-center text-gray-500 text-xs mt-3">
            You can add more roles in your profile settings later.
          </p>
        </div>
      </div>
    </div>
  )
}
