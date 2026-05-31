# DiamondHub — Epics & User Stories

**Product:** Youth Travel Baseball & Softball Management Platform  
**Stack:** React (Vite/Expo) · Node.js (Fastify) · PostgreSQL + PostGIS · Redis · Socket.io  
**Last Updated:** 2026-05-30

---

## Story Format

```
As a [role], I want to [action], so that [outcome].

Acceptance Criteria:
  - AC1
  - AC2

Definition of Done:
  - Unit/integration tests passing
  - Mobile viewport tested (375px min)
  - Role-based access enforced
  - API contract documented
```

**Roles:** `coach` · `parent` · `player` · `guest`  
**Story Size:** XS (< 2h) · S (2–4h) · M (4–8h) · L (8–16h) · XL (> 16h — must be split)

---

## EPIC INDEX

| # | Epic | Phase | Priority |
|---|------|-------|----------|
| E1 | Authentication & Identity | 1 | P0 |
| E2 | Tournament Discovery & Search | 1 | P0 |
| E3 | Team Management | 1 | P0 |
| E4 | Schedule & Calendar | 1 | P1 |
| E5 | Notifications & Alerts | 1 | P1 |
| E6 | Guest & Public Access | 1 | P1 |
| E7 | Tournament Registration & Payments | 2 | P0 |
| E8 | Conflict Detection | 2 | P1 |
| E9 | Live Scoring & Brackets | 2 | P1 |
| E10 | Communication & Messaging | 2 | P2 |
| E11 | Player Profiles & Stats | 3 | P2 |
| E12 | Tournament Data Ingestion | 3 | P0 |
| E13 | Native Mobile (Expo) | 3 | P1 |
| E14 | Coach Analytics Dashboard | 3 | P2 |
| E15 | Organization / Club Admin | 3 | P2 |

---

## PHASE 1 — Foundation (Weeks 1–10)

---

## E1 · Authentication & Identity

**Goal:** Secure, role-aware auth. One account supports multiple roles. No anonymous writes.

### E1-S1 · Email Registration (M)
As any user, I want to register with email and password so that I have a secure account.

**AC:**
- Email uniqueness enforced at DB level
- Password hashed with bcrypt (rounds ≥ 12)
- Verification email sent on registration (SendGrid)
- Unverified accounts cannot access protected routes
- Returns JWT access token (15 min) + refresh token (30 days, httpOnly cookie)

### E1-S2 · Email Login (S)
As any user, I want to log in with email and password so that I can access my account.

**AC:**
- Invalid credentials return 401 with generic message (no user enumeration)
- Max 5 failed attempts triggers 15-min lockout
- Successful login returns access + refresh tokens

### E1-S3 · Google OAuth Login (M)
As any user, I want to sign in with Google so that I don't need another password.

**AC:**
- Google Sign-In button on login + register screens
- New Google users auto-provisioned with basic profile
- Existing email matched to Google account with confirmation prompt

### E1-S4 · Apple Sign-In (M)
As an iOS user, I want to sign in with Apple so that I can use Face ID.

**AC:**
- Apple Sign-In compliant with App Store requirements
- Hide-my-email flows handled gracefully
- Available only in native app build (Phase 3 for full, web fallback for Phase 1)

### E1-S5 · JWT Refresh Flow (S)
As a logged-in user, I want my session to stay alive so that I don't lose work mid-game.

**AC:**
- Access token silently refreshed on 401 via interceptor
- Refresh token rotation on each use
- Revoked refresh tokens (logout, password change) immediately invalidate session

### E1-S6 · Role Assignment at Onboarding (M)
As a new user, I want to select my role (coach / parent / player) during onboarding so that I see the right interface immediately.

**AC:**
- Onboarding screen step 2: role selection with visual role cards
- Coach: prompted to create or join team
- Parent: prompted to link to child's team via invite code
- Player: prompted to join team via invite code
- Guest: skips registration entirely, read-only browse

### E1-S7 · Multi-Role Support (M)
As a user who is both a parent and an assistant coach, I want to switch roles without logging out so that I can act in both capacities.

**AC:**
- Role switcher in profile menu
- UI re-renders home screen and navigation on role switch
- JWT includes array of active roles; API enforces per-role permissions
- Audit log captures role at time of action

