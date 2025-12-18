// src/pages/AccountingPage.jsx
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import Card from '../components/Card'
import { notify } from '../components/Toast'
import FinancialDashboard from '../components/FinancialDashboard'
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
  hardDeleteMatchPayment,
  ensureDuesDefaults,
  getDuesRenewals
} from '../lib/accounting'
import { updateMatchInDB } from '../services/matches.service'
import { isMember } from '../lib/fees'
import { DollarSign, Users, Calendar, TrendingUp, Plus, X, Check, AlertCircle, RefreshCw, Trash2, ArrowUpDown, Download, Search, ChevronDown, ChevronUp } from 'lucide-react'
import InitialAvatar from '../components/InitialAvatar'
import { initializeGapi, signIn, signOut, isSignedIn, getCurrentUser, onAuthChange, extractSpreadsheetId, loadSheetData, saveSheetData, getSpreadsheetInfo, isGapiInitialized } from '../services/googleSheets'
import { listMatchesFromDB, deleteMatchFromDB } from '../services/matches.service'
import { getAccountingOverrides, updateAccountingOverrides, getAppSettings, saveAppSettingsToServer } from '../lib/appSettings'
import { calculateMatchFees, calculatePlayerMatchFee } from '../lib/matchFeeCalculator'
import * as XLSX from 'xlsx'

const DISPLAY_MISSED_MONTH_LIMIT = 12
const DEFAULT_MONTH_HISTORY = 18
const MAX_MONTH_HISTORY = 60
const YEAR_FILTER_STORAGE_KEY = 'sfm:accounting:selectedYear'

const diffInMonths = (later, earlier) => {
  if (!later || !earlier) return 0
  return (later.getFullYear() - earlier.getFullYear()) * 12 + (later.getMonth() - earlier.getMonth())
}

const normalizeRenewalResetMap = (raw = {}) => {
  if (!raw || typeof raw !== 'object') return {}
  const result = {}
  Object.entries(raw).forEach(([playerId, value]) => {
    if (!value) return
    if (typeof value === 'string') {
      result[playerId] = { monthly: value, annual: value }
      return
    }
    if (typeof value === 'object') {
      const entry = {}
      if (typeof value.monthly === 'string') entry.monthly = value.monthly
      if (typeof value.annual === 'string') entry.annual = value.annual
      if (Object.keys(entry).length > 0) {
        result[playerId] = entry
      }
    }
  })
  return result
}

const cleanupRenewalResetMap = (raw = {}) => {
  const next = {}
  Object.entries(raw || {}).forEach(([playerId, value]) => {
    if (!value) return
    const entry = {}
    if (typeof value.monthly === 'string') entry.monthly = value.monthly
    if (typeof value.annual === 'string') entry.annual = value.annual
    if (Object.keys(entry).length > 0) {
      next[playerId] = entry
    }
  })
  return next
}

const readStoredYearFilter = () => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(YEAR_FILTER_STORAGE_KEY)
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

const persistYearFilter = (year) => {
  if (typeof window === 'undefined') return
  if (year === null || typeof year === 'undefined') {
    window.localStorage.removeItem(YEAR_FILTER_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(YEAR_FILTER_STORAGE_KEY, String(year))
}

const paymentMethodLabels = {
  venmo: 'Venmo',
  cash: '현금',
  zelle: 'Zelle',
  other: '기타'
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
})

const formatCurrency = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return currencyFormatter.format(0)
  return currencyFormatter.format(numeric)
}

const PAYMENT_FLOW_LABELS = {
  income: '수입',
  expense: '지출'
}

const PAYMENT_FLOW_BADGES = {
  income: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  expense: 'bg-rose-50 text-rose-700 border border-rose-200'
}

const PAYMENT_TYPE_META = {
  registration: { label: '가입비', flow: 'income' },
  monthly_dues: { label: '월회비', flow: 'income' },
  annual_dues: { label: '연회비', flow: 'income' },
  match_fee: { label: '구장비 수입', flow: 'income' },
  other_income: { label: '기타 수입', flow: 'income' },
  expense: { label: '기타 지출', flow: 'expense' },
  reimbursement: { label: '상환', flow: 'expense' },
  registration_fee: { label: '가입비', flow: 'income' },
  facility_expense: { label: '구장비 지출', flow: 'expense' }
}

const PAYMENT_TYPE_ALIASES = {
  facility_expense: 'expense'
}

const resolvePaymentTypeAlias = (type) => PAYMENT_TYPE_ALIASES[type] || type

const PAYMENT_TYPE_SELECT_GROUPS = [
  {
    label: '수입',
    options: [
      { value: 'registration', label: '가입비 (수입)' },
      { value: 'monthly_dues', label: '월회비 (수입)' },
      { value: 'annual_dues', label: '연회비 (수입)' },
      { value: 'match_fee', label: '구장비 수입' },
      { value: 'other_income', label: '기타 수입' }
    ]
  },
  {
    label: '지출',
    options: [
      { value: 'facility_expense', label: '구장비 지출' },
      { value: 'expense', label: '기타 지출' },
      { value: 'reimbursement', label: '상환 (환급)' }
    ]
  }
]

