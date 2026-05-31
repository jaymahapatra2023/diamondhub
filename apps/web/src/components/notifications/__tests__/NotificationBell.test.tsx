import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { NotificationBell } from '../NotificationBell.js'
import type { NotificationListResponse } from '@diamondhub/contracts'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../api/notification.api.js', () => ({
  notificationApi: {
    getNotifications: vi.fn(),
    markRead: vi.fn(),
  },
}))

// Mock NotificationPanel to isolate bell tests
vi.mock('../NotificationPanel.js', () => ({
  NotificationPanel: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Notifications">
      <button onClick={onClose}>Close panel</button>
    </div>
  ),
}))

import { notificationApi } from '../../../api/notification.api.js'

const mockGetNotifications = vi.mocked(notificationApi.getNotifications)

// ── Helpers ────────────────────────────────────────────────────────────────

function makeResponse(unreadCount: number): NotificationListResponse {
  return {
    notifications: [],
    unreadCount,
    total: 0,
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  })
}

function renderBell() {
  const queryClient = makeQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Reset ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Default: 0 unread
  mockGetNotifications.mockResolvedValue(makeResponse(0))
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NotificationBell', () => {
  it('renders bell icon button', () => {
    renderBell()
    expect(
      screen.getByRole('button', { name: /notifications/i }),
    ).toBeInTheDocument()
  })

  it('shows unread count badge when count > 0', async () => {
    mockGetNotifications.mockResolvedValue(makeResponse(3))
    renderBell()
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('does not show badge when count is 0', async () => {
    mockGetNotifications.mockResolvedValue(makeResponse(0))
    renderBell()
    // Wait for query to resolve
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalled()
    })
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows "99+" when unread count exceeds 99', async () => {
    mockGetNotifications.mockResolvedValue(makeResponse(150))
    renderBell()
    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument()
    })
  })

  it('shows exactly "99" for count of 99', async () => {
    mockGetNotifications.mockResolvedValue(makeResponse(99))
    renderBell()
    await waitFor(() => {
      expect(screen.getByText('99')).toBeInTheDocument()
    })
  })

  it('clicking bell opens notification panel (on desktop widths)', async () => {
    // jsdom window.innerWidth defaults to 1024, which triggers panel not navigate
    mockGetNotifications.mockResolvedValue(makeResponse(2))
    renderBell()

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(bellButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument()
    })
  })

  it('bell button has aria-expanded=true after opening panel', async () => {
    mockGetNotifications.mockResolvedValue(makeResponse(1))
    renderBell()

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    expect(bellButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(bellButton)

    await waitFor(() => {
      expect(bellButton).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('badge has aria-hidden to keep button label clean', async () => {
    mockGetNotifications.mockResolvedValue(makeResponse(5))
    renderBell()
    await waitFor(() => {
      const badge = screen.getByText('5')
      expect(badge).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
