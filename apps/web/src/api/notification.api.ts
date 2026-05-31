import type { NotificationPreferences, RegisterDeviceToken } from '@diamondhub/contracts'
import { apiClient } from './client.js'

export const notificationApi = {
  getNotifications: (page = 1) =>
    apiClient.get('/notifications', { params: { page } }).then((r) => r.data),

  markRead: (notificationIds?: string[]) =>
    apiClient.patch('/notifications/read', { notificationIds }).then((r) => r.data),

  getPreferences: () =>
    apiClient.get('/notifications/preferences').then((r) => r.data),

  updatePreferences: (prefs: NotificationPreferences) =>
    apiClient.put('/notifications/preferences', prefs).then((r) => r.data),

  registerDeviceToken: (data: RegisterDeviceToken) =>
    apiClient.post('/notifications/device-tokens', data).then((r) => r.data),

  unregisterDeviceToken: (token: string) =>
    apiClient.delete('/notifications/device-tokens', { data: { token } }).then((r) => r.data),

  broadcast: (data: { teamId: string; type: string; message: string }) =>
    apiClient.post('/notifications/broadcast', data).then((r) => r.data),
}
