import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import {
  ForgotPasswordRequestSchema,
  type ForgotPasswordRequest,
} from '@diamondhub/contracts'
import { authApi } from '../../api/auth.api.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'

export function ForgotPasswordPage() {
  const [isSuccess, setIsSuccess] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
  })

  const forgotMutation = useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: (_, variables) => {
      setSubmittedEmail(variables.email)
      setIsSuccess(true)
    },
  })

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-4">📬</div>
          <h1 className="text-2xl font-bold text-white mb-3">Check your email</h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-2">
            We sent a password reset link to
          </p>
          <p className="text-white font-medium mb-6">{submittedEmail}</p>
          <p className="text-gray-500 text-xs leading-relaxed mb-8">
            If you don&apos;t see it in a few minutes, check your spam folder.
            The link expires in 1 hour.
          </p>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            size="lg"
            onClick={() => {
              setIsSuccess(false)
              setSubmittedEmail('')
            }}
          >
            Try a different email
          </Button>

          <Link
            to="/login"
            className="flex items-center justify-center mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🔑</div>
          <h1 className="text-2xl font-bold text-white">Forgot Password?</h1>
          <p className="text-gray-400 text-sm mt-2 leading-relaxed">
            Enter your email and we&apos;ll send you a link to reset your
            password.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((d) => forgotMutation.mutate(d))}
          className="space-y-4"
          noValidate
        >
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="coach@example.com"
            error={errors.email?.message}
            {...register('email')}
          />

          {forgotMutation.isError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              Something went wrong. Please try again.
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={forgotMutation.isPending}
          >
            Send Reset Link
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
