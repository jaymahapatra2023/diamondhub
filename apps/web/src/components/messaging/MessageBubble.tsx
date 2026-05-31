// E10 · Individual message bubble — own messages right/blue, others left/gray
import { useState } from 'react'

export interface MessageBubbleProps {
  messageId: string
  body: string
  senderName: string
  senderInitials: string
  sentAt: string
  isOwn: boolean
  canDelete: boolean
  onDelete?: (messageId: string) => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function MessageBubble({
  messageId,
  body,
  senderName,
  senderInitials,
  sentAt,
  isOwn,
  canDelete,
  onDelete,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className={`flex items-end gap-2 group ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
      data-testid="message-bubble"
      data-own={isOwn}
    >
      {/* Avatar — only for others */}
      {!isOwn && (
        <div
          aria-hidden="true"
          className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0 mb-1"
        >
          {senderInitials}
        </div>
      )}

      <div className={`flex flex-col gap-0.5 max-w-[72%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name + time */}
        {!isOwn && (
          <span className="text-[11px] text-gray-500 px-1">
            {senderName} · {relativeTime(sentAt)}
          </span>
        )}
        {isOwn && (
          <span className="text-[11px] text-gray-500 px-1">{relativeTime(sentAt)}</span>
        )}

        <div className="relative flex items-center gap-1.5">
          {/* Kebab/delete for own or coach messages — shown on hover or tap */}
          {canDelete && (
            <div className={`relative ${isOwn ? 'order-first' : 'order-last'}`}>
              <button
                type="button"
                aria-label="Message options"
                onClick={() => setMenuOpen((o) => !o)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <circle cx="10" cy="4" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="10" cy="16" r="1.5" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  className={`absolute bottom-full mb-1 z-20 bg-gray-800 border border-gray-700 rounded-xl shadow-xl min-w-[120px] py-1 ${
                    isOwn ? 'right-0' : 'left-0'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete?.(messageId)
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bubble */}
          <div
            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
              isOwn
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-800 text-gray-100 rounded-bl-sm'
            }`}
          >
            {body}
          </div>
        </div>
      </div>
    </div>
  )
}
