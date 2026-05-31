// E13 · Native — Axios API client
import axios from 'axios'
import { useAuthStore } from '../store/auth.store'

export const apiClient = axios.create({
  baseURL: process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.diamondhub.app/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  },
)
