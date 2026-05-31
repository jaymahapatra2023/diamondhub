import type { CreateEventRequest, ScheduleEventResponse } from '@diamondhub/contracts'
import { apiClient } from './client.js'

export const scheduleApi = {
  getUserEvents: (start: string, end: string) =>
    apiClient
      .get<ScheduleEventResponse[]>('/schedule', { params: { start, end } })
      .then((r) => r.data),

  getTeamEvents: (teamId: string, start: string, end: string) =>
    apiClient
      .get<ScheduleEventResponse[]>(`/schedule/teams/${teamId}`, { params: { start, end } })
      .then((r) => r.data),

  exportIcs: (teamId: string) =>
    `/api/v1/schedule/teams/${teamId}/export.ics`,

  createEvent: (teamId: string, data: CreateEventRequest) =>
    apiClient
      .post<ScheduleEventResponse>(`/schedule/teams/${teamId}/events`, data)
      .then((r) => r.data),

  updateEvent: (teamId: string, eventId: string, data: Partial<CreateEventRequest>) =>
    apiClient
      .patch<ScheduleEventResponse>(`/schedule/teams/${teamId}/events/${eventId}`, data)
      .then((r) => r.data),

  cancelEvent: (teamId: string, eventId: string) =>
    apiClient
      .delete(`/schedule/teams/${teamId}/events/${eventId}`)
      .then((r) => r.data),
}