### E1-S8 · Password Reset (S)
As a user who forgot their password, I want a reset link emailed to me so that I can regain access.

**AC:**
- Reset token expires in 1 hour
- Token single-use (invalidated after use)
- New password meets complexity requirements (min 8 chars, 1 number)

### E1-S9 · Account Profile Management (S)
As any user, I want to edit my name, phone, avatar, and notification preferences so that my account stays current.

**AC:**
- Avatar upload to S3 with 2MB limit, JPEG/PNG only
- Phone number stored with E.164 format validation
- Changes saved optimistically with rollback on error

---

## E2 · Tournament Discovery & Search

**Goal:** Find any tournament — any organizer, any location, any age group — in under 10 seconds.

### E2-S1 · Basic Tournament Search (L)
As a coach or parent, I want to search tournaments by date range and location so that I can find events my team can attend.

**AC:**
- Search bar accepts: city name, state, ZIP code
- Date range picker (start + end date)
- Results return within 2 seconds for radius ≤ 100 miles
- Results show: tournament name, organizer, dates, location, age divisions, entry fee
- Empty state is helpful ("No USSSA events found within 50 miles — try expanding to 100 miles")

### E2-S2 · Radius / Map Search (L)
As a coach, I want to see tournaments on a map so that I can understand travel distance visually.

**AC:**
- Mapbox GL JS map with tournament pin clusters
- Tap pin → tournament summary card slides up
- "Near Me" uses device geolocation (permission requested)
- Toggle between map view and list view
- Map remembers last position across sessions

### E2-S3 · Advanced Filters (M)
As a coach, I want to filter tournaments by age division, sport, organizer, entry fee, and surface type so that I only see relevant events.

**AC:**
- Age division: multi-select (6U, 7U, 8U, 9U, 10U, 11U, 12U, 13U, 14U, 15U, 16U, 17U, 18U)
- Sport: Baseball / Softball / Both
- Organizer: Perfect Game, USSSA, Top Gun, SWAT, Impact, Triple Crown, TBS, Other
- Entry fee: range slider ($0–$2000)
- Surface: Turf / Grass / Mixed
- Filters persist across sessions (localStorage)
- Filter count badge on filter button

### E2-S4 · Tournament Detail Page (M)
As a coach, I want to see full tournament details so that I can decide whether to register.

**AC:**
- Page shows: name, organizer, sport, age divisions, format, dates, location (map embed), entry fee, max teams, spots remaining, registration deadline, surface, field count, hotel deal link, umpire info, registration URL
- "Register" button visible only to coaches (guests see "Sign in to register")
- Share button generates link + social card preview
- Bookmark button (star) available to all logged-in users

### E2-S5 · Tournament Bookmarks (S)
As a coach or parent, I want to bookmark tournaments I'm interested in so that I can revisit them later.

**AC:**
- Bookmark persists across sessions (server-side, not localStorage)
- Bookmarks page accessible from profile menu
- Remove bookmark with swipe-left or long-press

### E2-S6 · "This Weekend Near Me" Quick View (S)
As a parent on Friday afternoon, I want a one-tap view of tournaments happening this weekend near me so that I can see if there's something happening.

**AC:**
- Prominent card on home screen ("This Weekend, Within 50 miles")
- Auto-filters to current weekend (Fri–Sun) and device location
- Updates each Thursday at midnight

### E2-S7 · Tournament Following (Guest + Logged-in) (S)
As a guest spectator, I want to follow a tournament so that I receive bracket and score updates without an account.

**AC:**
- "Follow" available to guests (stored in browser via UUID token)
- Followed tournament alerts delivered via web push (no account required)
- Logged-in users: following synced to account

### E2-S8 · Search History & Suggestions (S)
As a repeat user, I want my recent searches remembered and smart suggestions offered so that I can find tournaments faster.

**AC:**
- Last 5 searches stored per user
- Autocomplete for city/state names
- "Teams like yours also registered for..." suggestions (Phase 2 — flag as future)

---

## E3 · Team Management

**Goal:** Coach manages unlimited teams with full roster control. Parents and players have appropriate visibility.

### E3-S1 · Create Team (S)
As a coach, I want to create a team with name, sport, age division, and season year so that I can start managing my roster.

**AC:**
- Required: name, sport (baseball/softball), age division, season year
- Optional: team photo, home field name, city
- Coach automatically assigned as team owner
- Team gets unique invite code (6-char alphanumeric)

