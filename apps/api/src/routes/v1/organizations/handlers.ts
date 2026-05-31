// E15 · Organization / Club Admin — Route Handlers
import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@diamondhub/db'
import { organizationService } from '../../../services/organization.service.js'

// ── Helper: verify org owner/admin ────────────────────────────────────────────

async function verifyOrgOwner(userId: string, orgId: string): Promise<boolean> {
  const member = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  return member?.role === 'OWNER' || member?.role === 'ADMIN'
}

// ── POST /api/v1/organizations — create org ───────────────────────────────────

export async function createOrgHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.sub
  const body = request.body as { name?: string }

  if (!body.name || body.name.trim().length === 0) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'name is required',
    })
  }

  const org = await organizationService.create(userId, body.name.trim())
  return reply.code(201).send(org)
}

// ── GET /api/v1/organizations/me — get user's org ─────────────────────────────

export async function getMyOrgHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.sub
  const org = await organizationService.getForUser(userId)
  if (!org) {
    return reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'You are not a member of any organization',
    })
  }
  return reply.code(200).send(org)
}

// ── GET /api/v1/organizations/:orgId/dashboard — stats ───────────────────────

export async function getOrgDashboardHandler(
  request: FastifyRequest<{ Params: { orgId: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.params
  const userId = request.user!.sub

  // Any member can view dashboard stats
  const member = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  if (!member) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You are not a member of this organization',
    })
  }

  const stats = await organizationService.getDashboardStats(orgId)
  return reply.code(200).send(stats)
}

// ── POST /api/v1/organizations/:orgId/coaches — add coach ────────────────────

export async function addCoachHandler(
  request: FastifyRequest<{ Params: { orgId: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.params
  const userId = request.user!.sub
  const body = request.body as { email?: string }

  if (!body.email) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'email is required',
    })
  }

  if (!(await verifyOrgOwner(userId, orgId))) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only org owners or admins can add coaches',
    })
  }

  try {
    await organizationService.addCoach(orgId, body.email, userId)
    return reply.code(200).send({ success: true })
  } catch (err: any) {
    if (err.message === 'USER_NOT_FOUND') {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `No user found with email: ${body.email}`,
      })
    }
    throw err
  }
}

// ── POST /api/v1/organizations/:orgId/teams — link team ──────────────────────

export async function linkTeamHandler(
  request: FastifyRequest<{ Params: { orgId: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.params
  const userId = request.user!.sub
  const body = request.body as { teamId?: string }

  if (!body.teamId) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'teamId is required',
    })
  }

  if (!(await verifyOrgOwner(userId, orgId))) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only org owners or admins can link teams',
    })
  }

  await organizationService.linkTeam(orgId, body.teamId)
  return reply.code(200).send({ success: true })
}

// ── GET /api/v1/organizations/:orgId/players — cross-team lookup ──────────────

export async function getOrgPlayersHandler(
  request: FastifyRequest<{ Params: { orgId: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.params
  const userId = request.user!.sub
  const query = request.query as { name?: string; dateOfBirth?: string }

  const member = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  if (!member) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You are not a member of this organization',
    })
  }

  const players = await organizationService.findPlayerAcrossTeams(orgId, query)
  return reply.code(200).send(players)
}
