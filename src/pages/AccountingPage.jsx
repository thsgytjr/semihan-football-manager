// src/pages/AccountingPage.jsx
import React, { useEffect, useState, useMemo } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
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
import { DollarSign, Users, Calendar, TrendingUp, Plus, X, Check, AlertCircle, RefreshCw, Trash2, ArrowUpDown, Download } from 'lucide-react'
import InitialAvatar from '../components/InitialAvatar'
import FinancialDashboard from '../components/FinancialDashboard'
import { listMatchesFromDB } from '../services/matches.service'
import { getAccountingOverrides, updateAccountingOverrides } from '../lib/appSettings'
import { calculateMatchFees, calculatePlayerMatchFee } from '../lib/matchFeeCalculator'
import * as XLSX from 'xlsx'

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
  const [confirmState, setConfirmState] = useState({ open: false, kind: null, payload: null })

  const [renewals, setRenewals] = useState({})
  const [matchesLocal, setMatchesLocal] = useState(matches)
  const [allPayments, setAllPayments] = useState([])
  // 매치별 구장비 페이지네이션
  const [matchFeesPage, setMatchFeesPage] = useState(1)
  const matchFeesPerPage = 5

  // Bulk delete state for payments
  const [selectedPayments, setSelectedPayments] = useState(new Set())
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)

  // 정렬 상태
  const [sortConfig, setSortConfig] = useState({ key: 'payment_date', direction: 'desc' })
  
  // 선수별 납부 정렬 상태
  const [playerStatsSortConfig, setPlayerStatsSortConfig] = useState({ key: 'total', direction: 'desc' })

  // 신규 결제 폼
  // 로컬 시간 기준으로 datetime-local 기본값 생성
  const nowLocal = new Date()
  const pad2 = (n) => String(n).padStart(2, '0')
  const defaultLocalDateTime = `${nowLocal.getFullYear()}-${pad2(nowLocal.getMonth()+1)}-${pad2(nowLocal.getDate())}T${pad2(nowLocal.getHours())}:${pad2(nowLocal.getMinutes())}`

  const [newPayment, setNewPayment] = useState({
    playerId: '',
    selectedPlayerIds: [],
    paymentType: 'other_income',
    amount: '',
    paymentMethod: 'venmo',
    paymentDate: defaultLocalDateTime,
    additionalDates: [], // 여러 날짜 추가
    notes: '',
    customPayee: ''
  })
  const [playerSearch, setPlayerSearch] = useState('')
  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase()
    const list = players.filter(p => !p.isUnknown).sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return list.slice(0, 50)
    return list.filter(p => p.name.toLowerCase().includes(q)).slice(0, 50)
  }, [playerSearch, players])

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

  // 외부에서 matches prop 변경 시 로컬에도 반영
  useEffect(() => {
    setMatchesLocal(matches)
  }, [matches])

  async function loadData() {
    if (!isAdmin) return
    setLoading(true)
    setLoadError(false)
    try {
      // 회비 기본값 보장
      await ensureDuesDefaults()
      const [paymentsData, duesData, summaryData, allPaymentsData] = await Promise.all([
        listPayments({ 
          startDate: dateRange.start || undefined, 
          endDate: dateRange.end || undefined 
        }),
        getDuesSettings(),
        getAccountingSummary({ 
          startDate: dateRange.start || undefined, 
          endDate: dateRange.end || undefined 
        }),
        listPayments({})
      ])
      setPayments(paymentsData)
      setDuesSettings(duesData)
      setSummary(summaryData)
      setAllPayments(allPaymentsData)
      // 매치 데이터도 최신 상태로 동기화
      try {
        const latest = await listMatchesFromDB()
        setMatchesLocal(latest)
      } catch {}
      // 연회비/월회비 리뉴얼 정보
      const renewalData = await getDuesRenewals(players.filter(p => !p.isUnknown))
      setRenewals(renewalData)
    } catch (error) {
      console.error('Failed to load accounting data:', error)
      notify('데이터 로드 실패')
      setPayments([])
      setDuesSettings([])
      setSummary(null)
      setAllPayments([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddPayment() {
    const isDonationLike = newPayment.paymentType === 'other_income' || newPayment.paymentType === 'expense'
    if ((!isDonationLike && !newPayment.playerId) || !newPayment.amount) {
      notify(isDonationLike ? '금액을 입력해주세요' : '선수와 금액을 입력해주세요')
      return
    }
    const dateList = [newPayment.paymentDate, ...(newPayment.additionalDates||[])].filter(Boolean)
    if (dateList.length === 0) {
      notify('최소 1개 이상의 날짜를 입력해주세요')
      return
    }
    try {
      const playerIds = isDonationLike ? [null] : ((newPayment.selectedPlayerIds&&newPayment.selectedPlayerIds.length>0) ? newPayment.selectedPlayerIds : (newPayment.playerId ? [newPayment.playerId] : []))
      if (!isDonationLike && playerIds.length === 0) {
        notify('선수를 선택해주세요')
        return
      }
      const tasks = []
      for (const pid of playerIds) {
        for (const dt of dateList) {
          const paymentData = {
            playerId: isDonationLike ? null : pid,
            paymentType: newPayment.paymentType,
            amount: parseFloat(newPayment.amount),
            paymentMethod: newPayment.paymentMethod,
            paymentDate: dt,
            notes: newPayment.notes
          }
          if (isDonationLike && newPayment.customPayee) {
            paymentData.notes = `[payee: ${newPayment.customPayee}]${paymentData.notes ? ' ' + paymentData.notes : ''}`
          }
          tasks.push(addPayment(paymentData))
        }
      }
      const results = await Promise.allSettled(tasks)
      const ok = results.filter(r=>r.status==='fulfilled').length
      const fail = results.length - ok
      if (ok>0) notify(`${ok}건 결제가 추가되었습니다 ✅`)
      if (fail>0) notify(`${fail}건 실패`)    
      if (ok>0) {
        setShowAddPayment(false)
        const now2 = new Date()
        const def2 = `${now2.getFullYear()}-${pad2(now2.getMonth()+1)}-${pad2(now2.getDate())}T${pad2(now2.getHours())}:${pad2(now2.getMinutes())}`
        setNewPayment({
          playerId: '',
          selectedPlayerIds: [],
          paymentType: 'other_income',
            amount: '',
            paymentMethod: 'venmo',
            paymentDate: def2,
            additionalDates: [],
            notes: '',
            customPayee: ''
        })
        loadData()
      }
    } catch (e) {
      notify('결제 내역 추가 실패')
    }
  }

  async function handleDeletePayment(payment) {
    // Open confirm dialog; actual deletion handled in onConfirm
    setConfirmState({ open: true, kind: 'delete-payment', payload: { payment } })
  }

  async function handleBulkDeletePayments() {
    if (selectedPayments.size === 0) {
      notify('삭제할 결제 내역을 선택해주세요')
      return
    }
    // Open confirm; actual deletion in onConfirm
    setConfirmState({ open: true, kind: 'bulk-delete', payload: { ids: Array.from(selectedPayments) } })
  }

  function toggleSelectPayment(paymentId) {
    setSelectedPayments(prev => {
      const next = new Set(prev)
      if (next.has(paymentId)) {
        next.delete(paymentId)
      } else {
        next.add(paymentId)
      }
      return next
    })
  }

  function toggleSelectAllPayments() {
    if (selectedPayments.size === payments.length) {
      setSelectedPayments(new Set())
    } else {
      setSelectedPayments(new Set(payments.map(p => p.id)))
    }
  }

  // 정렬 핸들러
  function handleSort(key) {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // 정렬된 결제 내역
  const sortedPayments = useMemo(() => {
    if (!sortConfig.key) return payments

    const sorted = [...payments].sort((a, b) => {
      let aVal, bVal

      switch (sortConfig.key) {
        case 'payment_date':
          aVal = new Date(a.payment_date).getTime()
          bVal = new Date(b.payment_date).getTime()
          break
        case 'player_name':
          const playerA = players.find(p => p.id === a.player_id)
          const playerB = players.find(p => p.id === b.player_id)
          aVal = playerA?.name || ''
          bVal = playerB?.name || ''
          break
        case 'payment_type':
          aVal = a.payment_type || ''
          bVal = b.payment_type || ''
          break
        case 'amount':
          aVal = parseFloat(a.amount) || 0
          bVal = parseFloat(b.amount) || 0
          break
        case 'payment_method':
          aVal = a.payment_method || ''
          bVal = b.payment_method || ''
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [payments, sortConfig, players])

  // Excel 내보내기
  function exportToExcel() {
    const excelData = sortedPayments.map(payment => {
      const player = players.find(p => p.id === payment.player_id)
      const isDonationLike = payment.payment_type === 'other_income' || payment.payment_type === 'expense'
      
      let customPayee = null
      let displayNotes = payment.notes || ''
      if (isDonationLike && displayNotes) {
        const match = displayNotes.match(/^\[payee: ([^\]]+)\]/)
        if (match) {
          customPayee = match[1]
          displayNotes = displayNotes.replace(match[0], '').trim()
        }
      }

      return {
        '날짜': new Date(payment.payment_date).toLocaleDateString('ko-KR'),
        '선수/대상': isDonationLike ? (customPayee || '미지정') : (player?.name || 'Unknown'),
        '유형': paymentTypeLabels[payment.payment_type] || payment.payment_type,
        '금액': `$${parseFloat(payment.amount).toFixed(2)}`,
        '방법': paymentMethodLabels[payment.payment_method] || payment.payment_method,
        '메모': displayNotes
      }
    })

    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '결제 내역')
    
    const fileName = `결제내역_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace(/\./g, '')}.xlsx`
    XLSX.writeFile(wb, fileName)
    notify('Excel 파일이 다운로드되었습니다 ✅')
  }

  // 선수별 납부 정렬 핸들러
  function handlePlayerStatsSort(key) {
    setPlayerStatsSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // 정렬된 선수 목록
  const sortedPlayerStats = useMemo(() => {
    const playerData = players
      .filter(p => !p.isUnknown)
      .map(player => {
        const playerPayments = payments.filter(p => p.player_id === player.id)
        const registration = playerPayments.find(p => p.payment_type === 'registration')
        const monthlySum = playerPayments.filter(p => p.payment_type === 'monthly_dues').reduce((s, p) => s + parseFloat(p.amount), 0)
        const annualSum = playerPayments.filter(p => p.payment_type === 'annual_dues').reduce((s, p) => s + parseFloat(p.amount), 0)
        const matchSum = playerPayments.filter(p => p.payment_type === 'match_fee').reduce((s, p) => s + parseFloat(p.amount), 0)
        const total = playerPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
        const monthlyCount = playerPayments.filter(p => p.payment_type === 'monthly_dues').length
        const annualCount = playerPayments.filter(p => p.payment_type === 'annual_dues').length
        const matchCount = playerPayments.filter(p => p.payment_type === 'match_fee').length

        return {
          player,
          registration,
          registrationAmount: registration ? parseFloat(registration.amount) : 0,
          monthlySum,
          monthlyCount,
          annualSum,
          annualCount,
          matchSum,
          matchCount,
          total
        }
      })

    return playerData.sort((a, b) => {
      let aVal, bVal

      switch (playerStatsSortConfig.key) {
        case 'name':
          aVal = a.player.name
          bVal = b.player.name
          break
        case 'membership':
          aVal = a.player.membership || 'Guest'
          bVal = b.player.membership || 'Guest'
          break
        case 'registration':
          aVal = a.registrationAmount
          bVal = b.registrationAmount
          break
        case 'monthly':
          aVal = a.monthlySum
          bVal = b.monthlySum
          break
        case 'annual':
          aVal = a.annualSum
          bVal = b.annualSum
          break
        case 'match':
          aVal = a.matchSum
          bVal = b.matchSum
          break
        case 'total':
          aVal = a.total
          bVal = b.total
          break
        default:
          return 0
      }

      if (typeof aVal === 'string') {
        return playerStatsSortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal)
      }

      if (aVal < bVal) return playerStatsSortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return playerStatsSortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [players, payments, playerStatsSortConfig])

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
    other_income: '기타 수입',
    expense: '기타 지출',
    reimbursement: '상환',
    registration_fee: '가입비'
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
    const source = Array.isArray(matchesLocal) && matchesLocal.length > 0 ? matchesLocal : matches
    return [...(source || [])].sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
  }, [matchesLocal, matches])

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
    otherIncome: { total: 0, count: 0 },
    expenses: { total: 0, count: 0 }
  }

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <Card>
        <div className="flex flex-wrap gap-2 border-b pb-4">
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
            matches={matchesLocal}
            upcomingMatches={upcomingMatches}
            players={players}
            dateRange={dateRange}
            onRefresh={async () => {
              await loadData()
              try {
                const latest = await listMatchesFromDB()
                setMatchesLocal(latest)
              } catch {}
            }}
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
          {/* 리스트 뷰 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4">
                    <button
                      onClick={() => handlePlayerStatsSort('name')}
                      className="flex items-center gap-1 hover:text-blue-600 font-semibold"
                    >
                      선수
                      <ArrowUpDown size={14} className={playerStatsSortConfig.key === 'name' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-left py-3 px-4">
                    <button
                      onClick={() => handlePlayerStatsSort('membership')}
                      className="flex items-center gap-1 hover:text-blue-600 font-semibold"
                    >
                      멤버십
                      <ArrowUpDown size={14} className={playerStatsSortConfig.key === 'membership' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-3 px-4">
                    <button
                      onClick={() => handlePlayerStatsSort('registration')}
                      className="flex items-center justify-end gap-1 hover:text-blue-600 font-semibold"
                    >
                      가입비
                      <ArrowUpDown size={14} className={playerStatsSortConfig.key === 'registration' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-3 px-4">
                    <button
                      onClick={() => handlePlayerStatsSort('monthly')}
                      className="flex items-center justify-end gap-1 hover:text-blue-600 font-semibold"
                    >
                      월회비
                      <ArrowUpDown size={14} className={playerStatsSortConfig.key === 'monthly' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-3 px-4">
                    <button
                      onClick={() => handlePlayerStatsSort('annual')}
                      className="flex items-center justify-end gap-1 hover:text-blue-600 font-semibold"
                    >
                      연회비
                      <ArrowUpDown size={14} className={playerStatsSortConfig.key === 'annual' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-3 px-4">
                    <button
                      onClick={() => handlePlayerStatsSort('match')}
                      className="flex items-center justify-end gap-1 hover:text-blue-600 font-semibold"
                    >
                      구장비
                      <ArrowUpDown size={14} className={playerStatsSortConfig.key === 'match' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-3 px-4">
                    <button
                      onClick={() => handlePlayerStatsSort('total')}
                      className="flex items-center justify-end gap-1 hover:text-blue-600 font-semibold"
                    >
                      총 납부
                      <ArrowUpDown size={14} className={playerStatsSortConfig.key === 'total' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayerStats.map(({ player, registration, registrationAmount, monthlySum, monthlyCount, annualSum, annualCount, matchSum, matchCount, total }) => {
                  // 멤버십 배지 설정
                  const badges = []
                  const membership = player.membership?.trim()
                  
                  if (!membership || membership === 'Guest' || membership === 'guest' || membership === '게스트') {
                    badges.push('G')
                  } else if (membership === '준회원') {
                    badges.push('준')
                  }
                  
                  return (
                  <tr key={player.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <InitialAvatar 
                          id={player.id} 
                          name={player.name} 
                          size={32} 
                          photoUrl={player.photoUrl}
                          badges={badges}
                        />
                        <span className="font-medium">{player.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">{player.membership || 'Guest'}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {registration ? (
                        <span className="text-emerald-600 font-semibold">${parseFloat(registration.amount).toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {monthlySum > 0 ? (
                        <div>
                          <span className="font-semibold">${monthlySum.toFixed(2)}</span>
                          <span className="text-xs text-gray-500 ml-1">({monthlyCount}회)</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {annualSum > 0 ? (
                        <div>
                          <span className="font-semibold">${annualSum.toFixed(2)}</span>
                          <span className="text-xs text-gray-500 ml-1">({annualCount}회)</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {matchSum > 0 ? (
                        <div>
                          <span className="font-semibold">${matchSum.toFixed(2)}</span>
                          <span className="text-xs text-gray-500 ml-1">({matchCount}회)</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-lg font-bold text-emerald-600">${total.toFixed(2)}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedTab('payments')
                          setShowAddPayment(true)
                          setNewPayment(prev => ({ ...prev, playerId: '', selectedPlayerIds: [player.id] }))
                        }}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        결제 추가
                      </button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                onClick={exportToExcel}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm whitespace-nowrap"
                disabled={payments.length === 0}
              >
                <Download size={16} />
                <span className="hidden sm:inline">Excel 내보내기</span>
                <span className="sm:hidden">Excel</span>
              </button>
              <button
                onClick={() => setShowAddPayment(true)}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm whitespace-nowrap"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">결제 추가</span>
                <span className="sm:hidden">추가</span>
              </button>
            </div>
          }
        >
          {showAddPayment && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">새 결제 추가</h3>
                <button onClick={() => setShowAddPayment(false)}>
                  <X size={20} className="text-gray-500 hover:text-gray-700" />
                </button>
              </div>
              
              {/* 상단: 결제 유형, 금액, 방법 - 한 줄로 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">결제 유형</label>
                  <select
                    value={newPayment.paymentType}
                    onChange={(e) => {
                      const newType = e.target.value
                      const updates = { paymentType: newType }
                      if (newType === 'registration' || newType === 'monthly_dues' || newType === 'annual_dues') {
                        const fixedAmount = duesMap[newType]
                        if (fixedAmount) {
                          updates.amount = String(fixedAmount)
                        }
                      }
                      setNewPayment({ ...newPayment, ...updates })
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {Object.entries(paymentTypeLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">금액 ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="0.00"
                    readOnly={['registration', 'monthly_dues', 'annual_dues'].includes(newPayment.paymentType) && duesMap[newPayment.paymentType]}
                    title={['registration', 'monthly_dues', 'annual_dues'].includes(newPayment.paymentType) ? '회비 설정에서 고정된 금액' : ''}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">결제 방법</label>
                  <select
                    value={newPayment.paymentMethod}
                    onChange={(e) => setNewPayment({ ...newPayment, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {Object.entries(paymentMethodLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 중간: 선수 선택 or 대상/용도 + 메모 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {['other_income','expense'].includes(newPayment.paymentType) ? '대상/용도 (선택)' : '선수'}
                  </label>
                  {['other_income','expense'].includes(newPayment.paymentType) ? (
                    <input
                      type="text"
                      value={newPayment.customPayee}
                      onChange={(e) => setNewPayment({ ...newPayment, customPayee: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="예: 공 구입, 홍길동 후원"
                    />
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={playerSearch}
                        onChange={(e)=> setPlayerSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && filteredPlayers.length === 1) {
                            e.preventDefault()
                            const player = filteredPlayers[0]
                            setNewPayment(prev => {
                              const list = new Set(prev.selectedPlayerIds||[])
                              if (!list.has(player.id)) list.add(player.id)
                              return { ...prev, selectedPlayerIds: Array.from(list), playerId: '' }
                            })
                            // 한글 조합 완료를 위해 약간의 지연 후 클리어
                            setTimeout(() => setPlayerSearch(''), 0)
                          }
                        }}
                        placeholder="이름 검색... (1명일 때 Enter로 추가)"
                        className="w-full px-2 py-1.5 border rounded text-xs"
                      />
                      <div className="max-h-32 overflow-y-auto border rounded bg-white divide-y text-xs">
                        {filteredPlayers.length === 0 && (
                          <div className="px-2 py-1.5 text-gray-500">검색 결과 없음</div>
                        )}
                        {filteredPlayers.map(p => {
                          const selected = (newPayment.selectedPlayerIds||[]).includes(p.id)
                          return (
                            <button
                              type="button"
                              key={p.id}
                              onClick={() => setNewPayment(prev => {
                                const list = new Set(prev.selectedPlayerIds||[])
                                if (list.has(p.id)) list.delete(p.id); else list.add(p.id)
                                return { ...prev, selectedPlayerIds: Array.from(list), playerId: '' }
                              })}
                              className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-blue-50 ${selected ? 'bg-blue-100' : ''}`}
                            >
                              <InitialAvatar id={p.id} name={p.name} size={20} photoUrl={p.photoUrl} />
                              <span className="flex-1 truncate text-xs">{p.name}</span>
                              {selected && <span className="text-[10px] text-blue-600 font-medium">✓</span>}
                            </button>
                          )
                        })}
                      </div>
                      {(newPayment.selectedPlayerIds||[]).length > 0 && (
                        <div className="text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-blue-600 font-medium">선택: {newPayment.selectedPlayerIds.length}명</span>
                            <button
                              type="button"
                              onClick={() => setNewPayment(prev => ({ ...prev, selectedPlayerIds: [] }))}
                              className="text-[10px] text-gray-600 hover:text-gray-800 underline"
                            >전체 해제</button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {newPayment.selectedPlayerIds.map(pid => {
                              const pl = players.find(pp => pp.id === pid)
                              if (!pl) return null
                              return (
                                <div key={pid} className="inline-flex items-center gap-0.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[11px]">
                                  <InitialAvatar id={pl.id} name={pl.name} size={14} photoUrl={pl.photoUrl} />
                                  <span className="text-gray-800">{pl.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setNewPayment(prev => ({ ...prev, selectedPlayerIds: (prev.selectedPlayerIds||[]).filter(id => id !== pid) }))}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">메모 (선택)</label>
                  <input
                    type="text"
                    value={newPayment.notes}
                    onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="선택사항"
                  />
                </div>
              </div>

              {/* 하단: 날짜(들) */}
              <div className="mb-3">
                <label className="block text-xs font-medium mb-1 flex items-center justify-between">
                  <span>결제 날짜</span>
                  <button
                    type="button"
                    onClick={() => setNewPayment(prev => ({ ...prev, additionalDates: [...(prev.additionalDates||[]), prev.paymentDate ] }))}
                    className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                  >현재 날짜 복제</button>
                </label>
                <div className="space-y-1.5">
                  <input
                    type="datetime-local"
                    value={newPayment.paymentDate}
                    onChange={(e) => setNewPayment({ ...newPayment, paymentDate: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm"
                  />
                  {(newPayment.additionalDates||[]).map((dt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={dt}
                        onChange={(e) => {
                          const copy = [...newPayment.additionalDates]
                          copy[idx] = e.target.value
                          setNewPayment(prev => ({ ...prev, additionalDates: copy }))
                        }}
                        className="flex-1 px-3 py-1.5 border rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const copy = newPayment.additionalDates.filter((_,i)=> i!==idx)
                          setNewPayment(prev => ({ ...prev, additionalDates: copy }))
                        }}
                        className="p-1.5 rounded bg-gray-200 hover:bg-gray-300"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewPayment(prev => ({ ...prev, additionalDates: [...(prev.additionalDates||[]), defaultLocalDateTime] }))}
                    className="w-full py-1.5 text-[11px] border border-dashed rounded hover:bg-gray-50"
                  >+ 추가 날짜</button>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleAddPayment}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
                >
                  추가
                </button>
                <button
                  onClick={() => setShowAddPayment(false)}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* Bulk delete toolbar */}
          {selectedPayments.size > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedPayments.size === payments.length}
                  onChange={toggleSelectAllPayments}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">
                  {selectedPayments.size}개 선택됨
                </span>
              </div>
              <button
                onClick={handleBulkDeletePayments}
                disabled={isDeletingBulk}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {isDeletingBulk ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    삭제 중...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    선택 항목 삭제
                  </>
                )}
              </button>
            </div>
          )}

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle px-2 sm:px-0">
              <table className="min-w-full w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-1 sm:py-3 sm:px-4 w-6 sm:w-12">
                    <input
                      type="checkbox"
                      checked={payments.length > 0 && selectedPayments.size === payments.length}
                      onChange={toggleSelectAllPayments}
                      className="w-3 h-3 sm:w-4 sm:h-4"
                    />
                  </th>
                  <th className="text-left py-2 px-1 sm:py-3 sm:px-2">
                    <button
                      onClick={() => handleSort('payment_date')}
                      className="flex items-center gap-0.5 hover:text-blue-600 font-semibold text-[9px] sm:text-sm"
                    >
                      <span className="hidden sm:inline">날짜</span>
                      <span className="sm:hidden">날짜</span>
                      <ArrowUpDown size={10} className={`sm:w-3.5 sm:h-3.5 ${sortConfig.key === 'payment_date' ? 'text-blue-600' : 'text-gray-400'}`} />
                    </button>
                  </th>
                  <th className="text-left py-2 px-1 sm:py-3 sm:px-2">
                    <button
                      onClick={() => handleSort('player_name')}
                      className="flex items-center gap-0.5 hover:text-blue-600 font-semibold text-[9px] sm:text-sm"
                    >
                      <span className="hidden sm:inline">선수</span>
                      <span className="sm:hidden">이름</span>
                      <ArrowUpDown size={10} className={`sm:w-3.5 sm:h-3.5 ${sortConfig.key === 'player_name' ? 'text-blue-600' : 'text-gray-400'}`} />
                    </button>
                  </th>
                  <th className="text-left py-2 px-1 sm:py-3 sm:px-2">
                    <button
                      onClick={() => handleSort('payment_type')}
                      className="flex items-center gap-0.5 hover:text-blue-600 font-semibold text-[9px] sm:text-sm"
                    >
                      유형
                      <ArrowUpDown size={10} className={`sm:w-3.5 sm:h-3.5 ${sortConfig.key === 'payment_type' ? 'text-blue-600' : 'text-gray-400'}`} />
                    </button>
                  </th>
                  <th className="text-left py-2 px-1 sm:py-3 sm:px-2">
                    <button
                      onClick={() => handleSort('amount')}
                      className="flex items-center gap-0.5 hover:text-blue-600 font-semibold text-[9px] sm:text-sm"
                    >
                      금액
                      <ArrowUpDown size={10} className={`sm:w-3.5 sm:h-3.5 ${sortConfig.key === 'amount' ? 'text-blue-600' : 'text-gray-400'}`} />
                    </button>
                  </th>
                  <th className="text-left py-2 px-1 sm:py-3 sm:px-2 hidden md:table-cell">
                    <button
                      onClick={() => handleSort('payment_method')}
                      className="flex items-center gap-1 hover:text-blue-600 font-semibold text-sm"
                    >
                      방법
                      <ArrowUpDown size={14} className={sortConfig.key === 'payment_method' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-left py-3 px-2 hidden lg:table-cell">메모</th>
                  <th className="text-right py-2 px-1 sm:py-3 sm:px-2 w-6 sm:w-auto">
                    <span className="text-[9px] sm:text-sm font-semibold hidden sm:inline">작업</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPayments.map(payment => {
                  const player = players.find(p => p.id === payment.player_id) || players.find(p => p.id === payment.players?.id)
                  const isDonationLike = payment.payment_type === 'other_income' || payment.payment_type === 'expense'
                  
                  // Extract custom payee from notes if present
                  let customPayee = null
                  let displayNotes = payment.notes || ''
                  if (isDonationLike && displayNotes) {
                    const match = displayNotes.match(/^\[payee: ([^\]]+)\]/)
                    if (match) {
                      customPayee = match[1]
                      displayNotes = displayNotes.replace(match[0], '').trim()
                    }
                  }
                  
                  return (
                  <tr key={payment.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-1 sm:py-3 sm:px-4">
                      <input
                        type="checkbox"
                        checked={selectedPayments.has(payment.id)}
                        onChange={() => toggleSelectPayment(payment.id)}
                        className="w-3 h-3 sm:w-4 sm:h-4"
                      />
                    </td>
                    <td className="py-2 px-1 sm:py-3 sm:px-2 text-[9px] sm:text-sm">
                      <div className="hidden sm:block">{new Date(payment.payment_date).toLocaleDateString('ko-KR')}</div>
                      <div className="sm:hidden">{new Date(payment.payment_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</div>
                    </td>
                    <td className="py-2 px-1 sm:py-3 sm:px-2">
                      {isDonationLike ? (
                        <div className="text-[9px] sm:text-sm text-gray-700 truncate max-w-[60px] sm:max-w-none">{customPayee || '미지정'}</div>
                      ) : (
                        <div className="flex items-center gap-0.5 sm:gap-2">
                          <div className="hidden sm:block">
                            <InitialAvatar id={player?.id} name={player?.name||'Unknown'} size={20} photoUrl={player?.photoUrl} />
                          </div>
                          <span className="text-[9px] sm:text-sm truncate max-w-[60px] sm:max-w-none">{player?.name || 'Unknown'}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-1 sm:py-3 sm:px-2">
                      <span className={`px-1 sm:px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-xs font-medium whitespace-nowrap ${
                        payment.payment_type === 'registration' ? 'bg-blue-100 text-blue-700' :
                        payment.payment_type === 'monthly_dues' ? 'bg-purple-100 text-purple-700' :
                        payment.payment_type === 'annual_dues' ? 'bg-indigo-100 text-indigo-700' :
                        payment.payment_type === 'match_fee' ? 'bg-orange-100 text-orange-700' :
                        payment.payment_type === 'other_income' ? 'bg-emerald-100 text-emerald-700' :
                        payment.payment_type === 'expense' ? 'bg-red-100 text-red-700' :
                        payment.payment_type === 'reimbursement' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        <span className="hidden sm:inline">{paymentTypeLabels[payment.payment_type] || payment.payment_type}</span>
                        <span className="sm:hidden">
                          {payment.payment_type === 'registration' ? '가입' :
                           payment.payment_type === 'monthly_dues' ? '월' :
                           payment.payment_type === 'annual_dues' ? '연' :
                           payment.payment_type === 'match_fee' ? '구장' :
                           payment.payment_type === 'other_income' ? '수입' :
                           payment.payment_type === 'expense' ? '지출' :
                           payment.payment_type === 'reimbursement' ? '상환' : '기타'}
                        </span>
                      </span>
                    </td>
                    <td className={`py-2 px-1 sm:py-3 sm:px-2 font-semibold text-[9px] sm:text-sm whitespace-nowrap ${payment.payment_type === 'expense' ? 'text-red-600' : 'text-emerald-600'}`}>
                      <span className="hidden sm:inline">{payment.payment_type === 'expense' ? '-' : ''}${parseFloat(payment.amount).toFixed(2)}</span>
                      <span className="sm:hidden">{payment.payment_type === 'expense' ? '-' : ''}${Math.round(parseFloat(payment.amount))}</span>
                    </td>
                    <td className="py-3 px-2 sm:px-4 text-sm hidden md:table-cell">
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
                        className="px-2 py-1 border rounded text-xs"
                      >
                        {Object.entries(paymentMethodLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-2 text-xs text-gray-600 hidden lg:table-cell max-w-xs truncate">
                      {displayNotes || '-'}
                    </td>
                    <td className="py-2 px-1 sm:py-3 sm:px-2 text-right">
                      <button
                        onClick={() => handleDeletePayment(payment)}
                        className="text-red-500 hover:text-red-700 p-0.5"
                      >
                        <X size={14} className="sm:w-4 sm:h-4" />
                      </button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            </div>
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
                    <th className="text-center py-2 px-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {players.filter(p=>!p.isUnknown).map(p => {
                    const r = renewals[p.id] || {}
                    const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'
                    
                    // 월회비 vs 연회비 판단
                    const hasMonthly = r.lastMonthly && (!r.lastAnnual || new Date(r.lastMonthly) > new Date(r.lastAnnual))
                    const hasAnnual = r.lastAnnual && (!r.lastMonthly || new Date(r.lastAnnual) > new Date(r.lastMonthly))
                    
                    let paymentMode = '미정'
                    let lastPaid = '-'
                    let nextDue = '-'
                    let isOverdue = false
                    let missedMonths = []
                    
                    const paymentsForRenewals = allPayments?.length ? allPayments : payments

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
                        paymentsForRenewals
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
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => {
                              setSelectedTab('payments')
                              setShowAddPayment(true)
                              setNewPayment(prev => ({ 
                                ...prev, 
                                playerId: '',
                                selectedPlayerIds: [p.id],
                                paymentType: paymentMode === '월회비' ? 'monthly_dues' : paymentMode === '연회비' ? 'annual_dues' : 'monthly_dues'
                              }))
                            }}
                            className={`px-2 py-1 text-xs rounded ${
                              isOverdue ? 'bg-red-500 text-white hover:bg-red-600' :
                              warnSoon ? 'bg-amber-500 text-white hover:bg-amber-600' :
                              'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                          >
                            {isOverdue ? '미납 처리' : '결제 입력'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-500">
              * 각 선수의 최근 납부 이력을 기준으로 월회비/연회비 방식을 자동 판단합니다.<br/>
              * 월회비는 다음 달까지, 연회비는 1년 뒤까지를 다음 납부일로 계산합니다.
            </div>
          </div>
        </Card>
      )}

      {/* Confirm dialogs for destructive actions in Payments tab */}
      <ConfirmDialog
        open={confirmState.open && confirmState.kind === 'delete-payment'}
        title="결제 내역 삭제"
        message="이 결제 내역을 삭제하시겠습니까?"
        confirmLabel="삭제하기"
        cancelLabel="취소"
        tone="danger"
        onCancel={() => setConfirmState({ open: false, kind: null, payload: null })}
        onConfirm={async () => {
          const payment = confirmState.payload?.payment
          if (!payment) { setConfirmState({ open: false, kind: null, payload: null }); return }
          try {
            if (payment.payment_type === 'match_fee' && payment.match_id && payment.player_id) {
              await cancelMatchPayment(payment.match_id, payment.player_id)
            } else {
              await deletePayment(payment.id)
            }
            notify('삭제되었습니다')
            loadData()
          } catch (error) {
            notify('삭제 실패')
          } finally {
            setConfirmState({ open: false, kind: null, payload: null })
          }
        }}
      />
      <ConfirmDialog
        open={confirmState.open && confirmState.kind === 'bulk-delete'}
        title="일괄 삭제"
        message={`선택한 ${confirmState.payload?.ids?.length || 0}개의 결제 내역을 삭제하시겠습니까?`}
        confirmLabel="삭제하기"
        cancelLabel="취소"
        tone="danger"
        onCancel={() => setConfirmState({ open: false, kind: null, payload: null })}
        onConfirm={async () => {
          const ids = confirmState.payload?.ids || []
          setIsDeletingBulk(true)
          try {
            const deletePromises = ids.map(paymentId => {
              const payment = payments.find(p => p.id === paymentId)
              if (!payment) return Promise.resolve()
              if (payment.payment_type === 'match_fee' && payment.match_id && payment.player_id) {
                return cancelMatchPayment(payment.match_id, payment.player_id)
              } else {
                return deletePayment(paymentId)
              }
            })
            const results = await Promise.allSettled(deletePromises)
            const successCount = results.filter(r => r.status === 'fulfilled').length
            const failCount = results.filter(r => r.status === 'rejected').length
            if (failCount === 0) notify(`${successCount}개의 결제 내역이 삭제되었습니다 ✅`)
            else notify(`${successCount}개 삭제 성공, ${failCount}개 실패`)
            setSelectedPayments(new Set())
            loadData()
          } catch (error) {
            notify('일괄 삭제 실패')
          } finally {
            setIsDeletingBulk(false)
            setConfirmState({ open: false, kind: null, payload: null })
          }
        }}
      />
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
  const [confirmState, setConfirmState] = useState({ open: false, kind: null, payload: null })

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
    setConfirmState({ open: true, kind: 'cancel-payment', payload: { playerId } })
  }

  async function handleReimbursement(playerId, amount) {
    setConfirmState({ open: true, kind: 'reimburse', payload: { playerId, amount } })
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
          <ConfirmDialog
            open={confirmState.open}
            title={confirmState.kind === 'cancel-payment' ? '납부 확인 취소' : '상환 처리'}
            message={confirmState.kind === 'cancel-payment' 
              ? '납부 확인을 취소하시겠습니까?'
              : '이 선수에게 상환 처리하시겠습니까?'}
            confirmLabel={confirmState.kind === 'cancel-payment' ? '취소하기' : '상환 처리'}
            cancelLabel="닫기"
            tone="danger"
            onCancel={() => setConfirmState({ open: false, kind: null, payload: null })}
            onConfirm={async () => {
              try {
                if (confirmState.kind === 'cancel-payment') {
                  await cancelMatchPayment(match.id, confirmState.payload.playerId)
                  notify('납부 확인이 취소되었습니다')
                  loadMatchPayments()
                } else if (confirmState.kind === 'reimburse') {
                  await addPayment({
                    playerId: confirmState.payload.playerId,
                    paymentType: 'reimbursement',
                    amount: confirmState.payload.amount,
                    paymentMethod: 'venmo',
                    paymentDate: new Date().toISOString(),
                    notes: `${match.location?.name || '매치'} 구장비 대신 결제`
                  })
                  notify('상환 처리되었습니다 ✅')
                  setShowReimbursement(false)
                }
              } catch (error) {
                notify(confirmState.kind === 'cancel-payment' ? '취소 실패' : '상환 처리 실패')
              } finally {
                setConfirmState({ open: false, kind: null, payload: null })
              }
            }}
          />
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
