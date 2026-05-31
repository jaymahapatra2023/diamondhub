// E7 · Registration Service Unit Tests
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registrationService, RegistrationError } from '../registration.service.js'
import { prisma } from '@diamondhub/db'

// Mock Stripe
vi.mock('stripe', () => {
  const mockPaymentIntents = {
    create: vi.fn(),
  }
  const mockWebhooks = {
    constructEvent: vi.fn(),
  }
  const MockStripe = vi.fn(() => ({
    paymentIntents: mockPaymentIntents,
    webhooks: mockWebhooks,
  }))
  return { default: MockStripe }
})

// Mock workers queue
vi.mock('@diamondhub/workers', () => ({
  getNotificationQueue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
    NODE_ENV: 'test',
  },
}))

const { getNotificationQueue } = await import('@diamondhub/workers')
import Stripe from 'stripe'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TOURNAMENT_ID = 'tournament-uuid-1'
const TEAM_ID = 'team-uuid-1'
const COACH_ID = 'coach-uuid-1'
const REGISTRATION_ID = 'reg-uuid-1'

const baseTournament = {
  id: TOURNAMENT_ID,
  name: 'Test Open 2026',
  status: 'OPEN',
  entryFee: '495.00',
  maxTeams: 16,
  currentTeams: 8,
  ageDivisions: ['12U'],
  startDate: new Date('2026-07-10'),
  endDate: new Date('2026-07-12'),
}

const baseRegistration = {
  id: REGISTRATION_ID,
  tournamentId: TOURNAMENT_ID,
  teamId: TEAM_ID,
  division: '12U',
  status: 'PENDING_PAYMENT',
  paymentStatus: 'UNPAID',
  waitlistPosition: null,
  stripePaymentIntentId: null,
  entryFeePaid: '0.00',
  rosterLocked: false,
  rosterLockedAt: null,
  registeredAt: new Date(),
  confirmedAt: null,
  notes: null,
}

// ── startRegistration ─────────────────────────────────────────────────────────

describe('registrationService.startRegistration', () => {
  it('creates a PENDING_PAYMENT record for an open tournament', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValue(baseTournament as any)
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.tournamentRegistration.upsert).mockResolvedValue(baseRegistration as any)

    const MockStripeInstance = vi.mocked(Stripe).mock.results[0]?.value ?? new (vi.mocked(Stripe))()
    MockStripeInstance.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    })
    vi.mocked(prisma.tournamentRegistration.update).mockResolvedValue(baseRegistration as any)

    const result = await registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')

    expect(prisma.tournamentRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'PENDING_PAYMENT' }),
        update: expect.objectContaining({ status: 'PENDING_PAYMENT' }),
      })
    )
    expect(result.isWaitlist).toBe(false)
  })

  it('creates a WAITLISTED record when tournament is full', async () => {
    const fullTournament = { ...baseTournament, currentTeams: 16, maxTeams: 16 }
    vi.mocked(prisma.tournament.findUnique).mockResolvedValue(fullTournament as any)
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(null)
    const waitlistedReg = { ...baseRegistration, status: 'WAITLISTED' }
    vi.mocked(prisma.tournamentRegistration.upsert).mockResolvedValue(waitlistedReg as any)
    vi.mocked(prisma.tournamentRegistration.count).mockResolvedValue(1)
    vi.mocked(prisma.tournamentRegistration.update).mockResolvedValue({ ...waitlistedReg, waitlistPosition: 1 } as any)

    const result = await registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')

    expect(prisma.tournamentRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'WAITLISTED' }),
      })
    )
    expect(result.isWaitlist).toBe(true)
  })

  it('creates a Stripe PaymentIntent when Stripe is configured and fee > 0', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValue(baseTournament as any)
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.tournamentRegistration.upsert).mockResolvedValue(baseRegistration as any)

    // Get the Stripe instance that was created (or create one)
    const stripe = new (vi.mocked(Stripe))('key', {} as any)
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: 'pi_test_456',
      client_secret: 'pi_test_456_secret',
    } as any)
    vi.mocked(prisma.tournamentRegistration.update).mockResolvedValue({
      ...baseRegistration,
      stripePaymentIntentId: 'pi_test_456',
    } as any)

    const result = await registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')

    expect(result.clientSecret).toBeDefined()
  })

  it('auto-confirms and sends notification for free tournament (entryFee=0)', async () => {
    const freeTournament = { ...baseTournament, entryFee: '0' }
    vi.mocked(prisma.tournament.findUnique).mockResolvedValue(freeTournament as any)
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.tournamentRegistration.upsert).mockResolvedValue(baseRegistration as any)
    vi.mocked(prisma.$transaction).mockResolvedValue([undefined, undefined] as any)

    const mockQueue = { add: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(getNotificationQueue).mockReturnValue(mockQueue as any)

    const result = await registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')

    expect(prisma.$transaction).toHaveBeenCalled()
    expect(mockQueue.add).toHaveBeenCalledWith(
      'registration-confirmed',
      expect.objectContaining({ type: 'REGISTRATION_CONFIRMED' })
    )
    expect(result.free).toBe(true)
    expect(result.clientSecret).toBeNull()
  })

  it('throws ALREADY_REGISTERED for duplicate confirmed registration', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValue(baseTournament as any)
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue({
      ...baseRegistration,
      status: 'CONFIRMED',
    } as any)

    await expect(
      registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')
    ).rejects.toThrow(RegistrationError)

    await expect(
      registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')
    ).rejects.toMatchObject({ code: 'ALREADY_REGISTERED', statusCode: 409 })
  })

  it('throws TOURNAMENT_NOT_FOUND when tournament does not exist', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValue(null)

    await expect(
      registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')
    ).rejects.toMatchObject({ code: 'TOURNAMENT_NOT_FOUND', statusCode: 404 })
  })

  it('throws TOURNAMENT_CLOSED when tournament status is CLOSED', async () => {
    vi.mocked(prisma.tournament.findUnique).mockResolvedValue({
      ...baseTournament,
      status: 'CLOSED',
    } as any)

    await expect(
      registrationService.startRegistration(COACH_ID, TOURNAMENT_ID, TEAM_ID, '12U')
    ).rejects.toMatchObject({ code: 'TOURNAMENT_CLOSED', statusCode: 400 })
  })
})

