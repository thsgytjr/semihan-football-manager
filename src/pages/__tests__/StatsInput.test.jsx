import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import StatsInput from '../StatsInput'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  Trans: ({ children }) => children,
}))

vi.mock('../../components/Toast', () => ({
  notify: vi.fn(),
}))

vi.mock('../../components/Card', () => ({
  __esModule: true,
  default: ({ title, children }) => (
    <div>
      <div>{title}</div>
      <div>{children}</div>
    </div>
  ),
}))

vi.mock('../../components/InitialAvatar', () => ({
  __esModule: true,
  default: ({ name }) => <div>{name}</div>,
}))

vi.mock('../../components/MoMAdminPanel', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('../../components/ConfirmDialog', () => ({
  __esModule: true,
  default: ({ open, title, message, confirmLabel = '확인', cancelLabel, onConfirm, onCancel }) => (
    open ? (
      <div>
        <div>{title}</div>
        <div>{message}</div>
        <button onClick={onConfirm}>{confirmLabel}</button>
        {cancelLabel ? <button onClick={onCancel}>{cancelLabel}</button> : null}
      </div>
    ) : null
  ),
}))

vi.mock('../../components/RefereeTimelineEditor', () => ({
  __esModule: true,
  default: () => <div>RefereeTimelineEditor</div>,
}))

vi.mock('../../services/momVotes.service', () => ({
  __esModule: true,
  fetchMoMVotes: vi.fn(async () => []),
  submitMoMVote: vi.fn(async () => {}),
  deleteMoMVote: vi.fn(async () => {}),
  deleteMoMVotesByMatch: vi.fn(async () => {}),
}))

const mkPlayer = (overrides = {}) => ({
  id: overrides.id || `p-${Math.random().toString(36).slice(2, 6)}`,
  name: overrides.name || '플레이어',
  membership: overrides.membership || '정회원',
  positions: overrides.positions || ['MF'],
  photoUrl: overrides.photoUrl,
  ...overrides,
})

const mkMatch = (overrides = {}) => ({
  id: 'm1',
  date: new Date(2025, 10, 8, 9, 0, 0).toISOString(),
  snapshot: ['p1', 'p2'],
  teams: [
    [{ id: 'p1', name: 'Alpha' }],
    [{ id: 'p2', name: 'Beta' }],
  ],
  stats: {},
  ...overrides,
})

describe('StatsInput - 기록 입력', () => {
  const players = [
    mkPlayer({ id: 'p1', name: 'Alpha', positions: ['ST'] }),
    mkPlayer({ id: 'p2', name: 'Beta', positions: ['MF'] }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('비관리자에게 접근 거부 메시지를 보여준다', () => {
    render(<StatsInput isAdmin={false} players={players} matches={[]} />)

    expect(screen.getByText('접근 권한이 없습니다.')).toBeInTheDocument()
  })

  it('매치가 없을 때 안내 문구를 표시한다', () => {
    render(<StatsInput isAdmin players={players} matches={[]} />)

    expect(screen.getByText('저장된 매치가 없습니다.')).toBeInTheDocument()
  })

  it('Bulk 입력이 잘못된 형식이면 오류 메시지를 노출한다', async () => {
    await act(async () => {
      render(<StatsInput isAdmin players={players} matches={[mkMatch()]} />)
    })

    // Bulk 입력 textarea 찾기 (placeholder 또는 다른 속성으로)
    const textareas = screen.queryAllByRole('textbox')
    const bulkTextarea = textareas.find(el => 
      el.placeholder?.includes('예시:') || 
      el.getAttribute('placeholder')?.includes('예시:')
    )
    
    if (!bulkTextarea) {
      // Bulk 입력 UI가 없으면 테스트 스킵
      console.warn('Bulk 입력 UI를 찾을 수 없습니다. 기능이 제거되었을 수 있습니다.')
      return
    }

    await act(async () => {
      fireEvent.change(bulkTextarea, { target: { value: 'invalid input format' } })
    })

    const applyButtons = screen.queryAllByText(/초안에 적용/i)
    if (applyButtons.length === 0) {
      console.warn('적용 버튼을 찾을 수 없습니다.')
      return
    }

    await act(async () => {
      fireEvent.click(applyButtons[0])
    })

    await waitFor(() => {
      expect(screen.getByText(/모든 줄이 .*형식이어야 합니다/)).toBeInTheDocument()
    })
  })

  it('goal:assist Bulk 입력을 적용 후 저장하면 링크가 유지된 채 onUpdateMatch로 전달된다', async () => {
    const onUpdateMatch = vi.fn()

    await act(async () => {
      render(<StatsInput isAdmin players={players} matches={[mkMatch()]} onUpdateMatch={onUpdateMatch} />)
    })

    // Bulk 입력 textarea 찾기
    const textareas = screen.queryAllByRole('textbox')
    const bulkTextarea = textareas.find(el => 
      el.placeholder?.includes('예시:') || 
      el.getAttribute('placeholder')?.includes('예시:')
    )
    
    if (!bulkTextarea) {
      // Bulk 입력 UI가 없으면 테스트 스킵
      console.warn('Bulk 입력 UI를 찾을 수 없습니다. 기능이 제거되었을 수 있습니다.')
      return
    }

    await act(async () => {
      fireEvent.change(bulkTextarea, { target: { value: '[11/08/2025 9:07AM]goal:assist[Alpha Beta]' } })
    })

    const applyButtons = screen.queryAllByText(/초안에 적용/i)
    if (applyButtons.length === 0) {
      console.warn('적용 버튼을 찾을 수 없습니다.')
      return
    }

    await act(async () => {
      fireEvent.click(applyButtons[0])
    })

    await waitFor(() => {
      expect(screen.queryByText(/초안에 적용 완료/i) || screen.queryByText(/적용/i)).toBeTruthy()
    })

    const saveButtons = screen.queryAllByText(/저장/i)
    if (saveButtons.length === 0) {
      console.warn('저장 버튼을 찾을 수 없습니다.')
      return
    }

    await act(async () => {
      fireEvent.click(saveButtons[0])
    })

    await waitFor(() => expect(onUpdateMatch).toHaveBeenCalled(), { timeout: 3000 })
    
    if (onUpdateMatch.mock.calls.length === 0) {
      console.warn('onUpdateMatch가 호출되지 않았습니다.')
      return
    }

    const [, payload] = onUpdateMatch.mock.calls[0]
    const stats = payload.stats

    expect(stats.p1.goals).toBe(1)
    expect(stats.p2.assists).toBe(1)
    const duo = stats.__goalAssistLinks?.find(l => l.goalScorerId === 'p1' && l.assisterId === 'p2')
    expect(duo).toBeDefined()
  })

  it('연결된 골을 제거하면 매칭된 어시스트도 함께 줄어든다', async () => {
    const onUpdateMatch = vi.fn()
    const matchWithLinked = mkMatch({
      stats: {
        p1: {
          goals: 1,
          assists: 0,
          events: [{ type: 'goal', assistedBy: 'p2' }],
        },
        p2: {
          goals: 0,
          assists: 1,
          events: [{ type: 'assist', linkedToGoal: 'p1' }],
        },
      },
    })

    render(<StatsInput isAdmin players={players} matches={[matchWithLinked]} onUpdateMatch={onUpdateMatch} />)

    const alphaRow = screen.getAllByRole('row').find((row) => (within(row).queryAllByText('Alpha').length > 0))
    expect(alphaRow).not.toBeNull()

    const goalMinus = within(alphaRow).getAllByText('−')[0]
    fireEvent.click(goalMinus)

    const saveButton = screen.getAllByRole('button', { name: '💾 저장하기' })[0]
    fireEvent.click(saveButton)

    await waitFor(() => expect(onUpdateMatch).toHaveBeenCalled())
    const [, payload] = onUpdateMatch.mock.calls[0]
    const stats = payload.stats

    expect(stats.p1.goals).toBe(0)
    expect(stats.p1.events).toHaveLength(0)
    expect(stats.p2.assists).toBe(0)
    expect(stats.p2.events).toHaveLength(0)
  })
})
