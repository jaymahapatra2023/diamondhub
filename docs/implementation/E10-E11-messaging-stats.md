# E10 & E11 · Communication & Player Stats — Implementation Summary

**Status:** COMPLETE | **Completed:** 2026-05-30

## E10 Stories
- E10-S1: Team Announcements ✅ — coach broadcasts, pinned first, read receipt count
- E10-S2: Team Group Chat ✅ — Socket.io real-time, message bubbles, coach delete any
- E10-S3: Direct Message ✅ — coach↔parent DM thread, read receipts
- E10-S4: Message Inbox ✅ — unified inbox across all teams, unread counts

## E11 Stories
- E11-S1: Player Stats Entry ✅ — per-game per-player, upsert
- E11-S2: Season Stats Summary ✅ — BA/ERA/SLG calculated, game-by-game breakdown
- E11-S3: Team Record ✅ — W/L/T + tournament finish history

## Architecture Notes
- Messages use Socket.io rooms `team:{teamId}` and `dm:{userId1}:{userId2}` for real-time (P3 progressive)
- vi.hoisted() used in test to safely reference mock functions inside vi.mock() factory
- Baseball batting average formatted as `.333` not `0.333` (strip leading zero)

## Files Created
Backend: message.service.ts, player-stats.service.ts, routes/v1/messages/, routes/v1/player-stats/
Frontend: MessageBubble, AnnouncementCard, MessagesPage, PlayerStatsPage, TeamRecordPage, admin/AdminTournamentPage

## Test Coverage
New tests: 55 backend + 24 frontend = 79
Cumulative: 600 API + 154 web = 754

## Bug Fixed
- scrollIntoView not in jsdom: added `window.HTMLElement.prototype.scrollIntoView = vi.fn()` to web test setup
