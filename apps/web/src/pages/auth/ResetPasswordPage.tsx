import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { passwordSchema } from '@diamondhub/contracts'
import { authApi } from '../../api/auth.api.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'

const ResetFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetFormValues = z.infer<typeof ResetFormSchema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const token = searchParams.get('token') ?? ''

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(ResetFormSchema),
  })

  const resetMutation = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      setIsSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    },
  })

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-3">Invalid Link</h1>
          <p className="text-gray-400 text-sm mb-8">
            This password reset link is invalid or missing. Please request a
            new one.
          </p>
          <Link to="/forgot-password">
            <Button className="w-full" size="lg">
              Request New Link
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Password Updated!
          </h1>
          <p className="text-gray-400 text-sm mb-2">
            Your password has been reset successfully.
          </p>
          <p className="text-gray-500 text-xs mb-8">
            Redirecting you to sign in...
          </p>
          <div className="flex gap-1 justify-center">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-blue-600 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🔒</div>
          <h1 className="text-2xl font-bold text-white">Set New Password</h1>
          <p className="text-gray-400 text-sm mt-2">
            Choose a strong password for your account.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((d) =>
            resetMutation.mutate({
              token,
              password: d.password,
              confirmPassword: d.confirmPassword,
            }),
          )}
          className="space-y-4"
          noValidate
        >
          <div className="relative">
            <Input
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              helperText="Min 8 characters, must include a number"
              error={errors.password?.message}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-[38px] text-gray-400 hover:text-white"
              style={{ minHeight: 'auto' }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>

          <div className="relative">
            <Input
              label="Confirm New Password"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-4 top-[38px] text-gray-400 hover:text-white"
              style={{ minHeight: 'auto' }}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? '🙈' : '👁'}
            </button>
          </div>

          {resetMutation.isError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {(resetMutation.error as any)?.response?.status === 400
                ? 'This reset link has expired. Please request a new one.'
                : 'Failed to reset password. Please try again.'}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={resetMutation.isPending}
          >
            Reset Password
          </Button>
        </form>

        <Link
          to="/login"
          className="flex items-center justify-center mt-6 text-gray-400 hover:text-white text-sm gap-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Sign In
        </Link>
      </div>
    </div>
  )
}
