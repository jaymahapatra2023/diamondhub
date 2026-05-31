// E15 · Organization / Club Admin — Route integration tests
// All routes require valid Bearer token

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

// ── Mock organization service ─────────────────────────────────────────────────

vi.mock('../services/organization.service.js', () => ({
  organizationService: {
    create: vi.fn(),
    getForUser: vi.fn(),
    addCoach: vi.fn(),
    linkTeam: vi.fn(),
    findPlayerAcrossTeams: vi.fn(),
    getDashboardStats: vi.fn(),
  },
}))

const { tokenService } = await import('../services/token.service.js')
const { organizationService } = await import('../services/organization.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_ID = '550e8400-e29b-41d4-a716-446655440020'
const OWNER_ID = '550e8400-e29b-41d4-a716-446655440001'
const TEAM_ID = '550e8400-e29b-41d4-a716-446655440010'
const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const mockOwnerJwt = {
  sub: OWNER_ID,
  email: 'owner@example.com',
  name: 'Club Owner',
  roles: [{ role: 'ADMIN' }],
  activeRole: 'ADMIN',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440099',
}

const mockOrg = {
  id: ORG_ID,
  name: 'Thunder Hawks Club',
  ownerUserId: OWNER_ID,
  members: [
    {
      userId: OWNER_ID,
      role: 'OWNER',
      user: { id: OWNER_ID, name: 'Club Owner', email: 'owner@example.com' },
    },
  ],
  teams: [
    {
      team: { id: TEAM_ID, name: 'Thunder Hawks 10U', sport: 'Baseball', ageDivision: '10U' },
    },
  ],
}

const mockStats = {
  teamCount: 2,
  memberCount: 22,
  registrationCount: 8,
  totalSpent: 4200,
}

const ownerMembership = {
  orgId: ORG_ID,
  userId: OWNER_ID,
  role: 'OWNER',
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
  vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockOwnerJwt as any)
})

// ── POST /api/v1/organizations ───────────────────────────────────────────────

describe('POST /api/v1/organizations', () => {
  it('returns 201 with created org', async () => {
    vi.mocked(organizationService.create).mockResolvedValue(mockOrg as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: AUTH_HEADER,
      payload: { name: 'Thunder Hawks Club' },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(ORG_ID)
    expect(body.name).toBe('Thunder Hawks Club')
    expect(organizationService.create).toHaveBeenCalledWith(OWNER_ID, 'Thunder Hawks Club')
  })

  it('returns 400 when name is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: AUTH_HEADER,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(organizationService.create).not.toHaveBeenCalled()
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      payload: { name: 'Test Org' },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/organizations/me ─────────────────────────────────────────────

describe('GET /api/v1/organizations/me', () => {
  it('returns 200 with user org including members and teams', async () => {
    vi.mocked(organizationService.getForUser).mockResolvedValue(mockOrg as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/organizations/me',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(ORG_ID)
    expect(body.members).toHaveLength(1)
    expect(body.teams).toHaveLength(1)
    expect(organizationService.getForUser).toHaveBeenCalledWith(OWNER_ID)
  })

  it('returns 404 when user has no organization', async () => {
    vi.mocked(organizationService.getForUser).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/organizations/me',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/organizations/me',
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/organizations/:orgId/dashboard ──────────────────────────────

describe('GET /api/v1/organizations/:orgId/dashboard', () => {
  it('returns 200 with dashboard stats for org member', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(ownerMembership as any)
    vi.mocked(organizationService.getDashboardStats).mockResolvedValue(mockStats as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${ORG_ID}/dashboard`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.teamCount).toBe(2)
    expect(body.memberCount).toBe(22)
    expect(body.totalSpent).toBe(4200)
    expect(organizationService.getDashboardStats).toHaveBeenCalledWith(ORG_ID)
  })

  it('returns 403 for non-member user', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${ORG_ID}/dashboard`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${ORG_ID}/dashboard`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/organizations/:orgId/coaches ────────────────────────────────

describe('POST /api/v1/organizations/:orgId/coaches', () => {
  it('returns 200 when owner adds a coach by email', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(ownerMembership as any)
    vi.mocked(organizationService.addCoach).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/coaches`,
      headers: AUTH_HEADER,
      payload: { email: 'newcoach@example.com' },
    })

    expect(response.statusCode).toBe(200)
    expect(organizationService.addCoach).toHaveBeenCalledWith(ORG_ID, 'newcoach@example.com', OWNER_ID)
  })

  it('returns 404 when coach email is not found', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(ownerMembership as any)
    vi.mocked(organizationService.addCoach).mockRejectedValue(new Error('USER_NOT_FOUND'))

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/coaches`,
      headers: AUTH_HEADER,
      payload: { email: 'ghost@example.com' },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 403 when requester is not owner/admin', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue({
      ...ownerMembership,
      role: 'COACH',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/coaches`,
      headers: AUTH_HEADER,
      payload: { email: 'newcoach@example.com' },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 400 when email is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/coaches`,
      headers: AUTH_HEADER,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/coaches`,
      payload: { email: 'coach@example.com' },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/organizations/:orgId/teams ──────────────────────────────────

describe('POST /api/v1/organizations/:orgId/teams', () => {
  it('returns 200 when owner links a team', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(ownerMembership as any)
    vi.mocked(organizationService.linkTeam).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/teams`,
      headers: AUTH_HEADER,
      payload: { teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(200)
    expect(organizationService.linkTeam).toHaveBeenCalledWith(ORG_ID, TEAM_ID)
  })

  it('returns 400 when teamId is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/teams`,
      headers: AUTH_HEADER,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${ORG_ID}/teams`,
      payload: { teamId: TEAM_ID },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/organizations/:orgId/players ─────────────────────────────────

describe('GET /api/v1/organizations/:orgId/players', () => {
  const mockPlayers = [
    {
      userId: 'p1',
      name: 'Jake Smith',
      teams: [
        { teamId: TEAM_ID, teamName: 'Team Alpha', ageDivision: '10U' },
        { teamId: 'team-2', teamName: 'Team Beta', ageDivision: '10U' },
      ],
      isDuplicate: true,
      sameDivisionDuplicate: true,
    },
  ]

  it('returns 200 with player results for org member', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(ownerMembership as any)
    vi.mocked(organizationService.findPlayerAcrossTeams).mockResolvedValue(mockPlayers as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${ORG_ID}/players?name=Jake`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].sameDivisionDuplicate).toBe(true)
    expect(organizationService.findPlayerAcrossTeams).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ name: 'Jake' }),
    )
  })

  it('returns 403 for non-member', async () => {
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${ORG_ID}/players`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${ORG_ID}/players`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── All organization routes → 401 without auth ────────────────────────────────

describe('All organization routes return 401 without auth', () => {
  const routes: Array<{ method: 'GET' | 'POST'; url: string }> = [
    { method: 'POST', url: '/api/v1/organizations' },
    { method: 'GET', url: '/api/v1/organizations/me' },
    { method: 'GET', url: `/api/v1/organizations/${ORG_ID}/dashboard` },
    { method: 'POST', url: `/api/v1/organizations/${ORG_ID}/coaches` },
    { method: 'POST', url: `/api/v1/organizations/${ORG_ID}/teams` },
    { method: 'GET', url: `/api/v1/organizations/${ORG_ID}/players` },
  ]

  for (const route of routes) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const response = await app.inject({ method: route.method, url: route.url })
      expect(response.statusCode).toBe(401)
    })
  }
})
