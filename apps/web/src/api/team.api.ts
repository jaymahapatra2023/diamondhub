import type {
  CreateTeamRequest,
  TeamResponse,
  AddPlayerRequest,
  InviteRequest,
  RsvpRequest,
  EmergencyContact,
} from '@diamondhub/contracts'
import { apiClient } from './client.js'

export const teamApi = {
  // Teams
  getMyTeams: () => apiClient.get<TeamResponse[]>('/teams').then((r) => r.data),
  createTeam: (data: CreateTeamRequest) =>
    apiClient.post<TeamResponse>('/teams', data).then((r) => r.data),
  getTeam: (teamId: string) =>
    apiClient.get<TeamResponse>(`/teams/${teamId}`).then((r) => r.data),

  // Roster — API returns team members ({memberId, name, ...}); map to the
  // PlayerResponse shape the UI expects ({id, firstName, lastName, ...}).
  getRoster: (teamId: string) =>
    apiClient.get<any[]>(`/teams/${teamId}/roster`).then((r) =>
      (r.data ?? []).map((m: any) => {
        const parts = String(m.name ?? '').trim().split(/\s+/)
        const firstName = parts[0] ?? ''
        const lastName = parts.slice(1).join(' ')
        return {
          id: m.memberId ?? m.id ?? m.userId,
          userId: m.userId,
          teamId,
          name: m.name ?? `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          jerseyNumber: m.jerseyNumber ?? null,
          positions: m.positions ?? [],
          dateOfBirth: m.dateOfBirth ?? null,
          bats: m.bats ?? null,
          throws: m.throws ?? null,
          status: m.status ?? 'ACTIVE',
          hasEmergencyContact: m.hasEmergencyContact ?? false,
          documentsCount: m.documentsCount ?? 0,
          role: m.role,
        }
      }),
    ),
  addPlayer: (teamId: string, data: AddPlayerRequest) =>
    apiClient.post<any>(`/teams/${teamId}/roster`, data).then((r) => r.data),
  archivePlayer: (teamId: string, memberId: string) =>
    apiClient.delete(`/teams/${teamId}/roster/${memberId}`).then((r) => r.data),

  // Invites
  createInvite: (teamId: string, data: InviteRequest) =>
    apiClient
      .post<{ inviteLink: string; token: string; expiresAt: string }>(
        `/teams/${teamId}/invites`,
        data,
      )
      .then((r) => r.data),
  getPendingInvites: (teamId: string) =>
    apiClient.get<any[]>(`/teams/${teamId}/invites`).then((r) => r.data),
  revokeInvite: (teamId: string, inviteId: string) =>
    apiClient.delete(`/teams/${teamId}/invites/${inviteId}`).then((r) => r.data),
  acceptInvite: (token: string) =>
    apiClient.post<any>(`/teams/join/${token}`).then((r) => r.data),

  // RSVP
  setRsvp: (teamId: string, eventId: string, data: RsvpRequest) =>
    apiClient
      .post(`/teams/${teamId}/events/${eventId}/rsvp`, data)
      .then((r) => r.data),
  getRsvps: (teamId: string, eventId: string) =>
    apiClient
      .get<any>(`/teams/${teamId}/events/${eventId}/rsvp`)
      .then((r) => r.data),

  // Emergency contact
  getEmergencyContact: (teamId: string, memberId: string) =>
    apiClient
      .get<EmergencyContact>(
        `/teams/${teamId}/roster/${memberId}/emergency-contact`,
      )
      .then((r) => r.data),
  setEmergencyContact: (
    teamId: string,
    memberId: string,
    data: EmergencyContact,
  ) =>
    apiClient
      .put(`/teams/${teamId}/roster/${memberId}/emergency-contact`, data)
      .then((r) => r.data),

  // Documents
  getDocumentUploadUrl: (
    teamId: string,
    memberId: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number,
  ) =>
    apiClient
      .post<{ uploadUrl: string; s3Key: string }>(
        `/teams/${teamId}/roster/${memberId}/documents/upload-url`,
        { fileName, mimeType, sizeBytes },
      )
      .then((r) => r.data),
  getDocuments: (teamId: string, memberId: string) =>
    apiClient
      .get<any[]>(`/teams/${teamId}/roster/${memberId}/documents`)
      .then((r) => r.data),
}
