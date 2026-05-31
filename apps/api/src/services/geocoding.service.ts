// Geocoding service — ZIP → lat/lng using us-zips (no external API, P7 compliance)
// us-zips doesn't have types, so we use createRequire for CommonJS interop
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

interface ZipData {
  latitude: number
  longitude: number
}

let zipDb: Record<string, ZipData> | null = null

function loadZipDb(): Record<string, ZipData> {
  if (!zipDb) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = _require('us-zips')
    // us-zips exports an object mapping ZIP → { latitude, longitude }
    zipDb = (mod.default ?? mod) as Record<string, ZipData>
  }
  return zipDb
}

export const geocodingService = {
  geocodeZip(zip: string): { lat: number; lng: number } | null {
    const db = loadZipDb()
    const entry = db[zip]
    if (!entry) return null
    return {
      lat: entry.latitude,
      lng: entry.longitude,
    }
  },

  getRadiusMeters(miles: number): number {
    return miles * 1609.344
  },
}
