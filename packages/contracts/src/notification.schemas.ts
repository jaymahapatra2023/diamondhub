// E5 · Notifications & Alerts — Zod Schemas

import { z } from 'zod'

export const NotificationTypeSchema = z.enum([
  'GAME_TIME_CHANGE',
  'GAME_CANCELLED',
  'RAIN_DELAY',
  'FIELDS_CLOSED',
  'BRACKET_UPDATE',
  'RSVP_REMINDER',
  'NEW_TOURNAMENT',
  'REGISTRATION_CONFIRMED',
  'ROSTER_APPROVED',
  'PAYMENT_DUE',
  'TEAM_ANNOUNCEMENT',
  'NEW_MESSAGE',
  'INVITE',
  'CONFLICT_DETECTED',
  'WAITLIST_SPOT_OPEN',
  'WEATHER_ALERT',
  'EMAIL_VERIFIED',
  'ALL_CLEAR',
])
export type NotificationType = z.infer<typeof NotificationTypeSchema>

export const NotificationChannelSchema = z.enum(['PUSH', 'SMS', 'EMAIL', 'IN_APP'])
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>

// Per-alert-type preferences
export const AlertPreferenceSchema = z.object({
  push: z.boolean(),
  sms: z.boolean(),
  email: z.boolean(),
})
export type AlertPreference = z.infer<typeof AlertPreferenceSchema>

export const NotificationPreferencesSchema = z.record(
  NotificationTypeSchema,
  AlertPreferenceSchema,
)
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>

// Default preferences by role
export const DEFAULT_COACH_PREFS: NotificationPreferences = Object.fromEntries(
  NotificationTypeSchema.options.map((type) => [type, { push: true, sms: true, email: true }]),
) as NotificationPreferences

export const DEFAULT_PARENT_PREFS: NotificationPreferences = Object.fromEntries(
  NotificationTypeSchema.options.map((type) => [
    type,
    {
      push: true,
      sms: ['GAME_TIME_CHANGE', 'GAME_CANCELLED', 'RAIN_DELAY', 'FIELDS_CLOSED'].includes(type),
      email: ['NEW_TOURNAMENT', 'REGISTRATION_CONFIRMED'].includes(type),
    },
  ]),
) as NotificationPreferences

export const DEFAULT_PLAYER_PREFS: NotificationPreferences = Object.fromEntries(
  NotificationTypeSchema.options.map((type) => [
    type,
    { push: true, sms: false, email: false },
  ]),
) as NotificationPreferences

// Notification record
export const NotificationResponseSchema = z.object({
  id: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()),
  isRead: z.boolean(),
  createdAt: z.string().datetime(),
})
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>

export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationResponseSchema),
  unreadCount: z.number(),
  total: z.number(),
})
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>

// Mark read
export const MarkReadRequestSchema = z.object({
  notificationIds: z.array(z.string().uuid()).optional(), // undefined = mark all
})
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>

// Broadcast (coach triggers weather/delay alerts)
export const BroadcastAlertRequestSchema = z.object({
  teamId: z.string().uuid(),
  type: z.enum(['RAIN_DELAY', 'GAME_CANCELLED', 'FIELDS_CLOSED', 'ALL_CLEAR', 'WEATHER_ALERT']),
  message: z.string().min(1).max(500),
})
export type BroadcastAlertRequest = z.infer<typeof BroadcastAlertRequestSchema>
