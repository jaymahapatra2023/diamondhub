import { apiClient } from './client.js'

export const registrationApi = {
  startRegistration: (data: { tournamentId: string; teamId: string; division: string }) =>
    apiClient.post('/registrations', data).then(r => r.data),

  withdraw: (registrationId: string, teamId: string) =>
    apiClient.patch(`/registrations/${registrationId}/withdraw`, { teamId }).then(r => r.data),

  lockRoster: (registrationId: string) =>
    apiClient.post(`/registrations/${registrationId}/lock-roster`).then(r => r.data),

  getTeamRegistrations: (teamId: string) =>
    apiClient.get(`/registrations/team/${teamId}`).then(r => r.data),

  getPaymentHistory: (teamId: string) =>
    apiClient.get(`/registrations/team/${teamId}/payment-history`).then(r => r.data),
}
