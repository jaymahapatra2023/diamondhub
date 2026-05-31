// E3: Accept invite via token from URL /join/:token
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { teamApi } from '../api/team.api.js'

type JoinState = 'loading' | 'success' | 'error'

interface JoinResult {
  teamId?: string
  teamName?: string
}

export function JoinTeamPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<JoinState>('loading')
  const [result, setResult] = useState<JoinResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('This invite link is invalid or has expired.')

  useEffect(() => {
    if (!token) {
      setState('error')
      setErrorMsg('No invite token found in this link.')
      return
    }

    let cancelled = false

    teamApi
      .acceptInvite(token)
      .then((data: unknown) => {
        if (cancelled) return
        const d = data as Record<string, unknown> | null | undefined
        setResult({
          ...(d?.teamId !== undefined ? { teamId: d.teamId as string } : {}),
          ...(d?.teamName !== undefined ? { teamName: d.teamName as string } : {}),
        })
        setState('success')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const axiosErr = err as {
          response?: { data?: { message?: string }; status?: number }
        } | null
        const status = axiosErr?.response?.status
        const msg = axiosErr?.response?.data?.message
        if (status === 404 || status === 410) {
          setErrorMsg('This invite link is invalid or has expired.')
        } else if (status === 409) {
          setErrorMsg("You're already a member of this team.")
        } else {
          setErrorMsg(msg ?? 'Something went wrong. Please try again.')
        }
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  // Auto-navigate to team on success
  useEffect(() => {
    if (state === 'success' && result?.teamId) {
      const timer = setTimeout(() => {
        navigate(`/teams/${result.teamId}`, { replace: true })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [state, result, navigate])

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 items-center justify-center px-6">
      {state === 'loading' && (
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <svg
              className="animate-spin h-12 w-12 text-blue-500"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="Joining team…"
              role="status"
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
          </div>
          <h1 className="text-white font-bold text-xl mb-2">Joining team…</h1>
          <p className="text-gray-400 text-sm">Verifying your invite link</p>
        </div>
      )}

      {state === 'success' && (
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-6" aria-hidden="true">
            🎉
          </div>
          <h1 className="text-white font-bold text-2xl mb-2">You're on the team!</h1>
          {result?.teamName && (
            <p className="text-blue-300 font-semibold text-lg mb-4">{result.teamName}</p>
          )}
          <p className="text-gray-400 text-sm mb-8">
            Taking you to your team page…
          </p>
          {result?.teamId && (
            <button
              onClick={() => navigate(`/teams/${result.teamId}`, { replace: true })}
              className="h-12 px-8 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Go to Team
            </button>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-6" aria-hidden="true">
            🚫
          </div>
          <h1 className="text-white font-bold text-xl mb-2">Unable to join</h1>
          <p className="text-gray-400 text-sm mb-8">{errorMsg}</p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/', { replace: true })}
              className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Go to Home
            </button>
            <button
              onClick={() => navigate('/teams')}
              className="w-full h-12 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors"
            >
              My Teams
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
