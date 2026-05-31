// E3: Bottom sheet for invite generation
import { useState } from 'react'
import type { InviteRequest } from '@diamondhub/contracts'

type InviteRole = 'PLAYER' | 'PARENT' | 'ASSISTANT_COACH'
type ExpireDays = 3 | 7 | 14 | 30

const ROLE_LABELS: Record<InviteRole, string> = {
  PLAYER: 'Player',
  PARENT: 'Parent',
  ASSISTANT_COACH: 'Assistant Coach',
}

const EXPIRE_OPTIONS: ExpireDays[] = [3, 7, 14, 30]

export interface InviteSheetProps {
  open: boolean
  teamId: string
  onClose: () => void
  onCreateInvite: (teamId: string, data: InviteRequest) => Promise<{ inviteLink: string; expiresAt: string }>
}

export function InviteSheet({ open, teamId, onClose, onCreateInvite }: InviteSheetProps) {
  const [role, setRole] = useState<InviteRole>('PLAYER')
  const [email, setEmail] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<ExpireDays>(7)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setRole('PLAYER')
    setEmail('')
    setExpiresInDays(7)
    setGeneratedLink(null)
    setExpiresAt(null)
    setError(null)
    setCopied(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await onCreateInvite(teamId, {
        role,
        email: email.trim() || undefined,
        expiresInDays,
      })
      setGeneratedLink(data.inviteLink)
      setExpiresAt(data.expiresAt)
    } catch {
      setError('Failed to generate invite. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!generatedLink) return
    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback — select text
    }
  }

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite team member"
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 rounded-t-3xl px-4 pb-safe transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 bg-gray-700 rounded-full" aria-hidden="true" />
        </div>

        <div className="pb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-lg">Invite to Team</h2>
            <button
              onClick={handleClose}
              className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-white rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close invite sheet"
            >
              ✕
            </button>
          </div>

          {!generatedLink ? (
            <div className="space-y-5">
              {/* Role selector */}
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Invite as
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ROLE_LABELS) as InviteRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`h-11 rounded-xl text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        role === r
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                      aria-pressed={role === r}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email (optional) */}
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2" htmlFor="invite-email">
                  Email (optional — sends invite directly)
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="player@example.com"
                  className="w-full h-12 px-4 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Expiry */}
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Link expires in
                </label>
                <div className="flex gap-2">
                  {EXPIRE_OPTIONS.map((days) => (
                    <button
                      key={days}
                      onClick={() => setExpiresInDays(days)}
                      className={`flex-1 h-11 rounded-xl text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        expiresInDays === days
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                      aria-pressed={expiresInDays === days}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-sm" role="alert">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => void handleGenerate()}
                  disabled={isLoading}
                  className="flex-1 h-12 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {isLoading ? 'Generating…' : email.trim() ? 'Send Invite' : 'Generate Link'}
                </button>
              </div>
            </div>
          ) : (
            /* ── Generated link view ── */
            <div className="space-y-5">
              <div className="rounded-xl bg-green-900/20 border border-green-800/40 p-4">
                <p className="text-green-400 text-sm font-semibold mb-1">Invite link created!</p>
                {expiresLabel && (
                  <p className="text-gray-400 text-xs">Expires {expiresLabel}</p>
                )}
              </div>

              {/* Link display */}
              <div className="rounded-xl bg-gray-800 border border-gray-700 p-3 break-all">
                <p className="text-gray-300 text-sm font-mono select-all">{generatedLink}</p>
              </div>

              {/* Copy button */}
              <button
                onClick={() => void handleCopy()}
                className={`w-full h-12 font-semibold rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  copied
                    ? 'bg-green-700 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
                aria-label={copied ? 'Copied to clipboard' : 'Copy invite link'}
              >
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>

              <button
                onClick={reset}
                className="w-full h-11 text-gray-400 text-sm font-semibold hover:text-white transition-colors"
              >
                Create another invite
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
