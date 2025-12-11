// src/lib/__tests__/refApp.test.js
import { describe, it, expect } from 'vitest'
import { 
  extractAttendeeIds, 
  extractStatsByPlayer, 
  isRefMatch,
  toStr
} from '../matchUtils'

describe('refApp.js - Referee Mode Utilities', () => {
  describe('extractAttendeeIds', () => {
    it('should extract attendee IDs from snapshot', () => {
      const match = {
        snapshot: [
          [{ id: 'p1' }, { id: 'p2' }],
          [{ id: 'p3' }, { id: 'p4' }]
        ]
      }
      const result = extractAttendeeIds(match)
      expect(result).toEqual(['p1', 'p2', 'p3', 'p4'])
    })

    it('should return empty array if no snapshot', () => {
      const match = {
        teams: [
          [{ id: 'p1' }, { id: 'p2' }],
          [{ id: 'p3' }]
        ]
      }
      const result = extractAttendeeIds(match)
      expect(result).toEqual([])
    })

    it('should extract from attendeeIds field', () => {
      const match = {
        attendeeIds: ['p1', 'p2', 'p3']
      }
      const result = extractAttendeeIds(match)
      expect(result).toEqual(['p1', 'p2', 'p3'])
    })

    it('should handle empty match', () => {
      const result = extractAttendeeIds({})
      expect(result).toEqual([])
    })

    it('should return all IDs without deduplication', () => {
      const match = {
        snapshot: [
          [{ id: 'p1' }, { id: 'p2' }],
          [{ id: 'p1' }, { id: 'p3' }]
        ]
      }
      const result = extractAttendeeIds(match)
      expect(result.length).toBe(4) // includes duplicate p1
      expect(result).toContain('p1')
      expect(result).toContain('p2')
      expect(result).toContain('p3')
    })
  })

  describe('extractStatsByPlayer', () => {
    it('should extract stats from match.stats', () => {
      const match = {
        stats: {
          p1: { goals: 2, assists: 1 },
          p2: { goals: 0, assists: 2 }
        }
      }
      const result = extractStatsByPlayer(match)
      expect(result.p1.goals).toBe(2)
      expect(result.p1.assists).toBe(1)
      expect(result.p2.goals).toBe(0)
      expect(result.p2.assists).toBe(2)
      // Also includes default fields
      expect(result.p1).toHaveProperty('events')
      expect(result.p1).toHaveProperty('cleanSheet')
    })

    it('should include all stat fields even metadata', () => {
      const match = {
        stats: {
          p1: { goals: 2 },
          __games: [],
          __events: [],
          __inProgress: {}
        }
      }
      const result = extractStatsByPlayer(match)
      expect(result.p1.goals).toBe(2)
      // Function processes all fields, including metadata
      expect(result).toHaveProperty('__games')
      expect(result).toHaveProperty('__events')
      expect(result).toHaveProperty('__inProgress')
    })

    it('should handle empty stats', () => {
      const result = extractStatsByPlayer({})
      expect(result).toEqual({})
    })
  })

  describe('isRefMatch', () => {
    it('should return false when match only has __games', () => {
      const match = {
        stats: {
          __games: [{ matchNumber: 1 }]
        }
      }
      // isRefMatch checks __events, not __games
      expect(isRefMatch(match)).toBe(false)
    })

    it('should return true when match has __events', () => {
      const match = {
        stats: {
          __events: [{ type: 'goal' }]
        }
      }
      expect(isRefMatch(match)).toBe(true)
    })

    it('should return false for regular matches', () => {
      const match = {
        stats: {
          p1: { goals: 2 }
        }
      }
      expect(isRefMatch(match)).toBe(false)
    })

    it('should return false for empty match', () => {
      expect(isRefMatch({})).toBe(false)
      expect(isRefMatch(null)).toBe(false)
    })
  })

  describe('toStr', () => {
    it('should convert numbers to strings', () => {
      expect(toStr(123)).toBe('123')
    })

    it('should handle strings', () => {
      expect(toStr('abc')).toBe('abc')
    })

    it('should handle null and undefined', () => {
      expect(toStr(null)).toBe('')
      expect(toStr(undefined)).toBe('')
    })

    it('should handle objects with toString', () => {
      expect(toStr({ toString: () => 'custom' })).toBe('custom')
    })
  })
})
