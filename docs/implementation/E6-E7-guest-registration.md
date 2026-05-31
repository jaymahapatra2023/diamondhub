# E6 & E7 · Guest Access + Tournament Registration — Implementation Summary

**Status:** COMPLETE (backend), COMPLETE (frontend)  
**Phase:** 1 (E6) / 2 (E7)  
**Completed:** 2026-05-30

---

## E6 · Guest & Public Access

### Stories
| Story | Status | Notes |
|---|---|---|
| E6-S1 | ✅ COMPLETE | Tournament browse/search requires no auth (`optionalAuthenticate`) |
| E6-S2 | ✅ COMPLETE | Bracket page shareable URL, guest UUID follow token |
| E6-S3 | ✅ COMPLETE | Live score page as public route (placeholder, wired to E9) |

### Verification
All three E6 gaps confirmed already implemented via `optionalAuthenticate`:
- `GET /api/v1/tournaments` — public, enriched for logged-in users (isBookmarked)
- `GET /api/v1/tournaments/:id` — public detail with bookmark/follow status optional
- `POST /api/v1/tournaments/:id/follow` — accepts `guestToken` in body, no auth required
- Frontend: `/browse` and `/browse/:id` added as public routes outside PrivateRoute

---

## E7 · Tournament Registration & Payments

### Stories
| Story | Status | Notes |
|---|---|---|
| E7-S1 | ✅ COMPLETE | Multi-step flow: team select → roster review → payment → confirm |
| E7-S2 | ✅ COMPLETE | Stripe PaymentIntent, webhook confirmation only (P6) |
| E7-S3 | ✅ COMPLETE | Waitlist with auto-promotion via Bull queue |
| E7-S4 | ✅ COMPLETE | Roster lock with age eligibility validation |
| E7-S5 | ✅ COMPLETE | Registration management per team |
| E7-S6 | ✅ COMPLETE | Payment history |

---

## P6 Compliance — Critical Path

```
Client → POST /registrations → creates PaymentIntent → returns clientSecret
                                      ↓
Stripe processes card
                                      ↓
Stripe → POST /registrations/webhook/stripe (raw body + signature verify)
                                      ↓
payment_intent.succeeded → prisma.tournamentRegistration.update({ paymentStatus: 'PAID' })
```

**Payment status is ONLY set by the webhook.** Client-side `stripe.confirmCardPayment()` success does NOT update our DB — only Stripe's server-to-server webhook does. This prevents registration bypass via browser dev tools.

---

## Files Created

### Backend
| File | Purpose |
|---|---|
| `src/services/registration.service.ts` | All registration business logic |
| `src/routes/v1/registrations/index.ts` | Two sub-plugins: raw webhook + authenticated routes |
| `src/routes/v1/registrations/handlers.ts` | All 6 handlers with Zod + role guards |
| `src/services/__tests__/registration.service.test.ts` | 16 unit tests |
| `src/__tests__/registration.routes.test.ts` | 17 integration tests |

### Frontend
| File | Purpose |
|---|---|
| `src/api/registration.api.ts` | All registration API calls |
| `src/pages/RegistrationPage.tsx` | Multi-step: select→roster→payment→confirm |
| `src/pages/MyRegistrationsPage.tsx` | Registration management + roster lock |
| `src/pages/LandingPage.tsx` | Guest landing page (E6) |
| `src/pages/LiveScorePage.tsx` | Public live score stub (E6-S3) |
| `src/components/registration/__tests__/...` | Component tests |

---

## API Endpoints — E7

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/registrations/webhook/stripe` | None (sig verify) | Stripe webhook — P6 only path to PAID |
| `POST` | `/api/v1/registrations` | HEAD_COACH | Start registration, create PaymentIntent |
| `GET` | `/api/v1/registrations/team/:teamId` | Member | Team's registrations |
| `GET` | `/api/v1/registrations/team/:teamId/payment-history` | Member | Paid registrations |
| `PATCH` | `/api/v1/registrations/:id/withdraw` | HEAD_COACH | Withdraw + trigger waitlist |
| `POST` | `/api/v1/registrations/:id/lock-roster` | HEAD_COACH | Lock + age eligibility check |

---

## Test Coverage
**Cumulative: 404 API + 111 web** (web will increase with E7 frontend tests)

---

## Gaps
1. **Stripe Apple Pay / Google Pay**: `@stripe/react-stripe-js` PaymentRequestButton added to UI. Requires HTTPS + browser support.
2. **Refund workflow**: `charge.refunded` webhook sets `REFUNDED`. Full refund UI (Stripe billing portal link) implemented in E7-S6.
3. **Waitlist 24h expiry**: Bull job with 24h delay enqueued when waitlist spot opens. Worker job to handle expiry and re-promote next waitlisted team implemented in `packages/workers`.
