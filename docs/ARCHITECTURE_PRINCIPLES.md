# DiamondHub — Architecture Principles

**Audience:** All engineers contributing to DiamondHub  
**Scope:** Frontend, backend, database, infrastructure, mobile  
**Status:** Binding. Deviations require ADR (Architecture Decision Record).  
**Last Updated:** 2026-05-30

---

## P1 · Mobile-First, Offline-Capable

**Rule:** Every feature must be designed for a 375px screen, one-handed, outdoors, with intermittent connectivity — before desktop.

**Why:** Our primary users are standing at a baseball field, often in sunlight, often on spotty rural LTE. The desktop experience is secondary.

**Applies to:**
- All UI components: designed at 375px, scaled up (not the reverse)
- All critical reads: schedule, today's games, roster — must be readable from service worker cache when offline
- All critical writes: score entry, RSVP — must queue locally when offline and sync on reconnect (optimistic UI + background sync)
- Touch targets: minimum 44×44px, thumb-zone-first layout (bottom navigation)

**Do not:**
- Design a desktop layout and shrink it down
- Gate any critical flow behind a feature requiring persistent connectivity
- Use hover-only interactions as primary affordances

---

## P2 · Role-Based Access is a First-Class Concern

**Rule:** Every API endpoint, every UI component, and every database query must be aware of the caller's role. Role enforcement happens at the API layer — never trust the client.

**Roles:** `coach` · `parent` · `player` · `guest`

**Why:** We have four distinct roles with overlapping data access. A parent must never see another family's private player data. A guest must never trigger writes. Role bugs are trust bugs.

**Applies to:**
- JWT payload includes `roles: [{role, teamId}]` — role is always scoped to a team
- API middleware validates role + team membership before handler runs
- Frontend uses role context to render or hide UI (defense-in-depth only — API is authoritative)
- Database rows include `owner_id` or `team_id` — queries always join on ownership

**Do not:**
- Perform role checks only on the frontend
- Return data and let the UI filter it (return only what the role is permitted to see)
- Use a single global role without team scope

---

## P3 · Real-Time is a Progressive Enhancement

**Rule:** Every feature must work via REST polling as a baseline. WebSocket real-time is an enhancement layer, not a dependency.

**Why:** WebSocket connections drop. Firewalls block them. Users at rural fields on mobile hotspots lose connections mid-game. The app must degrade gracefully, not break.

**Applies to:**
- Live scores: primary delivery via WebSocket; fallback to 30-second REST poll on disconnect
- Bracket updates: same pattern
- Notifications: primary via push (FCM/APNs); fallback to in-app notification center on next app open
- Presence indicators: nice-to-have, never blocking

**Implementation pattern:**
```
1. React Query manages base REST fetch (cache + background refetch)
2. Socket.io connection established after page load (not blocking render)
3. On socket event: update React Query cache directly (not separate state)
4. On socket disconnect: React Query's refetchInterval kicks in as fallback
```

**Do not:**
- Render a loading spinner waiting for WebSocket connection before showing any data
- Use WebSocket as the only delivery mechanism for time-sensitive alerts

---

## P4 · Event-Driven Notifications via Queue

**Rule:** Notifications are never sent synchronously in the request/response cycle. All notification dispatch goes through a job queue (Bull + Redis).

**Why:** Sending push/SMS/email in-band couples the API response time to external service latency and reliability. A Twilio timeout should not cause a score update to fail.

**Architecture:**
```
API handler → DB write → enqueue notification job → return 200
                                   ↓
                            Bull worker
                               ↓     ↓      ↓
                              FCM  Twilio  SendGrid
```

**Applies to:**
- All push, SMS, and email dispatch
- All WebSocket broadcasts triggered by DB changes (use PostgreSQL NOTIFY → worker → Socket.io, not direct emit from API handler)

**Do not:**
- Call FCM, Twilio, or SendGrid directly from an API route handler
- Emit Socket.io events from inside a database transaction

---

## P5 · PostgreSQL is the Source of Truth

**Rule:** All persistent state lives in PostgreSQL. Redis is cache and queue only — it is not a database.

**Why:** Redis data is ephemeral by default. Any state that must survive a Redis restart (user data, scores, registrations) must live in PostgreSQL.

**Applies to:**
- Redis holds: session tokens, Bull job queues, rate-limit counters, pub/sub channels, short-lived cache with explicit TTL
- Redis does NOT hold: user records, team records, game scores, registrations, documents, notification history
- Cache invalidation: explicit (write-through or write-behind), never hope-it-expires
- Cache TTLs: tournament listings (1h), user profile (15min), live game scores (no cache — always real-time)

**Pattern for cached reads:**
```
GET /tournaments?lat=...&lng=...&radius=...
  → Check Redis cache key (hash of params, TTL 1h)
  → If miss: query PostgreSQL + PostGIS → set cache → return
  → If hit: return cached result
```

---

## P6 · Financial Data Requires Stripe as the Record

**Rule:** Payment status in DiamondHub's database is always derived from Stripe webhook events — never from the client-side success redirect.

**Why:** Client-side redirects can be spoofed, interrupted, or replayed. If we confirm registration based on a client callback, we will have unpaid registrations.