// ── handleStripeWebhook ───────────────────────────────────────────────────────

describe('registrationService.handleStripeWebhook', () => {
  it('throws INVALID_SIGNATURE for bad signature', async () => {
    const stripe = new (vi.mocked(Stripe))('key', {} as any)
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })

    await expect(
      registrationService.handleStripeWebhook(Buffer.from('{}'), 'bad-sig')
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE', statusCode: 400 })
  })

  it('calls _confirmPayment on payment_intent.succeeded event', async () => {
    const stripe = new (vi.mocked(Stripe))('key', {} as any)
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: 'evt_test',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_succeeded_123',
          amount: 49500,
        },
      },
    } as any)

    // Mock the registration lookup for _confirmPayment
    vi.mocked(prisma.tournamentRegistration.findFirst).mockResolvedValue({
      ...baseRegistration,
      tournament: { name: 'Test Open 2026', id: TOURNAMENT_ID },
      team: { coachId: COACH_ID },
    } as any)
    vi.mocked(prisma.$transaction).mockResolvedValue([undefined, undefined] as any)
    const mockQueue = { add: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(getNotificationQueue).mockReturnValue(mockQueue as any)

    await registrationService.handleStripeWebhook(Buffer.from('raw'), 'valid-sig')

    expect(mockQueue.add).toHaveBeenCalledWith(
      'registration-confirmed',
      expect.objectContaining({ type: 'REGISTRATION_CONFIRMED' })
    )
  })
})

// ── _confirmPayment ───────────────────────────────────────────────────────────

