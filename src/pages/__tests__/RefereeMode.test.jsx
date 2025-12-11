// src/pages/__tests__/RefereeMode.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RefereeMode from '../RefereeMode'

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key
  })
}))

vi.mock('../../components/Toast', () => ({
  notify: vi.fn()
}))

vi.mock('../../components/InitialAvatar', () => ({
  default: ({ name }) => <div data-testid="avatar">{name}</div>
}))

vi.mock('../../components/Card', () => ({
  default: ({ children }) => <div data-testid="card">{children}</div>
}))

vi.mock('../../components/ConfirmDialog', () => ({
  default: ({ open, children }) => open ? <div data-testid="confirm-dialog">{children}</div> : null
}))

vi.mock('../../lib/matchHelpers', () => ({
  getCaptains: vi.fn(() => [])
}))

describe('RefereeMode.jsx - Referee Mode Component', () => {
  const defaultMatch = {
    id: 'match-1',
    teams: [
      [{ id: 'p1', name: 'Player 1' }, { id: 'p2', name: 'Player 2' }],
      [{ id: 'p3', name: 'Player 3' }, { id: 'p4', name: 'Player 4' }]
    ],
    stats: {}
  }

  const defaultProps = {
    activeMatch: defaultMatch,
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    onAutoSave: vi.fn(),
    cardsEnabled: true
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial Setup Phase', () => {
    it('should render setup screen initially', () => {
      render(<RefereeMode {...defaultProps} />)
      
      // Check for setup elements instead of "Match Setup" title
      expect(screen.getByText(/Match Number/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument()
    })

    it('should allow setting game duration', () => {
      render(<RefereeMode {...defaultProps} />)
      
      const durationInput = screen.getByDisplayValue('20')
      expect(durationInput).toBeInTheDocument()
    })

    it('should show cancel and start buttons', () => {
      render(<RefereeMode {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument()
    })

    it('should show team selection when more than 2 teams', () => {
      const multiTeamMatch = {
        ...defaultMatch,
        teams: [
          [{ id: 'p1', name: 'Player 1' }],
          [{ id: 'p2', name: 'Player 2' }],
          [{ id: 'p3', name: 'Player 3' }]
        ]
      }
      
      render(<RefereeMode {...defaultProps} activeMatch={multiTeamMatch} />)
      
      // Should show team selection UI
      expect(screen.getByText(/팀 1/i)).toBeInTheDocument()
    })
  })

  describe('Props Validation', () => {
    it('should accept onFinish callback', () => {
      const onFinish = vi.fn()
      render(<RefereeMode {...defaultProps} onFinish={onFinish} />)
      
      expect(onFinish).not.toHaveBeenCalled()
    })

    it('should accept onCancel callback', () => {
      const onCancel = vi.fn()
      render(<RefereeMode {...defaultProps} onCancel={onCancel} />)
      
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('should accept onAutoSave callback', () => {
      const onAutoSave = vi.fn()
      render(<RefereeMode {...defaultProps} onAutoSave={onAutoSave} />)
      
      expect(onAutoSave).not.toHaveBeenCalled()
    })

    it('should accept cardsEnabled prop', () => {
      const { rerender } = render(<RefereeMode {...defaultProps} cardsEnabled={true} />)
      expect(screen.getByText(/Match Number/i)).toBeInTheDocument()
      
      rerender(<RefereeMode {...defaultProps} cardsEnabled={false} />)
      expect(screen.getByText(/Match Number/i)).toBeInTheDocument()
    })
  })

  describe('Match Data Structure', () => {
    it('should handle match with teams', () => {
      render(<RefereeMode {...defaultProps} />)
      
      expect(screen.getByText(/Match Number/i)).toBeInTheDocument()
    })

    it('should handle match with stats', () => {
      const matchWithStats = {
        ...defaultMatch,
        stats: {
          p1: { goals: 2, assists: 1 }
        }
      }
      
      render(<RefereeMode {...defaultProps} activeMatch={matchWithStats} />)
      
      expect(screen.getByText(/Match Number/i)).toBeInTheDocument()
    })

    it('should handle match with games history', () => {
      const matchWithHistory = {
        ...defaultMatch,
        stats: {
          __games: [
            { matchNumber: 1, scores: [1, 0] }
          ]
        }
      }
      
      render(<RefereeMode {...defaultProps} activeMatch={matchWithHistory} />)
      
      // Should start with game number 2
      expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    })
  })
})