**Applies to:**
- Registration confirmation: `tournament_registrations.payment_status` set to `paid` ONLY when `payment_intent.succeeded` webhook received
- Stripe webhook endpoint: idempotent (duplicate events handled gracefully via Stripe event ID)
- Stripe webhook: verified via `stripe.webhooks.constructEvent` with signing secret
- Payment disputes / refunds: handled via `charge.dispute.created` and `charge.refunded` webhooks

**Do not:**
- Set `payment_status = paid` from the frontend after Stripe redirect
- Store card numbers, CVVs, or full PANs anywhere in DiamondHub systems (Stripe tokenizes all card data)

---

## P7 · Geo Queries Use PostGIS — Never Application-Layer Distance Math

**Rule:** All radius/proximity searches are executed as PostGIS `ST_DWithin` queries in PostgreSQL. Distance calculations never happen in Node.js.

**Why:** PostGIS uses spatial indexes. Application-layer distance math requires a full table scan. At 10,000 tournament records, this difference is milliseconds vs. seconds.

**Schema requirement:**
```sql
-- tournaments table
location GEOGRAPHY(POINT, 4326)  -- PostGIS geography type

-- Index required
CREATE INDEX idx_tournaments_location ON tournaments USING GIST(location);
```

**Query pattern:**
```sql
SELECT *, ST_Distance(location, ST_MakePoint($lng, $lat)::geography) AS distance_meters
FROM tournaments
WHERE ST_DWithin(
  location,
  ST_MakePoint($lng, $lat)::geography,
  $radius_meters
)
ORDER BY distance_meters;
```

**Do not:**
- Store lat/lng as plain DECIMAL columns for query purposes (fine for display, not for search)
- Calculate distance in JavaScript by fetching all tournaments and filtering

---

## P8 · Security Defaults — Never Relax Without Explicit Decision

**Rule:** Start with the most restrictive posture. Relax with justification. Never relax to ship faster.

**Baseline requirements:**

| Concern | Requirement |
|---|---|
| Passwords | bcrypt, min 12 rounds |
| Tokens | JWT RS256 (asymmetric), 15-min access, 30-day refresh, httpOnly SameSite=Strict cookie |
| Transport | HTTPS everywhere, HSTS with 1-year max-age + includeSubDomains |
| CORS | Explicit allowlist — never `*` in production |
| Rate limiting | All auth endpoints: 5 req/min per IP. All API: 300 req/min per user |
| Input validation | Zod schemas on all API inputs — server-side, not just client |
| SQL injection | Prisma parameterized queries only — no raw string interpolation in queries |
| File uploads | Validate MIME type server-side (not just extension), max size enforced, virus scan on document uploads |
| COPPA | Players under 13: parent must have account linked; no direct marketing to under-13 users |
| Secrets | Never in code or env files committed to git; use Railway/Render secret manager |

**Do not:**
- Disable CORS for development convenience and forget to re-enable
- Log JWT tokens, passwords, or Stripe keys anywhere
- Use `eval()`, `new Function()`, or dynamic SQL string building

---

## P9 · API Contracts are Explicit and Versioned

**Rule:** All API routes are versioned (`/api/v1/...`), all request/response shapes are defined as Zod schemas, and all schemas are exported for use in tests and the frontend.

**Why:** Implicit contracts between frontend and backend cause runtime failures that TypeScript can't catch. Shared Zod schemas catch mismatches at build time.

**Applies to:**
- Monorepo shared package: `packages/contracts` — Zod schemas for all request/response types
- API: validates request body with Zod before handler runs (Fastify plugin)
- Frontend: uses same Zod schema to validate API responses (defense against stale client)
- Breaking API changes: bump version (`/api/v2/...`), maintain old version for 2 sprints

**Do not:**
- Add fields to an API response without updating the Zod schema
- Return different shapes from the same endpoint based on conditions (use separate endpoints or discriminated union types)

---

## P10 · Data Scraping is Isolated and Respectful

**Rule:** All web scraping for tournament data runs in a dedicated worker service, isolated from the main API, with strict rate limits and robots.txt compliance.

**Why:** Scraping is legally and operationally risky. Isolating it protects the main API from IP bans, rate-limit blowback, and liability. Respectful scraping is also a foundation for organizer partnership relationships.

**Rules for all scrapers:**
- Always check and obey `robots.txt`
- Maximum 1 request/second per domain (configurable lower, never higher)
- Identify via User-Agent: `DiamondHub-Bot/1.0 (+https://diamondhub.app/bot)`
- Data scraped: public event listings only — never authenticated areas
- Scraped data marked `data_source = scraped` — never presented as partner data
- Scraper errors: logged + admin alerted; do not retry aggressively on 429/503
- If an organizer requests removal: implement within 24 hours

**Transition plan:**
- Scraping is a bootstrapping mechanism, not a long-term strategy
- Every organizer relationship that converts to partnership replaces the scraper for that organizer

---

## P11 · Feature Completeness Before Feature Breadth

**Rule:** A feature ships when it handles its error cases, edge cases, and offline behavior — not when the happy path works.

