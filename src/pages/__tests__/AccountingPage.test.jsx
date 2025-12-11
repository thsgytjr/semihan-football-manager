import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AccountingPage from '../AccountingPage'

vi.mock('xlsx', () => ({
  __esModule: true,
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}))

vi.mock('../../components/Toast', () => ({
  __esModule: true,
  notify: vi.fn(),
}))

vi.mock('../../components/Card', () => ({
  __esModule: true,
  default: ({ children, title, right }) => (
    <div>
      {title ? <div>{title}</div> : null}
      {right ? <div>{right}</div> : null}
      <div>{children}</div>
    </div>
  ),
}))

vi.mock('../../components/ConfirmDialog', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('../../components/FinancialDashboard', () => ({
  __esModule: true,
  default: () => <div>FinancialDashboard</div>,
}))

vi.mock('../../components/InitialAvatar', () => ({
  __esModule: true,
  default: ({ name }) => <div>{name}</div>,
}))

vi.mock('../../lib/fees', () => ({
  __esModule: true,
  isMember: (m) => String(m || '').includes('정회원') || String(m || '').toLowerCase() === 'member',
}))

const accountingMocks = vi.hoisted(() => ({
  ensureDuesDefaults: vi.fn(async () => {}),
  listPayments: vi.fn(async () => []),
  getDuesSettings: vi.fn(async () => []),
  getAccountingSummary: vi.fn(async () => ({ totalRevenue: 0 })),
  getPlayerPaymentStats: vi.fn(async () => ({ stats: [] })),
  getMatchPayments: vi.fn(async () => []),
  confirmMatchPayment: vi.fn(async () => {}),
  cancelMatchPayment: vi.fn(async () => {}),
  hardDeleteMatchPayment: vi.fn(async () => {}),
  updatePayment: vi.fn(async () => {}),
  addPayment: vi.fn(async () => ({ id: 'pay1' })),
  deletePayment: vi.fn(async () => {}),
  updateDuesSetting: vi.fn(async () => {}),
  getDuesRenewals: vi.fn(async () => ({})),
}))

vi.mock('../../lib/accounting', () => accountingMocks)

vi.mock('../../services/matches.service', () => ({
  __esModule: true,
  listMatchesFromDB: vi.fn(async () => []),
  updateMatchInDB: vi.fn(async () => {}),
}))

vi.mock('../../lib/appSettings', () => ({
  __esModule: true,
  getAccountingOverrides: vi.fn(() => ({})),
  updateAccountingOverrides: vi.fn(async () => {}),
}))

vi.mock('../../lib/matchFeeCalculator', () => ({
  __esModule: true,
  calculateMatchFees: vi.fn(() => ({ totals: { totalFee: 0 }, attendees: [] })),
  calculatePlayerMatchFee: vi.fn(() => 0),
}))

describe('AccountingPage', () => {
  const players = [
    { id: 'p1', name: 'Alpha', membership: '정회원' },
    { id: 'p2', name: 'Beta', membership: '정회원' },
  ]

  beforeAll(() => {
    // Avoid unwanted console noise
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default resolves
    accountingMocks.listPayments.mockResolvedValue([])
    accountingMocks.getDuesSettings.mockResolvedValue([])
    accountingMocks.getAccountingSummary.mockResolvedValue({ totalRevenue: 0 })
    accountingMocks.getDuesRenewals.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('비관리자는 접근 차단 메시지를 본다', () => {
    render(<AccountingPage isAdmin={false} players={players} matches={[]} upcomingMatches={[]} />)

    expect(screen.getByText('총무(Admin)만 접근 가능합니다.')).toBeInTheDocument()
    expect(accountingMocks.ensureDuesDefaults).not.toHaveBeenCalled()
  })

  it('관리자 로드시 회계 데이터 로드가 호출된다', async () => {
    render(<AccountingPage isAdmin players={players} matches={[]} upcomingMatches={[]} />)

    await waitFor(() => expect(accountingMocks.ensureDuesDefaults).toHaveBeenCalledTimes(1))
    expect(accountingMocks.listPayments).toHaveBeenCalledWith({ startDate: undefined, endDate: undefined })
    expect(accountingMocks.getAccountingSummary).toHaveBeenCalled()
  })

  it('운영비/기타 항목은 시스템 계정을 자동으로 사용해 결제가 추가된다', async () => {
    const sysPlayers = [...players, { id: 'sys1', name: 'House', isSystemAccount: true, membership: '정회원' }]

    render(<AccountingPage isAdmin players={sysPlayers} matches={[]} upcomingMatches={[]} />)

    await waitFor(() => expect(accountingMocks.listPayments).toHaveBeenCalled())

    fireEvent.click(screen.getByText('결제 내역'))
    fireEvent.click(screen.getByText('결제 추가'))

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '12.5' } })

    fireEvent.click(screen.getByRole('button', { name: '추가' }))

    await waitFor(() => expect(accountingMocks.addPayment).toHaveBeenCalled())
    const payload = accountingMocks.addPayment.mock.calls[0][0]
    expect(payload.playerId).toBe('sys1')
    expect(payload.paymentType).toBe('other_income')
    expect(payload.amount).toBeCloseTo(12.5)
  })

  it('시스템 계정 없이 운영비를 추가하면 경고를 표시하고 저장하지 않는다', async () => {
    const { notify } = await import('../../components/Toast')

    render(<AccountingPage isAdmin players={players} matches={[]} upcomingMatches={[]} />)

    await waitFor(() => expect(accountingMocks.listPayments).toHaveBeenCalled())

    fireEvent.click(screen.getByText('결제 내역'))
    fireEvent.click(screen.getByText('결제 추가'))
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } })

    fireEvent.click(screen.getByRole('button', { name: '추가' }))

    await waitFor(() => {
      expect(notify).toHaveBeenCalled()
    })
    const messages = notify.mock.calls.map(call => call[0])
    expect(messages.some(msg => /시스템 계정을 먼저 생성/.test(String(msg)))).toBe(true)
    expect(accountingMocks.addPayment).not.toHaveBeenCalled()
  })
})
