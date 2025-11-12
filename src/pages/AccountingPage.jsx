// src/pages/AccountingPage.jsx
import React, { useEffect, useState, useMemo } from 'react'
import Card from '../components/Card'
import { notify } from '../components/Toast'
import {
  listPayments,
  addPayment,
  deletePayment,
    updatePayment,
  getDuesSettings,
  updateDuesSetting,
  getAccountingSummary,
  getPlayerPaymentStats,
  getMatchPayments,
  confirmMatchPayment,
  cancelMatchPayment,
  ensureDuesDefaults,
  getDuesRenewals
} from '../lib/accounting'
import { isMember } from '../lib/fees'
import { DollarSign, Users, Calendar, TrendingUp, Plus, X, Check, AlertCircle, RefreshCw } from 'lucide-react'
import InitialAvatar from '../components/InitialAvatar'
import FinancialDashboard from '../components/FinancialDashboard'
import { getAccountingOverrides, updateAccountingOverrides } from '../lib/appSettings'
import { calculateMatchFees, calculatePlayerMatchFee } from '../lib/matchFeeCalculator'

export default function AccountingPage({ players = [], matches = [], upcomingMatches = [], isAdmin }) {
  const [payments, setPayments] = useState([])
  const [duesSettings, setDuesSettings] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedTab, setSelectedTab] = useState('overview') // overview, payments, dues, match-fees, renewals, player-stats
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [playerStats, setPlayerStats] = useState(null)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [showAdvancedDates, setShowAdvancedDates] = useState(false)
  const [feeOverrides, setFeeOverrides] = useState(() => getAccountingOverrides())
  const [savingOverrides, setSavingOverrides] = useState(false)

  const [renewals, setRenewals] = useState({})
  // 매치별 구장비 페이지네이션
  const [matchFeesPage, setMatchFeesPage] = useState(1)
  const matchFeesPerPage = 5

  // 신규 결제 폼
  const [newPayment, setNewPayment] = useState({
    playerId: '',
    paymentType: 'match_fee',
    amount: '',
    paymentMethod: 'venmo',
    paymentDate: new Date().toISOString().slice(0, 16),
    notes: ''
  })

  useEffect(() => {
    loadData()
  }, [dateRange])

  // 초기 override 로드 (클라이언트 설정에서)
  useEffect(() => {
    try {
      const o = getAccountingOverrides()
      setFeeOverrides(o)
    } catch {}
  }, [])

  async function loadData() {
    if (!isAdmin) return
    setLoading(true)
    setLoadError(false)
    try {
      // 회비 기본값 보장
      await ensureDuesDefaults()
      const [paymentsData, duesData, summaryData] = await Promise.all([
        listPayments({ 
          startDate: dateRange.start || undefined, 
          endDate: dateRange.end || undefined 
        }),
        getDuesSettings(),
        getAccountingSummary({ 
          startDate: dateRange.start || undefined, 
          endDate: dateRange.end || undefined 
        })
      ])
      setPayments(paymentsData)
      setDuesSettings(duesData)
      setSummary(summaryData)
      // 연회비/월회비 리뉴얼 정보
      const renewalData = await getDuesRenewals(players.filter(p => !p.isUnknown))
      setRenewals(renewalData)
    } catch (error) {
      console.error('Failed to load accounting data:', error)
      notify('데이터 로드 실패')
      setPayments([])
      setDuesSettings([])
      setSummary(null)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddPayment() {
    if (!newPayment.playerId || !newPayment.amount) {
      notify('선수와 금액을 입력해주세요')
      return
    }

    try {
      await addPayment({
        playerId: newPayment.playerId,
        paymentType: newPayment.paymentType,
        amount: parseFloat(newPayment.amount),
        paymentMethod: newPayment.paymentMethod,
        paymentDate: newPayment.paymentDate,
        notes: newPayment.notes
      })
      notify('결제 내역이 추가되었습니다 ✅')
      setShowAddPayment(false)
      setNewPayment({
        playerId: '',
        paymentType: 'match_fee',
        amount: '',
        paymentMethod: 'venmo',
        paymentDate: new Date().toISOString().slice(0, 16),
        notes: ''
      })
      loadData()
    } catch (error) {
      notify('결제 내역 추가 실패')
    }
  }

  async function handleDeletePayment(payment) {
    if (!window.confirm('이 결제 내역을 삭제하시겠습니까?')) return

    try {
      if (payment.payment_type === 'match_fee' && payment.match_id && payment.player_id) {
        // 매치 구장비 결제는 match_payments도 되돌림 처리
        await cancelMatchPayment(payment.match_id, payment.player_id)
      } else {
        await deletePayment(payment.id)
      }
      notify('삭제되었습니다')
      loadData()
    } catch (error) {
      notify('삭제 실패')
    }
  }

  async function handleUpdateDues(settingType, amount, description) {
    try {
      await updateDuesSetting(settingType, amount, description)
      notify('회비 설정이 업데이트되었습니다 ✅')
      loadData()
    } catch (error) {
      notify('회비 설정 업데이트 실패')
    }
  }

  async function loadPlayerStats(playerId) {
    try {
      const stats = await getPlayerPaymentStats(playerId)
      setPlayerStats(stats)
      setSelectedPlayer(playerId)
    } catch (error) {
      notify('선수 통계 로드 실패')
    }
  }

  const paymentTypeLabels = {
    registration: '가입비',
    monthly_dues: '월회비',
    annual_dues: '연회비',
    match_fee: '구장비',
    reimbursement: '상환'
  }

  const paymentMethodLabels = {
    venmo: 'Venmo',
    cash: '현금',
    zelle: 'Zelle',
    other: '기타'
  }

  // 회비 금액 매핑 (가입비/월/연)
  const duesMap = useMemo(() => {
    const map = {}
    duesSettings.forEach(d => {
      // 기존 스키마는 registration 또는 registration_fee 중 하나일 수 있음 방어적으로 처리
      const key = d.setting_type === 'registration_fee' ? 'registration' : d.setting_type
      map[key] = parseFloat(d.amount)
    })
    return map
  }, [duesSettings])

  function setThisMonthRange() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)
    const end = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10)
    setDateRange({ start, end })
  }

  function setThisYearRange() {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10)
    const end = new Date(now.getFullYear(), 11, 31).toISOString().slice(0,10)
    setDateRange({ start, end })
  }

  // 저장된 매치 정렬 (최신순)
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
  }, [matches])

  // 페이지네이션된 매치
  const paginatedMatches = useMemo(() => {
    const startIdx = (matchFeesPage - 1) * matchFeesPerPage
    return sortedMatches.slice(startIdx, startIdx + matchFeesPerPage)
  }, [sortedMatches, matchFeesPage])

  const totalMatchPages = Math.ceil(sortedMatches.length / matchFeesPerPage)

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
        <p className="text-gray-600">총무(Admin)만 접근 가능합니다.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">로딩 중...</p>
      </div>
    )
  }

  // 안전한 요약 객체 (비어있을 때 0으로 표시)
  const safeSummary = summary || {
    totalRevenue: 0,
    registrationFees: { total: 0, count: 0 },
    monthlyDues: { total: 0, count: 0 },
    annualDues: { total: 0, count: 0 },
    matchFees: { total: 0, count: 0 },
    reimbursements: { total: 0, count: 0 }
  }

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <Card>
        <div className="flex gap-2 border-b pb-4">
          <TabButton
            active={selectedTab === 'overview'}
            onClick={() => setSelectedTab('overview')}
            icon={<TrendingUp size={16} />}
          >
            개요
          </TabButton>
          <TabButton
            active={selectedTab === 'payments'}
            onClick={() => setSelectedTab('payments')}
            icon={<DollarSign size={16} />}
          >
            결제 내역
          </TabButton>
          <TabButton
            active={selectedTab === 'dues'}
            onClick={() => setSelectedTab('dues')}
            icon={<Users size={16} />}
          >
            회비 설정
          </TabButton>
          <TabButton
            active={selectedTab === 'match-fees'}
            onClick={() => setSelectedTab('match-fees')}
            icon={<Calendar size={16} />}
          >
            매치별 구장비
          </TabButton>
          <TabButton
            active={selectedTab === 'renewals'}
            onClick={() => setSelectedTab('renewals')}
            icon={<RefreshCw size={16} />}
          >
            리뉴얼
          </TabButton>
          <TabButton
            active={selectedTab === 'player-stats'}
            onClick={() => setSelectedTab('player-stats')}
            icon={<Users size={16} />}
          >
            선수별 납부
          </TabButton>
        </div>
      </Card>

      {/* 날짜 필터 & 년도 필터 */}
      <Card>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 mr-1">기간:</span>
            <button onClick={setThisMonthRange} className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200">이번 달</button>
            <button onClick={setThisYearRange} className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200">이번 해</button>
            <button onClick={()=>setDateRange({ start: '', end: '' })} className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200">전체</button>
            <button onClick={()=>setShowAdvancedDates(v=>!v)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">기간 지정</button>
          </div>
          {showAdvancedDates && (
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
              <span className="text-gray-500">~</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
            </div>
          )}
        </div>
      </Card>

      {/* 개요 탭 - 재정 대시보드 */}
      {selectedTab === 'overview' && (
        <>
          <FinancialDashboard
            summary={safeSummary}
            payments={payments}
            matches={matches}
            upcomingMatches={upcomingMatches}
            players={players}
            dateRange={dateRange}
            onRefresh={loadData}
          />
          {(loadError || (payments.length === 0 && duesSettings.length === 0)) && (
            <Card>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="font-semibold mb-1">아직 회계 데이터가 없습니다</div>
                <div className="text-sm text-gray-700">
                  {loadError ? (
                    <>Supabase에 회계 테이블이 없거나 권한 문제가 있을 수 있습니다. Supabase SQL Editor에서 <code>scripts/create-accounting-tables.sql</code>을 실행한 뒤 다시 시도하세요.</>
                  ) : (
                    <>회비 설정을 먼저 저장하거나, 결제 내역을 추가해보세요. 기본값: 가입비 $10 · 월회비 $5 · 연회비 $50</>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setSelectedTab('dues')} className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300">회비 설정으로 이동</button>
                  <button onClick={() => { setSelectedTab('payments'); setShowAddPayment(true); }} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">결제 추가</button>
                </div>
              </div>
            </Card>
          )}
        </>
  )}

      {/* 선수별 납부 현황 탭 */}
      {selectedTab === 'player-stats' && (
        <Card title="선수별 납부 현황">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {players.filter(p => !p.isUnknown).map(player => {
              // 선수별 통계 계산
              const playerPayments = payments.filter(p => p.player_id === player.id)
              const total = playerPayments.reduce((sum, p) => {
                if (p.payment_type === 'reimbursement') return sum - parseFloat(p.amount)
                return sum + parseFloat(p.amount)
              }, 0)
              
              const registrationPaid = playerPayments.some(p => p.payment_type === 'registration')
              const matchCount = playerPayments.filter(p => p.payment_type === 'match_fee').length
              
              return (
                <div
                  key={player.id}
                  className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200"
                  onClick={() => {
                    loadPlayerStats(player.id)
                    setSelectedPlayer(player.id)
                  }}
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <InitialAvatar 
                      id={player.id} 
                      name={player.name} 
                      size={48} 
                      photoUrl={player.photoUrl} 
                    />
                    <div className="w-full">
                      <div className="font-semibold text-sm truncate">{player.name}</div>
                      <div className="text-xs text-gray-500">{player.membership || 'Guest'}</div>
                    </div>
                    <div className="w-full pt-2 border-t border-gray-300">
                      <div className="text-lg font-bold text-emerald-600">
                        ${total.toFixed(0)}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                        {registrationPaid ? '✓' : '✗'} 가입비
                        {matchCount > 0 && ` · ${matchCount}경기`}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          
          {/* 선택된 선수 상세 정보 */}
          {selectedPlayer && playerStats && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">
                  {players.find(p => p.id === selectedPlayer)?.name} 상세 내역
                </h4>
                <button
                  onClick={() => {
                    setSelectedPlayer(null)
                    setPlayerStats(null)
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded">
                  <div className="text-xs text-gray-600">가입비</div>
                  <div className="font-semibold">
                    {playerStats.registration.paid ? `$${playerStats.registration.amount.toFixed(2)}` : '미납'}
                  </div>
                </div>
                <div className="bg-white p-3 rounded">
                  <div className="text-xs text-gray-600">월회비</div>
                  <div className="font-semibold">
                    ${playerStats.monthlyDues.totalPaid.toFixed(2)}
                    <span className="text-xs text-gray-500 ml-1">({playerStats.monthlyDues.count}회)</span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded">
                  <div className="text-xs text-gray-600">연회비</div>
                  <div className="font-semibold">
                    ${playerStats.annualDues.totalPaid.toFixed(2)}
                    <span className="text-xs text-gray-500 ml-1">({playerStats.annualDues.count}회)</span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded">
                  <div className="text-xs text-gray-600">구장비</div>
                  <div className="font-semibold">
                    ${playerStats.matchFees.totalPaid.toFixed(2)}
                    <span className="text-xs text-gray-500 ml-1">({playerStats.matchFees.count}회)</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 p-3 bg-white rounded">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">총 납부액</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ${playerStats.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 결제 내역 탭 */}
      {selectedTab === 'payments' && (
        <Card
          title="결제 내역"
          right={
            <button
              onClick={() => setShowAddPayment(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus size={16} />
              결제 추가
            </button>
          }
        >
          {showAddPayment && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">새 결제 추가</h3>
                <button onClick={() => setShowAddPayment(false)}>
                  <X size={20} className="text-gray-500 hover:text-gray-700" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">선수</label>
                  <select
                    value={newPayment.playerId}
                    onChange={(e) => setNewPayment({ ...newPayment, playerId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">선택...</option>
                    {players.filter(p => !p.isUnknown).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">결제 유형</label>
                  <select
                    value={newPayment.paymentType}
                    onChange={(e) => setNewPayment({ ...newPayment, paymentType: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {Object.entries(paymentTypeLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">금액 ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">결제 방법</label>
                  <select
                    value={newPayment.paymentMethod}
                    onChange={(e) => setNewPayment({ ...newPayment, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {Object.entries(paymentMethodLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">결제 날짜</label>
                  <input
                    type="datetime-local"
                    value={newPayment.paymentDate}
                    onChange={(e) => setNewPayment({ ...newPayment, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">메모</label>
                  <input
                    type="text"
                    value={newPayment.notes}
                    onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="선택사항"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleAddPayment}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  추가
                </button>
                <button
                  onClick={() => setShowAddPayment(false)}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">날짜</th>
                  <th className="text-left py-3 px-4">선수</th>
                  <th className="text-left py-3 px-4">유형</th>
                  <th className="text-left py-3 px-4">금액</th>
                  <th className="text-left py-3 px-4">방법</th>
                  <th className="text-left py-3 px-4">메모</th>
                  <th className="text-right py-3 px-4">작업</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => {
                  const player = players.find(p => p.id === payment.player_id) || players.find(p => p.id === payment.players?.id)
                  return (
                  <tr key={payment.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm">
                      {new Date(payment.payment_date).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <InitialAvatar id={player?.id} name={player?.name||'Unknown'} size={24} photoUrl={player?.photoUrl} />
                        <span>{player?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        payment.payment_type === 'registration' ? 'bg-blue-100 text-blue-800' :
                        payment.payment_type === 'match_fee' ? 'bg-orange-100 text-orange-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {paymentTypeLabels[payment.payment_type]}
                      </span>
                    </td>
                    <td className={`py-3 px-4 font-semibold ${payment.payment_type === 'reimbursement' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {payment.payment_type === 'reimbursement' ? '-' : ''}${parseFloat(payment.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <select
                        value={payment.payment_method}
                        onChange={async (e) => {
                          try {
                            await updatePayment(payment.id, { payment_method: e.target.value })
                            notify('결제 방법이 업데이트되었습니다 ✅')
                            loadData()
                          } catch (err) {
                            notify('결제 방법 업데이트 실패')
                          }
                        }}
                        className="px-2 py-1 border rounded"
                      >
                        {Object.entries(paymentMethodLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {payment.notes || '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeletePayment(payment)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 회비 설정 탭 */}
      {selectedTab === 'dues' && (
        <Card title="회비 설정">
          <div className="space-y-4">
            {duesSettings.map(setting => (
              <DuesSettingRow
                key={setting.id}
                setting={setting}
                onUpdate={handleUpdateDues}
                label={paymentTypeLabels[setting.setting_type]}
              />
            ))}
            {/* 구장비 계산 오버라이드 */}
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-lg">구장비 계산 오버라이드</div>
                  <div className="text-sm text-gray-700">매치에 저장된 값 대신, 아래 설정을 우선 적용합니다.</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <div>
                  <label className="block text-sm font-medium mb-1">멤버 구장비 (1인)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={feeOverrides.memberFeeOverride ?? ''}
                    onChange={(e) => setFeeOverrides(prev => ({ ...prev, memberFeeOverride: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="비우면 미적용"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">게스트 할증</label>
                  <input
                    type="number"
                    step="0.5"
                    value={feeOverrides.guestSurchargeOverride ?? ''}
                    onChange={(e) => setFeeOverrides(prev => ({ ...prev, guestSurchargeOverride: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="비우면 기본값 사용"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">매치 전체 구장비 (총액)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={feeOverrides.venueTotalOverride ?? ''}
                    onChange={(e) => setFeeOverrides(prev => ({ ...prev, venueTotalOverride: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="비우면 미적용"
                  />
                </div>
              </div>
              <div className="text-xs text-gray-600 mt-2">
                우선순위: 전체 구장비(총액) → 멤버 구장비 + 게스트 할증 → 매치 저장값. 계산은 0.5 단위로 반올림합니다.
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    setSavingOverrides(true)
                    try {
                      await updateAccountingOverrides(feeOverrides)
                      notify('구장비 오버라이드가 저장되었습니다 ✅')
                    } catch (e) {
                      notify('저장 실패')
                    } finally {
                      setSavingOverrides(false)
                    }
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  disabled={savingOverrides}
                >
                  {savingOverrides ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={() => setFeeOverrides({ memberFeeOverride: null, guestSurchargeOverride: null, venueTotalOverride: null })}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 매치별 구장비 탭 */}
      {selectedTab === 'match-fees' && (
        <Card title="저장된 매치 구장비 납부 현황">
          <div className="space-y-6">
            {paginatedMatches.map(match => (
              <MatchFeesSection
                key={match.id}
                match={match}
                players={players}
              />
            ))}
            {sortedMatches.length === 0 && (
              <p className="text-center text-gray-500 py-8">저장된 매치가 없습니다.</p>
            )}
            {totalMatchPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setMatchFeesPage(p => Math.max(1, p - 1))}
                  disabled={matchFeesPage === 1}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  이전
                </button>
                <span className="px-4 py-2 text-sm text-gray-700">
                  {matchFeesPage} / {totalMatchPages}
                </span>
                <button
                  onClick={() => setMatchFeesPage(p => Math.min(totalMatchPages, p + 1))}
                  disabled={matchFeesPage === totalMatchPages}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {selectedTab === 'renewals' && (
        <Card title="회비 리뉴얼 & 미납 현황">
          <div className="space-y-6">
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-2 px-2">선수</th>
                    <th className="text-center py-2 px-2">납부 방식</th>
                    <th className="text-left py-2 px-2">최근 납부일</th>
                    <th className="text-left py-2 px-2">다음 납부 예정일</th>
                    <th className="text-center py-2 px-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {players.filter(p=>!p.isUnknown).map(p => {
                    const r = renewals[p.id] || {}
                    const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '-'
                    
                    // 월회비 vs 연회비 판단
                    const hasMonthly = r.lastMonthly && (!r.lastAnnual || new Date(r.lastMonthly) > new Date(r.lastAnnual))
                    const hasAnnual = r.lastAnnual && (!r.lastMonthly || new Date(r.lastAnnual) > new Date(r.lastMonthly))
                    
                    let paymentMode = '미정'
                    let lastPaid = '-'
                    let nextDue = '-'
                    let isOverdue = false
                    let missedMonths = []
                    
                    if (hasMonthly) {
                      paymentMode = '월회비'
                      lastPaid = fmt(r.lastMonthly)
                      nextDue = fmt(r.nextMonthly)
                      isOverdue = r.nextMonthly && new Date(r.nextMonthly) < new Date()

                      // 최근 6개월 동안 미납한 월 목록 계산 (현재 월은 제외)
                      const window = []
                      const now = new Date()
                      for (let i=1; i<=6; i++) {
                        const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
                        window.push({ y: d.getFullYear(), m: d.getMonth()+1 })
                      }
                      const paidMonths = new Set(
                        payments
                          .filter(pay => pay.player_id === p.id && pay.payment_type === 'monthly_dues')
                          .map(pay => {
                            const d = new Date(pay.payment_date)
                            return `${d.getFullYear()}-${d.getMonth()+1}`
                          })
                      )
                      missedMonths = window
                        .filter(({y,m}) => !paidMonths.has(`${y}-${m}`))
                        .map(({m}) => `${m}월`)
                    } else if (hasAnnual) {
                      paymentMode = '연회비'
                      lastPaid = fmt(r.lastAnnual)
                      nextDue = fmt(r.nextAnnual)
                      isOverdue = r.nextAnnual && new Date(r.nextAnnual) < new Date()
                    }
                    
                    const warnSoon = !isOverdue && (
                      (r.nextMonthly && new Date(r.nextMonthly) < new Date(Date.now() + 5*24*60*60*1000)) ||
                      (r.nextAnnual && new Date(r.nextAnnual) < new Date(Date.now() + 10*24*60*60*1000))
                    )
                    
                    return (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <InitialAvatar id={p.id} name={p.name} size={24} photoUrl={p.photoUrl} />
                            <span className="font-medium">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            paymentMode === '월회비' ? 'bg-purple-100 text-purple-700' :
                            paymentMode === '연회비' ? 'bg-indigo-100 text-indigo-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {paymentMode}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-gray-700">{lastPaid}</td>
                        <td className={`py-2 px-2 ${
                          isOverdue ? 'text-red-600 font-semibold' :
                          warnSoon ? 'text-amber-600 font-semibold' :
                          'text-gray-700'
                        }`}>
                          {nextDue}
                          {isOverdue && <span className="ml-1 text-xs">(연체)</span>}
                          {warnSoon && <span className="ml-1 text-xs">(임박)</span>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            {isOverdue ? (
                              <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-medium">미납</span>
                            ) : warnSoon ? (
                              <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">주의</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-medium">정상</span>
                            )}
                            {paymentMode === '월회비' && missedMonths.length > 0 && (
                              <span className="text-[11px] text-red-600">미납: {missedMonths.join(', ')}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* 미납자 목록 */}
            <div className="grid md:grid-cols-2 gap-4">
              <UnpaidList title="월회비 미납" players={players} renewals={renewals} mode="monthly" />
              <UnpaidList title="연회비 미납" players={players} renewals={renewals} mode="annual" />
            </div>
            <div className="text-xs text-gray-500">
              * 각 선수의 최근 납부 이력을 기준으로 월회비/연회비 방식을 자동 판단합니다.<br/>
              * 월회비는 다음 달까지, 연회비는 1년 뒤까지를 다음 납부일로 계산합니다.
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function StatCard({ icon, label, value, subtitle, bgColor = 'bg-gray-50' }) {
  return (
    <div className={`${bgColor} rounded-xl p-6`}>
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

function DuesSettingRow({ setting, onUpdate, label }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(setting.amount)
  const [description, setDescription] = useState(setting.description || '')

  function handleSave() {
    onUpdate(setting.setting_type, parseFloat(amount), description)
    setEditing(false)
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-semibold text-lg">{label}</div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 px-3 py-1.5 border rounded-lg"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg"
                placeholder="설명"
              />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                ${parseFloat(setting.amount).toFixed(2)}
              </div>
              {setting.description && (
                <div className="text-sm text-gray-600 mt-1">{setting.description}</div>
              )}
            </>
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setAmount(setting.amount)
                  setDescription(setting.description || '')
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
            >
              수정
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MatchFeesSection({ match, players }) {
  const [matchPayments, setMatchPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showReimbursement, setShowReimbursement] = useState(false)

  useEffect(() => {
    loadMatchPayments()
  }, [match.id])

  async function loadMatchPayments() {
    try {
      const data = await getMatchPayments(match.id)
      setMatchPayments(data)
    } catch (error) {
      console.error('Failed to load match payments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmPayment(playerId, amount) {
    try {
      await confirmMatchPayment(match.id, playerId, amount, 'venmo')
      notify('납부 확인되었습니다 ✅')
      loadMatchPayments()
    } catch (error) {
      notify('납부 확인 실패')
    }
  }

  async function handleCancelPayment(playerId) {
    if (!window.confirm('납부 확인을 취소하시겠습니까?')) return
    
    try {
      await cancelMatchPayment(match.id, playerId)
      notify('납부 확인이 취소되었습니다')
      loadMatchPayments()
    } catch (error) {
      notify('취소 실패')
    }
  }

  async function handleReimbursement(playerId, amount) {
    if (!window.confirm('이 선수에게 상환 처리하시겠습니까?')) return
    
    try {
      await addPayment({
        playerId,
        paymentType: 'reimbursement',
        amount,
        paymentMethod: 'venmo',
        paymentDate: new Date().toISOString(),
        notes: `${match.location?.name || '매치'} 구장비 대신 결제`
      })
      notify('상환 처리되었습니다 ✅')
      setShowReimbursement(false)
    } catch (error) {
      notify('상환 처리 실패')
    }
  }

  const matchDate = new Date(match.dateISO).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })

  // 통합된 구장비 계산 로직 사용
  const { memberFee, guestFee, participantIds } = calculateMatchFees(match, players)

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="font-semibold">{matchDate}</div>
          <div className="text-xs text-gray-600">
            {match.location?.name || '장소 미정'} · {participantIds.length}명 · 
            멤버 ${memberFee.toFixed(2)} / 게스트 ${guestFee.toFixed(2)}
          </div>
          {match.paidBy && (
            <div className="text-xs text-blue-600 mt-1">
              💳 {players.find(p => p.id === match.paidBy)?.name || 'Unknown'}님이 대신 결제
            </div>
          )}
        </div>
        <div className="text-right flex items-center gap-3">
          <div>
            <div className="text-xs text-gray-600">납부율</div>
            <div className="text-lg font-bold text-emerald-600">
              {matchPayments.filter(p => p.payment_status === 'paid').length} / {participantIds.length}
            </div>
          </div>
          {match.paidBy && (
            <button
              onClick={() => {
                const totalCost = match.totalCost || (participantIds.length * memberFee)
                handleReimbursement(match.paidBy, totalCost)
              }}
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              상환
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm">로딩 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-600">
                <th className="text-left py-2 px-2">선수</th>
                <th className="text-left py-2 px-2">구분</th>
                <th className="text-right py-2 px-2">금액</th>
                <th className="text-center py-2 px-2">상태</th>
                <th className="text-right py-2 px-2">작업</th>
              </tr>
            </thead>
            <tbody>
              {participantIds.map(playerId => {
                const player = players.find(p => p.id === playerId)
                const payment = matchPayments.find(p => p.player_id === playerId)
                const isPaid = payment?.payment_status === 'paid'
                const expected = calculatePlayerMatchFee(match, player, players)

                return (
                  <tr
                    key={playerId}
                    className={`border-b last:border-b-0 ${isPaid ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <InitialAvatar id={player?.id} name={player?.name||'?'} size={24} photoUrl={player?.photoUrl} />
                        <span className="font-medium">{player?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        isMember(player?.membership) 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {isMember(player?.membership) ? '멤버' : '게스트'}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-semibold">
                      ${expected.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {isPaid ? (
                        <div className="flex items-center justify-center gap-1 text-emerald-600">
                          <Check size={14} />
                          <span className="text-xs">완료</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">미납</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {isPaid ? (
                        <button
                          onClick={() => handleCancelPayment(playerId)}
                          className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200"
                        >
                          취소
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConfirmPayment(playerId, expected)}
                          className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        >
                          확인
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UnpaidList({ title, players, renewals, mode }) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const list = players.filter(p => {
    if (p.isUnknown) return false
    const r = renewals[p.id] || {}
    if (mode === 'monthly') {
      if (!r.lastMonthly) return true
      return new Date(r.lastMonthly) < startOfMonth // 이번 달 결제 없음
    } else {
      if (!r.lastAnnual) return true
      return new Date(r.lastAnnual) < oneYearAgo
    }
  })
  return (
    <Card title={title}>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">미납자가 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {list.map(p => (
            <li key={p.id} className="flex items-center gap-2 p-2 rounded bg-gray-50">
              <InitialAvatar id={p.id} name={p.name} size={24} photoUrl={p.photoUrl} />
              <span className="font-medium text-sm">{p.name}</span>
              <span className="text-xs text-gray-500 ml-auto">{mode==='monthly'?'이번 달 미납':'1년 경과'}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
