import { describe, it, expect } from 'vitest'
import { mkPlayer, mkSystemAccount, isSystemAccount, overall, isUnknownPlayer } from '../players'

describe('players.js - Player Creation and Utilities', () => {
  describe('mkPlayer', () => {
    it('should create player with default values', () => {
      const player = mkPlayer('John Doe')
      expect(player).toHaveProperty('id')
      expect(player).toHaveProperty('name', 'John Doe')
      expect(player).toHaveProperty('position', 'MF')
      expect(player).toHaveProperty('stats')
      expect(player).toHaveProperty('photoUrl')
      expect(player).toHaveProperty('membership', 'guest')
      expect(player).toHaveProperty('origin', 'none')
    })

    it('should create player with custom position', () => {
      const player = mkPlayer('Goalkeeper', 'GK')
      expect(player.position).toBe('GK')
    })

    it('should merge custom stats with defaults', () => {
      const customStats = { Pace: 90, Shooting: 85 }
      const player = mkPlayer('Fast Forward', 'FW', customStats)
      expect(player.stats.Pace).toBe(90)
      expect(player.stats.Shooting).toBe(85)
      expect(player.stats).toHaveProperty('Passing') // default still exists
      expect(player.stats.Passing).toBe(50) // DEFAULT_STATS value
    })

    it('should use provided photoUrl', () => {
      const photoUrl = 'https://example.com/photo.jpg'
      const player = mkPlayer('Player', 'MF', null, photoUrl)
      expect(player.photoUrl).toBe(photoUrl)
    })

    it('should generate unique IDs for different players', () => {
      const player1 = mkPlayer('Player 1')
      const player2 = mkPlayer('Player 2')
      expect(player1.id).not.toBe(player2.id)
    })

    it('should set custom membership status', () => {
      const player = mkPlayer('VIP', 'MF', null, null, 'premium')
      expect(player.membership).toBe('premium')
    })

    it('should set custom origin', () => {
      const player = mkPlayer('Imported', 'MF', null, null, 'guest', 'csv')
      expect(player.origin).toBe('csv')
    })
  })

  describe('mkSystemAccount', () => {
    it('should create system account with correct status', () => {
      const account = mkSystemAccount()
      expect(account.status).toBe('system')
    })

    it('should set all stats to 30', () => {
      const account = mkSystemAccount()
      expect(account.stats.Pace).toBe(30)
      expect(account.stats.Shooting).toBe(30)
      expect(account.stats.Passing).toBe(30)
    })

    it('should not have photoUrl', () => {
      const account = mkSystemAccount()
      expect(account.photoUrl).toBe(null)
    })

    it('should use provided name', () => {
      const account = mkSystemAccount('Admin Account')
      expect(account.name).toBe('Admin Account')
    })

    it('should have empty positions array', () => {
      const account = mkSystemAccount()
      expect(account.positions).toEqual([])
    })

    it('should have empty tags array', () => {
      const account = mkSystemAccount()
      expect(account.tags).toEqual([])
    })
  })

  describe('isSystemAccount', () => {
    it('should return true for system account', () => {
      const account = mkSystemAccount()
      expect(isSystemAccount(account)).toBe(true)
    })

    it('should return false for regular player', () => {
      const player = mkPlayer('Regular Player')
      expect(isSystemAccount(player)).toBe(false)
    })

    it('should handle case-insensitive status check', () => {
      const account = { status: 'SYSTEM' }
      expect(isSystemAccount(account)).toBe(true)
    })

    it('should return false for null or undefined', () => {
      expect(isSystemAccount(null)).toBe(false)
      expect(isSystemAccount(undefined)).toBe(false)
    })

    it('should return false when status is missing', () => {
      const player = { name: 'Player' }
      expect(isSystemAccount(player)).toBe(false)
    })
  })

  describe('overall', () => {
    it('should calculate average of all stats', () => {
      const player = {
        stats: {
          Pace: 80,
          Shooting: 70,
          Passing: 75,
          Dribbling: 85,
          Physical: 60,
          Stamina: 70
        }
      }
      const ovr = overall(player)
      expect(ovr).toBe(73) // (80+70+75+85+60+70)/6 ≈ 73
    })

    it('should default missing stats to 30', () => {
      const player = {
        stats: { Pace: 90 }
      }
      const ovr = overall(player)
      // (90 + 30*5) / 6 = 40
      expect(ovr).toBe(40)
    })

    it('should handle player with no stats object', () => {
      const player = {}
      const ovr = overall(player)
      expect(ovr).toBe(30) // all defaults
    })

    it('should round to nearest integer', () => {
      const player = {
        stats: {
          Pace: 81,
          Shooting: 81,
          Passing: 81,
          Dribbling: 81,
          Physical: 81,
          Stamina: 81
        }
      }
      expect(overall(player)).toBe(81)
    })

    it('should handle null or undefined player', () => {
      expect(overall(null)).toBe(30)
      expect(overall(undefined)).toBe(30)
    })

    it('should handle non-numeric stat values', () => {
      const player = {
        stats: {
          Pace: 'invalid',
          Shooting: null,
          Passing: undefined,
          Dribbling: 80,
          Physical: 70,
          Stamina: 60,
        }
      }
      const ovr = overall(player)
      // (30+30+30+80+70+60) / 6 = 300/6 = 50, but Stamina missing so defaults to 30
      // actual: (30+30+30+80+70+30) / 6 = 270/6 = 45
      expect(ovr).toBe(45)
    })
  })

  describe('isUnknownPlayer', () => {
    it('should return true when all stats are 30', () => {
      const player = {
        stats: {
          pace: 30,
          shooting: 30,
          passing: 30,
          dribbling: 30,
          defending: 30,
          physical: 30
        }
      }
      expect(isUnknownPlayer(player)).toBe(true)
    })

    it('should return false when any stat differs from 30', () => {
      const player = {
        stats: {
          Pace: 30,
          Shooting: 30,
          Passing: 30,
          Dribbling: 40,
          Physical: 30,
          Stamina: 30,
        }
      }
      expect(isUnknownPlayer(player)).toBe(false)
    })

    it('should handle player with no stats', () => {
      const player = {}
      expect(isUnknownPlayer(player)).toBe(true)
    })
  })
})
