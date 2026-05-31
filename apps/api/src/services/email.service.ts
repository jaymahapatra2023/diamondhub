// P4: Email is dispatched fire-and-forget, never blocking API responses
import sgMail from '@sendgrid/mail'
import { config } from '../config.js'
import { logger } from '../lib/logger.js'

if (config.SENDGRID_API_KEY) {
  sgMail.setApiKey(config.SENDGRID_API_KEY)
}

function buildEmailHtml(title: string, body: string, ctaText?: string, ctaUrl?: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#030712;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:40px 20px;max-width:600px;margin:0 auto;">
      <div style="background:#111827;border-radius:12px;padding:32px;">
        <div style="color:#1e40af;font-size:24px;font-weight:700;margin-bottom:8px;">⚾ DiamondHub</div>
        <h1 style="color:#f9fafb;font-size:20px;margin:0 0 16px;">${title}</h1>
        <div style="color:#d1d5db;font-size:15px;line-height:1.6;">${body}</div>
        ${
          ctaText && ctaUrl
            ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:24px;background:#1e40af;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">${ctaText}</a>`
            : ''
        }
        <hr style="border:none;border-top:1px solid #1f2937;margin:32px 0 16px;"/>
        <div style="color:#6b7280;font-size:12px;">You received this email from DiamondHub. <a href="${config.APP_URL}/settings/notifications" style="color:#3b82f6;">Manage preferences</a></div>
      </div>
    </td></tr>
  </table>
</body>
</html>`
}

export const emailService = {
  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const url = `${config.APP_URL}/verify-email?token=${token}`
    if (!config.SENDGRID_API_KEY) {
      logger.info({ to, url }, '[DEV] Verification email — SendGrid not configured')
      return
    }
    await sgMail.send({
      to,
      from: config.SENDGRID_FROM_EMAIL,
      subject: 'Verify your DiamondHub account',
      html: buildEmailHtml(
        `Welcome, ${name}!`,
        'Click below to verify your email address and complete your account setup.',
        'Verify Email',
        url,
      ),
    })
    logger.info({ to }, 'Verification email sent')
  },

  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    const url = `${config.APP_URL}/reset-password?token=${token}`
    if (!config.SENDGRID_API_KEY) {
      logger.info({ to, url }, '[DEV] Password reset email — SendGrid not configured')
      return
    }
    await sgMail.send({
      to,
      from: config.SENDGRID_FROM_EMAIL,
      subject: 'Reset your DiamondHub password',
      html: buildEmailHtml(
        `Hi ${name},`,
        'You requested a password reset. Click below to set a new password. This link expires in 1 hour.',
        'Reset Password',
        url,
      ),
    })
    logger.info({ to }, 'Password reset email sent')
  },

  async sendTeamInviteEmail(
    to: string,
    inviterName: string,
    teamName: string,
    role: string,
    inviteLink: string,
  ): Promise<void> {
    if (!config.SENDGRID_API_KEY) {
      logger.info({ to, inviteLink }, '[DEV] Team invite email — SendGrid not configured')
      return
    }
    await sgMail.send({
      to,
      from: config.SENDGRID_FROM_EMAIL,
      subject: `${inviterName} invited you to ${teamName} on DiamondHub`,
      html: buildEmailHtml(
        `You're invited!`,
        `<strong>${inviterName}</strong> has invited you to join <strong>${teamName}</strong> as a ${role.toLowerCase().replace('_', ' ')}.`,
        'Accept Invitation',
        inviteLink,
      ),
    })
    logger.info({ to, teamName }, 'Team invite email sent')
  },
}
