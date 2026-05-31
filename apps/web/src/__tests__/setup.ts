import '@testing-library/jest-dom'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// scrollIntoView not in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn()

// jsdom missing APIs required by components
const mockIntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: () => [],
  root: null,
  rootMargin: '',
  thresholds: [],
}))
vi.stubGlobal('IntersectionObserver', mockIntersectionObserver)

// navigator.share not in jsdom
vi.stubGlobal('navigator', {
  ...navigator,
  share: vi.fn().mockResolvedValue(undefined),
  geolocation: { getCurrentPosition: vi.fn() },
  serviceWorker: { ready: Promise.resolve({ pushManager: {} }) },
})

// crypto.randomUUID in jsdom
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
    configurable: true,
  })
}

// Mock react-router navigation
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

// Mock API client
vi.mock('../api/auth.api.js', () => ({
  authApi: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
    googleOAuth: vi.fn(),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    assignRole: vi.fn(),
    logoutAll: vi.fn(),
  },
}))

// Suppress console.error in tests
vi.spyOn(console, 'error').mockImplementation(() => {})
