// E5 · Email Notification Service — SendGrid transactional emails
// P12: Pino logging on all dispatch operations
// Graceful no-op when SENDGRID_API_KEY is not configured (dev/test)

import { logger } from '../logger.js'

export const emailNotificationService = {
  async send(
    to: string,
    name: string,
    title: string,
    body: string,
    type: string,
  ): Promise<void> {
    const apiKey = process.env['SENDGRID_API_KEY']
    if (!apiKey) {
      logger.info({ to, title }, '[DEV] SendGrid not configured — email notification not sent')
      return
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to, name }] }],
          from: {
            email: process.env['SENDGRID_FROM_EMAIL'] ?? 'noreply@diamondhub.app',
            name: 'DiamondHub',
          },
          subject: title,
          content: [{ type: 'text/plain', value: body }],
        }),
      })

      if (!response.ok) {
        logger.error({ status: response.status, to }, 'SendGrid notification failed')
      } else {
        logger.info({ to, type }, 'Notification email sent')
      }
    } catch (err) {
      logger.error({ err, to }, 'SendGrid request error')
    }
  },
}
