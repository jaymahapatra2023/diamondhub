import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../../api/auth.api.js'
import { useAuthStore } from '../../store/auth.store.js'
import { Button } from '../../components/ui/Button.js'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const { user, setUser } = useAuthStore()
  const token = searchParams.get('token') ?? ''
  const hasVerified = useRef(false)

  const verifyMutation = useMutation({
    mutationFn: () => authApi.verifyEmail(token),
    onSuccess: async () => {
      // Refresh profile to reflect emailVerified = true
      try {
        const updated = await authApi.getMe()
        setUser(updated)
      } catch {
        // Ignore — user still verified
      }
    },
  })

  // Auto-trigger verification on mount
  useEffect(() => {
    if (token && !hasVerified.current) {
      hasVerified.current = true
      verifyMutation.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // No token in URL
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-3">Invalid Link</h1>
          <p className="text-gray-400 text-sm mb-8">
            This verification link is invalid or missing. Please use the link
            from your email.
          </p>
          <Link to={user ? '/' : '/login'}>
            <Button className="w-full" size="lg">
              {user ? 'Go to Dashboard' : 'Sign In'}
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Loading state
  if (verifyMutation.isPending) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4 animate-pulse">✉️</div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Verifying your email...
          </h1>
          <div className="flex gap-1 justify-center mt-6">
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

  // Error state
  if (verifyMutation.isError) {
    const status = (verifyMutation.error as any)?.response?.status
    const isExpired = status === 410 || status === 400

    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Verification Failed
          </h1>
          <p className="text-gray-400 text-sm mb-8">
            {isExpired
              ? 'This verification link has expired. Links are valid for 24 hours.'
              : 'Something went wrong while verifying your email. Please try again.'}
          </p>
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={() => verifyMutation.mutate()}
            >
              Try Again
            </Button>
            <Link to={user ? '/' : '/login'}>
              <Button variant="ghost" className="w-full" size="lg">
                {user ? 'Go to Dashboard' : 'Sign In'}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-white mb-3">Email Verified!</h1>
        <p className="text-gray-400 text-sm mb-2">
          Your email address has been successfully verified.
        </p>
        <p className="text-gray-500 text-sm mb-8">
          You now have full access to DiamondHub.
        </p>
        <Link to={user ? '/' : '/login'}>
          <Button className="w-full" size="lg">
            {user ? 'Go to Dashboard' : 'Sign In'}
          </Button>
        </Link>
      </div>
    </div>
  )
}
