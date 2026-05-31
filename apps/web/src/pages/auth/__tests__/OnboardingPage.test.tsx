import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OnboardingPage } from '../OnboardingPage.js'
import { authApi } from '../../../api/auth.api.js'

// ── Mock auth store ────────────────────────────────────────────────────────────

const mockSetUser = vi.fn()
const mockSetActiveRole = vi.fn()

vi.mock('../../../store/auth.store.js', () => ({
  useAuthStore: () => ({
    setUser: mockSetUser,
    setActiveRole: mockSetActiveRole,
    user: { name: 'Test User' },
  }),
}))

// ── Mock auth API ──────────────────────────────────────────────────────────────

vi.mock('../../../api/auth.api.js', () => ({
  authApi: {
    assignRole: vi.fn(),
    getMe: vi.fn(),
  },
}))

// ── Mock useNavigate ───────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

const MOCK_PROFILE = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  phone: null,
  avatarUrl: null,
  emailVerified: true,
  timezone: 'America/New_York',
  roles: [{ id: 'role-1', role: 'COACH' as const, teamId: null, isPrimary: true }],
  createdAt: new Date().toISOString(),
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('OnboardingPage', () => {
  it('renders 3 role cards (Coach, Parent, Player)', () => {
    renderPage()
    expect(screen.getByLabelText(/select coach role/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/select parent role/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/select player role/i)).toBeInTheDocument()
  })

  it('selecting COACH calls assignRole with COACH', async () => {
    vi.mocked(authApi.assignRole).mockResolvedValue({ message: 'ok' })
    vi.mocked(authApi.getMe).mockResolvedValue(MOCK_PROFILE)
    renderPage()
    fireEvent.click(screen.getByLabelText(/select coach role/i))
    fireEvent.click(screen.getByRole('button', { name: /continue as coach/i }))
    await waitFor(() =>
      expect(vi.mocked(authApi.assignRole)).toHaveBeenCalledWith({ role: 'COACH' }),
    )
  })

  it('selecting PARENT calls assignRole with PARENT', async () => {
    vi.mocked(authApi.assignRole).mockResolvedValue({ message: 'ok' })
    vi.mocked(authApi.getMe).mockResolvedValue({
      ...MOCK_PROFILE,
      roles: [{ id: 'role-1', role: 'PARENT', teamId: null, isPrimary: true }],
    })
    renderPage()
    fireEvent.click(screen.getByLabelText(/select parent role/i))
    fireEvent.click(screen.getByRole('button', { name: /continue as parent/i }))
    await waitFor(() =>
      expect(vi.mocked(authApi.assignRole)).toHaveBeenCalledWith({ role: 'PARENT' }),
    )
  })

  it('after COACH role assigned shows create team next step', async () => {
    vi.mocked(authApi.assignRole).mockResolvedValue({ message: 'ok' })
    vi.mocked(authApi.getMe).mockResolvedValue(MOCK_PROFILE)
    renderPage()
    fireEvent.click(screen.getByLabelText(/select coach role/i))
    fireEvent.click(screen.getByRole('button', { name: /continue as coach/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create team/i })).toBeInTheDocument(),
    )
  })

  it('after PARENT role assigned shows join team next step', async () => {
    vi.mocked(authApi.assignRole).mockResolvedValue({ message: 'ok' })
    vi.mocked(authApi.getMe).mockResolvedValue({
      ...MOCK_PROFILE,
      roles: [{ id: 'role-1', role: 'PARENT', teamId: null, isPrimary: true }],
    })
    renderPage()
    fireEvent.click(screen.getByLabelText(/select parent role/i))
    fireEvent.click(screen.getByRole('button', { name: /continue as parent/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /join team/i })).toBeInTheDocument(),
    )
  })
})
