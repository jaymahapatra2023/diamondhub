// P1: Mobile-first shell with bottom nav (thumb zone), role-aware tabs
import { Outlet, NavLink, useNavigate } from 'react-router'
import clsx from 'clsx'
import { useAuthStore } from '../../store/auth.store.js'
import { NotificationBell } from '../notifications/NotificationBell.js'

interface NavItem {
  to: string
  label: string
  icon: string
  ariaLabel: string
}

function getNavItems(role: string | undefined): NavItem[] {
  switch (role) {
    case 'COACH':
      return [
        { to: '/', label: 'Home', icon: '🏠', ariaLabel: 'Home' },
        { to: '/teams', label: 'Teams', icon: '⚾', ariaLabel: 'My teams' },
        { to: '/tournaments', label: 'Find', icon: '🔍', ariaLabel: 'Find tournaments' },
        { to: '/schedule', label: 'Schedule', icon: '📅', ariaLabel: 'Schedule' },
        { to: '/analytics', label: 'Stats', icon: '📊', ariaLabel: 'Analytics' },
        { to: '/messages', label: 'Messages', icon: '💬', ariaLabel: 'Messages' },
        { to: '/profile', label: 'Profile', icon: '👤', ariaLabel: 'Profile' },
      ]
    case 'PARENT':
      return [
        { to: '/', label: 'Home', icon: '🏠', ariaLabel: 'Home' },
        { to: '/schedule', label: 'Schedule', icon: '📅', ariaLabel: 'Schedule' },
        { to: '/tournaments', label: 'Find', icon: '🔍', ariaLabel: 'Find tournaments' },
        { to: '/messages', label: 'Messages', icon: '💬', ariaLabel: 'Messages' },
        { to: '/profile', label: 'Profile', icon: '👤', ariaLabel: 'Profile' },
      ]
    case 'PLAYER':
      return [
        { to: '/', label: 'Home', icon: '🏠', ariaLabel: 'Home' },
        { to: '/schedule', label: 'Schedule', icon: '📅', ariaLabel: 'Schedule' },
        { to: '/stats', label: 'Stats', icon: '📊', ariaLabel: 'My stats' },
        { to: '/profile', label: 'Profile', icon: '👤', ariaLabel: 'Profile' },
      ]
    default:
      return [
        { to: '/', label: 'Home', icon: '🏠', ariaLabel: 'Home' },
        { to: '/tournaments', label: 'Find', icon: '🔍', ariaLabel: 'Find tournaments' },
        { to: '/profile', label: 'Profile', icon: '👤', ariaLabel: 'Profile' },
      ]
  }
}

export function AppShell() {
  const activeRole = useAuthStore((s) => s.activeRole)
  const navItems = getNavItems(activeRole?.role)

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Top header bar — notification bell on right */}
      <header className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800/60 h-14 flex items-center justify-end px-3 flex-shrink-0">
        <NotificationBell />
      </header>

      {/* Main content — leave room for fixed bottom nav */}
      <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      {/* Bottom navigation — P1: thumb zone, 44px+ tap targets */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 pb-safe z-50"
        aria-label="Main navigation"
      >
        <div className="flex items-stretch">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-label={item.ariaLabel}
              className={({ isActive }) =>
                clsx(
                  'flex-1 flex flex-col items-center justify-center py-2 min-h-[4rem]',
                  'text-xs font-medium transition-colors',
                  isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300',
                )
              }
            >
              <span className="text-xl leading-none mb-1" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
