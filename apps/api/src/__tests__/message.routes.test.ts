// E10 · Communication & Messaging — Route integration tests
// All routes require valid Bearer token → 401 without auth

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// ── Mock token service ────────────────────────────────────────────────────────

vi.mock('../services/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'mock-refresh', hash: 'mock-hash' }),
    hashToken: vi.fn().mockReturnValue('mock-hash'),
  },
}))

// ── Mock message service ──────────────────────────────────────────────────────

vi.mock('../services/message.service.js', () => ({
  messageService: {
    getInbox: vi.fn(),
    getTeamMessages: vi.fn(),
    sendMessage: vi.fn(),
    getDmMessages: vi.fn(),
    deleteMessage: vi.fn(),
    markRead: vi.fn(),
    getAnnouncements: vi.fn(),
    createAnnouncement: vi.fn(),
    pinAnnouncement: vi.fn(),
  },
}))

// ── Lazy import mocks ─────────────────────────────────────────────────────────

const { tokenService } = await import('../services/token.service.js')
const { messageService } = await import('../services/message.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440010'
const COACH_ID = '550e8400-e29b-41d4-a716-446655440001'
const PLAYER_ID_USER = '550e8400-e29b-41d4-a716-446655440002'
const RECIPIENT_ID = '550e8400-e29b-41d4-a716-446655440003'
const MESSAGE_ID = '550e8400-e29b-41d4-a716-446655440020'
const ANN_ID = '550e8400-e29b-41d4-a716-446655440030'
const NOW = '2026-06-01T12:00:00.000Z'

const mockCoachJwt = {
  sub: COACH_ID,
  email: 'coach@example.com',
  name: 'Coach Bob',
  roles: [{ role: 'COACH', teamId: TEAM_ID }],
  activeRole: 'COACH',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440099',
}

const mockPlayerJwt = {
  sub: PLAYER_ID_USER,
  email: 'player@example.com',
  name: 'Player Pete',
  roles: [{ role: 'PLAYER', teamId: TEAM_ID }],
  activeRole: 'PLAYER',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440098',
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const activeMembership = {
  id: 'tm-1',
  teamId: TEAM_ID,
  userId: COACH_ID,
  role: 'HEAD_COACH',
  status: 'ACTIVE',
  jerseyNumber: null,
  positions: [],
  joinedAt: new Date(),
  updatedAt: new Date(),
}

const mockMessage = {
  id: MESSAGE_ID,
  teamId: TEAM_ID,
  threadType: 'TEAM',
  senderId: COACH_ID,
  senderName: 'Coach Bob',
  senderAvatar: null,
  body: 'Hello team!',
  attachmentUrl: null,
  readBy: [COACH_ID],
  createdAt: NOW,
}

const mockAnnouncement = {
  id: ANN_ID,
  teamId: TEAM_ID,
  authorId: COACH_ID,
  title: 'Practice this Friday',
  body: 'Practice at 6pm.',
  isPinned: false,
  createdAt: NOW,
  author: { id: COACH_ID, name: 'Coach Bob', avatarUrl: null },
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockCoachJwt as any)
})

// ── GET /api/v1/messages/inbox ────────────────────────────────────────────────

