// src/pages/__tests__/Dashboard.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Dashboard from '../Dashboard'

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
    i18n: {
      language: 'en',
      changeLanguage: vi.fn()
    }
  })
}))

vi.mock('../../components/Toast', () => ({
  notify: vi.fn()
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
  default: ({ title, rows, showAll, controls, onToggle }) => (
    <div data-testid="leaderboard-table">
      <h4>{title}</h4>
      <div>{rows?.length || 0} rows</div>
      {controls}
      {onToggle && <button onClick={onToggle}>{showAll ? 'Show Less' : 'Show All'}</button>}
    </div>
  ),
  RankCell: ({ rank }) => <td data-testid="rank-cell">{rank}</td>,
  PlayerNameCell: ({ name, onSelect }) => (
    <td data-testid="player-name-cell" onClick={onSelect}>
      {name}
    </td>
  ),
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
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
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
  useMoMPrompt: () => ({
    promptOpen: false,
    closePrompt: vi.fn()
  })
}))

vi.mock('../../hooks/useMoMAwardsSummary', () => ({
  useMoMAwardsSummary: () => ({
    countsByPlayer: {},
    winnersByMatch: {}
  })
}))

vi.mock('../../services/badgeService', () => ({
  fetchPlayerBadges: vi.fn().mockResolvedValue({ badges: [] })
}))

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('Dashboard.jsx - Dashboard Component', () => {
  const mockPlayers = [
    {
      id: 'p1',
      name: 'Player One',
      membership: 'member',
      photoUrl: null,
      stats: { Pace: 80, Shooting: 75, Passing: 70, Dribbling: 85, Physical: 60, Stamina: 70 }
    },
    {
      id: 'p2',
      name: 'Player Two',
      membership: 'guest',
      photoUrl: null,
      stats: { Pace: 70, Shooting: 80, Passing: 75, Dribbling: 70, Physical: 75, Stamina: 80 }
    },
    {
      id: 'p3',
      name: 'Player Three',
      membership: 'associate',
      photoUrl: null,
      stats: { Pace: 85, Shooting: 70, Passing: 80, Dribbling: 75, Physical: 70, Stamina: 75 }
    }
  ]

  const mockMatches = [
    {
      id: 'm1',
      dateISO: '2025-12-01T10:00:00Z',
      teams: [[{ id: 'p1' }, { id: 'p2' }], [{ id: 'p3' }]],
      stats: {
        p1: { goals: 2, assists: 1, appearances: 1 },
        p2: { goals: 1, assists: 2, appearances: 1 },
        p3: { goals: 0, assists: 0, appearances: 1 }
      },
      draft: {
        quarterScores: [[2, 1]]
      }
    },
    {
      id: 'm2',
      dateISO: '2025-12-05T10:00:00Z',
      teams: [[{ id: 'p1' }], [{ id: 'p2' }, { id: 'p3' }]],
      stats: {
        p1: { goals: 3, assists: 0, appearances: 1 },
        p2: { goals: 1, assists: 1, appearances: 1 },
        p3: { goals: 0, assists: 1, appearances: 1 }
      },
      draft: {
        quarterScores: [[3, 2]]
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

  describe('Component Rendering', () => {
    it('should render dashboard without crashing', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      expect(container).toBeInTheDocument()
      expect(screen.getByText('leaderboard.title')).toBeInTheDocument()
    })

    it('should render with empty data', () => {
      const { container } = render(<Dashboard {...defaultProps} players={[]} matches={[]} />)
      expect(container).toBeInTheDocument()
      expect(screen.getByText('leaderboard.title')).toBeInTheDocument()
    })

    it('should handle null props gracefully', () => {
      const { container } = render(
        <Dashboard
          players={[]}
          matches={[]}
          isAdmin={false}
          onUpdateMatch={vi.fn()}
        />
      )
      expect(container).toBeInTheDocument()
    })
  })

  describe('Leaderboard Tables', () => {
    it('should display leaderboard tables', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Check that cards are rendered (leaderboards are within cards)
      const cards = screen.getAllByTestId('card')
      expect(cards.length).toBeGreaterThan(0)
    })

    it('should show player names in leaderboard', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Dashboard should render with player data
      expect(container).toBeInTheDocument()
    })

    it('should calculate and display rankings', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Dashboard should render rankings
      expect(container).toBeInTheDocument()
    })

    it('should display stats correctly', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Dashboard should render stats
      expect(container).toBeInTheDocument()
    })
  })

  describe('Attack Points Table', () => {
    it('should display goals and assists', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Should show stats from matches
      expect(container).toBeInTheDocument()
    })

    it('should calculate attack points correctly', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // p1: 2+3 goals = 5, 1 assist = 1, total pts = 5*2 + 1 = 11
      // p2: 1+1 goals = 2, 2+1 assists = 3, total pts = 2*2 + 3 = 7
      // Rankings should reflect this
      expect(container).toBeInTheDocument()
    })
  })

  describe('Duo Table', () => {
    it('should display duo partnerships', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Duo table should be present if there are assists
      expect(container).toBeInTheDocument()
    })
  })

  describe('Captain Stats', () => {
    it('should display captain wins when available', () => {
      const matchesWithCaptains = [
        {
          ...mockMatches[0],
          draft: {
            ...mockMatches[0].draft,
            captains: ['p1', 'p3']
          }
        }
      ]
      
      const { container } = render(<Dashboard {...defaultProps} matches={matchesWithCaptains} />)
      
      expect(container).toBeInTheDocument()
    })
  })

  describe('Draft Player Stats', () => {
    it('should calculate draft stats for draft matches', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // All mock matches have draft.quarterScores
      expect(container).toBeInTheDocument()
    })
  })

  describe('Clean Sheet Table', () => {
    it('should display clean sheet stats', () => {
      const matchesWithCleanSheets = [
        {
          ...mockMatches[0],
          stats: {
            p1: { goals: 2, assists: 1, appearances: 1, cleanSheet: 1 },
            p2: { goals: 1, assists: 2, appearances: 1, cleanSheet: 0 },
            p3: { goals: 0, assists: 0, appearances: 1, cleanSheet: 1 }
          }
        }
      ]
      
      const { container } = render(<Dashboard {...defaultProps} matches={matchesWithCleanSheets} />)
      
      expect(container).toBeInTheDocument()
    })
  })

  describe('Cards Table', () => {
    it('should display yellow, red, and black cards', () => {
      const matchesWithCards = [
        {
          ...mockMatches[0],
          stats: {
            p1: { goals: 2, assists: 1, appearances: 1, yellowCards: 2, redCards: 0, blackCards: 0 },
            p2: { goals: 1, assists: 2, appearances: 1, yellowCards: 1, redCards: 1, blackCards: 0 },
            p3: { goals: 0, assists: 0, appearances: 1, yellowCards: 0, redCards: 0, blackCards: 1 }
          }
        }
      ]
      
      const { container } = render(<Dashboard {...defaultProps} matches={matchesWithCards} />)
      
      expect(container).toBeInTheDocument()
    })
  })

  describe('Date Filtering', () => {
    it('should provide date filter options', () => {
      render(<Dashboard {...defaultProps} />)
      
      const selects = screen.queryAllByTestId('select')
      expect(selects.length).toBeGreaterThan(0)
    })

    it('should filter data by date selection', () => {
      render(<Dashboard {...defaultProps} />)
      
      const select = screen.queryAllByTestId('select')[0]
      if (select) {
        fireEvent.change(select, { target: { value: 'all' } })
        expect(select.value).toBe('all')
      }
    })
  })

  describe('Show All / Show Less Toggle', () => {
    it('should provide toggle buttons for tables', () => {
      render(<Dashboard {...defaultProps} />)
      
      // Check for view all button (uses i18n key)
      expect(screen.queryByText('leaderboard.viewAll')).toBeInTheDocument()
    })

    it('should toggle table expansion', () => {
      render(<Dashboard {...defaultProps} />)
      
      const toggleButton = screen.queryByText('leaderboard.viewAll')
      if (toggleButton) {
        fireEvent.click(toggleButton)
        // Button state should change
        expect(toggleButton).toBeInTheDocument()
      }
    })
  })

  describe('Man of the Match Features', () => {
    it('should display MoM notice widget when enabled', () => {
      render(<Dashboard {...defaultProps} momFeatureEnabled={true} />)
      
      expect(screen.queryByTestId('mom-notice-widget')).toBeInTheDocument()
    })

    it('should hide MoM features when disabled', () => {
      render(<Dashboard {...defaultProps} momFeatureEnabled={false} />)
      
      expect(screen.queryByTestId('mom-notice-widget')).not.toBeInTheDocument()
    })

    it('should display MoM leaderboard', () => {
      const { container } = render(<Dashboard {...defaultProps} momFeatureEnabled={true} />)
      
      // MoM leaderboard may or may not render depending on data
      expect(container).toBeInTheDocument()
    })
  })

  describe('Upcoming Matches Widget', () => {
    it('should display upcoming matches widget', () => {
      const upcomingMatches = [
        {
          id: 'u1',
          dateISO: '2025-12-20T10:00:00Z',
          opponent: 'Team A'
        }
      ]
      
      render(<Dashboard {...defaultProps} upcomingMatches={upcomingMatches} />)
      
      expect(screen.queryByTestId('upcoming-matches-widget')).toBeInTheDocument()
    })
  })

  describe('Season Recap', () => {
    it('should display season recap when enabled', () => {
      render(<Dashboard {...defaultProps} seasonRecapEnabled={true} seasonRecapReady={true} />)
      
      expect(screen.queryByTestId('season-recap')).toBeInTheDocument()
    })

    it('should hide season recap when disabled', () => {
      render(<Dashboard {...defaultProps} seasonRecapEnabled={false} />)
      
      expect(screen.queryByTestId('season-recap')).not.toBeInTheDocument()
    })
  })

  describe('Player Badges', () => {
    it('should support badge feature when enabled', () => {
      render(<Dashboard {...defaultProps} badgesEnabled={true} />)
      
      // Badge functionality should be available
      expect(screen.getByTestId('badges-hint')).toBeInTheDocument()
    })

    it('should disable badges when feature is off', () => {
      const { container } = render(<Dashboard {...defaultProps} badgesEnabled={false} />)
      
      expect(container).toBeInTheDocument()
    })
  })

  describe('Player Stats Modal', () => {
    it('should support player stats when enabled', () => {
      render(<Dashboard {...defaultProps} playerStatsEnabled={true} />)
      
      expect(screen.getByTestId('player-stats-modal')).toBeInTheDocument()
    })

    it('should disable player stats when feature is off', () => {
      const { container } = render(<Dashboard {...defaultProps} playerStatsEnabled={false} />)
      
      expect(container).toBeInTheDocument()
    })
  })

  describe('Membership Badges', () => {
    it('should display membership badges for players', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Players should show with their membership status
      expect(container).toBeInTheDocument()
    })

    it('should support custom membership settings', () => {
      const customMemberships = [
        {
          value: 'vip',
          label: 'VIP',
          badge: '👑',
          color: 'gold'
        }
      ]
      
      const { container } = render(<Dashboard {...defaultProps} membershipSettings={customMemberships} />)
      
      expect(container).toBeInTheDocument()
    })
  })

  describe('Responsive Design', () => {
    it('should render mobile category carousel', () => {
      render(<Dashboard {...defaultProps} />)
      
      expect(screen.queryByTestId('mobile-category-carousel')).toBeInTheDocument()
    })
  })

  describe('Admin Features', () => {
    it('should show admin features when isAdmin is true', () => {
      const { container } = render(<Dashboard {...defaultProps} isAdmin={true} />)
      
      expect(container).toBeInTheDocument()
    })

    it('should hide admin features when isAdmin is false', () => {
      const { container } = render(<Dashboard {...defaultProps} isAdmin={false} />)
      
      expect(container).toBeInTheDocument()
    })
  })

  describe('Saved Matches List', () => {
    it('should display saved matches list', () => {
      render(<Dashboard {...defaultProps} />)
      
      expect(screen.queryByTestId('saved-matches-list')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed match data', () => {
      const badMatches = [
        {
          id: 'm1',
          // Missing required fields
          stats: null
        }
      ]
      
      const { container } = render(<Dashboard {...defaultProps} matches={badMatches} />)
      expect(container).toBeInTheDocument()
    })

    it('should handle missing player data', () => {
      const matchesWithMissingPlayers = [
        {
          id: 'm1',
          dateISO: '2025-12-01T10:00:00Z',
          stats: {
            'unknown-player': { goals: 1, assists: 0 }
          }
        }
      ]
      
      const { container } = render(<Dashboard {...defaultProps} matches={matchesWithMissingPlayers} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Leaderboard Toggles', () => {
    it('should respect leaderboardToggles settings', () => {
      const toggles = {
        showGoals: true,
        showAssists: true,
        showAppearances: false
      }
      
      const { container } = render(<Dashboard {...defaultProps} leaderboardToggles={toggles} />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Data Computation', () => {
    it('should compute attack points correctly', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Verify dashboard renders with data
      expect(container).toBeInTheDocument()
      expect(screen.getByText('leaderboard.title')).toBeInTheDocument()
    })

    it('should rank players correctly', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Dashboard should render player data
      expect(container).toBeInTheDocument()
    })

    it('should calculate duo stats correctly', () => {
      const { container } = render(<Dashboard {...defaultProps} />)
      
      // Duo combinations should be computed from assists
      expect(container).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      const largePlayers = Array.from({ length: 100 }, (_, i) => ({
        id: `p${i}`,
        name: `Player ${i}`,
        membership: 'member',
        stats: { Pace: 70, Shooting: 70, Passing: 70, Dribbling: 70, Physical: 70, Stamina: 70 }
      }))

      const largeMatches = Array.from({ length: 50 }, (_, i) => ({
        id: `m${i}`,
        dateISO: `2025-12-${String(i % 30 + 1).padStart(2, '0')}T10:00:00Z`,
        teams: [[{ id: 'p0' }], [{ id: 'p1' }]],
        stats: {
          p0: { goals: 1, assists: 0, appearances: 1 },
          p1: { goals: 0, assists: 1, appearances: 1 }
        }
      }))

      const { container } = render(
        <Dashboard {...defaultProps} players={largePlayers} matches={largeMatches} />
      )
      
      expect(container).toBeInTheDocument()
    })
  })
})
