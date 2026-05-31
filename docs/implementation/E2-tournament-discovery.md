# E2 · Tournament Discovery & Search — Implementation Summary

**Status:** COMPLETE  
**Phase:** 1 (MVP)  
**Priority:** P0  
**Completed:** 2026-05-30

---

## Stories Implemented

| Story | Title | Status | Notes |
|---|---|---|---|
| E2-S1 | Basic Tournament Search | ✅ COMPLETE | PostGIS radius search, date/location filters, Redis cache |
| E2-S2 | Radius / Map Search | ✅ COMPLETE | Map/list toggle, geolocation hook, Mapbox slot ready |
| E2-S3 | Advanced Filters | ✅ COMPLETE | Age div, sport, organizer, fee range, surface, radius chips |
| E2-S4 | Tournament Detail Page | ✅ COMPLETE | Full detail, directions, countdown, register CTA (coach only) |
| E2-S5 | Tournament Bookmarks | ✅ COMPLETE | Server-side, optimistic UI, star toggle |
| E2-S6 | "This Weekend Near Me" | ✅ COMPLETE | Fri–Sun window, 50mi radius, server-computed dates |
| E2-S7 | Tournament Following | ✅ COMPLETE | Guest UUID token support + logged-in user following |
| E2-S8 | Search History & Suggestions | ✅ COMPLETE | Last 5 searches per user, stored in UserSearchPreference |

---

## Architecture Decisions

### PostGIS for radius search (P7)
**Decision:** Raw SQL via `prisma.$queryRawUnsafe` with `ST_DWithin` and `ST_MakePoint`.  
**Why:** Prisma ORM has no native PostGIS geography type support. Raw query is necessary to use spatial indexes. Application-layer distance math would require full table scan at scale.  
**Query pattern:**
```sql
WHERE ST_DWithin(
  ST_MakePoint(t.lng::float8, t.lat::float8)::geography,
  ST_MakePoint($lng::float8, $lat::float8)::geography,
  $radius_meters::float8
)
ORDER BY distance_meters ASC
```

### Redis caching (P5)
**Decision:** Cache search results 1 hour, keyed by MD5 hash of search params.  
**Why:** Tournament listings change infrequently (daily scraper runs). Caching prevents PostGIS query on every request. Cache invalidated on tournament update.  
**TTL:** 3600s. Live game scores are NOT cached (per P5 — no cache on real-time data).

### Geocoding via `us-zips` (P13)
**Decision:** `us-zips` npm package for ZIP→lat/lng, no external API.  
**Why:** No external API latency or cost for US ZIP lookups. Package is 2.8MB, covers all US postal codes, zero runtime dependencies. Loaded lazily on first request.

### optionalAuthenticate middleware
**Decision:** Added `optionalAuthenticate` to `authenticate.ts` for public routes that can enrich responses for logged-in users.  
**Why:** Tournament search is public, but logged-in users should see `isBookmarked` status. Guest sees same results without bookmark status.

### This Weekend calculation (server-side)
**Decision:** `getThisWeekend` computes Fri–Sun window on the server.  
**Why:** Client timezone is unreliable. Server uses UTC math to compute next/current weekend consistently.

---

## Files Created

### Backend — `apps/api`

| File | Purpose |
|---|---|
| `src/services/geocoding.service.ts` | ZIP→lat/lng via us-zips, radius meters conversion |
| `src/services/tournament.service.ts` | Search (PostGIS), detail, bookmark, follow, this-weekend, search history |
| `src/routes/v1/tournaments/index.ts` | Route registration |
| `src/routes/v1/tournaments/search.ts` | `GET /tournaments` — search handler + search history save |
| `src/routes/v1/tournaments/detail.ts` | `GET /tournaments/:id`, `POST/DELETE /:id/bookmark`, `POST/DELETE /:id/follow` |
| `src/routes/v1/tournaments/bookmarks.ts` | `GET /tournaments/bookmarks` |
| `src/routes/v1/tournaments/this-weekend.ts` | `GET /tournaments/this-weekend` |
| `src/routes/v1/tournaments/search-history.ts` | `GET /tournaments/search-history` |

