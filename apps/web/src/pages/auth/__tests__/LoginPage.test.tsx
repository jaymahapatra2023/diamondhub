import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from '../LoginPage.js'
import { authApi } from '../../../api/auth.api.js'

vi.mock('../../../store/auth.store.js', () => ({
  useAuthStore: () => ({
    setUser: vi.fn(),
    setAccessToken: vi.fn(),
  }),
}))

vi.mock('../../../api/auth.api.js', () => ({
  authApi: {
    login: vi.fn(),
    googleOAuth: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Helper: get password input by placeholder (avoids matching show/hide toggle aria-label)
const getPasswordInput = () => screen.getByPlaceholderText(/••••/i)
// Helper: get the form submit button (uses aria-label="Sign in to DiamondHub")
const getSubmitButton = () => screen.getByRole('button', { name: /sign in to diamondhub/i })

beforeEach(() => { vi.clearAllMocks() })

describe('LoginPage', () => {
  it('renders email, password fields and Sign In button', () => {
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(getPasswordInput()).toBeInTheDocument()
    expect(getSubmitButton()).toBeInTheDocument()
  })

  it('renders Forgot password link', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument()
  })

  it('renders Create account link', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /create one/i })).toBeInTheDocument()
  })

  it('shows validation error for invalid email', async () => {
    renderPage()
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } })
    fireEvent.submit(getSubmitButton().closest('form')!)
    await waitFor(() => expect(screen.getByText(/invalid email/i)).toBeInTheDocument())
  })

  it('shows validation error for missing password', async () => {
    renderPage()
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.submit(getSubmitButton().closest('form')!)
    await waitFor(() => expect(screen.getByText(/password is required/i)).toBeInTheDocument())
  })

  it('Login button shows loading state while pending', async () => {
    vi.mocked(authApi.login).mockImplementation(() => new Promise(() => {}))
    renderPage()
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.input(getPasswordInput(), { target: { value: 'Password1' } })
    fireEvent.submit(getSubmitButton().closest('form')!)
    await waitFor(() => expect(getSubmitButton()).toBeDisabled())
  })

  it('shows server error message on 401', async () => {
    const err = Object.assign(new Error('Unauthorized'), { response: { status: 401 } })
    vi.mocked(authApi.login).mockRejectedValue(err)
    renderPage()
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.input(getPasswordInput(), { target: { value: 'Password1' } })
    fireEvent.submit(getSubmitButton().closest('form')!)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i))
  })

  it('shows locked account message on 429', async () => {
    const err = Object.assign(new Error('Too Many Requests'), { response: { status: 429 } })
    vi.mocked(authApi.login).mockRejectedValue(err)
    renderPage()
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.input(getPasswordInput(), { target: { value: 'Password1' } })
    fireEvent.submit(getSubmitButton().closest('form')!)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/too many attempts/i))
  })
})
