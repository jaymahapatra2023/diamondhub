// Public chrome for unauthenticated routes (e.g. /browse).
// Mirrors AppShell's top bar: brand on the left, auth CTAs on the right.
import { NavLink, Outlet } from 'react-router'

export function PublicShell() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      <header className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800/60 h-14 flex items-center justify-between px-4 flex-shrink-0">
        <NavLink to="/" className="flex items-center gap-2" aria-label="DiamondHub home">
          <span className="text-xl leading-none" aria-hidden="true">⚾</span>
          <span className="text-lg font-bold text-white tracking-tight">DiamondHub</span>
        </NavLink>
        <div className="flex items-center gap-2">
          <NavLink
            to="/login"
            className="text-sm font-semibold text-gray-300 hover:text-white px-3 py-2 rounded-lg"
          >
            Sign In
          </NavLink>
          <NavLink
            to="/register"
            className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg"
          >
            Sign Up
          </NavLink>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
