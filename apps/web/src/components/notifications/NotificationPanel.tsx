// Slide-down notification list panel — mobile-first full-screen overlay
import { useEffect, useRef, useCallback } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { formatDistanceToNow } from 'date-fns'
import { notificationApi } from '../../api/notification.api.js'
import type { NotificationListResponse, NotificationResponse, NotificationType } from '@diamondhub/contracts'

// ── Notification type → icon mapping ─────────────────────────────────────

function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'GAME_TIME_CHANGE':
      return '🕐'
    case 'GAME_CANCELLED':
      return '❌'
    case 'RAIN_DELAY':
      return '🌧'
    case 'BRACKET_UPDATE':
      return '🏆'
    case 'RSVP_REMINDER':
      return '📋'
    case 'NEW_TOURNAMENT':
      return '🔍'
    case 'TEAM_ANNOUNCEMENT':
      return '📢'
    case 'NEW_MESSAGE':
      return '💬'
    case 'FIELDS_CLOSED':
      return '🚫'
    case 'REGISTRATION_CONFIRMED':
      return '✅'
    case 'ROSTER_APPROVED':
      return '📝'
    case 'PAYMENT_DUE':
      return '💳'
    case 'INVITE':
      return '✉️'
    case 'CONFLICT_DETECTED':
      return '⚠️'
    case 'WAITLIST_SPOT_OPEN':
      return '🎟'
    case 'WEATHER_ALERT':
      return '⛈'
    case 'EMAIL_VERIFIED':
      return '✉️'
    case 'ALL_CLEAR':
      return '✅'
    default:
      return '🔔'
  }
}

// ── Navigate to relevant screen from notification data ────────────────────

function getNotificationRoute(notification: NotificationResponse): string | null {
  const data = notification.data as Record<string, unknown>
  switch (notification.type) {
    case 'GAME_TIME_CHANGE':
    case 'GAME_CANCELLED':
    case 'RAIN_DELAY':
    case 'FIELDS_CLOSED':
    case 'WEATHER_ALERT':
    case 'ALL_CLEAR':
      if (typeof data.teamId === 'string') return `/teams/${data.teamId}`
      return '/schedule'
    case 'BRACKET_UPDATE':
    case 'NEW_TOURNAMENT':
    case 'REGISTRATION_CONFIRMED':
      if (typeof data.tournamentId === 'string') return `/tournaments/${data.tournamentId}`
      return '/tournaments'
    case 'RSVP_REMINDER':
      if (typeof data.teamId === 'string' && typeof data.eventId === 'string')
        return `/schedule`
      return '/schedule'
    case 'TEAM_ANNOUNCEMENT':
    case 'ROSTER_APPROVED':
    case 'INVITE':
    case 'CONFLICT_DETECTED':
      if (typeof data.teamId === 'string') return `/teams/${data.teamId}`
      return '/teams'
    case 'NEW_MESSAGE':
      return '/messages'
    case 'PAYMENT_DUE':
      if (typeof data.tournamentId === 'string') return `/tournaments/${data.tournamentId}`
      return '/'
    case 'WAITLIST_SPOT_OPEN':
      if (typeof data.tournamentId === 'string') return `/tournaments/${data.tournamentId}`
      return '/tournaments'
    default:
      return null
  }
}

// ── Single notification row ───────────────────────────────────────────────

interface NotificationRowProps {
  notification: NotificationResponse
  onTap: (notification: NotificationResponse) => void
}

function NotificationRow({ notification, onTap }: NotificationRowProps) {
  const relativeTime = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
  })

  return (
    <button
      type="button"
      onClick={() => onTap(notification)}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-gray-800/60 active:bg-gray-800 border-b border-gray-800/60 last:border-b-0 ${
        notification.isRead ? 'bg-gray-900/40' : 'bg-gray-900'
      }`}
      aria-label={`${notification.title}: ${notification.body}`}
    >
      {/* Icon */}
      <span
        className="text-xl flex-shrink-0 mt-0.5 leading-none"
        aria-hidden="true"
      >
        {getNotificationIcon(notification.type)}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm font-semibold leading-tight truncate ${
              notification.isRead ? 'text-gray-400' : 'text-white'
            }`}
          >
            {notification.title}
          </p>
          <span className="text-xs text-gray-500 flex-shrink-0 mt-0.5">
            {relativeTime}
          </span>
        </div>
        <p
          className={`text-xs mt-0.5 line-clamp-2 ${
            notification.isRead ? 'text-gray-500' : 'text-gray-300'
          }`}
        >
          {notification.body}
        </p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <span
          className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5"
          aria-hidden="true"
        />
      )}
    </button>
  )
}

