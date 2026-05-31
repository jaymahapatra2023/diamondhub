// E5 · Notifications & Alerts — Route registration
// P2: All routes protected by authenticate middleware
// P4: No synchronous dispatch — all sends go through Bull queue via notificationService

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  getNotificationsHandler,
  markReadHandler,
  getPrefsHandler,
  updatePrefsHandler,
  registerTokenHandler,
  unregisterTokenHandler,
  broadcastHandler,
} from './handlers.js'

export async function notificationRoutes(app: FastifyInstance) {
  // P2: All notification routes require a valid JWT
  app.addHook('preHandler', authenticate)

  // GET  /api/v1/notifications?page=&limit=
  app.get('/', getNotificationsHandler)

  // PATCH /api/v1/notifications/read  — mark notifications as read
  app.patch('/read', markReadHandler)

  // GET  /api/v1/notifications/preferences
  app.get('/preferences', getPrefsHandler)

  // PUT  /api/v1/notifications/preferences
  app.put('/preferences', updatePrefsHandler)

  // POST   /api/v1/notifications/device-tokens  — register FCM/APNs token
  app.post('/device-tokens', registerTokenHandler)

  // DELETE /api/v1/notifications/device-tokens  — deregister token (logout)
  app.delete('/device-tokens', unregisterTokenHandler)

  // POST /api/v1/notifications/broadcast  — coach triggers weather/delay alert
  app.post('/broadcast', broadcastHandler)
}
