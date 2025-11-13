// src/components/FinancialDashboard.jsx
import React, { useMemo, useState } from 'react'
import Card from './Card'
import SimplePieChart from './charts/SimplePieChart'
import SimpleBarChart from './charts/SimpleBarChart'
import InitialAvatar from './InitialAvatar'
import { AlertCircle, TrendingUp, TrendingDown, Users, DollarSign, AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { confirmMatchPayment, cancelMatchPayment } from '../lib/accounting'
import { updateMatchInDB } from '../services/matches.service'
import { notify } from './Toast'
import { calculatePlayerMatchFee, calculateMatchFees } from '../lib/matchFeeCalculator'
import { getMembershipSettings } from '../services/membership.service'
import { getBadgesWithCustom } from '../lib/matchUtils'
import { getMembershipBadge } from '../lib/membershipConfig'

/**
 * 총무를 위한 재정 현황 대시보드
 * - 수입/지출 개요
 * - 구장비 미납자 목록
 * - 상환(Reimbursement) 내역
 * - 월별 트렌드
 */
export default function FinancialDashboard({ 
  summary = {}, 
  payments = [], 
  matches = [],
  upcomingMatches = [],
  players = [],
  dateRange = {},
  onRefresh
}) {
  const [showAllUnpaid, setShowAllUnpaid] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [customMemberships, setCustomMemberships] = useState([])

  // 커스텀 멤버십 설정 로드 (배지 스타일/라벨에 사용)
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const settings = await getMembershipSettings()
        if (mounted) setCustomMemberships(Array.isArray(settings) ? settings : [])
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])
  // 수입(양수) 카테고리 데이터 (지출 제외) - 직관적 막대 구성 용
  const revenueCategories = useMemo(() => {
    const cats = []
    if (summary.registrationFees?.total > 0) cats.push({ key: 'registration', label: '가입비', value: summary.registrationFees.total, color: '#3B82F6' })
    if (summary.monthlyDues?.total > 0) cats.push({ key: 'monthly', label: '월회비', value: summary.monthlyDues.total, color: '#8B5CF6' })
    if (summary.annualDues?.total > 0) cats.push({ key: 'annual', label: '연회비', value: summary.annualDues.total, color: '#6366F1' })
    if (summary.otherIncome?.total > 0) cats.push({ key: 'other', label: '기타 수입', value: summary.otherIncome.total, color: '#10B981' })
    return cats.sort((a,b)=> b.value - a.value)
  }, [summary])

  const positiveTotal = useMemo(() => revenueCategories.reduce((s,c)=>s + c.value, 0), [revenueCategories])
  const expenseTotal = summary.expenses?.total || 0

  // 상환 내역
  // 지출 내역 (기타 지출)
  const expenses = useMemo(() => {
    return payments
      .filter(p => p.payment_type === 'expense')
      .map(p => {
        // Extract custom payee from notes if present
        let customPayee = '미지정'
        let displayNotes = p.notes || ''
        if (displayNotes) {
          const match = displayNotes.match(/^\[payee: ([^\]]+)\]/)
          if (match) {
            customPayee = match[1]
            displayNotes = displayNotes.replace(match[0], '').trim()
          }
        }
        return {
          ...p,
          customPayee,
          displayNotes
        }
      })
      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
  }, [payments])

  // 구장비 미납자 (저장된 매치 기준) - 매치별로 그룹화
  const unpaidMatchFees = useMemo(() => {
    const matchGroups = []
    
    matches.forEach(match => {
      const participantIds = match.attendeeIds || match.participantIds || 
        (Array.isArray(match.snapshot) ? match.snapshot.flat() : []) || []
      const { memberFee, guestFee } = calculateMatchFees(match, players)
      const noFeeConfigured = (!memberFee && !guestFee)
      
      const unpaidInMatch = []
      
      participantIds.forEach(playerId => {
        const player = players.find(p => p.id === playerId)
        if (!player) return
        
        // 해당 매치에 대한 결제 확인
        const hasPaid = payments.some(p => 
          p.player_id === playerId && 
          p.match_id === match.id && 
          p.payment_type === 'match_fee'
        )
        
        if (!hasPaid) {
          const expectedFee = calculatePlayerMatchFee(match, player, players)
          
          unpaidInMatch.push({
            playerId: player.id,
            playerName: player.name,
            playerPhoto: player.photoUrl,
            expectedFee
          })
        }
      })
      
      // 미납자가 있거나 구장비가 설정되지 않은 경우 목록에 추가
      if (unpaidInMatch.length > 0 || noFeeConfigured) {
        matchGroups.push({
          matchId: match.id,
          matchDate: match.dateISO,
          matchLocation: match.location?.name || '장소 미정',
          unpaidPlayers: unpaidInMatch,
          totalUnpaid: unpaidInMatch.reduce((sum, u) => sum + u.expectedFee, 0),
          noFeeConfigured
        })
      }
    })
    
    // 최신순으로 정렬 (최근 매치가 위로)
    return matchGroups.sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate))
  }, [matches, players, payments])

  // 월별 수입 트렌드 (최근 6개월)
  const monthlyTrend = useMemo(() => {
    const months = []
    const now = new Date()
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      months.push({
        label: date.toLocaleDateString('ko-KR', { month: 'short' }),
        key: monthKey,
        value: 0,
        color: '#10B981' // emerald
      })
    }
    
    payments.forEach(p => {
      if (p.payment_type === 'expense') return // 지출 제외
      const paymentDate = new Date(p.payment_date)
      const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`
      const month = months.find(m => m.key === monthKey)
      if (month) {
        month.value += parseFloat(p.amount)
      }
    })
    
    return months
  }, [payments])

  // 순수익 계산 (수입 - 지출)
  // summary.totalRevenue 이미 expenses를 차감한 순수익(현재 회계 로직)
  const netRevenue = summary.totalRevenue || 0
  const totalExpenses = summary.expenses?.total || 0
  // 총 수입(지출 제외한 양의 결제 합) = 순수익 + 지출액
  const grossRevenue = netRevenue + totalExpenses
  
  // 미납 인원수와 금액 (구장비가 설정되지 않은 매치는 제외)
  const totalUnpaidCount = unpaidMatchFees
    .filter(m => !m.noFeeConfigured)
    .reduce((sum, m) => sum + m.unpaidPlayers.length, 0)
  const totalUnpaidAmount = unpaidMatchFees
    .filter(m => !m.noFeeConfigured)
    .reduce((sum, m) => sum + m.totalUnpaid, 0)

  return (
    <div className="space-y-6">
      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<DollarSign className="text-emerald-600" size={24} />}
          label="총 수입(지출 제외)"
          value={`$${grossRevenue.toFixed(2)}`}
          bgColor="bg-emerald-50"
        />
        <MetricCard
          icon={<TrendingDown className="text-red-600" size={24} />}
          label="지출"
          value={`-$${totalExpenses.toFixed(2)}`}
          subtitle={`${summary.expenses?.count || 0}건`}
          bgColor="bg-red-50"
        />
        <MetricCard
          icon={<TrendingUp className="text-blue-600" size={24} />}
          label="순수익"
          value={`$${netRevenue.toFixed(2)}`}
          bgColor="bg-blue-50"
        />
        <MetricCard
          icon={<AlertTriangle className="text-orange-600" size={24} />}
          label="구장비 미납"
          value={totalUnpaidCount}
          subtitle={`$${totalUnpaidAmount.toFixed(2)}`}
          bgColor="bg-orange-50"
        />
      </div>

      {/* 차트 섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 수입 구성 (직관적 막대 + 레전드 + 지출 비교) */}
        <Card title="수입 구성">
          {positiveTotal > 0 ? (
            <div className="space-y-5 py-2">
              {/* 누적 막대 (수입 비중) */}
              <div className="w-full h-6 rounded overflow-hidden flex ring-1 ring-gray-200">
                {revenueCategories.map(cat => {
                  const pct = positiveTotal === 0 ? 0 : (cat.value / positiveTotal) * 100
                  return (
                    <div
                      key={cat.key}
                      title={`${cat.label} ${pct.toFixed(1)}% ($${cat.value.toFixed(2)})`}
                      className="h-full flex items-center justify-center text-[10px] font-medium text-white"
                      style={{ width: pct + '%', backgroundColor: cat.color, minWidth: pct > 6 ? undefined : 6 }}
                    >
                      {pct >= 12 && <span>{pct.toFixed(0)}%</span>}
                    </div>
                  )
                })}
              </div>

              {/* 레전드 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {revenueCategories.map(cat => {
                  const pct = positiveTotal === 0 ? 0 : (cat.value / positiveTotal) * 100
                  return (
                    <div key={cat.key} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                      <span className="flex-1 text-gray-700 truncate">{cat.label}</span>
                      <span className="tabular-nums text-gray-900 font-medium">${cat.value.toFixed(2)}</span>
                      <span className="text-gray-500">({pct.toFixed(1)}%)</span>
                    </div>
                  )
                })}
              </div>

              {/* 지출 & 순수익 비교 */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">총 수입 합계</span>
                  <span className="font-semibold text-gray-900">${positiveTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-600 flex items-center gap-1">지출</span>
                  <span className="font-semibold text-red-600">-${expenseTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t pt-2">
                  <span className="text-blue-600 font-medium">순수익</span>
                  <span className="font-bold text-blue-600">${(positiveTotal - expenseTotal).toFixed(2)}</span>
                </div>
                {expenseTotal > 0 && (
                  <div className="mt-2">
                    <div className="h-3 w-full bg-red-100 rounded overflow-hidden flex">
                      <div
                        className="bg-red-500 h-full"
                        style={{ width: Math.min(100, (expenseTotal / positiveTotal) * 100) + '%' }}
                        title={`지출 비중 ${(expenseTotal / positiveTotal * 100).toFixed(1)}%`}
                      />
                    </div>
                    <div className="text-[11px] text-right text-red-600 mt-0.5">지출 비중 {(expenseTotal / positiveTotal * 100).toFixed(1)}%</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400">
              <AlertCircle className="mx-auto mb-2" size={32} />
              <p className="text-sm">아직 수입 데이터가 없습니다</p>
            </div>
          )}
        </Card>

        {/* 월별 수입 트렌드 */}
        <Card title="월별 수입 트렌드 (최근 6개월)">
          {monthlyTrend.some(m => m.value > 0) ? (
            <div className="py-4">
              <SimpleBarChart data={monthlyTrend} />
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400">
              <TrendingUp className="mx-auto mb-2" size={32} />
              <p className="text-sm">아직 월별 데이터가 없습니다</p>
            </div>
          )}
        </Card>
      </div>

      {/* 구장비 미납자 목록 - 매치별 그룹화 */}
      {unpaidMatchFees.length > 0 && (
        <Card 
          title={`구장비 미납 현황 (${unpaidMatchFees.length}개 매치)`}
          icon={<AlertTriangle className="text-orange-500" size={20} />}
        >
          <div className="space-y-3">
            {(showAllUnpaid ? unpaidMatchFees : unpaidMatchFees.slice(0, 5)).map((matchGroup, idx) => (
              <div 
                key={idx} 
                className="border rounded-lg p-3 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer"
                onClick={() => setSelectedMatch(matchGroup)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm">
                      {new Date(matchGroup.matchDate).toLocaleDateString('ko-KR', { 
                        year: 'numeric',
                        month: 'short', 
                        day: 'numeric',
                        weekday: 'short'
                      })}
                    </div>
                    <div className="text-xs text-gray-600">{matchGroup.matchLocation}</div>
                    {matchGroup.noFeeConfigured && (
                      <div className="text-[11px] text-red-600 mt-0.5">구장비가 설정되지 않았습니다</div>
                    )}
                  </div>
                  <div className="text-right">
                    {matchGroup.noFeeConfigured ? (
                      <div className="text-sm font-semibold text-red-600">설정 필요</div>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-orange-600">
                          ${matchGroup.totalUnpaid.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">{matchGroup.unpaidPlayers.length}명 미납</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {matchGroup.unpaidPlayers.map((unpaid, pidx) => {
                    const player = players.find(p => p.id === unpaid.playerId)
                    const badges = player ? getBadgesWithCustom(player.membership, customMemberships) : []
                    const badgeInfo = player ? getMembershipBadge(player.membership, customMemberships) : null
                    
                    return (
                      <div 
                        key={pidx}
                        className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-md border border-orange-200"
                      >
                        <InitialAvatar 
                          id={unpaid.playerId} 
                          name={unpaid.playerName} 
                          size={20} 
                          photoUrl={unpaid.playerPhoto}
                          badges={badges}
                          badgeColor={badgeInfo?.badgeColor}
                          customMemberships={customMemberships}
                        />
                        <span className="text-xs font-medium">{unpaid.playerName}</span>
                        {!matchGroup.noFeeConfigured && (
                          <span className="text-xs text-orange-600 font-semibold">
                            ${unpaid.expectedFee.toFixed(1)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {unpaidMatchFees.length > 5 && (
              <button
                onClick={() => setShowAllUnpaid(!showAllUnpaid)}
                className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1"
              >
                {showAllUnpaid ? (
                  <>
                    <ChevronUp size={16} />
                    접기
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    {unpaidMatchFees.length - 5}개 매치 더 보기
                  </>
                )}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* 미납 매치 상세 모달 */}
      {selectedMatch && (
        <UnpaidMatchModal
          match={selectedMatch}
          players={players}
          customMemberships={customMemberships}
          onClose={() => setSelectedMatch(null)}
          onRefresh={onRefresh}
        />
      )}

      {/* 지출 내역 */}
      {expenses.length > 0 && (
        <Card 
          title={`지출 내역 (${expenses.length}건)`}
          icon={<TrendingDown className="text-red-500" size={20} />}
        >
          <div className="space-y-2">
            {expenses.slice(0, 5).map((exp, idx) => {
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center">
                      <TrendingDown size={16} className="text-red-600" />
                    </div>
                    <div>
                      <div className="font-medium">{exp.customPayee}</div>
                      <div className="text-xs text-gray-600">
                        {new Date(exp.payment_date).toLocaleDateString('ko-KR')}
                        {exp.displayNotes && ` · ${exp.displayNotes}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600">
                      -${parseFloat(exp.amount).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">지출</div>
                  </div>
                </div>
              )
            })}
            {expenses.length > 5 && (
              <p className="text-center text-sm text-gray-500 pt-2">
                외 {expenses.length - 5}건 더 있습니다
              </p>
            )}
          </div>
        </Card>
      )}

      {/* 기간 안내 */}
      {(dateRange.start || dateRange.end) && (
        <div className="text-sm text-gray-500 text-center">
          조회 기간: {dateRange.start || '처음'} ~ {dateRange.end || '현재'}
        </div>
      )}
    </div>
  )
}

