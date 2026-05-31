// JWT service — P8: RS256 asymmetric signing, 15-min access tokens
import { SignJWT, jwtVerify, importPKCS8, importSPKI, generateKeyPair } from 'jose'
import { randomBytes, createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type { JwtPayload } from '@diamondhub/contracts'
import { config } from '../config.js'

type AccessTokenPayload = Omit<JwtPayload, 'iat' | 'exp' | 'jti'>

let _privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null
let _publicKey: Awaited<ReturnType<typeof importSPKI>> | null = null

// For tests only — generates an ephemeral key pair
let _testPrivateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null
let _testPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null

async function getPrivateKey() {
  if (_privateKey) return _privateKey
  if (config.NODE_ENV === 'test') {
    if (!_testPrivateKey) {
      const { privateKey, publicKey } = await generateKeyPair('RS256')
      _testPrivateKey = privateKey as any
      _testPublicKey = publicKey as any
    }
    return _testPrivateKey!
  }
  _privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, 'RS256')
  return _privateKey
}

async function getPublicKey() {
  if (_publicKey) return _publicKey
  if (config.NODE_ENV === 'test') {
    if (!_testPublicKey) {
      const { privateKey, publicKey } = await generateKeyPair('RS256')
      _testPrivateKey = privateKey as any
      _testPublicKey = publicKey as any
    }
    return _testPublicKey!
  }
  _publicKey = await importSPKI(config.JWT_PUBLIC_KEY, 'RS256')
  return _publicKey
}

export const tokenService = {
  async generateAccessToken(payload: AccessTokenPayload): Promise<string> {
    const privateKey = await getPrivateKey()
    return new SignJWT({
      ...payload,
      jti: uuidv4(),
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime(config.JWT_ACCESS_EXPIRES_IN)
      .setSubject(payload.sub)
      .sign(privateKey)
  },

  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(64).toString('hex')
    const hash = this.hashToken(token)
    return { token, hash }
  },

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const publicKey = await getPublicKey()
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] })
    return payload as unknown as JwtPayload
  },

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  },

  // Used in tests to reset key cache
  _resetKeyCache() {
    _privateKey = null
    _publicKey = null
    _testPrivateKey = null
    _testPublicKey = null
  },
}
