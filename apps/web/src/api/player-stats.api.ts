import { apiClient } from './client.js'

export const playerStatsApi = {
  getGameStats: (gameId: string) =>
    apiClient.get(`/player-stats/games/${gameId}`).then(r => r.data),

  upsertGameStat: (gameId: string, playerId: string, data: any) =>
    apiClient.post(`/player-stats/games/${gameId}/players/${playerId}`, data).then(r => r.data),

  getPlayerSeasonStats: (playerId: string, seasonYear?: number) =>
    apiClient.get(`/player-stats/players/${playerId}/season`, {
      params: seasonYear ? { seasonYear } : undefined
    }).then(r => r.data),

  getTeamRecord: (teamId: string, seasonYear?: number) =>
    apiClient.get(`/player-stats/teams/${teamId}/record`, {
      params: seasonYear ? { seasonYear } : undefined
    }).then(r => r.data),
}
