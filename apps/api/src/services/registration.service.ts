// E7 · Tournament Registration & Payments — Service Layer
// P6 CRITICAL: payment_status set to PAID only from Stripe webhook — NEVER from client redirect
// P4: Post-payment notifications go through Bull queue
// P8: Stripe webhook verified with stripe.webhooks.constructEvent + signing secret

import Stripe from 'stripe'
import { prisma } from '@diamondhub/db'
import { logger } from '../lib/logger.js'
import { config } from '../config.js'
import { getNotificationQueue } from '@diamondhub/workers'

function getStripe() {
  if (!config.STRIPE_SECRET_KEY) return null
  return new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })
}

export const registrationService = {

  // E7-S1: Start registration — creates pending record
  async startRegistration(coachId: string, tournamentId: string, teamId: string, division: string) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
    if (!tournament) throw new RegistrationError('TOURNAMENT_NOT_FOUND', 404)
    if (tournament.status === 'CLOSED' || tournament.status === 'CANCELLED') {
      throw new RegistrationError('TOURNAMENT_CLOSED', 400)
    }

    // Check not already registered
    const existing = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_teamId: { tournamentId, teamId } },
    })
    if (existing && existing.status === 'CONFIRMED') throw new RegistrationError('ALREADY_REGISTERED', 409)

    // Check if full — go to waitlist
    const isWaitlist = tournament.maxTeams !== null && tournament.currentTeams >= tournament.maxTeams

    // Create or update registration record
    const registration = await prisma.tournamentRegistration.upsert({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      update: { status: isWaitlist ? 'WAITLISTED' : 'PENDING_PAYMENT', division },
      create: {
        tournamentId,
        teamId,
        division,
        status: isWaitlist ? 'WAITLISTED' : 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        entryFeePaid: 0,
      },
    })

    if (isWaitlist) {
      // Calculate waitlist position
      const waitlistCount = await prisma.tournamentRegistration.count({
        where: { tournamentId, status: 'WAITLISTED' },
      })
      await prisma.tournamentRegistration.update({
        where: { id: registration.id },
        data: { waitlistPosition: waitlistCount },
      })
      logger.info({ registrationId: registration.id, tournamentId, teamId }, 'Added to waitlist')
      return { registration: { ...registration, waitlistPosition: waitlistCount }, isWaitlist: true }
    }

    // E7-S2: Create Stripe PaymentIntent
    const stripe = getStripe()
    let clientSecret: string | null = null

    if (stripe && Number(tournament.entryFee) > 0) {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(tournament.entryFee) * 100), // cents
        currency: 'usd',
        metadata: {
          registrationId: registration.id,
          tournamentId,
          teamId,
          coachId,
        },
        description: `DiamondHub: ${tournament.name} entry fee`,
      })
      await prisma.tournamentRegistration.update({
        where: { id: registration.id },
        data: { stripePaymentIntentId: paymentIntent.id },
      })
      clientSecret = paymentIntent.client_secret
    } else if (Number(tournament.entryFee) === 0) {
      // Free tournament — auto-confirm
      await prisma.$transaction([
        prisma.tournamentRegistration.update({
          where: { id: registration.id },
          data: { status: 'CONFIRMED', paymentStatus: 'PAID', confirmedAt: new Date() },
        }),
        prisma.tournament.update({
          where: { id: tournamentId },
          data: { currentTeams: { increment: 1 } },
        }),
      ])
      await getNotificationQueue().add('registration-confirmed', {
        type: 'REGISTRATION_CONFIRMED',
        userIds: [coachId],
        title: 'Registration confirmed!',
        body: `You're registered for ${tournament.name}`,
        data: { tournamentId, teamId, registrationId: registration.id },
        channels: ['push', 'in_app', 'email'],
      })
      logger.info({ registrationId: registration.id }, 'Free tournament registration confirmed')
      return { registration, isWaitlist: false, clientSecret: null, free: true }
    }

    return { registration, isWaitlist: false, clientSecret }
  },

  // E7-S2: Handle Stripe webhook — P6 compliance
  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const stripe = getStripe()
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
      logger.warn('Stripe webhook received but Stripe not configured')
      return
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      throw new RegistrationError('INVALID_SIGNATURE', 400)
    }

    logger.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received')

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        await registrationService._confirmPayment(pi.id, Number(pi.amount) / 100)
        break
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const reg = await prisma.tournamentRegistration.findFirst({
          where: { stripePaymentIntentId: pi.id },
        })
        if (reg) {
          logger.warn({ registrationId: reg.id, piId: pi.id }, 'Payment failed')
        }
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const reg = await prisma.tournamentRegistration.findFirst({
          where: { stripePaymentIntentId: charge.payment_intent as string },
        })
        if (reg) {
          await prisma.tournamentRegistration.update({
            where: { id: reg.id },
            data: { paymentStatus: 'REFUNDED', status: 'WITHDRAWN' },
          })
        }
        break
      }
    }
  },

  async _confirmPayment(paymentIntentId: string, amountPaid: number) {
    const reg = await prisma.tournamentRegistration.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { tournament: { select: { name: true, id: true } }, team: { select: { coachId: true } } },
    })
    if (!reg) {
      logger.warn({ paymentIntentId }, 'PaymentIntent has no matching registration')
      return
    }

    await prisma.$transaction([
      prisma.tournamentRegistration.update({
        where: { id: reg.id },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          entryFeePaid: amountPaid,
          confirmedAt: new Date(),
        },
      }),
      prisma.tournament.update({
        where: { id: reg.tournamentId },
        data: { currentTeams: { increment: 1 } },
      }),
    ])

    // P4: Send notification via queue
    await getNotificationQueue().add('registration-confirmed', {
      type: 'REGISTRATION_CONFIRMED',
      userIds: [reg.team.coachId],
      title: 'Registration confirmed!',
      body: `Payment received. You're registered for ${reg.tournament.name}`,
      data: { tournamentId: reg.tournamentId, teamId: reg.teamId, registrationId: reg.id },
      channels: ['push', 'in_app', 'email'],
    })

    logger.info({ registrationId: reg.id, amountPaid }, 'Registration confirmed via payment')
  },

  // E7-S3: Waitlist management
  async withdrawRegistration(registrationId: string, teamId: string) {
    const reg = await prisma.tournamentRegistration.findUnique({
      where: { id: registrationId, teamId },
    })
    if (!reg) throw new RegistrationError('NOT_FOUND', 404)

    await prisma.$transaction(async (tx) => {
      await tx.tournamentRegistration.update({
        where: { id: registrationId },
        data: { status: 'WITHDRAWN' },
      })
      if (reg.status === 'CONFIRMED') {
        await tx.tournament.update({
          where: { id: reg.tournamentId },
          data: { currentTeams: { decrement: 1 } },
        })
      }
    })

    // Promote next waitlisted team (P4: via queue)
    await registrationService._promoteWaitlist(reg.tournamentId)
    logger.info({ registrationId, teamId }, 'Registration withdrawn')
  },

  async _promoteWaitlist(tournamentId: string) {
    const next = await prisma.tournamentRegistration.findFirst({
      where: { tournamentId, status: 'WAITLISTED' },
      orderBy: { waitlistPosition: 'asc' },
      include: { team: { select: { coachId: true } } },
    })
    if (!next) return

    await getNotificationQueue().add('waitlist-spot-open', {
      type: 'WAITLIST_SPOT_OPEN',
      userIds: [next.team.coachId],
      title: 'Spot available!',
      body: 'A spot opened up in your waitlisted tournament. Complete payment within 24 hours.',
      data: { registrationId: next.id, tournamentId, expiresInHours: 24 },
      channels: ['push', 'sms', 'in_app', 'email'],
    })
  },

  // E7-S4: Roster lock + age eligibility check
  async lockRoster(registrationId: string, teamId: string) {
    const reg = await prisma.tournamentRegistration.findUnique({
      where: { id: registrationId, teamId },
      include: { tournament: { select: { ageDivisions: true, startDate: true } } },
    })
    if (!reg) throw new RegistrationError('NOT_FOUND', 404)
    if (reg.paymentStatus !== 'PAID') throw new RegistrationError('PAYMENT_REQUIRED', 402)

    // Age eligibility check
    const players = await prisma.player.findMany({
      where: { teamId, user: { teamMemberships: { some: { teamId, status: 'ACTIVE' } } } },
      select: { id: true, dateOfBirth: true, user: { select: { name: true } } },
    })

    const violations: Array<{ playerName: string; age: number }> = []
    const tournamentYear = reg.tournament.startDate.getFullYear()
    for (const player of players) {
      if (!player.dateOfBirth) continue
      const birthYear = player.dateOfBirth.getFullYear()
      const age = tournamentYear - birthYear
      const divisionAge = parseInt(reg.tournament.ageDivisions[0]?.replace('U', '') ?? '99', 10)
      if (age > divisionAge) {
        violations.push({ playerName: player.user.name, age })
      }
    }

    if (violations.length > 0) {
      logger.warn({ registrationId, violations }, 'Age eligibility violations on roster lock attempt')
      return { locked: false, violations }
    }

    await prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: { rosterLocked: true, rosterLockedAt: new Date() },
    })
    return { locked: true, violations: [] }
  },

  // E7-S5: Get registrations for a team
  async getTeamRegistrations(teamId: string) {
    return prisma.tournamentRegistration.findMany({
      where: { teamId },
      include: {
        tournament: {
          select: { id: true, name: true, startDate: true, endDate: true, city: true, state: true, organizer: true }
        },
      },
      orderBy: [
        { status: 'asc' }, // CONFIRMED first
        { tournament: { startDate: 'asc' } }, // Then by upcoming date
      ],
    })
  },

  // E7-S6: Payment history
  async getPaymentHistory(teamId: string) {
    return prisma.tournamentRegistration.findMany({
      where: { teamId, paymentStatus: 'PAID' },
      include: { tournament: { select: { name: true, startDate: true } } },
      orderBy: { confirmedAt: 'desc' },
    })
  },
}

export class RegistrationError extends Error {
  constructor(public code: string, public statusCode: number) {
    super(code)
    this.name = 'RegistrationError'
  }
}