// 미납 매치 상세 모달 - Quick Update 가능
function UnpaidMatchModal({ match, players, customMemberships = [], onClose, onRefresh }) {
  const [updating, setUpdating] = useState({})
  const [editFeesOpen, setEditFeesOpen] = useState(false)
  const [feeForm, setFeeForm] = useState({ memberFee: '', guestSurcharge: '', total: '' })
  const [selected, setSelected] = useState(() => new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // 모달 표시 시 배경 스크롤 잠금 (모달 내부 스크롤은 허용)
  React.useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // 배경 페이지 위치 이동은 즉시 처리(모바일 사파리에서 smooth가 먹통처럼 느껴질 수 있음)
    try { window.scrollTo(0, 0) } catch {}
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  async function handleTogglePayment(playerId, isPaid, amount) {
    setUpdating(prev => ({ ...prev, [playerId]: true }))
    
    try {
      if (isPaid) {
        // 취소
        await cancelMatchPayment(match.matchId, playerId)
        notify('납부 취소되었습니다')
      } else {
        // 확인
        await confirmMatchPayment(match.matchId, playerId, amount, 'venmo')
        notify('납부 확인되었습니다 ✅')
      }
      
      if (onRefresh) onRefresh()
      
      // 모달 닫기 (업데이트 후)
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (error) {
      notify('처리 실패')
    } finally {
      setUpdating(prev => ({ ...prev, [playerId]: false }))
    }
  }

  async function handleSaveFeesOverride() {
    // 최소 한 항목이라도 입력되어야 함
    const hasAny = feeForm.memberFee !== '' || feeForm.guestSurcharge !== '' || feeForm.total !== ''
    if (!hasAny) {
      notify('최소 한 개의 값을 입력해주세요')
      return
    }

    const fees = {}
    if (feeForm.memberFee !== '') fees.memberFee = parseFloat(feeForm.memberFee)
    if (feeForm.guestSurcharge !== '') fees.guestSurcharge = parseFloat(feeForm.guestSurcharge)
    if (feeForm.total !== '') fees.total = parseFloat(feeForm.total)

    try {
      await updateMatchInDB(match.matchId, { fees })
      notify('구장비 설정이 업데이트되었습니다 ✅')
      if (onRefresh) onRefresh()
      setEditFeesOpen(false)
      onClose()
    } catch (e) {
      notify('구장비 설정 저장 실패')
    }
  }

  // 선택 토글 helpers
  const unpaidIds = Array.isArray(match.unpaidPlayers) ? match.unpaidPlayers.map(u => u.playerId) : []
  const allSelected = unpaidIds.length > 0 && unpaidIds.every(id => selected.has(id))
  const selectedCount = selected.size

  function toggleSelectOne(playerId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      const shouldSelectAll = !allSelected
      next.clear()
      if (shouldSelectAll) unpaidIds.forEach(id => next.add(id))
      return next
    })
  }

  async function handleBulkConfirm() {
    if (selected.size === 0) {
      notify('선택된 선수가 없습니다')
      return
    }
    setBulkUpdating(true)
    try {
      const tasks = match.unpaidPlayers
        .filter(u => selected.has(u.playerId))
        .map(u => confirmMatchPayment(match.matchId, u.playerId, u.expectedFee, 'venmo'))
      const results = await Promise.allSettled(tasks)
      const success = results.filter(r => r.status === 'fulfilled').length
      const failed = results.length - success
      if (success > 0) notify(`${success}명 납부 확인되었습니다 ✅`)
      if (failed > 0) notify(`${failed}명 처리 실패`)
      if (onRefresh) await onRefresh()
      onClose()
    } catch (e) {
      notify('일괄 처리 실패')
    } finally {
      setBulkUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-2xl w-full my-4 shadow-xl flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        {/* 헤더 - 고정 */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h3 className="font-semibold text-lg">
              {new Date(match.matchDate).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
              })}
            </h3>
            <p className="text-sm text-gray-600">{match.matchLocation}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full shrink-0"
          >
            <X size={20} />
          </button>
        </div>

  {/* 본문 - 스크롤 가능 */}
  <div className="flex-1 overflow-y-auto p-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* 수동 설정 패널 */}
          <div className="mb-3">
            <button
              onClick={() => setEditFeesOpen(v => !v)}
              className="px-3 py-1.5 text-xs bg-gray-200 rounded hover:bg-gray-300"
            >
              {editFeesOpen ? '수동 설정 닫기' : '구장비 수동 설정'}
            </button>
            {editFeesOpen && (
              <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">멤버 구장비 (1인)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={feeForm.memberFee}
                      onChange={(e) => setFeeForm(f => ({ ...f, memberFee: e.target.value }))}
                      className="w-full px-2 py-1.5 border rounded"
                      placeholder="예: 10.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">게스트 할증</label>
                    <input
                      type="number"
                      step="0.5"
                      value={feeForm.guestSurcharge}
                      onChange={(e) => setFeeForm(f => ({ ...f, guestSurcharge: e.target.value }))}
                      className="w-full px-2 py-1.5 border rounded"
                      placeholder="예: 2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">전체 구장비 총액 (선택)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={feeForm.total}
                      onChange={(e) => setFeeForm(f => ({ ...f, total: e.target.value }))}
                      className="w-full px-2 py-1.5 border rounded"
                      placeholder="예: 150"
                    />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleSaveFeesOverride}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setFeeForm({ memberFee: '', guestSurcharge: '', total: '' })}
                    className="px-3 py-1.5 text-xs bg-gray-200 rounded hover:bg-gray-300"
                  >
                    초기화
                  </button>
                </div>
              </div>
            )}
          </div>
          {match.noFeeConfigured ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              구장비가 설정되지 않아 납부 확인을 진행할 수 없습니다. 회비 설정 또는 매치 구장비를 먼저 입력해주세요.
            </div>
          ) : (
            <>
              <div className="mb-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">총 미납 금액</span>
                  <span className="text-lg font-bold text-orange-600">
                    ${match.totalUnpaid.toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {match.unpaidPlayers.length}명이 아직 납부하지 않았습니다
                </div>
              </div>
              {/* 일괄 선택/확인 툴바 */}
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                  모두 선택 ({selectedCount}/{unpaidIds.length})
                </label>
                <button
                  onClick={handleBulkConfirm}
                  disabled={selectedCount === 0 || bulkUpdating}
                  className={`px-3 py-1.5 text-xs rounded ${selectedCount === 0 || bulkUpdating ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  {bulkUpdating ? '처리 중…' : `선택 납부 확인 (${selectedCount}명)`}
                </button>
              </div>

              <div className="space-y-2">
                {match.unpaidPlayers.map((unpaid) => {
                  const player = players.find(p => p.id === unpaid.playerId)
                  const badges = player ? getBadgesWithCustom(player.membership, customMemberships) : []
                  const badgeInfo = player ? getMembershipBadge(player.membership, customMemberships) : null
                  return (
                  <div
                    key={unpaid.playerId}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selected.has(unpaid.playerId)}
                        onChange={() => toggleSelectOne(unpaid.playerId)}
                      />
                      <InitialAvatar
                        id={unpaid.playerId}
                        name={unpaid.playerName}
                        size={40}
                        photoUrl={unpaid.playerPhoto}
                        badges={badges}
                        customMemberships={customMemberships}
                        badgeInfo={badgeInfo}
                      />
                      <div>
                        <div className="font-medium">{unpaid.playerName}</div>
                        <div className="text-sm text-gray-600">
                          ${unpaid.expectedFee.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTogglePayment(unpaid.playerId, false, unpaid.expectedFee)}
                      disabled={updating[unpaid.playerId] || bulkUpdating}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {updating[unpaid.playerId] ? '처리 중...' : '납부 확인'}
                    </button>
                  </div>
                )})}
              </div>
            </>
          )}
        </div>

        {/* 푸터 - 고정 */}
        <div className="p-4 border-t bg-gray-50 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, subtitle, bgColor = 'bg-gray-50' }) {
  return (
    <div className={`${bgColor} rounded-xl p-6 transition-transform hover:scale-105`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg ${bgColor === 'bg-gray-50' ? 'bg-white' : 'bg-white/50'}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  )
}
