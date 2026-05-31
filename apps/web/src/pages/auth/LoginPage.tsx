import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { LoginRequestSchema, type LoginRequest } from '@diamondhub/contracts'
import { authApi } from '../../api/auth.api.js'
import { useAuthStore } from '../../store/auth.store.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'

export function LoginPage() {
  const navigate = useNavigate()
  const { setUser, setAccessToken } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
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
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
  })

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAccessToken(data.accessToken)
      setUser(data.user as any)
      navigate(data.user.roles.length > 0 ? '/' : '/onboarding', {
        replace: true,
      })
    },
    onError: (error: any) => {
      const status = error?.response?.status
      if (status === 401) setServerError('Invalid email or password')
      else if (status === 429)
        setServerError('Too many attempts. Please wait 15 minutes.')
      else setServerError('Login failed. Please try again.')
    },
  })

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">⚾</div>
          <h1 className="text-2xl font-bold text-white">DiamondHub</h1>
          <p className="text-gray-400 text-sm mt-1">
            Youth Travel Baseball &amp; Softball
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((d) => {
            setServerError(null)
            loginMutation.mutate(d)
          })}
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

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
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

          {serverError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {serverError}
            </div>
          )}

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm text-blue-400 hover:text-blue-300"
              style={{ minHeight: 'auto' }}
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={loginMutation.isPending}
            aria-label="Sign in to DiamondHub"
          >
            Sign In
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
          Sign in with Google
        </Button>

        {/* Register link */}
        <p className="text-center mt-6 text-gray-400 text-sm">
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
