// P1: Bell icon in header with unread count badge
// P3: Polling fallback (30s), socket.io progressive enhancement
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { io, type Socket } from 'socket.io-client'
import { notificationApi } from '../../api/notification.api.js'
import { NotificationPanel } from './NotificationPanel.js'
import type { NotificationListResponse } from '@diamondhub/contracts'

// ── Socket.io live update (P3 progressive enhancement) ────────────────────

function useNotificationSocket(onUpdate: () => void) {
  useEffect(() => {
    let socket: Socket | null = null
    try {
      socket = io('/', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        reconnectionDelay: 5000,
      })

      socket.on('notification:new', onUpdate)
      socket.on('notification:read', onUpdate)
    } catch {
      // Socket.io unavailable — polling covers us
    }

    return () => {
      socket?.disconnect()
    }
  }, [onUpdate])
}

// ── Bell component ─────────────────────────────────────────────────────────

interface NotificationBellProps {
  className?: string
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery<NotificationListResponse>({
    queryKey: ['notifications', 'summary'],
    queryFn: () => notificationApi.getNotifications(1),
    refetchInterval: 30_000, // P3: polling fallback every 30s
    staleTime: 20_000,
  })

  const unreadCount = data?.unreadCount ?? 0

  // P3: Socket.io progressive enhancement — invalidates query on live push
  useNotificationSocket(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  const badgeLabel =
    unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null

  const handleBellClick = () => {
    if (window.innerWidth <= 640) {
      void navigate('/notifications')
    } else {
      setPanelOpen((prev) => !prev)
    }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${badgeLabel} unread`
            : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={handleBellClick}
        className="relative flex items-center justify-center w-11 h-11 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {badgeLabel && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {panelOpen && (
        <NotificationPanel
          onClose={() => setPanelOpen(false)}
          embedded={false}
        />
      )}
    </div>
  )
}
