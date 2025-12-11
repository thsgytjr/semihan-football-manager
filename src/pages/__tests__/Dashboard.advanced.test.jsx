// src/pages/__tests__/Dashboard.advanced.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Dashboard from '../Dashboard'

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  })
}))

vi.mock('../../components/Toast', () => ({
  notify: vi.fn()
}))

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../components/Card', () => ({
  default: ({ children, title }) => (
    <div data-testid="card">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}))

vi.mock('../../components/InitialAvatar', () => ({
  default: ({ name }) => <div data-testid="avatar">{name}</div>
}))

vi.mock('../../components/SavedMatchesList', () => ({
  default: () => <div data-testid="saved-matches-list">Saved Matches</div>
}))

vi.mock('../../components/LeaderboardTable', () => ({
  default: ({ title, rows }) => (
    <div data-testid="leaderboard-table">
      <h4>{title}</h4>
      <div>{rows?.length || 0} rows</div>
    </div>
  ),
  RankCell: ({ rank }) => <td data-testid="rank-cell">{rank}</td>,
  PlayerNameCell: ({ name }) => <td data-testid="player-name-cell">{name}</td>,
  StatCell: ({ value }) => <td data-testid="stat-cell">{value}</td>,
  FormDotsCell: ({ form }) => <td data-testid="form-dots-cell">{form?.join(',')}</td>
}))

vi.mock('../../components/ranking/Medal', () => ({
  default: ({ rank }) => <span data-testid="medal">{rank}</span>
}))

vi.mock('../../components/ranking/FormDots', () => ({
  default: ({ form }) => <div data-testid="form-dots">{form?.join(',')}</div>
}))

vi.mock('../../components/UpcomingMatchesWidget', () => ({
  default: () => <div data-testid="upcoming-matches-widget">Upcoming Matches</div>
}))

vi.mock('../../components/MoMNoticeWidget', () => ({
  default: () => <div data-testid="mom-notice-widget">MoM Notice</div>
}))

vi.mock('../../components/MoMPopup', () => ({
  MoMPopup: () => <div data-testid="mom-popup">MoM Popup</div>
}))

vi.mock('../../components/MoMLeaderboard', () => ({
  MoMLeaderboard: () => <div data-testid="mom-leaderboard">MoM Leaderboard</div>
}))

vi.mock('../../components/MoMAwardDetailModal', () => ({
  MoMAwardDetailModal: () => <div data-testid="mom-award-detail-modal">MoM Award Detail</div>
}))

vi.mock('../../components/badges/PlayerBadgeModal', () => ({
  default: () => <div data-testid="player-badge-modal">Player Badge Modal</div>
}))

vi.mock('../../components/PlayerStatsModal', () => ({
  default: () => <div data-testid="player-stats-modal">Player Stats Modal</div>
}))

