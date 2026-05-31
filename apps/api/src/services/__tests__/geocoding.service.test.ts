// Geocoding service tests
// NOTE: vi.mock('us-zips') does not intercept createRequire() at runtime, so these tests
// use the real us-zips data to verify the service correctly reads lat/lng from it.
import { describe, it, expect } from 'vitest'

const { geocodingService } = await import('../geocoding.service.js')

describe('geocodingService', () => {
  describe('geocodeZip', () => {
    // Real coordinates from the us-zips 2022.9.1 dataset
    it('returns coordinates for NYC zip 10001', () => {
      const result = geocodingService.geocodeZip('10001')
      expect(result).not.toBeNull()
      // NYC area — lat ~40.75, lng ~-74.0
      expect(result!.lat).toBeGreaterThan(40)
      expect(result!.lat).toBeLessThan(41)
      expect(result!.lng).toBeGreaterThan(-75)
      expect(result!.lng).toBeLessThan(-73)
    })

    it('returns coordinates for Beverly Hills zip 90210', () => {
      const result = geocodingService.geocodeZip('90210')
      expect(result).not.toBeNull()
      // Beverly Hills area — lat ~34.1, lng ~-118.4
      expect(result!.lat).toBeGreaterThan(33)
      expect(result!.lat).toBeLessThan(35)
      expect(result!.lng).toBeGreaterThan(-120)
      expect(result!.lng).toBeLessThan(-117)
    })

    it('returns null for invalid zip 99999', () => {
      const result = geocodingService.geocodeZip('99999')
      expect(result).toBeNull()
    })

    it('returns null for empty string', () => {
      const result = geocodingService.geocodeZip('')
      expect(result).toBeNull()
    })

    it('returns null for non-numeric zip', () => {
      const result = geocodingService.geocodeZip('ABCDE')
      expect(result).toBeNull()
    })

    it('returns an object with lat and lng number fields', () => {
      const result = geocodingService.geocodeZip('10001')
      expect(result).not.toBeNull()
      expect(typeof result!.lat).toBe('number')
      expect(typeof result!.lng).toBe('number')
    })
  })

  describe('getRadiusMeters', () => {
    it('converts 1 mile to approximately 1609.344 meters', () => {
      expect(geocodingService.getRadiusMeters(1)).toBeCloseTo(1609.344, 1)
    })

    it('converts 50 miles to approximately 80467.2 meters', () => {
      expect(geocodingService.getRadiusMeters(50)).toBeCloseTo(80467.2, 0)
    })

    it('returns 0 for 0 miles', () => {
      expect(geocodingService.getRadiusMeters(0)).toBe(0)
    })

    it('correctly scales for large distances', () => {
      expect(geocodingService.getRadiusMeters(100)).toBeCloseTo(160934.4, 0)
    })
  })
})
