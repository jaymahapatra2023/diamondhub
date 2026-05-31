// E7 · Tournament Registration & Payments — Route Handlers
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '@diamondhub/db'
import { registrationService, RegistrationError } from '../../../services/registration.service.js'
import { logger } from '../../../lib/logger.js'

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const StartRegistrationBodySchema = z.object({
  tournamentId: z.string().uuid('tournamentId must be a UUID'),
  teamId: z.string().uuid('teamId must be a UUID'),
  division: z.string().min(1, 'division is required'),
})

const RegistrationIdParamsSchema = z.object({
  id: z.string().uuid('id must be a UUID'),
})

const TeamIdParamsSchema = z.object({
  teamId: z.string().uuid('teamId must be a UUID'),
})

// ── Error Helper ──────────────────────────────────────────────────────────────

function handleRegistrationError(err: unknown, reply: FastifyReply, context: string) {
  if (err instanceof RegistrationError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.code,
      message: err.message,
    })
  }
  logger.error({ err }, context)
  return reply.code(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  })
}

// ── POST /webhook/stripe ──────────────────────────────────────────────────────
// P8: Verified with stripe.webhooks.constructEvent + signing secret
// P6: This is the ONLY place payment_status is set to PAID

export async function stripeWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // Body is kept as raw Buffer by the custom content-type parser
  const rawBody = Buffer.isBuffer(request.body)
    ? request.body
    : Buffer.from(JSON.stringify(request.body))

  const signature = request.headers['stripe-signature'] as string

  if (!signature) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Missing stripe-signature header',
    })
  }

  try {
    await registrationService.handleStripeWebhook(rawBody, signature)
    return reply.code(200).send({ received: true })
  } catch (err) {
    if (err instanceof RegistrationError && err.code === 'INVALID_SIGNATURE') {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid Stripe signature',
      })
    }
    logger.error({ err }, 'Stripe webhook processing error')
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Webhook processing failed',
    })
  }
}

// ── POST / ────────────────────────────────────────────────────────────────────

export async function startRegistrationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = StartRegistrationBodySchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    })
  }

  const { tournamentId, teamId, division } = parsed.data
  const coachId = request.user!.sub

  // Verify requester is HEAD_COACH of the team
  const isHeadCoach = request.user!.roles.some(
    (r) => r.role === 'HEAD_COACH' && r.teamId === teamId,
  )
  if (!isHeadCoach) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only the head coach can register the team for a tournament',
    })
  }

  try {
    const result = await registrationService.startRegistration(coachId, tournamentId, teamId, division)
    return reply.code(201).send(result)
  } catch (err) {
    return handleRegistrationError(err, reply, 'startRegistration failed')
  }
}

// ── GET /team/:teamId ─────────────────────────────────────────────────────────

export async function getRegistrationsHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const parsed = TeamIdParamsSchema.safeParse(request.params)
  if (!parsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid teamId',
      details: parsed.error.flatten(),
    })
  }

  const { teamId } = parsed.data

  // Only allow coach/member of the team to view registrations
  const hasTeamAccess = request.user!.roles.some((r) => r.teamId === teamId)
  if (!hasTeamAccess) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You do not have access to this team',
    })
  }

  try {
    const registrations = await registrationService.getTeamRegistrations(teamId)
    return reply.code(200).send({ registrations, total: registrations.length })
  } catch (err) {
    return handleRegistrationError(err, reply, 'getTeamRegistrations failed')
  }
}

// ── GET /team/:teamId/payment-history ─────────────────────────────────────────

export async function getPaymentHistoryHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const parsed = TeamIdParamsSchema.safeParse(request.params)
  if (!parsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid teamId',
      details: parsed.error.flatten(),
    })
  }

  const { teamId } = parsed.data

  const hasTeamAccess = request.user!.roles.some((r) => r.teamId === teamId)
  if (!hasTeamAccess) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You do not have access to this team',
    })
  }

  try {
    const payments = await registrationService.getPaymentHistory(teamId)
    return reply.code(200).send({ payments, total: payments.length })
  } catch (err) {
    return handleRegistrationError(err, reply, 'getPaymentHistory failed')
  }
}

// ── PATCH /:id/withdraw ───────────────────────────────────────────────────────

export async function withdrawHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const parsed = RegistrationIdParamsSchema.safeParse(request.params)
  if (!parsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid registration id',
      details: parsed.error.flatten(),
    })
  }

  const { id: registrationId } = parsed.data

  // Get body for optional teamId; fall back to deriving from roles
  const bodyParsed = z.object({ teamId: z.string().uuid() }).safeParse(request.body)
  if (!bodyParsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'teamId is required in request body',
    })
  }

  const { teamId } = bodyParsed.data

  // Verify requester is HEAD_COACH of the team
  const isHeadCoach = request.user!.roles.some(
    (r) => r.role === 'HEAD_COACH' && r.teamId === teamId,
  )
  if (!isHeadCoach) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only the head coach can withdraw a team registration',
    })
  }

  try {
    await registrationService.withdrawRegistration(registrationId, teamId)
    return reply.code(200).send({ message: 'Registration withdrawn successfully' })
  } catch (err) {
    return handleRegistrationError(err, reply, 'withdrawRegistration failed')
  }
}

// ── PATCH /:id/unlock-roster ──────────────────────────────────────────────────

export async function unlockRosterHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { teamId: string } }>,
  reply: FastifyReply,
) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
  const { id: registrationId } = request.params
  const body = request.body as { teamId: string }

  const bodyParsed = z.object({ teamId: z.string().uuid() }).safeParse(body)
  if (!bodyParsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'teamId is required in request body',
    })
  }

  const { teamId } = bodyParsed.data

  const isHeadCoach = request.user.roles.some(
    (r) => r.role === 'HEAD_COACH' && r.teamId === teamId,
  )
  if (!isHeadCoach) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only the head coach can unlock the tournament roster',
    })
  }

  // Verify registration exists and deadline hasn't passed
  const reg = await prisma.tournamentRegistration.findUnique({
    where: { id: registrationId, teamId },
    include: { tournament: { select: { registrationDeadline: true, name: true } } },
  })
  if (!reg) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Registration not found' })
  }

  if (reg.tournament.registrationDeadline && reg.tournament.registrationDeadline < new Date()) {
    return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Registration deadline has passed' })
  }

  await prisma.tournamentRegistration.update({
    where: { id: registrationId },
    data: { rosterLocked: false, rosterLockedAt: null },
  })

  return reply.code(200).send({ message: 'Roster unlocked' })
}

// ── POST /:id/lock-roster ─────────────────────────────────────────────────────

export async function lockRosterHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const parsed = RegistrationIdParamsSchema.safeParse(request.params)
  if (!parsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid registration id',
      details: parsed.error.flatten(),
    })
  }

  const { id: registrationId } = parsed.data

  const bodyParsed = z.object({ teamId: z.string().uuid() }).safeParse(request.body)
  if (!bodyParsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'teamId is required in request body',
    })
  }

  const { teamId } = bodyParsed.data

  const isHeadCoach = request.user!.roles.some(
    (r) => r.role === 'HEAD_COACH' && r.teamId === teamId,
  )
  if (!isHeadCoach) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only the head coach can lock the tournament roster',
    })
  }

  try {
    const result = await registrationService.lockRoster(registrationId, teamId)
    const statusCode = result.locked ? 200 : 422
    return reply.code(statusCode).send(result)
  } catch (err) {
    return handleRegistrationError(err, reply, 'lockRoster failed')
  }
}
