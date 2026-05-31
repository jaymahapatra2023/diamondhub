import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { NotificationPanel } from '../NotificationPanel.js'
import type { NotificationListResponse, NotificationResponse } from '@diamondhub/contracts'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../api/notification.api.js', () => ({
  notificationApi: {
    getNotifications: vi.fn(),
    markRead: vi.fn(),
  },
}))

import { notificationApi } from '../../../api/notification.api.js'

const mockGetNotifications = vi.mocked(notificationApi.getNotifications)
const mockMarkRead = vi.mocked(notificationApi.markRead)

// ── Sample data ────────────────────────────────────────────────────────────

function makeNotification(
  overrides: Partial<NotificationResponse> = {},
): NotificationResponse {
  return {
    id: `notif-${Math.random().toString(36).slice(2)}`,
    type: 'TEAM_ANNOUNCEMENT',
    title: 'Practice moved to Saturday',
    body: 'Coach has moved Friday practice to Saturday at 10am',
    data: { teamId: 'team-1' },
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeResponse(
  notifications: NotificationResponse[],
  unreadCount?: number,
): NotificationListResponse {
  return {
    notifications,
    unreadCount: unreadCount ?? notifications.filter((n) => !n.isRead).length,
    total: notifications.length,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPanel(onClose = vi.fn()) {
  const queryClient = makeQueryClient()
  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationPanel onClose={onClose} embedded={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

// ── Reset ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockMarkRead.mockResolvedValue(undefined)
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NotificationPanel', () => {
  it('renders notification items', async () => {
    const notifs = [
      makeNotification({ title: 'Game time changed', type: 'GAME_TIME_CHANGE' }),
      makeNotification({ title: 'Practice cancelled', type: 'GAME_CANCELLED' }),
    ]
    mockGetNotifications.mockResolvedValue(makeResponse(notifs))

    renderPanel()

    await waitFor(() => {
      expect(screen.getByText('Game time changed')).toBeInTheDocument()
      expect(screen.getByText('Practice cancelled')).toBeInTheDocument()
    })
  })

  it('shows correct icon for GAME_TIME_CHANGE', async () => {
    mockGetNotifications.mockResolvedValue(
      makeResponse([makeNotification({ type: 'GAME_TIME_CHANGE', title: 'Time changed' })]),
    )
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Time changed')).toBeInTheDocument()
    })
    // Icon is aria-hidden, check it's rendered via the emoji
    expect(screen.getByText('🕐')).toBeInTheDocument()
  })

  it('shows correct icon for GAME_CANCELLED', async () => {
    mockGetNotifications.mockResolvedValue(
      makeResponse([makeNotification({ type: 'GAME_CANCELLED', title: 'Game off' })]),
    )
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Game off')).toBeInTheDocument()
    })
    expect(screen.getByText('❌')).toBeInTheDocument()
  })

  it('shows correct icon for RAIN_DELAY', async () => {
    mockGetNotifications.mockResolvedValue(
      makeResponse([makeNotification({ type: 'RAIN_DELAY', title: 'Rain delay' })]),
    )
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Rain delay')).toBeInTheDocument()
    })
    expect(screen.getByText('🌧')).toBeInTheDocument()
  })

  it('shows correct icon for BRACKET_UPDATE', async () => {
    mockGetNotifications.mockResolvedValue(
      makeResponse([makeNotification({ type: 'BRACKET_UPDATE', title: 'Bracket updated' })]),
    )
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Bracket updated')).toBeInTheDocument()
    })
    expect(screen.getByText('🏆')).toBeInTheDocument()
  })

  it('shows correct icon for NEW_MESSAGE', async () => {
    mockGetNotifications.mockResolvedValue(
      makeResponse([makeNotification({ type: 'NEW_MESSAGE', title: 'New message' })]),
    )
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('New message')).toBeInTheDocument()
    })
    expect(screen.getByText('💬')).toBeInTheDocument()
  })

  it('shows "Mark all read" button when there are unread notifications', async () => {
    const notifs = [makeNotification({ isRead: false })]
    mockGetNotifications.mockResolvedValue(makeResponse(notifs, 1))

    renderPanel()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument()
    })
  })

  it('does not show "Mark all read" button when all are read', async () => {
    const notifs = [makeNotification({ isRead: true })]
    mockGetNotifications.mockResolvedValue(makeResponse(notifs, 0))

    renderPanel()

    await waitFor(() => {
      // Loaded — no "mark all read" button
      expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument()
    })
  })

  it('clicking "Mark all read" calls markRead with no ids (marks all)', async () => {
    const notifs = [makeNotification({ isRead: false })]
    mockGetNotifications.mockResolvedValue(makeResponse(notifs, 1))

    renderPanel()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }))

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith(undefined)
    })
  })

  it('shows empty state when no notifications', async () => {
    mockGetNotifications.mockResolvedValue(makeResponse([], 0))

    renderPanel()

    await waitFor(() => {
      expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument()
    })
  })

  it('unread notification has white/bright text (read=false visual distinction)', async () => {
    const unread = makeNotification({ isRead: false, title: 'Unread title' })
    mockGetNotifications.mockResolvedValue(makeResponse([unread], 1))

    renderPanel()

    await waitFor(() => {
      const titleEl = screen.getByText('Unread title')
      // Unread items should have text-white class
      expect(titleEl.className).toMatch(/text-white/)
    })
  })

  it('read notification has muted gray text (read=true visual distinction)', async () => {
    const read = makeNotification({ isRead: true, title: 'Read title' })
    mockGetNotifications.mockResolvedValue(makeResponse([read], 0))

    renderPanel()

    await waitFor(() => {
      const titleEl = screen.getByText('Read title')
      // Read items should have text-gray class (muted)
      expect(titleEl.className).toMatch(/text-gray/)
    })
  })

  it('shows loading skeleton while fetching', () => {
    // Never resolves during this test
    mockGetNotifications.mockReturnValue(new Promise(() => {}))

    const { container } = renderPanel()
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders notification body text', async () => {
    const notif = makeNotification({ body: 'Saturday game at 9am' })
    mockGetNotifications.mockResolvedValue(makeResponse([notif]))

    renderPanel()

    await waitFor(() => {
      expect(screen.getByText('Saturday game at 9am')).toBeInTheDocument()
    })
  })
})
