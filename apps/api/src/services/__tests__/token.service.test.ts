import { describe, it, expect, beforeEach } from 'vitest'
import { tokenService } from '../token.service.js'

describe('tokenService', () => {
  beforeEach(() => {
    tokenService._resetKeyCache()
  })

  describe('generateAccessToken', () => {
    it('returns a JWT string', async () => {
      const token = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test User',
        roles: [{ role: 'COACH', teamId: null }],
        activeRole: { role: 'COACH', teamId: null },
      })
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT has 3 parts
    })

    it('generates different tokens for different subjects', async () => {
      const t1 = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440001',
        email: 'a@example.com',
        name: 'A',
        roles: [],
        activeRole: null,
      })
      const t2 = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440002',
        email: 'b@example.com',
        name: 'B',
        roles: [],
        activeRole: null,
      })
      expect(t1).not.toBe(t2)
    })

    it('embeds the subject in the token payload', async () => {
      const sub = '550e8400-e29b-41d4-a716-446655440000'
      const token = await tokenService.generateAccessToken({
        sub,
        email: 'test@example.com',
        name: 'Test',
        roles: [],
        activeRole: null,
      })
      // Decode the payload (second segment) without verifying signature
      const payloadB64 = token.split('.')[1]
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
      expect(payload.sub).toBe(sub)
    })

    it('includes jti claim in token', async () => {
      const token = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test',
        roles: [],
        activeRole: null,
      })
      const payloadB64 = token.split('.')[1]
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
      expect(payload.jti).toBeDefined()
      expect(typeof payload.jti).toBe('string')
    })

    it('includes iat and exp claims', async () => {
      const token = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test',
        roles: [],
        activeRole: null,
      })
      const payloadB64 = token.split('.')[1]
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeDefined()
      expect(payload.exp).toBeGreaterThan(payload.iat)
    })
  })

  describe('generateRefreshToken', () => {
    it('returns token and hash', () => {
      const { token, hash } = tokenService.generateRefreshToken()
      expect(typeof token).toBe('string')
      expect(typeof hash).toBe('string')
      expect(token.length).toBeGreaterThan(32)
      expect(hash.length).toBe(64) // SHA-256 hex = 64 chars
    })

    it('generates different tokens each call', () => {
      const r1 = tokenService.generateRefreshToken()
      const r2 = tokenService.generateRefreshToken()
      expect(r1.token).not.toBe(r2.token)
      expect(r1.hash).not.toBe(r2.hash)
    })

    it('token is 128-char hex (64 random bytes)', () => {
      const { token } = tokenService.generateRefreshToken()
      // randomBytes(64).toString('hex') = 128 hex chars
      expect(token).toMatch(/^[0-9a-f]{128}$/)
    })

    it('hash matches hashToken of the same token', () => {
      const { token, hash } = tokenService.generateRefreshToken()
      expect(hash).toBe(tokenService.hashToken(token))
    })
  })

  describe('verifyAccessToken', () => {
    it('verifies a valid token and returns payload', async () => {
      const payload = {
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test',
        roles: [{ role: 'COACH' as const, teamId: null }],
        activeRole: null,
      }
      const token = await tokenService.generateAccessToken(payload)
      const verified = await tokenService.verifyAccessToken(token)
      expect(verified.sub).toBe(payload.sub)
      expect(verified.email).toBe(payload.email)
      expect(verified.name).toBe(payload.name)
    })

    it('returns roles in verified payload', async () => {
      const roles = [
        { role: 'COACH' as const, teamId: null },
        { role: 'PARENT' as const, teamId: '550e8400-e29b-41d4-a716-446655440099' },
      ]
      const token = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test',
        roles,
        activeRole: roles[0],
      })
      const verified = await tokenService.verifyAccessToken(token)
      expect(verified.roles).toHaveLength(2)
      expect(verified.roles[0].role).toBe('COACH')
    })

    it('throws on tampered token', async () => {
      const token = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test',
        roles: [],
        activeRole: null,
      })
      const tampered = token.slice(0, -5) + 'XXXXX'
      await expect(tokenService.verifyAccessToken(tampered)).rejects.toThrow()
    })

    it('throws on invalid string', async () => {
      await expect(tokenService.verifyAccessToken('not-a-jwt')).rejects.toThrow()
    })

    it('throws on empty string', async () => {
      await expect(tokenService.verifyAccessToken('')).rejects.toThrow()
    })

    it('throws on token signed with a different key (key rotation simulation)', async () => {
      // Generate a token, then reset key cache to force new key pair
      const token = await tokenService.generateAccessToken({
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test',
        roles: [],
        activeRole: null,
      })
      // Reset cache — new ephemeral key pair will be generated
      tokenService._resetKeyCache()
      // Old token signed with old key should fail verification against new key
      await expect(tokenService.verifyAccessToken(token)).rejects.toThrow()
    })
  })

  describe('hashToken', () => {
    it('returns consistent SHA-256 hex hash', () => {
      const h1 = tokenService.hashToken('test-token')
      const h2 = tokenService.hashToken('test-token')
      expect(h1).toBe(h2)
      expect(h1.length).toBe(64)
    })

    it('different inputs produce different hashes', () => {
      const h1 = tokenService.hashToken('token-a')
      const h2 = tokenService.hashToken('token-b')
      expect(h1).not.toBe(h2)
    })

    it('hash is hex-only string', () => {
      const hash = tokenService.hashToken('any-token-value')
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('empty string has a deterministic hash', () => {
      // SHA-256('') is well-known
      const hash = tokenService.hashToken('')
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })
  })
})
