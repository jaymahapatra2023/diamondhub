// P8: Access token in memory ONLY — never localStorage or sessionStorage
// Refresh token is in httpOnly cookie — never accessible to JS
import { create } from 'zustand'
import type { UserProfile, Role } from '@diamondhub/contracts'

interface ActiveRole {
  role: Role
  teamId: string | null
}

interface AuthState {
  user: UserProfile | null
  accessToken: string | null
  isLoading: boolean
  isInitialized: boolean
  activeRole: ActiveRole | null

  setUser: (user: UserProfile) => void
  setAccessToken: (token: string) => void
  setActiveRole: (role: ActiveRole) => void
  logout: () => void
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isInitialized: false,
  activeRole: null,

  setUser: (user) => {
    const primaryRole = user.roles.find((r) => r.isPrimary)
    set({
      user,
      activeRole: primaryRole
        ? { role: primaryRole.role, teamId: primaryRole.teamId }
        : get().activeRole,
    })
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  setActiveRole: (activeRole) => set({ activeRole }),

  logout: () =>
    set({ user: null, accessToken: null, activeRole: null, isLoading: false }),

  initialize: async () => {
    if (get().isInitialized) return
    set({ isLoading: true })
    try {
      const { authApi } = await import('../api/auth.api.js')
      const { initApiClient } = await import('../api/client.js')

      initApiClient(
        () => get().accessToken,
        (t) => get().setAccessToken(t),
        () => get().logout(),
      )

      const { accessToken } = await authApi.refresh()
      set({ accessToken })
      const user = await authApi.getMe()
      get().setUser(user)
    } catch {
      // No valid session — that's fine
    } finally {
      set({ isLoading: false, isInitialized: true })
    }
  },
}))
