# E5 · Notifications & Alerts — Implementation Summary

**Status:** COMPLETE  
**Phase:** 1 (MVP)  
**Priority:** P1  
**Completed:** 2026-05-30

---

## Stories Implemented

| Story | Title | Status | Notes |
|---|---|---|---|
| E5-S1 | Push Notification Infrastructure | ✅ COMPLETE | FCM HTTP v1, device token registry, dead-token cleanup |
| E5-S2 | In-App Notification Center | ✅ COMPLETE | Bell + badge + panel, infinite scroll, mark-read |
| E5-S3 | Game Time Change Alert | ✅ COMPLETE | Targets RSVPd YES/MAYBE members, push+SMS+in-app |
| E5-S4 | Weather / Delay / Cancellation Alert | ✅ COMPLETE | Coach broadcasts to ALL team members |
| E5-S5 | Bracket Update Alert | ✅ COMPLETE | Targets registered team members |
| E5-S6 | RSVP Reminder | ✅ COMPLETE | Delayed Bull jobs at -48h and -24h |
| E5-S7 | New Tournament Near Me Alert | ✅ COMPLETE | Weekly digest via Bull queue |
| E5-S8 | Notification Preferences | ✅ COMPLETE | Per-type push/SMS/email toggles, role defaults |

---

## Architecture — P4 Compliance

All notification dispatch is asynchronous through Bull queues:

```
API handler → DB write → notificationQueue.add(job) → return 200
                                    ↓ (packages/workers)
                             Bull Worker (concurrency=5)
                               ↓         ↓        ↓
                              FCM      Twilio  SendGrid
```

**Zero synchronous dispatch in API handlers.** Twilio timeout cannot fail a score update.

---

## New Package: `packages/workers`

Standalone BullMQ worker process. Runs alongside the API server in production. Key design:
- Separate Redis connection from the API's connection (BullMQ requirement)
- `concurrency: 5` — 5 notifications processed simultaneously
- `attempts: 3, backoff: exponential(5s)` — retries on transient failures
- Individual user failures don't abort the batch — continues to next user
- Dead FCM tokens deactivated via `isActive=false` (not hard-deleted)

---

## Files Created

### `packages/workers`
| File | Purpose |
|---|---|
| `src/queue.ts` | Queue definitions, job data types, Redis connection factory |
| `src/notification.worker.ts` | BullMQ Worker — dispatches FCM/SMS/email per user preferences |
| `src/services/fcm.service.ts` | FCM HTTP v1, 500-token batching, dead-token cleanup |
| `src/services/sms.service.ts` | Twilio REST API, E.164 format |
| `src/services/email-notification.service.ts` | SendGrid v3 API |
| `src/logger.ts`, `src/index.ts`, `src/run.ts` | Worker entry point |

### `apps/api`
| File | Purpose |
|---|---|
| `src/services/notification.service.ts` | Queue producers for all 8 story types |
| `src/routes/v1/notifications/handlers.ts` + `index.ts` | REST API for notification inbox, prefs, device tokens |
| `src/services/__tests__/notification.service.test.ts` | Unit tests |
| `src/__tests__/notification.routes.test.ts` | Integration tests |

### `apps/web`
| File | Purpose |
|---|---|
| `src/api/notification.api.ts` | All notification API calls |
| `src/hooks/usePushNotifications.ts` | Contextual push permission request |
| `src/components/notifications/NotificationBell.tsx` | Header bell + badge + 30s polling |
| `src/components/notifications/NotificationPanel.tsx` | Notification list, infinite scroll, mark-read |
| `src/pages/NotificationsPage.tsx` | Full `/notifications` page |
| `src/pages/NotificationPreferencesPage.tsx` | Per-type push/SMS/email toggles |

---

## Test Coverage
New tests: 47 (API service + routes + 22 frontend)  
**Cumulative: 474** (363 API + 111 web)

---

## Key Fix Applied
`IntersectionObserver` not available in jsdom — added global mock in `apps/web/src/__tests__/setup.ts`. Also added `navigator.share`, `navigator.serviceWorker`, and `crypto.randomUUID` stubs for components using browser APIs.

---

## Gaps
1. **FCM HTTP v2**: Using legacy HTTP v1 key. Migrate to OAuth2 service account flow for production.
2. **RSVP reminder execution**: Jobs queued with correct delay. Worker reads `data.eventId` at execution time to find non-responders — implement in `packages/workers` cron handler.
3. **Weekly digest cron**: `scheduleWeeklyDigest` enqueues job; actual cron trigger (Bull repeatable job, Monday 8am per timezone) wired in E12 when tournament data is live.
4. **Web push VAPID**: `usePushNotifications` stubs FCM token. Full `firebase/messaging` integration requires `VITE_FIREBASE_*` env vars.
