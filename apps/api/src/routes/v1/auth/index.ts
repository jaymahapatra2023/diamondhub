// E1 auth route registration — all routes under /api/v1/auth
import type { FastifyInstance } from 'fastify'
import { registerHandler } from './register.js'
import { loginHandler } from './login.js'
import { logoutHandler, logoutAllHandler } from './logout.js'
import { refreshHandler } from './refresh.js'
import { resetPasswordHandler } from './reset-password.js'
import { profileHandler } from './profile.js'
import { googleOAuthHandler } from './google-oauth.js'
import { verifyEmailHandler } from './verify-email.js'
import { authenticate } from '../../../middleware/authenticate.js'

// E1-S1: Per-route rate limit — 5 req/min per IP for sensitive auth endpoints (P8)
// Disabled in test env to avoid 429s in test suite
const SENSITIVE_RATE_LIMIT = process.env['NODE_ENV'] === 'test'
  ? {}
  : {
      config: {
        rateLimit: {
          // 20/min per IP — blocks brute force (needs thousands of tries) while
          // tolerating shared-IP scenarios (corporate NAT, families, retries).
          max: 20,
          timeWindow: '1 minute',
        },
      },
    }

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Public routes
  app.post('/register', SENSITIVE_RATE_LIMIT, registerHandler)
  app.post('/login', SENSITIVE_RATE_LIMIT, loginHandler)
  app.post('/logout', logoutHandler)
  app.post('/refresh', refreshHandler)
  app.post('/forgot-password', SENSITIVE_RATE_LIMIT, resetPasswordHandler.forgot)
  app.post('/reset-password', SENSITIVE_RATE_LIMIT, resetPasswordHandler.reset)
  app.get('/verify-email', verifyEmailHandler)
  app.post('/oauth/google', googleOAuthHandler)

  // Protected routes — require valid JWT
  app.get('/me', { preHandler: authenticate }, profileHandler.getMe)
  app.patch('/me', { preHandler: authenticate }, profileHandler.updateMe)
  app.post('/me/roles', { preHandler: authenticate }, profileHandler.assignRole)
  app.delete('/me/sessions', { preHandler: authenticate }, logoutAllHandler)
}
