import { useState, useCallback } from 'react'
import { notificationApi } from '../api/notification.api.js'

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  )

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true

    // Soft prompt logic handled by caller (show explanation UI first)
    const result = await Notification.requestPermission()
    setPermission(result)

    if (result === 'granted') {
      // Register service worker push subscription
      // In production: use firebase-messaging to get FCM token
      // For now: use web push via service worker
      try {
        // FCM token registration would go here with firebase/messaging
        // Stub: register a placeholder token
        await notificationApi.registerDeviceToken({
          token: `web-${crypto.randomUUID()}`,
          platform: 'WEB',
        })
      } catch {
        // Silently fail — push is optional
      }
      return true
    }
    return false
  }, [])

  return { permission, requestPermission }
}
