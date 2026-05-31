// E13 · Native — Zustand auth store (mirrors web store interface)
import { create } from 'zustand'

interface ActiveRole {
  role: string
  teamId?: string
}

interface User {
  id: string
  name: string
  email: string
}

interface AuthState {
  user: User | null
  activeRole: ActiveRole | null
  accessToken: string | null
  setUser: (user: User | null) => void
  setActiveRole: (role: ActiveRole | null) => void
  setAccessToken: (token: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeRole: null,
  accessToken: null,
  setUser: (user) => set({ user }),
  setActiveRole: (activeRole) => set({ activeRole }),
  setAccessToken: (accessToken) => set({ accessToken }),
  logout: () => set({ user: null, activeRole: null, accessToken: null }),
}))
