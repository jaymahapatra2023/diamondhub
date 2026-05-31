// E5 · SMS Service — Twilio SMS dispatch
// P12: Pino logging on all dispatch operations
// Graceful no-op when TWILIO_* env vars not configured (dev/test)

import { logger } from '../logger.js'

export const smsService = {
  async send(to: string, message: string): Promise<void> {
    const accountSid = process.env['TWILIO_ACCOUNT_SID']
    const authToken = process.env['TWILIO_AUTH_TOKEN']
    const fromNumber = process.env['TWILIO_FROM_NUMBER']

    if (!accountSid || !authToken || !fromNumber) {
      logger.info({ to, message: message.slice(0, 50) }, '[DEV] Twilio not configured — SMS not sent')
      return
    }

    try {
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: fromNumber, Body: message }).toString(),
        },
      )
      if (!response.ok) {
        logger.error({ status: response.status, to }, 'Twilio SMS failed')
      } else {
        logger.info({ to }, 'SMS sent')
      }
    } catch (err) {
      logger.error({ err, to }, 'SMS request error')
    }
  },
}
