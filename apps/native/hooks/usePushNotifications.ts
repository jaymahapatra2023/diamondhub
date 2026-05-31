// E13-S2 · Native Push Notification Permission Hook
import * as Notifications from 'expo-notifications'
import { useEffect, useState } from 'react'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export function usePushNotifications() {
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('undetermined')

  const requestPermission = async (): Promise<string | null> => {
    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') {
      const { data } = await Notifications.getExpoPushTokenAsync()
      setToken(data)
      setStatus('granted')
      return data
    }
    const { status: requested } = await Notifications.requestPermissionsAsync()
    setStatus(requested)
    if (requested === 'granted') {
      const { data } = await Notifications.getExpoPushTokenAsync()
      setToken(data)
      return data
    }
    return null
  }

  useEffect(() => {
    // Auto-check current status on mount (does NOT prompt)
    Notifications.getPermissionsAsync().then(({ status: s }) => {
      setStatus(s)
      if (s === 'granted') {
        Notifications.getExpoPushTokenAsync()
          .then(({ data }) => setToken(data))
          .catch(() => {/* no-op in dev/simulator */})
      }
    })
  }, [])

  return { token, status, requestPermission }
}
