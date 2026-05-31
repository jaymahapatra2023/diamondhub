import type {
  TournamentSearchParams,
  TournamentSearchResponse,
  TournamentDetail,
} from '@diamondhub/contracts'
import { apiClient } from './client.js'

export const tournamentApi = {
  search: (params: Partial<TournamentSearchParams>) =>
    apiClient.get<TournamentSearchResponse>('/tournaments', { params }).then(r => r.data),

  getById: (id: string) =>
    apiClient.get<TournamentDetail>(`/tournaments/${id}`).then(r => r.data),

  getThisWeekend: (lat: number, lng: number) =>
    apiClient.get<TournamentSearchResponse>('/tournaments/this-weekend', {
      params: { lat, lng },
    }).then(r => r.data),

  bookmark: (id: string) =>
    apiClient.post(`/tournaments/${id}/bookmark`).then(r => r.data),

  unbookmark: (id: string) =>
    apiClient.delete(`/tournaments/${id}/bookmark`).then(r => r.data),

  getBookmarks: () =>
    apiClient.get<TournamentSearchResponse>('/tournaments/bookmarks').then(r => r.data),

  follow: (id: string, guestToken?: string) =>
    apiClient.post(`/tournaments/${id}/follow`, { guestToken }).then(r => r.data),

  unfollow: (id: string, guestToken?: string) =>
    apiClient.delete(`/tournaments/${id}/follow`, { data: { guestToken } }).then(r => r.data),

  getSearchHistory: () =>
    apiClient.get<unknown[]>('/tournaments/search-history').then(r => r.data),
}