describe('registrationService._confirmPayment', () => {
  it('sets CONFIRMED + PAID, increments currentTeams, enqueues notification', async () => {
    vi.mocked(prisma.tournamentRegistration.findFirst).mockResolvedValue({
      ...baseRegistration,
      status: 'PENDING_PAYMENT',
      tournament: { name: 'Test Open 2026', id: TOURNAMENT_ID },
      team: { coachId: COACH_ID },
    } as any)
    vi.mocked(prisma.$transaction).mockResolvedValue([undefined, undefined] as any)

    const mockQueue = { add: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(getNotificationQueue).mockReturnValue(mockQueue as any)

    await registrationService._confirmPayment('pi_test_confirm', 495)

    // $transaction was called with an array (array-form transaction)
    expect(prisma.$transaction).toHaveBeenCalled()
    const txCall = vi.mocked(prisma.$transaction).mock.calls[0]?.[0]
    expect(Array.isArray(txCall)).toBe(true)
    expect(mockQueue.add).toHaveBeenCalledWith(
      'registration-confirmed',
      expect.objectContaining({
        type: 'REGISTRATION_CONFIRMED',
        userIds: [COACH_ID],
      })
    )
  })

  it('logs a warning and returns early when no registration found for paymentIntentId', async () => {
    vi.mocked(prisma.tournamentRegistration.findFirst).mockResolvedValue(null)

    await expect(
      registrationService._confirmPayment('pi_missing', 100)
    ).resolves.toBeUndefined()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

// ── withdrawRegistration ──────────────────────────────────────────────────────

describe('registrationService.withdrawRegistration', () => {
  it('sets status to WITHDRAWN', async () => {
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue({
      ...baseRegistration,
      status: 'PENDING_PAYMENT',
    } as any)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      await fn({
        tournamentRegistration: { update: vi.fn().mockResolvedValue(undefined) },
        tournament: { update: vi.fn().mockResolvedValue(undefined) },
      })
    })
    vi.mocked(prisma.tournamentRegistration.findFirst).mockResolvedValue(null) // no waitlist

    await registrationService.withdrawRegistration(REGISTRATION_ID, TEAM_ID)

    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('decrements currentTeams if registration was CONFIRMED', async () => {
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue({
      ...baseRegistration,
      status: 'CONFIRMED',
      tournamentId: TOURNAMENT_ID,
    } as any)

    const txUpdate = vi.fn().mockResolvedValue(undefined)
    const txTournamentUpdate = vi.fn().mockResolvedValue(undefined)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      await fn({
        tournamentRegistration: { update: txUpdate },
        tournament: { update: txTournamentUpdate },
      })
    })
    vi.mocked(prisma.tournamentRegistration.findFirst).mockResolvedValue(null)

    await registrationService.withdrawRegistration(REGISTRATION_ID, TEAM_ID)

    expect(txTournamentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { currentTeams: { decrement: 1 } },
      })
    )
  })

  it('throws NOT_FOUND when registration does not exist', async () => {
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(null)

    await expect(
      registrationService.withdrawRegistration('bad-id', TEAM_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// ── lockRoster ────────────────────────────────────────────────────────────────

describe('registrationService.lockRoster', () => {
  const baseRegWithTournament = {
    ...baseRegistration,
    paymentStatus: 'PAID',
    tournament: {
      ageDivisions: ['12U'],
      startDate: new Date('2026-07-10'),
    },
  }

  it('returns violations for over-age players', async () => {
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(baseRegWithTournament as any)
    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        id: 'p1',
        dateOfBirth: new Date('2008-01-01'), // born 2008 → age 18 in 2026 — clearly over 12U
        user: { name: 'Old Player' },
      },
    ] as any)

    const result = await registrationService.lockRoster(REGISTRATION_ID, TEAM_ID)

    expect(result.locked).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toMatchObject({
      playerName: 'Old Player',
      age: expect.any(Number),
    })
    expect(result.violations[0].age).toBeGreaterThan(12)
  })

  it('sets rosterLocked=true when no violations', async () => {
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(baseRegWithTournament as any)
    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        id: 'p2',
        dateOfBirth: new Date('2015-06-01'), // age 11 in 2026 — under 12U OK
        user: { name: 'Young Player' },
      },
    ] as any)
    vi.mocked(prisma.tournamentRegistration.update).mockResolvedValue({
      ...baseRegistration,
      rosterLocked: true,
    } as any)

    const result = await registrationService.lockRoster(REGISTRATION_ID, TEAM_ID)

    expect(result.locked).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(prisma.tournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rosterLocked: true }),
      })
    )
  })

  it('throws PAYMENT_REQUIRED when payment is not PAID', async () => {
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue({
      ...baseRegWithTournament,
      paymentStatus: 'UNPAID',
    } as any)

    await expect(
      registrationService.lockRoster(REGISTRATION_ID, TEAM_ID)
    ).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED', statusCode: 402 })
  })

  it('throws NOT_FOUND when registration does not exist', async () => {
    vi.mocked(prisma.tournamentRegistration.findUnique).mockResolvedValue(null)

    await expect(
      registrationService.lockRoster('bad-id', TEAM_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// ── getTeamRegistrations ──────────────────────────────────────────────────────

describe('registrationService.getTeamRegistrations', () => {
  it('returns list with tournament info', async () => {
    const mockResult = [
      {
        ...baseRegistration,
        tournament: {
          id: TOURNAMENT_ID,
          name: 'Test Open 2026',
          startDate: new Date('2026-07-10'),
          endDate: new Date('2026-07-12'),
          city: 'Atlanta',
          state: 'GA',
          organizer: 'PERFECT_GAME',
        },
      },
    ]
    vi.mocked(prisma.tournamentRegistration.findMany).mockResolvedValue(mockResult as any)

    const result = await registrationService.getTeamRegistrations(TEAM_ID)

    expect(result).toHaveLength(1)
    expect(result[0].tournament.name).toBe('Test Open 2026')
    expect(prisma.tournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: TEAM_ID } })
    )
  })
})
