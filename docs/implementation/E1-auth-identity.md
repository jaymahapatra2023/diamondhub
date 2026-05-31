# E1 · Authentication & Identity — Implementation Summary

**Status:** COMPLETE  
**Phase:** 1 (MVP)  
**Priority:** P0  
**Completed:** 2026-05-30

---

## Stories Implemented

| Story | Title | Status | Notes |
|---|---|---|---|
| E1-S1 | Email Registration | ✅ COMPLETE | bcrypt 12 rounds, email verification, JWT issued |
| E1-S2 | Email Login | ✅ COMPLETE | Timing-safe compare, lockout after 5 fails, 15-min window |
| E1-S3 | Google OAuth Login | ✅ COMPLETE | google-auth-library idToken verify, upsert user, link account |
| E1-S4 | Apple Sign-In | ⏳ DEFERRED | Native app required per AC; flagged for Phase 3 (E13) |
| E1-S5 | JWT Refresh Flow | ✅ COMPLETE | Token rotation on every refresh, httpOnly cookie |
| E1-S6 | Role Assignment at Onboarding | ✅ COMPLETE | 3-card selection (COACH/PARENT/PLAYER), first role = primary |
| E1-S7 | Multi-Role Support | ✅ COMPLETE | Multiple roles per user, team-scoped, role switcher in store |
| E1-S8 | Password Reset | ✅ COMPLETE | 1-hour token, single-use, all sessions invalidated on reset |
| E1-S9 | Account Profile Management | ✅ COMPLETE | Name, phone (E.164), timezone, avatarUrl, optimistic update |

---

## Architecture Decisions

### JWT: RS256 asymmetric (P8)
**Decision:** RS256 over HS256.  
**Why:** RS256 lets future microservices verify tokens using only the public key — no shared secret distribution risk. HS256 requires every service to hold the signing secret.  
**Implementation:** `jose` library, `importPKCS8`/`importSPKI` for key loading, ephemeral key pair in test environment.

### Refresh token: httpOnly cookie (P8)
**Decision:** Refresh token in `httpOnly; SameSite=Strict; Secure` cookie, access token in memory only.  
**Why:** XSS attacks cannot read httpOnly cookies. Access token in memory means a page reload requires a refresh (expected behavior), but is never exposed to `document.cookie` or `localStorage`.  
**Never do:** `localStorage.setItem('refreshToken', ...)`.

### Timing-safe login (P8)
**Decision:** Always compare `bcrypt.compare(password, hash)` even when user doesn't exist.  
**Why:** Without this, an attacker can determine valid email addresses by measuring response time (compare takes ~100ms, non-compare returns instantly).  
**Implementation:** Uses a dummy `$2b$12$invalid...` hash when user not found.

### Account lockout via Redis (P8)
**Decision:** Track failed attempts in Redis, lock after 5 failures for 15 minutes.  
**Why:** Redis is ephemeral — lockout is not permanent data, doesn't need ACID guarantees. Key: `auth:lockout:{userId}`.  
**Note:** Keys are userId-based (not email), so user enumeration is still prevented.

### No user enumeration on forgot-password (P8)
**Decision:** `POST /forgot-password` always returns 200 with identical message.  
**Why:** If different responses were returned for known vs unknown emails, attackers could build a valid email list.

### Role storage: team-scoped (P2)
**Decision:** `UserRole` records include `teamId` (nullable). Role `COACH` on team A ≠ role `COACH` on team B.  
**Why:** A user can be a head coach on one team and a parent on another. Global roles without team scope would collapse these into a single permission level.

### Fire-and-forget email (P4)
**Decision:** Email dispatch uses `.catch(logger.error)` pattern — never `await` inside transaction or route handler.  
**Why:** SendGrid latency (~100ms–2s) or downtime must not fail the registration or password-reset API response. Email is best-effort delivery.

### Token rotation on refresh (E1-S5)
**Decision:** Every refresh call replaces the old refresh token hash with a new one.  
**Why:** Refresh token reuse detection — if an old token is presented after rotation, it means either replay attack or session was compromised. Old token immediately invalidated.

---

## Files Created

### Backend — `apps/api`

