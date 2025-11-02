// src/App.jsx
import React,{useEffect,useMemo,useState,useCallback}from"react"
import{Home,Users,CalendarDays,ListChecks,ShieldCheck,Lock,Eye,EyeOff,AlertCircle,CheckCircle2,X,Settings}from"lucide-react"
import{listPlayers,upsertPlayer,deletePlayer,subscribePlayers,loadDB,saveDB,subscribeDB}from"./services/storage.service"
import{mkPlayer}from"./lib/players";import{notify}from"./components/Toast"
import{filterExpiredMatches}from"./lib/upcomingMatch"
import ToastHub from"./components/Toast";import Card from"./components/Card"
import Dashboard from"./pages/Dashboard";import PlayersPage from"./pages/PlayersPage"
import MatchPlanner from"./pages/MatchPlanner";import StatsInput from"./pages/StatsInput"
import FormationBoard from"./pages/FormationBoard";import logoUrl from"./assets/GoalifyLogo.png"
import{getAppSettings,loadAppSettingsFromServer,updateAppTitle}from"./lib/appSettings"
const ADMIN_PASS=import.meta.env.VITE_ADMIN_PASSWORD||"letmein"

const IconPitch=({size=16})=>(<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden role="img" className="shrink-0"><rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="18.5" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>)

