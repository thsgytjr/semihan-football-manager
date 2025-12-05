// src/App.jsx
import React,{useEffect,useMemo,useState,useCallback,useRef,lazy,Suspense}from"react"
import{Home,Users,CalendarDays,ListChecks,ShieldCheck,Lock,Eye,EyeOff,AlertCircle,CheckCircle2,X,Settings,BookOpen,Shuffle,DollarSign}from"lucide-react"
import{useTranslation}from"react-i18next"
import{listPlayers,upsertPlayer,deletePlayer,subscribePlayers,loadDB,saveDB,subscribeDB,incrementVisits,logVisit,getVisitStats,getTotalVisits,USE_MATCHES_TABLE}from"./services/storage.service"
import { supabase } from './lib/supabaseClient'
import{saveMatchToDB,updateMatchInDB,deleteMatchFromDB,listMatchesFromDB,subscribeMatches}from"./services/matches.service"
import{getMembershipSettings,subscribeMembershipSettings}from"./services/membership.service"
import{mkPlayer,isUnknownPlayer,isSystemAccount,mkSystemAccount}from"./lib/players";import{notify}from"./components/Toast"
import{filterExpiredMatches, normalizeDateISO}from"./lib/upcomingMatch"
import{getOrCreateVisitorId,getVisitorIP,parseUserAgent,shouldTrackVisit,isPreviewMode,isDevelopmentEnvironment}from"./lib/visitorTracking"
import{signInAdmin,signOut,getSession,onAuthStateChange,isDeveloperEmail}from"./lib/auth"
import{logger}from"./lib/logger"

// 개발자 이메일 설정
const DEVELOPER_EMAIL = 'sonhyosuck@gmail.com'
import{runMigrations}from"./lib/dbMigration"
import ToastHub from"./components/Toast";import Card from"./components/Card"
import AdminLoginDialog from"./components/AdminLoginDialog"
import VisitorStats from"./components/VisitorStats"
import ProdDataWarning from"./components/ProdDataWarning"
import LanguageSwitcher from"./components/LanguageSwitcherNew"
import Dashboard from"./pages/Dashboard";import PlayersPage from"./pages/PlayersPage";import MaintenancePage from"./pages/MaintenancePage"
import logoUrl from"./assets/GoalifyLogo.png"
import{getAppSettings,loadAppSettingsFromServer,updateAppTitle,updateSeasonRecapEnabled,updateMaintenanceMode,updateFeatureEnabled,updateLeaderboardCategoryEnabled,updateBadgeTierOverrides}from"./lib/appSettings"
import { getBadgeTierRuleCatalog } from './lib/playerBadgeEngine'

const IconPitch=({size=16})=>(<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden role="img" className="shrink-0"><rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="18.5" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>)

const MatchPlanner=lazy(()=>import("./pages/MatchPlanner"))
const DraftPage=lazy(()=>import("./pages/DraftPage"))
const FormationBoard=lazy(()=>import("./pages/FormationBoard"))
const StatsInput=lazy(()=>import("./pages/StatsInput"))
const AccountingPage=lazy(()=>import("./pages/AccountingPage"))
const AnalyticsPage=lazy(()=>import("./pages/AnalyticsPage"))
const InviteSetupPage=lazy(()=>import("./pages/InviteSetupPage"))
const AuthLinkErrorPage=lazy(()=>import("./pages/AuthLinkErrorPage"))

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

