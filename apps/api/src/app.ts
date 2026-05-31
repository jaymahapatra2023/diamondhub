// Fastify app factory — all plugins and routes registered here
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { redis } from './lib/redis.js'
import { config } from './config.js'
import { logger } from './lib/logger.js'
import { authRoutes } from './routes/v1/auth/index.js'
import { tournamentRoutes } from './routes/v1/tournaments/index.js'
import { teamRoutes } from './routes/v1/teams/index.js'
import { scheduleRoutes } from './routes/v1/schedule/index.js'
import { notificationRoutes } from './routes/v1/notifications/index.js'
import { registrationRoutes } from './routes/v1/registrations/index.js'
import { conflictRoutes } from './routes/v1/conflicts/index.js'
import { gameRoutes } from './routes/v1/games/index.js'
import { messageRoutes } from './routes/v1/messages/index.js'
import { playerStatsRoutes } from './routes/v1/player-stats/index.js'
import { analyticsRoutes } from './routes/v1/analytics/index.js'
import { organizationRoutes } from './routes/v1/organizations/index.js'

export async function buildApp() {
  // Fastify 5: use loggerInstance for a custom pino instance, false in test env
  const app = Fastify({
    ...(config.NODE_ENV === 'test'
      ? { logger: false }
      : { loggerInstance: logger }),
    trustProxy: true,
  })

  // P8: Security headers via helmet
  await app.register(helmet, {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })

  // P8: CORS explicit allowlist — never '*'
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })

  // httpOnly cookie support
  await app.register(cookie, {
    secret: config.COOKIE_SECRET,
  })

  // P8: Rate limiting — tighter on auth, broader on API
  // In test env skip Redis store (mock doesn't implement defineCommand)
  await app.register(rateLimit, {
    global: true,
    max: config.NODE_ENV === 'test' ? 10000 : 300,
    timeWindow: '1 minute',
    ...(config.NODE_ENV !== 'test' && { redis }),
    keyGenerator: (req) => {
      const user = (req as any).user
      return user?.sub ?? req.ip
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
    }),
  })

  // Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(tournamentRoutes, { prefix: '/api/v1/tournaments' })
  await app.register(teamRoutes, { prefix: '/api/v1/teams' })
  await app.register(scheduleRoutes, { prefix: '/api/v1/schedule' })
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' })
  await app.register(registrationRoutes, { prefix: '/api/v1/registrations' })
  await app.register(conflictRoutes, { prefix: '/api/v1/conflicts' })
  await app.register(gameRoutes, { prefix: '/api/v1/games' })
  await app.register(messageRoutes, { prefix: '/api/v1/messages' })
  await app.register(playerStatsRoutes, { prefix: '/api/v1/player-stats' })
  await app.register(analyticsRoutes, { prefix: '/api/v1/analytics' })
  await app.register(organizationRoutes, { prefix: '/api/v1/organizations' })

  // Health check (P12: observability)
  app.get('/health', async (req, reply) => {
    reply.code(200).send({ status: 'ok' })
  })

  // 404 handler
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Route ${req.method} ${req.url} not found` })
  })

  // Global error handler
  app.setErrorHandler((err, req, reply) => {
    logger.error({ err, url: req.url, method: req.method }, 'Unhandled error')
    reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'An unexpected error occurred' })
  })

  return app
}
