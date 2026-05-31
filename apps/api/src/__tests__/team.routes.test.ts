import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// ── Mock token service (shared) ────────────────────────────────────────────

vi.mock('../services/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'mock-refresh', hash: 'mock-hash' }),
    hashToken: vi.fn().mockReturnValue('mock-hash'),
  },
}))

// ── Mock team service ──────────────────────────────────────────────────────

vi.mock('../services/team.service.js', () => ({
  teamService: {
    createTeam: vi.fn(),
    getTeamsForUser: vi.fn(),
    getTeamById: vi.fn(),
    updateTeam: vi.fn(),
    getRoster: vi.fn(),
    addPlayer: vi.fn(),
    updateMember: vi.fn(),
    archivePlayer: vi.fn(),
    createInvite: vi.fn(),
    getPendingInvites: vi.fn(),
    revokeInvite: vi.fn(),
    acceptInvite: vi.fn(),
    getEmergencyContact: vi.fn(),
    setEmergencyContact: vi.fn(),
    getDocumentUploadUrl: vi.fn(),
    recordDocument: vi.fn(),
    getDocuments: vi.fn(),
    setRsvp: vi.fn(),
    getRsvps: vi.fn(),
    assignRole: vi.fn(),
  },
}))

// ── Lazy import mocks ──────────────────────────────────────────────────────

const { tokenService } = await import('../services/token.service.js')
const { teamService } = await import('../services/team.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ────────────────────────────────────────────────────────────────

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440010'
const COACH_ID = '550e8400-e29b-41d4-a716-446655440001'
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440020'
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440030'
const INVITE_ID = '550e8400-e29b-41d4-a716-446655440040'

const mockJwt = {
  sub: COACH_ID,
  email: 'coach@example.com',
  name: 'Coach Bob',
  roles: [{ role: 'COACH', teamId: TEAM_ID }],
  activeRole: 'COACH',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440099',
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const baseTeam = {
  id: TEAM_ID,
  name: 'Thunder Hawks',
  sport: 'BASEBALL',
  ageDivision: '12U',
  seasonYear: 2026,
  coachId: COACH_ID,
  inviteCode: 'ABCDEF',
  photoUrl: null,
  homeFieldName: 'Thunder Field',
  homeFieldCity: 'Dallas',
  isActive: true,
  memberCount: 10,
  memberRole: 'HEAD_COACH',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const baseMember = {
  id: '550e8400-e29b-41d4-a716-446655440021',
  teamId: TEAM_ID,
  userId: COACH_ID,
  role: 'HEAD_COACH' as const,
  jerseyNumber: null,
  positions: [] as string[],
  status: 'ACTIVE' as const,
  joinedAt: new Date(),
  updatedAt: new Date(),
}

// ── App lifecycle ────────────────────────────────────────────────────────────

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  // Default: every authenticated request resolves to mockJwt
  vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwt as any)
})

// ── POST /api/v1/teams ────────────────────────────────────────────────────────

