// src/App.jsx
import React,{useEffect,useMemo,useState,useCallback,useRef,lazy,Suspense}from"react"
import{Home,Users,CalendarDays,ListChecks,ShieldCheck,Lock,Eye,EyeOff,AlertCircle,CheckCircle2,X,Settings,BookOpen,Shuffle,DollarSign}from"lucide-react"
import{useTranslation}from"react-i18next"
import{listPlayers,upsertPlayer,deletePlayer,subscribePlayers,saveDB,logVisit,getVisitStats,USE_MATCHES_TABLE}from"./services/storage.service"
import{listUpcomingMatches,createUpcomingMatch as createUpcomingMatchRecord,updateUpcomingMatch as updateUpcomingMatchRecord,deleteUpcomingMatch as deleteUpcomingMatchRecord,subscribeUpcomingMatches}from"./services/upcomingMatches.service"
import{listTagPresets,createTagPreset as createTagPresetRecord,updateTagPreset as updateTagPresetRecord,deleteTagPreset as deleteTagPresetRecord,subscribeTagPresets}from"./services/tagPresets.service"
import{getVisitTotal,incrementVisitTotal,subscribeVisitTotals}from"./services/visitTotals.service"
import{saveMatchToDB,updateMatchInDB,deleteMatchFromDB,listMatchesFromDB,subscribeMatches}from"./services/matches.service"
import{getMembershipSettings,subscribeMembershipSettings}from"./services/membership.service"
import{mkPlayer,isUnknownPlayer,isSystemAccount,mkSystemAccount}from"./lib/players";import{notify}from"./components/Toast"
import{filterExpiredMatches, normalizeDateISO}from"./lib/upcomingMatch"
import{getOrCreateVisitorId,getVisitorIP,parseUserAgent,shouldTrackVisit,isPreviewMode,isDevelopmentEnvironment}from"./lib/visitorTracking"
import{signInAdmin,signOut,getSession,onAuthStateChange,isDeveloperEmail}from"./lib/auth"
import{logger}from"./lib/logger"
import{TEAM_CONFIG}from"./lib/teamConfig"

// 개발자 이메일 설정
const DEVELOPER_EMAIL = 'sonhyosuck@gmail.com'
import{runMigrations}from"./lib/dbMigration"
import ToastHub from"./components/Toast";import Card from"./components/Card"
import ErrorBoundary from "./components/ErrorBoundary"
import { prefetchSeasonRecapVideos } from './components/SeasonRecap'
import AdminLoginDialog from"./components/AdminLoginDialog"
import VisitorStats from"./components/VisitorStats"
import ProdDataWarning from"./components/ProdDataWarning"
import LanguageSwitcher from"./components/LanguageSwitcherNew"
import Dashboard from"./pages/Dashboard";import PlayersPage from"./pages/PlayersPage";import MaintenancePage from"./pages/MaintenancePage"
import logoUrl from"./assets/GoalifyLogo.png"
import{getAppSettings,loadAppSettingsFromServer,updateAppTitle,updateSeasonRecapEnabled,updateMaintenanceMode,updateFeatureEnabled,updateLeaderboardCategoryEnabled,updateBadgeTierOverrides}from"./lib/appSettings"
import { localDateTimeToUTC } from './lib/dateUtils'
import { getBadgeTierRuleCatalog } from './lib/playerBadgeEngine'
import { isDraftMatch } from './lib/matchHelpers'

const IconPitch=({size=16})=>(<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden role="img" className="shrink-0"><rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="18.5" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>)

const MatchPlanner=lazy(()=>import("./pages/MatchPlanner"))
const RefereeMode=lazy(()=>import("./pages/RefereeMode"))
const DraftPage=lazy(()=>import("./pages/DraftPage"))
const FormationBoard=lazy(()=>import("./pages/FormationBoard"))
const StatsInput=lazy(()=>import("./pages/StatsInput"))
const AccountingPage=lazy(()=>import("./pages/AccountingPage"))
const AnalyticsPage=lazy(()=>import("./pages/AnalyticsPage"))
const InviteSetupPage=lazy(()=>import("./pages/InviteSetupPage"))
const AuthLinkErrorPage=lazy(()=>import("./pages/AuthLinkErrorPage"))
const SettingsPage=lazy(()=>import("./pages/SettingsPage"))

// 타임아웃 래퍼 유틸리티
const withTimeout = (promise, ms, label) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)
    )
  ]).catch(err => {
    logger.warn(`⏱️ Network timeout: ${label}`, err.message)
    return null
  })
}