### E3-S2 · Multi-Team Dashboard (M)
As a coach managing two age groups (e.g., 10U and 12U), I want a unified dashboard showing all my teams so that I can manage both without switching accounts.

**AC:**
- Home screen shows team cards for all teams coach owns or is assistant on
- Quick stats per team: roster count, next event, pending RSVPs
- "Add Team" CTA always visible
- Flat pricing — no paywall for additional teams

### E3-S3 · Roster Management (M)
As a coach, I want to add, edit, and remove players from my roster so that the team list stays accurate.

**AC:**
- Add player: first name, last name, jersey number, position(s), DOB, bats/throws
- Edit any player field inline
- Archive player (soft delete — preserves stats history)
- Roster shows active count vs. max allowed (configurable, e.g., 15 for tournaments)
- Duplicate jersey number = warning, not block

### E3-S4 · Player Invite Flow (M)
As a coach, I want to invite parents and players via email or invite link so that they can join the team and see the schedule.

**AC:**
- Generate invite link per team (expires in 7 days, single-use optional)
- Email invite sends branded email with one-click join
- Invitee creates account → role auto-assigned based on invitation type (parent/player)
- Coach sees pending invites and can revoke

### E3-S5 · Parent-Player Linking (M)
As a parent, I want to link my account to my child's player profile so that I only see my child's schedule and alerts.

**AC:**
- Parent joins via coach's invite link (which links to specific player)
- Parent can request linking to existing player with coach approval
- One parent account can link to multiple children (different teams)
- Parent home screen shows combined schedule for all linked children

### E3-S6 · Assign Assistant Coach (S)
As a head coach, I want to assign assistant coaches so that they can manage roster and events.

**AC:**
- Promote any team member to assistant coach role
- Assistant coach: can edit roster, post events, enter scores
- Assistant coach: cannot delete team, cannot change billing

### E3-S7 · Player Availability / RSVP (M)
As a coach, I want to see which players have RSVP'd for each event so that I know the lineup before game day.

**AC:**
- RSVP status per player per event: Yes / No / Maybe
- Parents can RSVP on behalf of their child
- Players (13+) can self-RSVP
- Coach sees aggregate: "11 Yes / 2 No / 2 No Response"
- Automated reminder push notification sent 48h before event to non-responders

### E3-S8 · Player Documents Vault (M)
As a coach, I want to store each player's birth certificate and waiver so that I can produce them at tournament check-in.

**AC:**
- Upload: birth certificate, medical release, tournament waiver (PDF/JPEG, 5MB max)
- Stored in S3 with server-side encryption
- Coach can download individual or batch-download as ZIP
- Document verified flag (coach manually marks after review)
- COPPA: no biometric or sensitive data for under-13 without parent consent

### E3-S9 · Emergency Contact Info (S)
As a coach, I want each player to have emergency contact info so that I can act quickly if someone is injured.

**AC:**
- Required for roster confirmation: contact name, relationship, phone 1, phone 2
- Visible to coach and assistant coaches only (not parents of other players)
- Quick-access "Emergency" button on player detail for one-tap dial

---

## E4 · Schedule & Calendar

**Goal:** One calendar showing all events — tournaments, practices, local games — for every team.

### E4-S1 · Team Calendar View (M)
As a coach or parent, I want a calendar showing all my team's events so that I can plan ahead.

**AC:**
- Month view (default) + week view + day view
- Events color-coded by type: tournament (blue), practice (green), game (red), meeting (gray)
- Multi-team coaches see events from all teams, color-coded per team
- Tap event → detail sheet slides up

### E4-S2 · Add Practice / Event (S)
As a coach, I want to add practices and team events to the schedule so that the whole team sees them.

**AC:**
- Required: title, type, date, start time, end time
- Optional: location (address with map preview), notes
- Event immediately visible to all team members
- Push notification sent on creation (configurable)

### E4-S3 · Edit / Cancel Event (S)
As a coach, I want to edit or cancel an event so that the team gets updated information.

**AC:**
- Edit: all fields editable
- Cancel: triggers "Event Cancelled" alert to all team members (push + in-app)
- Cancelled events shown as struck-through in calendar (not deleted)
- Reschedule creates new event + sends "Rescheduled" notification

