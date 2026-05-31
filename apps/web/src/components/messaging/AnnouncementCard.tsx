// E10 · Announcement card — pinned indicator, coach pin/unpin toggle
import { useState } from 'react'

export interface AnnouncementCardProps {
  id: string
  title: string
  body: string
  authorName: string
  createdAt: string
  isPinned: boolean
  isCoach: boolean
  onPinToggle?: (id: string, pinned: boolean) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function AnnouncementCard({
  id,
  title,
  body,
  authorName,
  createdAt,
  isPinned,
  isCoach,
  onPinToggle,
}: AnnouncementCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isLong = body.length > 160

  return (
    <article
      aria-label={`Announcement: ${title}`}
      className={`rounded-2xl border p-4 transition-colors ${
        isPinned
          ? 'bg-blue-950/40 border-blue-800/60'
          : 'bg-gray-900 border-gray-800'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isPinned && (
            <span
              aria-label="Pinned announcement"
              title="Pinned"
              className="text-base leading-none flex-shrink-0"
            >
              📌
            </span>
          )}
          <h3 className="font-semibold text-white text-[15px] leading-snug truncate">{title}</h3>
        </div>

        {/* Coach pin/unpin button */}
        {isCoach && (
          <button
            type="button"
            aria-label={isPinned ? 'Unpin announcement' : 'Pin announcement'}
            onClick={() => onPinToggle?.(id, !isPinned)}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            {isPinned ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M9.293 2.293a1 1 0 011.414 0l1 1a1 1 0 010 1.414l-1 1A5.001 5.001 0 0115 10v1.586l1.707 1.707A1 1 0 0116 15h-5v3a1 1 0 11-2 0v-3H4a1 1 0 01-.707-1.707L5 11.586V10a5.001 5.001 0 014.293-4.948l-1-1a1 1 0 010-1.414l1-1z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8 1a.75.75 0 01.75.75v1.5h2.5V1.75a.75.75 0 011.5 0v1.5h.25A2.75 2.75 0 0115.75 6v2.75a.75.75 0 01-.22.53l-1.28 1.28V13a.75.75 0 01-.22.53l-1.5 1.5a.75.75 0 01-1.06-1.06L12.94 13V10.31l1.28-1.28A1.25 1.25 0 0014.25 8.75V6A1.25 1.25 0 0013 4.75H7A1.25 1.25 0 005.75 6v2.75a1.25 1.25 0 00.25.75l1.28 1.28V13l1.47 1.47a.75.75 0 11-1.06 1.06l-1.5-1.5A.75.75 0 015.75 13v-2.44L4.47 9.28a.75.75 0 01-.22-.53V6A2.75 2.75 0 017 3.25h.25V1.75A.75.75 0 018 1z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Body */}
      <p className="text-gray-300 text-sm leading-relaxed">
        {isLong && !expanded ? `${body.slice(0, 160)}…` : body}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-blue-400 text-xs mt-1 hover:text-blue-300 transition-colors"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
        <span>{authorName}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={createdAt}>{formatDate(createdAt)}</time>
      </div>
    </article>
  )
}
