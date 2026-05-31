// E15 · Organization / Club Admin — API client
import { apiClient } from './client.js'

export const organizationApi = {
  createOrg: (name: string) =>
    apiClient.post('/organizations', { name }).then((r) => r.data),

  getMyOrg: () =>
    apiClient.get('/organizations/me').then((r) => r.data),

  getDashboard: (orgId: string) =>
    apiClient.get(`/organizations/${orgId}/dashboard`).then((r) => r.data),

  addCoach: (orgId: string, email: string) =>
    apiClient.post(`/organizations/${orgId}/coaches`, { email }).then((r) => r.data),

  linkTeam: (orgId: string, teamId: string) =>
    apiClient.post(`/organizations/${orgId}/teams`, { teamId }).then((r) => r.data),

  getPlayers: (orgId: string, query?: { name?: string; dateOfBirth?: string }) =>
    apiClient
      .get(`/organizations/${orgId}/players`, { params: query })
      .then((r) => r.data),
}