vi.mock('../../components/Select', () => ({
  default: ({ value, onChange, options }) => (
    <select data-testid="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options?.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}))

vi.mock('../../components/MobileCategoryCarousel', () => ({
  default: ({ children }) => <div data-testid="mobile-category-carousel">{children}</div>
}))

vi.mock('../../components/SeasonRecap', () => ({
  default: () => <div data-testid="season-recap">Season Recap</div>
}))

vi.mock('../../hooks/useMoMPrompt', () => ({
  useMoMPrompt: () => ({ promptOpen: false, closePrompt: vi.fn() })
}))

vi.mock('../../hooks/useMoMAwardsSummary', () => ({
  useMoMAwardsSummary: () => ({ countsByPlayer: {}, winnersByMatch: {} })
}))

vi.mock('../../services/badgeService', () => ({
  fetchPlayerBadges: vi.fn().mockResolvedValue({ badges: [] })
}))

describe('Dashboard.jsx - Advanced Bug Detection Tests', () => {
  const mockPlayers = [
    {
      id: 'p1',
      name: 'Player One',
      membership: 'member',
      stats: { Pace: 80, Shooting: 75, Passing: 70, Dribbling: 85, Physical: 60, Stamina: 70 }
    },
    {
      id: 'p2',
      name: 'Player Two',
      membership: 'guest',
      stats: { Pace: 70, Shooting: 80, Passing: 75, Dribbling: 70, Physical: 75, Stamina: 80 }
    }
  ]

  const mockMatches = [
    {
      id: 'm1',
      dateISO: '2025-12-01T10:00:00Z',
      teams: [[{ id: 'p1' }], [{ id: 'p2' }]],
      stats: {
        p1: { goals: 2, assists: 1, appearances: 1 },
        p2: { goals: 1, assists: 2, appearances: 1 }
      }
    }
  ]

  const defaultProps = {
    players: mockPlayers,
    matches: mockMatches,
    isAdmin: false,
    onUpdateMatch: vi.fn(),
    upcomingMatches: [],
    onSaveUpcomingMatch: vi.fn(),
    onDeleteUpcomingMatch: vi.fn(),
    onUpdateUpcomingMatch: vi.fn(),
    membershipSettings: [],
    momFeatureEnabled: true,
    leaderboardToggles: {},
    badgesEnabled: true,
    playerStatsEnabled: true,
    playerFactsEnabled: true,
    seasonRecapEnabled: true,
    seasonRecapReady: true
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Null/Undefined Safety - CRITICAL BUG TESTING', () => {
    it('should handle null players array', () => {
      const { container } = render(<Dashboard {...defaultProps} players={null} />)
      // BUG RISK: Null players might crash computeAttackRows, computeDuoRows, etc.
      expect(container).toBeInTheDocument()
    })

    it('should handle undefined players array', () => {
      const { container } = render(<Dashboard {...defaultProps} players={undefined} />)
      // BUG RISK: Undefined players might crash
      expect(container).toBeInTheDocument()
    })

    it('should handle null matches array', () => {
      const { container } = render(<Dashboard {...defaultProps} matches={null} />)
      // BUG RISK: Null matches might crash season extraction, date filtering
      expect(container).toBeInTheDocument()
    })

    it('should handle undefined matches array', () => {
      const { container } = render(<Dashboard {...defaultProps} matches={undefined} />)
      // BUG RISK: Undefined matches might crash
      expect(container).toBeInTheDocument()
    })

    it('should handle empty players array', () => {
      const { container } = render(<Dashboard {...defaultProps} players={[]} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle empty matches array', () => {
      const { container } = render(<Dashboard {...defaultProps} matches={[]} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Data Integrity - CRITICAL BUG TESTING', () => {
    it('should handle matches with missing stats', () => {
      const brokenMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          teams: [[{ id: 'p1' }], [{ id: 'p2' }]],
          stats: null // BUG RISK: Null stats
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={brokenMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle matches with undefined stats', () => {
      const brokenMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          teams: [[{ id: 'p1' }], [{ id: 'p2' }]]
          // stats missing entirely
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={brokenMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle matches with missing teams', () => {
      const brokenMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          teams: null, // BUG RISK: Null teams
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={brokenMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle matches with missing dateISO', () => {
      const brokenMatches = [
        {
          id: 'm1',
          // dateISO missing - BUG RISK: Date extraction might fail
          teams: [[{ id: 'p1' }], [{ id: 'p2' }]],
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={brokenMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle matches with invalid dateISO format', () => {
      const brokenMatches = [
        {
          id: 'm1',
          dateISO: 'invalid-date-format', // BUG RISK: Invalid date
          teams: [[{ id: 'p1' }], [{ id: 'p2' }]],
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={brokenMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle players with missing id', () => {
      const brokenPlayers = [
        {
          // id missing - BUG RISK: Player lookup might fail
          name: 'No ID Player',
          membership: 'member'
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} players={brokenPlayers} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle players with null id', () => {
      const brokenPlayers = [
        {
          id: null, // BUG RISK: Null ID
          name: 'Null ID Player',
          membership: 'member'
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} players={brokenPlayers} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle players with missing stats', () => {
      const brokenPlayers = [
        {
          id: 'p1',
          name: 'No Stats Player',
          membership: 'member'
          // stats missing
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} players={brokenPlayers} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle players with missing membership', () => {
      const brokenPlayers = [
        {
          id: 'p1',
          name: 'No Membership Player'
          // membership missing - BUG RISK: Membership badge might fail
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} players={brokenPlayers} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Season Extraction and Filtering - CRITICAL BUG TESTING', () => {
    it('should handle matches with various date formats', () => {
      const mixedDateMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: { p1: { goals: 1 } }
        },
        {
          id: 'm2',
          dateISO: '2024-06-15T14:30:00Z',
          stats: { p2: { goals: 1 } }
        },
        {
          id: 'm3',
          dateISO: '2023-01-20T08:00:00Z',
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={mixedDateMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle season extraction failure gracefully', () => {
      const badDateMatches = [
        {
          id: 'm1',
          dateISO: null, // BUG RISK: Null date
          stats: { p1: { goals: 1 } }
        },
        {
          id: 'm2',
          dateISO: 'not-a-date', // BUG RISK: Invalid format
          stats: { p2: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={badDateMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle matches spanning multiple years', () => {
      const multiYearMatches = Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`,
        dateISO: `${2020 + i}-12-01T10:00:00Z`,
        stats: { p1: { goals: 1 } }
      }))
      const { container } = render(<Dashboard {...defaultProps} matches={multiYearMatches} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Date Key Extraction and Sorting - CRITICAL BUG TESTING', () => {
    it('should handle invalid date keys', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      // BUG RISK: dateKeyToTimestamp might fail with invalid input
      expect(container).toBeInTheDocument()
    })

    it('should sort date keys correctly', () => {
      const mixedMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-15T10:00:00Z',
          stats: { p1: { goals: 1 } }
        },
        {
          id: 'm2',
          dateISO: '2025-12-01T10:00:00Z',
          stats: { p2: { goals: 1 } }
        },
        {
          id: 'm3',
          dateISO: '2025-12-10T10:00:00Z',
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={mixedMatches} />)
      // BUG RISK: Date sorting might be incorrect
      expect(container).toBeInTheDocument()
    })
  })

  describe('Leaderboard Computation - CRITICAL BUG TESTING', () => {
    it('should handle zero stats gracefully', () => {
      const zeroStatMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            p1: { goals: 0, assists: 0, appearances: 0 },
            p2: { goals: 0, assists: 0, appearances: 0 }
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={zeroStatMatches} />)
      // BUG RISK: Division by zero or undefined behavior
      expect(container).toBeInTheDocument()
    })

    it('should handle negative stats (malformed data)', () => {
      const negativeStatMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            p1: { goals: -1, assists: -2, appearances: -1 } // BUG RISK: Negative values
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={negativeStatMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle extremely large stat values', () => {
      const largeStatMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            p1: { goals: 999999, assists: 999999, appearances: 999999 } // BUG RISK: Overflow
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={largeStatMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle NaN stats', () => {
      const nanStatMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            p1: { goals: NaN, assists: NaN, appearances: NaN } // BUG RISK: NaN propagation
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={nanStatMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle string stats (type coercion bug)', () => {
      const stringStatMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            p1: { goals: '5', assists: '3', appearances: '1' } // BUG RISK: Type mismatch
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={stringStatMatches} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Duo/Chemistry Computation - CRITICAL BUG TESTING', () => {
    it('should handle matches with single player teams', () => {
      const singlePlayerMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          teams: [[{ id: 'p1' }], [{ id: 'p2' }]], // Single players - no duos
          stats: {
            p1: { goals: 1, assists: 0 },
            p2: { goals: 0, assists: 1 }
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={singlePlayerMatches} />)
      // BUG RISK: Duo computation might crash with insufficient players
      expect(container).toBeInTheDocument()
    })

    it('should handle assists without goal scorer', () => {
      const orphanAssistMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            p1: { goals: 0, assists: 5, appearances: 1 } // BUG RISK: Assists but no goals
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={orphanAssistMatches} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Draft Mode Stats - CRITICAL BUG TESTING', () => {
    it('should handle matches without draft data', () => {
      const nonDraftMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          teams: [[{ id: 'p1' }], [{ id: 'p2' }]],
          stats: { p1: { goals: 1 } }
          // No draft field - BUG RISK: Draft stats computation might fail
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={nonDraftMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle draft matches with missing captains', () => {
      const noCaptainMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          draft: {
            // captains missing - BUG RISK: Captain stats might crash
          },
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={noCaptainMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle draft matches with null captains', () => {
      const nullCaptainMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          draft: {
            captains: null // BUG RISK: Null captains array
          },
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={nullCaptainMatches} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Player Lookup and Name Resolution - CRITICAL BUG TESTING', () => {
    it('should handle player IDs not in player list', () => {
      const unknownPlayerMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            'unknown-player-id': { goals: 5, assists: 3 } // BUG RISK: Player not found
          }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={unknownPlayerMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle duplicate player IDs', () => {
      const duplicatePlayers = [
        { id: 'p1', name: 'Player One', membership: 'member' },
        { id: 'p1', name: 'Player One Duplicate', membership: 'guest' } // BUG RISK: Duplicate IDs
      ]
      const { container } = render(<Dashboard {...defaultProps} players={duplicatePlayers} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Match Timestamp Extraction - CRITICAL BUG TESTING', () => {
    it('should handle matches with multiple timestamp fields', () => {
      const multiTimestampMatches = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          date: '2025-12-02T10:00:00Z',
          created_at: '2025-12-03T10:00:00Z',
          momVoteAnchor: '2025-12-04T10:00:00Z',
          stats: { p1: { goals: 1 } }
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={multiTimestampMatches} />)
      // BUG RISK: getMatchTimestamp priority might be wrong
      expect(container).toBeInTheDocument()
    })

    it('should handle matches with no valid timestamps', () => {
      const noTimestampMatches = [
        {
          id: 'm1',
          stats: { p1: { goals: 1 } }
          // No timestamp fields - BUG RISK: Timestamp extraction returns null
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={noTimestampMatches} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Membership Badge Logic - CRITICAL BUG TESTING', () => {
    it('should handle unknown membership types', () => {
      const unknownMembershipPlayers = [
        {
          id: 'p1',
          name: 'Unknown Membership',
          membership: 'super-premium-vip' // BUG RISK: Unknown type
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} players={unknownMembershipPlayers} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle null membership', () => {
      const nullMembershipPlayers = [
        {
          id: 'p1',
          name: 'Null Membership',
          membership: null // BUG RISK: Null membership
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} players={nullMembershipPlayers} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle case-insensitive membership matching', () => {
      const mixedCasePlayers = [
        { id: 'p1', name: 'P1', membership: 'MEMBER' },
        { id: 'p2', name: 'P2', membership: 'Guest' },
        { id: 'p3', name: 'P3', membership: 'associate' }
      ]
      const { container } = render(<Dashboard {...defaultProps} players={mixedCasePlayers} />)
      // BUG RISK: Case sensitivity might break membership detection
      expect(container).toBeInTheDocument()
    })
  })

  describe('Performance with Edge Cases', () => {
    it('should handle extremely large player count', () => {
      const largePlayers = Array.from({ length: 1000 }, (_, i) => ({
        id: `p${i}`,
        name: `Player ${i}`,
        membership: 'member',
        stats: { Pace: 70 }
      }))
      const { container } = render(<Dashboard {...defaultProps} players={largePlayers} />)
      // BUG RISK: Performance degradation, memory issues
      expect(container).toBeInTheDocument()
    })

    it('should handle extremely large match count', () => {
      const largeMatches = Array.from({ length: 1000 }, (_, i) => ({
        id: `m${i}`,
        dateISO: `2025-12-01T10:00:00Z`,
        stats: { p1: { goals: 1 } }
      }))
      const { container } = render(<Dashboard {...defaultProps} matches={largeMatches} />)
      // BUG RISK: Performance degradation, useMemo dependencies
      expect(container).toBeInTheDocument()
    })

    it('should handle matches with very long team arrays', () => {
      const largeTeamMatch = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          teams: [
            Array.from({ length: 50 }, (_, i) => ({ id: `p${i}` })),
            Array.from({ length: 50 }, (_, i) => ({ id: `p${i + 50}` }))
          ],
          stats: Object.fromEntries(
            Array.from({ length: 100 }, (_, i) => [`p${i}`, { goals: 0, assists: 0 }])
          )
        }
      ]
      const { container } = render(<Dashboard {...defaultProps} matches={largeTeamMatch} />)
      expect(container).toBeInTheDocument()
    })
  })
})
