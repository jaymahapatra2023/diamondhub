// E6: Public landing page for unauthenticated users
import { Link } from 'react-router'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Nav bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">⚾</span>
          <span className="text-white font-bold text-xl tracking-tight">DiamondHub</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="h-10 px-4 inline-flex items-center justify-center text-sm font-semibold text-gray-300 hover:text-white rounded-xl hover:bg-gray-800 transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="h-10 px-4 inline-flex items-center justify-center text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors"
          >
            Create Account
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="text-6xl mb-6" aria-hidden="true">⚾</div>
        <h1 className="text-white font-extrabold text-4xl leading-tight mb-3 max-w-xs sm:max-w-md">
          Find Youth Baseball Tournaments
        </h1>
        <p className="text-gray-400 text-lg mb-10 max-w-sm">
          DiamondHub connects travel baseball and softball teams with tournaments across the country.
        </p>

        {/* Primary CTA */}
        <Link
          to="/browse"
          className="w-full max-w-xs h-14 inline-flex items-center justify-center text-lg font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-2xl transition-colors mb-4"
        >
          Browse Tournaments
        </Link>

        {/* Secondary CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-sm">
          <Link
            to="/register"
            className="flex-1 h-12 inline-flex items-center justify-center text-base font-semibold text-white bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
          >
            Create Account
          </Link>
          <Link
            to="/login"
            className="flex-1 h-12 inline-flex items-center justify-center text-base font-semibold text-gray-300 hover:text-white bg-transparent border border-gray-700 hover:border-gray-600 rounded-xl transition-colors"
          >
            Sign In
          </Link>
        </div>
      </main>

      {/* Feature highlights */}
      <section className="px-6 pb-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto w-full">
        {[
          { icon: '🔍', title: 'Search & Filter', desc: 'Find tournaments by age division, location, and format' },
          { icon: '📅', title: 'Track Schedule', desc: 'Manage your team calendar and game schedule in one place' },
          { icon: '🏆', title: 'Register Online', desc: 'Register your team and pay entry fees directly through the app' },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="bg-gray-900 rounded-2xl p-5 border border-gray-800 text-center">
            <div className="text-3xl mb-3" aria-hidden="true">{icon}</div>
            <h3 className="text-white font-bold text-sm mb-1">{title}</h3>
            <p className="text-gray-500 text-xs">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
