import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import {
  RegisterRequestSchema,
  type RegisterRequest,
} from '@diamondhub/contracts'
import { authApi } from '../../api/auth.api.js'
import { useAuthStore } from '../../store/auth.store.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'

// Extend schema to add confirmPassword check client-side
const RegisterFormSchema = RegisterRequestSchema.extend({
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type RegisterFormValues = z.infer<typeof RegisterFormSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const { setUser, setAccessToken } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId || typeof window === 'undefined') return
    const google = (window as any).google
    if (!google?.accounts?.id) return
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential: string }) => {
        try {
          const data = await authApi.googleOAuth({ idToken: response.credential })
          setAccessToken(data.accessToken)
          setUser(data.user as any)
          navigate(data.user.roles.length > 0 ? '/' : '/onboarding', { replace: true })
        } catch {
          setServerError('Google Sign-In failed. Please try again.')
        }
      },
    })
  }, [])

  const handleGoogleSignIn = () => {
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
      (window as any).google.accounts.id.prompt()
    } else {
      setServerError('Google Sign-In requires Google Client ID configuration. Please use email/password login.')
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  })

  const registerMutation = useMutation({
    mutationFn: (data: RegisterRequest) => authApi.register(data),
    onSuccess: (data) => {
      setAccessToken(data.accessToken)
      // Fetch full profile then redirect to onboarding for role selection
      authApi.getMe().then((user) => {
        setUser(user)
        navigate('/onboarding', { replace: true })
      })
    },
    onError: (error: any) => {
      const status = error?.response?.status
      if (status === 409)
        setServerError('An account with this email already exists.')
      else if (status === 422)
        setServerError('Please check your details and try again.')
      else setServerError('Registration failed. Please try again.')
    },
  })

  const onSubmit = (data: RegisterFormValues) => {
    setServerError(null)
    // Strip confirmPassword before sending to API
    const { confirmPassword: _, ...payload } = data
    registerMutation.mutate(payload)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">⚾</div>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="text-gray-400 text-sm mt-1">
            Join DiamondHub to manage your team
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <Input
            label="Full Name"
            type="text"
            autoComplete="name"
            placeholder="Alex Johnson"
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="coach@example.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            placeholder="+14155551234"
            helperText="E.164 format, e.g. +14155551234"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <div className="relative">
            <Input
              label="Password"
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
              label="Confirm Password"
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

          {/* Hidden timezone field — auto-detected */}
          <input type="hidden" {...register('timezone')} />

          {serverError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {serverError}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={registerMutation.isPending}
          >
            Create Account
          </Button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-950 px-3 text-gray-500">or</span>
          </div>
        </div>

        {/* Google OAuth */}
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          size="lg"
          onClick={handleGoogleSignIn}
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign up with Google
        </Button>

        {/* Terms notice */}
        <p className="text-center mt-4 text-gray-500 text-xs">
          By creating an account you agree to our{' '}
          <a href="/terms" className="text-blue-400 hover:text-blue-300">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="text-blue-400 hover:text-blue-300">
            Privacy Policy
          </a>
        </p>

        {/* Login link */}
        <p className="text-center mt-4 text-gray-400 text-sm">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
