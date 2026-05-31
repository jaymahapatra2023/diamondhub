import { apiClient } from './client.js'

export const messageApi = {
  getTeamMessages: (teamId: string, page = 1) =>
    apiClient.get(`/messages/teams/${teamId}`, { params: { page } }).then(r => r.data),

  sendTeamMessage: (teamId: string, body: string) =>
    apiClient.post(`/messages/teams/${teamId}`, { body }).then(r => r.data),

  getDmMessages: (teamId: string, recipientId: string, page = 1) =>
    apiClient.get(`/messages/teams/${teamId}/dm/${recipientId}`, { params: { page } }).then(r => r.data),

  sendDm: (teamId: string, recipientId: string, body: string) =>
    apiClient.post(`/messages/teams/${teamId}/dm/${recipientId}`, { body }).then(r => r.data),

  deleteMessage: (messageId: string) =>
    apiClient.delete(`/messages/${messageId}`).then(r => r.data),

  markRead: (messageId: string) =>
    apiClient.post(`/messages/${messageId}/read`).then(r => r.data),

  getAnnouncements: (teamId: string) =>
    apiClient.get(`/messages/teams/${teamId}/announcements`).then(r => r.data),

  createAnnouncement: (teamId: string, data: { title: string; body: string }) =>
    apiClient.post(`/messages/teams/${teamId}/announcements`, data).then(r => r.data),

  getInbox: () =>
    apiClient.get('/messages/inbox').then(r => r.data),
}
