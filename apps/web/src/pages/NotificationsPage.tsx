// E5 · Full notifications page at /notifications
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { NotificationPanel } from '../components/notifications/NotificationPanel.js'

type Filter = 'all' | 'unread'

const FILTER_TABS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
]

export function NotificationsPage() {
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-full bg-gray-950">
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-0">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => void navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0 -ml-1"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-white">Notifications</h1>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1" role="tablist" aria-label="Notification filters">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeFilter === tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${
                activeFilter === tab.id
                  ? 'text-blue-400 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list — re-uses panel in embedded mode */}
      <div className="flex-1">
        <NotificationPanel
          onClose={() => void navigate(-1)}
          embedded={true}
          filterUnread={activeFilter === 'unread'}
        />
      </div>
    </div>
  )
}