describe('GET /api/v1/messages/inbox', () => {
  it('returns 200 with thread list', async () => {
    vi.mocked(messageService.getInbox).mockResolvedValue([
      {
        teamId: TEAM_ID,
        teamName: 'Hawks',
        threadType: 'TEAM',
        lastMessage: 'Hello team!',
        lastSender: 'Coach Bob',
        lastAt: NOW,
        unreadCount: 2,
      },
    ] as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/messages/inbox',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].teamId).toBe(TEAM_ID)
    expect(messageService.getInbox).toHaveBeenCalledWith(COACH_ID)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/messages/inbox' })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/messages/teams/:teamId ───────────────────────────────────────

describe('GET /api/v1/messages/teams/:teamId', () => {
  it('returns 200 with team messages for a member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)
    vi.mocked(messageService.getTeamMessages).mockResolvedValue([mockMessage] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].id).toBe(MESSAGE_ID)
    expect(messageService.getTeamMessages).toHaveBeenCalledWith(TEAM_ID, 1, 50)
  })

  it('returns 403 when user is not a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/messages/teams/:teamId ──────────────────────────────────────

describe('POST /api/v1/messages/teams/:teamId', () => {
  it('returns 201 with created message', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)
    vi.mocked(messageService.sendMessage).mockResolvedValue(mockMessage as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
      payload: { body: 'Hello team!' },
    })

    expect(response.statusCode).toBe(201)
    expect(messageService.sendMessage).toHaveBeenCalledWith(
      TEAM_ID,
      COACH_ID,
      'Hello team!',
      'TEAM',
      undefined,
      undefined,
    )
  })

  it('returns 400 for empty body', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
      payload: { body: '' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 403 for non-member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
      payload: { body: 'Hello!' },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}`,
      payload: { body: 'Hello!' },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/messages/teams/:teamId/dm/:recipientId ───────────────────────

describe('GET /api/v1/messages/teams/:teamId/dm/:recipientId', () => {
  it('returns 200 with DM thread messages', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)
    const dmMsg = { ...mockMessage, threadType: 'DIRECT', recipientId: RECIPIENT_ID }
    vi.mocked(messageService.getDmMessages).mockResolvedValue([dmMsg] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}/dm/${RECIPIENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(messageService.getDmMessages).toHaveBeenCalledWith(TEAM_ID, COACH_ID, RECIPIENT_ID, 1, 50)
  })

  it('returns 403 for non-member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}/dm/${RECIPIENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}/dm/${RECIPIENT_ID}`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/messages/teams/:teamId/dm/:recipientId ──────────────────────

describe('POST /api/v1/messages/teams/:teamId/dm/:recipientId', () => {
  it('returns 201 with sent DM', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)
    const dmMsg = { ...mockMessage, threadType: 'DIRECT', recipientId: RECIPIENT_ID }
    vi.mocked(messageService.sendMessage).mockResolvedValue(dmMsg as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}/dm/${RECIPIENT_ID}`,
      headers: AUTH_HEADER,
      payload: { body: 'Hey!' },
    })

    expect(response.statusCode).toBe(201)
    expect(messageService.sendMessage).toHaveBeenCalledWith(
      TEAM_ID,
      COACH_ID,
      'Hey!',
      'DIRECT',
      RECIPIENT_ID,
      undefined,
    )
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}/dm/${RECIPIENT_ID}`,
      payload: { body: 'Hey!' },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── DELETE /api/v1/messages/:messageId ───────────────────────────────────────

describe('DELETE /api/v1/messages/:messageId', () => {
  it('returns 200 when coach deletes any message', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(activeMembership as any)
    vi.mocked(messageService.deleteMessage).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${MESSAGE_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    expect(messageService.deleteMessage).toHaveBeenCalledWith(MESSAGE_ID, COACH_ID, true)
  })

  it('returns 403 when service throws FORBIDDEN', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)
    vi.mocked(messageService.deleteMessage).mockRejectedValue(new Error('FORBIDDEN'))

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${MESSAGE_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 404 when service throws NOT_FOUND', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)
    vi.mocked(messageService.deleteMessage).mockRejectedValue(new Error('NOT_FOUND'))

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${MESSAGE_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${MESSAGE_ID}`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/messages/:messageId/read ────────────────────────────────────

describe('POST /api/v1/messages/:messageId/read', () => {
  it('returns 200 and marks message as read', async () => {
    vi.mocked(messageService.markRead).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/${MESSAGE_ID}/read`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    expect(messageService.markRead).toHaveBeenCalledWith(MESSAGE_ID, COACH_ID)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/${MESSAGE_ID}/read`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/messages/teams/:teamId/announcements ─────────────────────────

describe('GET /api/v1/messages/teams/:teamId/announcements', () => {
  it('returns 200 with announcements list for team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)
    vi.mocked(messageService.getAnnouncements).mockResolvedValue([mockAnnouncement] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].id).toBe(ANN_ID)
    expect(messageService.getAnnouncements).toHaveBeenCalledWith(TEAM_ID)
  })

  it('returns 403 for non-member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/messages/teams/:teamId/announcements ────────────────────────

describe('POST /api/v1/messages/teams/:teamId/announcements', () => {
  it('returns 201 when coach creates announcement', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)
    vi.mocked(messageService.createAnnouncement).mockResolvedValue(mockAnnouncement as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements`,
      headers: AUTH_HEADER,
      payload: { title: 'Practice this Friday', body: 'Practice at 6pm.' },
    })

    expect(response.statusCode).toBe(201)
    expect(messageService.createAnnouncement).toHaveBeenCalledWith(
      TEAM_ID,
      COACH_ID,
      'Practice this Friday',
      'Practice at 6pm.',
    )
  })

  it('returns 403 when player attempts to create announcement', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockPlayerJwt as any)
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...activeMembership,
      userId: PLAYER_ID_USER,
      role: 'PLAYER',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements`,
      headers: AUTH_HEADER,
      payload: { title: 'Hey', body: 'Some text.' },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 400 for missing title', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements`,
      headers: AUTH_HEADER,
      payload: { body: 'Some text.' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements`,
      payload: { title: 'Test', body: 'Body.' },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── PATCH /api/v1/messages/teams/:teamId/announcements/:id/pin ───────────────

describe('PATCH /api/v1/messages/teams/:teamId/announcements/:id/pin', () => {
  it('returns 200 when coach pins an announcement', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)
    vi.mocked(messageService.pinAnnouncement).mockResolvedValue({ ...mockAnnouncement, isPinned: true } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements/${ANN_ID}/pin`,
      headers: AUTH_HEADER,
      payload: { pin: true },
    })

    expect(response.statusCode).toBe(200)
    expect(messageService.pinAnnouncement).toHaveBeenCalledWith(ANN_ID, TEAM_ID, true)
  })

  it('returns 403 when player attempts to pin', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockPlayerJwt as any)
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...activeMembership,
      userId: PLAYER_ID_USER,
      role: 'PLAYER',
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements/${ANN_ID}/pin`,
      headers: AUTH_HEADER,
      payload: { pin: true },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 400 for missing pin field', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(activeMembership as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements/${ANN_ID}/pin`,
      headers: AUTH_HEADER,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/teams/${TEAM_ID}/announcements/${ANN_ID}/pin`,
      payload: { pin: true },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── All protected routes → 401 without auth ───────────────────────────────────

describe('All protected message routes return 401 without auth', () => {
  const protectedRoutes: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; url: string }> = [
    { method: 'GET', url: '/api/v1/messages/inbox' },
    { method: 'GET', url: `/api/v1/messages/teams/${TEAM_ID}` },
    { method: 'POST', url: `/api/v1/messages/teams/${TEAM_ID}` },
    { method: 'GET', url: `/api/v1/messages/teams/${TEAM_ID}/dm/${RECIPIENT_ID}` },
    { method: 'POST', url: `/api/v1/messages/teams/${TEAM_ID}/dm/${RECIPIENT_ID}` },
    { method: 'DELETE', url: `/api/v1/messages/${MESSAGE_ID}` },
    { method: 'POST', url: `/api/v1/messages/${MESSAGE_ID}/read` },
    { method: 'GET', url: `/api/v1/messages/teams/${TEAM_ID}/announcements` },
    { method: 'POST', url: `/api/v1/messages/teams/${TEAM_ID}/announcements` },
    { method: 'PATCH', url: `/api/v1/messages/teams/${TEAM_ID}/announcements/${ANN_ID}/pin` },
  ]

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const response = await app.inject({ method: route.method, url: route.url })
      expect(response.statusCode).toBe(401)
    })
  }
})