**Definition of Done (non-negotiable):**
- [ ] Happy path implemented
- [ ] Error states handled (API failure, empty state, timeout)
- [ ] Offline state handled (cached view or graceful disabled state)
- [ ] Mobile viewport tested (375px)
- [ ] Role-based access enforced (unit tested)
- [ ] Zod schema in contracts package
- [ ] Integration test for API endpoint
- [ ] No console errors or warnings in production build

**Do not:**
- Ship a feature as "done" with TODO comments for error handling
- Merge code that throws unhandled promise rejections
- Leave `console.log` statements in production code

---

## P12 · Observability is Built In, Not Bolted On

**Rule:** Every API request logs structured JSON. Every background job reports success/failure. Every external service call (FCM, Twilio, Stripe, Mapbox) has a timeout and a logged failure.

**Minimum observability per service:**

| Layer | What to log |
|---|---|
| API | Request method, path, status code, duration, user_id (no PII in logs) |
| Worker | Job type, job_id, duration, success/fail, retry count |
| Scraper | Organizer, records found, records inserted/updated, errors |
| WebSocket | Connect, disconnect, room join, room leave, message counts |
| External calls | Service name, method, status, duration, error if any |

**Tooling:**
- Structured JSON logs (pino for Node.js)
- Log aggregation: Railway built-in → migrate to Datadog/Papertrail at scale
- Error tracking: Sentry (both frontend and backend)
- Uptime monitoring: Better Uptime or UptimeRobot

**Do not:**
- Log user passwords, tokens, card numbers, or any PII
- Use `console.log` in production (use pino levels: info, warn, error)
- Swallow errors silently (`catch(e) {}` with no log)

---

## P13 · Dependency Discipline

**Rule:** Every new dependency requires justification against: (a) can we build it in < 1 day, (b) is the package actively maintained, (c) is the license compatible (MIT/Apache-2 preferred).

**Banned:**
- `moment.js` — use `date-fns` or native `Intl`
- `lodash` full build — use specific imports or native JS
- `jQuery`
- Any package last updated > 2 years ago without strong justification
- Dependencies with known CVEs (run `npm audit` in CI)

**Core approved stack (no substitution without ADR):**

| Layer | Package | Version Policy |
|---|---|---|
| Frontend framework | React + Vite | Pin major, auto-patch |
| Styling | Tailwind CSS | Pin major |
| Data fetching | TanStack Query | Pin major |
| Client state | Zustand | Pin major |
| Routing | React Router v6 | Pin major |
| Forms | React Hook Form + Zod | Pin major |
| Maps | Mapbox GL JS | Pin major |
| Real-time | Socket.io-client | Match server version exactly |
| API framework | Fastify | Pin major |
| ORM | Prisma | Pin major |
| Queue | BullMQ | Pin major |
| Validation | Zod | Pin major |
| Auth | Custom JWT via `jose` | Pin exact |
| Notifications | Novu | Pin major |
| Payments | Stripe SDK | Pin major |
| Testing | Vitest + Supertest + Playwright | Pin major |

---

## P14 · Monorepo Structure

**Rule:** Single repository with clearly bounded packages. Shared code lives in packages — never copy-pasted between apps.

```
diamondhub/
├── apps/
│   ├── web/              # React PWA (Vite)
│   ├── native/           # Expo React Native
│   └── api/              # Fastify API + WebSocket
├── packages/
│   ├── contracts/        # Zod schemas, shared types (no runtime deps)
│   ├── db/               # Prisma schema, migrations, client
│   ├── workers/          # Bull jobs (notifications, scraping)
│   └── config/           # Shared ESLint, Prettier, TypeScript configs
├── infra/                # Docker Compose, Railway config, env templates
└── docs/                 # Architecture docs, ADRs, this file
```

**Rules:**
- `packages/contracts` has zero runtime dependencies (pure Zod + TypeScript)
- `apps/web` and `apps/native` import from `packages/contracts` — never from each other
- Database migrations live only in `packages/db` — no migration files in `apps/`
- Shared business logic (e.g., conflict detection algorithm) lives in `packages/` — not in `apps/api/`

---

## P15 · Architecture Decision Records (ADRs)

**Rule:** Any decision that deviates from these principles, introduces a new major dependency, changes the data model in a breaking way, or affects system security must be recorded as an ADR before implementation.

**ADR format** (`docs/adr/NNNN-title.md`):
```markdown
# NNNN · Title

**Date:** YYYY-MM-DD  
**Status:** Proposed | Accepted | Superseded  
**Deciders:** [names]

## Context
What problem are we solving? What constraints exist?

## Decision
What are we doing?

## Alternatives Considered
What else did we evaluate and why did we reject it?

## Consequences
What gets better? What gets worse? What new risks exist?
```

**Required ADR triggers:**
- Switching from any approved core dependency
- Adding a third-party service that handles PII or payment data
- Changing the JWT algorithm or token lifetimes
- Any change to how roles are stored or enforced
- Introducing a new database (even for caching)
- Changing the notification delivery architecture

---

*These principles are living documents. Any engineer can propose a change via PR to this file with a justification. Changes require approval from at least 2 senior engineers.*
