import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegisterPage } from '../RegisterPage.js'
import { authApi } from '../../../api/auth.api.js'

// ── Mock auth store ────────────────────────────────────────────────────────────

const mockSetUser = vi.fn()
const mockSetAccessToken = vi.fn()

vi.mock('../../../store/auth.store.js', () => ({
  useAuthStore: () => ({
    setUser: mockSetUser,
    setAccessToken: mockSetAccessToken,
  }),
}))

// ── Mock auth API ──────────────────────────────────────────────────────────────

vi.mock('../../../api/auth.api.js', () => ({
  authApi: {
    register: vi.fn(),
    getMe: vi.fn(),
    googleOAuth: vi.fn(),
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

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  it('renders name, email, password fields', () => {
    renderPage()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
  })

  it('shows validation error for password < 8 chars', async () => {
    renderPage()
    fireEvent.input(screen.getByLabelText(/full name/i), { target: { value: 'Test User' } })
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.input(screen.getByLabelText(/^password$/i), { target: { value: 'short1' } })
    fireEvent.input(screen.getByLabelText(/confirm password/i), { target: { value: 'short1' } })
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!)
    await waitFor(() =>
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument(),
    )
  })

  it('shows validation error for password with no number', async () => {
    renderPage()
    fireEvent.input(screen.getByLabelText(/full name/i), { target: { value: 'Test User' } })
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.input(screen.getByLabelText(/^password$/i), { target: { value: 'passwordonly' } })
    fireEvent.input(screen.getByLabelText(/confirm password/i), { target: { value: 'passwordonly' } })
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!)
    await waitFor(() =>
      expect(screen.getByText(/at least one number/i)).toBeInTheDocument(),
    )
  })

  it('shows error for duplicate email (409)', async () => {
    const err = Object.assign(new Error('Conflict'), { response: { status: 409 } })
    vi.mocked(authApi.register).mockRejectedValue(err)
    renderPage()
    fireEvent.input(screen.getByLabelText(/full name/i), { target: { value: 'Test User' } })
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'existing@example.com' } })
    fireEvent.input(screen.getByLabelText(/^password$/i), { target: { value: 'Password1' } })
    fireEvent.input(screen.getByLabelText(/confirm password/i), { target: { value: 'Password1' } })
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/email already exists/i),
    )
  })

  it('Register button shows loading state', async () => {
    vi.mocked(authApi.register).mockImplementation(() => new Promise(() => {}))
    renderPage()
    fireEvent.input(screen.getByLabelText(/full name/i), { target: { value: 'Test User' } })
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.input(screen.getByLabelText(/^password$/i), { target: { value: 'Password1' } })
    fireEvent.input(screen.getByLabelText(/confirm password/i), { target: { value: 'Password1' } })
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled(),
    )
  })

  it('successful registration calls authApi.register', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User', emailVerified: false },
      accessToken: 'access-token',
      message: 'Registered',
    })
    vi.mocked(authApi.getMe).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      phone: null,
      avatarUrl: null,
      emailVerified: false,
      timezone: 'America/New_York',
      roles: [],
      createdAt: new Date().toISOString(),
    })
    renderPage()
    fireEvent.input(screen.getByLabelText(/full name/i), { target: { value: 'Test User' } })
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.input(screen.getByLabelText(/^password$/i), { target: { value: 'Password1' } })
    fireEvent.input(screen.getByLabelText(/confirm password/i), { target: { value: 'Password1' } })
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!)
    await waitFor(() =>
      expect(vi.mocked(authApi.register)).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com', name: 'Test User' }),
      ),
    )
  })
})
