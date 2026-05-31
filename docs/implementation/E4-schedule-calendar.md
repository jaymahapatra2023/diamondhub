# E4 · Schedule & Calendar — Implementation Summary

**Status:** COMPLETE  
**Phase:** 1 (MVP)  
**Priority:** P1  
**Completed:** 2026-05-30

---

## Stories Implemented

| Story | Title | Status | Notes |
|---|---|---|---|
| E4-S1 | Team Calendar View | ✅ COMPLETE | Month/Week/Day views, multi-team, color-coded |
| E4-S2 | Add Practice / Event | ✅ COMPLETE | Form with Zod validation, coach/assistant only |
| E4-S3 | Edit / Cancel Event | ✅ COMPLETE | Cancel = soft delete (isCancelled), coach confirm dialog |
| E4-S4 | Export to Google/Apple Calendar | ✅ COMPLETE | RFC 5545 ICS generation, download endpoint |
| E4-S5 | Event Detail with Directions | ✅ COMPLETE | Platform-aware native maps link |

---

## Architecture Decisions

### Pure ICS generation — no library (P13)
RFC 5545 is simple enough to generate with string concatenation. Using a library would add a dependency with no benefit. `generateIcs()` handles line folding, character escaping, and STATUS:CANCELLED correctly.

### Cancelled events: soft delete (consistent with E3 roster)
`isCancelled=true`, never `DELETE`. Calendar shows them with strikethrough. ICS export includes `STATUS:CANCELLED` so subscribed calendar apps visually mark them.

### double-cancel returns 409
Idempotency: if a coach tries to cancel an already-cancelled event, the API returns 409 Conflict rather than silently succeeding. Prevents accidental re-notification if a retry fires after a timeout.

### Multi-team calendar: single query
`getUserEvents` fetches all teams user belongs to in one `findMany` with `teamId: { in: teamIds }`. One round trip, not N+1.

---

## Files Created

### Backend
| File | Purpose |
|---|---|
| `src/services/schedule.service.ts` | getTeamEvents, getUserEvents, createEvent, updateEvent, cancelEvent, generateIcs |
| `src/routes/v1/schedule/handlers.ts` | All route handlers with membership guard |
| `src/routes/v1/schedule/index.ts` | Route registration |
| `src/services/__tests__/schedule.service.test.ts` | 22 unit tests |
| `src/__tests__/schedule.routes.test.ts` | 35 integration tests |

### Frontend
| File | Purpose |
|---|---|
| `src/api/schedule.api.ts` | API calls + ICS URL helper |
| `src/pages/SchedulePage.tsx` | Month/Week/Day calendar, role-aware FAB |
| `src/components/schedule/MonthGrid.tsx` | 7-col month grid, event dots |
| `src/components/schedule/EventCard.tsx` | Color-coded event cards, RSVP indicator |
| `src/components/schedule/EventDetailSheet.tsx` | Full detail + directions + RSVP + ICS export |
| `src/components/schedule/AddEventSheet.tsx` | Create/edit form |

---

## API Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/schedule` | Required | Member | All user's events across teams |
| `GET` | `/api/v1/schedule/teams/:teamId` | Required | Member | Single team events |
| `GET` | `/api/v1/schedule/teams/:teamId/export.ics` | Required | Member | ICS download |
| `POST` | `/api/v1/schedule/teams/:teamId/events` | Required | Coach/Asst | Create event |
| `PATCH` | `/api/v1/schedule/teams/:teamId/events/:eventId` | Required | Coach/Asst | Update event |
| `DELETE` | `/api/v1/schedule/teams/:teamId/events/:eventId` | Required | Coach/Asst | Cancel event |
| `GET` | `/api/v1/schedule/teams/:teamId/events/:eventId` | Required | Member | Get single event |

---

## Test Coverage
New tests: 57 (22 service unit + 35 integration + 16 frontend)  
Cumulative: **405** (316 API + 89 web)

---

## Gaps & Known Limitations
1. **Google Calendar OAuth sync**: ICS file download is one-time export. Live Google Calendar sync (OAuth push updates) deferred — requires Google API credentials.
2. **Push notifications on event create/cancel**: Hook points exist in service (`// P4: Notification enqueued in E5`) — wired up in E5.
3. **Conflict detection**: ScheduleEvent records in DB are ready. E8 conflict engine reads from this table.
4. **Offline cache**: Service worker caches next 7 days — full implementation in CX stories.
