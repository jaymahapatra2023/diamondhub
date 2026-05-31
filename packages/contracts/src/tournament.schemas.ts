// E2 · Tournament Discovery & Search — Zod Schemas

import { z } from 'zod'

// ── Enums ─────────────────────────────────────────────────────────────────

export const SportSchema = z.enum(['BASEBALL', 'SOFTBALL', 'BOTH'])
export type Sport = z.infer<typeof SportSchema>

export const OrganizerSchema = z.enum([
  'PERFECT_GAME',
  'USSSA',
  'USA_BASEBALL',
  'TOP_GUN',
  'SWAT',
  'IMPACT',
  'TRIPLE_CROWN',
  'TBS',
  'OTHER',
])
export type Organizer = z.infer<typeof OrganizerSchema>

export const TournamentFormatSchema = z.enum([
  'POOL_BRACKET',
  'DOUBLE_ELIM',
  'ROUND_ROBIN',
  'SINGLE_ELIM',
])
export type TournamentFormat = z.infer<typeof TournamentFormatSchema>

export const SurfaceSchema = z.enum(['TURF', 'GRASS', 'MIXED'])
export type Surface = z.infer<typeof SurfaceSchema>

export const TournamentStatusSchema = z.enum([
  'UPCOMING',
  'OPEN',
  'WAITLIST',
  'CLOSED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
])
export type TournamentStatus = z.infer<typeof TournamentStatusSchema>

export const AGE_DIVISIONS = [
  '6U', '7U', '8U', '9U', '10U', '11U', '12U',
  '13U', '14U', '15U', '16U', '17U', '18U',
] as const
export const AgeDivisionSchema = z.enum(AGE_DIVISIONS)
export type AgeDivision = z.infer<typeof AgeDivisionSchema>

// ── E2-S1: Search params ──────────────────────────────────────────────────

export const SortBySchema = z.enum(['date', 'distance', 'entryFee'])
export type SortBy = z.infer<typeof SortBySchema>

export const TournamentSearchParamsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  zip: z.string().regex(/^\d{5}$/, 'ZIP must be 5 digits').optional(),
  city: z.string().optional(),
  state: z.string().length(2, 'State must be 2-letter abbreviation').optional(),
  radiusMiles: z.coerce.number().min(1).max(500).default(50),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sport: SportSchema.optional(),
  ageDivisions: z.array(AgeDivisionSchema).optional(),
  organizers: z.array(OrganizerSchema).optional(),
  entryFeeMin: z.coerce.number().min(0).optional(),
  entryFeeMax: z.coerce.number().min(0).optional(),
  surface: SurfaceSchema.optional(),
  format: TournamentFormatSchema.optional(),
  sortBy: SortBySchema.default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
})
export type TournamentSearchParams = z.infer<typeof TournamentSearchParamsSchema>

// ── Tournament response shapes ────────────────────────────────────────────

export const TournamentSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  organizer: OrganizerSchema,
  sport: SportSchema,
  ageDivisions: z.array(z.string()),
  format: TournamentFormatSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  city: z.string(),
  state: z.string(),
  entryFee: z.number(),
  maxTeams: z.number().nullable(),
  currentTeams: z.number(),
  spotsRemaining: z.number().nullable(),
  status: TournamentStatusSchema,
  dataSource: z.enum(['MANUAL', 'SCRAPED', 'PARTNER', 'COMMUNITY']),
  registrationUrl: z.string().url().nullable(),
  distanceMeters: z.number().optional(),
  lat: z.number(),
  lng: z.number(),
})
export type TournamentSummary = z.infer<typeof TournamentSummarySchema>

export const TournamentDetailSchema = TournamentSummarySchema.extend({
  registrationDeadline: z.string().datetime().nullable(),
  address: z.string(),
  zip: z.string(),
  fieldsCount: z.number(),
  surface: SurfaceSchema,
  hotelDealUrl: z.string().url().nullable(),
  registrationUrl: z.string().url().nullable(),
  sourceUrl: z.string().url().nullable(),
  umpireInfo: z.string().nullable(),
  notes: z.string().nullable(),
  isBookmarked: z.boolean(),
  isFollowing: z.boolean(),
})
export type TournamentDetail = z.infer<typeof TournamentDetailSchema>

export const TournamentSearchResponseSchema = z.object({
  tournaments: z.array(TournamentSummarySchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
})
export type TournamentSearchResponse = z.infer<typeof TournamentSearchResponseSchema>

// ── E12: Admin create/edit tournament ─────────────────────────────────────

export const CreateTournamentSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  organizer: OrganizerSchema,
  sport: SportSchema,
  ageDivisions: z.array(AgeDivisionSchema).min(1),
  format: TournamentFormatSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  registrationDeadline: z.string().datetime().optional(),
  locationName: z.string().min(2).max(200),
  address: z.string().min(2).max(300),
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  entryFee: z.number().min(0).default(0),
  maxTeams: z.number().int().min(1).optional(),
  fieldsCount: z.number().int().min(1).default(1),
  surface: SurfaceSchema.default('GRASS'),
  hotelDealUrl: z.string().url().optional(),
  registrationUrl: z.string().url().optional(),
  umpireInfo: z.string().optional(),
  notes: z.string().optional(),
}).refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
  message: 'End date must be on or after start date',
  path: ['endDate'],
})
export type CreateTournament = z.infer<typeof CreateTournamentSchema>
