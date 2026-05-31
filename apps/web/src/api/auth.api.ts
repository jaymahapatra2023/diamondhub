import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  UpdateProfileRequest,
  UserProfile,
  AssignRoleRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  RefreshResponse,
  GoogleOAuthRequest,
} from '@diamondhub/contracts'
import { apiClient } from './client.js'

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<RegisterResponse>('/auth/register', data).then((r) => r.data),

  login: (data: LoginRequest) =>
    apiClient.post<LoginResponse>('/auth/login', data).then((r) => r.data),

  logout: () =>
    apiClient.post<{ message: string }>('/auth/logout').then((r) => r.data),

  refresh: () =>
    apiClient.post<RefreshResponse>('/auth/refresh').then((r) => r.data),

  forgotPassword: (data: ForgotPasswordRequest) =>
    apiClient
      .post<{ message: string }>('/auth/forgot-password', data)
      .then((r) => r.data),

  resetPassword: (data: ResetPasswordRequest) =>
    apiClient
      .post<{ message: string }>('/auth/reset-password', data)
      .then((r) => r.data),

  verifyEmail: (token: string) =>
    apiClient
      .get<{ message: string }>(`/auth/verify-email?token=${token}`)
      .then((r) => r.data),

  googleOAuth: (data: GoogleOAuthRequest) =>
    apiClient
      .post<LoginResponse>('/auth/oauth/google', data)
      .then((r) => r.data),

  getMe: () => apiClient.get<UserProfile>('/auth/me').then((r) => r.data),

  updateMe: (data: UpdateProfileRequest) =>
    apiClient.patch<UserProfile>('/auth/me', data).then((r) => r.data),

  assignRole: (data: AssignRoleRequest) =>
    apiClient
      .post<{ message: string }>('/auth/me/roles', data)
      .then((r) => r.data),

  logoutAll: () =>
    apiClient
      .delete<{ message: string }>('/auth/me/sessions')
      .then((r) => r.data),
}
