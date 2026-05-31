// E7 · Tournament Registration & Payments routes
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  startRegistrationHandler,
  withdrawHandler,
  lockRosterHandler,
  unlockRosterHandler,
  getRegistrationsHandler,
  getPaymentHistoryHandler,
  stripeWebhookHandler,
} from './handlers.js'

export async function registrationRoutes(app: FastifyInstance) {
  // ── Stripe Webhook ──────────────────────────────────────────────────────────
  // Isolated in its own sub-plugin so it gets its own content-type parser scope
  // (raw Buffer body) and is not affected by the authenticate preHandler hook.
  await app.register(async (webhookPlugin) => {
    // P8: Keep body as raw Buffer so stripe.webhooks.constructEvent can verify the signature.
    webhookPlugin.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    )
    webhookPlugin.post('/webhook/stripe', stripeWebhookHandler)
  })

  // ── Authenticated Routes ────────────────────────────────────────────────────
  await app.register(async (authPlugin) => {
    authPlugin.addHook('preHandler', authenticate)

    authPlugin.post('/', startRegistrationHandler)                         // Start registration
    authPlugin.get('/team/:teamId', getRegistrationsHandler)               // Team's registrations
    authPlugin.get('/team/:teamId/payment-history', getPaymentHistoryHandler)
    authPlugin.patch('/:id/withdraw', withdrawHandler)
    authPlugin.post('/:id/lock-roster', lockRosterHandler)
    authPlugin.patch('/:id/unlock-roster', unlockRosterHandler)
  })
}