export default function AccountingPage({ players = [], matches = [], upcomingMatches = [], isAdmin }) {

  const [payments, setPayments] = useState([])
  const [duesSettings, setDuesSettings] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedTab, setSelectedTab] = useState('overview') // overview, payments, dues, match-fees, renewals, player-stats, spreadsheet
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('')
  const [showSpreadsheetSettings, setShowSpreadsheetSettings] = useState(false)
  const [loadingSpreadsheet, setLoadingSpreadsheet] = useState(true)
  const [googleUser, setGoogleUser] = useState(null)
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false)
  const [sheetData, setSheetData] = useState([])
  const [sheetInfo, setSheetInfo] = useState(null)
  const [loadingSheet, setLoadingSheet] = useState(false)
  const [showExpenseHistory, setShowExpenseHistory] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [playerStats, setPlayerStats] = useState(null)
  const [selectedYear, setSelectedYear] = useState(() => readStoredYearFilter())
  const [dateRange, setDateRange] = useState(() => {
    const storedYear = readStoredYearFilter()
    return storedYear
      ? { start: `${storedYear}-01-01`, end: `${storedYear}-12-31` }
      : { start: '', end: '' }
  })
  const [showAdvancedDates, setShowAdvancedDates] = useState(false)
  const [feeOverrides, setFeeOverrides] = useState(() => getAccountingOverrides())
  const [savingOverrides, setSavingOverrides] = useState(false)
  const [confirmState, setConfirmState] = useState({ open: false, kind: null, payload: null })
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerStatsSearch, setPlayerStatsSearch] = useState('')

  const [renewals, setRenewals] = useState({})
  const [matchesLocal, setMatchesLocal] = useState(matches)
  const [allPayments, setAllPayments] = useState([])
  // 매치별 구장비 페이지네이션
  const [matchFeesPage, setMatchFeesPage] = useState(1)
  const [matchFeesPerPage, setMatchFeesPerPage] = useState(5)
  const [showVoidMatches, setShowVoidMatches] = useState(false)

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
  const resolvedPaymentType = resolvePaymentTypeAlias(newPayment.paymentType)
  const selectedPaymentTypeMeta = PAYMENT_TYPE_META[newPayment.paymentType] || PAYMENT_TYPE_META[resolvedPaymentType]
  const [renewalSearch, setRenewalSearch] = useState('')
  const [renewalFilter, setRenewalFilter] = useState('all')
  const [renewalShowDetails, setRenewalShowDetails] = useState(true)
  const [renewalPrefs, setRenewalPrefs] = useState(() => (feeOverrides?.renewalPreferences || {}))
  const [renewalSaving, setRenewalSaving] = useState({})
  const [renewalResets, setRenewalResets] = useState(() => normalizeRenewalResetMap(feeOverrides?.renewalResets || {}))
  const [manualResetSaving, setManualResetSaving] = useState({})
  const initialLoadDoneRef = React.useRef(false)

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase()
    const list = players.filter(p => !p.isSystemAccount).sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return list.slice(0, 50)
    return list.filter(p => p.name.toLowerCase().includes(q)).slice(0, 50)
  }, [playerSearch, players])

  const yearOptions = useMemo(() => {
    const years = new Set()
    ;(allPayments || []).forEach(pay => {
      const rawDate = pay.payment_date || pay.paymentDate
      if (!rawDate) return
      const year = new Date(rawDate).getFullYear()
      if (Number.isFinite(year)) years.add(year)
    })
    if (selectedYear && Number.isFinite(selectedYear)) years.add(selectedYear)
    years.add(new Date().getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }, [allPayments, selectedYear])

  const currentYearIndex = selectedYear !== null ? yearOptions.indexOf(selectedYear) : -1
  const prevYear = currentYearIndex >= 0 && currentYearIndex < yearOptions.length - 1
    ? yearOptions[currentYearIndex + 1]
    : null
  const nextYear = currentYearIndex > 0
    ? yearOptions[currentYearIndex - 1]
    : null

  const renewalEligiblePlayers = useMemo(() => {
    return players.filter(p => !p.isSystemAccount && isMember(p.membership))
  }, [players])

  const paymentsForRenewals = useMemo(() => (allPayments?.length ? allPayments : payments), [allPayments, payments])

  const duesAmountMap = useMemo(() => {
    const map = { monthly: '', annual: '', registration: '' }
    duesSettings.forEach(setting => {
      if (setting.setting_type === 'monthly_dues') map.monthly = setting.amount
      if (setting.setting_type === 'annual_dues') map.annual = setting.amount
      if (setting.setting_type === 'registration_fee') map.registration = setting.amount
    })
    return map
  }, [duesSettings])

  const fallbackHouseAccount = useMemo(() => {
    return players.find(p => p.isSystemAccount) || null
  }, [players])
  const fallbackHouseAccountId = fallbackHouseAccount?.id || null
  const hasSystemAccount = Boolean(fallbackHouseAccountId)

  const monthlyPaymentBucketsByPlayer = useMemo(() => {
    const map = new Map()
    paymentsForRenewals.forEach(pay => {
      if (pay.payment_type !== 'monthly_dues' || !pay.player_id || !pay.payment_date) return
      const dt = new Date(pay.payment_date)
      const bucket = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(pay.player_id)) map.set(pay.player_id, new Set())
      map.get(pay.player_id).add(bucket)
    })
    return map
  }, [paymentsForRenewals])

  const findLatestPaymentByType = useCallback((playerId, paymentType) => {
    if (!playerId || !paymentType) return null
    return paymentsForRenewals
      .filter(pay => pay.player_id === playerId && pay.payment_type === paymentType)
      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))[0] || null
  }, [paymentsForRenewals])

  const renewalEntries = useMemo(() => {
    const now = new Date()
    const DAY_MS = 24 * 60 * 60 * 1000
    const monthlyDueAmount = parseFloat(duesAmountMap.monthly || '') || 0

    const describeStatus = (status, billingType, daysUntilDue) => {
      if (status === 'overdue') return '즉시 리뉴얼 필요'
      if (status === 'due-soon') {
        if (daysUntilDue === null) return '곧 만료 예정'
        return `${Math.max(daysUntilDue, 0)}일 내 만료`
      }
      if (status === 'no-plan') return '납부 방식 미설정'
      return billingType === 'monthly' ? '이번 달 정상' : billingType === 'annual' ? '올해 정상' : '정상'
    }

    const formatDate = (iso, withYear = false) => {
      if (!iso) return '기록 없음'
      const date = new Date(iso)
      return date.toLocaleDateString('ko-KR', {
        year: withYear ? 'numeric' : undefined,
        month: 'short',
        day: 'numeric'
      })
    }

    return renewalEligiblePlayers.map(player => {
      const r = renewals[player.id] || {}
      const preference = renewalPrefs[player.id]?.billingType || 'auto'
      const manualResetEntry = renewalResets[player.id]

      const monthlyInfo = {
        lastPaid: r.lastMonthly ? new Date(r.lastMonthly) : null,
        nextDue: r.nextMonthly ? new Date(r.nextMonthly) : null,
        hasData: Boolean(r.lastMonthly || r.nextMonthly)
      }
      const annualInfo = {
        lastPaid: r.lastAnnual ? new Date(r.lastAnnual) : null,
        nextDue: r.nextAnnual ? new Date(r.nextAnnual) : null,
        hasData: Boolean(r.lastAnnual || r.nextAnnual)
      }

      const derivedType = monthlyInfo.hasData ? 'monthly' : annualInfo.hasData ? 'annual' : 'unknown'
      const billingType = preference !== 'auto' ? preference : derivedType
      const warnWindow = billingType === 'annual' ? 30 : 7
      const manualResetIso = typeof manualResetEntry === 'string'
        ? manualResetEntry
        : manualResetEntry?.[billingType] || manualResetEntry?.monthly || manualResetEntry?.annual || null
      const manualResetAt = manualResetIso ? new Date(manualResetIso) : null
      const manualResetValid = manualResetAt?.getTime && !Number.isNaN(manualResetAt.getTime())
      const manualResetKey = manualResetValid
        ? `${manualResetAt.getFullYear()}-${String(manualResetAt.getMonth() + 1).padStart(2, '0')}`
        : null
      const lastPaid = billingType === 'monthly' ? monthlyInfo.lastPaid : billingType === 'annual' ? annualInfo.lastPaid : null
      const nextDue = billingType === 'monthly' ? monthlyInfo.nextDue : billingType === 'annual' ? annualInfo.nextDue : null

      const isOverdue = nextDue ? nextDue < now : false
      const daysUntilDue = nextDue ? Math.ceil((nextDue - now) / DAY_MS) : null
      const dueSoon = !isOverdue && daysUntilDue !== null && daysUntilDue <= warnWindow
      const baseStatus = billingType === 'unknown' ? 'no-plan' : isOverdue ? 'overdue' : dueSoon ? 'due-soon' : 'ok'

      let missedMonths = []
      let missedMonthsHidden = 0
      let missedMonthsTotal = 0
      if (billingType === 'monthly') {
        const paidSet = monthlyPaymentBucketsByPlayer.get(player.id) || new Set()
        const monthsSinceLastPaid = monthlyInfo.lastPaid ? Math.max(diffInMonths(now, monthlyInfo.lastPaid), 0) + 1 : MAX_MONTH_HISTORY
        const monthsSinceReset = manualResetValid ? Math.max(diffInMonths(now, manualResetAt), 0) + 1 : 0
        const historyDepth = Math.min(
          MAX_MONTH_HISTORY,
          Math.max(DEFAULT_MONTH_HISTORY, monthsSinceLastPaid, monthsSinceReset || 0)
        )
        const window = []
        for (let i = 1; i <= historyDepth; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          window.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`
          })
        }
        const missedEntries = window
          .filter(w => !paidSet.has(w.key))
          .filter(w => !manualResetKey || w.key >= manualResetKey)
        missedMonthsTotal = missedEntries.length
        missedMonths = missedEntries.slice(0, DISPLAY_MISSED_MONTH_LIMIT).map(w => w.label)
        missedMonthsHidden = Math.max(0, missedMonthsTotal - missedMonths.length)
      }

      const outstandingAmount = billingType === 'monthly' ? missedMonthsTotal * monthlyDueAmount : 0
      const hasOutstandingMonths = billingType === 'monthly' && missedMonthsTotal > 0
      const finalStatus = billingType === 'unknown' ? 'no-plan' : hasOutstandingMonths ? 'overdue' : baseStatus
      const manualResetActive = Boolean(manualResetValid)
      const statusDescription = manualResetActive
        ? `관리자 수동 정상 처리 (${formatDate(manualResetAt.toISOString(), true)})`
        : hasOutstandingMonths
          ? `미납 ${missedMonthsTotal}개월${outstandingAmount > 0 ? ` · 총 ${formatCurrency(outstandingAmount)}` : ''}`
          : describeStatus(finalStatus, billingType, daysUntilDue)

      return {
        player,
        billingType,
        billingLabel: billingType === 'monthly' ? '월회비' : billingType === 'annual' ? '연회비' : '납부 방식 미정',
        lastPaidLabel: lastPaid ? formatDate(lastPaid.toISOString(), true) : '기록 없음',
        nextDueLabel: nextDue ? formatDate(nextDue.toISOString(), true) : '일정 미정',
        nextDue,
        lastPaid,
        status: finalStatus,
        statusLabel:
          finalStatus === 'overdue'
            ? '연체'
            : finalStatus === 'due-soon'
              ? '임박'
              : finalStatus === 'no-plan'
                ? '미설정'
                : '정상',
        statusDescription,
        daysUntilDue,
        isOverdue,
        dueSoon,
        missedMonths,
        missedMonthsHidden,
        missedMonthsTotal,
        outstandingAmount,
        manualResetAt: manualResetValid ? manualResetAt : null,
        manualResetActive,
        preference,
        preferenceLabel: preference === 'auto' ? '자동' : preference === 'monthly' ? '월회비' : '연회비',
        recommendation:
          manualResetActive
            ? '수동 정상 처리됨 - 이후 납부부터 새로 집계됩니다'
            : billingType === 'unknown'
            ? '납부 방식을 먼저 설정해주세요'
            : hasOutstandingMonths
              ? `미납된 ${missedMonthsTotal}개월${outstandingAmount > 0 ? ` (${formatCurrency(outstandingAmount)})` : ''}을 먼저 정산해주세요`
              : finalStatus === 'overdue'
                ? '바로 회비 리뉴얼을 기록하는 것이 좋습니다'
                : finalStatus === 'due-soon'
                  ? `${Math.max(daysUntilDue || 0, 0)}일 내에 납부 예정입니다`
                  : '현재 일정은 정상입니다'
      }
    })
  }, [renewalEligiblePlayers, renewals, monthlyPaymentBucketsByPlayer, renewalPrefs, duesAmountMap, renewalResets])

  const renewalStats = useMemo(() => {
    const base = {
      total: renewalEntries.length,
      overdue: 0,
      dueSoon: 0,
      ok: 0,
      noPlan: 0,
      monthly: 0,
      annual: 0
    }
    renewalEntries.forEach(entry => {
      if (entry.status === 'overdue') base.overdue += 1
      else if (entry.status === 'due-soon') base.dueSoon += 1
      else if (entry.status === 'no-plan') base.noPlan += 1
      else base.ok += 1

      if (entry.billingType === 'monthly') base.monthly += 1
      else if (entry.billingType === 'annual') base.annual += 1
    })
    return base
  }, [renewalEntries])

  const filteredRenewalEntries = useMemo(() => {
    const statusMatcher = (entry) => {
      if (renewalFilter === 'overdue') return entry.status === 'overdue'
      if (renewalFilter === 'due-soon') return entry.status === 'due-soon'
      if (renewalFilter === 'ok') return entry.status === 'ok'
      if (renewalFilter === 'no-plan') return entry.status === 'no-plan'
      return true
    }

    const query = renewalSearch.trim().toLowerCase()

    return renewalEntries
      .filter(entry => statusMatcher(entry))
      .filter(entry => {
        if (!query) return true
        return entry.player.name.toLowerCase().includes(query)
      })
      .sort((a, b) => a.player.name.localeCompare(b.player.name))
  }, [renewalEntries, renewalFilter, renewalSearch])

  useEffect(() => {
    const background = initialLoadDoneRef.current
    loadData({ background })
    if (!initialLoadDoneRef.current) initialLoadDoneRef.current = true
  }, [dateRange, players])

  // 초기 override 로드 (클라이언트 설정에서)
  useEffect(() => {
    try {
      const o = getAccountingOverrides()
      setFeeOverrides(o)
    } catch {}
  }, [])

  // selectedTab 변경 감지 (디버깅)
  useEffect(() => {
    console.log('[AccountingPage] Selected tab:', selectedTab)
  }, [selectedTab])

  // Google API 초기화
  useEffect(() => {
    let unsubscribe = null
    
    async function initGoogle() {
      try {
        // CLIENT_ID 체크
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
        console.log('[GoogleSheets] Client ID:', clientId ? `${clientId.substring(0, 20)}...` : 'NOT SET')
        
        if (!clientId || 
            clientId === 'your_google_client_id_here.apps.googleusercontent.com' ||
            clientId === 'your_client_id.apps.googleusercontent.com') {
          console.warn('[GoogleSheets] Google Client ID가 설정되지 않았습니다. .env 파일을 확인하세요.')
          // CLIENT_ID 없어도 UI는 표시되도록 return하지 않음
          setIsGoogleSignedIn(false)
          return
        }

        console.log('[GoogleSheets] Initializing Google API...')
        await initializeGapi()
        console.log('[GoogleSheets] Google API initialized')
        
        const signedIn = isSignedIn()
        console.log('[GoogleSheets] Signed in:', signedIn)
        setIsGoogleSignedIn(signedIn)
        
        if (signedIn) {
          const user = getCurrentUser()
          console.log('[GoogleSheets] Current user:', user?.email)
          setGoogleUser(user)
        }

        // 인증 상태 변경 감지
        unsubscribe = onAuthChange((signedIn) => {
          console.log('[GoogleSheets] Auth state changed:', signedIn)
          setIsGoogleSignedIn(signedIn)
          if (signedIn) {
            const user = getCurrentUser()
            setGoogleUser(user)
          } else {
            setGoogleUser(null)
            setSheetData([])
            setSheetInfo(null)
          }
        })
      } catch (error) {
        console.error('[GoogleSheets] Failed to initialize Google API:', error)
        // 에러가 나도 UI는 표시되도록
        setIsGoogleSignedIn(false)
      }
    }
    
    initGoogle()
    
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  // 스프레드시트 URL 로드
  useEffect(() => {
    async function loadSpreadsheetUrl() {
      setLoadingSpreadsheet(true)
      try {
        const settings = await getAppSettings()
        const url = settings?.accounting?.spreadsheetUrl || ''
        setSpreadsheetUrl(url)
      } catch (err) {
        console.error('Failed to load spreadsheet URL:', err)
      } finally {
        setLoadingSpreadsheet(false)
      }
    }
    loadSpreadsheetUrl()
  }, [])

  // 스프레드시트 데이터 로드
  useEffect(() => {
    async function loadSheet() {
      if (!spreadsheetUrl || !isGoogleSignedIn) {
        setSheetData([])
        setSheetInfo(null)
        return
      }

      const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
      if (!spreadsheetId) {
        notify('유효하지 않은 스프레드시트 URL입니다.', 'error')
        return
      }

      setLoadingSheet(true)
      try {
        const [info, data] = await Promise.all([
          getSpreadsheetInfo(spreadsheetId),
          loadSheetData(spreadsheetId, 'Sheet1!A1:Z1000')
        ])
        setSheetInfo(info)
        setSheetData(data)
      } catch (error) {
        console.error('Failed to load sheet:', error)
        notify('스프레드시트 로드에 실패했습니다.', 'error')
      } finally {
        setLoadingSheet(false)
      }
    }

    loadSheet()
  }, [spreadsheetUrl, isGoogleSignedIn])

  // 외부에서 matches prop 변경 시 로컬에도 반영
  useEffect(() => {
    setMatchesLocal(matches)
  }, [matches])

  useEffect(() => {
    if (feeOverrides?.renewalPreferences) {
      setRenewalPrefs(feeOverrides.renewalPreferences)
    }
    if (feeOverrides?.renewalResets) {
      setRenewalResets(normalizeRenewalResetMap(feeOverrides.renewalResets))
    }
  }, [feeOverrides])

  // Google 로그인/로그아웃 핸들러
  const handleGoogleSignIn = async () => {
    try {
      console.log('[AccountingPage] 구글 로그인 시도 중...')
      
      // Google API 초기화 확인
      if (!isGapiInitialized()) {
        console.log('[AccountingPage] Google API가 아직 초기화되지 않았습니다. 초기화 시도...')
        await initializeGapi()
        console.log('[AccountingPage] Google API 초기화 완료')
      }
      
      console.log('[AccountingPage] signIn 함수 호출')
      await signIn()
      console.log('[AccountingPage] 로그인 성공')
      
      // GIS는 auth state listener가 없으므로 수동으로 상태 업데이트
      setIsGoogleSignedIn(true)
      const user = getCurrentUser()
      setGoogleUser(user)
      
      notify('Google에 로그인되었습니다.')
    } catch (error) {
      console.error('[AccountingPage] Sign in error:', error)
      console.error('[AccountingPage] Error details:', {
        message: error.message,
        error: error.error,
        details: error.details,
        stack: error.stack,
        type: error.type
      })
      
      let errorMessage = '로그인에 실패했습니다'
      if (error.message && error.message.includes('로그인 창')) {
        errorMessage = error.message
      } else if (error.error === 'idpiframe_initialization_failed') {
        errorMessage = 'Google 인증 초기화 실패. OAuth 설정을 확인해주세요. (Google Cloud Console에서 Authorized JavaScript origins에 http://localhost:5173을 추가했는지 확인)'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      notify(errorMessage, 'error')
    }
  }

  const handleGoogleSignOut = async () => {
    try {
      await signOut()
      
      // GIS는 auth state listener가 없으므로 수동으로 상태 업데이트
      setIsGoogleSignedIn(false)
      setGoogleUser(null)
      setSheetData([])
      setSheetInfo(null)
      
      notify('로그아웃되었습니다.')
    } catch (error) {
      console.error('Sign out error:', error)
      notify('로그아웃에 실패했습니다.', 'error')
    }
  }

  // 스프레드시트에 데이터 저장
  const handleSaveToSheet = async (data) => {
    if (!spreadsheetUrl || !isGoogleSignedIn) {
      notify('Google 로그인이 필요합니다.', 'error')
      return
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
    if (!spreadsheetId) {
      notify('유효하지 않은 스프레드시트 URL입니다.', 'error')
      return
    }

    try {
      await saveSheetData(spreadsheetId, 'Sheet1!A1', data)
      notify('스프레드시트에 저장되었습니다.')
      // 저장 후 다시 로드
      const updatedData = await loadSheetData(spreadsheetId, 'Sheet1!A1:Z1000')
      setSheetData(updatedData)
    } catch (error) {
      console.error('Failed to save sheet:', error)
      notify('저장에 실패했습니다.', 'error')
    }
  }

  async function loadData({ background = false } = {}) {
    if (!isAdmin) return
    if (!background) setLoading(true)
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
      const renewalData = await getDuesRenewals(renewalEligiblePlayers)
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
      if (!background) setLoading(false)
    }
  }

  async function handleAddPayment() {
    const paymentTypeToSave = resolvePaymentTypeAlias(newPayment.paymentType)
    const isDonationLike = paymentTypeToSave === 'other_income' || paymentTypeToSave === 'expense'
    const hasPlayerSelection = Boolean(newPayment.playerId) || ((newPayment.selectedPlayerIds || []).length > 0)
    if ((!isDonationLike && !hasPlayerSelection) || !newPayment.amount) {
      notify(isDonationLike ? '금액을 입력해주세요' : '선수와 금액을 입력해주세요')
      return
    }
    if (isDonationLike && !hasPlayerSelection && !hasSystemAccount) {
      notify('시스템 계정을 먼저 생성해야 운영비/기타 항목을 기록할 수 있어요. Players > 새 선수 추가 > "시스템 계정 자동 생성"을 눌러 주세요.', 'error')
      return
    }
    const dateList = [newPayment.paymentDate, ...(newPayment.additionalDates||[])].filter(Boolean)
    if (dateList.length === 0) {
      notify('최소 1개 이상의 날짜를 입력해주세요')
      return
    }
    try {
      const playerIds = isDonationLike
        ? (() => {
            if (newPayment.playerId) return [newPayment.playerId]
            if ((newPayment.selectedPlayerIds || []).length > 0) return [newPayment.selectedPlayerIds[0]]
            if (fallbackHouseAccountId) {
              return [fallbackHouseAccountId]
            }
            return []
          })()
        : ((newPayment.selectedPlayerIds&&newPayment.selectedPlayerIds.length>0) ? newPayment.selectedPlayerIds : (newPayment.playerId ? [newPayment.playerId] : []))
      if (playerIds.length === 0) {
        notify(isDonationLike ? '시스템 계정을 먼저 생성해야 운영비/기타 항목을 기록할 수 있어요.' : '선수를 선택해주세요')
        return
      }
      const tasks = []
      for (const pid of playerIds) {
        for (const dt of dateList) {
          const paymentData = {
            playerId: pid,
            paymentType: paymentTypeToSave,
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
      if (ok>0) notify(`${ok}건 결제가 추가되었습니다 `)
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
        loadData({ background: true })
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

  async function handleUpdateRenewalPreference(playerId, value) {
    if (!playerId) return
    const next = { ...renewalPrefs }
    if (value === 'auto') delete next[playerId]
    else next[playerId] = { billingType: value }
    setRenewalPrefs(next)
    try {
      await updateAccountingOverrides({ renewalPreferences: next })
      setFeeOverrides(prev => ({ ...prev, renewalPreferences: next }))
      notify('납부 방식이 업데이트되었습니다 ')
    } catch (error) {
      console.error('Failed to update renewal preference', error)
      notify('납부 방식 저장 실패')
    }
  }

  async function handleRenewalManualReset(playerId, billingType) {
    if (!playerId || (billingType !== 'monthly' && billingType !== 'annual')) {
      notify('납부 방식을 먼저 설정해주세요')
      return
    }
    const timestamp = new Date().toISOString()
    const savingKey = `${playerId}:${billingType}`
    setManualResetSaving(prev => ({ ...prev, [savingKey]: true }))
    try {
      const currentEntry = renewalResets[playerId] || {}
      const updatedEntry = { ...currentEntry, [billingType]: timestamp }
      const nextResets = cleanupRenewalResetMap({
        ...renewalResets,
        [playerId]: updatedEntry
      })
      await updateAccountingOverrides({ renewalResets: nextResets })
      setRenewalResets(nextResets)
      setFeeOverrides(prev => ({ ...prev, renewalResets: nextResets }))
      notify('수동 정상 처리가 완료되었습니다 ')
      await loadData({ background: true })
    } catch (error) {
      console.error('Failed to manually reset renewal status', error)
      notify('정상 처리에 실패했습니다')
    } finally {
      setManualResetSaving(prev => {
        const next = { ...prev }
        delete next[savingKey]
        return next
      })
    }
  }

  async function handleRenewalManualResetClear(playerId, billingType) {
    if (!playerId || (billingType !== 'monthly' && billingType !== 'annual')) {
      notify('납부 방식을 먼저 설정해주세요')
      return
    }
    const savingKey = `${playerId}:${billingType}`
    setManualResetSaving(prev => ({ ...prev, [savingKey]: true }))
    try {
      const currentEntry = renewalResets[playerId] || {}
      if (!currentEntry[billingType]) {
        setManualResetSaving(prev => {
          const next = { ...prev }
          delete next[savingKey]
          return next
        })
        return
      }
      const updatedEntry = { ...currentEntry }
      delete updatedEntry[billingType]
      const nextResets = cleanupRenewalResetMap({
        ...renewalResets,
        [playerId]: Object.keys(updatedEntry).length ? updatedEntry : undefined
      })
      await updateAccountingOverrides({ renewalResets: nextResets })
      setRenewalResets(nextResets)
      setFeeOverrides(prev => ({ ...prev, renewalResets: nextResets }))
      notify('수동 정상 처리가 해제되었습니다')
      await loadData({ background: true })
    } catch (error) {
      console.error('Failed to revert manual reset', error)
      notify('정상 처리 해제에 실패했습니다')
    } finally {
      setManualResetSaving(prev => {
        const next = { ...prev }
        delete next[savingKey]
        return next
      })
    }
  }

  async function handleQuickRenewalPayment({ playerId, billingType, amount, paymentDate, paymentMethod = 'cash' }) {
    const resolvedType = billingType && billingType !== 'unknown' ? billingType : null
    if (!playerId || !resolvedType) {
      notify('납부 유형을 선택해주세요')
      return
    }
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || Number.isNaN(parsedAmount)) {
      notify('금액을 입력해주세요')
      return
    }
    const normalizedDate = paymentDate || new Date().toISOString().slice(0, 10)
    setRenewalSaving(prev => ({ ...prev, [playerId]: true }))
    try {
      await addPayment({
        playerId,
        paymentType: resolvedType === 'monthly' ? 'monthly_dues' : 'annual_dues',
        amount: parsedAmount,
        paymentMethod,
        paymentDate: normalizedDate,
        notes: '[renewals-tab]'
      })
      notify('회비 납부가 기록되었습니다 ')
      await loadData({ background: true })
    } catch (error) {
      console.error('Failed to add quick renewal payment', error)
      notify('빠른 결제 입력 실패')
    } finally {
      setRenewalSaving(prev => {
        const next = { ...prev }
        delete next[playerId]
        return next
      })
    }
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
        if (ok>0) {
          customPayee = match[1]
          displayNotes = displayNotes.replace(match[0], '').trim()
        }
      }

      const flow = PAYMENT_TYPE_META[payment.payment_type]?.flow || (payment.payment_type === 'expense' ? 'expense' : 'income')
      return {
        '날짜': new Date(payment.payment_date).toLocaleDateString('ko-KR'),
        '선수/대상': isDonationLike ? (customPayee || '미지정') : (player?.name || 'Unknown'),
        '유형': paymentTypeLabels[payment.payment_type] || payment.payment_type,
        '구분': flow === 'income' ? '수입' : '지출',
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
    notify('Excel 파일이 다운로드되었습니다 ')
  }

  // 선수별 납부 정렬 핸들러
  function handlePlayerStatsSort(key) {
    setPlayerStatsSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const openPaymentFormForPlayer = useCallback((player) => {
    if (!player) return
    setSelectedTab('payments')
    setShowAddPayment(true)
    setPlayerSearch(player.name || '')
    setNewPayment(prev => ({
      ...prev,
      playerId: '',
      selectedPlayerIds: player.id ? [player.id] : []
    }))
  }, [setSelectedTab, setShowAddPayment, setPlayerSearch, setNewPayment])

  // 정렬된 선수 목록
  const sortedPlayerStats = useMemo(() => {
    const query = playerStatsSearch.trim().toLowerCase()
    const playerData = players
      .filter(p => !p.isSystemAccount)
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

    const filteredData = query
      ? playerData.filter(({ player }) => player.name?.toLowerCase().includes(query))
      : playerData

    return filteredData.sort((a, b) => {
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
  }, [players, payments, playerStatsSortConfig, playerStatsSearch])

  async function handleUpdateDues(settingType, amount, description) {
    try {
      await updateDuesSetting(settingType, amount, description)
      notify('회비 설정이 업데이트되었습니다 ')
      loadData({ background: true })
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

  const paymentTypeLabels = useMemo(() => (
    Object.fromEntries(Object.entries(PAYMENT_TYPE_META).map(([key, meta]) => [key, meta.label]))
  ), [])

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

  const selectedPlayerIds = newPayment.selectedPlayerIds || []
  const isHouseEntry = ['other_income', 'expense'].includes(resolvedPaymentType)

  const paymentKpis = useMemo(() => {
    const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30
    const now = Date.now()
    const totals = payments.reduce((acc, pay) => {
      const amt = Math.abs(parseFloat(pay.amount) || 0)
      const payDate = new Date(pay.payment_date || pay.paymentDate)
      const isRecent = Number.isFinite(payDate.getTime()) && (now - payDate.getTime()) <= THIRTY_DAYS_MS

      if (pay.payment_type === 'expense') {
        acc.outflow += amt
      } else {
        acc.inflow += amt
        if (isRecent) acc.recentInflow += amt
      }

      acc.volume += amt
      return acc
    }, { inflow: 0, outflow: 0, recentInflow: 0, volume: 0 })

    const count = payments.length
    const avgTicket = count > 0 ? totals.volume / count : 0
    return { ...totals, count, avgTicket }
  }, [payments])

  function clearYearSelection() {
    setSelectedYear(null)
    persistYearFilter(null)
  }

  function applyYearRange(year) {
    if (!year) return
    setSelectedYear(year)
    persistYearFilter(year)
    setDateRange({ start: `${year}-01-01`, end: `${year}-12-31` })
    setShowAdvancedDates(false)
  }

  function resetDateRange() {
    clearYearSelection()
    setDateRange({ start: '', end: '' })
  }

  function handleDateInputChange(field, value) {
    clearYearSelection()
    setDateRange(prev => ({ ...prev, [field]: value }))
  }

  function setThisMonthRange() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)
    const end = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10)
    clearYearSelection()
    setDateRange({ start, end })
  }

  function setThisYearRange() {
    const now = new Date()
    applyYearRange(now.getFullYear())
  }

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) {
      if (selectedYear !== null) {
        setSelectedYear(null)
        persistYearFilter(null)
      }
      return
    }
    const startYear = Number(dateRange.start.slice(0, 4))
    const endYear = Number(dateRange.end.slice(0, 4))
    const matchesFullYear =
      dateRange.start.endsWith('-01-01') &&
      dateRange.end.endsWith('-12-31') &&
      Number.isFinite(startYear) &&
      startYear === endYear

    if (matchesFullYear) {
      if (selectedYear !== startYear) {
        setSelectedYear(startYear)
        persistYearFilter(startYear)
      }
    } else if (selectedYear !== null) {
      setSelectedYear(null)
      persistYearFilter(null)
    }
  }, [dateRange.start, dateRange.end, selectedYear])

  // 저장된 매치 정렬 (최신순)
  const sortedMatches = useMemo(() => {
    const source = Array.isArray(matchesLocal) && matchesLocal.length > 0 ? matchesLocal : matches
    return [...(source || [])].sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
  }, [matchesLocal, matches])

  const activeMatches = useMemo(() => sortedMatches.filter(m => !m.isVoided), [sortedMatches])
  const voidMatches = useMemo(() => sortedMatches.filter(m => m.isVoided && !m.hiddenFromAccounting), [sortedMatches])

  const paginatedMatches = useMemo(() => {
    const startIdx = (matchFeesPage - 1) * matchFeesPerPage
    return activeMatches.slice(startIdx, startIdx + matchFeesPerPage)
  }, [activeMatches, matchFeesPage, matchFeesPerPage])

  const totalMatchPages = Math.max(1, Math.ceil(Math.max(activeMatches.length, 1) / matchFeesPerPage))
  const matchPageStart = activeMatches.length === 0 ? 0 : (matchFeesPage - 1) * matchFeesPerPage + 1
  const matchPageEnd = activeMatches.length === 0 ? 0 : Math.min(activeMatches.length, matchFeesPage * matchFeesPerPage)

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(Math.max(activeMatches.length, 1) / matchFeesPerPage))
    if (matchFeesPage > maxPage) setMatchFeesPage(maxPage)
  }, [activeMatches.length, matchFeesPerPage, matchFeesPage])

  // 임시로 주석 처리 - 테스트용
  // if (!isAdmin) {
  //   return (
  //     <div className="p-8 text-center">
  //       <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
  //       <p className="text-gray-600">총무(Admin)만 접근 가능합니다.</p>
  //     </div>
  //   )
  // }

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
            선수별 통계
          </TabButton>
          <TabButton
            active={selectedTab === 'spreadsheet'}
            onClick={() => setSelectedTab('spreadsheet')}
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 16H5v-4h6v4zm0-6H5v-4h6v4zm0-6H5V5h6v2zm8 12h-6v-4h6v4zm0-6h-6v-4h6v4zm0-6h-6V5h6v2z"/>
              </svg>
            }
          >
            스프레드시트
          </TabButton>
        </div>
      </Card>

      {/* 날짜 필터 & 년도 필터 */}
      {selectedTab !== 'spreadsheet' && (
      <Card>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 mr-1">기간:</span>
            <button onClick={setThisMonthRange} className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200">이번 달</button>
            <button onClick={setThisYearRange} className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200">이번 해</button>
            <button onClick={resetDateRange} className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200">전체</button>
            <button onClick={()=>setShowAdvancedDates(v=>!v)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">기간 지정</button>
          </div>
          {yearOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <span className="font-semibold mr-1">연도별 보기:</span>
              <button
                onClick={() => prevYear && applyYearRange(prevYear)}
                disabled={!prevYear}
                className={`px-3 py-1.5 rounded border ${prevYear ? 'bg-white hover:bg-gray-50' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                이전 연도
              </button>
              <select
                value={selectedYear ?? ''}
                onChange={(e) => {
                  const yearValue = e.target.value
                  if (!yearValue) {
                    resetDateRange()
                    return
                  }
                  applyYearRange(Number(yearValue))
                }}
                className="border rounded px-3 py-1.5 bg-white"
              >
                <option value="">연도 선택</option>
                {yearOptions.map(year => (
                  <option key={year} value={year}>{year}년</option>
                ))}
              </select>
              <button
                onClick={() => nextYear && applyYearRange(nextYear)}
                disabled={!nextYear}
                className={`px-3 py-1.5 rounded border ${nextYear ? 'bg-white hover:bg-gray-50' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                다음 연도
              </button>
              {selectedYear !== null && (
                <button
                  onClick={resetDateRange}
                  className="px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  연도 해제
                </button>
              )}
            </div>
          )}
          {showAdvancedDates && (
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => handleDateInputChange('start', e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
              <span className="text-gray-500">~</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => handleDateInputChange('end', e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
            </div>
          )}
        </div>
      </Card>
      )}

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
              await loadData({ background: true })
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
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
            <div className="text-sm text-gray-600">
              총 {sortedPlayerStats.length}명 표시
            </div>
            <div className="relative w-full md:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={playerStatsSearch}
                onChange={(e) => setPlayerStatsSearch(e.target.value)}
                placeholder="선수 이름 검색"
                className="w-full pl-9 pr-8 py-2 border rounded-lg text-sm"
                aria-label="선수 검색"
              />
              {playerStatsSearch && (
                <button
                  type="button"
                  onClick={() => setPlayerStatsSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="검색어 지우기"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {/* 리스트 뷰 */}
          {sortedPlayerStats.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500 border rounded-lg bg-gray-50">
              조건에 맞는 선수가 없습니다.
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[960px]">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead>
                <tr className="border-b bg-gray-50">
                  <th onClick={() => handlePlayerStatsSort('name')} className="text-left py-3 px-4 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                    선수 {playerStatsSortConfig.key === 'name' && <ArrowUpDown size={14} className="inline text-blue-600" />}
                  </th>
                  <th onClick={() => handlePlayerStatsSort('membership')} className="text-left py-3 px-4 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                    멤버십 {playerStatsSortConfig.key === 'membership' && <ArrowUpDown size={14} className="inline text-blue-600" />}
                  </th>
                  <th onClick={() => handlePlayerStatsSort('registration')} className="text-right py-3 px-4 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                    가입비 {playerStatsSortConfig.key === 'registration' && <ArrowUpDown size={14} className="inline text-blue-600" />}
                  </th>
                  <th onClick={() => handlePlayerStatsSort('monthly')} className="text-right py-3 px-4 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                    월회비 {playerStatsSortConfig.key === 'monthly' && <ArrowUpDown size={14} className="inline text-blue-600" />}
                  </th>
                  <th onClick={() => handlePlayerStatsSort('annual')} className="text-right py-3 px-4 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                    연회비 {playerStatsSortConfig.key === 'annual' && <ArrowUpDown size={14} className="inline text-blue-600" />}
                  </th>
                  <th onClick={() => handlePlayerStatsSort('match')} className="text-right py-3 px-4 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                    구장비 {playerStatsSortConfig.key === 'match' && <ArrowUpDown size={14} className="inline text-blue-600" />}
                  </th>
                  <th onClick={() => handlePlayerStatsSort('total')} className="text-right py-3 px-4 font-semibold cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                    총 납부 {playerStatsSortConfig.key === 'total' && <ArrowUpDown size={14} className="inline text-blue-600" />}
                  </th>
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
                        <span className="font-medium notranslate" translate="no">{player.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">{player.membership || 'Guest'}</span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap align-middle">
                      {registration ? (
                        <span className="text-emerald-600 font-semibold">${parseFloat(registration.amount).toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap align-middle">
                      {monthlySum > 0 ? (
                        <div className="inline-block text-right">
                          <span className="font-semibold">${monthlySum.toFixed(2)}</span>
                          <span className="text-xs text-gray-500 ml-1">({monthlyCount}회)</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap align-middle">
                      {annualSum > 0 ? (
                        <div className="inline-block text-right">
                          <span className="font-semibold">${annualSum.toFixed(2)}</span>
                          <span className="text-xs text-gray-500 ml-1">({annualCount}회)</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap align-middle">
                      {matchSum > 0 ? (
                        <div className="inline-block text-right">
                          <span className="font-semibold">${matchSum.toFixed(2)}</span>
                          <span className="text-xs text-gray-500 ml-1">({matchCount}회)</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap align-middle">
                      <span className="text-lg font-bold text-emerald-600">${total.toFixed(2)}</span>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          )}
          
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

      {/* 스프레드시트 탭 */}
      {selectedTab === 'spreadsheet' && (
        <Card title="구글 스프레드시트">
          <div className="space-y-4">
            {/* CLIENT_ID 미설정 경고 */}
            {(!import.meta.env.VITE_GOOGLE_CLIENT_ID || 
              import.meta.env.VITE_GOOGLE_CLIENT_ID === 'your_google_client_id_here.apps.googleusercontent.com' ||
              import.meta.env.VITE_GOOGLE_CLIENT_ID === 'your_client_id.apps.googleusercontent.com') && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-gray-700">
                    <p className="font-semibold mb-1">Google OAuth 설정이 필요합니다</p>
                    <div className="text-xs text-gray-600 space-y-2">
                      <p className="font-medium">1. Google Cloud Console 설정:</p>
                      <ul className="list-disc list-inside ml-2 space-y-1">
                        <li>OAuth 2.0 클라이언트 ID 생성</li>
                        <li><strong>Authorized JavaScript origins</strong>에 추가:
                          <pre className="mt-1 p-1 bg-red-100 rounded text-[10px]">http://localhost:5173</pre>
                        </li>
                        <li><strong>Authorized redirect URIs</strong>에 추가:
                          <pre className="mt-1 p-1 bg-red-100 rounded text-[10px]">http://localhost:5173</pre>
                        </li>
                      </ul>
                      <p className="font-medium mt-2">2. .env 파일에 CLIENT_ID 추가:</p>
                      <pre className="mt-1 p-2 bg-red-100 rounded text-[10px]">
VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
                      </pre>
                      <p className="text-amber-600 font-medium mt-2">⚠️ 403 에러가 발생하면 위 설정을 확인하세요!</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Google 계정 정보 및 로그인 */}
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 16H5v-4h6v4zm0-6H5v-4h6v4zm0-6H5V5h6v2zm8 12h-6v-4h6v4zm0-6h-6v-4h6v4zm0-6h-6V5h6v2z"/>
                </svg>
                <span className="font-semibold text-gray-800">Google Sheets</span>
              </div>
              <div className="flex items-center gap-3">
                {isGoogleSignedIn && googleUser ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      {googleUser.imageUrl && (
                        <img src={googleUser.imageUrl} alt={googleUser.name} className="w-6 h-6 rounded-full" />
                      )}
                      <span className="text-gray-700">{googleUser.name}</span>
                    </div>
                    <button
                      onClick={handleGoogleSignOut}
                      className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 font-medium border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      로그아웃
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleGoogleSignIn}
                    className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Google 로그인
                  </button>
                )}
                <button
                  onClick={() => setShowSpreadsheetSettings(!showSpreadsheetSettings)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  {showSpreadsheetSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {showSpreadsheetSettings ? '설정 닫기' : '설정'}
                </button>
              </div>
            </div>

            {/* 로그인 필요 안내 */}
            {!isGoogleSignedIn && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-gray-700">
                    <p className="font-semibold mb-1">Google 로그인이 필요합니다</p>
                    <p className="text-xs text-gray-600">
                      스프레드시트를 읽고 수정하려면 Google 계정으로 로그인해야 합니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 스프레드시트 URL 설정 */}
            {showSpreadsheetSettings && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Google Sheets URL
                </label>
                <input
                  type="text"
                  value={spreadsheetUrl}
                  onChange={(e) => setSpreadsheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={async () => {
                    try {
                      const currentSettings = await getAppSettings()
                      await saveAppSettingsToServer({
                        ...currentSettings,
                        accounting: {
                          ...(currentSettings.accounting || {}),
                          spreadsheetUrl
                        }
                      })
                      notify('스프레드시트 URL이 저장되었습니다', 'success')
                      if (spreadsheetUrl && isGoogleSignedIn) {
                        setLoadingSheet(true)
                        try {
                          const data = await loadSheetData(spreadsheetUrl)
                          setSheetData(data)
                          const info = await getSpreadsheetInfo(spreadsheetUrl)
                          setSheetInfo(info)
                          notify('스프레드시트를 불러왔습니다', 'success')
                        } catch (err) {
                          console.error('[AccountingPage] Failed to load sheet:', err)
                          notify('스프레드시트 로드 실패: ' + err.message, 'error')
                        } finally {
                          setLoadingSheet(false)
                        }
                      }
                    } catch (err) {
                      notify('저장 실패: ' + err.message, 'error')
                    }
                  }}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  저장하고 불러오기
                </button>
              </div>
            )}

            {/* 스프레드시트 내용 표시 */}
            {isGoogleSignedIn ? (
              <>
                {loadingSheet ? (
                  <div className="p-12 text-center">
                    <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm text-gray-600">스프레드시트를 불러오는 중...</p>
                  </div>
                ) : sheetData && sheetInfo ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-800">{sheetInfo.title}</h3>
                      <button
                        onClick={async () => {
                          if (!spreadsheetUrl) {
                            notify('스프레드시트 URL을 설정해주세요', 'warning')
                            return
                          }
                          setLoadingSheet(true)
                          try {
                            const data = await loadSheetData(spreadsheetUrl)
                            setSheetData(data)
                            notify('새로고침 완료', 'success')
                          } catch (err) {
                            notify('새로고침 실패', 'error')
                          } finally {
                            setLoadingSheet(false)
                          }
                        }}
                        className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                      >
                        <RefreshCw size={14} />
                        새로고침
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                      스프레드시트가 로드되었습니다. ({sheetData?.length || 0}개 행)
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                    <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 16H5v-4h6v4zm0-6H5v-4h6v4zm0-6H5V5h6v2zm8 12h-6v-4h6v4zm0-6h-6v-4h6v4zm0-6h-6V5h6v2z"/>
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">스프레드시트를 연결하세요</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      위의 "설정" 버튼을 눌러 Google Sheets URL을 입력하세요
                    </p>
                    <button
                      onClick={() => setShowSpreadsheetSettings(true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                    >
                      <Plus size={16} />
                      스프레드시트 연결하기
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-12 text-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                <svg className="w-20 h-20 mx-auto text-gray-400 mb-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 16H5v-4h6v4zm0-6H5v-4h6v4zm0-6H5V5h6v2zm8 12h-6v-4h6v4zm0-6h-6v-4h6v4zm0-6h-6V5h6v2z"/>
                </svg>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Google Sheets 연동</h3>
                <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                  Google 로그인 후 스프레드시트 URL을 입력하면<br />
                  재정 데이터를 Google Sheets에서 관리할 수 있습니다.
                </p>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={!import.meta.env.VITE_GOOGLE_CLIENT_ID}
                  className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                >
                  <svg width="20" height="20" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                  </svg>
                  Google 로그인하여 시작하기
                </button>
              </div>
            )}
          </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
            {[{
              key: 'count',
              label: '총 거래',
              value: `${paymentKpis.count}건`,
              helper: '현재 필터 기준'
            }, {
              key: 'inflow',
              label: '누적 수입',
              value: formatCurrency(paymentKpis.inflow),
              helper: '지출 제외'
            }, {
              key: 'outflow',
              label: '누적 지출',
              value: formatCurrency(paymentKpis.outflow),
              helper: 'expense 기준'
            }, {
              key: 'recent',
              label: '최근 30일 수입',
              value: formatCurrency(paymentKpis.recentInflow),
              helper: '오늘 기준 30일'
            }, {
              key: 'avg',
              label: '평균 거래 금액',
              value: formatCurrency(paymentKpis.avgTicket || 0),
              helper: '건당 평균'
            }].map(tile => (
              <div key={tile.key} className="p-3 rounded-xl border bg-white shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{tile.label}</div>
                <div className="text-lg font-bold text-gray-900 mt-1">{tile.value}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{tile.helper}</div>
              </div>
            ))}
          </div>

          {showAddPayment && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">새 결제 추가</h3>
                <button onClick={() => setShowAddPayment(false)}>
                  <X size={20} className="text-gray-500 hover:text-gray-700" />
                </button>
              </div>
              
              {/* Quick facility expense selector */}
              <div className="mb-4 pb-3 border-b border-blue-300">
                <button
                  onClick={() => setShowExpenseHistory(!showExpenseHistory)}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <span>⚡</span>
                  <span>구장비 지출 내역 {showExpenseHistory ? '숨기기' : '불러오기'}</span>
                </button>
                <p className="text-[11px] text-gray-600 mt-1.5">
                  이전 구장비/지출 내역을 선택해 빠르게 입력할 수 있어요
                </p>
                
                {showExpenseHistory && (
                  <div className="mt-3 max-h-64 overflow-y-auto border border-green-200 rounded-lg bg-white">
                    {(() => {
                      const allExpenses = payments
                        .filter(p => p.payment_type === 'expense' || p.payment_type === 'facility_expense')
                        .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
                      
                      // Remove duplicates: same amount, custom_payee, notes, payment_method
                      const uniqueExpenses = []
                      const seen = new Set()
                      
                      for (const expense of allExpenses) {
                        const key = JSON.stringify({
                          amount: expense.amount,
                          custom_payee: expense.custom_payee || '',
                          notes: expense.notes || '',
                          payment_method: expense.payment_method || ''
                        })
                        
                        if (!seen.has(key)) {
                          seen.add(key)
                          uniqueExpenses.push(expense)
                        }
                      }
                      
                      if (uniqueExpenses.length === 0) {
                        return (
                          <div className="p-4 text-center text-sm text-gray-500">
                            구장비/지출 내역이 없습니다
                          </div>
                        )
                      }
                      
                      return uniqueExpenses.map((expense, idx) => (
                        <button
                          key={expense.id || idx}
                          onClick={() => {
                            setNewPayment({
                              ...newPayment,
                              paymentType: 'facility_expense',
                              amount: String(expense.amount || ''),
                              paymentMethod: expense.payment_method || 'cash',
                              customPayee: expense.custom_payee || '',
                              notes: expense.notes || '구장비 지출'
                            })
                            setShowExpenseHistory(false)
                          }}
                          className="w-full p-3 hover:bg-green-50 text-left border-b last:border-b-0 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-gray-900">
                                  ${parseFloat(expense.amount || 0).toFixed(2)}
                                </span>
                                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                                  {expense.payment_type === 'facility_expense' ? '구장비' : '지출'}
                                </span>
                              </div>
                              {expense.custom_payee && (
                                <div className="text-xs text-gray-600 mb-0.5">
                                  대상: {expense.custom_payee}
                                </div>
                              )}
                              {expense.notes && (
                                <div className="text-xs text-gray-500 truncate">
                                  메모: {expense.notes}
                                </div>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 whitespace-nowrap">
                              {new Date(expense.date || expense.created_at).toLocaleDateString('ko-KR', { 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </div>
                          </div>
                        </button>
                      ))
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <StepHeader step={1} title="결제 기본 정보" description="유형 · 금액 · 결제 수단" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">결제 유형</label>
                      <select
                        value={newPayment.paymentType}
                        onChange={(e) => {
                          const newType = e.target.value
                          const updates = { paymentType: newType }
                          const resolvedType = resolvePaymentTypeAlias(newType)
                          if (['registration', 'monthly_dues', 'annual_dues'].includes(resolvedType)) {
                            const fixedAmount = duesMap[resolvedType]
                            if (fixedAmount) {
                              updates.amount = String(fixedAmount)
                            }
                          }
                          if (newType === 'facility_expense' && !newPayment.notes) {
                            updates.notes = '구장비 지출'
                          }
                          setNewPayment({ ...newPayment, ...updates })
                        }}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      >
                        {PAYMENT_TYPE_SELECT_GROUPS.map(group => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {selectedPaymentTypeMeta?.label} · {PAYMENT_FLOW_LABELS[selectedPaymentTypeMeta?.flow] || '수입'}
                      </div>
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
                        readOnly={['registration', 'monthly_dues', 'annual_dues'].includes(resolvedPaymentType) && duesMap[resolvedPaymentType]}
                        title={['registration', 'monthly_dues', 'annual_dues'].includes(resolvedPaymentType) ? '회비 설정에서 고정된 금액' : ''}
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
                </div>

                <div>
                  <StepHeader step={2} title="대상 & 메모" description={isHouseEntry ? '운영비/기타 항목은 용도를 입력하세요' : '선수를 검색해 다중 선택할 수 있습니다'} />
                  {isHouseEntry ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">대상/용도 (선택)</label>
                        <input
                          type="text"
                          value={newPayment.customPayee}
                          onChange={(e) => setNewPayment({ ...newPayment, customPayee: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder="예: 공 구입, 상품 지급"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                          {hasSystemAccount
                            ? '운영비와 기타 수입/지출을 구분할 메모를 함께 남겨 주세요.'
                            : '시스템 계정을 먼저 만들어야 운영비/기타 항목을 기록할 수 있어요. Players > 새 선수 추가 > "시스템 계정 자동 생성"을 눌러 주세요.'}
                        </p>
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
                  ) : (
                    <div className="space-y-4">
                      <SelectedPlayerTray
                        players={players}
                        selectedIds={selectedPlayerIds}
                        onClear={() => setNewPayment(prev => ({ ...prev, selectedPlayerIds: [] }))}
                        onRemove={(playerId) => setNewPayment(prev => ({
                          ...prev,
                          selectedPlayerIds: (prev.selectedPlayerIds || []).filter(id => id !== playerId)
                        }))}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="block text-xs font-medium">선수 검색</label>
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
                              const selected = selectedPlayerIds.includes(p.id)
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
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">메모 (선택)</label>
                          <input
                            type="text"
                            value={newPayment.notes}
                            onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="선수에게 보여줄 간단한 메모"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <StepHeader step={3} title="납부 일자" description="복수 날짜도 한 번에 기록할 수 있습니다" />
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium mb-1 flex items-center justify-between">
                      <span>결제 날짜</span>
                      <button
                        type="button"
                        onClick={() => setNewPayment(prev => ({ ...prev, additionalDates: [...(prev.additionalDates||[]), prev.paymentDate ] }))}
                        className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                      >현재 날짜 복제</button>
                    </label>
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

          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span className="font-semibold text-gray-700">금전 구분:</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${PAYMENT_FLOW_BADGES.income}`}>
              {PAYMENT_FLOW_LABELS.income}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${PAYMENT_FLOW_BADGES.expense}`}>
              {PAYMENT_FLOW_LABELS.expense}
            </span>
            <span className="text-gray-400">배지로 수입/지출을 바로 확인할 수 있어요.</span>
          </div>

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
                  const typeMeta = PAYMENT_TYPE_META[payment.payment_type] || { label: payment.payment_type, flow: payment.payment_type === 'expense' ? 'expense' : 'income' }
                  const flowLabel = PAYMENT_FLOW_LABELS[typeMeta.flow] || PAYMENT_FLOW_LABELS.income
                  const flowBadgeClass = PAYMENT_FLOW_BADGES[typeMeta.flow] || PAYMENT_FLOW_BADGES.income
                  
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
                          <span className="text-[9px] sm:text-sm truncate max-w-[60px] sm:max-w-none notranslate" translate="no">{player?.name || 'Unknown'}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-1 sm:py-3 sm:px-2">
                      <div className="flex flex-col gap-1 w-max">
                        <span className={`px-1 sm:px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-xs font-semibold whitespace-nowrap ${
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
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[11px] font-medium ${flowBadgeClass}`}>
                          {flowLabel}
                        </span>
                      </div>
                    </td>
                    <td className={`py-2 px-1 sm:py-3 sm:px-2 font-semibold text-[9px] sm:text-sm whitespace-nowrap ${typeMeta.flow === 'expense' ? 'text-red-600' : 'text-emerald-600'}`}>
                      <span className="hidden sm:inline">{typeMeta.flow === 'expense' ? '-' : ''}${parseFloat(payment.amount).toFixed(2)}</span>
                      <span className="sm:hidden">{typeMeta.flow === 'expense' ? '-' : ''}${Math.round(parseFloat(payment.amount))}</span>
                    </td>
                    <td className="py-3 px-2 sm:px-4 text-sm hidden md:table-cell">
                      <select
                        value={payment.payment_method}
                        onChange={async (e) => {
                          try {
                            await updatePayment(payment.id, { payment_method: e.target.value })
                            notify('결제 방법이 업데이트되었습니다 ')
                            loadData({ background: true })
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
          <div className="space-y-4">
            {activeMatches.length === 0 ? (
              <p className="text-center text-gray-500 py-6">진행 중인 매치가 없습니다.</p>
            ) : (
              <>
                <div className="text-sm font-semibold text-gray-800">최근 · 진행 중 매치</div>
                {paginatedMatches.map((match, idx) => {
                  const globalIdx = (matchFeesPage - 1) * matchFeesPerPage + idx
                  return (
                    <MatchFeesSection
                      key={match.id}
                      match={match}
                      players={players}
                      isVoided={Boolean(match.isVoided)}
                      isRecent={globalIdx === 0}
                      onSync={(matchId) => {
                        if (matchId) {
                          setMatchesLocal(prev => prev.map(m => m.id === matchId ? { ...m, hiddenFromAccounting: true } : m))
                        }
                        loadData({ background: false })
                      }}
                    />
                  )
                })}

                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
                    <div>
                      {matchPageStart}–{matchPageEnd} / {activeMatches.length}개의 진행 중 매치
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span>페이지당</span>
                      <select
                        value={matchFeesPerPage}
                        onChange={(e) => {
                          const next = Number(e.target.value) || 5
                          setMatchFeesPerPage(next)
                          setMatchFeesPage(1)
                        }}
                        className="border rounded-lg px-2 py-1"
                      >
                        {[5,10,20].map(size => (
                          <option key={size} value={size}>{size}개</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2">
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
                </div>
              </>
            )}

            {voidMatches.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50/30">
                <button
                  onClick={() => setShowVoidMatches(prev => !prev)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <span>VOID 처리된 매치 ({voidMatches.length}개)</span>
                  <span className="text-xs text-red-500">{showVoidMatches ? '접기' : '펼치기'}</span>
                </button>

                {showVoidMatches && (
                  <div className="space-y-2 px-3 pb-3">
                    {voidMatches.map(match => (
                      <MatchFeesSection
                        key={match.id}
                        match={match}
                        players={players}
                        isVoided={true}
                        isRecent={false}
                        onSync={(matchId) => {
                          if (matchId) {
                            setMatchesLocal(prev => prev.map(m => m.id === matchId ? { ...m, hiddenFromAccounting: true } : m))
                          }
                          loadData({ background: false })
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {selectedTab === 'renewals' && (
        <Card title="회비 리뉴얼 & 미납 현황">
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[{
                label: '연체',
                value: renewalStats.overdue,
                accent: 'text-red-600',
                bg: 'bg-red-50',
                helper: '즉시 처리 필요'
              }, {
                label: '임박',
                value: renewalStats.dueSoon,
                accent: 'text-amber-600',
                bg: 'bg-amber-50',
                helper: '7~30일 내 만료'
              }, {
                label: '정상',
                value: renewalStats.ok,
                accent: 'text-emerald-600',
                bg: 'bg-emerald-50',
                helper: '일정 안정'
              }, {
                label: '미설정',
                value: renewalStats.noPlan,
                accent: 'text-gray-600',
                bg: 'bg-gray-100',
                helper: '납부 방식 없음'
              }].map(stat => (
                <div key={stat.label} className={`p-4 rounded-xl border ${stat.bg}`}>
                  <div className={`text-sm font-semibold ${stat.accent}`}>{stat.label}</div>
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-xs text-gray-600 mt-1">{stat.helper}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500">
              추적 선수 {renewalStats.total}명 · 월회비 {renewalStats.monthly}명 · 연회비 {renewalStats.annual}명
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <input
                  type="text"
                  value={renewalSearch}
                  onChange={e => setRenewalSearch(e.target.value)}
                  placeholder="선수 이름 검색"
                  className="w-full border rounded-lg py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    { key: 'all', label: '전체' },
                    { key: 'overdue', label: `연체 (${renewalStats.overdue})` },
                    { key: 'due-soon', label: `임박 (${renewalStats.dueSoon})` },
                    { key: 'ok', label: `정상 (${renewalStats.ok})` },
                    { key: 'no-plan', label: `미설정 (${renewalStats.noPlan})` }
                  ].map(filter => (
                    <button
                      key={filter.key}
                      onClick={() => setRenewalFilter(filter.key)}
                      className={`px-3 py-1.5 rounded-full border ${
                        renewalFilter === filter.key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setRenewalShowDetails(prev => !prev)}
                  className={`self-start px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    renewalShowDetails
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {renewalShowDetails ? '상세 보기 켜짐' : '상세 보기 꺼짐'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {filteredRenewalEntries.length === 0 && (
                <div className="border rounded-xl p-8 text-center text-sm text-gray-500">
                  조건에 맞는 선수가 없습니다.
                </div>
              )}
              {filteredRenewalEntries.map(entry => (
                <RenewalStatusCard
                  key={entry.player.id}
                  entry={entry}
                  onPreferenceChange={handleUpdateRenewalPreference}
                  quickPaymentSuggestions={{ monthly: duesAmountMap.monthly, annual: duesAmountMap.annual }}
                  onQuickPayment={handleQuickRenewalPayment}
                  quickSaving={Boolean(renewalSaving[entry.player.id])}
                  onManualReset={handleRenewalManualReset}
                  onManualResetClear={handleRenewalManualResetClear}
                  manualResetSaving={Boolean(manualResetSaving[`${entry.player.id}:${entry.billingType}`])}
                  showDetails={renewalShowDetails}
                />
              ))}
            </div>
            <div className="text-xs text-gray-500">
              * 최근 결제 이력을 기반으로 월/연회비 주기를 자동 판단합니다. 빠른 기록 버튼을 사용하면 결제 탭이 열리고 선수/항목이 자동 선택됩니다.
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
              await hardDeleteMatchPayment(payment.match_id, payment.player_id)
            } else {
              await deletePayment(payment.id)
            }
            notify('삭제되었습니다')
            loadData({ background: true })
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
                return hardDeleteMatchPayment(payment.match_id, payment.player_id)
              } else {
                return deletePayment(paymentId)
              }
            })
            const results = await Promise.allSettled(deletePromises)
            const successCount = results.filter(r => r.status === 'fulfilled').length
            const failCount = results.filter(r => r.status === 'rejected').length
            if (failCount === 0) notify(`${successCount}개의 결제 내역이 삭제되었습니다 `)
            else notify(`${successCount}개 삭제 성공, ${failCount}개 실패`)
            setSelectedPayments(new Set())
            loadData({ background: true })
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

function StepHeader({ step, title, description }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center">
        {step}
      </div>
      <div>
        <div className="font-semibold text-gray-900">{title}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
    </div>
  )
}

function SelectedPlayerTray({ players, selectedIds = [], onRemove, onClear }) {
  const hasSelection = selectedIds.length > 0

  return (
    <div className={`rounded-xl border ${hasSelection ? 'border-blue-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'} p-3`}>
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className="font-semibold">
          {hasSelection ? `선택된 선수 ${selectedIds.length}명` : '선수를 선택하면 여기에서 한눈에 확인할 수 있어요'}
        </span>
        {hasSelection && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-gray-500 hover:text-gray-800 underline"
          >
            전체 해제
          </button>
        )}
      </div>
      {hasSelection ? (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedIds.map(playerId => {
            const player = players.find(p => p.id === playerId)
            if (!player) return null
            return (
              <div key={playerId} className="inline-flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-full border border-blue-200 text-[11px]">
                <InitialAvatar id={player.id} name={player.name} size={16} photoUrl={player.photoUrl} />
                <span className="text-gray-800">{player.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove?.(playerId)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[11px] text-gray-500 mt-2">
          검색 결과에서 클릭하거나 Enter를 눌러 선수를 추가해 주세요.
        </div>
      )}
    </div>
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

function RenewalStatusCard({
  entry,
  onPreferenceChange,
  quickPaymentSuggestions = {},
  onQuickPayment,
  quickSaving,
  onManualReset,
  onManualResetClear,
  manualResetSaving,
  showDetails = true
}) {
  const statusTone = {
    overdue: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
    'due-soon': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
    'no-plan': { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
    ok: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' }
  }
  const tone = statusTone[entry.status] || statusTone.ok
  const daysLabel = entry.daysUntilDue === null
    ? '미정'
    : entry.daysUntilDue >= 0
      ? `${entry.daysUntilDue}일`
      : `${Math.abs(entry.daysUntilDue)}일 지연`
  const allowTypeSelect = entry.billingType === 'unknown'
  const initialQuickType = allowTypeSelect ? 'monthly' : entry.billingType
  const [quickType, setQuickType] = useState(initialQuickType || 'monthly')
  useEffect(() => {
    setQuickType(allowTypeSelect ? 'monthly' : entry.billingType || 'monthly')
  }, [entry.billingType, allowTypeSelect])

  const effectiveQuickType = allowTypeSelect ? quickType : entry.billingType

  const getDefaultAmount = useCallback((type) => {
    if (type === 'annual') return quickPaymentSuggestions.annual ?? ''
    if (type === 'monthly') return quickPaymentSuggestions.monthly ?? ''
    return ''
  }, [quickPaymentSuggestions])

  const [quickAmount, setQuickAmount] = useState(() => getDefaultAmount(effectiveQuickType))
  const [quickDate, setQuickDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [quickMethod, setQuickMethod] = useState('venmo')

  useEffect(() => {
    if (effectiveQuickType === 'monthly' && entry.outstandingAmount > 0) {
      setQuickAmount(entry.outstandingAmount.toString())
      return
    }
    setQuickAmount(getDefaultAmount(effectiveQuickType))
  }, [effectiveQuickType, entry.outstandingAmount, getDefaultAmount])

  const outstandingAmountLabel = entry.outstandingAmount > 0 ? formatCurrency(entry.outstandingAmount) : null
  const summaryInfo = [
    {
      label: '적용 모드',
      value: entry.preference === 'auto' ? `${entry.billingLabel} (자동)` : entry.billingLabel
    },
    {
      label: '최근 납부',
      value: entry.lastPaidLabel
    },
    {
      label: '다음 납부',
      value: entry.nextDueLabel
    },
    {
      label: '남은 일수',
      value: daysLabel
    }
  ]

  return (
    <div className="border rounded-2xl p-5 bg-white shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <InitialAvatar id={entry.player.id} name={entry.player.name} size={40} photoUrl={entry.player.photoUrl} />
          <div>
            <div className="font-semibold text-gray-900 text-base">{entry.player.name}</div>
            <div className="text-xs text-gray-500">
              {entry.billingLabel}
              {entry.player.membership && ` · ${entry.player.membership}`}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-xs items-start lg:items-end">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full font-semibold ${tone.bg} ${tone.text} border ${tone.border}`}>
              {entry.statusLabel}
            </span>
            <span className="text-gray-500">{entry.statusDescription}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-gray-500">납부 방식</span>
            <select
              value={entry.preference}
              onChange={(e) => onPreferenceChange(entry.player.id, e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs"
            >
              <option value="auto">자동 감지</option>
              <option value="monthly">월회비</option>
              <option value="annual">연회비</option>
            </select>
          </div>
        </div>
      </div>

      {showDetails ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-sm">
            {summaryInfo.map(info => (
              <div key={info.label} className="p-3 rounded-xl border bg-gray-50">
                <div className="text-xs text-gray-500">{info.label}</div>
                <div className="font-semibold text-gray-900">{info.value}</div>
              </div>
            ))}
          </div>

          {entry.billingType === 'monthly' && entry.missedMonthsTotal > 0 && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <div className="font-semibold">
                총 미납 {entry.missedMonthsTotal}개월
                {entry.missedMonthsHidden > 0 && (
                  <span className="text-[11px] text-red-500">
                    {' '}(최근 {DISPLAY_MISSED_MONTH_LIMIT}개월 중 {entry.missedMonths.length}개월 표시)
                  </span>
                )}
              </div>
              <div className="mt-1 text-red-700">
                {entry.missedMonths.join(', ')}
              </div>
              {outstandingAmountLabel && (
                <div className="mt-1 font-semibold text-red-700">
                  총 미납 금액: {outstandingAmountLabel}
                </div>
              )}
              {entry.missedMonthsHidden > 0 && (
                <div className="mt-1 text-[11px] text-red-500">
                  나머지 {entry.missedMonthsHidden}개월은 목록에 표시되지 않지만 연체 금액에 포함되었습니다.
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            {summaryInfo.map(info => (
              <div key={info.label} className="p-2 rounded-lg border bg-gray-50">
                <div className="text-gray-500">{info.label}</div>
                <div className="font-semibold text-gray-900">{info.value}</div>
              </div>
            ))}
          </div>
          {entry.billingType === 'monthly' && entry.missedMonthsTotal > 0 && (
            <div className="mt-2 text-[11px] text-red-600">
              미납 {entry.missedMonthsTotal}개월 · {outstandingAmountLabel || '금액 계산 중'}
            </div>
          )}
        </>
      )}

      <div className={`mt-4 ${showDetails ? 'flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between text-sm' : 'flex flex-col gap-2 text-xs'}`}>
        <div className="text-gray-600 text-xs">{entry.recommendation}</div>
        <div className="flex flex-wrap gap-2">
          {entry.manualResetActive ? (
            <button
              onClick={() => onManualResetClear(entry.player.id, entry.billingType)}
              disabled={manualResetSaving}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              정상 처리 해제
            </button>
          ) : (
            <button
              onClick={() => onManualReset(entry.player.id, entry.billingType)}
              disabled={manualResetSaving}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              정상 처리
            </button>
          )}
        </div>
      </div>

      {showDetails ? (
        <div className="mt-4 border rounded-2xl bg-gray-50 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-3">
            빠른 결제 입력
            <span className="text-gray-400">Payments 탭 이동 없이 기록</span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            {allowTypeSelect && (
              <div>
                <label className="text-xs text-gray-500">납부 유형</label>
                <select
                  value={quickType}
                  onChange={(e) => setQuickType(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="monthly">월회비</option>
                  <option value="annual">연회비</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">결제 방식</label>
              <select
                value={quickMethod}
                onChange={(e) => setQuickMethod(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                {Object.entries(paymentMethodLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">금액</label>
              <input
                type="number"
                step="0.01"
                value={quickAmount}
                onChange={(e) => setQuickAmount(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">납부일</label>
              <input
                type="date"
                value={quickDate}
                onChange={(e) => setQuickDate(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onQuickPayment({
                  playerId: entry.player.id,
                  billingType: effectiveQuickType,
                  amount: quickAmount,
                  paymentDate: quickDate,
                  paymentMethod: quickMethod
                })}
                disabled={quickSaving || !quickAmount || !effectiveQuickType || !quickMethod}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {quickSaving ? '기록 중...' : '빠른 입력'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[11px] text-gray-500">
          빠른 결제 입력은 상세 보기 모드에서 이용할 수 있습니다.
        </div>
      )}
    </div>
  )
}

function MatchFeesSection({ match, players, isVoided = false, isRecent = false, onSync = () => {} }) {
  const [matchPayments, setMatchPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showReimbursement, setShowReimbursement] = useState(false)
  const [confirmState, setConfirmState] = useState({ open: false, kind: null, payload: null })
  const [overrideInput, setOverrideInput] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [voidDialogState, setVoidDialogState] = useState({ open: false, reason: '', processing: false })
  const [deleteDialogState, setDeleteDialogState] = useState({ open: false, processing: false })
  const [selectedPlayers, setSelectedPlayers] = useState(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const VOID_ACTION_MESSAGE = 'VOID 처리된 매치는 개요 탭에서 복구하기 전까지 조정할 수 없습니다'

  useEffect(() => {
    loadMatchPayments()
    const initial = match.fees?.total ?? match.totalCost ?? ''
    setOverrideInput(initial === null || typeof initial === 'undefined' ? '' : String(initial))
    setIsCollapsed(true)
  }, [match.id, isRecent])

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

  const abortIfVoided = () => {
    if (!isVoided) return false
    notify(VOID_ACTION_MESSAGE)
    return true
  }

  async function handleConfirmPayment(playerId, amount) {
    if (abortIfVoided()) return
    try {
      await confirmMatchPayment(match.id, playerId, amount, 'venmo')
      notify('납부가 확인되었습니다', 'success')
      await loadMatchPayments()
      await onSync()
    } catch (error) {
      notify('납부 확인 실패')
    }
  }

  async function handleCancelPayment(playerId) {
    if (abortIfVoided()) return
    setConfirmState({ open: true, kind: 'cancel-payment', payload: { playerId } })
  }

  function handleCancelAllPayments() {
    if (abortIfVoided()) return
    const paidPlayers = matchPayments.filter(p => p.payment_status === 'paid').map(p => p.player_id)
    if (paidPlayers.length === 0) {
      notify('취소할 납부가 없습니다')
      return
    }
    setConfirmState({ open: true, kind: 'cancel-all', payload: { playerIds: paidPlayers } })
  }

  async function handleReimbursement(playerId, amount) {
    if (abortIfVoided()) return
    setConfirmState({ open: true, kind: 'reimburse', payload: { playerId, amount } })
  }

  const handleVoidMatch = async () => {
    if (voidDialogState.processing) return
    setVoidDialogState(prev => ({ ...prev, processing: true }))
    try {
      // 1) 먼저 해당 매치의 모든 납부 결제를 삭제
      const paidPayments = matchPayments.filter(p => p.payment_status === 'paid')
      if (paidPayments.length > 0) {
        await Promise.all(
          paidPayments.map(p => hardDeleteMatchPayment(match.id, p.player_id))
        )
      }
      
      // 2) 매치를 VOID 처리
      await updateMatchInDB(match.id, { 
        isVoided: true, 
        voidReason: voidDialogState.reason?.trim() || null, 
        voidedAt: new Date().toISOString() 
      })
      notify('매치가 VOID 처리되고 모든 결제 내역이 삭제되었습니다')
      if (onSync) await onSync()
    } catch {
      notify('VOID 처리 실패')
    } finally {
      setVoidDialogState({ open: false, reason: '', processing: false })
    }
  }

  const handleRestoreMatch = async () => {
    try {
      await updateMatchInDB(match.id, { isVoided: false, voidReason: null, voidedAt: null, voidedBy: null })
      notify('매치가 복구되었습니다 ')
      if (onSync) await onSync()
    } catch {
      notify('복구 실패')
    }
  }

  const handleDeleteMatch = async () => {
    if (deleteDialogState.processing) return
    setDeleteDialogState(prev => ({ ...prev, processing: true }))
    try {
      await updateMatchInDB(match.id, { hiddenFromAccounting: true })
      notify('회계 페이지에서 숨김 처리되었습니다 ')
      // 매치 리스트 즉시 새로고침 (matchId 전달)
      if (onSync) await onSync(match.id)
    } catch {
      notify('숨김 처리 실패')
    } finally {
      setDeleteDialogState({ open: false, processing: false })
    }
  }

  const togglePlayerSelection = (playerId) => {
    setSelectedPlayers(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
  }

  const handleBulkConfirm = async () => {
    if (abortIfVoided() || selectedPlayers.size === 0) return
    setBulkProcessing(true)
    try {
      const unpaidSelected = Array.from(selectedPlayers).filter(playerId => {
        const payment = matchPayments.find(p => p.player_id === playerId)
        return !payment || payment.payment_status !== 'paid'
      })
      
      await Promise.all(
        unpaidSelected.map(playerId => {
          const player = players.find(p => p.id === playerId)
          const expected = calculatePlayerMatchFee(match, player, players)
          return confirmMatchPayment(match.id, playerId, expected, 'venmo')
        })
      )
      
      notify(`${unpaidSelected.length}명의 납부를 확인했습니다`)
      setSelectedPlayers(new Set())
      await loadMatchPayments()
      await onSync()
    } catch (error) {
      notify('일괄 확인 실패')
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleBulkCancel = async () => {
    if (abortIfVoided() || selectedPlayers.size === 0) return
    setBulkProcessing(true)
    try {
      const paidSelected = Array.from(selectedPlayers).filter(playerId => {
        const payment = matchPayments.find(p => p.player_id === playerId)
        return payment && payment.payment_status === 'paid'
      })
      
      await Promise.all(
        paidSelected.map(playerId => cancelMatchPayment(match.id, playerId))
      )
      
      notify(`${paidSelected.length}명의 납부를 취소했습니다`)
      setSelectedPlayers(new Set())
      await loadMatchPayments()
      await onSync()
    } catch (error) {
      notify('일괄 취소 실패')
    } finally {
      setBulkProcessing(false)
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
  const participantPlayers = participantIds
    .map(id => players.find(p => p.id === id))
    .filter(Boolean)
  const memberCount = participantPlayers.filter(p => isMember(p.membership)).length
  const guestCount = Math.max(0, participantPlayers.length - memberCount)
  const totalParticipants = participantIds.length

  const normalizeNumber = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  const plannedFromMeta =
    normalizeNumber(match.totalCost) ??
    normalizeNumber(match.fees?.total) ??
    normalizeNumber(match.venueTotalOverride)
  const derivedPlanned = normalizeNumber(memberFee * memberCount + guestFee * guestCount)
  const plannedTotalBase = normalizeNumber(plannedFromMeta ?? derivedPlanned ?? 0) || 0
  const plannedTotal = overrideInput ? (Number(overrideInput) || 0) : plannedTotalBase
  const paidCount = matchPayments.filter(p => p.payment_status === 'paid').length
  const unpaidCount = Math.max(0, totalParticipants - paidCount)
  const collectedTotal = matchPayments
    .filter(p => p.payment_status === 'paid')
    .reduce((sum, p) => sum + Number(p.paid_amount || p.expected_amount || 0), 0)
  const isFullyPaid = totalParticipants > 0 && paidCount === totalParticipants
  const isPaidMap = new Map(matchPayments.map(p => [p.player_id, p.payment_status === 'paid']))
  const sortedParticipantIds = [...participantIds].sort((a, b) => {
    const paidA = Boolean(isPaidMap.get(a))
    const paidB = Boolean(isPaidMap.get(b))
    if (paidA !== paidB) return Number(paidA) - Number(paidB) // unpaid first
    const nameA = (players.find(p => p.id === a)?.name || '').toLowerCase()
    const nameB = (players.find(p => p.id === b)?.name || '').toLowerCase()
    return nameA.localeCompare(nameB)
  })

  return (
    <div className={`border rounded-lg p-4 relative ${isVoided ? 'border-red-200 bg-red-50/40' : ''}`}>
      <div className="absolute -top-4 -right-4 flex items-center gap-2">
        {isVoided && (
          <button
            onClick={() => setDeleteDialogState({ open: true, processing: false })}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full border shadow-sm text-[11px] font-medium transition-colors bg-red-600 text-white border-red-700 hover:bg-red-700"
            title="매치 삭제"
          >
            <Trash2 size={14} />
            <span>삭제</span>
          </button>
        )}
        <button
          onClick={() => {
            if (isVoided) {
              handleRestoreMatch()
            } else {
              setVoidDialogState({ open: true, reason: match.voidReason || '', processing: false })
            }
          }}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border shadow-sm text-[11px] font-medium transition-colors ${isVoided ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
          title={isVoided ? 'VOID 복구' : 'VOID 처리'}
        >
          {isVoided ? <RefreshCw size={14} /> : <AlertCircle size={14} />}
          <span>{isVoided ? 'VOID 복구' : 'VOID 처리'}</span>
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <span>{matchDate}</span>
            {isVoided && <span className="rounded px-2 py-0.5 text-[11px] bg-red-100 text-red-700">VOID</span>}
            {!isVoided && isFullyPaid && (
              <span className="rounded px-2 py-0.5 text-[11px] bg-emerald-100 text-emerald-700">완납</span>
            )}
            {!isVoided && !isFullyPaid && totalParticipants > 0 && (
              <span className="rounded px-2 py-0.5 text-[11px] bg-amber-100 text-amber-700">미납 {unpaidCount}명</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            {match.location?.name || '장소 미정'} · {totalParticipants}명 · 멤버 ${memberFee.toFixed(2)} / 게스트 ${guestFee.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-gray-700">
            예정 구장비 ${plannedTotal.toFixed(2)} · 실수령 ${collectedTotal.toFixed(2)}
          </div>
          {!isCollapsed && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-600 flex-wrap">
              <span className="font-semibold">예정 구장비 직접 설정</span>
              <input
                type="number"
                step="0.5"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder={plannedTotalBase ? plannedTotalBase.toFixed(2) : '예: 150'}
                className="w-28 border rounded px-2 py-1 text-[11px]"
                disabled={isVoided || savingOverride}
              />
              <button
                onClick={async () => {
                  if (isVoided) return
                  const num = Number(overrideInput)
                  if (!Number.isFinite(num) || num < 0) {
                    notify('0 이상의 숫자를 입력해주세요')
                    return
                  }
                  setSavingOverride(true)
                  try {
                    const nextFees = { ...(match.fees || {}), total: num }
                    await updateMatchInDB(match.id, { fees: nextFees })
                    notify('예정 구장비가 저장되었습니다')
                    if (onSync) await onSync()
                  } catch (e) {
                    notify('예정 구장비 저장 실패')
                  } finally {
                    setSavingOverride(false)
                  }
                }}
                disabled={isVoided || savingOverride}
                className="px-2 py-1 rounded bg-blue-500 text-white text-[11px] hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingOverride ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => {
                  setOverrideInput('')
                }}
                disabled={isVoided || savingOverride || overrideInput === ''}
                className="px-2 py-1 rounded border text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-40"
              >
                초기화
              </button>
            </div>
          )}
          {isVoided && (
            <div className="mt-2 space-y-1 text-xs">
              <div className="inline-flex items-center gap-1 font-semibold text-red-600">
                <AlertCircle size={14} />
                <span>VOID 처리됨 · 집계에서 제외</span>
              </div>
              {match.voidReason && (
                <div className="text-red-700">사유: {match.voidReason}</div>
              )}
              {match.voidedAt && (
                <div className="text-[11px] text-gray-500">
                  처리 시각 {new Date(match.voidedAt).toLocaleString('ko-KR')}
                </div>
              )}
            </div>
          )}
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
            title={
              confirmState.kind === 'cancel-payment'
                ? '납부 확인 취소'
                : confirmState.kind === 'cancel-all'
                  ? '전체 납부 취소'
                  : '상환 처리'
            }
            message={
              confirmState.kind === 'cancel-payment'
                ? '납부 확인을 취소하시겠습니까?'
                : confirmState.kind === 'cancel-all'
                  ? `${confirmState.payload?.playerIds?.length || 0}건의 납부 확인을 모두 취소하시겠습니까?`
                  : '이 선수에게 상환 처리하시겠습니까?'
            }
            confirmLabel={
              confirmState.kind === 'cancel-payment'
                ? '취소하기'
                : confirmState.kind === 'cancel-all'
                  ? '전체 취소'
                  : '상환 처리'
            }
            cancelLabel="닫기"
            tone="danger"
            onCancel={() => setConfirmState({ open: false, kind: null, payload: null })}
            onConfirm={async () => {
              try {
                if (confirmState.kind === 'cancel-payment') {
                  await cancelMatchPayment(match.id, confirmState.payload.playerId)
                  notify('납부 확인이 취소되었습니다')
                  await loadMatchPayments()
                  await onSync()
                } else if (confirmState.kind === 'cancel-all') {
                  const ids = confirmState.payload?.playerIds || []
                  const results = await Promise.allSettled(ids.map(playerId => cancelMatchPayment(match.id, playerId)))
                  const successCount = results.filter(r => r.status === 'fulfilled').length
                  const failCount = results.length - successCount
                  if (successCount > 0) notify(`${successCount}건의 납부를 취소했습니다 `)
                  if (failCount > 0) notify(`${failCount}건 취소 실패`)
                  await loadMatchPayments()
                  await onSync()
                } else if (confirmState.kind === 'reimburse') {
                  await addPayment({
                    playerId: confirmState.payload.playerId,
                    paymentType: 'reimbursement',
                    amount: confirmState.payload.amount,
                    paymentMethod: 'venmo',
                    paymentDate: new Date().toISOString(),
                    notes: `${match.location?.name || '매치'} 구장비 대신 결제`
                  })
                  notify('상환 처리되었습니다 ')
                  setShowReimbursement(false)
                  await onSync()
                }
              } catch (error) {
                notify(
                  confirmState.kind === 'reimburse'
                    ? '상환 처리 실패'
                    : '취소 실패'
                )
              } finally {
                setConfirmState({ open: false, kind: null, payload: null })
              }
            }}
          />
            <div className="text-xs text-gray-600">납부율</div>
            <div className="text-lg font-bold text-emerald-600">
              {paidCount} / {participantIds.length}
            </div>
          </div>
          {match.paidBy && (
            <button
              onClick={() => {
                handleReimbursement(match.paidBy, plannedTotal)
              }}
              disabled={isVoided}
              title={isVoided ? VOID_ACTION_MESSAGE : undefined}
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              상환
            </button>
          )}
          {!isCollapsed && (
            <button
              onClick={handleCancelAllPayments}
              disabled={isVoided || paidCount === 0}
              title={isVoided ? VOID_ACTION_MESSAGE : paidCount === 0 ? '취소할 납부가 없습니다' : undefined}
              className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              전체 취소
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-center mb-2 text-gray-600 text-xs">
        <button
          onClick={() => setIsCollapsed(prev => !prev)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors"
          title={isCollapsed ? '상세 열기' : '상세 접기'}
        >
          <span className="font-medium">{isCollapsed ? '상세 보기' : '상세 닫기'}</span>
          {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {isVoided && (
            <div className="mb-3 rounded border border-red-200 bg-white/80 px-3 py-2 text-xs text-red-700">
              이 매치는 VOID 처리되어 요약/미납 집계에서 제외됩니다. 복구도 동일한 위치에서만 가능합니다.
            </div>
          )}

          {selectedPlayers.size > 0 && !isVoided && (
            <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 flex items-center justify-between">
              <span className="text-sm text-blue-700">
                {selectedPlayers.size}명 선택됨
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkConfirm}
                  disabled={bulkProcessing}
                  className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40"
                >
                  {bulkProcessing ? '처리 중...' : '선택 확인'}
                </button>
                <button
                  onClick={handleBulkCancel}
                  disabled={bulkProcessing}
                  className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-40"
                >
                  {bulkProcessing ? '처리 중...' : '선택 취소'}
                </button>
                <button
                  onClick={() => setSelectedPlayers(new Set())}
                  className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                >
                  선택 해제
                </button>
              </div>
            </div>
          )}

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
              {sortedParticipantIds.map(playerId => {
                const player = players.find(p => p.id === playerId)
                const payment = matchPayments.find(p => p.player_id === playerId)
                const isPaid = payment?.payment_status === 'paid'
                const expected = calculatePlayerMatchFee(match, player, players)
                const isSelected = selectedPlayers.has(playerId)

                return (
                  <tr
                    key={playerId}
                    onClick={() => !isVoided && togglePlayerSelection(playerId)}
                    className={`border-b last:border-b-0 transition-all ${isPaid ? 'bg-emerald-50' : isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-100'} ${isSelected ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'} ${!isVoided ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <InitialAvatar id={player?.id} name={player?.name||'?'} size={24} photoUrl={player?.photoUrl} />
                        <span className="font-medium notranslate" translate="no">{player?.name || 'Unknown'}</span>
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
                          disabled={isVoided}
                          title={isVoided ? VOID_ACTION_MESSAGE : undefined}
                          className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          취소
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConfirmPayment(playerId, expected)}
                          disabled={isVoided}
                          title={isVoided ? VOID_ACTION_MESSAGE : undefined}
                          className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
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
        </>
      )}

      {/* VOID 처리 다이얼로그 */}
      <ConfirmDialog
        open={voidDialogState.open}
        title="매치 VOID 처리"
        message="선택한 매치는 VOID 처리 즉시 재정 요약과 미납 목록에서 제외됩니다.\n사유를 남겨두면 이후 감사 시 추적이 용이합니다."
        confirmLabel={voidDialogState.processing ? '처리 중...' : 'VOID 처리'}
        cancelLabel="돌아가기"
        tone="danger"
        onCancel={() => setVoidDialogState({ open: false, reason: '', processing: false })}
        onConfirm={handleVoidMatch}
      >
        <div className="space-y-2">
          <label htmlFor="void-reason-input" className="text-xs font-medium text-gray-600">VOID 사유 (선택)</label>
          <textarea
            id="void-reason-input"
            rows={3}
            value={voidDialogState.reason}
            onChange={(e) => setVoidDialogState(prev => ({ ...prev, reason: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder="예: 우천 취소, 오류 정정, 대관비 환불"
          />
          <p className="text-[11px] text-gray-500">
            VOID 상태는 복구 전까지 수정이 잠기며, 이 탭에서 바로 VOID 해제할 수 있습니다.
          </p>
        </div>
      </ConfirmDialog>

      {/* 스프레드시트 탭은 AccountingPage 메인 컴포넌트로 이동됨 */}

      {/* 매치 숨김 확인 다이얼로그 */}
      <ConfirmDialog
        open={deleteDialogState.open}
        title="회계에서 매치 숨기기"
        message="이 매치를 회계 페이지에서 숨기시겠습니까?
        매치 데이터는 유지되며, 다른 페이지에서는 계속 표시됩니다."
        confirmLabel={deleteDialogState.processing ? '처리 중...' : '숨기기'}
        cancelLabel="취소"
        tone="danger"
        onCancel={() => setDeleteDialogState({ open: false, processing: false })}
        onConfirm={handleDeleteMatch}
      />
    </div>
  )
}