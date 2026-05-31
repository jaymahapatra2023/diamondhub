// E3 · Team Management — Zod Schemas

import { z } from 'zod'
import { SportSchema, AgeDivisionSchema } from './tournament.schemas.js'

// ── Enums ─────────────────────────────────────────────────────────────────

export const TeamMemberRoleSchema = z.enum([
  'HEAD_COACH',
  'ASSISTANT_COACH',
  'PLAYER',
  'PARENT',
])
export type TeamMemberRole = z.infer<typeof TeamMemberRoleSchema>

export const BatsSchema = z.enum(['RIGHT', 'LEFT', 'SWITCH'])
export type Bats = z.infer<typeof BatsSchema>

export const ThrowsSchema = z.enum(['RIGHT', 'LEFT'])
export type Throws = z.infer<typeof ThrowsSchema>

// ── E3-S1: Create team ────────────────────────────────────────────────────

export const CreateTeamRequestSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters').max(100).trim(),
  sport: SportSchema,
  ageDivision: AgeDivisionSchema,
  seasonYear: z.number().int().min(2020).max(2035),
  homeFieldName: z.string().max(200).optional(),
  homeFieldCity: z.string().max(100).optional(),
})
export type CreateTeamRequest = z.infer<typeof CreateTeamRequestSchema>

export const UpdateTeamRequestSchema = CreateTeamRequestSchema.partial().extend({
  photoUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
})
export type UpdateTeamRequest = z.infer<typeof UpdateTeamRequestSchema>

export const TeamResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sport: SportSchema,
  ageDivision: z.string(),
  seasonYear: z.number(),
  inviteCode: z.string(),
  coachId: z.string().uuid(),
  homeFieldName: z.string().nullable(),
  homeFieldCity: z.string().nullable(),
  photoUrl: z.string().nullable(),
  isActive: z.boolean(),
  memberCount: z.number(),
  nextEvent: z.unknown().nullable(),
  pendingRsvpCount: z.number(),
  createdAt: z.string().datetime(),
})
export type TeamResponse = z.infer<typeof TeamResponseSchema>

// ── E3-S3: Roster player ──────────────────────────────────────────────────

export const AddPlayerRequestSchema = z.object({
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  email: z.string().email().optional(),
  jerseyNumber: z.number().int().min(0).max(99).optional(),
  positions: z.array(z.string()).default([]),
  dateOfBirth: z.string().date().optional(),
  bats: BatsSchema.optional(),
  throws: ThrowsSchema.optional(),
})
export type AddPlayerRequest = z.infer<typeof AddPlayerRequestSchema>

export const UpdatePlayerRequestSchema = AddPlayerRequestSchema.partial()
export type UpdatePlayerRequest = z.infer<typeof UpdatePlayerRequestSchema>

export const PlayerResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  teamId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.number().nullable(),
  positions: z.array(z.string()),
  dateOfBirth: z.string().date().nullable(),
  bats: BatsSchema.nullable(),
  throws: ThrowsSchema.nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  hasEmergencyContact: z.boolean(),
  documentsCount: z.number(),
})
export type PlayerResponse = z.infer<typeof PlayerResponseSchema>

// ── E3-S4: Invite ─────────────────────────────────────────────────────────

export const InviteRequestSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['PLAYER', 'PARENT', 'ASSISTANT_COACH']),
  targetPlayerId: z.string().uuid().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
})
export type InviteRequest = z.infer<typeof InviteRequestSchema>

export const InviteResponseSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  teamName: z.string(),
  role: TeamMemberRoleSchema,
  inviteLink: z.string().url(),
  expiresAt: z.string().datetime(),
  isUsed: z.boolean(),
})
export type InviteResponse = z.infer<typeof InviteResponseSchema>

// ── E3-S7: RSVP ──────────────────────────────────────────────────────────

export const RsvpRequestSchema = z.object({
  status: z.enum(['YES', 'NO', 'MAYBE']),
  note: z.string().max(200).optional(),
  playerId: z.string().uuid().optional(),
})
export type RsvpRequest = z.infer<typeof RsvpRequestSchema>

export const RsvpCountsSchema = z.object({
  yes: z.number(),
  no: z.number(),
  maybe: z.number(),
  noResponse: z.number(),
})
export type RsvpCounts = z.infer<typeof RsvpCountsSchema>

// ── E3-S8: Documents ─────────────────────────────────────────────────────

export const DocumentTypeSchema = z.enum([
  'BIRTH_CERT',
  'MEDICAL_RELEASE',
  'WAIVER',
  'OTHER',
])
export type DocumentType = z.infer<typeof DocumentTypeSchema>

// ── E3-S9: Emergency contact ──────────────────────────────────────────────

export const EmergencyContactSchema = z.object({
  contactName: z.string().min(2).max(100).trim(),
  relationship: z.string().min(2).max(50).trim(),
  phone1: z.string().regex(/^\+[1-9]\d{1,14}$/),
  phone2: z.string().regex(/^\+[1-9]\d{1,14}$/).optional().nullable(),
})
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>