| File | Purpose |
|---|---|
| `src/config.ts` | Zod-validated env config, test-mode fallbacks |
| `src/lib/logger.ts` | Pino structured logger with PII redaction |
| `src/lib/redis.ts` | IORedis client with reconnect handling |
| `src/services/token.service.ts` | JWT RS256 sign/verify, refresh token generation, SHA-256 hashing |
| `src/services/auth.service.ts` | All E1 business logic: register, login, refresh, password reset, email verify, roles |
| `src/services/email.service.ts` | SendGrid integration with branded HTML templates |
| `src/middleware/authenticate.ts` | JWT Bearer verification middleware, `requireRole`, `requireTeamRole` |
| `src/routes/v1/auth/register.ts` | `POST /api/v1/auth/register` |
| `src/routes/v1/auth/login.ts` | `POST /api/v1/auth/login` |
| `src/routes/v1/auth/logout.ts` | `POST /api/v1/auth/logout`, `DELETE /api/v1/auth/me/sessions` |
| `src/routes/v1/auth/refresh.ts` | `POST /api/v1/auth/refresh` |
| `src/routes/v1/auth/reset-password.ts` | `POST /forgot-password`, `POST /reset-password` |
| `src/routes/v1/auth/profile.ts` | `GET /me`, `PATCH /me`, `POST /me/roles` |
| `src/routes/v1/auth/google-oauth.ts` | `POST /oauth/google` — Google idToken verification |
| `src/routes/v1/auth/verify-email.ts` | `GET /verify-email?token=` |
| `src/routes/v1/auth/index.ts` | Route registration |
| `src/app.ts` | Fastify factory: CORS, helmet, cookies, rate limiting |
| `src/index.ts` | Server entry point, graceful shutdown |

### Frontend — `apps/web`

| File | Purpose |
|---|---|
| `src/api/client.ts` | Axios with JWT refresh interceptor, request queuing |
| `src/api/auth.api.ts` | Typed API calls for all E1 endpoints |
| `src/store/auth.store.ts` | Zustand: user, accessToken (memory), activeRole |
| `src/components/ui/Button.tsx` | Mobile-first button: variants, loading state, 44px min |
| `src/components/ui/Input.tsx` | Input with label, error, aria attributes |
| `src/components/ui/LoadingScreen.tsx` | Auth initialization loading state |
| `src/components/layout/AppShell.tsx` | Bottom nav shell, role-aware navigation |
| `src/pages/auth/LoginPage.tsx` | Email + password form, Google OAuth button |
| `src/pages/auth/RegisterPage.tsx` | Registration form with all fields |
| `src/pages/auth/OnboardingPage.tsx` | 3-card role selection (COACH/PARENT/PLAYER) |
| `src/pages/auth/ForgotPasswordPage.tsx` | Email input, success state |
| `src/pages/auth/ResetPasswordPage.tsx` | Password + confirm, token from URL |
| `src/pages/auth/VerifyEmailPage.tsx` | Auto-verify from URL token |
| `src/pages/HomePage.tsx` | Role-aware home screen |
| `src/pages/ProfilePage.tsx` | Profile edit + role switcher |
| `src/App.tsx` | Router with PrivateRoute/PublicRoute guards |

### Shared — `packages/contracts`

| File | Schemas |
|---|---|
| `src/auth.schemas.ts` | RegisterRequest/Response, LoginRequest/Response, JwtPayload, UserProfile, ForgotPassword, ResetPassword, AssignRole, UpdateProfile, GoogleOAuth |
| `src/tournament.schemas.ts` | TournamentSearch, TournamentSummary, TournamentDetail, CreateTournament |
| `src/team.schemas.ts` | CreateTeam, AddPlayer, Invite, Rsvp, EmergencyContact |
| `src/schedule.schemas.ts` | CreateEvent, ScheduleEventResponse, CalendarRange |
| `src/game.schemas.ts` | UpdateScore, GameResponse, BracketGame, StandingsRow, PlayerGameStat |
| `src/notification.schemas.ts` | NotificationPreferences, NotificationResponse, BroadcastAlert |

### Database — `packages/db`

| Item | Coverage |
|---|---|
| `prisma/schema.prisma` | 35+ models, 20+ enums. Covers all 15 epics. PostGIS extension enabled. All indexes defined. |
| `src/index.ts` | Prisma singleton with dev/prod log levels |

---