describe('POST /api/v1/teams', () => {
  it('returns 201 with team and inviteCode on valid body', async () => {
    vi.mocked(teamService.createTeam).mockResolvedValue(baseTeam as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teams',
      headers: AUTH_HEADER,
      payload: {
        name: 'Thunder Hawks',
        sport: 'BASEBALL',
        ageDivision: '12U',
        seasonYear: 2026,
      },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.inviteCode).toBe('ABCDEF')
    expect(body.name).toBe('Thunder Hawks')
  })

  it('returns 400 for invalid body — missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teams',
      headers: AUTH_HEADER,
      payload: { name: 'X' }, // missing sport, ageDivision, seasonYear
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.details).toBeDefined()
  })

  it('returns 400 when name is too short', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teams',
      headers: AUTH_HEADER,
      payload: { name: 'A', sport: 'BASEBALL', ageDivision: '12U', seasonYear: 2026 },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teams',
      payload: { name: 'Hawks', sport: 'BASEBALL', ageDivision: '12U', seasonYear: 2026 },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/teams ─────────────────────────────────────────────────────────

describe('GET /api/v1/teams', () => {
  it('returns 200 with list of user teams', async () => {
    vi.mocked(teamService.getTeamsForUser).mockResolvedValue([baseTeam] as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/teams',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(TEAM_ID)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/teams' })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/teams/:teamId ─────────────────────────────────────────────────

describe('GET /api/v1/teams/:teamId', () => {
  it('returns 200 for a team member', async () => {
    vi.mocked(teamService.getTeamById).mockResolvedValue(baseTeam as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(TEAM_ID)
  })

  it('returns 404 for non-member (service returns null)', async () => {
    vi.mocked(teamService.getTeamById).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/teams/${TEAM_ID}` })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/teams/:teamId/roster ──────────────────────────────────────────

describe('GET /api/v1/teams/:teamId/roster', () => {
  it('returns 200 with members list for team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.getRoster).mockResolvedValue([
      {
        memberId: MEMBER_ID,
        userId: COACH_ID,
        name: 'Coach Bob',
        email: 'coach@example.com',
        avatarUrl: null,
        role: 'HEAD_COACH',
        jerseyNumber: null,
        positions: [],
        status: 'ACTIVE',
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
    ] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${TEAM_ID}/roster`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].role).toBe('HEAD_COACH')
  })

  it('returns 404 when user is not a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${TEAM_ID}/roster`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/teams/${TEAM_ID}/roster` })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/teams/:teamId/roster ─────────────────────────────────────────

describe('POST /api/v1/teams/:teamId/roster', () => {
  it('returns 201 when coach adds a player', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.addPlayer).mockResolvedValue({
      memberId: MEMBER_ID,
      userId: 'new-user-1',
      name: 'Alice Smith',
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/roster`,
      headers: AUTH_HEADER,
      payload: { firstName: 'Alice', lastName: 'Smith', positions: ['CF'] },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.name).toBe('Alice Smith')
  })

  it('returns 403 when a PLAYER role tries to add', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...baseMember,
      role: 'PLAYER',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/roster`,
      headers: AUTH_HEADER,
      payload: { firstName: 'Alice', lastName: 'Smith', positions: [] },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/roster`,
      payload: { firstName: 'Alice', lastName: 'Smith', positions: [] },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── DELETE /api/v1/teams/:teamId/roster/:memberId ─────────────────────────────

describe('DELETE /api/v1/teams/:teamId/roster/:memberId', () => {
  it('returns 200 and archives the player (not deletes)', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.archivePlayer).mockResolvedValue({
      ...baseMember,
      status: 'ARCHIVED',
    } as any)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    expect(teamService.archivePlayer).toHaveBeenCalledWith(TEAM_ID, MEMBER_ID)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/teams/:teamId/invites ────────────────────────────────────────

describe('POST /api/v1/teams/:teamId/invites', () => {
  it('returns 201 with inviteLink', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.createInvite).mockResolvedValue({
      inviteLink: 'http://localhost:5173/join/abc123',
      token: 'abc123',
      expiresAt: '2026-06-10T00:00:00.000Z',
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/invites`,
      headers: AUTH_HEADER,
      payload: { role: 'PLAYER', expiresInDays: 7 },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.inviteLink).toContain('/join/')
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/invites`,
      payload: { role: 'PLAYER', expiresInDays: 7 },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/teams/:teamId/invites ─────────────────────────────────────────

describe('GET /api/v1/teams/:teamId/invites', () => {
  it('returns 200 with pending invites list', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.getPendingInvites).mockResolvedValue([
      {
        id: INVITE_ID,
        teamId: TEAM_ID,
        email: 'parent@example.com',
        role: 'PARENT',
        token: 'token123',
        targetPlayerId: null,
        expiresAt: new Date('2026-06-10'),
        usedAt: null,
        createdBy: COACH_ID,
        createdAt: new Date('2026-06-03'),
      },
    ] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${TEAM_ID}/invites`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].role).toBe('PARENT')
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/teams/${TEAM_ID}/invites` })
    expect(response.statusCode).toBe(401)
  })
})

// ── DELETE /api/v1/teams/:teamId/invites/:inviteId ────────────────────────────

describe('DELETE /api/v1/teams/:teamId/invites/:inviteId', () => {
  it('returns 200 on successful revocation', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.revokeInvite).mockResolvedValue({ count: 1 } as any)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/teams/${TEAM_ID}/invites/${INVITE_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/teams/${TEAM_ID}/invites/${INVITE_ID}`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/teams/join/:token ────────────────────────────────────────────

describe('POST /api/v1/teams/join/:token', () => {
  it('returns 200 and accepts a valid invite', async () => {
    vi.mocked(teamService.acceptInvite).mockResolvedValue({
      teamId: TEAM_ID,
      role: 'PLAYER',
      memberId: MEMBER_ID,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teams/join/valid-invite-token',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.teamId).toBe(TEAM_ID)
    expect(body.role).toBe('PLAYER')
  })

  it('returns 400 for invalid/expired token', async () => {
    vi.mocked(teamService.acceptInvite).mockRejectedValue(new Error('INVALID_INVITE'))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teams/join/bad-token',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('invalid')
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teams/join/some-token',
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── Emergency contact ─────────────────────────────────────────────────────────

describe('Emergency contact routes', () => {
  const playerMember = {
    id: MEMBER_ID,
    teamId: TEAM_ID,
    userId: 'player-user-1',
    role: 'HEAD_COACH' as const, // requester is coach
    jerseyNumber: null,
    positions: [] as string[],
    status: 'ACTIVE' as const,
    joinedAt: new Date(),
    updatedAt: new Date(),
    user: {
      playersOwned: [{ id: 'player-db-1' }],
    },
  }

  describe('PUT /api/v1/teams/:teamId/roster/:memberId/emergency-contact', () => {
    it('returns 200 on successful upsert', async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
      vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(playerMember as any)
      vi.mocked(teamService.setEmergencyContact).mockResolvedValue({
        id: 'ec-1',
        playerId: 'player-db-1',
        contactName: 'Mary Smith',
        relationship: 'Mother',
        phone1: '+15551234567',
        phone2: null,
        updatedAt: new Date(),
      } as any)

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact`,
        headers: AUTH_HEADER,
        payload: {
          contactName: 'Mary Smith',
          relationship: 'Mother',
          phone1: '+15551234567',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.contactName).toBe('Mary Smith')
    })

    it('returns 400 for invalid phone format', async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact`,
        headers: AUTH_HEADER,
        payload: {
          contactName: 'Mary Smith',
          relationship: 'Mother',
          phone1: '555-1234', // not E.164
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact`,
        payload: { contactName: 'X', relationship: 'Y', phone1: '+15551234567' },
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/v1/teams/:teamId/roster/:memberId/emergency-contact', () => {
    it('returns 200 with contact when coach requests', async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
      vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(playerMember as any)
      vi.mocked(teamService.getEmergencyContact).mockResolvedValue({
        id: 'ec-1',
        playerId: 'player-db-1',
        contactName: 'Mary Smith',
        relationship: 'Mother',
        phone1: '+15551234567',
        phone2: null,
        updatedAt: new Date(),
      } as any)

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact`,
        headers: AUTH_HEADER,
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 403 when PARENT role tries to access', async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
        ...baseMember,
        role: 'PARENT',
      } as any)

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact`,
        headers: AUTH_HEADER,
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact`,
      })
      expect(response.statusCode).toBe(401)
    })
  })
})

// ── RSVP ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/teams/:teamId/events/:eventId/rsvp', () => {
  it('returns 200 with RSVP record', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.setRsvp).mockResolvedValue({
      id: 'rsvp-1',
      eventId: EVENT_ID,
      userId: COACH_ID,
      status: 'YES',
      note: null,
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/events/${EVENT_ID}/rsvp`,
      headers: AUTH_HEADER,
      payload: { status: 'YES' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('YES')
  })

  it('returns 400 for invalid RSVP status', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/events/${EVENT_ID}/rsvp`,
      headers: AUTH_HEADER,
      payload: { status: 'UNSURE' }, // not in enum
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${TEAM_ID}/events/${EVENT_ID}/rsvp`,
      payload: { status: 'YES' },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET RSVPs ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/teams/:teamId/events/:eventId/rsvp', () => {
  it('returns 200 with rsvps and counts', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(teamService.getRsvps).mockResolvedValue({
      rsvps: [],
      counts: { yes: 3, no: 1, maybe: 2, noResponse: 0 },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${TEAM_ID}/events/${EVENT_ID}/rsvp`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.counts.yes).toBe(3)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${TEAM_ID}/events/${EVENT_ID}/rsvp`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── 401 on all protected routes ───────────────────────────────────────────────

describe('All protected team routes return 401 without auth', () => {
  const protectedRoutes: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; url: string }> = [
    { method: 'GET', url: '/api/v1/teams' },
    { method: 'POST', url: '/api/v1/teams' },
    { method: 'GET', url: `/api/v1/teams/${TEAM_ID}` },
    { method: 'PATCH', url: `/api/v1/teams/${TEAM_ID}` },
    { method: 'GET', url: `/api/v1/teams/${TEAM_ID}/roster` },
    { method: 'POST', url: `/api/v1/teams/${TEAM_ID}/roster` },
    { method: 'POST', url: `/api/v1/teams/${TEAM_ID}/invites` },
    { method: 'GET', url: `/api/v1/teams/${TEAM_ID}/invites` },
    { method: 'GET', url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact` },
    { method: 'PUT', url: `/api/v1/teams/${TEAM_ID}/roster/${MEMBER_ID}/emergency-contact` },
    { method: 'POST', url: `/api/v1/teams/${TEAM_ID}/events/${EVENT_ID}/rsvp` },
    { method: 'GET', url: `/api/v1/teams/${TEAM_ID}/events/${EVENT_ID}/rsvp` },
    { method: 'POST', url: '/api/v1/teams/join/some-token' },
  ]

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const response = await app.inject({ method: route.method, url: route.url })
      expect(response.statusCode).toBe(401)
    })
  }
})
