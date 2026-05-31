import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { useAuthStore } from './store/auth.store.js'
import { LoadingScreen } from './components/ui/LoadingScreen.js'
import { AppShell } from './components/layout/AppShell.js'
import { PublicShell } from './components/layout/PublicShell.js'
import { LoginPage } from './pages/auth/LoginPage.js'
import { RegisterPage } from './pages/auth/RegisterPage.js'
import { OnboardingPage } from './pages/auth/OnboardingPage.js'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.js'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.js'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.js'
import { HomePage } from './pages/HomePage.js'
import { ProfilePage } from './pages/ProfilePage.js'
import { TournamentsPage } from './pages/TournamentsPage.js'
import { TournamentDetailPage } from './pages/TournamentDetailPage.js'
import { BookmarksPage } from './pages/BookmarksPage.js'
import { TeamsPage } from './pages/TeamsPage.js'
import { TeamDetailPage } from './pages/TeamDetailPage.js'
import { CreateTeamPage } from './pages/CreateTeamPage.js'
import { JoinTeamPage } from './pages/JoinTeamPage.js'
import { SchedulePage } from './pages/SchedulePage.js'
import { NotificationsPage } from './pages/NotificationsPage.js'
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage.js'
// E6: Guest & Public Access
import { LandingPage } from './pages/LandingPage.js'
import { LiveScorePage } from './pages/LiveScorePage.js'
// E7: Registration & Payments
import { RegistrationPage } from './pages/RegistrationPage.js'
import { MyRegistrationsPage } from './pages/MyRegistrationsPage.js'
// E10: Messaging
import { MessagesPage } from './pages/MessagesPage.js'
// E11: Player Stats & Team Record
import { PlayerStatsPage } from './pages/PlayerStatsPage.js'
import { TeamRecordPage } from './pages/TeamRecordPage.js'
// E12: Admin Tournament Management
import { AdminTournamentPage } from './pages/admin/AdminTournamentPage.js'
import { TournamentFormPage } from './pages/admin/TournamentFormPage.js'
// E6: Bracket view (public)
import { BracketPage } from './pages/BracketPage.js'
// Analytics & Organization
import { AnalyticsPage } from './pages/AnalyticsPage.js'
import { OrganizationPage } from './pages/OrganizationPage.js'

/** Guards non-index authenticated routes — redirects guests to /login */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (user.roles.length === 0) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (user && user.roles.length > 0) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * E6: Root "/" index — LandingPage for guests, HomePage for authenticated users.
 * Rendered inside AppShell (provides the nav chrome for logged-in users).
 * Guests see a standalone LandingPage (AppShell is bypassed via the guest check
 * in AppShellOrLanding which renders without the shell layout).
 */
function AppShellOrLanding() {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  // Guest: show public landing page — no AppShell chrome
  if (!user) return <LandingPage />
  // Needs onboarding
  if (user.roles.length === 0) return <Navigate to="/onboarding" replace />
  // Authenticated: render AppShell layout (with Outlet for child routes)
  return <AppShell />
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <Routes>
      {/* E6: Public tournament browse — no auth required, wrapped in public chrome */}
      <Route element={<PublicShell />}>
        <Route path="/browse" element={<TournamentsPage />} />
        <Route path="/browse/:id" element={<TournamentDetailPage />} />
      </Route>

      {/* E6-S3: Public live score view — no auth required (E9 will wire WebSocket) */}
      <Route path="/live/:gameId" element={<LiveScorePage />} />

      {/* E6-S2 / E9-S3: Public bracket view — no auth required */}
      <Route path="/tournaments/:id/bracket" element={<BracketPage />} />

      {/* Public auth routes */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Root shell: LandingPage for guests, AppShell for authenticated users */}
      <Route path="/" element={<AppShellOrLanding />}>
        <Route index element={<HomePage />} />
        <Route path="profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        {/* E2: Tournament Discovery & Search */}
        <Route path="tournaments" element={<PrivateRoute><TournamentsPage /></PrivateRoute>} />
        <Route path="tournaments/:id" element={<PrivateRoute><TournamentDetailPage /></PrivateRoute>} />
        <Route path="bookmarks" element={<PrivateRoute><BookmarksPage /></PrivateRoute>} />
        {/* E3: Team Management */}
        <Route path="teams" element={<PrivateRoute><TeamsPage /></PrivateRoute>} />
        <Route path="teams/create" element={<PrivateRoute><CreateTeamPage /></PrivateRoute>} />
        <Route path="teams/:teamId" element={<PrivateRoute><TeamDetailPage /></PrivateRoute>} />
        <Route path="join/:token" element={<PrivateRoute><JoinTeamPage /></PrivateRoute>} />
        {/* E4: Schedule & Calendar */}
        <Route path="schedule" element={<PrivateRoute><SchedulePage /></PrivateRoute>} />
        {/* E5: Notifications & Alerts */}
        <Route path="notifications" element={<PrivateRoute><NotificationsPage /></PrivateRoute>} />
        <Route path="settings/notifications" element={<PrivateRoute><NotificationPreferencesPage /></PrivateRoute>} />
        {/* E7: My Registrations */}
        <Route path="my-registrations" element={<PrivateRoute><MyRegistrationsPage /></PrivateRoute>} />
        {/* E10: Messaging */}
        <Route path="messages" element={<PrivateRoute><MessagesPage /></PrivateRoute>} />
        {/* E11: Player Stats & Team Record */}
        <Route path="stats/:playerId" element={<PrivateRoute><PlayerStatsPage /></PrivateRoute>} />
        <Route path="record" element={<PrivateRoute><TeamRecordPage /></PrivateRoute>} />
        {/* Analytics & Organization */}
        <Route path="analytics" element={<PrivateRoute><AnalyticsPage /></PrivateRoute>} />
        <Route path="organization" element={<PrivateRoute><OrganizationPage /></PrivateRoute>} />
        {/* E12: Admin Tournament Management */}
        <Route path="admin/tournaments" element={<PrivateRoute><AdminTournamentPage /></PrivateRoute>} />
        <Route path="admin/tournaments/new" element={<PrivateRoute><TournamentFormPage /></PrivateRoute>} />
        <Route path="admin/tournaments/:id/edit" element={<PrivateRoute><TournamentFormPage /></PrivateRoute>} />
      </Route>

      {/* E7: Registration flow — full-page outside AppShell */}
      <Route
        path="/registrations/new/:tournamentId"
        element={<PrivateRoute><RegistrationPage /></PrivateRoute>}
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