### E4-S4 · Export to Google Calendar / Apple Calendar (M)
As a parent, I want to sync the team schedule to my phone's calendar so that I get native reminders.

**AC:**
- "Sync Calendar" button on schedule screen
- Generates `.ics` file for Apple Calendar / iCal
- Google Calendar: OAuth flow → create dedicated "DiamondHub" calendar in user's account
- Events push-updated on change (not just one-time export)
- Unsubscribe removes all DiamondHub events from external calendar

### E4-S5 · Event Detail with Directions (S)
As a parent, I want to tap an event and get turn-by-turn directions to the field so that I don't get lost.

**AC:**
- "Get Directions" opens native Maps app (Apple Maps / Google Maps) with pre-filled destination
- Field address, parking notes visible in event detail
- Field photo (if available from tournament record)

---

## E5 · Notifications & Alerts

**Goal:** Right message, right person, right channel, right time. Zero missed game changes.

### E5-S1 · Push Notification Infrastructure (L)
As the platform, I need to deliver push notifications to iOS, Android, and web browsers so that users get real-time alerts.

**AC:**
- Firebase Cloud Messaging (FCM) integrated for Android + web push
- APNs integrated for iOS (requires Apple developer cert)
- Device token stored per user per device in DB
- Multiple devices per user supported
- Dead token cleanup on FCM delivery failure (404 response)

### E5-S2 · In-App Notification Center (M)
As any logged-in user, I want a notification inbox in the app so that I can review past alerts.

**AC:**
- Bell icon in header with unread count badge
- Notification list: icon, title, body, timestamp (relative: "2 min ago")
- Tap notification → navigates to relevant screen (game, event, tournament)
- Mark individual or all-read
- Notifications retained for 30 days

### E5-S3 · Game Time Change Alert (M)
As a parent or player, I want an immediate push notification when a game time changes so that I can adjust plans.

**AC:**
- Triggered when coach or tournament admin updates `games.scheduled_time`
- Alert body: "Game time changed: Sat 9:00 AM → 11:30 AM, Field 3"
- Delivered to: all team members with RSVP = Yes or Maybe
- SMS also sent if user opted in to SMS for this alert type
- Alert fired within 30 seconds of DB change

### E5-S4 · Weather / Delay / Cancellation Alert (M)
As a team member, I want a push notification for rain delays and cancellations so that I don't drive to an empty field.

**AC:**
- Coach can trigger "Rain Delay", "Cancelled", "Fields Closed" broadcast
- Alert reaches all team members on that team regardless of RSVP
- Cancellation alert repeatable if games resume unexpectedly ("All clear — resumed 2:30 PM")

### E5-S5 · Bracket Update Alert (S)
As a coach or parent, I want a push notification when the bracket is updated showing our next game so that we know when and where to be.

**AC:**
- Triggered when game record changes status to `scheduled` with assigned field + time
- Alert body: "Next game set: vs. Tigers, 1:45 PM, Field 6"
- Delivered to registered team for that tournament

### E5-S6 · RSVP Reminder (S)
As a coach, I want automatic reminders sent to players who haven't RSVP'd so that I don't manually chase every parent.

**AC:**
- Configurable: 48h and 24h before event
- Only sent to users with RSVP = null (not yet responded)
- Coach can disable per event
- Reminder body includes event name, date, RSVP action button (deeplink)

### E5-S7 · New Tournament Near Me Alert (S)
As a coach, I want a weekly digest of new tournaments added in my saved search radius so that I don't miss registration windows.

