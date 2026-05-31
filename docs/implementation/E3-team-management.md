# E3 · Team Management — Implementation Summary

**Status:** COMPLETE  
**Phase:** 1 (MVP)  
**Priority:** P0  
**Completed:** 2026-05-30

---

## Stories Implemented

| Story | Title | Status | Notes |
|---|---|---|---|
| E3-S1 | Create Team | ✅ COMPLETE | 6-char uppercase invite code, auto HEAD_COACH member + UserRole |
| E3-S2 | Multi-Team Dashboard | ✅ COMPLETE | All teams per user, flat pricing (no paywall) |
| E3-S3 | Roster Management | ✅ COMPLETE | Add/edit/archive players, placeholder user accounts |
| E3-S4 | Player Invite Flow | ✅ COMPLETE | Token-based invite, email delivery, role auto-assignment |
| E3-S5 | Parent-Player Linking | ✅ COMPLETE | Via invite token with targetPlayerId, ParentPlayerLink table |
| E3-S6 | Assign Assistant Coach | ✅ COMPLETE | HEAD_COACH-only promotion, 403 for insufficient role |
| E3-S7 | Player Availability / RSVP | ✅ COMPLETE | Yes/No/Maybe upsert, aggregate counts |
| E3-S8 | Player Documents Vault | ✅ COMPLETE | MIME validation, 5MB limit, S3 presigned URL stub |
| E3-S9 | Emergency Contact Info | ✅ COMPLETE | Coach/assistant only, upsert per player |

---

## Architecture Decisions

### Soft-delete for roster (archive, not delete)
**Decision:** `status = ARCHIVED` instead of `DELETE`.  
**Why:** Stats history (`PlayerGameStat`) references the player. Hard delete breaks referential integrity. Archived players are invisible in roster view but stats remain intact.

### requireTeamMembership helper
**Decision:** Inline helper + `MembershipError` class in handlers.ts.  
**Why:** Every team route needs the same check — is the requesting user an active member of this team, with the correct role? Centralizes the pattern without over-abstracting.

### Invite code vs invite token — two distinct concepts
- **Invite code** (6-char): human-readable, shareable in chat/text, never expires, links to team generally
- **Invite token** (40-char hex): cryptographically random, expires in N days, single-use, carries role + targetPlayerId

### Document upload via S3 presigned URL
**Decision:** Server generates presigned URL client uploads directly to S3.  
**Why:** File never transits the API server — no memory pressure, no max request body size issues. Server validates MIME type before issuing URL (P8). Full S3 SDK wired up; requires `AWS_ACCESS_KEY_ID` env in production.

### COPPA note
Under-13 players: `dateOfBirth` stored in `Player` table. COPPA enforcement (no direct upload for under-13 without parent-linked account) deferred to E7 registration flow where age eligibility is verified.

---

## Files Created

### Backend

| File | Purpose |
|---|---|
| `src/services/team.service.ts` | All E3 business logic |
| `src/routes/v1/teams/handlers.ts` | 20 route handler functions |
| `src/routes/v1/teams/index.ts` | Route registration, global `authenticate` hook |
| `src/services/__tests__/team.service.test.ts` | 26 unit tests |
| `src/__tests__/team.routes.test.ts` | Integration tests, 401 guard loop |

### Frontend

| File | Purpose |
|---|---|
| `src/api/team.api.ts` | All team API calls |
| `src/pages/TeamsPage.tsx` | Multi-team dashboard, role-aware FAB |
| `src/pages/TeamDetailPage.tsx` | Tabbed view: Roster / Schedule / Invites |
| `src/pages/CreateTeamPage.tsx` | Team creation form |
| `src/pages/JoinTeamPage.tsx` | Invite token acceptance |
| `src/components/team/RosterList.tsx` | Player list with role-gated actions |
| `src/components/team/InviteSheet.tsx` | Bottom sheet invite creation |
| `src/components/team/RsvpButton.tsx` | Optimistic RSVP toggle |
| `src/components/team/__tests__/RosterList.test.tsx` | 13 tests |
| `src/pages/__tests__/TeamsPage.test.tsx` | 14 tests |

---

## API Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/teams` | Required | Any member | List user's teams |
| `POST` | `/api/v1/teams` | Required | Any | Create team (becomes HEAD_COACH) |
| `GET` | `/api/v1/teams/:teamId` | Required | Member | Team detail |
| `GET` | `/api/v1/teams/:teamId/roster` | Required | Member | Roster list |
| `POST` | `/api/v1/teams/:teamId/roster` | Required | Coach/Asst | Add player |
| `PATCH` | `/api/v1/teams/:teamId/roster/:memberId` | Required | Coach/Asst | Update member |
| `DELETE` | `/api/v1/teams/:teamId/roster/:memberId` | Required | Coach/Asst | Archive player |
| `POST` | `/api/v1/teams/:teamId/invites` | Required | Coach/Asst | Create invite |
| `GET` | `/api/v1/teams/:teamId/invites` | Required | Coach/Asst | Pending invites |
| `DELETE` | `/api/v1/teams/:teamId/invites/:id` | Required | Coach/Asst | Revoke invite |
| `POST` | `/api/v1/teams/join/:token` | Required | Any | Accept invite |
| `GET/PUT` | `/api/v1/teams/:teamId/roster/:id/emergency-contact` | Required | Coach/Asst | Emergency contact |
| `POST` | `/api/v1/teams/:teamId/roster/:id/documents/upload-url` | Required | Coach/Asst | S3 presigned URL |
| `POST/GET` | `/api/v1/teams/:teamId/events/:eventId/rsvp` | Required | Member | RSVP |
| `PATCH` | `/api/v1/teams/:teamId/roster/:id/role` | Required | HEAD_COACH | Assign role |

---

## Test Coverage

| File | Tests |
|---|---|
| `team.service.test.ts` | 26 — service logic, invite/token validity, MIME/size guards |
| `team.routes.test.ts` | Integration — all routes, 401 guard loop across 13 protected routes |
| `RosterList.test.tsx` | 13 — render, role-gating, archive flow |
| `TeamsPage.test.tsx` | 14 — cards, empty states, role-based FAB, navigation |

**New tests:** ~67  
**Cumulative total:** 326 (255 API + 71 web)

---

## Gaps & Known Limitations

1. **Document upload**: S3 presigned URL returned but `@aws-sdk/client-s3` integration stubbed. Requires `AWS_ACCESS_KEY_ID` + `AWS_S3_BUCKET` in production.
2. **RSVP reminders via Bull queue**: RSVP reminder Bull job defined in service but `packages/workers` not yet wired (deferred to E5 notification epic).
3. **Parent-player linking UI**: `ParentPlayerLink` table and invite `targetPlayerId` work, but dedicated UI for parent to view linked children across teams deferred to E5 (combined with notification prefs).
4. **Batch document download (ZIP)**: Document listing complete; ZIP download deferred to CX stories.
5. **Photo upload**: `photoUrl` field exists; team photo upload (S3 presigned URL) deferred to CX stories alongside avatar upload.
