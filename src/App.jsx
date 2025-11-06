// src/App.jsx
import React,{useEffect,useMemo,useState,useCallback}from"react"
import{Home,Users,CalendarDays,ListChecks,ShieldCheck,Lock,Eye,EyeOff,AlertCircle,CheckCircle2,X,Settings,BookOpen,Shuffle}from"lucide-react"
import{listPlayers,upsertPlayer,deletePlayer,subscribePlayers,loadDB,saveDB,subscribeDB,incrementVisits,logVisit,getVisitStats,USE_MATCHES_TABLE}from"./services/storage.service"
import{saveMatchToDB,updateMatchInDB,deleteMatchFromDB,listMatchesFromDB,subscribeMatches}from"./services/matches.service"
import{getMembershipSettings,subscribeMembershipSettings}from"./services/membership.service"
import{mkPlayer}from"./lib/players";import{notify}from"./components/Toast"
import{filterExpiredMatches}from"./lib/upcomingMatch"
import{getOrCreateVisitorId,getVisitorIP,parseUserAgent,shouldTrackVisit}from"./lib/visitorTracking"
import{signInAdmin,signOut,getSession,onAuthStateChange}from"./lib/auth"
import{runMigrations}from"./lib/dbMigration"
import ToastHub from"./components/Toast";import Card from"./components/Card"
import AppTutorial,{TutorialButton,useAutoTutorial}from"./components/AppTutorial"
import VisitorStats from"./components/VisitorStats"
import Dashboard from"./pages/Dashboard";import PlayersPage from"./pages/PlayersPage"
import MatchPlanner from"./pages/MatchPlanner";import StatsInput from"./pages/StatsInput"
import FormationBoard from"./pages/FormationBoard";import DraftPage from"./pages/DraftPage"
import AnalyticsPage from"./pages/AnalyticsPage"
import logoUrl from"./assets/GoalifyLogo.png"
import{getAppSettings,loadAppSettingsFromServer,updateAppTitle,updateTutorialEnabled,updateFeatureEnabled}from"./lib/appSettings"

const IconPitch=({size=16})=>(<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden role="img" className="shrink-0"><rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="18.5" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>)

