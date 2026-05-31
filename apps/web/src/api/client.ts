// Axios client with JWT refresh interceptor — P8: token in memory only
import axios, { type AxiosError } from 'axios'

// Dynamically import store to avoid circular deps
let getAccessToken: () => string | null = () => null
let setAccessToken: (token: string) => void = () => {}
let logout: () => void = () => {}

export function initApiClient(
  _getToken: () => string | null,
  _setToken: (t: string) => void,
  _logout: () => void,
) {
  getAccessToken = _getToken
  setAccessToken = _setToken
  logout = _logout
}

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Attach access token from in-memory store
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Silent token refresh on 401
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean }

    if (
      error.response?.status === 401 &&
      !original?._retry &&
      original?.url !== '/auth/refresh'
    ) {
      if (original) original._retry = true

      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            if (original) {
              original.headers = original.headers ?? {}
              original.headers['Authorization'] = `Bearer ${token}`
            }
            resolve(apiClient(original!))
          })
        })
      }

      isRefreshing = true
      try {
        const { data } = await axios.post(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        )
        setAccessToken(data.accessToken)
        onTokenRefreshed(data.accessToken)
        if (original) {
          original.headers = original.headers ?? {}
          original.headers['Authorization'] = `Bearer ${data.accessToken}`
        }
        return apiClient(original!)
      } catch {
        logout()
        window.location.replace('/login')
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
