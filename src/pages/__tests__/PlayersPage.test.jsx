import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import PlayersPage from '../PlayersPage'
import { uploadPlayerPhoto, deletePlayerPhoto } from '../../lib/photoUpload'

vi.mock('../../lib/logger', () => ({
  __esModule: true,
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../../lib/photoUpload', () => ({
  __esModule: true,
  uploadPlayerPhoto: vi.fn(async () => 'https://mock/uploaded'),
  deletePlayerPhoto: vi.fn(async () => {}),
}))

const mkPlayer = (overrides = {}) => ({
  id: overrides.id || Math.random().toString(36).slice(2),
  name: overrides.name || 'Player',
  positions: overrides.positions || ['MF'],
  membership: overrides.membership || '정회원',
  stats: overrides.stats || { Pace: 50, Shooting: 50, Passing: 50, Dribbling: 50, Physical: 50, Stamina: 50 },
  ...overrides,
})

describe('PlayersPage - bug hunting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not crash when players is null', () => {
    expect(() => {
      render(<PlayersPage players={null} />)
    }).not.toThrow()
    expect(screen.getByText(/선수 목록/i)).toBeInTheDocument()
  })

  it('새 선수 추가: 이름/포지션 입력 후 onCreate 호출', async () => {
    const onCreate = vi.fn(async () => {})

    render(<PlayersPage players={[]} onCreate={onCreate} />)

    fireEvent.click(screen.getByText('새 선수 추가'))

    fireEvent.change(screen.getByPlaceholderText('예) 손흥민'), { target: { value: '신입' } })
    fireEvent.click(screen.getByText('DF'))
    fireEvent.click(screen.getByText('선수 추가하기'))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    const payload = onCreate.mock.calls[0][0]
    expect(payload.name).toBe('신입')
    expect(payload.positions).toContain('DF')
  })

  it('기존 선수 편집: 이름 변경 후 onUpdate 호출', async () => {
    const onUpdate = vi.fn(async () => {})
    const players = [mkPlayer({ id: 'p1', name: 'Alpha', positions: ['MF'] })]

    render(<PlayersPage players={players} onUpdate={onUpdate} />)

    fireEvent.click(screen.getAllByText('편집')[0])
    const nameInput = screen.getByPlaceholderText('예) 손흥민')
    fireEvent.change(nameInput, { target: { value: 'Alpha2' } })
    fireEvent.click(screen.getByText('변경사항 저장'))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0][0].name).toBe('Alpha2')
  })

  it('선수 삭제: 업로드된 사진이면 deletePlayerPhoto 호출 후 onDelete 실행', async () => {
    const onDelete = vi.fn(async () => {})
    const players = [mkPlayer({ id: 'p1', name: 'Alpha', photoUrl: 'https://cdn/player-photos/p1.png', positions: ['MF'] })]

    render(<PlayersPage players={players} onDelete={onDelete} />)

    fireEvent.click(screen.getAllByText('삭제')[0])
    fireEvent.click(await screen.findByText('삭제하기'))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('p1'))
    expect(deletePlayerPhoto).toHaveBeenCalledWith('https://cdn/player-photos/p1.png')
  })

  it('사진 업로드: 파일 선택 시 uploadPlayerPhoto 호출', async () => {
    const players = [mkPlayer({ id: 'p1', name: 'Alpha', positions: ['MF'] })]

    render(<PlayersPage players={players} />)

    fireEvent.click(screen.getAllByText('편집')[0])

    const fileInput = document.querySelector('input[type="file"]')
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(uploadPlayerPhoto).toHaveBeenCalledTimes(1))
    const args = uploadPlayerPhoto.mock.calls[0]
    expect(args[0]).toBe(file)
    expect(args[2]).toBe('Alpha')
  })

  it('멤버십/포지션 필터: 정회원 + DF 필터 시 결과 1명', async () => {
    const players = [
      mkPlayer({ id: 'p1', name: 'Alpha', membership: '정회원', positions: ['CB'] }),
      mkPlayer({ id: 'p2', name: 'Beta', membership: '게스트', positions: ['ST'] }),
    ]

    render(<PlayersPage players={players} />)

    fireEvent.click(screen.getByText('정회원'))
    fireEvent.click(screen.getByText('필터'))
    fireEvent.click(screen.getAllByRole('button', { name: 'DF' })[0])

    await waitFor(() => expect(screen.getAllByText('편집')).toHaveLength(1))
  })

  it('should not crash when membershipSettings is null', () => {
    expect(() => {
      render(<PlayersPage players={[]} membershipSettings={null} />)
    }).not.toThrow()
    expect(screen.getByText(/선수 목록/i)).toBeInTheDocument()
  })

  it('should handle null matches when sorting by AI Overall', () => {
    const players = [
      mkPlayer({ id: 'p1', name: 'Alpha', positions: ['FW'] }),
      mkPlayer({ id: 'p2', name: 'Beta', positions: ['DF'] }),
    ]

    const { getByTitle } = render(
      <PlayersPage players={players} matches={null} />
    )

    const aiButton = getByTitle('AI Overall 정렬 (토글: 오름/내림)')
    expect(() => fireEvent.click(aiButton)).not.toThrow()
  })

  it('커스텀 멤버십 삭제 시 필터가 자동으로 all로 리셋되어 전체가 보인다', async () => {
    const players = [
      mkPlayer({ id: 'vip', name: 'VIP', membership: 'VIP' }),
      mkPlayer({ id: 'regular', name: 'Regular', membership: '정회원' }),
    ]
    const custom = [{ id: 'c1', name: 'VIP', badgeColor: 'blue' }]

    const { rerender, getAllByText, getAllByRole } = render(
      <PlayersPage players={players} membershipSettings={custom} />
    )

    fireEvent.click(getAllByText('VIP')[0])
    await waitFor(() => expect(getAllByRole('listitem')).toHaveLength(1))

    rerender(<PlayersPage players={players} membershipSettings={[]} />)
    await waitFor(() => expect(getAllByRole('listitem')).toHaveLength(2))
  })

  it('프리셋 태그를 추가/제거할 수 있다', () => {
    render(
      <PlayersPage
        players={[mkPlayer({ id: 'p1', name: 'Alpha' })]}
        tagPresets={[{ name: 'Speedy', color: 'blue' }]}
      />
    )

    fireEvent.click(screen.getByText('새 선수 추가'))

    const preset = screen.getByText('Speedy')
    fireEvent.click(preset)
    expect(screen.getByText('선택된 태그')).toBeInTheDocument()
    expect(screen.getAllByText('Speedy').length).toBeGreaterThanOrEqual(1)

    fireEvent.click(preset)
    expect(screen.queryByText('선택된 태그')).not.toBeInTheDocument()
  })

  it('관리자가 프리셋 태그를 편집하면 onUpdateTagPreset이 호출된다', () => {
    const onUpdateTagPreset = vi.fn()

    render(
      <PlayersPage
        isAdmin
        players={[mkPlayer({ id: 'p1', name: 'Alpha' })]}
        tagPresets={[{ name: 'VIP', color: 'blue' }]}
        onUpdateTagPreset={onUpdateTagPreset}
      />
    )

    fireEvent.click(screen.getByText('새 선수 추가'))

    fireEvent.click(screen.getByTitle('편집'))
    const input = screen.getByPlaceholderText('태그 이름')
    fireEvent.change(input, { target: { value: 'VIP+' } })
    fireEvent.click(screen.getByTitle('저장'))

    expect(onUpdateTagPreset).toHaveBeenCalledWith(0, { name: 'VIP+', color: 'blue' })
  })
})