export default function App(){
  const[tab,setTab]=useState("dashboard"),[db,setDb]=useState({players:[],matches:[],visits:0,upcomingMatches:[],tagPresets:[],membershipSettings:[]}),[selectedPlayerId,setSelectedPlayerId]=useState(null)
  const[isAdmin,setIsAdmin]=useState(false),[loginOpen,setLoginOpen]=useState(false)
  const[loading,setLoading]=useState(true)
  const[pageLoading,setPageLoading]=useState(false)
  const[appTitle,setAppTitle]=useState(()=>getAppSettings().appTitle)
  const[settingsOpen,setSettingsOpen]=useState(false)
  const[tutorialOpen,setTutorialOpen]=useState(false)
  const[tutorialEnabled,setTutorialEnabled]=useState(()=>getAppSettings().tutorialEnabled)
  const[featuresEnabled,setFeaturesEnabled]=useState(()=>getAppSettings().features||{})
  const{shouldShowTutorial,setShouldShowTutorial}=useAutoTutorial(isAdmin)

  // Supabase Auth: 앱 시작 시 세션 확인
  useEffect(()=>{
    getSession().then(session=>{
      if(session?.user){
        setIsAdmin(true)
        // 하위 호환성을 위해 localStorage도 설정 (optional)
        localStorage.setItem("isAdmin","1")
      }else{
        setIsAdmin(false)
        localStorage.removeItem("isAdmin")
      }
    })

    // 인증 상태 변경 리스너
    const unsubscribe = onAuthStateChange(session=>{
      if(session?.user){
        setIsAdmin(true)
        localStorage.setItem("isAdmin","1")
      }else{
        setIsAdmin(false)
        localStorage.removeItem("isAdmin")
      }
    })

    return unsubscribe
  },[])

  // 첫 방문자 자동 튜토리얼 (튜토리얼이 활성화된 경우에만)
  useEffect(()=>{
    if(tutorialEnabled && shouldShowTutorial){
      setTutorialOpen(true)
      setShouldShowTutorial(false)
    }
  },[tutorialEnabled,shouldShowTutorial,setShouldShowTutorial])

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
        if(settings.tutorialEnabled !== undefined && settings.tutorialEnabled !== tutorialEnabled){
          setTutorialEnabled(settings.tutorialEnabled)
        }
        if(settings.features){
          setFeaturesEnabled(settings.features)
        }
      }catch(e){
        console.error('Failed to load app settings from server:', e)
      }
    })()
  },[])

  useEffect(()=>{let mounted=true;(async()=>{
    try{
      // DB 마이그레이션 실행 (membership_settings 테이블 확인)
      await runMigrations()
      
      const playersFromDB=await listPlayers(),shared=await loadDB()
      
      // 멤버십 설정 로드 (새 테이블에서)
      const membershipSettings = await getMembershipSettings()
      
      // Matches 로드: USE_MATCHES_TABLE 플래그에 따라 분기
      let matchesData = []
      if (USE_MATCHES_TABLE) {
        console.log('[App] Loading matches from Supabase matches table')
        matchesData = await listMatchesFromDB()
      } else {
        console.log('[App] Loading matches from appdb JSON')
        matchesData = shared.matches || []
      }
      
      if(!mounted)return
      
      // 만료된 예정 매치들을 필터링
      const activeUpcomingMatches = filterExpiredMatches(shared.upcomingMatches||[])
      
      // 만료된 매치가 있었다면 DB에서도 제거
      if(activeUpcomingMatches.length !== (shared.upcomingMatches||[]).length) {
        const updatedShared = {...shared, upcomingMatches: activeUpcomingMatches}
        await saveDB(updatedShared).catch(console.error)
      }
      
      setDb({
        players:playersFromDB,
        matches:matchesData,
        visits:typeof shared.visits==="number"?shared.visits:0,
        upcomingMatches:activeUpcomingMatches,
        tagPresets:shared.tagPresets||[],
        membershipSettings:membershipSettings||[]
      })

      // 방문 추적 (개발 환경 제외)
      if(shouldTrackVisit()){
        try{
          sessionStorage?.setItem('visited','1')
          
          // 방문자 정보 수집
          const visitorId = getOrCreateVisitorId()
          const userAgent = navigator?.userAgent || ''
          const screenWidth = window?.screen?.width || null
          const screenHeight = window?.screen?.height || null
          const { device, browser, os, phoneModel } = parseUserAgent(userAgent, screenWidth, screenHeight)
          
          // IP 주소 조회 (비동기, 실패해도 계속 진행)
          getVisitorIP().then(async (ipAddress) => {
            // 방문 로그 저장
            await logVisit({
              visitorId,
              ipAddress,
              userAgent,
              deviceType: device,
              browser,
              os,
              phoneModel
            })
          }).catch(console.error)
          
          // 총 방문자 수 증가
          await incrementVisits()
        }catch(e){
          console.error('Visit tracking failed:', e)
          // sessionStorage 실패 시 localStorage로 폴백
          try{
            const now = Date.now()
            localStorage.setItem('lastVisit', now.toString())
          }catch{}
        }
      }
    }catch(e){console.error("[App] initial load failed",e)}
    finally{if(mounted)setLoading(false)}
  })()
    const offP=subscribePlayers(list=>setDb(prev=>({...prev,players:list})))
    
    // Matches 구독: USE_MATCHES_TABLE 플래그에 따라 분기
    let offMatches = () => {}
    if (USE_MATCHES_TABLE) {
      console.log('[App] Subscribing to matches table')
      offMatches = subscribeMatches(list=>setDb(prev=>({...prev,matches:list})))
    }
    
    const offDB=subscribeDB(next=>{
      // 실시간으로 들어오는 데이터도 필터링
      const activeUpcomingMatches = filterExpiredMatches(next.upcomingMatches||[])
      
      // USE_MATCHES_TABLE이 false일 때만 appdb의 matches 사용
      if (USE_MATCHES_TABLE) {
        setDb(prev=>({...prev,visits:typeof next.visits==="number"?next.visits:(prev.visits||0),upcomingMatches:activeUpcomingMatches,tagPresets:next.tagPresets||prev.tagPresets||[]}))
      } else {
        setDb(prev=>({...prev,matches:next.matches||prev.matches||[],visits:typeof next.visits==="number"?next.visits:(prev.visits||0),upcomingMatches:activeUpcomingMatches,tagPresets:next.tagPresets||prev.tagPresets||[]}))
      }
    })
    // 멤버십 설정 실시간 구독
    const offMembership=subscribeMembershipSettings(async()=>{
      const membershipSettings = await getMembershipSettings()
      setDb(prev=>({...prev,membershipSettings:membershipSettings||[]}))
    })
    return()=>{mounted=false;offP?.();offMatches?.();offDB?.();offMembership?.()}
  },[])

  const players=db.players||[],matches=db.matches||[],visits=typeof db.visits==="number"?db.visits:0,upcomingMatches=db.upcomingMatches||[],membershipSettings=db.membershipSettings||[]

  const totals=useMemo(()=>{
    const cnt=players.length
    const goalsProxy=Math.round(players.reduce((a,p)=>a+(p.stats?.Shooting||0)*0.1,0))
    const attendanceProxy=Math.round(60+players.length*2)
    return{count:cnt,goals:goalsProxy,attendance:attendanceProxy}
  },[players])

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
    { key: 'dashboard', icon: <Home size={16}/>, label: '대시보드', show: true },
    { key: 'players', icon: <Users size={16}/>, label: '선수 관리', show: isAdmin && featuresEnabled.players },
    { key: 'planner', icon: <CalendarDays size={16}/>, label: '매치 플래너', show: isAdmin && featuresEnabled.planner },
    { key: 'draft', icon: <Shuffle size={16}/>, label: '드래프트', show: isAdmin && featuresEnabled.draft },
    { key: 'formation', icon: <IconPitch size={16}/>, label: '포메이션 보드', show: featuresEnabled.formation },
    { key: 'stats', icon: <ListChecks size={16}/>, label: '기록 입력', show: isAdmin && featuresEnabled.stats },
    { key: 'analytics', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, label: '방문자 분석', show: isAdmin && featuresEnabled.analytics }
  ], [isAdmin, featuresEnabled]);

  // ⬇️ 기존 기본값 생성 방식은 유지(필요시 다른 곳에서 사용)
  async function handleCreatePlayer(){if(!isAdmin)return notify("Admin만 가능합니다.");const p=mkPlayer("새 선수","MF");setDb(prev=>({...prev,players:[p,...(prev.players||[])]}));setSelectedPlayerId(p.id);notify("새 선수를 추가했습니다.");try{await upsertPlayer(p)}catch(e){console.error(e)}}

  // ✅ 모달에서 넘어온 patch를 그대로 저장(OVR=50 초기화 문제 해결)
  async function handleCreatePlayerFromModal(patch){
    if(!isAdmin) return notify("Admin만 가능합니다.");
    const base = mkPlayer(patch?.name || "새 선수", patch?.position || "");
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
    catch(e){ console.error(e); }
  }

  async function handleUpdatePlayer(next){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,players:(prev.players||[]).map(x=>x.id===next.id?next:x)}));try{await upsertPlayer(next)}catch(e){console.error(e)}}
  async function handleDeletePlayer(id){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,players:(prev.players||[]).filter(p=>p.id!==id)}));if(selectedPlayerId===id)setSelectedPlayerId(null);try{await deletePlayer(id);notify("선수를 삭제했습니다.")}catch(e){console.error(e)}}
  function handleImportPlayers(list){if(!isAdmin)return notify("Admin만 가능합니다.");const safe=Array.isArray(list)?list:[];setDb(prev=>({...prev,players:safe}));Promise.all(safe.map(upsertPlayer)).then(()=>notify("선수 목록을 가져왔습니다.")).catch(console.error);setSelectedPlayerId(null)}
  function handleResetPlayers(){if(!isAdmin)return notify("Admin만 가능합니다.");(async()=>{const fresh=await listPlayers();setDb(prev=>({...prev,players:fresh}));setSelectedPlayerId(null);notify("선수 목록을 리셋했습니다.")})()}
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
        const next=[...(db.matches||[]),match]
        setDb(prev=>({...prev,matches:next}))
        saveDB({players:[],matches:next,visits,upcomingMatches,tagPresets:db.tagPresets||[]})
        notify("매치가 저장되었습니다.")
      }
      
      // 백업용으로 appdb에도 저장 (이중 저장)
      if (USE_MATCHES_TABLE) {
        const appdbMatches = await listMatchesFromDB()
        saveDB({players:[],matches:appdbMatches,visits,upcomingMatches,tagPresets:db.tagPresets||[]}).catch(console.error)
      }
    } catch(e) {
      console.error('[handleSaveMatch] failed', e)
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
        const next=(db.matches||[]).filter(m=>m.id!==id)
        setDb(prev=>({...prev,matches:next}))
        saveDB({players:[],matches:next,visits,upcomingMatches,tagPresets:db.tagPresets||[]})
        notify("매치를 삭제했습니다.")
      }
      
      // 백업용으로 appdb도 동기화 (이중 저장)
      if (USE_MATCHES_TABLE) {
        const appdbMatches = await listMatchesFromDB()
        saveDB({players:[],matches:appdbMatches,visits,upcomingMatches,tagPresets:db.tagPresets||[]}).catch(console.error)
      }
    } catch(e) {
      console.error('[handleDeleteMatch] failed', e)
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
        const next=(db.matches||[]).map(m=>m.id===id?{...m,...patch}:m)
        setDb(prev=>({...prev,matches:next}))
        saveDB({players:[],matches:next,visits,upcomingMatches,tagPresets:db.tagPresets||[]})
        notify("업데이트되었습니다.")
      }
      
      // 백업용으로 appdb도 동기화 (이중 저장)
      if (USE_MATCHES_TABLE) {
        const appdbMatches = await listMatchesFromDB()
        saveDB({players:[],matches:appdbMatches,visits,upcomingMatches,tagPresets:db.tagPresets||[]}).catch(console.error)
      }
    } catch(e) {
      console.error('[handleUpdateMatch] failed', e)
      notify("업데이트에 실패했습니다.")
    }
  }
  
  function handleSaveUpcomingMatch(upcomingMatch){if(!isAdmin)return notify("Admin만 가능합니다.");const next=[...(db.upcomingMatches||[]),upcomingMatch];setDb(prev=>({...prev,upcomingMatches:next}));saveDB({players:[],matches,visits,upcomingMatches:next,tagPresets:db.tagPresets||[]})}
  function handleDeleteUpcomingMatch(id){if(!isAdmin)return notify("Admin만 가능합니다.");const next=(db.upcomingMatches||[]).filter(m=>m.id!==id);setDb(prev=>({...prev,upcomingMatches:next}));saveDB({players:[],matches,visits,upcomingMatches:next,tagPresets:db.tagPresets||[]})}
  function handleUpdateUpcomingMatch(id,patch,silent=false){const next=(db.upcomingMatches||[]).map(m=>m.id===id?{...m,...patch}:m);setDb(prev=>({...prev,upcomingMatches:next}));saveDB({players:[],matches,visits,upcomingMatches:next,tagPresets:db.tagPresets||[]});if(!silent)notify("예정된 매치가 업데이트되었습니다.")}

  // 태그 프리셋 관리
  function handleSaveTagPresets(tagPresets){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,tagPresets}));saveDB({players:[],matches,visits,upcomingMatches,tagPresets,membershipSettings:db.membershipSettings||[]});notify("태그 프리셋이 저장되었습니다.")}
  function handleAddTagPreset(preset){if(!isAdmin)return notify("Admin만 가능합니다.");const next=[...(db.tagPresets||[]),preset];setDb(prev=>({...prev,tagPresets:next}));saveDB({players:[],matches,visits,upcomingMatches,tagPresets:next,membershipSettings:db.membershipSettings||[]})}
  function handleUpdateTagPreset(index,updatedPreset){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    const oldPreset=(db.tagPresets||[])[index];
    const next=(db.tagPresets||[]).map((p,i)=>i===index?updatedPreset:p);
    
    // 모든 선수의 태그를 업데이트: 이전 프리셋과 일치하는 태그를 새 프리셋으로 교체
    const updatedPlayers=(db.players||[]).map(player=>{
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
      upsertPlayer(player).catch(console.error);
    });
    
    setDb(prev=>({...prev,tagPresets:next,players:updatedPlayers}));
    saveDB({players:[],matches,visits,upcomingMatches,tagPresets:next,membershipSettings:db.membershipSettings||[]});
    notify("태그 프리셋이 업데이트되었습니다.");
  }
  function handleDeleteTagPreset(index){
    if(!isAdmin)return notify("Admin만 가능합니다.");
    const deletedPreset=(db.tagPresets||[])[index];
    const next=(db.tagPresets||[]).filter((_,i)=>i!==index);
    
    // 모든 선수의 태그에서 삭제되는 프리셋과 일치하는 태그를 제거
    const updatedPlayers=(db.players||[]).map(player=>{
      if(!player.tags||player.tags.length===0)return player;
      const updatedTags=player.tags.filter(tag=>{
        // 삭제되는 프리셋과 일치하지 않는 태그만 유지
        return!(tag.name===deletedPreset.name&&tag.color===deletedPreset.color);
      });
      return{...player,tags:updatedTags};
    });
    
    // 업데이트된 선수들을 Supabase에 저장
    updatedPlayers.forEach(player=>{
      upsertPlayer(player).catch(console.error);
    });
    
    setDb(prev=>({...prev,tagPresets:next,players:updatedPlayers}));
    saveDB({players:[],matches,visits,upcomingMatches,tagPresets:next,membershipSettings:db.membershipSettings||[]});
    notify("태그 프리셋이 삭제되었습니다.");
  }


  // 멤버십 설정 관리
  function handleSaveMembershipSettings(membershipSettings){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,membershipSettings}));saveDB({players:[],matches,visits,upcomingMatches,tagPresets:db.tagPresets||[],membershipSettings});notify("멤버십 설정이 저장되었습니다.")}

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
      console.error('[App] Login failed:', error.message)
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

  async function handleTutorialToggle(enabled){
    setTutorialEnabled(enabled)
    const success = await updateTutorialEnabled(enabled)
    if(success){
      notify(enabled?"튜토리얼이 활성화되었습니다.":"튜토리얼이 비활성화되었습니다.","success")
    }else{
      notify("설정 저장에 실패했습니다.","error")
    }
  }

  async function handleFeatureToggle(featureName, enabled){
    setFeaturesEnabled(prev => ({...prev, [featureName]: enabled}))
    const success = await updateFeatureEnabled(featureName, enabled)
    if(success){
      notify(`${featureName} 기능이 ${enabled?'활성화':'비활성화'}되었습니다.`,"success")
    }else{
      notify("설정 저장에 실패했습니다.","error")
    }
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
  <div className="min-h-screen bg-stone-100 text-stone-800 antialiased leading-relaxed w-full max-w-full overflow-x-auto">
    <ToastHub/>
    <header className="sticky top-0 z-[200] border-b border-stone-300 bg-white/90 backdrop-blur-md backdrop-saturate-150 will-change-transform">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 min-h-[60px] gap-2 sm:gap-3">
        {/* 앱 로고와 타이틀 - 표시만 (관리자만 설정 버튼으로 수정 가능) */}
        <div className="flex items-center gap-2 flex-shrink-0 relative z-10">
          <img src={logoUrl} alt="Goalify Logo" className="h-6 w-6 sm:h-7 sm:w-7 object-contain flex-shrink-0" width={28} height={28} decoding="async"/>
          <h1 className="text-sm sm:text-base font-semibold tracking-tight whitespace-nowrap">{appTitle}</h1>
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
            <div className="flex gap-2">
              {tutorialEnabled && <TutorialButton onClick={()=>setTutorialOpen(true)}/>}
              {isAdmin?(
                <>
                  <button
                    onClick={()=>setSettingsOpen(true)}
                    aria-label="설정"
                    title="설정"
                    className="inline-flex items-center rounded-lg bg-stone-100 p-2.5 sm:p-3 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 min-h-[42px] min-w-[42px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation transition-all duration-200 active:scale-95"
                    style={{touchAction: 'manipulation'}}
                  >
                    <Settings size={16}/>
                  </button>
                  <button
                    onClick={adminLogout}
                    aria-label="Admin 로그아웃"
                    title="Admin 로그아웃"
                    className="inline-flex items-center rounded-lg bg-stone-900 p-2.5 sm:p-3 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 min-h-[42px] min-w-[42px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation transition-all duration-200 active:scale-95"
                    style={{touchAction: 'manipulation'}}
                  >
                    <X size={16}/>
                  </button>
                </>
              ):(
                <button
                  onClick={()=>setLoginOpen(true)}
                  aria-label="Admin 로그인"
                  title="Admin 로그인"
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
      {loading ? (
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
              {tab==="dashboard"&&(<Dashboard totals={totals} players={players} matches={matches} isAdmin={isAdmin} onUpdateMatch={handleUpdateMatch} upcomingMatches={db.upcomingMatches} onSaveUpcomingMatch={handleSaveUpcomingMatch} onDeleteUpcomingMatch={handleDeleteUpcomingMatch} onUpdateUpcomingMatch={handleUpdateUpcomingMatch} membershipSettings={db.membershipSettings||[]}/>)}
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
                />
              )}
              {tab==="planner"&&isAdmin&&featuresEnabled.planner&&(<MatchPlanner players={players} matches={matches} onSaveMatch={handleSaveMatch} onDeleteMatch={handleDeleteMatch} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin} upcomingMatches={db.upcomingMatches} onSaveUpcomingMatch={handleSaveUpcomingMatch} onDeleteUpcomingMatch={handleDeleteUpcomingMatch} onUpdateUpcomingMatch={handleUpdateUpcomingMatch} membershipSettings={db.membershipSettings||[]}/>)}
              {tab==="draft"&&isAdmin&&featuresEnabled.draft&&(<DraftPage players={players} upcomingMatches={db.upcomingMatches} onUpdateUpcomingMatch={handleUpdateUpcomingMatch}/>)}
              {tab==="formation"&&featuresEnabled.formation&&(<FormationBoard players={players} isAdmin={isAdmin} fetchMatchTeams={fetchMatchTeams}/>)}
              {tab==="stats"&&isAdmin&&featuresEnabled.stats&&(<StatsInput players={players} matches={matches} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin}/>)}
              {tab==="analytics"&&isAdmin&&featuresEnabled.analytics&&(<AnalyticsPage visits={visits} isAdmin={isAdmin}/>)}
            </>
          )}
        </div>
      )}
    </main>

    <footer className="mx-auto mt-10 max-w-6xl px-4 pb-8">
      <div className="mt-4 text-center text-[11px] text-stone-400">Goalify · v{import.meta.env.VITE_APP_VERSION} build({import.meta.env.VITE_APP_COMMIT})</div>
    </footer>

    <AdminLoginDialog isOpen={loginOpen} onClose={()=>setLoginOpen(false)} onSuccess={onAdminSuccess}/>
    <SettingsDialog isOpen={settingsOpen} onClose={()=>setSettingsOpen(false)} appTitle={appTitle} onTitleChange={setAppTitle} tutorialEnabled={tutorialEnabled} onTutorialToggle={handleTutorialToggle} featuresEnabled={featuresEnabled} onFeatureToggle={handleFeatureToggle} isAdmin={isAdmin} visits={visits}/>
    {tutorialEnabled && <AppTutorial isOpen={tutorialOpen} onClose={()=>setTutorialOpen(false)} isAdmin={isAdmin}/>}
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

