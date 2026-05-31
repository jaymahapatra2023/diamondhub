// E5 · FCM Service — Firebase Cloud Messaging push notifications
// P12: Pino logging on all dispatch operations
// Uses FCM HTTP v1 API (legacy key-based fallback for dev)

import { logger } from '../logger.js'

export const fcmService = {
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const fcmKey = process.env['FCM_SERVER_KEY']
    if (!fcmKey) {
      logger.info({ tokens: tokens.length, title }, '[DEV] FCM not configured — push not sent')
      return
    }

    // Batch into chunks of 500 (FCM limit)
    const chunks: string[][] = []
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500))
    }

    for (const chunk of chunks) {
      try {
        const response = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            Authorization: `key=${fcmKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registration_ids: chunk,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            priority: 'high',
          }),
        })

        if (!response.ok) {
          logger.error({ status: response.status }, 'FCM batch send failed')
        } else {
          logger.info({ count: chunk.length, title }, 'FCM push sent')
        }
      } catch (err) {
        logger.error({ err }, 'FCM request error')
      }
    }
  },

  // Clean up dead device tokens (called after FCM returns NotRegistered)
  async removeDeadToken(token: string): Promise<void> {
    const { prisma } = await import('@diamondhub/db')
    await prisma.deviceToken.updateMany({
      where: { token },
      data: { isActive: false },
    })
    logger.info({ token: token.slice(0, 10) }, 'Device token deactivated')
  },
}
