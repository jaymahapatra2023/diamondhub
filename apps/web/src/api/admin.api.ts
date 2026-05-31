import { apiClient } from './client.js'
import type { CreateTournament } from '@diamondhub/contracts'

export const adminApi = {
  createTournament: (data: CreateTournament) =>
    apiClient.post('/tournaments/admin', data).then(r => r.data),

  updateTournament: (id: string, data: Partial<CreateTournament>) =>
    apiClient.patch(`/tournaments/admin/${id}`, data).then(r => r.data),

  deleteTournament: (id: string) =>
    apiClient.delete(`/tournaments/admin/${id}`).then(r => r.data),

  publishTournament: (id: string) =>
    apiClient.post(`/tournaments/admin/${id}/publish`).then(r => r.data),
}
