// E4 · Schedule & Calendar — Zod Schemas

import { z } from 'zod'

export const EventTypeSchema = z.enum([
  'PRACTICE',
  'GAME',
  'MEETING',
  'OTHER',
  'TOURNAMENT',
])
export type EventType = z.infer<typeof EventTypeSchema>

export const CreateEventRequestSchema = z
  .object({
    title: z.string().min(1).max(200).trim(),
    type: EventTypeSchema,
    startTime: z.string().datetime({ message: 'Invalid start time' }),
    endTime: z.string().datetime({ message: 'Invalid end time' }),
    locationName: z.string().max(200).optional(),
    locationAddress: z.string().max(300).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    notes: z.string().max(2000).optional(),
    sendNotification: z.boolean().default(true),
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: 'End time must be after start time',
    path: ['endTime'],
  })
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>

export const UpdateEventRequestSchema = CreateEventRequestSchema.innerType().partial()
export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>

export const ScheduleEventResponseSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  type: EventTypeSchema,
  title: z.string(),
  locationName: z.string().nullable(),
  locationAddress: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  notes: z.string().nullable(),
  isCancelled: z.boolean(),
  cancelledAt: z.string().datetime().nullable(),
  rsvpCounts: z
    .object({
      yes: z.number(),
      no: z.number(),
      maybe: z.number(),
      noResponse: z.number(),
    })
    .optional(),
  userRsvp: z.enum(['YES', 'NO', 'MAYBE']).nullable().optional(),
  hasConflict: z.boolean().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type ScheduleEventResponse = z.infer<typeof ScheduleEventResponseSchema>

export const CalendarRangeParamsSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  teamId: z.string().uuid().optional(),
})
export type CalendarRangeParams = z.infer<typeof CalendarRangeParamsSchema>
