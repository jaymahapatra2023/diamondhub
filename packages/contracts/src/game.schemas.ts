// E9 · Live Scoring & Brackets — Zod Schemas

import { z } from 'zod'

export const GameStatusSchema = z.enum([
  'SCHEDULED',
  'DELAYED',
  'LIVE',
  'FINAL',
  'CANCELLED',
])
export type GameStatus = z.infer<typeof GameStatusSchema>

export const InningHalfSchema = z.enum(['TOP', 'BOTTOM'])
export type InningHalf = z.infer<typeof InningHalfSchema>

export const InningDetailSchema = z.object({
  inning: z.number().int().min(1),
  home: z.number().int().min(0),
  away: z.number().int().min(0),
})
export type InningDetail = z.infer<typeof InningDetailSchema>

export const UpdateScoreRequestSchema = z.object({
  inning: z.number().int().min(1).max(20),
  half: InningHalfSchema,
  scoreHome: z.number().int().min(0),
  scoreAway: z.number().int().min(0),
  inningsDetail: z.array(InningDetailSchema).optional(),
  status: GameStatusSchema.optional(),
})
export type UpdateScoreRequest = z.infer<typeof UpdateScoreRequestSchema>

export const GameResponseSchema = z.object({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
  homeTeamName: z.string(),
  awayTeamName: z.string(),
  field: z.string().nullable(),
  round: z.string().nullable(),
  pool: z.string().nullable(),
  gameNumber: z.number().nullable(),
  scheduledTime: z.string().datetime(),
  actualStartTime: z.string().datetime().nullable(),
  scoreHome: z.number(),
  scoreAway: z.number(),
  inning: z.number(),
  half: InningHalfSchema,
  status: GameStatusSchema,
  winnerId: z.string().uuid().nullable(),
  inningsDetail: z.array(InningDetailSchema),
  updatedAt: z.string().datetime(),
})
export type GameResponse = z.infer<typeof GameResponseSchema>

export const BracketGameSchema = GameResponseSchema.extend({
  nextGameId: z.string().uuid().nullable(),
  isUserTeam: z.boolean(),
})
export type BracketGame = z.infer<typeof BracketGameSchema>

// Pool play standings
export const StandingsRowSchema = z.object({
  teamId: z.string().uuid(),
  teamName: z.string(),
  wins: z.number(),
  losses: z.number(),
  ties: z.number(),
  runsScored: z.number(),
  runsAllowed: z.number(),
  runDifferential: z.number(),
  pool: z.string().nullable(),
  isUserTeam: z.boolean(),
})
export type StandingsRow = z.infer<typeof StandingsRowSchema>

// Player stats (E11)
export const PlayerGameStatRequestSchema = z.object({
  playerId: z.string().uuid(),
  atBats: z.number().int().min(0).default(0),
  hits: z.number().int().min(0).default(0),
  doubles: z.number().int().min(0).default(0),
  triples: z.number().int().min(0).default(0),
  homeRuns: z.number().int().min(0).default(0),
  rbi: z.number().int().min(0).default(0),
  walks: z.number().int().min(0).default(0),
  strikeouts: z.number().int().min(0).default(0),
  inningsPitched: z.number().min(0).default(0),
  earnedRuns: z.number().int().min(0).default(0),
  pitchingWin: z.boolean().nullable().optional(),
})
export type PlayerGameStatRequest = z.infer<typeof PlayerGameStatRequestSchema>
