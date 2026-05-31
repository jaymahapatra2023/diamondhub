// E14 · Coach Analytics — API client
import { apiClient } from './client.js'

export const analyticsApi = {
  getSeasonCosts: (teamId: string) =>
    apiClient.get(`/analytics/teams/${teamId}/costs`).then((r) => r.data),
  getAttendance: (teamId: string) =>
    apiClient.get(`/analytics/teams/${teamId}/attendance`).then((r) => r.data),
  getWinRates: (teamId: string) =>
    apiClient.get(`/analytics/teams/${teamId}/win-rates`).then((r) => r.data),
}