## API Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | No | — | Create account, send verification email |
| `POST` | `/api/v1/auth/login` | No | — | Authenticate, set refresh cookie |
| `POST` | `/api/v1/auth/logout` | No | — | Clear refresh cookie |
| `POST` | `/api/v1/auth/refresh` | Cookie | — | Rotate refresh token, return new access token |
| `POST` | `/api/v1/auth/forgot-password` | No | — | Send reset email (always 200) |
| `POST` | `/api/v1/auth/reset-password` | No | — | Validate token, set new password |
| `GET` | `/api/v1/auth/verify-email` | No | — | Mark email verified via token param |
| `POST` | `/api/v1/auth/oauth/google` | No | — | Google idToken → session |
| `GET` | `/api/v1/auth/me` | Bearer | Any | Get current user profile + roles |
| `PATCH` | `/api/v1/auth/me` | Bearer | Any | Update name, phone, timezone, avatar |
| `POST` | `/api/v1/auth/me/roles` | Bearer | Any | Assign a new role (onboarding) |
| `DELETE` | `/api/v1/auth/me/sessions` | Bearer | Any | Invalidate all refresh tokens |
| `GET` | `/health` | No | — | Health check (P12) |

---

## Security Measures (P8 compliance)

| Control | Implementation |
|---|---|
| Password hashing | `bcrypt` 12 rounds — `BCRYPT_ROUNDS = 12` constant |
| JWT algorithm | RS256 (asymmetric) via `jose` — private key signs, public key verifies |
| Access token lifetime | 15 minutes (`JWT_ACCESS_EXPIRES_IN=15m`) |
| Refresh token lifetime | 30 days, httpOnly SameSite=Strict cookie |
| Refresh token storage | SHA-256 hash in DB — raw token never stored |
| Rate limiting | 300 req/min global; auth endpoints inherit + Fastify rate-limit plugin |
| Account lockout | 5 failed attempts → 15-min lockout in Redis |
| Timing attack prevention | Always run `bcrypt.compare` even for unknown emails |
| User enumeration | Login: generic error. Forgot-password: always 200 |
| CORS | Explicit allowlist from `CORS_ORIGINS` env — never `*` |
| Security headers | `@fastify/helmet` — CSP, HSTS, X-Frame-Options |
| Secrets in env | PEM keys via env var, never hardcoded or in git |
| COPPA | `emailVerified` gate; under-13 player profiles require parent link (E3) |

---

## Test Coverage

| File | Type | Tests | Coverage Areas |
|---|---|---|---|
| `token.service.test.ts` | Unit | 20 | generateAccessToken, generateRefreshToken, verifyAccessToken, hashToken |
| `auth.service.test.ts` | Unit | 40+ | All authService methods: register, login (timing, lockout, enumeration), refresh, logout, forgotPassword, resetPassword, verifyEmail, assignRole, getProfile, updateProfile |
| `auth.routes.test.ts` | Integration | 60+ | All 13 endpoints via Fastify inject(), httpOnly cookie assertions, status code correctness, validation errors |
| `auth.store.test.ts` | Frontend Unit | 6 | Zustand store: setUser, setAccessToken, logout, setActiveRole, role derivation |

**Targets:** lines ≥ 80%, functions ≥ 80%, branches ≥ 70%

---

## Gaps & Known Limitations

1. **Apple Sign-In (E1-S4):** Deferred. AC explicitly states "Available only in native app build." Implemented in Phase 3 alongside E13 (Expo native).
2. **Phone SMS verification:** Phone number stored but SMS confirmation deferred to E5 (notification infrastructure).
3. **Avatar upload to S3:** `avatarUrl` field accepts a URL. Full S3 upload flow (presigned URL) deferred to CX stories when file upload infrastructure is built.
4. **Rate limit per auth endpoint:** Global rate limiting applied. Auth-specific tighter limits (5/min on login) can be added as a Fastify plugin override per-route in a follow-up.
5. **Audit logging:** `AuditLog` table schema defined. Writing audit records on every auth action deferred to avoid blocking E1 completion — implement as middleware in E2 sprint.

---

## How to Run

```bash
# 1. Start infrastructure
docker-compose -f infra/docker-compose.yml up -d

# 2. Generate RSA key pair
bash scripts/generate-keys.sh

# 3. Configure environment
cp .env.example .env
# Edit DATABASE_URL, REDIS_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY

# 4. Install dependencies
pnpm install

# 5. Run DB migrations
pnpm db:generate
pnpm db:migrate

# 6. Start development servers
pnpm dev
# API: http://localhost:3000
# Web: http://localhost:5173

# 7. Run tests
pnpm --filter @diamondhub/api test
pnpm --filter @diamondhub/web test
```
