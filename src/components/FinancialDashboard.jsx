// src/components/FinancialDashboard.jsx
import React, { useMemo, useState } from 'react'
import Card from './Card'
import SimplePieChart from './charts/SimplePieChart'
import SimpleBarChart from './charts/SimpleBarChart'
import InitialAvatar from './InitialAvatar'
import { AlertCircle, TrendingUp, TrendingDown, Users, DollarSign, AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { confirmMatchPayment, cancelMatchPayment } from '../lib/accounting'
import { notify } from './Toast'
import { calculatePlayerMatchFee } from '../lib/matchFeeCalculator'

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
  // 수입 구성 파이 차트 데이터
  const revenueBreakdown = useMemo(() => {
    const data = []
    if (summary.registrationFees?.total > 0) {
      data.push({
        label: '가입비',
        value: summary.registrationFees.total,
        color: '#3B82F6' // blue
      })
    }
    if (summary.monthlyDues?.total > 0) {
      data.push({
        label: '월회비',
        value: summary.monthlyDues.total,
        color: '#8B5CF6' // purple
      })
    }
    if (summary.annualDues?.total > 0) {
      data.push({
        label: '연회비',
        value: summary.annualDues.total,
        color: '#6366F1' // indigo
      })
    }
    if (summary.matchFees?.total > 0) {
      data.push({
        label: '구장비',
        value: summary.matchFees.total,
        color: '#F59E0B' // orange
      })
    }
    return data
  }, [summary])

  // 상환 내역
  const reimbursements = useMemo(() => {
    return payments
      .filter(p => p.payment_type === 'reimbursement')
      .map(p => {
        const player = players.find(pl => pl.id === p.player_id || pl.id === p.players?.id)
        return {
          ...p,
          playerName: player?.name || 'Unknown'
        }
      })
      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
  }, [payments, players])

  // 구장비 미납자 (저장된 매치 기준) - 매치별로 그룹화
  const unpaidMatchFees = useMemo(() => {
    const matchGroups = []
    
    matches.forEach(match => {
      const participantIds = match.attendeeIds || match.participantIds || 
        (Array.isArray(match.snapshot) ? match.snapshot.flat() : []) || []
      
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
      
      if (unpaidInMatch.length > 0) {
        matchGroups.push({
          matchId: match.id,
          matchDate: match.dateISO,
          matchLocation: match.location?.name || '장소 미정',
          unpaidPlayers: unpaidInMatch,
          totalUnpaid: unpaidInMatch.reduce((sum, u) => sum + u.expectedFee, 0)
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
      if (p.payment_type === 'reimbursement') return // 상환 제외
      const paymentDate = new Date(p.payment_date)
      const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`
      const month = months.find(m => m.key === monthKey)
      if (month) {
        month.value += parseFloat(p.amount)
      }
    })
    
    return months
  }, [payments])

  // 순수익 계산 (수입 - 상환)
  // summary.totalRevenue 이미 reimbursements를 차감한 순수익(현재 회계 로직)
  const netRevenue = summary.totalRevenue || 0
  const totalReimbursements = summary.reimbursements?.total || 0
  // 총 수입(상환 제외한 양의 결제 합) = 순수익 + 상환액
  const grossRevenue = netRevenue + totalReimbursements
  
  // 미납 인원수와 금액
  const totalUnpaidCount = unpaidMatchFees.reduce((sum, m) => sum + m.unpaidPlayers.length, 0)
  const totalUnpaidAmount = unpaidMatchFees.reduce((sum, m) => sum + m.totalUnpaid, 0)

  return (
    <div className="space-y-6">
      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<DollarSign className="text-emerald-600" size={24} />}
          label="총 수입(상환 제외)"
          value={`$${grossRevenue.toFixed(2)}`}
          bgColor="bg-emerald-50"
        />
        <MetricCard
          icon={<TrendingDown className="text-red-600" size={24} />}
          label="상환 (지출)"
          value={`-$${totalReimbursements.toFixed(2)}`}
          subtitle={`${summary.reimbursements?.count || 0}건`}
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
        {/* 수입 구성 파이 차트 */}
        <Card title="수입 구성">
          {revenueBreakdown.length > 0 ? (
            <div className="flex justify-center py-4">
              <SimplePieChart data={revenueBreakdown} size={220} />
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
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-orange-600">
                      ${matchGroup.totalUnpaid.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">{matchGroup.unpaidPlayers.length}명 미납</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {matchGroup.unpaidPlayers.map((unpaid, pidx) => (
                    <div 
                      key={pidx}
                      className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-md border border-orange-200"
                    >
                      <InitialAvatar 
                        id={unpaid.playerId} 
                        name={unpaid.playerName} 
                        size={20} 
                        photoUrl={unpaid.playerPhoto} 
                      />
                      <span className="text-xs font-medium">{unpaid.playerName}</span>
                      <span className="text-xs text-orange-600 font-semibold">
                        ${unpaid.expectedFee.toFixed(1)}
                      </span>
                    </div>
                  ))}
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
          onClose={() => setSelectedMatch(null)}
          onRefresh={onRefresh}
        />
      )}

      {/* 상환 내역 */}
      {reimbursements.length > 0 && (
        <Card 
          title={`상환 내역 (${reimbursements.length}건)`}
          icon={<TrendingDown className="text-red-500" size={20} />}
        >
          <div className="space-y-2">
            {reimbursements.slice(0, 5).map((reimb, idx) => {
              const player = players.find(p => p.id === reimb.player_id)
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
                >
                  <div className="flex items-center gap-3">
                    <InitialAvatar 
                      id={player?.id} 
                      name={reimb.playerName} 
                      size={32} 
                      photoUrl={player?.photoUrl} 
                    />
                    <div>
                      <div className="font-medium">{reimb.playerName}</div>
                      <div className="text-xs text-gray-600">
                        {new Date(reimb.payment_date).toLocaleDateString('ko-KR')}
                        {reimb.notes && ` · ${reimb.notes}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600">
                      -${parseFloat(reimb.amount).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">상환</div>
                  </div>
                </div>
              )
            })}
            {reimbursements.length > 5 && (
              <p className="text-center text-sm text-gray-500 pt-2">
                외 {reimbursements.length - 5}건 더 있습니다
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
function UnpaidMatchModal({ match, players, onClose, onRefresh }) {
  const [updating, setUpdating] = useState({})

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
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
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
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

          <div className="space-y-2">
            {match.unpaidPlayers.map((unpaid) => (
              <div
                key={unpaid.playerId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <InitialAvatar
                    id={unpaid.playerId}
                    name={unpaid.playerName}
                    size={40}
                    photoUrl={unpaid.playerPhoto}
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
                  disabled={updating[unpaid.playerId]}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {updating[unpaid.playerId] ? '처리 중...' : '납부 확인'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t bg-gray-50">
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