export default function App(){
  const { t } = useTranslation()
  const[tab,setTab]=useState("dashboard"),[db,setDb]=useState({players:[],matches:[],visits:0,upcomingMatches:[],tagPresets:[],membershipSettings:[]}),[selectedPlayerId,setSelectedPlayerId]=useState(null)
  const[isAdmin,setIsAdmin]=useState(false),[isAnalyticsAdmin,setIsAnalyticsAdmin]=useState(false),[loginOpen,setLoginOpen]=useState(false)
  const[loading,setLoading]=useState(true)
  const[pageLoading,setPageLoading]=useState(false)
  const[loadError,setLoadError]=useState(null)
  const[loadAttempt,setLoadAttempt]=useState(0)
  const[appTitle,setAppTitle]=useState(()=>getAppSettings().appTitle)
  const[settingsOpen,setSettingsOpen]=useState(false)
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

  // 사용자가 수동 재시도할 때 호출 (새로고침 없이 재시도)
  const handleRetryLoading = useCallback(() => {
    setLoadError(null)
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

        const playersFromDB = await withTimeout(listPlayers(), 6000, 'listPlayers')
        const shared = await withTimeout(loadDB(), 6000, 'loadDB')

        // 멤버십 설정 로드 (새 테이블에서)
        const membershipSettings = await withTimeout(getMembershipSettings(), 6000, 'getMembershipSettings')

        // Matches 로드: USE_MATCHES_TABLE 플래그에 따라 분기
        let matchesData = []
        if (USE_MATCHES_TABLE) {
          logger.log('[App] Loading matches from Supabase matches table')
          matchesData = await withTimeout(listMatchesFromDB(), 6000, 'listMatchesFromDB') || []
        } else {
          logger.log('[App] Loading matches from appdb JSON')
          matchesData = (shared && shared.matches) || []
        }

        if(!mounted) return

        // 로딩 성공 시 재시도 카운터 초기화
        sessionStorage.removeItem('sfm:retry_count')

        // 만료된 예정 매치들을 필터링
        const activeUpcomingMatches = filterExpiredMatches((shared && shared.upcomingMatches) || [])

        // 만료된 매치가 있었다면 DB에서도 제거
        if(activeUpcomingMatches.length !== ((shared && shared.upcomingMatches) || []).length) {
          const updatedShared = {...(shared || {}), upcomingMatches: activeUpcomingMatches}
          await withTimeout(saveDB(updatedShared), 4000, 'saveDB').catch(logger.error)
        }

        // 총 방문자 수 조회 (visit_logs 테이블에서)
        const totalVisits = await withTimeout(getTotalVisits(), 6000, 'getTotalVisits') || 0

        setDb({
          players: playersFromDB || [],
          matches: matchesData,
          visits: totalVisits,
          upcomingMatches: activeUpcomingMatches,
          tagPresets: (shared && shared.tagPresets) || [],
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
              await withTimeout(incrementVisits(), 4000, 'incrementVisits')
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
    const offP=subscribePlayers(list=>setDb(prev=>({...prev,players:list})))

    // Matches 구독: USE_MATCHES_TABLE 플래그에 따라 분기
    let offMatches = () => {}
    if (USE_MATCHES_TABLE) {
      logger.log('[App] Subscribing to matches table')
      offMatches = subscribeMatches(list=>setDb(prev=>({...prev,matches:list})))
    }

    const offDB=subscribeDB(next=>{
      const activeUpcomingMatches = filterExpiredMatches(next.upcomingMatches||[])
      if (USE_MATCHES_TABLE) {
        setDb(prev=>({...prev,upcomingMatches:activeUpcomingMatches,tagPresets:next.tagPresets||prev.tagPresets||[]}))
      } else {
        setDb(prev=>({...prev,matches:next.matches||prev.matches||[],upcomingMatches:activeUpcomingMatches,tagPresets:next.tagPresets||prev.tagPresets||[]}))
      }
    })

    const visitLogsChannel = supabase
      .channel('visit_logs_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visit_logs' },
        async () => {
          const totalVisits = await getTotalVisits()
          setDb(prev => ({ ...prev, visits: totalVisits }))
        }
      )
      .subscribe()

    const offMembership=subscribeMembershipSettings(async()=>{
      const membershipSettings = await getMembershipSettings()
      setDb(prev=>({...prev,membershipSettings:membershipSettings||[]}))
    })

    return()=>{
      offP?.()
      offMatches?.()
      offDB?.()
      offMembership?.()
      try { supabase.removeChannel?.(visitLogsChannel) } catch {}
    }
  },[])

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
  },[systemAccount])

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
  const tabButtons = useMemo(() => [
    { key: 'dashboard', icon: <Home size={16}/>, label: t('nav.dashboard'), show: true },
    { key: 'players', icon: <Users size={16}/>, label: t('nav.players'), show: isAdmin && featuresEnabled.players },
    { key: 'planner', icon: <CalendarDays size={16}/>, label: t('nav.planner'), show: isAdmin && featuresEnabled.planner },
    { key: 'draft', icon: <Shuffle size={16}/>, label: t('nav.draft'), show: isAdmin && featuresEnabled.draft },
    { key: 'formation', icon: <IconPitch size={16}/>, label: t('nav.formation'), show: featuresEnabled.formation },
    { key: 'stats', icon: <ListChecks size={16}/>, label: t('nav.stats'), show: isAdmin && featuresEnabled.stats },
  { key: 'accounting', icon: <DollarSign size={16}/>, label: t('nav.accounting'), show: isAdmin && (featuresEnabled.accounting ?? true) },
    { key: 'analytics', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, label: t('nav.analytics'), show: isAnalyticsAdmin && featuresEnabled.analytics }
  ], [isAdmin, isAnalyticsAdmin, featuresEnabled, t]);

  const playerStatsModalEnabled = featuresEnabled?.playerStatsModal ?? (featuresEnabled?.playerFunFacts ?? true)
  const badgesFeatureEnabled = playerStatsModalEnabled && (featuresEnabled?.badges ?? true)

  // ⬇️ 기존 기본값 생성 방식은 유지(필요시 다른 곳에서 사용)
  async function handleCreatePlayer(){if(!isAdmin)return notify(t('auth.adminOnly'));const p=mkPlayer(t('player.newPlayer'),"MF");setDb(prev=>({...prev,players:[p,...(prev.players||[])]}));setSelectedPlayerId(p.id);notify(t('player.playerAdded'));try{await upsertPlayer(p)}catch(e){logger.error(e)}}

  // ✅ 모달에서 넘어온 patch를 그대로 저장(OVR=50 초기화 문제 해결)
  async function handleCreatePlayerFromModal(patch){
    if(!isAdmin) return notify(t('auth.adminOnly'));
    const base = mkPlayer(patch?.name || t('player.newPlayer'), patch?.position || "");
    const playerToSave = {
      ...base,
      ...patch,
      id: patch?.id || base.id,           // 신규 ID 보존
    };
    // 프론트 상태 업데이트
    setDb(prev => ({ ...prev, players: [playerToSave, ...(prev.players||[])] }));
    setSelectedPlayerId(playerToSave.id);
    notify("새 선수가 추가되었어요.");
    // DB 반영
    try { await upsertPlayer(playerToSave); }
    catch(e){ logger.error(e); }
  }

  async function handleUpdatePlayer(next){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,players:(prev.players||[]).map(x=>x.id===next.id?next:x)}));try{await upsertPlayer(next)}catch(e){logger.error(e)}}
  async function handleDeletePlayer(id){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,players:(prev.players||[]).filter(p=>p.id!==id)}));if(selectedPlayerId===id)setSelectedPlayerId(null);try{await deletePlayer(id);notify("선수를 삭제했습니다.")}catch(e){logger.error(e)}}
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
    if(!isAdmin)return notify("Admin만 가능합니다.")
    
    try {
      if (USE_MATCHES_TABLE) {
        // Supabase matches 테이블에 저장
        const saved = await saveMatchToDB(match)
        setDb(prev=>({...prev,matches:[...(prev.matches||[]),saved]}))
        notify("매치가 저장되었습니다.")
      } else {
        // 기존 appdb JSON 방식
        setDb(prev=>{
          const next=[...(prev.matches||[]),match]
          saveDB({players:[],matches:next,visits,upcomingMatches,tagPresets:prev.tagPresets||[]})
          notify("매치가 저장되었습니다.")
          return {...prev,matches:next}
        })
      }
      
      // 백업용으로 appdb에도 저장 (이중 저장)
      if (USE_MATCHES_TABLE) {
        const appdbMatches = await listMatchesFromDB()
        setDb(prev=>{
          saveDB({players:[],matches:appdbMatches,visits,upcomingMatches,tagPresets:prev.tagPresets||[]}).catch(logger.error)
          return prev
        })
      }
    } catch(e) {
      logger.error('[handleSaveMatch] failed', e)
      notify("매치 저장에 실패했습니다.")
    }
  }
  
  async function handleDeleteMatch(id){
    if(!isAdmin)return notify("Admin만 가능합니다.")
    
    try {
      if (USE_MATCHES_TABLE) {
        // Supabase matches 테이블에서 삭제
        await deleteMatchFromDB(id)
        const next=(db.matches||[]).filter(m=>m.id!==id)
        setDb(prev=>({...prev,matches:next}))
        notify("매치를 삭제했습니다.")
      } else {
        // 기존 appdb JSON 방식
        setDb(prev=>{
          const next=(prev.matches||[]).filter(m=>m.id!==id)
          saveDB({players:[],matches:next,visits,upcomingMatches,tagPresets:prev.tagPresets||[]})
          notify("매치를 삭제했습니다.")
          return {...prev,matches:next}
        })
      }
      
      // 백업용으로 appdb도 동기화 (이중 저장)
      if (USE_MATCHES_TABLE) {
        const appdbMatches = await listMatchesFromDB()
        setDb(prev=>{
          saveDB({players:[],matches:appdbMatches,visits,upcomingMatches,tagPresets:prev.tagPresets||[]}).catch(logger.error)
          return prev
        })
      }
    } catch(e) {
      logger.error('[handleDeleteMatch] failed', e)
      notify("매치 삭제에 실패했습니다.")
    }
  }
  
  async function handleUpdateMatch(id,patch){
    if(!isAdmin)return notify("Admin만 가능합니다.")
    
    try {
      if (USE_MATCHES_TABLE) {
        // Supabase matches 테이블 업데이트
        const updated = await updateMatchInDB(id, patch)
        const next=(db.matches||[]).map(m=>m.id===id?updated:m)
        setDb(prev=>({...prev,matches:next}))
        notify("업데이트되었습니다.")
      } else {
        // 기존 appdb JSON 방식
        setDb(prev=>{
          const next=(prev.matches||[]).map(m=>m.id===id?{...m,...patch}:m)
          saveDB({players:[],matches:next,visits,upcomingMatches,tagPresets:prev.tagPresets||[]})
          notify("업데이트되었습니다.")
          return {...prev,matches:next}
        })
      }
      
      // 백업용으로 appdb도 동기화 (이중 저장)
      if (USE_MATCHES_TABLE) {
        const appdbMatches = await listMatchesFromDB()
        setDb(prev=>{
          saveDB({players:[],matches:appdbMatches,visits,upcomingMatches,tagPresets:prev.tagPresets||[]}).catch(logger.error)
          return prev
        })
      }
    } catch(e) {
      logger.error('[handleUpdateMatch] failed', e)
      notify("업데이트에 실패했습니다.")
    }
  }
  
  function handleSaveUpcomingMatch(upcomingMatch){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    const normalized={...upcomingMatch,dateISO:normalizeDateISO(upcomingMatch.dateISO)}
    setDb(prev=>{
      const next=[...(prev.upcomingMatches||[]),normalized]
      saveDB({players:[],matches,visits,upcomingMatches:next,tagPresets:prev.tagPresets||[]})
      return {...prev,upcomingMatches:next}
    })
  }
  function handleDeleteUpcomingMatch(id){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    setDb(prev=>{
      const target=(prev.upcomingMatches||[]).find(m=>m.id===id)
      const next=(prev.upcomingMatches||[]).filter(m=>m.id!==id)
      saveDB({players:[],matches,visits,upcomingMatches:next,tagPresets:prev.tagPresets||[]})
      if(target) console.info('[UpcomingMatch] Deleted', {id:target.id,dateISO:target.dateISO,participantCount:(target.participantIds||target.attendeeIds||[]).length})
      return {...prev,upcomingMatches:next}
    })
  }
  function handleUpdateUpcomingMatch(id,patch,silent=false){
    if(!isAdmin)return notify("Admin만 가능합니다.");
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

    setDb(prev=>{
      const next=(prev.upcomingMatches||[]).map(m=>m.id===id?{...m,...sanitized}:m)
      saveDB({players:[],matches,visits,upcomingMatches:next,tagPresets:prev.tagPresets||[]})
      
      const after=next.find(m=>m.id===id)
      if(after){
        const beforeP=(before.participantIds||before.attendeeIds||[])
        const afterP=(after.participantIds||after.attendeeIds||[])
        const beforeC=before.captainIds||[]
        const afterC=after.captainIds||[]
        if(beforeP.length!==afterP.length||beforeP.some((x,i)=>x!==afterP[i])){
          console.warn('[UpcomingMatch] participantIds changed',{id,before:beforeP,after:afterP})
        }
        if(beforeC.length!==afterC.length||beforeC.some((x,i)=>x!==afterC[i])){
          console.warn('[UpcomingMatch] captainIds changed',{id,before:beforeC,after:afterC})
        }
        if(before.snapshot&&after.snapshot&&JSON.stringify(before.snapshot)!==JSON.stringify(after.snapshot)){
          console.warn('[UpcomingMatch] snapshot changed',{id,beforeLen:before.snapshot.length,afterLen:after.snapshot.length})
        }
        if(before.dateISO!==after.dateISO){
          console.warn('[UpcomingMatch] dateISO changed',{id,before:before.dateISO,after:after.dateISO})
        }
      }
      
      return {...prev,upcomingMatches:next}
    })

    if(!silent)notify("예정된 매치가 업데이트되었습니다.")
  }

  // 태그 프리셋 관리
  function handleSaveTagPresets(tagPresets){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    setDb(prev=>{
      const updated = {...prev,tagPresets};
      saveDB({players:prev.players||[],matches:prev.matches||[],visits:prev.visits||0,upcomingMatches:prev.upcomingMatches||[],tagPresets,membershipSettings:prev.membershipSettings||[]});
      return updated;
    });
    notify("태그 프리셋이 저장되었습니다.");
  }
  function handleAddTagPreset(preset){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    setDb(prev=>{
      const next=[...(prev.tagPresets||[]),preset];
      const updated = {...prev,tagPresets:next};
      saveDB({players:prev.players||[],matches:prev.matches||[],visits:prev.visits||0,upcomingMatches:prev.upcomingMatches||[],tagPresets:next,membershipSettings:prev.membershipSettings||[]});
      return updated;
    });
  }
  function handleUpdateTagPreset(index,updatedPreset){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    setDb(prev=>{
      const oldPreset=(prev.tagPresets||[])[index];
      const next=(prev.tagPresets||[]).map((p,i)=>i===index?updatedPreset:p);
      
      // 모든 선수의 태그를 업데이트: 이전 프리셋과 일치하는 태그를 새 프리셋으로 교체
      const updatedPlayers=(prev.players||[]).map(player=>{
        if(!player.tags||player.tags.length===0)return player;
        const updatedTags=player.tags.map(tag=>{
          // 이전 프리셋과 일치하는 태그를 찾아서 새 프리셋으로 교체
          if(tag.name===oldPreset.name&&tag.color===oldPreset.color){
            return updatedPreset;
          }
          return tag;
        });
        return{...player,tags:updatedTags};
      });
      
      // 업데이트된 선수들을 Supabase에 저장
      updatedPlayers.forEach(player=>{
        upsertPlayer(player).catch(logger.error);
      });
      
      saveDB({players:updatedPlayers,matches:prev.matches||[],visits:prev.visits||0,upcomingMatches:prev.upcomingMatches||[],tagPresets:next,membershipSettings:prev.membershipSettings||[]});
      notify("태그 프리셋이 업데이트되었습니다.");
      return {...prev,tagPresets:next,players:updatedPlayers};
    });
  }
  function handleDeleteTagPreset(index){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    setDb(prev=>{
      const deletedPreset=(prev.tagPresets||[])[index];
      const next=(prev.tagPresets||[]).filter((_,i)=>i!==index);
      
      // 모든 선수의 태그에서 삭제되는 프리셋과 일치하는 태그를 제거
      const updatedPlayers=(prev.players||[]).map(player=>{
        if(!player.tags||player.tags.length===0)return player;
        const updatedTags=player.tags.filter(tag=>{
          // 삭제되는 프리셋과 일치하지 않는 태그만 유지
          return!(tag.name===deletedPreset.name&&tag.color===deletedPreset.color);
        });
        return{...player,tags:updatedTags};
      });
      
      // 업데이트된 선수들을 Supabase에 저장
      updatedPlayers.forEach(player=>{
        upsertPlayer(player).catch(logger.error);
      });
      
      saveDB({players:updatedPlayers,matches:prev.matches||[],visits:prev.visits||0,upcomingMatches:prev.upcomingMatches||[],tagPresets:next,membershipSettings:prev.membershipSettings||[]});
      notify("태그 프리셋이 삭제되었습니다.");
      return {...prev,tagPresets:next,players:updatedPlayers};
    });
  }


  // 멤버십 설정 관리
  function handleSaveMembershipSettings(membershipSettings){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    setDb(prev=>{
      const updated = {...prev,membershipSettings};
      saveDB({players:prev.players||[],matches:prev.matches||[],visits:prev.visits||0,upcomingMatches:prev.upcomingMatches||[],tagPresets:prev.tagPresets||[],membershipSettings});
      notify("멤버십 설정이 저장되었습니다.");
      return updated;
    });
  }

  // Supabase Auth: 로그아웃
  async function adminLogout(){
    await signOut()
    setIsAdmin(false)
    localStorage.removeItem("isAdmin")
    notify("Admin 모드 해제")
  }
  
  // Supabase Auth: 로그인 성공 핸들러
  async function onAdminSuccess(email, password){
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
                    onClick={()=>setSettingsOpen(true)}
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
                <button
                  onClick={()=>setLoginOpen(true)}
                  aria-label={t('auth.login')}
                  title={t('auth.login')}
                  className="inline-flex items-center rounded-lg border border-stone-300 bg-gradient-to-r from-emerald-500 to-emerald-600 p-2.5 sm:p-3 text-sm font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[42px] min-w-[42px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation transition-all duration-200 active:scale-95"
                  style={{touchAction: 'manipulation'}}
                >
                  <Lock size={16}/>
                </button>
              )}
            </div>
          </div>
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-6xl p-4">
      {(maintenanceMode || new URLSearchParams(window.location.search).has('maintenance')) && !isAnalyticsAdmin ? (
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
                <Dashboard
                  totals={totals}
                  players={publicPlayers}
                  matches={matches}
                  isAdmin={isAdmin}
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
                  seasonRecapEnabled={seasonRecapEnabled ?? true}
                  seasonRecapReady={appSettingsLoaded}
                />
              )}
              {tab==="players"&&isAdmin&&featuresEnabled.players&&(
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
                  isAdmin={isAdmin}
                  systemAccount={systemAccount}
                  onEnsureSystemAccount={handleEnsureSystemAccount}
                />
              )}
              {tab==="planner"&&isAdmin&&featuresEnabled.planner&&(
                <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.planner')}</div>}>
                  <MatchPlanner players={publicPlayers} matches={matches} onSaveMatch={handleSaveMatch} onDeleteMatch={handleDeleteMatch} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin} upcomingMatches={db.upcomingMatches} onSaveUpcomingMatch={handleSaveUpcomingMatch} onDeleteUpcomingMatch={handleDeleteUpcomingMatch} onUpdateUpcomingMatch={handleUpdateUpcomingMatch} membershipSettings={db.membershipSettings||[]}/>
                </Suspense>
              )}
              {tab==="draft"&&isAdmin&&featuresEnabled.draft&&(
                <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.draft')}</div>}>
                  <DraftPage players={publicPlayers} upcomingMatches={db.upcomingMatches} onUpdateUpcomingMatch={handleUpdateUpcomingMatch}/>
                </Suspense>
              )}
              {tab==="formation"&&featuresEnabled.formation&&(
                <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.formation')}</div>}>
                  <FormationBoard players={publicPlayers} isAdmin={isAdmin} fetchMatchTeams={fetchMatchTeams}/>
                </Suspense>
              )}
              {tab==="stats"&&isAdmin&&featuresEnabled.stats&&(
                <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.stats')}</div>}>
                  <StatsInput players={publicPlayers} matches={matches} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin}/>
                </Suspense>
              )}
                {tab==="accounting"&&isAdmin&&featuresEnabled.accounting&&(
                  <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.accounting')}</div>}>
                    <AccountingPage players={players} matches={matches} upcomingMatches={db.upcomingMatches} isAdmin={isAdmin}/>
                  </Suspense>
                )}
              {tab==="analytics"&&isAdmin&&featuresEnabled.analytics&&(
                <Suspense fallback={<div className="p-6 text-sm text-stone-500">{t('skeleton.analytics')}</div>}>
                  <AnalyticsPage visits={visits} isAdmin={isAnalyticsAdmin}/>
                </Suspense>
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
  <SettingsDialog isOpen={settingsOpen} onClose={()=>setSettingsOpen(false)} appTitle={appTitle} onTitleChange={setAppTitle} seasonRecapEnabled={seasonRecapEnabled} onSeasonRecapToggle={handleSeasonRecapToggle} maintenanceMode={maintenanceMode} onMaintenanceModeToggle={handleMaintenanceModeToggle} featuresEnabled={featuresEnabled} onFeatureToggle={handleFeatureToggle} onLeaderboardToggle={handleLeaderboardToggle} badgeTierOverrides={badgeTierOverrides} onSaveBadgeTierOverrides={handleSaveBadgeTierOverrides} isAdmin={isAdmin} isAnalyticsAdmin={isAnalyticsAdmin} visits={visits}/>
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