function App(){
  const { t } = useTranslation()
  const isSandboxMode = TEAM_CONFIG.sandboxMode || false
  const[tab,setTab]=useState("dashboard"),[db,setDb]=useState({players:[],matches:[],visits:0,upcomingMatches:[],tagPresets:[],membershipSettings:[]}),[selectedPlayerId,setSelectedPlayerId]=useState(null)
  const[isAdmin,setIsAdmin]=useState(false),[isAnalyticsAdmin,setIsAnalyticsAdmin]=useState(false),[isSandboxGuest,setIsSandboxGuest]=useState(()=>{
    try { return sessionStorage.getItem('sandboxGuest') === '1' } catch { return false }
  }),[loginOpen,setLoginOpen]=useState(false),[showSandboxLoginHint,setShowSandboxLoginHint]=useState(false)
  const[loading,setLoading]=useState(true)
  const[pageLoading,setPageLoading]=useState(false)
  const[loadError,setLoadError]=useState(null)
  const[loadAttempt,setLoadAttempt]=useState(0)
  const[serverOutage,setServerOutage]=useState(false)
  const[appTitle,setAppTitle]=useState(()=>getAppSettings().appTitle)
  const[seasonRecapEnabled,setSeasonRecapEnabled]=useState(()=>getAppSettings().seasonRecapEnabled)
  const[maintenanceMode,setMaintenanceMode]=useState(()=>getAppSettings().maintenanceMode||false)
  const[featuresEnabled,setFeaturesEnabled]=useState(()=>getAppSettings().features||{})
  const[badgeTierOverrides,setBadgeTierOverrides]=useState(()=>getAppSettings().badgeTierOverrides||{})
  const[appSettingsLoaded,setAppSettingsLoaded]=useState(false)
  const[previewMode,setPreviewMode]=useState(()=>isPreviewMode())
  const[isDev,setIsDev]=useState(()=>isDevelopmentEnvironment())
  const[showInviteSetup,setShowInviteSetup]=useState(false)
  const[showAuthError,setShowAuthError]=useState(false)
  const[authError,setAuthError]=useState({ error:null, errorCode:null, description:null })
  const[activeMatch,setActiveMatch]=useState(null)
  // 시즌 리캡 활성화 시점에 미리 비디오 다운로드
  useEffect(() => {
    if (seasonRecapEnabled) {
      prefetchSeasonRecapVideos()
    }
  }, [seasonRecapEnabled])
  const isRefModeLink = useMemo(() => {
    try {
      const path = (window.location.pathname || '').toLowerCase()
      const params = new URLSearchParams(window.location.search)
      const start = (params.get('start') || '').toLowerCase()
      return (
        path.includes('/refmode') ||
        path.includes('/refapp') ||
        params.get('refMode') === '1' ||
        start.includes('/refmode') ||
        start.includes('/refapp')
      )
    } catch {
      return false
    }
  }, [])
  const refModeMatchId = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('matchId') || params.get('match') || params.get('id')
    } catch {
      return null
    }
  }, [])

  const [refModeDateInput, setRefModeDateInput] = useState('')

  const refModeDateCode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('date') || params.get('day') || params.get('d')
      if (!code) return null
      const cleaned = String(code).replace(/[^0-9]/g, '')
      if (cleaned.length === 4) return cleaned // MMDD
      if (cleaned.length === 8) return cleaned // YYYYMMDD
      return null
    } catch {
      return null
    }
  }, [])


  useEffect(()=>{
    if(refModeDateCode) setRefModeDateInput(refModeDateCode)
  },[refModeDateCode])
  const refModeResolvedRef = useRef(false)
  const[refModeError,setRefModeError]=useState(null)
  const[refModeSelectedId,setRefModeSelectedId]=useState(refModeMatchId||'')
  const[refModeReloadTick,setRefModeReloadTick]=useState(0)
  const[refModeShowCodeModal,setRefModeShowCodeModal]=useState(false)
  const[refModeCodeInput,setRefModeCodeInput]=useState('')

  // Core-load tracking to avoid race-triggered reloads/timeouts
  const coreLoadedRef = useRef(false)

  // Admin 결정 로직: 설정(adminEmails)이 있으면 이를 우선 사용, 없으면 현행 로직 유지
  const computeIsAdmin = React.useCallback((sessionUserEmail, settings) => {
    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const emails = settings?.adminEmails
      if (Array.isArray(emails) && emails.length > 0) {
        const ok = !!sessionUserEmail && emails.some(e => e?.toLowerCase?.() === sessionUserEmail.toLowerCase())
        return ok || isLocalhost // 로컬에서는 편의상 허용
      }
      // 백워드 호환: 설정이 없으면 기존 정책 유지(모든 로그인 사용자 = Admin)
      return !!sessionUserEmail
    } catch {
      return !!sessionUserEmail
    }
  }, [])

  // 초대 토큰/인증 에러 감지 (URL hash에서 확인)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1))
    const type = params.get('type')
    const accessToken = params.get('access_token')
    const error = params.get('error')
    const errorCode = params.get('error_code')
    const errorDescription = params.get('error_description')

    if (error || errorCode) {
      setAuthError({ error, errorCode, description: errorDescription })
      setShowAuthError(true)
      setShowInviteSetup(false)
      return
    }

    if (type === 'invite' && accessToken) {
      logger.log('[App] Invite token detected, showing setup page')
      setShowInviteSetup(true)
    }
  }, [])

  const handleInviteComplete = (user) => {
    logger.log('[App] Invite setup completed for:', user.email)
    setShowInviteSetup(false)
    // 세션이 업데이트되면 자동으로 isAdmin이 설정됨
    window.location.hash = '' // URL hash 정리
  }

  useEffect(()=>{
    if(!isSandboxMode){
      setShowSandboxLoginHint(false)
      return
    }
    setShowSandboxLoginHint(!isAdmin && !isSandboxGuest)
  },[isSandboxMode,isAdmin,isSandboxGuest])

  // 샌드박스 게스트 세션 복원
  useEffect(() => {
    if (!isSandboxMode) return
    try {
      const flag = sessionStorage.getItem('sandboxGuest') === '1'
      if (flag) {
        setIsSandboxGuest(true)
        setIsAdmin(true)
      }
    } catch {
      /* ignore */
    }
  }, [isSandboxMode])

  // 사용자가 수동 재시도할 때 호출 (새로고침 없이 재시도)
  const handleRetryLoading = useCallback(() => {
    setLoadError(null)
    setServerOutage(false)
    setLoading(true)
    setLoadAttempt(prev => prev + 1)
  }, [])

  const handleAuthErrorHome = () => {
    window.location.hash = ''
    setShowAuthError(false)
  }

  const handleAuthErrorLogin = () => {
    window.location.hash = ''
    setShowAuthError(false)
    setLoginOpen(true)
  }

  const handleDismissSandboxLoginHint = useCallback(()=>{
    setShowSandboxLoginHint(false)
  },[])

  // Supabase Auth: 앱 시작 시 세션 확인
  useEffect(()=>{
    getSession().then(session=>{
      if(session?.user){
        const nextIsAdmin = computeIsAdmin(session.user.email, getAppSettings())
        setIsAdmin(nextIsAdmin)
        if (nextIsAdmin) localStorage.setItem("isAdmin","1"); else localStorage.removeItem("isAdmin")

        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const isDevEmail = isLocalhost || isDeveloperEmail(session.user.email)
        setIsAnalyticsAdmin(isDevEmail)
        if(isDevEmail) localStorage.setItem("isAnalyticsAdmin","1"); else localStorage.removeItem("isAnalyticsAdmin")
      }else{
        setIsAdmin(false)
        setIsAnalyticsAdmin(false)
        localStorage.removeItem("isAdmin")
        localStorage.removeItem("isAnalyticsAdmin")
      }
    })

    // 인증 상태 변경 리스너
    const unsubscribe = onAuthStateChange(session=>{
      if(session?.user){
        const nextIsAdmin = computeIsAdmin(session.user.email, getAppSettings())
        setIsAdmin(nextIsAdmin)
        if (nextIsAdmin) localStorage.setItem("isAdmin","1"); else localStorage.removeItem("isAdmin")

        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const isDevEmail = isLocalhost || isDeveloperEmail(session.user.email)
        setIsAnalyticsAdmin(isDevEmail)
        if(isDevEmail) localStorage.setItem("isAnalyticsAdmin","1"); else localStorage.removeItem("isAnalyticsAdmin")
      }else{
        setIsAdmin(false)
        setIsAnalyticsAdmin(false)
        localStorage.removeItem("isAdmin")
        localStorage.removeItem("isAnalyticsAdmin")
      }
    })

    return unsubscribe
  },[])

  // 브라우저 탭 타이틀 업데이트
  useEffect(()=>{
    document.title = appTitle
  },[appTitle])

  // 서버에서 앱 설정 로드
  useEffect(()=>{
    (async()=>{
      try{
        const settings = await loadAppSettingsFromServer()
        if(settings.appTitle && settings.appTitle !== appTitle){
          setAppTitle(settings.appTitle)
        }
        if(settings.maintenanceMode !== undefined){
          setMaintenanceMode(settings.maintenanceMode)
        }
        if(settings.seasonRecapEnabled !== undefined){
          setSeasonRecapEnabled(Boolean(settings.seasonRecapEnabled))
        }
        if(settings.features){
          setFeaturesEnabled(settings.features)
        }
        if(settings.badgeTierOverrides){
          setBadgeTierOverrides(settings.badgeTierOverrides)
        }
        // 설정 로드 후 관리자 여부 재평가 (adminEmails 지원)
        const session = await getSession()
        if (session?.user) {
          const nextIsAdmin = computeIsAdmin(session.user.email, settings)
          setIsAdmin(nextIsAdmin)
          if (nextIsAdmin) localStorage.setItem("isAdmin","1"); else localStorage.removeItem("isAdmin")
        }
      }catch(e){
        logger.error('Failed to load app settings from server:', e)
      }finally{
        setAppSettingsLoaded(true)
      }
    })()
  },[])

  // 1) 초기 데이터 로딩 (재시도/백오프/타임아웃 포함)
  useEffect(()=>{
    let mounted = true
    coreLoadedRef.current = false
    setLoadError(null)
    setLoading(true)

    const HARD_TIMEOUT_MS = 12000
    const scheduledAttempt = loadAttempt
    const hardTimeoutId = setTimeout(() => {
      if (!mounted) return
      if (coreLoadedRef.current) return
      // 동일 시도에서만 유효
      if (scheduledAttempt !== loadAttempt) return

      const MAX_ATTEMPTS = 3
      if (scheduledAttempt < MAX_ATTEMPTS - 1) {
        setLoadError('네트워크가 느려 연결이 지연되고 있어요. 잠시 후 자동으로 다시 시도합니다.')
        const backoff = Math.min(15000, 1500 * Math.pow(2, scheduledAttempt))
        setTimeout(() => setLoadAttempt(prev => prev + 1), backoff)
      } else {
        setLoadError('여러 차례 시도했지만 연결되지 않았습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.')
      }
      setLoading(false)
    }, HARD_TIMEOUT_MS)

    ;(async()=>{
      try{
        // 각 네트워크 호출에 6초 타임아웃 적용 (모바일 고려)
        await withTimeout(runMigrations(), 6000, 'runMigrations')

        const [playersFromDB, membershipSettings, upcomingRaw, tagPresetRaw] = await Promise.all([
          withTimeout(listPlayers(), 6000, 'listPlayers'),
          withTimeout(getMembershipSettings(), 6000, 'getMembershipSettings'),
          withTimeout(listUpcomingMatches(), 6000, 'listUpcomingMatches'),
          withTimeout(listTagPresets(), 6000, 'listTagPresets')
        ])

        // Matches 로드: USE_MATCHES_TABLE 플래그에 따라 분기
        let matchesData = []
        let matchesRaw = null
        if (USE_MATCHES_TABLE) {
          logger.log('[App] Loading matches from Supabase matches table')
          matchesRaw = await withTimeout(listMatchesFromDB(), 6000, 'listMatchesFromDB')
          matchesData = matchesRaw || []
        } else {
          logger.log('[App] Loading matches from appdb JSON')
          matchesRaw = []
          matchesData = []
        }

        if(!mounted) return

        // 주요 Supabase 호출 실패 시 유지보수 화면으로 전환
        const coreResponses=[playersFromDB,membershipSettings,upcomingRaw,tagPresetRaw]
        const coreAllFailed=coreResponses.every(res=>res===null||res===undefined)
        const matchesFailed=USE_MATCHES_TABLE&&matchesRaw===null
        if(coreAllFailed||matchesFailed){
          setServerOutage(true)
          setLoadError('서버 연결에 문제가 있어 일시적으로 서비스가 중단되었습니다. 잠시 후 다시 시도해주세요.')
          throw new Error('Core Supabase requests failed')
        }

        // 로딩 성공 시 재시도 카운터 초기화
        sessionStorage.removeItem('sfm:retry_count')

        const upcomingList = Array.isArray(upcomingRaw) ? upcomingRaw : []
        const activeUpcomingMatches = filterExpiredMatches(upcomingList)
        const activeIds = new Set(activeUpcomingMatches.map(m=>m.id))
        const expiredIds = upcomingList.filter(m=>!activeIds.has(m.id)).map(m=>m.id)
        if(expiredIds.length){
          await Promise.all(expiredIds.map(id=>
            withTimeout(deleteUpcomingMatchRecord(id), 4000, 'deleteExpiredUpcomingMatch').catch(logger.error)
          ))
        }

        const tagPresetList = Array.isArray(tagPresetRaw) ? tagPresetRaw : []

        // 총 방문자 수 조회 (visit_totals 테이블)
        const totalVisits = await withTimeout(getVisitTotal(), 6000, 'getVisitTotal') || 0

        setDb({
          players: playersFromDB || [],
          matches: matchesData,
          visits: totalVisits,
          upcomingMatches: activeUpcomingMatches,
          tagPresets: tagPresetList,
          membershipSettings: membershipSettings || []
        })

        // 핵심 데이터 로드 완료 표시 및 타임아웃 클리어
        coreLoadedRef.current = true
        clearTimeout(hardTimeoutId)
        setLoadError(null)

        // 방문 추적 (개발 환경 및 프리뷰 모드 제외)
        if(shouldTrackVisit()){
          try{
            sessionStorage?.setItem('visited','1')

            // 방문자 정보 수집
            const visitorId = getOrCreateVisitorId()
            const userAgent = navigator?.userAgent || ''
            const screenWidth = window?.screen?.width || null
            const screenHeight = window?.screen?.height || null
            const { device, browser, os, phoneModel } = parseUserAgent(userAgent, screenWidth, screenHeight)

            // 방문자 수 증가 (프리뷰 모드 재확인)
            if(!isPreviewMode() && !isDevelopmentEnvironment()){
              await withTimeout(incrementVisitTotal(), 4000, 'incrementVisitTotal')
            }

            // IP 주소 조회 후 로그 저장 (비동기, 실패해도 계속 진행)
            getVisitorIP().then(async (ipAddress) => {
              if(isPreviewMode() || isDevelopmentEnvironment()){
                return
              }
              await withTimeout(logVisit({
                visitorId,
                ipAddress,
                userAgent,
                deviceType: device,
                browser,
                os,
                phoneModel
              }), 4000, 'logVisit')
            }).catch(logger.error)
          }catch(e){
            logger.error('Visit tracking failed:', e)
            try{
              const now = Date.now()
              localStorage.setItem('lastVisit', now.toString())
            }catch{}
          }
        }
      }catch(e){
        logger.error("[App] initial load failed",e)
        if(!serverOutage){
          setLoadError(prev=>prev||'데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
        }
      }
      finally{
        if(mounted) setLoading(false)
      }
    })()

    return ()=>{
      mounted=false
      clearTimeout(hardTimeoutId)
    }
  },[loadAttempt])

  // 2) 실시간 구독은 최초 1회만 설정 (재시도와 분리)
  useEffect(()=>{
    // Sandbox Mode: 샌드박스 모드에서는 게스트의 로컬 변경사항을 보존하기 위해 구독 비활성화
    if (isSandboxMode && !isAdmin) return

    const offP=subscribePlayers(list=>setDb(prev=>({...prev,players:list})))

    // Matches 구독: USE_MATCHES_TABLE 플래그에 따라 분기
    let offMatches = () => {}
    if (USE_MATCHES_TABLE) {
      logger.log('[App] Subscribing to matches table')
      offMatches = subscribeMatches(list=>setDb(prev=>({...prev,matches:list})))
    }

    const offUpcoming = subscribeUpcomingMatches(async()=>{
      try{
        const list = await listUpcomingMatches()
        const active = filterExpiredMatches(list)
        setDb(prev=>({...prev,upcomingMatches:active}))
      }catch(err){
        logger.error('[App] upcoming match refresh failed', err)
      }
    })

    const offTagPresets = subscribeTagPresets(async()=>{
      try{
        const presets = await listTagPresets()
        setDb(prev=>({...prev,tagPresets:presets}))
      }catch(err){
        logger.error('[App] tag preset refresh failed', err)
      }
    })

    const offVisitTotals = subscribeVisitTotals(total=>{
      if(typeof total === 'number'){
        setDb(prev=>({...prev,visits:total}))
      }
    })

    const offMembership=subscribeMembershipSettings(async()=>{
      const membershipSettings = await getMembershipSettings()
      setDb(prev=>({...prev,membershipSettings:membershipSettings||[]}))
    })

    return()=>{
      offP?.()
      offMatches?.()
      offUpcoming?.()
      offTagPresets?.()
      offVisitTotals?.()
      offMembership?.()
    }
  },[isAdmin])

  const rawPlayers=db.players||[],matches=db.matches||[],visits=typeof db.visits==="number"?db.visits:0,upcomingMatches=db.upcomingMatches||[],membershipSettings=db.membershipSettings||[]
  const players=useMemo(()=>{
    return(rawPlayers||[]).map(p=>{
      const systemAccount=isSystemAccount(p)
      return{...p,isSystemAccount:systemAccount,isUnknown:systemAccount||isUnknownPlayer(p)}
    })
  },[rawPlayers])
  const publicPlayers=useMemo(()=>players.filter(p=>!p.isSystemAccount),[players])
  const systemAccount=useMemo(()=>players.find(p=>p.isSystemAccount)||null,[players])

  const totals=useMemo(()=>{
    const cnt=publicPlayers.length
    const goalsProxy=Math.round(publicPlayers.reduce((a,p)=>a+(p.stats?.Shooting||0)*0.1,0))
    const attendanceProxy=Math.round(60+publicPlayers.length*2)
    return{count:cnt,goals:goalsProxy,attendance:attendanceProxy}
  },[publicPlayers])
  const formatMatchLabel=useCallback((m)=>{
    const name=m?.title||m?.name||m?.label||`Match ${m?.id||''}`
    const d=m?.dateISO||m?.dateIso||m?.date||m?.dateStr
    if(!d)return name
    try{
      const dateStr=new Date(d).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})
      return `${name} · ${dateStr}`
    }catch{return name}
  },[])
  const sortedMatchesRefMode=useMemo(()=>{
    if(!Array.isArray(matches))return[]
    return [...matches].sort((a,b)=>{
      const da=new Date(a?.dateISO||a?.date||a?.createdAt||0).getTime()
      const db=new Date(b?.dateISO||b?.date||b?.createdAt||0).getTime()
      if(!isNaN(db-da) && db!==da) return db-da
      return String(b?.id||'').localeCompare(String(a?.id||''))
    })
  },[matches])
  const isSameLocalDay = useCallback((dateA, dateB)=>{
    if(!dateA||!dateB) return false
    const a=new Date(dateA)
    const b=new Date(dateB)
    if(isNaN(a)||isNaN(b)) return false
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
  },[])
  const withinHours = useCallback((dateValue, hours)=>{
    if(!dateValue) return false
    const t=new Date(dateValue).getTime()
    if(isNaN(t)) return false
    const now=Date.now()
    const diffHours=(now - t)/ (1000*60*60)
    return diffHours <= hours
  },[])
  const todayMatchesRefMode=useMemo(()=>{
    const now=new Date()
    return sortedMatchesRefMode.filter(m=>{
      const d=m?.dateISO||m?.date||m?.dateStr||m?.createdAt
      return isSameLocalDay(d, now) && withinHours(d, 3)
    })
  },[sortedMatchesRefMode,isSameLocalDay,withinHours])

  const refModeDateMatches = useMemo(() => {
    if (!refModeDateInput) return []
    const parseCode = (code) => {
      if (code.length === 6) {
        // MMDDYY, 2-digit year
        const currentYear = new Date().getFullYear()
        const century = Math.floor(currentYear / 100) * 100
        const m = Number(code.slice(0,2))
        const d = Number(code.slice(2,4))
        const yy = Number(code.slice(4,6))
        const year = century + yy
        if (m>=1 && m<=12 && d>=1 && d<=31) return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      }
      if (code.length === 8) {
        const y = code.slice(0,4)
        const m = code.slice(4,6)
        const d = code.slice(6,8)
        return `${y}-${m}-${d}`
      }
      return null
    }
    const target = parseCode(refModeDateInput)
    if (!target) return []
    // Search in ALL matches, not just today's matches
    const found = matches.filter(m => {
      const d = (m?.dateISO || m?.date || m?.dateStr || '').slice(0,10)
      return d === target
    }).sort((a,b) => {
      const ta = (a?.dateISO || a?.date || a?.dateStr || '')
      const tb = (b?.dateISO || b?.date || b?.dateStr || '')
      return ta.localeCompare(tb)
    })
    return found
  }, [refModeDateInput, matches])
  const hydrateMatchForRefMode=useCallback((match)=>{
    if(!match)return null
    // If teams already hydrated with players, reuse
    if(Array.isArray(match.teams) && match.teams.some(team=>Array.isArray(team)&&team.some(p=>p&&p.name))) return match

    const playerMap=new Map((players||[]).map(p=>[String(p.id),p]))
    const resolvePlayer=(id)=>{
      const found=playerMap.get(String(id))
      if(found) return found
      return {id, name:`#${id}`}
    }

    // snapshot: array of playerId arrays
    if(Array.isArray(match.snapshot) && match.snapshot.every(Array.isArray)){
      const teamsHydrated=match.snapshot.map(teamIds=>teamIds.map(resolvePlayer))
      return {...match,teams:teamsHydrated}
    }

    // board: array of player objects or ids
    if(Array.isArray(match.board) && match.board.every(Array.isArray)){
      const teamsHydrated=match.board.map(team=>team.map(p=>p?.name?p:resolvePlayer(p?.id||p)))
      return {...match,teams:teamsHydrated}
    }

    // attendeeIds fallback: single team
    if(Array.isArray(match.attendeeIds)){
      return {...match,teams:[match.attendeeIds.map(resolvePlayer)]}
    }

    return match
  },[players])

  // Public referee-mode deep link: auto-switch tab and pick match from URL (matchId/match/id). Defaults to latest.
  useEffect(()=>{
    if(isRefModeLink){
      setTab('referee')
      if(!refModeDateCode) setRefModeShowCodeModal(true)
    }
  },[isRefModeLink,refModeDateCode])

  useEffect(()=>{
    if(!isRefModeLink)return
    // Seed selection from URL param once
    if(refModeMatchId && !refModeSelectedId){
      setRefModeSelectedId(refModeMatchId)
    }
  },[isRefModeLink,refModeMatchId,refModeSelectedId])

  useEffect(()=>{
    if(!isRefModeLink)return
    
    // Always require date code for refMode entry
    if(!refModeDateInput){
      setActiveMatch(null)
      setRefModeError(null)
      return
    }
    
    const candidateMatches = refModeDateMatches
    
    if(!candidateMatches.length){
      setActiveMatch(null)
      setRefModeError('해당 날짜의 매치를 찾을 수 없습니다. (No matches for this date code)')
      return
    }

    // Default selection: last referee match if available for the candidate set, else latest
    if(!refModeSelectedId){
      let nextId=null
      try {
        const lastId=localStorage.getItem('sfm:lastRefMatchId')
        if(lastId && candidateMatches.some(m=>String(m.id)===lastId)){
          nextId=lastId
        }
      } catch {}
      if(!nextId){
        nextId=String(candidateMatches[0].id)
      }
      setRefModeSelectedId(nextId)
      return
    }

    const targetRaw=candidateMatches.find(m=>String(m.id)===String(refModeSelectedId))
    
    // Protect past matches with existing records from accidental modification
    if(targetRaw){
      const matchDate = new Date(targetRaw.dateISO || targetRaw.date || targetRaw.dateStr)
      matchDate.setHours(0,0,0,0)
      const today = new Date()
      today.setHours(0,0,0,0)
      const isPastMatch = matchDate < today // 오늘은 제외, 어제부터만 과거
      
      if(!isPastMatch){
        // 오늘/미래 경기는 항상 허용
      } else {
        // 과거 경기: __inProgress가 최근(24시간 이내)인지 확인
        const inProgressIsRecent = targetRaw.stats?.__inProgress?.lastUpdated
          ? (Date.now() - targetRaw.stats.__inProgress.lastUpdated) < 24 * 60 * 60 * 1000
          : false
        
        // 최근 진행중 상태면 허용
        if(inProgressIsRecent){
          // Recent in-progress, allow entry
        } else {
          // Check if match has any player stats (excluding special keys)
          const hasStats = targetRaw.stats && Object.keys(targetRaw.stats).some(key => 
            key !== '__inProgress' && 
            key !== '__events' && 
            key !== '__games' &&
            key !== 'gameEvents'
          )
          
          // Check if match has any scores recorded
          const hasScores = targetRaw.quarterScores && 
            Array.isArray(targetRaw.quarterScores) && 
            targetRaw.quarterScores.length > 0 &&
            targetRaw.quarterScores.some(q => Array.isArray(q) && q.length > 0)
          
          const hasRecords = hasStats || hasScores
          
          if(hasRecords){
            setActiveMatch(null)
            setRefModeError('과거 매치는 이미 기록이 있어 수정할 수 없습니다. (Past matches with records cannot be modified)')
            refModeResolvedRef.current=true
            return
          }
        }
      }
    }
    
    const target=hydrateMatchForRefMode(targetRaw)

    if(target){
      refModeResolvedRef.current=true
      setRefModeError(null)
      setActiveMatch(prev=>{
        if(prev?.id === target.id) return prev
        return target
      })
    }else{
      setActiveMatch(null)
      setRefModeError('해당 매치를 찾을 수 없습니다. URL을 확인해주세요.')
      refModeResolvedRef.current=true
    }
  },[isRefModeLink,refModeSelectedId,hydrateMatchForRefMode,refModeDateMatches,refModeReloadTick,refModeDateInput])

  const handleEnsureSystemAccount=useCallback(async()=>{
    if(systemAccount){
      notify('이미 시스템 계정이 준비되어 있어요.')
      return systemAccount
    }
    const sysPlayer=mkSystemAccount('System Account')
    setDb(prev=>({
      ...prev,
      players:[sysPlayer,...(prev.players||[])]
    }))
    
    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      notify('시스템 계정을 만들었어요. (Demo Mode)')
      return sysPlayer
    }

    try{
      await upsertPlayer(sysPlayer)
      notify('시스템 계정을 만들었어요. 회계에서 자동으로 사용됩니다.')
      return sysPlayer
    }catch(err){
      logger.error('[App] Failed to create system account',err)
      setDb(prev=>({
        ...prev,
        players:(prev.players||[]).filter(p=>p.id!==sysPlayer.id)
      }))
      notify('시스템 계정 생성에 실패했습니다. 다시 시도해주세요.', 'error')
      throw err
    }
  },[systemAccount, isAdmin])

  // 탭 전환 함수 메모이제이션 (즉시 반영 + 로딩 상태)
  const handleTabChange = useCallback((newTab) => {
    if (newTab === tab) return; // 같은 탭이면 아무것도 하지 않음
    
    // 즉시 탭 상태 변경
    setTab(newTab);
    
    // 로딩 상태 시작
    setPageLoading(true);
    
    // 의도적인 지연으로 로딩 시뮬레이션 (실제 컴포넌트 로딩 시간을 고려)
    const delay = newTab === 'dashboard' ? 200 : newTab === 'formation' ? 400 : 300;
    
    setTimeout(() => {
      setPageLoading(false);
    }, delay);
  }, [tab]);

  // 메모이제이션된 탭 버튼들
  const sandboxUnlocked = isAdmin || isSandboxGuest
  const tabButtons = useMemo(() => [
    { key: 'dashboard', icon: <Home size={16}/>, label: t('nav.dashboard'), show: true },
    { key: 'players', icon: <Users size={16}/>, label: t('nav.players'), show: sandboxUnlocked && (featuresEnabled.players ?? true) },
    { key: 'planner', icon: <CalendarDays size={16}/>, label: t('nav.planner'), show: sandboxUnlocked && (featuresEnabled.planner ?? true) },
    { key: 'draft', icon: <Shuffle size={16}/>, label: t('nav.draft'), show: sandboxUnlocked && (featuresEnabled.draft ?? true) },
    { key: 'formation', icon: <IconPitch size={16}/>, label: t('nav.formation'), show: featuresEnabled.formation },
    { key: 'stats', icon: <ListChecks size={16}/>, label: t('nav.stats'), show: sandboxUnlocked && (featuresEnabled.stats ?? true) },
    { key: 'accounting', icon: <DollarSign size={16}/>, label: t('nav.accounting'), show: isAdmin && (featuresEnabled.accounting ?? true) },
    { key: 'analytics', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, label: t('nav.analytics'), show: isAnalyticsAdmin && featuresEnabled.analytics },
    { key: 'settings', icon: <Settings size={16}/>, label: t('common.settings'), show: isAdmin }
  ], [sandboxUnlocked, isAdmin, isAnalyticsAdmin, featuresEnabled, t]);

  const playerStatsModalEnabled = featuresEnabled?.playerStatsModal ?? (featuresEnabled?.playerFunFacts ?? true)
  const badgesFeatureEnabled = playerStatsModalEnabled && (featuresEnabled?.badges ?? true)
  const maintenanceActive = (maintenanceMode || serverOutage || new URLSearchParams(window.location.search).has('maintenance')) && !isAnalyticsAdmin

  // ⬇️ 기존 기본값 생성 방식은 유지(필요시 다른 곳에서 사용)
  async function handleCreatePlayer(){
    const p=mkPlayer(t('player.newPlayer'),"MF");
    setDb(prev=>({...prev,players:[p,...(prev.players||[])]}));
    setSelectedPlayerId(p.id);
    notify(t('player.playerAdded'));
    
    if(isSandboxMode && !isAdmin) return; // Sandbox mode: Local only
    
    try{await upsertPlayer(p)}catch(e){logger.error(e)}
  }

  // ✅ 모달에서 넘어온 patch를 그대로 저장(OVR=50 초기화 문제 해결)
  async function handleCreatePlayerFromModal(patch){
    const base = mkPlayer(patch?.name || t('player.newPlayer'), patch?.position || "");
    const playerToSave = {
      ...base,
      ...patch,
      id: patch?.id || base.id,           // 신규 ID 보존
    };
    // 프론트 상태 업데이트
    setDb(prev => ({ ...prev, players: [playerToSave, ...(prev.players||[])] }));
    setSelectedPlayerId(playerToSave.id);
    notify(isSandboxMode && !isAdmin ? "새 선수가 추가되었어요. (Demo Mode)" : "새 선수가 추가되었어요.");
    
    if(isSandboxMode && !isAdmin) return; // Sandbox mode: Local only

    // DB 반영
    try { await upsertPlayer(playerToSave); }
    catch(e){ logger.error(e); }
  }

  async function handleUpdatePlayer(next){
    setDb(prev=>({...prev,players:(prev.players||[]).map(x=>x.id===next.id?next:x)}));
    if(isSandboxMode && !isAdmin) return; // Sandbox mode: Local only
    try{await upsertPlayer(next)}catch(e){logger.error(e)}
  }
  async function handleDeletePlayer(id){
    setDb(prev=>({...prev,players:(prev.players||[]).filter(p=>p.id!==id)}));
    if(selectedPlayerId===id)setSelectedPlayerId(null);
    notify(isSandboxMode && !isAdmin ? "선수를 삭제했습니다. (Demo Mode)" : "선수를 삭제했습니다.");
    if(isSandboxMode && !isAdmin) return; // Sandbox mode: Local only
    try{await deletePlayer(id);}catch(e){logger.error(e)}
  }
  async function handleImportPlayers(list){
    if(!isAdmin)return notify("Admin만 가능합니다.")
    const safe=Array.isArray(list)?list:[]
    setDb(prev=>({...prev,players:safe}))
    setSelectedPlayerId(null)
    try{
      await Promise.all(safe.map(upsertPlayer))
      await handleEnsureSystemAccount()
      notify("선수 목록을 가져왔습니다.")
    }catch(err){
      logger.error(err)
      notify("선수 데이터를 저장하는 중 오류가 발생했습니다.","error")
    }
  }
  async function handleResetPlayers(){
    if(!isAdmin)return notify("Admin만 가능합니다.")
    try{
      const fresh=await listPlayers()
      setDb(prev=>({...prev,players:fresh}))
      setSelectedPlayerId(null)
      await handleEnsureSystemAccount()
      notify("선수 목록을 리셋했습니다.")
    }catch(err){
      logger.error(err)
      notify("선수 목록을 불러오는 중 오류가 발생했습니다.","error")
    }
  }
  async function handleSaveMatch(match){
    try {
      const normalizeMatchDateISO = (v) => {
        if(!v) return v
        // \uc774\ubbf8 UTC \ud615\uc2dd\uc774\uba74 \uadf8\ub300\ub85c \uc0ac\uc6a9
        if((v.includes('+')||v.endsWith('Z')) && v.length>16) return v
        // \ub85c\uceec \uc2dc\uac04\uc744 UTC\ub85c \ubcc0\ud658
        const trimmed = v.length>=16 ? v.slice(0,16) : v
        return localDateTimeToUTC(trimmed)
      }

      const matchWithDate = {
        ...match,
        dateISO: normalizeMatchDateISO(match?.dateISO)
      }

      if (isSandboxMode && !isAdmin) {
        // Sandbox Mode: Local Only
        const fakeSaved = { ...matchWithDate, id: matchWithDate.id || Date.now() };
        setDb(prev=>({...prev,matches:[...(prev.matches||[]),fakeSaved]}))
        notify("매치가 저장되었습니다. (Demo Mode)")
        return;
      }

      if (USE_MATCHES_TABLE) {
        // Supabase matches 테이블에 저장
        const saved = await saveMatchToDB(matchWithDate)
        setDb(prev=>({...prev,matches:[...(prev.matches||[]),saved]}))
        notify("매치가 저장되었습니다.")
      } else {
        // 기존 appdb JSON 방식 (deprecated - Hangang은 USE_MATCHES_TABLE=true)
        setDb(prev=>{
          const next=[...(prev.matches||[]),matchWithDate]
          notify("매치가 저장되었습니다.")
          return {...prev,matches:next}
        })
      }
    } catch(e) {
      logger.error('[handleSaveMatch] failed', e)
      notify("매치 저장에 실패했습니다.", 'error')
    }
  }
  
  async function handleDeleteMatch(id){
    try {
      if (isSandboxMode && !isAdmin) {
        // Sandbox Mode: Local Only
        const next=(db.matches||[]).filter(m=>m.id!==id)
        setDb(prev=>({...prev,matches:next}))
        notify("매치를 삭제했습니다. (Demo Mode)")
        return;
      }

      if (USE_MATCHES_TABLE) {
        // Supabase matches 테이블에서 삭제
        await deleteMatchFromDB(id)
        const next=(db.matches||[]).filter(m=>m.id!==id)
        setDb(prev=>({...prev,matches:next}))
        notify("매치를 삭제했습니다.")
      } else {
        // 기존 appdb JSON 방식 (deprecated - Hangang은 USE_MATCHES_TABLE=true)
        setDb(prev=>{
          const next=(prev.matches||[]).filter(m=>m.id!==id)
          notify("매치를 삭제했습니다.")
          return {...prev,matches:next}
        })
      }
    } catch(e) {
      logger.error('[handleDeleteMatch] failed', e)
      notify("매치 삭제에 실패했습니다.")
    }
  }

  function handleStartRefereeMode(matchData) {
    setActiveMatch(matchData)
    setTab('referee')
  }

  async function handleAutoSaveRefereeMode(inProgressData) {
    if (!activeMatch?.id) return
    
    try {
      // Save in-progress state to match stats.__inProgress
      const updatedStats = {
        ...(activeMatch?.stats || {}),
        __inProgress: inProgressData,
      }
      
      await handleUpdateMatch(activeMatch.id, { stats: updatedStats }, true) // silent=true
    } catch (err) {
      console.warn('Auto-save failed:', err)
    }
  }

  async function handleCancelRefereeMode() {
    // Clear active match first to immediately exit referee mode UI
    const matchId = activeMatch?.id
    setActiveMatch(null)
    setTab(isRefModeLink ? 'dashboard' : 'stats')
    
    if (matchId) {
      try {
        // Force reload from DB to get the latest stats with __inProgress
        const freshMatches = await listMatchesFromDB()
        const matchFromDb = freshMatches.find(m => m.id === matchId)
        const cleanedStats = { ...(matchFromDb?.stats || {}) }
        if (cleanedStats.__inProgress) delete cleanedStats.__inProgress
        await handleUpdateMatch(matchId, { stats: cleanedStats }, true) // silent=true
        
        // Update local state to reflect the cleared __inProgress immediately
        setDb(prev => ({
          ...prev,
          matches: (prev.matches || []).map(m => 
            m.id === matchId ? { ...m, stats: cleanedStats } : m
          )
        }))
      } catch (err) {
        console.warn('Failed to clear in-progress data:', err)
      }
    }
  }

  async function handleFinishRefereeMode(matchData) {
    try {
      const rebuildStatsFromEvents = (teamsArr = [], eventsArr = [], cleanSheetAwardees = []) => {
        const stats = {}
        const ensureStat = (pid) => {
          const key = pid == null ? '' : String(pid)
          if (!key) return null
          if (!stats[key]) {
            stats[key] = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, fouls: 0, cleanSheet: 0, events: [] }
          }
          return stats[key]
        }

        teamsArr.flat().forEach(p => {
          if (p?.id) ensureStat(p.id)
        })

        eventsArr.forEach(ev => {
          const entry = ensureStat(ev.playerId)
          if (entry) entry.events.push(ev)

          if (ev.type === 'goal') {
            if (entry) entry.goals += 1
            if (ev.assistedBy) {
              const assistEntry = ensureStat(ev.assistedBy)
              if (assistEntry) assistEntry.assists += 1
            }
          }

          if (ev.type === 'own_goal' && ev.assistedBy) {
            const assistEntry = ensureStat(ev.assistedBy)
            if (assistEntry) assistEntry.assists += 1
          }

          if (ev.type === 'yellow' && entry) entry.yellowCards += 1
          if (ev.type === 'red' && entry) entry.redCards += 1
          if (ev.type === 'foul' && entry) entry.fouls += 1
        })

        cleanSheetAwardees.forEach(pid => {
          const entry = ensureStat(pid)
          if (entry) entry.cleanSheet = (entry.cleanSheet || 0) + 1
        })

        return stats
      }

      // Persist Referee Mode result to the existing match (or create if new)
      const { gameTeams: playingTeamsPayload, ...matchDataForSave } = matchData || {}
      const prevGames = activeMatch?.stats?.__games || []
      const nextGameNumber = matchDataForSave?.matchNumber || (prevGames.length + 1)

      const teamsForMatch = (Array.isArray(matchDataForSave?.teams) && matchDataForSave.teams.length > 0)
        ? matchDataForSave.teams
        : (Array.isArray(activeMatch?.teams) ? activeMatch.teams : [])
      matchDataForSave.teams = teamsForMatch

      const derivedGameTeams = Array.isArray(matchDataForSave.selectedTeamIndices) && teamsForMatch.length > 0
        ? matchDataForSave.selectedTeamIndices.map(idx => teamsForMatch[idx]).filter(Boolean)
        : []
      const teamsForGame = (Array.isArray(playingTeamsPayload) && playingTeamsPayload.length > 0)
        ? playingTeamsPayload
        : (derivedGameTeams.length > 0 ? derivedGameTeams : teamsForMatch)

      const gameResult = {
        id: Date.now(),
        matchNumber: nextGameNumber,
        scores: matchDataForSave.scores,
        duration: matchDataForSave.duration,
        startTime: matchDataForSave.startTime,
        endTime: matchDataForSave.endTime,
        events: matchDataForSave.events,
        teamIndices: Array.isArray(matchDataForSave.selectedTeamIndices) ? matchDataForSave.selectedTeamIndices : undefined,
        teams: teamsForGame,
        cleanSheetAwardees: matchDataForSave.cleanSheetAwardeesForGame || [],
      }

      // Check if we're overriding an existing game
      const existingGameIndex = prevGames.findIndex(g => g.matchNumber === nextGameNumber)
      let updatedGames
      let updatedEvents
      
      if (existingGameIndex >= 0) {
        // Override existing game
        updatedGames = [...prevGames]
        updatedGames[existingGameIndex] = gameResult
        
        // Remove old events for this game and add new ones
        const prevEvents = activeMatch?.stats?.__events || []
        const otherEvents = prevEvents.filter(ev => ev.gameIndex !== (nextGameNumber - 1))
        updatedEvents = [...otherEvents, ...matchDataForSave.events]
      } else {
        // Append new game
        updatedGames = [...prevGames, gameResult]
        const prevEvents = activeMatch?.stats?.__events || []
        updatedEvents = [...prevEvents, ...matchDataForSave.events]
      }

      // Pack timeline & game history into stats payload to keep schema compatibility (stats is jsonb)
      // Aggregate cleanSheetAwardees from all games
      const allCleanSheetAwardees = updatedGames.flatMap(g => Array.isArray(g?.cleanSheetAwardees) ? g.cleanSheetAwardees : [])
      const rebuiltStats = rebuildStatsFromEvents(teamsForGame, updatedEvents, allCleanSheetAwardees)
      const mergedStats = {
        ...(activeMatch?.stats || {}),
        ...rebuiltStats,
        __events: updatedEvents,
        __games: updatedGames,
        __scores: matchDataForSave.scores,
        __matchMeta: {
          matchNumber: nextGameNumber,
          duration: matchDataForSave.duration,
          startTime: matchDataForSave.startTime,
          endTime: matchDataForSave.endTime,
        },
      }
      
      // Clear in-progress data when match finishes
      if (matchDataForSave.clearInProgress) {
        delete mergedStats.__inProgress
      }

      // Ensure attendance reflects all players who appeared in referee mode so leaderboard GP counts apply
      const attendeeIds = Array.from(new Set([
        ...((activeMatch?.attendeeIds || []).map(id => String(id))),
        ...(teamsForGame.flat().map(p => p?.id).filter(Boolean).map(id => String(id))),
      ]))

      // Draft-only payload (avoid polluting non-draft matches with draft data)
      const isDraft = isDraftMatch(activeMatch || matchDataForSave)
      // 원본 매치의 전체 팀 수를 사용 (멀티팀 지원)
      const originalTeamCount = teamsForMatch.length > 0
        ? teamsForMatch.length
        : (Array.isArray(activeMatch?.snapshot) ? activeMatch.snapshot.length : Number(activeMatch?.teamCount) || 2)
      const quarterScores = Array.from({ length: originalTeamCount }, () => [])
      if (isDraft) {
        mergedStats.__games.forEach(g => {
          if (!Array.isArray(g?.scores)) return
          const teamMap = Array.isArray(g.teamIndices) && g.teamIndices.length > 0 ? g.teamIndices : null
          
          if (teamMap) {
            // 팀 인덱스 매핑 사용: 참여한 팀만 점수 추가, 나머지는 null
            for (let ti = 0; ti < originalTeamCount; ti++) {
              const participantIdx = teamMap.indexOf(ti)
              if (participantIdx >= 0 && participantIdx < g.scores.length) {
                quarterScores[ti].push(Number(g.scores[participantIdx]) || 0)
              } else {
                quarterScores[ti].push(null)
              }
            }
          } else {
            // Legacy: 모든 팀 참여
            g.scores.forEach((val, idx) => {
              if (quarterScores[idx]) {
                quarterScores[idx].push(Number(val) || 0)
              }
            })
          }
        })
      }

      const nextDraft = isDraft ? {
        ...(activeMatch?.draft || {}),
        quarterScores,
      } : undefined

      const updatedMatch = {
        ...activeMatch,
        ...matchDataForSave,
        attendeeIds,
        stats: mergedStats,
        ...(isDraft ? { quarterScores, draft: nextDraft } : { quarterScores: null, draft: null }),
      }
      updatedMatch.teams = teamsForMatch

      if (matchDataForSave?.id) {
        const patch = isDraft
          ? { stats: mergedStats, quarterScores, draft: nextDraft }
          : { stats: mergedStats, quarterScores: null, draft: null }
        await handleUpdateMatch(matchDataForSave.id, patch)
      } else {
        await handleSaveMatch(updatedMatch)
      }

      // Remember last referee match for quick re-entry
      try {
        if (matchDataForSave?.id) localStorage.setItem('sfm:lastRefMatchId', String(matchDataForSave.id))
      } catch {}

      setActiveMatch(null)
      setTab(isRefModeLink ? 'dashboard' : 'stats')
      notify("경기 결과가 저장되었습니다.", "success")
    } catch (err) {
      logger.error('Failed to save referee match', err)
      notify("경기 결과 저장 실패", "error")
    }
  }
  
  async function handleUpdateMatch(id, patch, silent = false){
    const normalizeMatchDateISO = (v) => {
      if(!v) return v
      // \uc774\ubbf8 UTC \ud615\uc2dd\uc774\uba74 \uadf8\ub300\ub85c \uc0ac\uc6a9
      if((v.includes('+')||v.endsWith('Z')) && v.length>16) return v
      // \ub85c\uceec \uc2dc\uac04\uc744 UTC\ub85c \ubcc0\ud658
      const trimmed = v.length>=16 ? v.slice(0,16) : v
      return localDateTimeToUTC(trimmed)
    }

    const patched = patch?.dateISO ? { ...patch, dateISO: normalizeMatchDateISO(patch.dateISO) } : patch
    
    const canPersist = isAdmin || (isSandboxMode ? false : isRefModeLink);

    if (!canPersist) {
      // Sandbox Mode: Local Only
      setDb(prev=>{
        const next=(prev.matches||[]).map(m=>m.id===id?{...m,...patched}:m)
        return {...prev,matches:next}
      })
      if (!silent) notify(isSandboxMode && !isAdmin ? "업데이트되었습니다. (Demo Mode)" : "업데이트되었습니다.")
      return;
    }
    
    try {
      if (USE_MATCHES_TABLE) {
        try {
          const updated = await updateMatchInDB(id, patched)
          const next=(db.matches||[]).map(m=>m.id===id?updated:m)
          setDb(prev=>({...prev,matches:next}))
          if (!silent) notify("업데이트되었습니다.")
        } catch (err) {
          const msg = err?.message || ''
          const isMissing = msg.includes('Row not found') || msg.includes('0 rows') || err?.code === 'PGRST116'
          if (isMissing) {
            try {
              const existing = (db.matches||[]).find(m=>m.id===id) || { id }
              const recovered = await saveMatchToDB({ ...existing, ...patched })
              const next=(db.matches||[]).map(m=>m.id===id?recovered:m)
              setDb(prev=>({...prev,matches:next}))
              if (!silent) notify("기존 매치가 없어 새로 저장했습니다.")
              return
            } catch (saveErr) {
              logger.error('[handleUpdateMatch] recovery save failed', saveErr)
            }
          }
          throw err
        }
      } else {
        // 기존 appdb JSON 방식 (deprecated - Hangang은 USE_MATCHES_TABLE=true)
        setDb(prev=>{
          const next=(prev.matches||[]).map(m=>m.id===id?{...m,...patched}:m)
          if (!silent) notify("업데이트되었습니다.")
          return {...prev,matches:next}
        })
      }
    } catch(e) {
      logger.error('[handleUpdateMatch] failed', e)
      if (!silent) {
        const detail = e?.message ? ` (${e.message})` : ''
        notify(`업데이트에 실패했습니다.${detail}`)
      }
    }
  }
  
  async function handleSaveUpcomingMatch(upcomingMatch){
    const normalized={...upcomingMatch,dateISO:normalizeDateISO(upcomingMatch.dateISO)}
    
    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      const fakeCreated = { ...normalized, id: normalized.id || Date.now() };
      setDb(prev=>{
        const next=filterExpiredMatches([...(prev.upcomingMatches||[]),fakeCreated])
        return {...prev,upcomingMatches:next}
      })
      notify("예정된 매치가 저장되었습니다. (Demo Mode)")
      return;
    }

    try{
      const created=await createUpcomingMatchRecord(normalized)
      setDb(prev=>{
        const next=filterExpiredMatches([...(prev.upcomingMatches||[]),created])
        return {...prev,upcomingMatches:next}
      })
      notify("예정된 매치가 저장되었습니다.")
    }catch(err){
      logger.error('[handleSaveUpcomingMatch] failed',err)
      notify('예정된 매치를 저장하지 못했습니다.','error')
    }
  }
  async function handleDeleteUpcomingMatch(id){
    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      setDb(prev=>{
        const next=(prev.upcomingMatches||[]).filter(m=>m.id!==id)
        return {...prev,upcomingMatches:next}
      })
      notify('예정된 매치를 삭제했습니다. (Demo Mode)')
      return;
    }

    const target=(db.upcomingMatches||[]).find(m=>m.id===id)
    try{
      await deleteUpcomingMatchRecord(id)
      setDb(prev=>{
        const next=(prev.upcomingMatches||[]).filter(m=>m.id!==id)
        if(target) console.info('[UpcomingMatch] Deleted',{id:target.id,dateISO:target.dateISO,participantCount:(target.participantIds||target.attendeeIds||[]).length})
        return {...prev,upcomingMatches:next}
      })
      notify('예정된 매치를 삭제했습니다.')
    }catch(err){
      logger.error('[handleDeleteUpcomingMatch] failed',err)
      notify('예정된 매치를 삭제하지 못했습니다.','error')
    }
  }
  async function handleUpdateUpcomingMatch(id,patch,silent=false){
    const before=(db.upcomingMatches||[]).find(m=>m.id===id)
    if(!before){console.warn('[UpcomingMatch] update target missing',id);return}

    // 필드 화이트리스트 (의도치 않은 전체 객체 머지 방지)
    const ALLOWED_FIELDS=new Set([
      'dateISO','location','snapshot','captainIds','formations','teamCount','isDraftMode','isDraftComplete','draftCompletedAt','totalCost','feesDisabled','teamColors','criterion','status'
    ])

    const sanitized={}
    for(const [k,v]of Object.entries(patch||{})){
      if(ALLOWED_FIELDS.has(k)){
        // snapshot / captainIds / formations 등은 깊은 복사
        if(Array.isArray(v)) sanitized[k]=v.map(x=>x)
        else if(typeof v==='object'&&v!==null) sanitized[k]={...v}
        else sanitized[k]=v
      }
    }

    // participantIds / attendeeIds 업데이트는 스냅샷 동반시에만 허용 (명시적 저장 시)
    if(Array.isArray(patch?.participantIds) && Array.isArray(patch?.snapshot)){
      sanitized.participantIds=patch.participantIds.slice()
      sanitized.attendeeIds=patch.participantIds.slice()
    }

    if('dateISO' in sanitized){ sanitized.dateISO=normalizeDateISO(sanitized.dateISO) }

    // 변경이 없는 경우 조기 종료
    const hasChange=Object.keys(sanitized).length>0
    if(!hasChange){ if(!silent) notify('변경사항이 없습니다.'); return }

    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      const saved = { ...before, ...sanitized, id };
      setDb(prev=>{
        const nextList=(prev.upcomingMatches||[]).map(m=>m.id===id?saved:m)
        const filtered=filterExpiredMatches(nextList)
        return {...prev,upcomingMatches:filtered}
      })
      if(!silent)notify("예정된 매치가 업데이트되었습니다. (Demo Mode)")
      return;
    }

    const payload={...before,...sanitized,id}
    try{
      const saved=await updateUpcomingMatchRecord(id,payload)
      setDb(prev=>{
        const nextList=(prev.upcomingMatches||[]).map(m=>m.id===id?saved:m)
        const filtered=filterExpiredMatches(nextList)

        const beforeP=(before.participantIds||before.attendeeIds||[])
        const afterP=(saved.participantIds||saved.attendeeIds||[])
        const beforeC=before.captainIds||[]
        const afterC=saved.captainIds||[]
        if(beforeP.length!==afterP.length||beforeP.some((x,i)=>x!==afterP[i])){
          console.warn('[UpcomingMatch] participantIds changed',{id,before:beforeP,after:afterP})
        }
        if(beforeC.length!==afterC.length||beforeC.some((x,i)=>x!==afterC[i])){
          console.warn('[UpcomingMatch] captainIds changed',{id,before:beforeC,after:afterC})
        }
        if(before.snapshot&&saved.snapshot&&JSON.stringify(before.snapshot)!==JSON.stringify(saved.snapshot)){
          console.warn('[UpcomingMatch] snapshot changed',{id,beforeLen:before.snapshot.length,afterLen:saved.snapshot.length})
        }
        if(before.dateISO!==saved.dateISO){
          console.warn('[UpcomingMatch] dateISO changed',{id,before:before.dateISO,after:saved.dateISO})
        }

        return {...prev,upcomingMatches:filtered}
      })
      if(!silent)notify("예정된 매치가 업데이트되었습니다.")
    }catch(err){
      logger.error('[handleUpdateUpcomingMatch] failed',err)
      if(!silent)notify('예정된 매치를 업데이트하지 못했습니다.','error')
    }
  }

  // 태그 프리셋 관리
  async function handleSaveTagPresets(tagPresets){
    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      setDb(prev=>({...prev,tagPresets:tagPresets}))
      notify("태그 프리셋이 저장되었습니다. (Demo Mode)")
      return;
    }

    try{
      await Promise.all((tagPresets||[]).map((preset,index)=>{
        if(preset?.id){
          return updateTagPresetRecord(preset.id,{...preset,sortOrder:index})
        }
        return createTagPresetRecord({...preset,sortOrder:index})
      }))
      const refreshed=await listTagPresets()
      setDb(prev=>({...prev,tagPresets:refreshed}))
      notify("태그 프리셋이 저장되었습니다.")
    }catch(err){
      logger.error('[handleSaveTagPresets] failed',err)
      notify('태그 프리셋 저장에 실패했습니다.','error')
    }
  }
  async function handleAddTagPreset(preset){
    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      const fakeCreated = { ...preset, id: Date.now(), sortOrder: (db.tagPresets?.length)||0 };
      setDb(prev=>({...prev,tagPresets:[...(prev.tagPresets||[]),fakeCreated]}))
      notify('태그 프리셋이 추가되었습니다. (Demo Mode)')
      return;
    }

    try{
      const sortOrder=(db.tagPresets?.length)||0
      const created=await createTagPresetRecord({...preset,sortOrder})
      setDb(prev=>({...prev,tagPresets:[...(prev.tagPresets||[]),created]}))
      notify('태그 프리셋이 추가되었습니다.')
    }catch(err){
      logger.error('[handleAddTagPreset] failed',err)
      notify('태그 프리셋 추가에 실패했습니다.','error')
    }
  }
  async function handleUpdateTagPreset(index,updatedPreset){
    const tags=db.tagPresets||[]
    const oldPreset=tags[index]
    if(!oldPreset)return

    const merged={...oldPreset,...updatedPreset}

    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      const updatedPlayers=(db.players||[]).map(player=>{
        if(!player.tags||player.tags.length===0)return player
        let modified=false
        const updatedTags=player.tags.map(tag=>{
          if(tag.name===oldPreset.name&&tag.color===oldPreset.color){
            modified=true
            return merged
          }
          return tag
        })
        if(!modified)return player
        return {...player,tags:updatedTags}
      })

      setDb(prev=>({
        ...prev,
        tagPresets:(prev.tagPresets||[]).map((p,i)=>i===index?merged:p),
        players:updatedPlayers
      }))
      notify("태그 프리셋이 업데이트되었습니다. (Demo Mode)")
      return;
    }

    try{
      const saved=await updateTagPresetRecord(oldPreset.id,merged)
      const changedPlayers=[]
      const updatedPlayers=(db.players||[]).map(player=>{
        if(!player.tags||player.tags.length===0)return player
        let modified=false
        const updatedTags=player.tags.map(tag=>{
          if(tag.name===oldPreset.name&&tag.color===oldPreset.color){
            modified=true
            return saved
          }
          return tag
        })
        if(!modified)return player
        const nextPlayer={...player,tags:updatedTags}
        changedPlayers.push(nextPlayer)
        return nextPlayer
      })

      await Promise.all(changedPlayers.map(p=>upsertPlayer(p).catch(err=>logger.error('[handleUpdateTagPreset] player save failed',err))))

      setDb(prev=>({
        ...prev,
        tagPresets:(prev.tagPresets||[]).map((p,i)=>i===index?saved:p),
        players:updatedPlayers
      }))
      notify("태그 프리셋이 업데이트되었습니다.")
    }catch(err){
      logger.error('[handleUpdateTagPreset] failed',err)
      notify('태그 프리셋 업데이트에 실패했습니다.','error')
    }
  }
  async function handleDeleteTagPreset(index){
    const tagPresets=db.tagPresets||[]
    const deletedPreset=tagPresets[index]
    if(!deletedPreset)return

    if(isSandboxMode && !isAdmin) {
      // Sandbox Mode
      const updatedPlayers=(db.players||[]).map(player=>{
        if(!player.tags||player.tags.length===0)return player
        const filteredTags=player.tags.filter(tag=>!(tag.name===deletedPreset.name&&tag.color===deletedPreset.color))
        if(filteredTags.length===player.tags.length)return player
        return {...player,tags:filteredTags}
      })

      setDb(prev=>({
        ...prev,
        tagPresets:(prev.tagPresets||[]).filter((_,i)=>i!==index),
        players:updatedPlayers
      }))
      notify("태그 프리셋이 삭제되었습니다. (Demo Mode)")
      return;
    }

    try{
      await deleteTagPresetRecord(deletedPreset.id)

      const changedPlayers=[]
      const updatedPlayers=(db.players||[]).map(player=>{
        if(!player.tags||player.tags.length===0)return player
        const filteredTags=player.tags.filter(tag=>!(tag.name===deletedPreset.name&&tag.color===deletedPreset.color))
        if(filteredTags.length===player.tags.length)return player
        const nextPlayer={...player,tags:filteredTags}
        changedPlayers.push(nextPlayer)
        return nextPlayer
      })

      await Promise.all(changedPlayers.map(p=>upsertPlayer(p).catch(err=>logger.error('[handleDeleteTagPreset] player save failed',err))))

      setDb(prev=>({
        ...prev,
        tagPresets:(prev.tagPresets||[]).filter((_,i)=>i!==index),
        players:updatedPlayers
      }))
      notify("태그 프리셋이 삭제되었습니다.")
    }catch(err){
      logger.error('[handleDeleteTagPreset] failed',err)
      notify('태그 프리셋 삭제에 실패했습니다.','error')
    }
  }


  // 멤버십 설정 관리
  function handleSaveMembershipSettings(membershipSettings){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    setDb(prev=>{
      const updated = {...prev,membershipSettings};
      // Membership settings are now stored in Supabase membership_settings table
      // No need for appdb backup
      notify("멤버십 설정이 저장되었습니다.");
      return updated;
    });
  }

  // Supabase Auth: 로그아웃
  async function adminLogout(){
    await signOut()
    setIsAdmin(false)
    setIsAnalyticsAdmin(false)
    setIsSandboxGuest(false)
    localStorage.removeItem("isAdmin")
    localStorage.removeItem("isAnalyticsAdmin")
    sessionStorage.removeItem("sandboxGuest") // 샌드박스 게스트 상태 제거
    notify("Admin 모드 해제")
  }
  
  // Supabase Auth: 로그인 성공 핸들러
  async function onAdminSuccess(email, password){
    // 샌드박스 게스트 로그인 (앱 설정 접근용, DB 쓰기는 여전히 차단)
    if (email === "sandbox@guest.local" && password === "guest") {
      logger.log('[App] Sandbox guest login: Granting UI access')
      sessionStorage.setItem("sandboxGuest", "1")
      setIsSandboxGuest(true)
      setIsAdmin(true) // UI 접근 허용
      setLoginOpen(false)
      notify("샌드박스 유저 모드 활성화 (앱 설정 접근 가능)")
      return true
    }
    
    const {user, error} = await signInAdmin(email, password)
    
    if(error){
      logger.error('[App] Login failed:', error.message)
      return false // 실패 반환
    }
    
    if(user){
      setIsAdmin(true)
      setLoginOpen(false)
      localStorage.setItem("isAdmin","1")
      notify("Admin 모드 활성화")
      
      // 로그인 후 RLS로 보호된 데이터 다시 로드
      try {
        const [presets, upcoming] = await Promise.all([
          listTagPresets(),
          listUpcomingMatches()
        ])
        setDb(prev => ({
          ...prev,
          tagPresets: presets,
          upcomingMatches: upcoming
        }))
      } catch (err) {
        logger.error('[App] Failed to reload protected data after login:', err)
      }
      
      return true // 성공 반환
    }
    
    return false
  }

  async function handleSeasonRecapToggle(enabled){
    setSeasonRecapEnabled(enabled)
    const success = await updateSeasonRecapEnabled(enabled)
    if(success){
      notify(enabled?"시즌 리캡이 활성화되었습니다.":"시즌 리캡이 비활성화되었습니다.","success")
    }else{
      notify("설정 저장에 실패했습니다.","error")
    }
  }

  async function handleMaintenanceModeToggle(enabled){
    setMaintenanceMode(enabled)
    const success = await updateMaintenanceMode(enabled)
    if(success){
      notify(enabled?"유지보수 모드가 활성화되었습니다. (개발자만 접근 가능)":"유지보수 모드가 해제되었습니다.","success")
    }else{
      notify("설정 저장에 실패했습니다.","error")
    }
  }

  async function handleFeatureToggle(featureName, enabled){
    if(!featureName) return

    if(featureName === 'badges' && enabled && !playerStatsModalEnabled){
      notify('선수 기록 모달을 활성화해야 챌린지 뱃지를 사용할 수 있어요.', 'warning')
      return
    }

    const shouldCascadeDisableBadges = featureName === 'playerStatsModal' && !enabled && (featuresEnabled?.badges ?? false)

    setFeaturesEnabled(prev => {
      const next = { ...(prev || {}) }
      if (featureName.includes('.')) {
        const [group, key] = featureName.split('.')
        next[group] = { ...(prev?.[group] || {}) }
        next[group][key] = enabled
        return next
      }
      next[featureName] = enabled
      if (featureName === 'playerStatsModal' && !enabled) {
        next.badges = false
      }
      return next
    })

    const success = await updateFeatureEnabled(featureName, enabled)
    if(success){
      if (featureName === 'playerStatsModal' && !enabled) {
        notify('선수 기록 모달이 비활성화되었습니다. 챌린지 뱃지도 함께 꺼집니다.', 'success')
      } else {
        notify(`${featureName} 기능이 ${enabled?'활성화':'비활성화'}되었습니다.`, 'success')
      }

      if (shouldCascadeDisableBadges) {
        const badgeSuccess = await updateFeatureEnabled('badges', false)
        if (!badgeSuccess) {
          logger.warn('[App] Failed to auto-disable badges after turning off player stats modal')
        }
      }
    }else{
      notify("설정 저장에 실패했습니다.","error")
    }
  }

  // 리더보드 카테고리 토글 핸들러
  async function handleLeaderboardToggle(category, enabled){
    setFeaturesEnabled(prev=>({
      ...prev,
      leaderboards: { ...(prev.leaderboards||{}), [category]: enabled }
    }))
    const success = await updateLeaderboardCategoryEnabled(category, enabled)
    if(success){
      notify(`리더보드 · ${category.toUpperCase()} 카테고리가 ${enabled?'표시':'숨김'}로 설정되었습니다.`,'success')
    }else{
      notify('설정 저장에 실패했습니다.','error')
    }
  }

  async function handleSaveBadgeTierOverrides(nextOverrides){
    setBadgeTierOverrides(nextOverrides)
    const saved = await updateBadgeTierOverrides(nextOverrides)
    if(saved){
      notify('뱃지 티어 기준이 저장되었습니다.','success')
      return true
    }
    notify('뱃지 티어 기준 저장에 실패했습니다.','error')
    setBadgeTierOverrides(getAppSettings().badgeTierOverrides||{})
    return false
  }

  /* ──────────────────────────────────────────────────────────
   * FormationBoard용 fetchMatchTeams 빌더 (생략 없음)
   * ────────────────────────────────────────────────────────── */
  function buildFetchMatchTeamsFromLocalMatches(localMatches){
    const safe = Array.isArray(localMatches) ? localMatches.slice().reverse() : []
    const coerceId = (v)=>String(v??"")
    const coerceIds = (arr)=>Array.isArray(arr)?arr.map(x=>typeof x==="object"&&x?coerceId(x.id??x.playerId??x.uid??x.user_id):coerceId(x)).filter(Boolean):[]

    const labelOf = (m) => {
      const d = m?.dateISO || m?.dateIso || m?.dateiso || m?.date || m?.dateStr
      let label = m?.label || (d ? new Date(d).toLocaleString() : coerceId(m?.id))
      const teamCount =
        Array.isArray(m?.snapshot) ? m.snapshot.length :
        Array.isArray(m?.teams)    ? m.teams.length    :
        Array.isArray(m?.board)    ? m.board.length    : undefined
      if (teamCount) label += ` (${teamCount}팀)`
      return label
    }

    return async function fetchMatchTeams(){
      const out = []
      for(const m of safe){
        if (Array.isArray(m?.snapshot) && m.snapshot.every(team => Array.isArray(team))){
          out.push({
            id: coerceId(m.id),
            label: labelOf(m),
            teams: m.snapshot.map((team, i) => ({
              name: `Team ${i+1}`,
              playerIds: coerceIds(team)
            }))
          })
          continue
        }
        if (m?.teams && typeof m.teams === "object"){
          if (Array.isArray(m.teams)){
            out.push({
              id: coerceId(m.id),
              label: labelOf(m),
              teams: m.teams.map((t, i)=>({
                name: t?.name || `Team ${i+1}`,
                playerIds: coerceIds(t?.playerIds||[])
              }))
            })
          } else {
            const arr = Object.entries(m.teams).map(([name, ids])=>({
              name: name || "Team",
              playerIds: coerceIds(ids)
            }))
            out.push({ id: coerceId(m.id), label: labelOf(m), teams: arr })
          }
          continue
        }
        if (Array.isArray(m?.board) && m.board.every(team => Array.isArray(team))){
          out.push({
            id: coerceId(m.id),
            label: labelOf(m),
            teams: m.board.map((team, i)=>({
              name: `Team ${i+1}`,
              playerIds: coerceIds(team.map(p=>p?.id))
            }))
          })
          continue
        }
        const ids = coerceIds(m?.attendeeIds||m?.attendees||m?.participants||m?.roster)
        if (ids.length){
          out.push({
            id: coerceId(m.id),
            label: labelOf(m),
            teams: [{ name: "Team 1", playerIds: ids }]
          })
        }
      }
      return out
    }
  }

  const fetchMatchTeams = useMemo(
    () => buildFetchMatchTeamsFromLocalMatches(matches),
    [matches]
  )

  // Referee Mode Full Screen Override (admin or deep-link bypass)
  if (tab === 'referee' && (isAdmin || isRefModeLink)) {
    const handleSubmitCode = () => {
      setRefModeDateInput(refModeCodeInput)
      setRefModeShowCodeModal(false)
      refModeResolvedRef.current = false
      setRefModeSelectedId('')
      setActiveMatch(null)
      setRefModeError(null)
      setRefModeReloadTick(t => t + 1)
    }

    const codeModal = refModeShowCodeModal ? (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={() => setRefModeShowCodeModal(false)}
      >
        <div 
          className="bg-stone-800 text-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-lg font-bold mb-4">Enter Match Code</h2>
          <input
            type="text"
            value={refModeCodeInput}
            onChange={(e) => setRefModeCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g., 121325 (Dec 13, 2025)"
            className="w-full bg-stone-700 text-white rounded-md px-3 py-2 text-sm border border-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-4"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && refModeCodeInput) handleSubmitCode()
            }}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setRefModeShowCodeModal(false)}
              className="px-4 py-2 bg-stone-600 hover:bg-stone-500 text-white text-sm font-semibold rounded-md"
            >
              취소
            </button>
            <button
              onClick={handleSubmitCode}
              disabled={!refModeCodeInput}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    ) : null

    if (!activeMatch) {
      return (
        <>
          <ToastHub />
          {codeModal}
          <div className="flex h-[calc(100vh-56px)] items-center justify-center bg-stone-900 text-white text-sm px-4 text-center flex-col gap-4">
            <div>{refModeError || '오늘 진행중인 매치가 없습니다. (No active matches today)'}</div>
            <button
              onClick={() => {
                setRefModeCodeInput('')
                setRefModeShowCodeModal(true)
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-md"
            >
              매치 코드 입력
            </button>
          </div>
        </>
      )
    }

    return (
      <>
        <ToastHub />
        {codeModal}
        <ErrorBoundary componentName="RefereeMode">
          <Suspense fallback={<div className="flex h-screen items-center justify-center bg-stone-900 text-white">Loading Referee Mode...</div>}>
            <RefereeMode 
              activeMatch={activeMatch} 
              onFinish={handleFinishRefereeMode}
              onAutoSave={handleAutoSaveRefereeMode}
              onCancel={handleCancelRefereeMode}
              cardsEnabled={featuresEnabled?.cards ?? true}
            />
          </Suspense>
        </ErrorBoundary>
      </>
    )
  }

  return(
  <div className={`min-h-screen bg-stone-100 text-stone-800 antialiased leading-relaxed w-full max-w-full overflow-x-auto ${
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && new URLSearchParams(window.location.search).has('nomock') ? 'pt-[50px]' : ''
  }`}>
  <ToastHub/>
  <ProdDataWarning />
    {/* 개발 모드 표시 배너 (localhost) */}
    {isDev && !previewMode && (
      <div className="bg-blue-500 text-white text-center py-1 px-4 text-xs font-medium sticky top-0 z-[201]">
        🚧 {t('dev.mode')} (localhost) - {t('dev.modeDesc')}
      </div>
    )}
    {/* 프리뷰 모드 표시 배너 */}
    {previewMode && (
      <div className="bg-amber-500 text-white text-center py-1 px-4 text-xs font-medium sticky top-0 z-[201]">
        🔍 {t('dev.preview')} - {t('dev.previewDesc')}
      </div>
    )}
    <header className="sticky top-0 z-[50] border-b border-stone-300 bg-white/90 backdrop-blur-md backdrop-saturate-150 will-change-transform">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 min-h-[60px] gap-2 sm:gap-3">
        {/* 앱 로고와 타이틀 - 표시만 (관리자만 설정 버튼으로 수정 가능) */}
        <div className="flex items-center gap-2 flex-shrink-0 relative z-10">
          <img src={logoUrl} alt="Goalify Logo" className="h-6 w-6 sm:h-7 sm:w-7 object-contain flex-shrink-0" width={28} height={28} decoding="async"/>
          <h1 className="text-sm sm:text-base font-semibold tracking-tight whitespace-nowrap">{appTitle}</h1>
          {isDev && !previewMode && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">Dev</span>}
          {previewMode && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Preview</span>}
        </div>
        <nav className="flex gap-1 sm:gap-2 items-center min-w-0">
          <div className="flex gap-1 sm:gap-2 items-center overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 relative z-0" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
            {tabButtons.filter(btn => btn.show).map(btn => (
              <TabButton 
                key={btn.key}
                icon={btn.icon} 
                label={btn.label} 
                onClick={() => handleTabChange(btn.key)} 
                active={tab === btn.key}
                loading={pageLoading && tab === btn.key}
              />
            ))}
          </div>
          <div className="ml-2 sm:ml-3 pl-2 sm:pl-3 border-l border-stone-300 flex-shrink-0 relative z-10">
            <div className="flex gap-2 items-center">
              <LanguageSwitcher />
              {isAdmin?(
                <>
                  <button
                    onClick={()=>handleTabChange('settings')}
                    aria-label={t('common.settings')}
                    title={t('common.settings')}
                    className="inline-flex items-center rounded-lg bg-stone-100 p-2.5 sm:p-3 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 min-h-[42px] min-w-[42px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation transition-all duration-200 active:scale-95"
                    style={{touchAction: 'manipulation'}}
                  >
                    <Settings size={16}/>
                  </button>
                  <button
                    onClick={adminLogout}
                    aria-label={t('auth.logout')}
                    title={t('auth.logout')}
                    className="inline-flex items-center rounded-lg bg-stone-900 p-2.5 sm:p-3 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 min-h-[42px] min-w-[42px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation transition-all duration-200 active:scale-95"
                    style={{touchAction: 'manipulation'}}
                  >
                    <X size={16}/>
                  </button>
                </>
              ):(
                <div className="relative">
                  <button
                    onClick={()=>{setLoginOpen(true);setShowSandboxLoginHint(false)}}
                    aria-label={t('auth.login')}
                    title={t('auth.login')}
                    className={`relative inline-flex items-center rounded-lg border border-stone-300 bg-gradient-to-r from-emerald-500 to-emerald-600 p-2.5 sm:p-3 text-sm font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[42px] min-w-[42px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation transition-all duration-200 active:scale-95 ${showSandboxLoginHint?'ring-2 ring-offset-2 ring-offset-white ring-emerald-300 shadow-lg shadow-emerald-200':''}`}
                    style={{touchAction: 'manipulation'}}
                  >
                    {showSandboxLoginHint && (
                      <span className="pointer-events-none absolute inset-[-8px] rounded-xl bg-emerald-300/35 blur-md animate-ping" aria-hidden></span>
                    )}
                    <Lock size={16}/>
                  </button>
                  {showSandboxLoginHint && (
                    <div className="absolute right-0 top-full mt-2 w-[240px] rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900 shadow-lg shadow-emerald-100 z-30">
                      <div className="absolute right-6 -top-1 h-2 w-2 rotate-45 border border-emerald-200 border-b-0 border-r-0 bg-emerald-50"></div>
                      <button
                        onClick={handleDismissSandboxLoginHint}
                        aria-label={t('common.close')}
                        className="absolute -right-1 -top-1 rounded-full bg-white/80 p-1 text-emerald-600 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        <X size={12}/>
                      </button>
                      <div className="flex gap-2 pr-4">
                        <Lock size={14} className="mt-[2px] text-emerald-600"/>
                        <div className="space-y-0.5 leading-snug">
                          <p className="font-semibold">{t('auth.sandboxLoginTitle')}</p>
                          <p className="text-emerald-800">{t('auth.sandboxLoginBody')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-6xl p-4">
      {maintenanceActive ? (
        <MaintenancePage />
      ) : showAuthError ? (
        <Suspense fallback={<div className="py-16 text-center text-sm text-stone-500">{t('skeleton.authError')}</div>}>
          <AuthLinkErrorPage 
            error={authError.error}
            errorCode={authError.errorCode}
            description={authError.description}
            onHome={handleAuthErrorHome}
            onLogin={handleAuthErrorLogin}
          />
        </Suspense>
      ) : showInviteSetup ? (
        <Suspense fallback={<div className="py-16 text-center text-sm text-stone-500">{t('skeleton.invite')}</div>}>
          <InviteSetupPage onComplete={handleInviteComplete} />
        </Suspense>
      ) : loadError ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-md">
          <h2 className="text-lg font-semibold text-stone-900">{t('error.loadFailed')}</h2>
          <p className="text-sm text-stone-600 mt-2 whitespace-pre-line">{loadError}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              onClick={handleRetryLoading}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {t('common.retryLoading')}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300"
            >
              {t('common.refreshWindow')}
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="animate-pulse">
            <div className="h-8 bg-stone-200 rounded w-48 mb-4"></div>
            <div className="border border-stone-200 rounded-lg overflow-hidden">
              <div className="h-12 bg-stone-100"></div>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-16 border-t border-stone-200 bg-white flex items-center px-4 gap-4">
                  <div className="h-10 w-10 bg-stone-200 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-stone-200 rounded w-1/3"></div>
                    <div className="h-3 bg-stone-100 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="will-change-contents">
          {pageLoading ? (
            <PageSkeleton tab={tab} />
          ) : (
            <>
              {tab==="dashboard"&&(
                <ErrorBoundary componentName="Dashboard">
                  <Dashboard
                    totals={totals}
                    players={publicPlayers}
                    matches={matches}
                    isAdmin={isAdmin || isSandboxGuest}
                    onUpdateMatch={handleUpdateMatch}
                    upcomingMatches={db.upcomingMatches}
                    onSaveUpcomingMatch={handleSaveUpcomingMatch}
                    onDeleteUpcomingMatch={handleDeleteUpcomingMatch}
                    onUpdateUpcomingMatch={handleUpdateUpcomingMatch}
                    membershipSettings={db.membershipSettings||[]}
                    momFeatureEnabled={featuresEnabled?.mom ?? true}
                    leaderboardToggles={featuresEnabled?.leaderboards || {}}
                    badgesEnabled={badgesFeatureEnabled}
                    playerStatsEnabled={playerStatsModalEnabled}
                    seasonRecapEnabled={!maintenanceActive && (seasonRecapEnabled ?? false)}
                    seasonRecapReady={appSettingsLoaded}
                    cardTypesEnabled={featuresEnabled?.cardTypes ?? { yellow: true, red: true, black: true }}
                  />
                </ErrorBoundary>
              )}
              {tab==="players"&&(isSandboxMode || (isAdmin && featuresEnabled.players))&&(
                <ErrorBoundary componentName="PlayersPage">
                  <PlayersPage
                    players={players}
                    matches={matches}
                    selectedId={selectedPlayerId}
                    onSelect={setSelectedPlayerId}
                    onCreate={handleCreatePlayerFromModal}  // ✅ 여기로 연결
                    onUpdate={handleUpdatePlayer}
                    onDelete={handleDeletePlayer}
                    onImport={handleImportPlayers}
                    onReset={handleResetPlayers}
                    tagPresets={db.tagPresets||[]}
                    onAddTagPreset={handleAddTagPreset}
                    onUpdateTagPreset={handleUpdateTagPreset}
                    onDeleteTagPreset={handleDeleteTagPreset}
                    membershipSettings={db.membershipSettings||[]}
                    onSaveMembershipSettings={handleSaveMembershipSettings}
                    isAdmin={true}
                    systemAccount={systemAccount}
                    onEnsureSystemAccount={handleEnsureSystemAccount}
                  />
                </ErrorBoundary>
              )}
              {tab==="planner"&&(isSandboxMode || (isAdmin && featuresEnabled.planner))&&(
                <ErrorBoundary componentName="MatchPlanner">
                  <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.planner')}</div>}>
                    <MatchPlanner players={publicPlayers} matches={matches} onSaveMatch={handleSaveMatch} onDeleteMatch={handleDeleteMatch} onUpdateMatch={handleUpdateMatch} isAdmin={true} upcomingMatches={db.upcomingMatches} onSaveUpcomingMatch={handleSaveUpcomingMatch} onDeleteUpcomingMatch={handleDeleteUpcomingMatch} onUpdateUpcomingMatch={handleUpdateUpcomingMatch} membershipSettings={db.membershipSettings||[]} onStartRefereeMode={handleStartRefereeMode}/>
                  </Suspense>
                </ErrorBoundary>
              )}

              {tab==="draft"&&(isSandboxMode || (isAdmin && featuresEnabled.draft))&&(
                <ErrorBoundary componentName="DraftPage">
                  <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.draft')}</div>}>
                    <DraftPage players={publicPlayers} upcomingMatches={db.upcomingMatches} onUpdateUpcomingMatch={handleUpdateUpcomingMatch}/>
                  </Suspense>
                </ErrorBoundary>
              )}
              {tab==="formation"&&featuresEnabled.formation&&(
                <ErrorBoundary componentName="FormationBoard">
                  <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.formation')}</div>}>
                    <FormationBoard players={publicPlayers} isAdmin={true} fetchMatchTeams={fetchMatchTeams}/>
                  </Suspense>
                </ErrorBoundary>
              )}
              {tab==="stats"&&(isSandboxMode || (isAdmin && featuresEnabled.stats))&&(
                <ErrorBoundary componentName="StatsInput">
                  <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.stats')}</div>}>
                    <StatsInput 
                      players={publicPlayers} 
                      matches={matches} 
                      onUpdateMatch={handleUpdateMatch} 
                      isAdmin={true}
                      cardsFeatureEnabled={featuresEnabled?.cards ?? true}
                      cardTypesEnabled={featuresEnabled?.cardTypes ?? { yellow: true, red: true, black: true }}
                      onStartRefereeMode={handleStartRefereeMode}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
                {tab==="accounting"&&(isSandboxMode || (isAdmin && (featuresEnabled.accounting ?? true)))&&(
                  <ErrorBoundary componentName="AccountingPage">
                    <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.accounting')}</div>}>
                      <AccountingPage players={players} matches={matches} upcomingMatches={db.upcomingMatches} isAdmin={true}/>
                    </Suspense>
                  </ErrorBoundary>
                )}
              {tab==="analytics"&&isAdmin&&featuresEnabled.analytics&&(
                <ErrorBoundary componentName="AnalyticsPage">
                  <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.analytics')}</div>}>
                    <AnalyticsPage visits={visits} isAdmin={isAnalyticsAdmin}/>
                  </Suspense>
                </ErrorBoundary>
              )}
              {tab==="settings"&&isAdmin&&(
                <ErrorBoundary componentName="SettingsPage">
                  <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('common.loading')}</div>}>
                    <SettingsPage
                      appTitle={appTitle}
                      onTitleChange={setAppTitle}
                      seasonRecapEnabled={seasonRecapEnabled}
                      onSeasonRecapToggle={handleSeasonRecapToggle}
                      maintenanceMode={maintenanceMode}
                      onMaintenanceModeToggle={handleMaintenanceModeToggle}
                      featuresEnabled={featuresEnabled}
                      onFeatureToggle={handleFeatureToggle}
                      onLeaderboardToggle={handleLeaderboardToggle}
                      badgeTierOverrides={badgeTierOverrides}
                      onSaveBadgeTierOverrides={handleSaveBadgeTierOverrides}
                      isAdmin={isAdmin}
                      isAnalyticsAdmin={isAnalyticsAdmin}
                      visits={visits}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </>
          )}
        </div>
      )}
    </main>

    <footer className="mx-auto mt-10 max-w-6xl px-4 pb-8">
      <div className="mt-4 text-center text-[11px] text-stone-400">Goalify · v{import.meta.env.VITE_APP_VERSION} build({import.meta.env.VITE_APP_COMMIT})</div>
    </footer>

    <AdminLoginDialog isOpen={loginOpen} onClose={()=>setLoginOpen(false)} onSuccess={onAdminSuccess}/>
  </div>)}
const TabButton = React.memo(function TabButton({icon,label,active,onClick,loading}){return(<button onClick={onClick} disabled={loading} title={label} aria-label={label} className={`flex items-center gap-1.5 rounded-md px-2.5 py-2.5 sm:px-3 sm:py-3 text-sm transition-all duration-200 min-h-[42px] sm:min-h-[44px] touch-manipulation whitespace-nowrap ${active?"bg-emerald-500 text-white shadow-md":"text-stone-700 hover:bg-stone-200 active:bg-stone-300 active:scale-95"} ${loading?"opacity-75 cursor-wait":""}`} style={{touchAction: 'manipulation'}} aria-pressed={active}>{loading && active ? <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> : <span className="w-4 h-4 flex-shrink-0">{icon}</span>}{active && <span className="text-xs font-semibold hidden sm:inline">{label}</span>}</button>)})


// 페이지별 로딩 스켈레톤 컴포넌트
const PageSkeleton = React.memo(function PageSkeleton({ tab }) {
  const getSkeletonByTab = () => {
    switch(tab) {
      case 'dashboard':
        return (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-lg border border-stone-200 p-6">
                  <div className="h-4 bg-stone-200 rounded w-1/3 mb-3"></div>
                  <div className="h-8 bg-stone-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-lg border border-stone-200 p-6">
              <div className="h-6 bg-stone-200 rounded w-1/4 mb-4"></div>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center space-x-4 py-3">
                  <div className="h-10 w-10 bg-stone-200 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-stone-200 rounded w-1/3"></div>
                    <div className="h-3 bg-stone-100 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'players':
        return (
          <div className="space-y-4 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-8 bg-stone-200 rounded w-48"></div>
              <div className="h-10 bg-stone-200 rounded w-24"></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="bg-white rounded-lg border border-stone-200 p-4 mb-3">
                    <div className="flex items-center space-x-4">
                      <div className="h-12 w-12 bg-stone-200 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-stone-200 rounded w-1/3"></div>
                        <div className="h-3 bg-stone-100 rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-lg border border-stone-200 p-6">
                <div className="h-6 bg-stone-200 rounded w-1/2 mb-4"></div>
                <div className="space-y-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-4 bg-stone-100 rounded"></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'formation':
        return (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-stone-200 rounded w-48 mb-4"></div>
            <div className="bg-white rounded-lg border border-stone-200 p-6">
              <div className="aspect-[3/2] bg-stone-100 rounded-lg flex items-center justify-center">
                <div className="text-stone-400">
                  <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-stone-200 rounded w-48 mb-4"></div>
            <div className="bg-white rounded-lg border border-stone-200 p-6">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-16 border-b border-stone-100 last:border-b-0 flex items-center px-4 gap-4">
                  <div className="h-10 w-10 bg-stone-200 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-stone-200 rounded w-1/3"></div>
                    <div className="h-3 bg-stone-100 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="opacity-80">
      {getSkeletonByTab()}
    </div>
  );
})

function buildBadgeTierFormState(catalog = [], overrides = {}) {
  const result = {}
  if (!Array.isArray(catalog)) return result
  catalog.forEach((rule) => {
    const overrideEntry = overrides?.[rule.slug]?.tiers || {}
    const tierValues = {};
    (rule.tiers || []).forEach((tierDef) => {
      const tierKey = tierDef.tier
      const overrideValue = overrideEntry?.[tierKey]
      const baseValue = tierDef.min ?? 0
      const valueToUse = overrideValue ?? baseValue
      tierValues[tierKey] = valueToUse === '' ? '' : String(valueToUse)
    })
    result[rule.slug] = tierValues
  })
  return result
}

function validateBadgeTierForm(catalog = [], values = {}) {
  const errors = {}
  if (!Array.isArray(catalog)) return errors
  catalog.forEach((rule) => {
    const tiers = [...(rule.tiers || [])].sort((a, b) => a.tier - b.tier)
    let prev = null
    for (const tierDef of tiers) {
      const raw = values?.[rule.slug]?.[tierDef.tier]
      const num = Number(raw)
      if (!Number.isFinite(num) || num < 0) {
        errors[rule.slug] = 'nonNumeric'
        break
      }
      if (prev != null && num < prev) {
        errors[rule.slug] = 'ascending'
        break
      }
      prev = num
    }
  })
  return errors
}

function mergeBadgeTierOverridesForSave(catalog = [], values = {}, existing = {}) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return typeof existing === 'object' && existing !== null ? existing : {}
  }
  const preserved = {}
  Object.entries(existing || {}).forEach(([slug, entry]) => {
    const known = catalog.some((rule) => rule.slug === slug)
    if (!known) {
      preserved[slug] = entry
    }
  })

  const payload = { ...preserved }
  catalog.forEach((rule) => {
    const baseMap = {}
    ;(rule.tiers || []).forEach((tierDef) => {
      baseMap[tierDef.tier] = Number(tierDef.min)
    })
    const userValues = values?.[rule.slug] || {}
    const diffs = {}
    Object.entries(baseMap).forEach(([tier, baseValue]) => {
      const raw = userValues[tier]
      const num = Number(raw)
      if (!Number.isFinite(num)) return
      if (num !== baseValue) {
        diffs[tier] = num
      }
    })
    if (Object.keys(diffs).length > 0) {
      payload[rule.slug] = { tiers: diffs }
    } else {
      delete payload[rule.slug]
    }
  })

  return payload
}

/* ── Settings Dialog ─────────────────── */
function SettingsDialog({isOpen,onClose,appTitle,onTitleChange,seasonRecapEnabled,onSeasonRecapToggle,maintenanceMode,onMaintenanceModeToggle,featuresEnabled,onFeatureToggle,onLeaderboardToggle,badgeTierOverrides,onSaveBadgeTierOverrides,isAdmin,isAnalyticsAdmin,visits}){
  const { t } = useTranslation()
  const[newTitle,setNewTitle]=useState(appTitle)
  const[titleEditMode,setTitleEditMode]=useState(false)
  const badgeTierCatalog = useMemo(() => {
    const catalog = getBadgeTierRuleCatalog()
    return Array.isArray(catalog) ? catalog : []
  }, [])
  const[tierFormValues,setTierFormValues]=useState(()=>buildBadgeTierFormState(badgeTierCatalog,badgeTierOverrides||{}))
  const[tierDirty,setTierDirty]=useState(false)
  const[tierErrors,setTierErrors]=useState({})
  const[tierSaving,setTierSaving]=useState(false)
  const canEditBadgeTiers = Boolean(isAdmin && badgeTierCatalog.length>0 && onSaveBadgeTierOverrides)
  const badgesFeatureOn = Boolean(featuresEnabled?.badges ?? true)
  
  useEffect(()=>{
    if(isOpen){
      setNewTitle(appTitle)
      setTitleEditMode(false)
    }
  },[isOpen,appTitle])

  useEffect(()=>{
    if(!isOpen)return
    setTierFormValues(buildBadgeTierFormState(badgeTierCatalog,badgeTierOverrides||{}))
    setTierDirty(false)
    setTierErrors({})
  },[isOpen,badgeTierCatalog,badgeTierOverrides])
  
  const handleTitleUpdate=()=>{
    if(newTitle.trim()){
      if(updateAppTitle(newTitle.trim())){
        onTitleChange(newTitle.trim())
        setTitleEditMode(false)
        notify(t('settings.titleChanged'),"success")
      }else{
        notify(t('settings.titleChangeFailed'),"error")
      }
    }
  }

  const tierName=(tier)=>{
    switch(Number(tier)){
      case 5:return t('badges.tiers.diamond')
      case 4:return t('badges.tiers.platinum')
      case 3:return t('badges.tiers.gold')
      case 2:return t('badges.tiers.silver')
      case 1:return t('badges.tiers.bronze')
      default:return`Tier ${tier}`
    }
  }

  const resolveTierError=(code)=>{
    if(code==='ascending')return'상위 티어는 하위 티어보다 크거나 같아야 합니다.'
    return'0 이상의 숫자를 입력하세요.'
  }

  const handleTierInputChange=(slug,tier,value)=>{
    setTierDirty(true)
    setTierFormValues(prev=>({
      ...prev,
      [slug]:{
        ...(prev[slug]||{}),
        [tier]:value
      }
    }))
  }

  const handleTierReset=(slug)=>{
    const rule=badgeTierCatalog.find(r=>r.slug===slug)
    if(!rule)return
    const defaults={}
    ;(rule.tiers||[]).forEach(tier=>{defaults[tier.tier]=String(tier.min)})
    setTierFormValues(prev=>({...prev,[slug]:defaults}))
    setTierDirty(true)
    setTierErrors(prev=>{const next={...prev};delete next[slug];return next})
  }

  const handleTierResetAll=()=>{
    setTierFormValues(buildBadgeTierFormState(badgeTierCatalog,{}))
    setTierDirty(true)
    setTierErrors({})
  }

  const handleTierSave=async()=>{
    if(!canEditBadgeTiers)return
    const validation=validateBadgeTierForm(badgeTierCatalog,tierFormValues)
    setTierErrors(validation)
    if(Object.keys(validation).length>0)return
    setTierSaving(true)
    const payload=mergeBadgeTierOverridesForSave(badgeTierCatalog,tierFormValues,badgeTierOverrides||{})
    const success=await onSaveBadgeTierOverrides(payload)
    setTierSaving(false)
    if(success){
      setTierDirty(false)
    }
  }
  
  const featureLabels = {
    players: t('nav.players'),
    planner: t('nav.planner'),
    draft: t('nav.draft'),
    formation: t('nav.formation'),
    stats: t('nav.stats'),
    cards: '카드 기록 (Y/R/B)',
    mom: 'MOM 투표/리더보드',
    badges: '챌린지 뱃지',
    playerStatsModal: '선수 기록 모달',
    accounting: t('nav.accounting'),
    analytics: t('nav.analytics')
  }
  const leaderboardLabels = {
    pts: 'AP(공격포인트)',
    g: '골',
    a: '어시스트',
    gp: '경기출전',
    cs: '클린시트',
    duo: '듀오(어→골)',
    cards: '카드(Y/R)'
  }
  
  const cardTypeLabels = {
    yellow: '옐로우 카드 (Y)',
    red: '레드 카드 (R)',
    black: '블랙 카드 (B)'
  }
  
  if(!isOpen)return null;
  
  return(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-stone-200 bg-white shadow-xl overflow-hidden">
        <button className="absolute right-3 top-3 rounded-md p-1 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label={t('common.close')}>
          <X size={18}/>
        </button>
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Settings size={20}/>
          </div>
          <div>
            <h3 className="text-base font-semibold">{t('settings.title')}</h3>
            <p className="text-xs text-stone-500">{t('settings.description')}</p>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-stone-700">{t('settings.appTitle')}</label>
              {!titleEditMode && (
                <button onClick={()=>setTitleEditMode(true)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  {t('common.edit')}
                </button>
              )}
            </div>
            {titleEditMode ? (
              <div className="space-y-2">
                <input 
                  type="text" 
                  value={newTitle} 
                  onChange={e=>setNewTitle(e.target.value)} 
                  placeholder="앱 타이틀 입력" 
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button 
                    onClick={handleTitleUpdate} 
                    className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                  >
                    저장
                  </button>
                  <button 
                    onClick={()=>{setNewTitle(appTitle);setTitleEditMode(false)}} 
                    className="flex-1 px-3 py-2 text-sm font-semibold text-stone-700 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2.5 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-700 font-medium">
                {appTitle}
              </div>
            )}
          </div>

          {/* 시즌 리캡 활성화 토글 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block text-sm font-medium text-stone-700">{t('settings.seasonRecap')}</label>
                <p className="text-xs text-stone-500 mt-0.5">{t('settings.seasonRecapDesc')}</p>
              </div>
              <button
                onClick={() => onSeasonRecapToggle(!seasonRecapEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  seasonRecapEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                }`}
                role="switch"
                aria-checked={seasonRecapEnabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    seasonRecapEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 유지보수 모드 토글 (개발자용) */}
          {isAnalyticsAdmin && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="block text-sm font-medium text-stone-700">
                    유지보수 모드
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">개발자</span>
                  </label>
                  <p className="text-xs text-stone-500 mt-0.5">일반 사용자에게 점검 페이지 표시 (개발자는 정상 접근)</p>
                </div>
                <button
                  onClick={() => onMaintenanceModeToggle(!maintenanceMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    maintenanceMode ? 'bg-purple-600' : 'bg-stone-300'
                  }`}
                  role="switch"
                  aria-checked={maintenanceMode}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* 기능 활성화 설정 (Admin만, 방문자분석 토글은 개발자만) */}
          {isAdmin && (
            <>
              <div className="border-t border-stone-200 pt-4 mt-2">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-stone-800">기능 활성화 설정</h4>
                  <p className="text-xs text-stone-500 mt-0.5">각 탭의 표시 여부를 제어합니다 (데이터는 유지됩니다)</p>
                </div>
              
              <div className="space-y-3">
                {Object.entries(featureLabels).map(([key, label]) => {
                  // 방문자분석 토글은 개발자만 보이기
                  if (key === 'analytics' && !isAnalyticsAdmin) {
                    return null
                  }

                  const isOn = featuresEnabled?.[key] ?? true
                  const badgesBlocked = key === 'badges' && !featuresEnabled?.playerStatsModal

                  return (
                    <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
                      <div className="flex flex-col text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-stone-700">{label}</span>
                          {key === 'formation' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">모두</span>
                          )}
                          {key === 'analytics' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">개발자</span>
                          )}
                          {key !== 'formation' && key !== 'analytics' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Admin</span>
                          )}
                        </div>
                        {badgesBlocked && (
                          <span className="mt-1 text-[11px] text-stone-500">선수 기록 모달을 켜야 이용할 수 있어요.</span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (badgesBlocked) {
                            notify('선수 기록 모달을 활성화해야 챌린지 뱃지를 사용할 수 있어요.', 'info')
                            return
                          }
                          onFeatureToggle(key, !isOn)
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                          isOn ? 'bg-emerald-600' : 'bg-stone-300'
                        } ${badgesBlocked ? 'cursor-not-allowed opacity-60' : ''}`}
                        role="switch"
                        aria-checked={isOn}
                        aria-disabled={badgesBlocked}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            isOn ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="text-xs text-stone-500 bg-blue-50 rounded-lg p-3 border border-blue-200 mt-3">
                ℹ️ 기능을 비활성화해도 저장된 매치와 선수 데이터는 유지됩니다. 기능을 다시 활성화하면 이전 데이터를 볼 수 있습니다.
              </div>
            </div>

            {/* 리더보드 카테고리 표시 제어 */}
            <div className="border-t border-stone-200 pt-4 mt-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-stone-800">리더보드 카테고리 표시</h4>
                <p className="text-xs text-stone-500 mt-0.5">카테고리를 숨겨도 데이터는 유지됩니다 (UI만 숨김)</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {/* 리더보드 카드 전체 표시/숨김 */}
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-900">리더보드 카드 전체</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 font-medium">전체</span>
                  </div>
                  <button
                    onClick={() => {
                      const current = featuresEnabled?.leaderboards?.visible
                      const isOn = current === undefined ? true : !!current
                      onLeaderboardToggle?.('visible', !isOn)
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                      (featuresEnabled?.leaderboards?.visible === undefined ? true : !!featuresEnabled?.leaderboards?.visible) ? 'bg-emerald-600' : 'bg-stone-300'
                    }`}
                    role="switch"
                    aria-checked={featuresEnabled?.leaderboards?.visible === undefined ? true : !!featuresEnabled?.leaderboards?.visible}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        (featuresEnabled?.leaderboards?.visible === undefined ? true : !!featuresEnabled?.leaderboards?.visible) ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {Object.entries(leaderboardLabels).map(([key,label])=>{
                  const current = featuresEnabled?.leaderboards?.[key]
                  const isOn = current === undefined ? true : !!current
                  return (
                    <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-stone-700">{label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 font-medium">리더보드</span>
                      </div>
                      <button
                        onClick={() => onLeaderboardToggle?.(key, !isOn)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                          isOn ? 'bg-emerald-600' : 'bg-stone-300'
                        }`}
                        role="switch"
                        aria-checked={isOn}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            isOn ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 카드 타입별 기록 제어 */}
            <div className="border-t border-stone-200 pt-4 mt-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-stone-800">카드 기록 타입 제어</h4>
                <p className="text-xs text-stone-500 mt-0.5">각 카드 타입을 개별적으로 켜고 끌 수 있습니다</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(cardTypeLabels).map(([key, label]) => {
                  const current = featuresEnabled?.cardTypes?.[key]
                  const isOn = current === undefined ? true : !!current
                  return (
                    <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-stone-700">{label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">기록</span>
                      </div>
                      <button
                        onClick={() => onFeatureToggle(`cardTypes.${key}`, !isOn)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                          isOn ? 'bg-emerald-600' : 'bg-stone-300'
                        }`}
                        role="switch"
                        aria-checked={isOn}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            isOn ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="text-xs text-stone-500 bg-amber-50 rounded-lg p-3 border border-amber-200 mt-3">
                ℹ️ 카드 타입을 비활성화하면 해당 카드의 기록 입력이 숨겨지지만, 기존 데이터는 유지됩니다.
              </div>
            </div>

            {canEditBadgeTiers && badgesFeatureOn && (
              <div className="border-t border-stone-200 pt-4 mt-4">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-stone-800">뱃지 티어 기준</h4>
                  <p className="text-xs text-stone-500 mt-0.5">브론즈~다이아몬드 임계값을 조정하여 팀 분위기에 맞게 커스터마이징하세요.</p>
                </div>
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {badgeTierCatalog.map(rule => (
                    <div key={rule.slug} className="rounded-xl border border-stone-200 bg-white/80 p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">{rule.name}</p>
                          <p className="text-[11px] uppercase tracking-wide text-stone-400">slug · {rule.slug}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {badgeTierOverrides?.[rule.slug] && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-200">커스텀</span>
                          )}
                          <button type="button" onClick={()=>handleTierReset(rule.slug)} className="text-xs font-semibold text-stone-500 hover:text-stone-700">기본값</button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {rule.tiers.slice().sort((a,b)=>a.tier-b.tier).map(tier=>(
                          <label key={`${rule.slug}-${tier.tier}`} className="flex flex-col gap-1 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
                            <span className="text-xs font-semibold text-stone-600">{tierName(tier.tier)}</span>
                            <input
                              type="number"
                              min="0"
                              value={tierFormValues?.[rule.slug]?.[tier.tier] ?? ''}
                              onChange={(e)=>handleTierInputChange(rule.slug,tier.tier,e.target.value)}
                              className="w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </label>
                        ))}
                      </div>
                      {tierErrors[rule.slug] && (
                        <p className="mt-2 text-xs font-semibold text-rose-600">{resolveTierError(tierErrors[rule.slug])}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleTierSave}
                    disabled={!tierDirty||tierSaving}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white ${(!tierDirty||tierSaving)?'bg-emerald-300 cursor-not-allowed':'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {tierSaving ? '저장 중...' : '티어 기준 저장'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTierResetAll}
                    className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    전체 기본값 복원
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">값을 저장하면 모든 선수의 뱃지 계산에 즉시 반영됩니다.</p>
              </div>
            )}
            </>
          )}

          <div className="text-xs text-stone-500 bg-stone-50 rounded-lg p-3 border border-stone-200">
            💡 모든 설정은 데이터베이스에 저장되어 모든 디바이스에 동기화됩니다.
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
