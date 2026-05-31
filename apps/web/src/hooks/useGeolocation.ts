import { useState, useCallback } from 'react'

interface GeoState {
  lat: number | null
  lng: number | null
  loading: boolean
  error: string | null
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ lat: null, lng: null, loading: false, error: null })

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation not supported', loading: false }))
      return
    }
    setState(s => ({ ...s, loading: true, error: null }))
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ lat: pos.coords.latitude, lng: pos.coords.longitude, loading: false, error: null }),
      (err) => setState(s => ({ ...s, loading: false, error: err.message })),
      { timeout: 10000, enableHighAccuracy: false },
    )
  }, [])

  return { ...state, requestLocation }
}
