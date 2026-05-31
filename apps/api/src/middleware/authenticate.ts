// P2: Role-based access — JWT verification middleware
// API layer is authoritative — never trust client-side role assertions

import type { FastifyRequest, FastifyReply } from 'fastify'
import { tokenService } from '../services/token.service.js'
import type { JwtPayload } from '@diamondhub/contracts'

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Bearer token required',
    })
    return
  }

  const token = authHeader.slice(7)
  try {
    request.user = await tokenService.verifyAccessToken(token)
  } catch {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    })
    return
  }

  // E1-S1: Unverified accounts cannot access protected routes (P8)
  // Check explicitly === false (not just falsy) for backward compatibility with tokens
  // issued before emailVerified was added to JWT payload.
  // Exception: allow /api/v1/auth/* so verification email flow still works.
  if (request.user.emailVerified === false) {
    const isAuthRoute = request.url?.startsWith('/api/v1/auth/')
    if (!isAuthRoute) {
      reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'UNVERIFIED_EMAIL',
      })
      return
    }
  }
}

// Optional auth — sets request.user if a valid Bearer token is present, but does not reject the
// request when no token is supplied. Used on public routes that enrich responses for logged-in users.
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return

  const token = authHeader.slice(7)
  try {
    request.user = await tokenService.verifyAccessToken(token)
  } catch {
    // Silently ignore invalid tokens on optional-auth routes
  }
}

export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      })
      return
    }

    const hasRole = request.user.roles.some((r) => allowedRoles.includes(r.role))
    if (!hasRole) {
      reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Role required: ${allowedRoles.join(' or ')}`,
      })
    }
  }
}

export function requireTeamRole(allowedRoles: string[], teamId: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
      return
    }

    const hasRole = request.user.roles.some(
      (r) => allowedRoles.includes(r.role) && r.teamId === teamId,
    )
    if (!hasRole) {
      reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Insufficient team permissions' })
    }
  }
}
