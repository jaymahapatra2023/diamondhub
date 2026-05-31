import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ForgotPasswordPage } from '../ForgotPasswordPage.js'
import { authApi } from '../../../api/auth.api.js'

// ── Mock auth API ──────────────────────────────────────────────────────────────

vi.mock('../../../api/auth.api.js', () => ({
  authApi: {
    forgotPassword: vi.fn(),
  },
}))

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
        <ForgotPasswordPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ForgotPasswordPage', () => {
  it('renders email input and submit button', () => {
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('shows validation error for invalid email', async () => {
    renderPage()
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'not-valid' } })
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }).closest('form')!)
    await waitFor(() =>
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument(),
    )
  })

  it('always shows success message after submit (no enumeration)', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ message: 'ok' })
    renderPage()
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'coach@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }).closest('form')!)
    await waitFor(() =>
      expect(screen.getByText(/check your email/i)).toBeInTheDocument(),
    )
  })

  it('submit button shows loading state', async () => {
    vi.mocked(authApi.forgotPassword).mockImplementation(() => new Promise(() => {}))
    renderPage()
    const submitBtn = screen.getByRole('button', { name: /send reset link/i })
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'coach@example.com' } })
    fireEvent.submit(submitBtn.closest('form')!)
    // When loading, button becomes disabled (text replaced by spinner)
    await waitFor(() => expect(submitBtn).toBeDisabled())
  })
})
