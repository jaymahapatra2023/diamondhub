// E1 · Authentication & Identity — Zod Schemas
// P9: All API contracts explicit. Zero runtime deps beyond Zod.

import { z } from 'zod'

// ── Shared primitives ──────────────────────────────────────────────────────

export const emailSchema = z.string().email('Invalid email').toLowerCase().trim()

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/\d/, 'Password must contain at least one number')

export const e164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format (e.g. +14155551234)')

// ── Enums ─────────────────────────────────────────────────────────────────

export const RoleSchema = z.enum(['COACH', 'PARENT', 'PLAYER', 'GUEST'])
export type Role = z.infer<typeof RoleSchema>

export const OAuthProviderSchema = z.enum(['GOOGLE', 'APPLE'])
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>

// ── E1-S1: Registration ───────────────────────────────────────────────────

export const RegisterRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  phone: e164PhoneSchema.optional(),
  timezone: z.string().default('America/New_York'),
})
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

export const RegisterResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    emailVerified: z.boolean(),
  }),
  accessToken: z.string(),
  message: z.string(),
})
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>

// ── E1-S2: Login ──────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const UserRoleItemSchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  teamId: z.string().uuid().nullable(),
  isPrimary: z.boolean(),
})
export type UserRoleItem = z.infer<typeof UserRoleItemSchema>

export const LoginResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
    emailVerified: z.boolean(),
    roles: z.array(UserRoleItemSchema),
  }),
  accessToken: z.string(),
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>

// ── E1-S5: Refresh ────────────────────────────────────────────────────────

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
})
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>

// ── E1-S6: Role assignment at onboarding ──────────────────────────────────

export const AssignRoleRequestSchema = z.object({
  role: z.enum(['COACH', 'PARENT', 'PLAYER']),
  teamId: z.string().uuid().optional(),
})
export type AssignRoleRequest = z.infer<typeof AssignRoleRequestSchema>

// ── E1-S7: Active role switch ─────────────────────────────────────────────

export const SwitchRoleRequestSchema = z.object({
  role: RoleSchema,
  teamId: z.string().uuid().nullable(),
})
export type SwitchRoleRequest = z.infer<typeof SwitchRoleRequestSchema>

// ── E1-S8: Password reset ─────────────────────────────────────────────────

export const ForgotPasswordRequestSchema = z.object({
  email: emailSchema,
})
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
  confirmPassword: z.string().min(1),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>

// ── E1-S9: Profile management ─────────────────────────────────────────────

export const UpdateProfileRequestSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: e164PhoneSchema.nullable().optional(),
  timezone: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
})
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
  timezone: z.string(),
  roles: z.array(UserRoleItemSchema),
  createdAt: z.string().datetime(),
})
export type UserProfile = z.infer<typeof UserProfileSchema>

// ── OAuth ─────────────────────────────────────────────────────────────────

export const GoogleOAuthRequestSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
})
export type GoogleOAuthRequest = z.infer<typeof GoogleOAuthRequestSchema>

// ── JWT Payload (internal — shared between api + web for type safety) ─────

export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  emailVerified: z.boolean(),
  roles: z.array(
    z.object({
      role: RoleSchema,
      teamId: z.string().uuid().nullable(),
    }),
  ),
  activeRole: z
    .object({
      role: RoleSchema,
      teamId: z.string().uuid().nullable(),
    })
    .nullable(),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().uuid(),
})
export type JwtPayload = z.infer<typeof JwtPayloadSchema>

// ── Common API error ──────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

// ── Device token (E5) ─────────────────────────────────────────────────────

export const RegisterDeviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
})
export type RegisterDeviceToken = z.infer<typeof RegisterDeviceTokenSchema>