export default function App(){
  const[tab,setTab]=useState("dashboard"),[db,setDb]=useState({players:[],matches:[],visits:0,upcomingMatches:[]}),[selectedPlayerId,setSelectedPlayerId]=useState(null)
  const[isAdmin,setIsAdmin]=useState(()=>localStorage.getItem("isAdmin")==="1"),[loginOpen,setLoginOpen]=useState(false)
  const[loading,setLoading]=useState(true)
  const[pageLoading,setPageLoading]=useState(false)
  const[appTitle,setAppTitle]=useState(()=>getAppSettings().appTitle)
  const[settingsOpen,setSettingsOpen]=useState(false)

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
      }catch(e){
        console.error('Failed to load app settings from server:', e)
      }
    })()
  },[])

  useEffect(()=>{let mounted=true;(async()=>{
    try{
      const playersFromDB=await listPlayers(),shared=await loadDB()
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
        matches:shared.matches||[],
        visits:typeof shared.visits==="number"?shared.visits:0,
        upcomingMatches:activeUpcomingMatches
      })

      const host=window?.location?.hostname||""
      const isLocal=host==="localhost"||host==="127.0.0.1"||host==="::1"||host.endsWith?.(".local")
      const key="sfm_visit_logged",already=sessionStorage?.getItem(key)
      if(!isLocal&&!already){
        try{sessionStorage?.setItem(key,"1")}catch{}
        const next=(typeof shared.visits==="number"?shared.visits:0)+1
        await saveDB({players:[],matches:shared.matches||[],visits:next,upcomingMatches:shared.upcomingMatches||[]})
      }
    }catch(e){console.error("[App] initial load failed",e)}
    finally{if(mounted)setLoading(false)}
  })()
    const offP=subscribePlayers(list=>setDb(prev=>({...prev,players:list})))
    const offDB=subscribeDB(next=>{
      // 실시간으로 들어오는 데이터도 필터링
      const activeUpcomingMatches = filterExpiredMatches(next.upcomingMatches||[])
      setDb(prev=>({...prev,matches:next.matches||prev.matches||[],visits:typeof next.visits==="number"?next.visits:(prev.visits||0),upcomingMatches:activeUpcomingMatches}))
    })
    return()=>{mounted=false;offP?.();offDB?.()}
  },[])

  const players=db.players||[],matches=db.matches||[],visits=typeof db.visits==="number"?db.visits:0,upcomingMatches=db.upcomingMatches||[]

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
    { key: 'players', icon: <Users size={16}/>, label: '선수 관리', show: isAdmin },
    { key: 'planner', icon: <CalendarDays size={16}/>, label: '매치 플래너', show: isAdmin },
    { key: 'formation', icon: <IconPitch size={16}/>, label: '포메이션 보드', show: true },
    { key: 'stats', icon: <ListChecks size={16}/>, label: '기록 입력', show: isAdmin }
  ], [isAdmin]);

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
  function handleSaveMatch(match){if(!isAdmin)return notify("Admin만 가능합니다.");const next=[...(db.matches||[]),match];setDb(prev=>({...prev,matches:next}));saveDB({players:[],matches:next,visits,upcomingMatches})}
  function handleDeleteMatch(id){if(!isAdmin)return notify("Admin만 가능합니다.");const next=(db.matches||[]).filter(m=>m.id!==id);setDb(prev=>({...prev,matches:next}));saveDB({players:[],matches:next,visits,upcomingMatches});notify("매치를 삭제했습니다.")}
  function handleUpdateMatch(id,patch){const next=(db.matches||[]).map(m=>m.id===id?{...m,...patch}:m);setDb(prev=>({...prev,matches:next}));saveDB({players:[],matches:next,visits,upcomingMatches});notify("업데이트되었습니다.")}
  
  function handleSaveUpcomingMatch(upcomingMatch){if(!isAdmin)return notify("Admin만 가능합니다.");const next=[...(db.upcomingMatches||[]),upcomingMatch];setDb(prev=>({...prev,upcomingMatches:next}));saveDB({players:[],matches,visits,upcomingMatches:next})}
  function handleDeleteUpcomingMatch(id){if(!isAdmin)return notify("Admin만 가능합니다.");const next=(db.upcomingMatches||[]).filter(m=>m.id!==id);setDb(prev=>({...prev,upcomingMatches:next}));saveDB({players:[],matches,visits,upcomingMatches:next});notify("예정된 매치를 삭제했습니다.")}
  function handleUpdateUpcomingMatch(id,patch){const next=(db.upcomingMatches||[]).map(m=>m.id===id?{...m,...patch}:m);setDb(prev=>({...prev,upcomingMatches:next}));saveDB({players:[],matches,visits,upcomingMatches:next});notify("예정된 매치가 업데이트되었습니다.")}

  function adminLogout(){localStorage.removeItem("isAdmin");setIsAdmin(false);notify("Admin 모드 해제")}
  function onAdminSuccess(){localStorage.setItem("isAdmin","1");setIsAdmin(true);setLoginOpen(false);notify("Admin 모드 활성화")}

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
            {isAdmin?(
              <div className="flex gap-2">
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
              </div>
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
              {tab==="dashboard"&&(<Dashboard totals={totals} players={players} matches={matches} isAdmin={isAdmin} onUpdateMatch={handleUpdateMatch} upcomingMatches={db.upcomingMatches} onSaveUpcomingMatch={handleSaveUpcomingMatch} onDeleteUpcomingMatch={handleDeleteUpcomingMatch} onUpdateUpcomingMatch={handleUpdateUpcomingMatch}/>)}
              {tab==="players"&&isAdmin&&(
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
                />
              )}
              {tab==="planner"&&isAdmin&&(<MatchPlanner players={players} matches={matches} onSaveMatch={handleSaveMatch} onDeleteMatch={handleDeleteMatch} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin} upcomingMatches={db.upcomingMatches} onSaveUpcomingMatch={handleSaveUpcomingMatch} onDeleteUpcomingMatch={handleDeleteUpcomingMatch} onUpdateUpcomingMatch={handleUpdateUpcomingMatch}/>)}
              {tab==="formation"&&(<FormationBoard players={players} isAdmin={isAdmin} fetchMatchTeams={fetchMatchTeams}/>)}
              {tab==="stats"&&isAdmin&&(<StatsInput players={players} matches={matches} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin}/>)}
            </>
          )}
        </div>
      )}
    </main>

    <footer className="mx-auto mt-10 max-w-6xl px-4 pb-8">
      <Card title="도움말">
        <ul className="list-disc pl-5 text-sm text-stone-600">
          <li>대시보드: 저장된 매치 열람, 공격포인트(골/어시/경기수) 트래킹</li>
          <li>포메이션 보드: 체크한 선수만 보드에 표시 · 드래그로 수동 배치</li>
          {isAdmin&&(<><li>선수 관리: 선수 생성/수정/삭제, 일괄 가져오기</li><li>매치 플래너: 팀 배정, 포메이션 설정, 저장/삭제</li><li>기록 입력: 경기별 골/어시 기록 입력/수정</li></>)}
        </ul>
        {isAdmin&&(<div className="mt-3 text-xs text-stone-700">👀 총 방문자: <b>{visits}</b></div>)}
      </Card>
      <div className="mt-4 text-center text-[11px] text-stone-400">Semihan Football Manager · v{import.meta.env.VITE_APP_VERSION} build({import.meta.env.VITE_APP_COMMIT})</div>
    </footer>

    <AdminLoginDialog isOpen={loginOpen} onClose={()=>setLoginOpen(false)} onSuccess={onAdminSuccess} adminPass={ADMIN_PASS} appTitle={appTitle} onTitleChange={setAppTitle}/>
    <SettingsDialog isOpen={settingsOpen} onClose={()=>setSettingsOpen(false)} appTitle={appTitle} onTitleChange={setAppTitle}/>
  </div>)}
const TabButton = React.memo(function TabButton({icon,label,active,onClick,loading}){return(<button onClick={onClick} disabled={loading} title={label} aria-label={label} className={`flex items-center justify-center rounded-md p-2.5 sm:p-3 text-sm transition-all duration-200 min-h-[42px] min-w-[42px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation ${active?"bg-emerald-500 text-white shadow-sm":"text-stone-700 hover:bg-stone-200 active:bg-stone-300 active:scale-95"} ${loading?"opacity-75 cursor-wait":""}`} style={{touchAction: 'manipulation'}} aria-pressed={active}>{loading && active ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> : <span className="w-4 h-4 flex-shrink-0">{icon}</span>}</button>)})

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

