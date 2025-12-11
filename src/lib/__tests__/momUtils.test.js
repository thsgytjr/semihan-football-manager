import { describe, it, expect, vi } from 'vitest'
import {
  hasScoreData,
  getMomAnchorISO,
  getMoMPhase,
  summarizeVotes,
  buildMoMTieBreakerScores
} from '../momUtils'

describe('momUtils.js - Man of the Match Logic', () => {
  describe('hasScoreData', () => {
    it('should return true when stats exist', () => {
      const match = {
        stats: { player1: { goals: 2 } }
      }
      expect(hasScoreData(match)).toBe(true)
    })

    it('should return true when draft.stats exist', () => {
      const match = {
        draft: {
          stats: { player1: { goals: 1 } }
        }
      }
      expect(hasScoreData(match)).toBe(true)
    })

    it('should return true when quarterScores exist', () => {
      const match = {
        quarterScores: [[10, 5], [8, 12]]
      }
      expect(hasScoreData(match)).toBe(true)
    })

    it('should return false when no score data exists', () => {
      expect(hasScoreData({})).toBe(false)
      expect(hasScoreData(null)).toBe(false)
    })

    it('should handle empty stats object correctly', () => {
      expect(hasScoreData({ stats: {} })).toBe(false)
    })
  })

  describe('getMomAnchorISO', () => {
    it('should prioritize momVoteAnchor', () => {
      const match = {
        momVoteAnchor: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        dateISO: '2024-01-03T00:00:00Z'
      }
      expect(getMomAnchorISO(match)).toBe('2024-01-01T00:00:00Z')
    })

    it('should fallback to draft.momVoteAnchor', () => {
      const match = {
        draft: { momVoteAnchor: '2024-01-01T00:00:00Z' },
        updated_at: '2024-01-02T00:00:00Z'
      }
      expect(getMomAnchorISO(match)).toBe('2024-01-01T00:00:00Z')
    })

    it('should fallback through timestamp hierarchy', () => {
      const match = {
        updated_at: '2024-01-02T00:00:00Z',
        dateISO: '2024-01-03T00:00:00Z'
      }
      expect(getMomAnchorISO(match)).toBe('2024-01-02T00:00:00Z')
    })

    it('should return null when no timestamps exist', () => {
      expect(getMomAnchorISO({})).toBe(null)
      expect(getMomAnchorISO(null)).toBe(null)
    })
  })

  describe('getMoMPhase', () => {
    it('should return "hidden" when no score data exists', () => {
      const match = {}
      expect(getMoMPhase(match)).toBe('hidden')
    })

    it('should return "vote" during voting period', () => {
      const now = new Date('2024-01-01T12:00:00Z')
      const match = {
        stats: { player1: { goals: 1 } },
        momVoteAnchor: '2024-01-01T10:00:00Z'
      }
      expect(getMoMPhase(match, now)).toBe('vote')
    })

    it('should return "announce" during announcement period', () => {
      const now = new Date('2024-01-02T12:00:00Z')
      const match = {
        stats: { player1: { goals: 1 } },
        momVoteAnchor: '2024-01-01T10:00:00Z'
      }
      expect(getMoMPhase(match, now)).toBe('announce')
    })

    it('should return "closed" after all periods end', () => {
      const now = new Date('2024-01-04T00:00:00Z')
      const match = {
        stats: { player1: { goals: 1 } },
        momVoteAnchor: '2024-01-01T10:00:00Z'
      }
      expect(getMoMPhase(match, now)).toBe('closed')
    })

    it('should handle referee mode with manual open', () => {
      const now = new Date('2024-01-01T12:00:00Z')
      const match = {
        stats: { 
          player1: { goals: 1 },
          momManualOpen: true
        },
        momVoteAnchor: '2024-01-01T10:00:00Z',
        isRefMatch: true
      }
      expect(getMoMPhase(match, now)).toBe('vote')
    })
  })

  describe('summarizeVotes', () => {
    it('should tally votes correctly', () => {
      const votes = [
        { playerId: 'p1' },
        { playerId: 'p1' },
        { playerId: 'p2' }
      ]
      const result = summarizeVotes(votes)
      expect(result.tally).toEqual({ p1: 2, p2: 1 })
      expect(result.total).toBe(3)
      expect(result.maxVotes).toBe(2)
    })

    it('should identify single winner', () => {
      const votes = [
        { playerId: 'p1' },
        { playerId: 'p1' },
        { playerId: 'p2' }
      ]
      const result = summarizeVotes(votes)
      expect(result.winners).toEqual(['p1'])
    })

    it('should identify multiple winners in tie', () => {
      const votes = [
        { playerId: 'p1' },
        { playerId: 'p2' }
      ]
      const result = summarizeVotes(votes)
      expect(result.winners).toHaveLength(2)
      expect(result.winners).toContain('p1')
      expect(result.winners).toContain('p2')
    })

    it('should apply tie-breaker when provided', () => {
      const votes = [
        { playerId: 'p1' },
        { playerId: 'p2' }
      ]
      const tieBreakerScores = {
        p1: { goals: 2, assists: 1 },
        p2: { goals: 1, assists: 1 }
      }
      const result = summarizeVotes(votes, { tieBreakerScores })
      expect(result.winners).toEqual(['p1'])
      expect(result.tieBreakApplied).toBe(true)
      expect(result.tieBreakCategory).toBe('goals')
    })

    it('should handle empty votes array', () => {
      const result = summarizeVotes([])
      expect(result.total).toBe(0)
      expect(result.winners).toEqual([])
    })

    it('should filter out votes with no player ID', () => {
      const votes = [
        { playerId: 'p1' },
        { playerId: null },
        { playerId: undefined },
        { playerId: '' }
      ]
      const result = summarizeVotes(votes)
      expect(result.total).toBe(4)
      expect(result.tally).toEqual({ p1: 1 })
    })
  })

  describe('buildMoMTieBreakerScores', () => {
    it('should build tie-breaker scores from stats', () => {
      const statsByPlayer = {
        p1: { goals: 2, assists: 1, cleanSheet: 0 },
        p2: { goals: 1, assists: 2, cleanSheet: 1 }
      }
      const match = {
        snapshot: [[{ id: 'p1' }], [{ id: 'p2' }]]
      }
      const result = buildMoMTieBreakerScores(statsByPlayer, match)
      expect(result.p1).toEqual({
        goals: 2,
        assists: 1,
        cleanSheet: 0,
        appearances: 1
      })
      expect(result.p2).toEqual({
        goals: 1,
        assists: 2,
        cleanSheet: 1,
        appearances: 1
      })
    })

    it('should set appearances to 1 for attendees', () => {
      const statsByPlayer = {
        p1: { goals: 0 }
      }
      const match = {
        snapshot: [[{ id: 'p1' }], [{ id: 'p2' }]]
      }
      const result = buildMoMTieBreakerScores(statsByPlayer, match)
      expect(result.p1.appearances).toBe(1)
    })

    it('should set appearances to 0 for non-attendees', () => {
      const statsByPlayer = {
        p1: { goals: 2 },
        p2: { goals: 1 }
      }
      const match = {
        snapshot: [[{ id: 'p1' }], [{ id: 'p3' }]] // p2는 참석하지 않음
      }
      const result = buildMoMTieBreakerScores(statsByPlayer, match)
      expect(result.p1.appearances).toBe(1)
      expect(result.p2.appearances).toBe(0)
    })

    it('should handle empty stats gracefully', () => {
      const result = buildMoMTieBreakerScores({}, null)
      expect(result).toEqual({})
    })

    it('should normalize cleanSheet from cs field', () => {
      const statsByPlayer = {
        p1: { goals: 0, cs: 1 }
      }
      const result = buildMoMTieBreakerScores(statsByPlayer, null)
      expect(result.p1.cleanSheet).toBe(1)
    })
  })
})