/* ── Admin Login Dialog (Supabase Auth) ─────────────────── */
function AdminLoginDialog({isOpen,onClose,onSuccess}){
  const[email,setEmail]=useState("")
  const[pw,setPw]=useState("")
  const[show,setShow]=useState(false)
  const[err,setErr]=useState("")
  const[caps,setCaps]=useState(false)
  const[loading,setLoading]=useState(false)
  
  useEffect(()=>{
    if(isOpen){
      setEmail("")
      setPw("")
      setErr("")
      setCaps(false)
      setLoading(false)
      setTimeout(()=>document.getElementById("adminEmail")?.focus(),50)
    }
  },[isOpen])
  
  const onKey=e=>{
    setCaps(!!e.getModifierState?.("CapsLock"))
    if(e.key==="Enter")submit()
  }
  
  const submit=async()=>{
    if(loading)return
    if(!email.trim()){
      setErr("이메일을 입력하세요.")
      return
    }
    if(!pw){
      setErr("비밀번호를 입력하세요.")
      return
    }
    
    setLoading(true)
    setErr("")
    
    try{
      const success = await onSuccess(email.trim(), pw)
      if(!success){
        setErr("이메일 또는 비밀번호가 올바르지 않습니다.")
        setLoading(false)
      }
      // 성공 시 onSuccess에서 처리
    }catch(e){
      console.error('[Login] Error:', e)
      setErr("로그인 중 오류가 발생했습니다.")
      setLoading(false)
    }
  }
  
  if(!isOpen)return null
  
  return(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-stone-200 bg-white shadow-xl">
        <button className="absolute right-3 top-3 rounded-md p-1 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="닫기">
          <X size={18}/>
        </button>
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <ShieldCheck size={20}/>
          </div>
          <div>
            <h3 className="text-base font-semibold">Admin 로그인</h3>
            <p className="text-xs text-stone-500">관리자 전용 기능을 사용하려면 인증하세요.</p>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          {/* 이메일 입력 */}
          <div>
            <label htmlFor="adminEmail" className="block text-xs font-medium text-stone-600 mb-1.5">이메일</label>
            <div className={`flex items-center rounded-lg border px-3 ${err?"border-rose-300 bg-rose-50":"border-stone-300 bg-white"}`}>
              <svg className="w-4 h-4 mr-2 shrink-0 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
              <input 
                id="adminEmail" 
                type="email" 
                value={email} 
                onChange={e=>setEmail(e.target.value)} 
                onKeyUp={onKey}
                onKeyDown={onKey}
                placeholder="admin@example.com" 
                className="w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent text-stone-900" 
                style={{color: '#1c1917'}}
                autoCapitalize="off" 
                autoCorrect="off" 
                autoComplete="email"
              />
            </div>
          </div>
          
          {/* 비밀번호 입력 */}
          <div>
            <label htmlFor="adminPw" className="block text-xs font-medium text-stone-600 mb-1.5">비밀번호</label>
            <div className={`flex items-center rounded-lg border px-3 ${err?"border-rose-300 bg-rose-50":"border-stone-300 bg-white"}`}>
              <Lock size={16} className="mr-2 shrink-0 text-stone-500"/>
              <input 
                id="adminPw" 
                type={show?"text":"password"} 
                value={pw} 
                onChange={e=>setPw(e.target.value)} 
                onKeyUp={onKey} 
                onKeyDown={onKey} 
                placeholder="비밀번호" 
                className="w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent text-stone-900" 
                style={{color: '#1c1917'}} 
                autoCapitalize="off" 
                autoCorrect="off" 
                autoComplete="current-password"
              />
              <button 
                type="button" 
                className="ml-2 rounded p-1 text-stone-500 hover:bg-stone-100" 
                onClick={()=>setShow(v=>!v)} 
                aria-label={show?"비밀번호 숨기기":"비밀번호 보기"}
              >
                {show?<EyeOff size={16}/>:<Eye size={16}/>}
              </button>
            </div>
          </div>
          
          {caps&&(
            <div className="flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800">
              <AlertCircle size={12}/>Caps Lock이 켜져 있어요
            </div>
          )}
          {err&&(
            <div className="flex items-center gap-2 rounded-md bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700">
              <X size={12}/>{err}
            </div>
          )}
          <button 
            onClick={submit} 
            disabled={loading} 
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-50"
          >
            {loading?(
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" fill="none"/>
                </svg> 확인 중…
              </span>
            ):(
              <>
                <CheckCircle2 size={14}/> 로그인
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Settings Dialog ─────────────────── */
function SettingsDialog({isOpen,onClose,appTitle,onTitleChange,tutorialEnabled,onTutorialToggle,featuresEnabled,onFeatureToggle,isAdmin,visits}){
  const[newTitle,setNewTitle]=useState(appTitle)
  const[titleEditMode,setTitleEditMode]=useState(false)
  
  useEffect(()=>{
    if(isOpen){
      setNewTitle(appTitle)
      setTitleEditMode(false)
    }
  },[isOpen,appTitle])
  
  const handleTitleUpdate=()=>{
    if(newTitle.trim()){
      if(updateAppTitle(newTitle.trim())){
        onTitleChange(newTitle.trim())
        setTitleEditMode(false)
        notify("앱 타이틀이 변경되었습니다.","success")
      }else{
        notify("타이틀 변경에 실패했습니다.","error")
      }
    }
  }
  
  const featureLabels = {
    players: '선수 관리',
    planner: '매치 플래너',
    draft: '드래프트',
    formation: '포메이션 보드',
    stats: '기록 입력',
    analytics: '방문자 분석'
  }
  
  if(!isOpen)return null;
  
  return(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <button className="absolute right-3 top-3 rounded-md p-1 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="닫기">
          <X size={18}/>
        </button>
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Settings size={20}/>
          </div>
          <div>
            <h3 className="text-base font-semibold">앱 설정</h3>
            <p className="text-xs text-stone-500">앱 타이틀, 튜토리얼 및 기능 설정을 관리합니다.</p>
          </div>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-stone-700">앱 타이틀</label>
              {!titleEditMode && (
                <button onClick={()=>setTitleEditMode(true)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  수정
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

          {/* 튜토리얼 활성화 토글 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block text-sm font-medium text-stone-700">튜토리얼 기능</label>
                <p className="text-xs text-stone-500 mt-0.5">앱 가이드 및 자동 튜토리얼 활성화</p>
              </div>
              <button
                onClick={() => onTutorialToggle(!tutorialEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  tutorialEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                }`}
                role="switch"
                aria-checked={tutorialEnabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    tutorialEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 기능 활성화 설정 (Admin만) */}
          {isAdmin && (
            <>
              <div className="border-t border-stone-200 pt-4 mt-2">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-stone-800">기능 활성화 설정</h4>
                  <p className="text-xs text-stone-500 mt-0.5">각 탭의 표시 여부를 제어합니다 (데이터는 유지됩니다)</p>
                </div>
              
              <div className="space-y-3">
                {Object.entries(featureLabels).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-stone-700">{label}</span>
                      {key === 'formation' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">모두</span>
                      )}
                      {key !== 'formation' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Admin</span>
                      )}
                    </div>
                    <button
                      onClick={() => onFeatureToggle(key, !featuresEnabled[key])}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                        featuresEnabled[key] ? 'bg-emerald-600' : 'bg-stone-300'
                      }`}
                      role="switch"
                      aria-checked={featuresEnabled[key]}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          featuresEnabled[key] ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="text-xs text-stone-500 bg-blue-50 rounded-lg p-3 border border-blue-200 mt-3">
                ℹ️ 기능을 비활성화해도 저장된 매치와 선수 데이터는 유지됩니다. 기능을 다시 활성화하면 이전 데이터를 볼 수 있습니다.
              </div>
            </div>
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