// ── Main panel component ──────────────────────────────────────────────────

interface NotificationPanelProps {
  onClose: () => void
  /** embedded=true: full-page mode (used by NotificationsPage); false: overlay dropdown */
  embedded?: boolean
  /** When embedded, optionally show only unread */
  filterUnread?: boolean
}

export function NotificationPanel({
  onClose,
  embedded = false,
  filterUnread = false,
}: NotificationPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<NotificationListResponse>({
    queryKey: ['notifications', 'list', { filterUnread }],
    queryFn: ({ pageParam = 1 }) =>
      notificationApi.getNotifications(pageParam as number),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.flatMap((p) => p.notifications).length
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    initialPageParam: 1,
    staleTime: 15_000,
  })

  const allNotifications = data?.pages.flatMap((p) => p.notifications) ?? []
  const displayed = filterUnread
    ? allNotifications.filter((n) => !n.isRead)
    : allNotifications

  const unreadCount = data?.pages[0]?.unreadCount ?? 0

  // Mark-read mutation
  const markReadMutation = useMutation({
    mutationFn: (ids?: string[]) => notificationApi.markRead(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Tap notification → mark as read + navigate
  const handleTap = useCallback(
    (notification: NotificationResponse) => {
      if (!notification.isRead) {
        markReadMutation.mutate([notification.id])
      }
      const route = getNotificationRoute(notification)
      if (route) {
        void navigate(route)
        onClose()
      }
    },
    [markReadMutation, navigate, onClose],
  )

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '150px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Close on Escape (overlay mode only)
  useEffect(() => {
    if (embedded) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [embedded, onClose])

  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-white">Notifications</h2>
          {unreadCount > 0 && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markReadMutation.mutate(undefined)}
              disabled={markReadMutation.isPending}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50 py-1 px-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Mark all read
            </button>
          )}
          {!embedded && (
            <button
              type="button"
              aria-label="Close notifications"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-3 flex items-start gap-3 animate-pulse border-b border-gray-800/60"
              >
                <div className="w-8 h-8 rounded-full bg-gray-800 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-800 rounded w-3/4" />
                  <div className="h-2.5 bg-gray-800 rounded w-full" />
                  <div className="h-2.5 bg-gray-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="px-4 py-8 text-center">
            <p className="text-gray-400 text-sm">
              Failed to load notifications. Pull to retry.
            </p>
          </div>
        )}

        {!isLoading && !isError && displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="text-5xl mb-3" aria-hidden="true">
              🎉
            </span>
            <p className="text-white font-semibold">You&apos;re all caught up!</p>
            <p className="text-gray-500 text-sm mt-1">
              {filterUnread
                ? 'No unread notifications.'
                : 'No notifications yet.'}
            </p>
          </div>
        )}

        {!isLoading &&
          displayed.map((n) => (
            <NotificationRow key={n.id} notification={n} onTap={handleTap} />
          ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-2" />

        {isFetchingNextPage && (
          <div className="py-4 flex items-center justify-center">
            <svg
              className="animate-spin h-5 w-5 text-blue-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        )}

        {!hasNextPage && displayed.length > 0 && (
          <p className="text-center text-gray-600 text-xs py-4">
            All notifications loaded
          </p>
        )}
      </div>
    </>
  )

  // Embedded = full-page (no backdrop)
  if (embedded) {
    return (
      <div className="flex flex-col h-full bg-gray-950">
        {panelContent}
      </div>
    )
  }

  // Overlay dropdown panel (desktop: anchored, mobile handled by NotificationBell)
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        className="fixed right-2 top-16 z-50 w-[min(400px,calc(100vw-1rem))] max-h-[calc(100vh-5rem)] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {panelContent}
      </div>
    </>
  )
}
