// E8 · Conflict Detection — Route Handlers
// Warning-only: conflicts are returned as metadata, never block operations

import type { FastifyRequest, FastifyReply } from 'fastify'
import { conflictService } from '../../../services/conflict.service.js'

// ── GET /api/v1/conflicts — user's unresolved conflicts ──────────────────────

export async function getConflictsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.sub
  const conflicts = await conflictService.getConflictsForUser(userId)
  return reply.code(200).send(conflicts)
}

// ── PATCH /api/v1/conflicts/:id/resolve — mark conflict resolved ─────────────

export async function resolveConflictHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id } = request.params
  const userId = request.user!.sub

  try {
    const updated = await conflictService.resolveConflict(id, userId)
    return reply.code(200).send(updated)
  } catch (err: any) {
    // Prisma throws P2025 when record not found
    if (err?.code === 'P2025' || err?.message?.includes('Record to update not found')) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Conflict record not found',
      })
    }
    throw err
  }
}

// ── GET /api/v1/conflicts/check-rsvp?eventId=... — RSVP conflict pre-check ───

export async function checkRsvpConflictHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.sub
  const query = request.query as { eventId?: string }

  if (!query.eventId) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'eventId query parameter is required',
    })
  }

  const result = await conflictService.checkRsvpConflict(userId, query.eventId)
  return reply.code(200).send(result)
}
