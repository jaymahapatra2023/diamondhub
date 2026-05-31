// E13 · Native Mobile — Device Location Hook
// Used by HomeScreen and TournamentsScreen
import { useState, useEffect } from 'react'
import * as Location from 'expo-location'

interface Coords {
  latitude: number
  longitude: number
}

export function useLocation() {
  const [coords, setCoords] = useState<Coords | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestLocation = async () => {
    setLoading(true)
    setError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission denied')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
    } catch (e: any) {
      setError(e?.message ?? 'Could not get location')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Check permission status on mount without prompting
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') requestLocation()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { coords, loading, error, requestLocation }
}