**AC:**
- Runs every Monday morning 8am (user's local timezone)
- Filters by: coach's saved search preferences (division, sport, radius)
- Maximum 5 tournaments per digest
- "Unsubscribe from weekly digest" link in email footer

### E5-S8 · Notification Preferences (M)
As any user, I want granular control over which alerts I receive and via which channel so that I'm not overwhelmed.

**AC:**
- Settings screen: list of all alert types with toggle per channel (push / SMS / email)
- SMS toggle only available if phone number verified
- Coaches default: all channels on
- Parents default: push on, SMS on for game-time-change and cancellation only, email weekly digest
- Players default: push on, email off
- Preferences saved server-side (not device-local)

---

## E6 · Guest & Public Access

**Goal:** Zero-friction public access. No account required to discover and follow tournaments.

### E6-S1 · Public Tournament Browse (S)
As a guest, I want to browse and search tournaments without creating an account so that I can decide if the app is useful.

**AC:**
- Full search + map accessible without auth
- Tournament detail page publicly accessible
- "Register your team" CTAs prompt sign-up only when action requires account
- SEO: tournament pages server-rendered (Next.js or SSR) with structured data markup

### E6-S2 · Public Team Lookup (S)
As a spectator who doesn't know a player personally, I want to look up a team in a tournament bracket so that I can follow their games.

**AC:**
- Tournament bracket page publicly accessible via shareable URL
- Team names shown; player names shown only if team has public profile enabled
- Guest can follow team (browser-local UUID) to get score alerts

### E6-S3 · Live Score View for Guests (S)
As a grandparent who can't attend, I want to watch live scores for my grandchild's game so that I can follow along remotely.

**AC:**
- Shareable "live score" link per game generated by coach
- Score updates in real time via WebSocket (no auth needed for read-only)
- Shows: inning, score, last play entered (optional)
- Works on mobile browser, no app install required

---

## PHASE 2 — Registration + Real-Time (Weeks 11–20)

---

## E7 · Tournament Registration & Payments

**Goal:** End-to-end tournament registration inside the app. No external forms.

### E7-S1 · Registration Flow (L)
As a coach, I want to register my team for a tournament from the tournament detail page so that I don't have to leave the app.

**AC:**
- Step 1: Select team + division to register
- Step 2: Review roster (confirm eligible players — age verified vs. tournament DOB cutoff)
- Step 3: Payment (Stripe Checkout or in-app card form)
- Step 4: Confirmation screen with registration ID, receipt, calendar add CTA
- Partial registration (started but unpaid) persists for 24h

### E7-S2 · Stripe Payment Integration (L)
As a coach, I want to pay tournament entry fees securely by credit card so that registration is instant.

**AC:**
- Stripe Elements (card form embedded, no redirect)
- Apple Pay / Google Pay supported
- Payment receipt emailed to coach
- Stripe webhook handles payment confirmation (not client-side success)
- Failed payment shows actionable error (card declined, insufficient funds)
- PCI DSS: card data never touches DiamondHub servers (Stripe tokenization only)

### E7-S3 · Waitlist Management (M)
As a coach, I want to join a waitlist when a tournament is full so that I'm auto-notified and registered if a spot opens.

**AC:**
- "Join Waitlist" replaces "Register" when `current_teams >= max_teams`
- Waitlist position shown ("You are #3 on the waitlist")
- When team withdraws: next waitlisted team gets push + email notification with 24h window to confirm + pay
- Expired waitlist confirm → moves to next team

### E7-S4 · Roster Lock & Submission (M)
As a coach, I want to lock my tournament roster and submit it to the organizer format so that check-in is smooth.

**AC:**
- "Lock Roster" button available after payment confirmed
- Locked roster can be exported as PDF (standard tournament roster sheet format)
- Age eligibility validation on lock: flags players outside tournament age bracket
- Locked roster can be unlocked by coach up to registration deadline

### E7-S5 · Registration Management (M)
As a coach, I want to view and manage all my team's tournament registrations in one place so that I track what we've committed to.

**AC:**
- "My Registrations" tab in team view
- Status per registration: Pending Payment / Confirmed / Waitlisted / Withdrawn
- Upcoming registrations sorted by tournament date
- "Withdraw" action with confirmation; withdrawal policy shown (set by organizer)

### E7-S6 · Payment History (S)
As a coach or parent, I want to see a history of all tournament payments so that I can track season spending.

**AC:**
- Payment history per team: date, tournament, amount, status
- Export to CSV (for family budgeting or tax purposes)
- Stripe portal link for invoice management

---

## E8 · Conflict Detection

**Goal:** Auto-flag scheduling conflicts before they become day-of surprises.

### E8-S1 · Conflict Detection Engine (L)
As a coach managing two teams, I want the app to automatically detect when two events overlap so that I catch double-bookings before game day.

**AC:**
- Conflict = two events for same player or same coach overlap in time
- Conflict detected on: event creation, event edit, tournament registration
- Conflict types: player in two places at once, coach managing two teams at same time
- Conflicts shown as red indicator on calendar and event detail
- Conflict does not block action — warns only (coach decides)

### E8-S2 · Conflict Report for Coach (M)
As a coach managing 10U and 12U, I want a "conflicts this month" report so that I can proactively resolve scheduling issues.

**AC:**
- Coach dashboard widget: "X conflicts detected this month"
- Tap → list of conflicting events with player names
- Each conflict shows: event A, event B, players affected, overlap duration
- "Resolve" shortcut: opens event edit or allows canceling one event

### E8-S3 · Player Conflict Warning on RSVP (S)
As a parent, I want a warning when I RSVP yes to an event that overlaps with another confirmed event so that I can make an informed decision.

**AC:**
- Warning shown inline when parent attempts RSVP = Yes for overlapping event
- Warning shows: conflicting event name, date, time
- Parent can override (RSVP yes anyway) after seeing warning
- Coach notified when player accepts conflicting event

---

## E9 · Live Scoring & Brackets

**Goal:** Real-time scores visible to everyone — coaches, parents, guests — the moment they're entered.

### E9-S1 · Score Entry (M)
As a coach or designated scorekeeper, I want to enter runs scored per inning so that parents and spectators see live scores.

**AC:**
- Scorekeeper role assignable per game (coach or nominated parent)
- Simple inning-by-inning input: Home / Away runs per inning
- Input designed for one thumb, large tap targets
- Changes publish to WebSocket room `game:{id}` within 500ms
- Offline: score queued locally, syncs when connection returns

### E9-S2 · Live Score Display (M)
As a parent or spectator, I want to see live scores updating in real time so that I know what's happening even if I'm not at the field.

**AC:**
- Score view shows: inning grid, current inning/half indicator, total runs
- WebSocket-connected: scores update without page refresh
- Falls back to 30-second polling if WebSocket unavailable
- Last updated timestamp shown ("Updated 12s ago")

### E9-S3 · Bracket Display (L)
As a coach or parent, I want to see the full tournament bracket so that I know the path to the championship.

**AC:**
- Bracket renders: single elimination, double elimination, pool play + single elim
- Games show: team names, scheduled time, field, score (live/final)
- Current team highlighted in bracket
- Bracket scrollable horizontally on mobile
- Auto-advance: when final score entered, next round slot auto-populated

### E9-S4 · Pool Play Standings (M)
As a coach, I want to see real-time pool play standings so that I know our seeding for bracket play.

**AC:**
- Standings table: W-L-T, runs scored, runs allowed, run differential
- Tiebreaker rules displayed (head-to-head, run diff, etc.)
- Updates live as games finish
- "Current position" row highlighted

### E9-S5 · Game History (S)
As a coach, I want a full history of all tournament games my team has played so that I can review results.

**AC:**
- Game log per team: date, opponent, tournament, score, result (W/L/T)
- Filter by season, tournament, opponent
- Exportable as CSV

---

## E10 · Communication & Messaging

**Goal:** Reduce group text threads. All team comms in one place.

### E10-S1 · Team Announcements (M)
As a coach, I want to post announcements to my entire team so that everyone gets the same message.

**AC:**
- Announcement = one-way broadcast (coach → all team members)
- Delivered as: in-app notification + push
- Announcements pinnable (pinned shows at top of team feed)
- Recipients see read receipt count ("Seen by 14 of 16")

### E10-S2 · Team Group Chat (M)
As a team member, I want a group chat thread for my team so that casual discussion stays in the app.

**AC:**
- One chat thread per team
- All team members can send (coach can mute specific members)
- Messages show sender name + avatar + timestamp
- Image attachments (photos from the field), 10MB max
- Coach can delete any message
- Message history retained 90 days

### E10-S3 · Direct Message: Coach ↔ Parent (M)
As a parent, I want to message the coach privately so that I can discuss my child's situation without the full team seeing.

**AC:**
- DM thread created on first message
- Coach can see all DM threads from all parents in one inbox
- New DM triggers push notification to recipient
- Read receipts shown

### E10-S4 · Message Inbox (S)
As a coach managing multiple teams, I want a unified message inbox showing all unread messages across all teams so that I don't miss anything.

**AC:**
- Inbox sorted by most recent unread
- Team name shown per thread
- Unread count badge on nav icon
- Mark all read

---

## PHASE 3 — Scale & Native (Weeks 21–30)

---

## E11 · Player Profiles & Stats

### E11-S1 · Player Stats Entry (M)
As a coach, I want to enter basic batting and pitching stats for each game so that we have a season record.

**AC:**
- Per game, per player: AB, H, 2B, 3B, HR, RBI, BB, K (batting)
- Per game, per player: IP, H, ER, BB, K, W/L/S (pitching)
- Stats auto-calculate: BA = H/AB, ERA = (ER × 9) / IP
- Stats entry optional — not required to close a game

### E11-S2 · Player Season Stats Summary (S)
As a player or parent, I want to see my season stats so that I can track improvement.

**AC:**
- Career stats across all seasons
- Per-season breakdown
- Per-tournament breakdown
- Stats private by default; coach can make public

### E11-S3 · Team Record Page (S)
As a coach, I want a team win/loss record page so that I can share our tournament performance.

**AC:**
- Record per season: W-L-T overall, W-L-T in tournaments
- Tournament finishes: "Runner-up, Top Gun July Classic 2026"
- Shareable as image or link

---

## E12 · Tournament Data Ingestion

**Goal:** Real tournament data in the app — not just manually entered. This is the moat.

### E12-S1 · Admin Tournament Entry Interface (M)
As a platform admin, I want a form to manually add and edit tournament records so that we have accurate data before scrapers are ready.

**AC:**
- Full tournament record form (all fields from schema)
- Bulk import via CSV template
- Duplicate detection (same name + organizer + start date)
- Data source field: `manual` vs `scraped` vs `partner`

### E12-S2 · USSSA Event Scraper (L)
As the platform, I want to automatically ingest USSSA tournament listings so that coaches always have current data.

**AC:**
- Playwright worker scrapes USSSA public events page
- Fields extracted: name, dates, location, divisions, entry fee, registration URL
- Runs on schedule (daily at 3am)
- New records inserted; existing records updated if changed fields detected
- Scraper respects robots.txt; rate limited to ≤ 1 request/sec
- Failures logged; alert sent to admin if scraper errors for > 24h
- Data source = `scraped`; never overwrites `partner`-sourced records

### E12-S3 · Top Gun Sports Event Scraper (L)
Same spec as E12-S2, targeting Top Gun Sports public tournament listings.

### E12-S4 · Perfect Game Event Scraper (L)
Same spec as E12-S2, targeting Perfect Game public event listings.

### E12-S5 · Community Tournament Submission (M)
As a coach, I want to submit a tournament I found so that others in the community can discover it.

**AC:**
- "Submit a Tournament" form (same fields as admin form)
- Submission goes to moderation queue (not immediately public)
- Admin reviews + approves within 24h
- Submitter notified when approved
- Data source = `community`

### E12-S6 · Organizer Data Partnership Portal (XL)
As an organizer (e.g., SWAT, Impact), I want an admin portal to manage my tournament listings directly so that my data is always accurate.

**AC:**
- Organizer account type with own login
- Self-service: create, edit, publish tournaments
- Bulk upload via CSV
- Webhook integration for bracket/score pushes from their system
- Data source = `partner`; displayed with organizer badge
- Organizer can mark individual tournaments as "Registration Full"

---

## E13 · Native Mobile (Expo)

### E13-S1 · Expo React Native App Shell (L)
As a user on iOS or Android, I want a native app with smooth transitions and offline support so that the experience feels native.

**AC:**
- Expo managed workflow, EAS Build
- Shared API layer with web (same REST + WebSocket endpoints)
- Bottom tab navigation (native feel)
- Haptic feedback on key actions (score update, RSVP confirm)
- Offline: schedule cached in SQLite (expo-sqlite), readable without connectivity

### E13-S2 · Native Push Notification Permissions (M)
As a native app user, I want to be prompted to allow notifications at the right moment (not on first launch) so that I actually grant permission.

**AC:**
- Permission requested after user confirms first RSVP (contextual timing)
- iOS: soft prompt before native system prompt (explain why first)
- Android: permission request using expo-notifications
- Notification tap opens app to relevant screen via deeplink

### E13-S3 · App Store & Play Store Submission (M)
As the product, I need to be listed in the App Store and Play Store so that users can find and install the native app.

**AC:**
- App Store: Apple review guidelines compliance (privacy policy, COPPA disclosure, age rating)
- Play Store: content rating completed
- Screenshots for all required device sizes
- App icon and splash screen per brand guide

---

## E14 · Coach Analytics Dashboard

### E14-S1 · Season Cost Tracker (M)
As a coach or team parent coordinator, I want to see the total cost of the season so that I can communicate finances to families.

**AC:**
- Total spent: sum of all tournament entry fees paid via app
- Per-player cost share (entry fee ÷ roster size)
- Export to PDF for team treasurer

### E14-S2 · Attendance Rate (S)
As a coach, I want to see which players attend most consistently so that I can identify commitment issues.

**AC:**
- Per-player attendance rate: events attended / events scheduled × 100
- Filter by date range, event type
- "Players below 70% attendance" highlight

### E14-S3 · Tournament Win Rate (S)
As a coach, I want to see our win rate per tournament organizer so that I can evaluate which circuits fit our team best.

**AC:**
- Win rate breakdown: overall, per organizer, per season
- Average finish position per organizer (1st, 2nd, pool exit, etc.)

---

## E15 · Organization / Club Admin

### E15-S1 · Organization Account (L)
As a club director managing 6 teams, I want an organization account so that I can see all teams under one dashboard.

**AC:**
- Organization owner can add coaches by email
- Org dashboard: all teams, upcoming events, total registrations, total spend
- Org-level document templates (standard waiver for all teams)
- Org billing: single invoice for all teams (Club pricing tier)

### E15-S2 · Cross-Team Player Lookup (M)
As a club director, I want to see if a player is rostered on multiple teams so that I can manage eligibility.

**AC:**
- Player search across all org teams by name or DOB
- Flags: same player on two teams in same age division
- Export eligible player list per tournament

---

## CROSS-CUTTING STORIES

### CX-S1 · PWA Install Prompt (S)
As a mobile web user, I want to be prompted to install DiamondHub on my home screen so that it feels like a native app.

**AC:**
- `manifest.json` configured with app name, icons, theme color
- `beforeinstallprompt` event captured; shown after 3rd visit or after first RSVP
- Service worker caches app shell + schedule data

### CX-S2 · Offline Schedule View (M)
As a coach at a field with no signal, I want to view today's schedule without connectivity so that I know the game order.

**AC:**
- Today's events + next 7 days cached via service worker on last sync
- Offline banner shown: "You're offline — showing cached schedule (updated 2h ago)"
- Score entry queued offline, auto-synced on reconnect

### CX-S3 · Dark Mode (S)
As a user outdoors in sunlight, I want dark mode so that the screen is readable with glare.

**AC:**
- Respects OS preference by default (prefers-color-scheme)
- Manual override in settings
- All screens tested for WCAG AA contrast in both modes

### CX-S4 · Accessibility (M)
As a user with motor or visual impairment, I want DiamondHub to be accessible so that I can use it with assistive technology.

**AC:**
- All interactive elements have ARIA labels
- Minimum 44×44px touch targets
- Color is never the sole indicator of state (always icon + label)
- Screen reader tested on iOS VoiceOver and Android TalkBack

---

## RELEASE MAP

```
PHASE 1 — MVP (Weeks 1–10)
  Sprint 1–2:  E1 (Auth) + E6-S1 (Guest browse)
  Sprint 3–4:  E2 (Tournament search + map)
  Sprint 5–6:  E3 (Team management + roster)
  Sprint 7–8:  E4 (Schedule + calendar) + E5-S1/S2/S3/S6 (Push infra + key alerts)
  Sprint 9–10: E5 remaining + CX-S1/S2/S3 (PWA polish)

PHASE 2 — Registration + Real-Time (Weeks 11–20)
  Sprint 11–13: E7 (Registration + Stripe)
  Sprint 14–15: E8 (Conflict detection)
  Sprint 16–18: E9 (Live scoring + brackets)
  Sprint 19–20: E10 (Messaging) + E12-S1/S5 (Admin entry + community submit)

PHASE 3 — Scale + Native (Weeks 21–30)
  Sprint 21–23: E12-S2/S3/S4 (Scrapers) + E13 (Expo native)
  Sprint 24–26: E11 (Player stats) + E14 (Coach analytics)
  Sprint 27–30: E15 (Club admin) + E12-S6 (Organizer portal)
```

---

*Total stories: 68 across 15 epics.*  
*Each L/XL story must be decomposed into tasks before sprint commitment.*
