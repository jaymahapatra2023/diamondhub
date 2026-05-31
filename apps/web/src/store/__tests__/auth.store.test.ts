import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAuthStore } from '../auth.store.js'
import type { UserProfile } from '@diamondhub/contracts'

const mockUser: UserProfile = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'coach@example.com',
  name: 'John Coach',
  phone: null,
  avatarUrl: null,
  emailVerified: true,
  timezone: 'America/New_York',
  createdAt: new Date().toISOString(),
  roles: [{ id: 'r1', role: 'COACH', teamId: null, isPrimary: true }],
}

const mockParentUser: UserProfile = {
  ...mockUser,
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'parent@example.com',
  name: 'Jane Parent',
  roles: [
    { id: 'r1', role: 'PARENT', teamId: 'team-1', isPrimary: true },
    { id: 'r2', role: 'COACH', teamId: 'team-2', isPrimary: false },
  ],
}

describe('auth.store', () => {
  beforeEach(() => {
    // Reset store to clean state
    const { result } = renderHook(() => useAuthStore())
    act(() => result.current.logout())
  })

  describe('setUser', () => {
    it('sets user and derives activeRole from primary role', () => {
      const { result } = renderHook(() => useAuthStore())
      act(() => result.current.setUser(mockUser))

      expect(result.current.user).toEqual(mockUser)
      expect(result.current.activeRole).toEqual({ role: 'COACH', teamId: null })
    })

    it('derives activeRole from first primary role when multiple roles', () => {
      const { result } = renderHook(() => useAuthStore())
      act(() => result.current.setUser(mockParentUser))

      expect(result.current.activeRole).toEqual({ role: 'PARENT', teamId: 'team-1' })
    })

    it('keeps current activeRole when user has no roles', () => {
      const { result } = renderHook(() => useAuthStore())
      // First set an active role manually
      act(() => result.current.setActiveRole({ role: 'COACH', teamId: null }))
      // Then set a user with no roles
      act(() => result.current.setUser({ ...mockUser, roles: [] }))

      // activeRole should not change (no new primary to override with)
      expect(result.current.activeRole).toEqual({ role: 'COACH', teamId: null })
    })
  })

  describe('setAccessToken', () => {
    it('updates access token in memory', () => {
      const { result } = renderHook(() => useAuthStore())
      act(() => result.current.setAccessToken('my-access-token-123'))
      expect(result.current.accessToken).toBe('my-access-token-123')
    })

    it('access token is never written to localStorage (P8)', () => {
      const { result } = renderHook(() => useAuthStore())
      act(() => result.current.setAccessToken('sensitive-token'))

      // Should not appear in localStorage
      const storedKeys = Object.keys(localStorage)
      const anyTokenStored = storedKeys.some((k) => localStorage.getItem(k)?.includes('sensitive-token'))
      expect(anyTokenStored).toBe(false)
    })
  })

  describe('setActiveRole', () => {
    it('overrides active role', () => {
      const { result } = renderHook(() => useAuthStore())
      act(() => result.current.setUser(mockParentUser))
      // Switch from PARENT to COACH
      act(() => result.current.setActiveRole({ role: 'COACH', teamId: 'team-2' }))
      expect(result.current.activeRole).toEqual({ role: 'COACH', teamId: 'team-2' })
    })
  })

  describe('logout', () => {
    it('clears user, token, and active role', () => {
      const { result } = renderHook(() => useAuthStore())
      act(() => {
        result.current.setUser(mockUser)
        result.current.setAccessToken('some-token')
      })

      act(() => result.current.logout())

      expect(result.current.user).toBeNull()
      expect(result.current.accessToken).toBeNull()
      expect(result.current.activeRole).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('initial state', () => {
    it('starts with null user and token', () => {
      const { result } = renderHook(() => useAuthStore())
      act(() => result.current.logout()) // ensure clean

      expect(result.current.user).toBeNull()
      expect(result.current.accessToken).toBeNull()
      expect(result.current.activeRole).toBeNull()
    })
  })
})