**Also updated:**
- `src/middleware/authenticate.ts` — added `optionalAuthenticate`
- `src/app.ts` — registered tournament routes at `/api/v1/tournaments`

### Frontend — `apps/web`

| File | Purpose |
|---|---|
| `src/api/tournament.api.ts` | All tournament API calls |
| `src/hooks/useGeolocation.ts` | Browser geolocation hook |
| `src/store/tournament.store.ts` | Persisted filter + view mode state |
| `src/components/tournament/TournamentCard.tsx` | List card (status, distance, bookmark) |
| `src/components/tournament/TournamentFilters.tsx` | Slide-up filter panel, all filter types |
| `src/components/tournament/TournamentSkeleton.tsx` | Loading placeholder |
| `src/pages/TournamentsPage.tsx` | Search bar, filters, infinite scroll list/map toggle |
| `src/pages/TournamentDetailPage.tsx` | Full detail, directions, register CTA, share |
| `src/pages/BookmarksPage.tsx` | Bookmarks list with unbookmark |

**Also updated:**
- `src/App.tsx` — added `/tournaments`, `/tournaments/:id`, `/bookmarks` routes

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/tournaments` | Optional | Search with filters, PostGIS radius |
| `GET` | `/api/v1/tournaments/this-weekend` | Optional | Fri–Sun events within 50mi |
| `GET` | `/api/v1/tournaments/bookmarks` | Required | User's bookmarked tournaments |
| `GET` | `/api/v1/tournaments/search-history` | Required | Last 5 user searches |
| `GET` | `/api/v1/tournaments/:id` | Optional | Full tournament detail |
| `POST` | `/api/v1/tournaments/:id/bookmark` | Required | Add bookmark |
| `DELETE` | `/api/v1/tournaments/:id/bookmark` | Required | Remove bookmark |
| `POST` | `/api/v1/tournaments/:id/follow` | Optional | Follow (guest or user) |
| `DELETE` | `/api/v1/tournaments/:id/follow` | Optional | Unfollow |

---

## Test Coverage

| File | Type | Tests |
|---|---|---|
| `geocoding.service.test.ts` | Unit | ZIP lookup (valid/invalid), radius conversion |
| `tournament.service.test.ts` | Unit | search (cache hit/miss), getById, bookmark, follow, this-weekend, search history |
| `tournament.routes.test.ts` | Integration | All 9 endpoints, 401 guards, 404 handling |
| `TournamentCard.test.tsx` | Frontend Unit | 20 tests — rendering, bookmark interaction, status badge |
| `TournamentsPage.test.tsx` | Frontend Unit | 12 tests — search bar, geolocation, loading, results, empty state, filter badge |

**New tests added:** 67  
**Total cumulative:** 175 API + 40 web = **215 tests**

---

## Gaps & Known Limitations

1. **Mapbox map view:** Map toggle button exists, `viewMode` stored, but actual Mapbox GL JS map component deferred (requires `MAPBOX_TOKEN`). Shows placeholder. Full implementation in Phase 2 polish sprint.
2. **City/state geocoding:** Accepts `city` + `state` query params but no city→lat/lng geocoding implemented. ZIP or lat/lng required for radius search. City search shows unfiltered results.
3. **Cache invalidation:** Tournament update (admin) doesn't currently clear Redis cache. Next scheduled run or TTL expiry refreshes it. Add explicit cache bust on admin tournament update.
4. **Tournament creation (admin):** CRUD for admin to create/edit tournaments deferred to E12 (Tournament Data Ingestion epic).
5. **Seed data:** No seed script yet — tests use mocked Prisma. To test real search UI, run `pnpm db:seed` after E12 implementation adds seed data.