/* ── Admin Login Dialog (기존 코드 유지) ─────────────────── */
function AdminLoginDialog({isOpen,onClose,onSuccess,adminPass,appTitle,onTitleChange}){const[pw,setPw]=useState(""),[show,setShow]=useState(false),[err,setErr]=useState(""),[caps,setCaps]=useState(false),[loading,setLoading]=useState(false)
  const[newTitle,setNewTitle]=useState(appTitle)
  const[titleEditMode,setTitleEditMode]=useState(false)
  
  useEffect(()=>{if(isOpen){setPw("");setErr("");setCaps(false);setLoading(false);setNewTitle(appTitle);setTitleEditMode(false);setTimeout(()=>document.getElementById("adminPw")?.focus(),50)}},[isOpen,appTitle])
  const onKey=e=>{setCaps(!!e.getModifierState?.("CapsLock"));if(e.key==="Enter")submit()}
  const submit=()=>{if(loading)return;setLoading(true);setErr("");setTimeout(()=>{if(pw&&pw===adminPass)onSuccess?.();else{setErr("비밀번호가 올바르지 않습니다.");setLoading(false)}},250)}
  
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
  
  if(!isOpen)return null;return(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <div className="relative w-full max-w-sm rounded-2xl border border-stone-200 bg-white shadow-xl">
      <button className="absolute right-3 top-3 rounded-md p-1 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="닫기"><X size={18}/></button>
      <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><ShieldCheck size={20}/></div><div><h3 className="text/base font-semibold">Admin 로그인</h3><p className="text-xs text-stone-500">관리자 전용 기능을 사용하려면 인증하세요.</p></div></div>
      <div className="space-y-3 px-5 py-4">
        <label className="block text-xs font-medium text-stone-600">비밀번호</label>
        <div className={`flex items-center rounded-lg border px-3 ${err?"border-rose-300 bg-rose-50":"border-stone-300 bg-white"}`}>
          <Lock size={16} className="mr-2 shrink-0 text-stone-500"/>
          <input id="adminPw" type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} onKeyUp={onKey} onKeyDown={onKey} placeholder="Admin Password" className="w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent text-stone-900" style={{color: '#1c1917'}} autoCapitalize="off" autoCorrect="off" autoComplete="current-password"/>
          <button type="button" className="ml-2 rounded p-1 text-stone-500 hover:bg-stone-100" onClick={()=>setShow(v=>!v)} aria-label={show?"비밀번호 숨기기":"비밀번호 보기"}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>
        </div>
        {caps&&(<div className="flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800"><AlertCircle size={12}/>Caps Lock이 켜져 있어요</div>)}
        {err&&(<div className="flex items-center gap-2 rounded-md bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700"><X size={12}/>{err}</div>)}
        <button onClick={submit} disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-50">{loading?<span className="inline-flex items-center gap-2"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" fill="none"/></svg> 확인 중…</span>:<><CheckCircle2 size={14}/> 로그인</>}</button>
        
        <div className="border-t border-stone-200 pt-3 mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-stone-600">앱 타이틀</label>
            {!titleEditMode && (
              <button onClick={()=>setTitleEditMode(true)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">수정</button>
            )}
          </div>
          {titleEditMode ? (
            <div className="space-y-2">
              <input type="text" value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="앱 타이틀 입력" className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"/>
              <div className="flex gap-2">
                <button onClick={handleTitleUpdate} className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">저장</button>
                <button onClick={()=>{setNewTitle(appTitle);setTitleEditMode(false)}} className="flex-1 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-200 hover:bg-stone-300 rounded-lg">취소</button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-700">{appTitle}</div>
          )}
        </div>
      </div>
    </div>
  </div>)}

/* ── Settings Dialog ─────────────────── */
function SettingsDialog({isOpen,onClose,appTitle,onTitleChange}){
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
  
  if(!isOpen)return null;
  
  return(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-stone-200 bg-white shadow-xl">
        <button className="absolute right-3 top-3 rounded-md p-1 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="닫기">
          <X size={18}/>
        </button>
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Settings size={20}/>
          </div>
          <div>
            <h3 className="text-base font-semibold">앱 설정</h3>
            <p className="text-xs text-stone-500">앱 타이틀을 변경할 수 있습니다.</p>
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
          <div className="text-xs text-stone-500 bg-stone-50 rounded-lg p-3 border border-stone-200">
            💡 변경된 타이틀은 헤더와 브라우저 탭에 즉시 반영됩니다.
          </div>
        </div>
      </div>
    </div>
  )
}
