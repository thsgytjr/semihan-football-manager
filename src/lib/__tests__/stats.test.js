import { describe, it, expect } from 'vitest'
import { clampStat, ensureStatsObject } from '../stats'

describe('stats.js - Core Statistics Logic', () => {
  describe('clampStat', () => {
    it('should clamp values between 0 and 100', () => {
      expect(clampStat(50)).toBe(50)
      expect(clampStat(0)).toBe(0)
      expect(clampStat(100)).toBe(100)
    })

    it('should clamp negative values to 0', () => {
      expect(clampStat(-10)).toBe(0)
      expect(clampStat(-999)).toBe(0)
    })

    it('should clamp values above 100 to 100', () => {
      expect(clampStat(150)).toBe(100)
      expect(clampStat(999)).toBe(100)
    })

    it('should handle decimal values by flooring', () => {
      expect(clampStat(50.9)).toBe(50)
      expect(clampStat(99.9)).toBe(99)
    })

    it('should handle non-numeric inputs safely', () => {
      expect(clampStat(null)).toBe(0)
      expect(clampStat(undefined)).toBe(0)
      expect(clampStat('abc')).toBe(0)
      expect(clampStat(NaN)).toBe(0)
    })
  })

  describe('ensureStatsObject', () => {
    it('should return stats object with all required keys', () => {
      const result = ensureStatsObject({})
      expect(result).toHaveProperty('Pace')
      expect(result).toHaveProperty('Shooting')
      expect(result).toHaveProperty('Passing')
      expect(result).toHaveProperty('Dribbling')
      expect(result).toHaveProperty('Physical')
      expect(result).toHaveProperty('Stamina')
    })

    it('should preserve valid stat values', () => {
      const input = { Pace: 85, Shooting: 70 }
      const result = ensureStatsObject(input)
      expect(result.Pace).toBe(85)
      expect(result.Shooting).toBe(70)
    })

    it('should default missing stats to 30', () => {
      const input = { Pace: 90 }
      const result = ensureStatsObject(input)
      expect(result.Shooting).toBe(30)
      expect(result.Passing).toBe(30)
    })

    it('should clamp out-of-range values', () => {
      const input = { Pace: 150, Shooting: -20 }
      const result = ensureStatsObject(input)
      expect(result.Pace).toBe(100)
      expect(result.Shooting).toBe(0)
    })

    it('should handle null or undefined input gracefully', () => {
      expect(() => ensureStatsObject(null)).not.toThrow()
      expect(() => ensureStatsObject(undefined)).not.toThrow()
      const result = ensureStatsObject(null)
      expect(result.Pace).toBe(30)
    })
  })
})
