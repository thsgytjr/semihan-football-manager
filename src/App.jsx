// src/App.jsx
import React,{useEffect,useMemo,useState}from"react"
import{Home,Users,CalendarDays,ListChecks,ShieldCheck,Lock,Eye,EyeOff,AlertCircle,CheckCircle2,X}from"lucide-react"
import{listPlayers,upsertPlayer,deletePlayer,subscribePlayers,loadDB,saveDB,subscribeDB}from"./services/storage.service"
import{mkPlayer}from"./lib/players";import{notify}from"./components/Toast"
import ToastHub from"./components/Toast";import Card from"./components/Card"
import Dashboard from"./pages/Dashboard";import PlayersPage from"./pages/PlayersPage"
import MatchPlanner from"./pages/MatchPlanner";import StatsInput from"./pages/StatsInput"
import FormationBoard from"./pages/FormationBoard";import logoUrl from"./assets/semihan-football-manager-logo.png"
const ADMIN_PASS=import.meta.env.VITE_ADMIN_PASSWORD||"letmein"

const IconPitch=({size=16})=>(<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden role="img" className="shrink-0"><rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="18.5" y="8" width="3.5" height="8" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>)

export default function App(){
  const[tab,setTab]=useState("dashboard"),[db,setDb]=useState({players:[],matches:[],visits:0}),[selectedPlayerId,setSelectedPlayerId]=useState(null)
  const[isAdmin,setIsAdmin]=useState(()=>localStorage.getItem("isAdmin")==="1"),[loginOpen,setLoginOpen]=useState(false)

  useEffect(()=>{let mounted=true;(async()=>{
    try{
      const playersFromDB=await listPlayers(),shared=await loadDB()
      if(!mounted)return
      setDb({players:playersFromDB,matches:shared.matches||[],visits:typeof shared.visits==="number"?shared.visits:0})

      const host=window?.location?.hostname||""
      const isLocal=host==="localhost"||host==="127.0.0.1"||host==="::1"||host.endsWith?.(".local")
      const key="sfm_visit_logged",already=sessionStorage?.getItem(key)
      if(!isLocal&&!already){
        try{sessionStorage?.setItem(key,"1")}catch{}
        const next=(typeof shared.visits==="number"?shared.visits:0)+1
        await saveDB({players:[],matches:shared.matches||[],visits:next})
      }
    }catch(e){console.error("[App] initial load failed",e)}
  })()
    const offP=subscribePlayers(list=>setDb(prev=>({...prev,players:list})))
    const offDB=subscribeDB(next=>setDb(prev=>({...prev,matches:next.matches||prev.matches||[],visits:typeof next.visits==="number"?next.visits:(prev.visits||0)})))
    return()=>{mounted=false;offP?.();offDB?.()}
  },[])

  const players=db.players||[],matches=db.matches||[],visits=typeof db.visits==="number"?db.visits:0

  const totals=useMemo(()=>{
    const cnt=players.length
    const goalsProxy=Math.round(players.reduce((a,p)=>a+(p.stats?.Shooting||0)*0.1,0))
    const attendanceProxy=Math.round(60+players.length*2)
    return{count:cnt,goals:goalsProxy,attendance:attendanceProxy}
  },[players])

  async function handleCreatePlayer(){if(!isAdmin)return notify("Admin만 가능합니다.");const p=mkPlayer("새 선수","MF");setDb(prev=>({...prev,players:[p,...(prev.players||[])]}));setSelectedPlayerId(p.id);notify("새 선수를 추가했습니다.");try{await upsertPlayer(p)}catch(e){console.error(e)}}
  async function handleUpdatePlayer(next){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,players:(prev.players||[]).map(x=>x.id===next.id?next:x)}));try{await upsertPlayer(next)}catch(e){console.error(e)}}
  async function handleDeletePlayer(id){if(!isAdmin)return notify("Admin만 가능합니다.");setDb(prev=>({...prev,players:(prev.players||[]).filter(p=>p.id!==id)}));if(selectedPlayerId===id)setSelectedPlayerId(null);try{await deletePlayer(id);notify("선수를 삭제했습니다.")}catch(e){console.error(e)}}
  function handleImportPlayers(list){if(!isAdmin)return notify("Admin만 가능합니다.");const safe=Array.isArray(list)?list:[];setDb(prev=>({...prev,players:safe}));Promise.all(safe.map(upsertPlayer)).then(()=>notify("선수 목록을 가져왔습니다.")).catch(console.error);setSelectedPlayerId(null)}
  function handleResetPlayers(){if(!isAdmin)return notify("Admin만 가능합니다.");(async()=>{const fresh=await listPlayers();setDb(prev=>({...prev,players:fresh}));setSelectedPlayerId(null);notify("선수 목록을 리셋했습니다.")})()}
  function handleSaveMatch(match){if(!isAdmin)return notify("Admin만 가능합니다.");const next=[...(db.matches||[]),match];setDb(prev=>({...prev,matches:next}));saveDB({players:[],matches:next,visits})}
  function handleDeleteMatch(id){if(!isAdmin)return notify("Admin만 가능합니다.");const next=(db.matches||[]).filter(m=>m.id!==id);setDb(prev=>({...prev,matches:next}));saveDB({players:[],matches:next,visits});notify("매치를 삭제했습니다.")}
  function handleUpdateMatch(id,patch){const next=(db.matches||[]).map(m=>m.id===id?{...m,...patch}:m);setDb(prev=>({...prev,matches:next}));saveDB({players:[],matches:next,visits});notify("업데이트되었습니다.")}

  function adminLogout(){localStorage.removeItem("isAdmin");setIsAdmin(false);notify("Admin 모드 해제")}
  function onAdminSuccess(){localStorage.setItem("isAdmin","1");setIsAdmin(true);setLoginOpen(false);notify("Admin 모드 활성화")}

  /* ──────────────────────────────────────────────────────────
   * FormationBoard용 fetchMatchTeams 빌더
   * - 현재 App의 matches[]를 사용해 [{id,label,teams:[{name,playerIds[]}]}] 형태로 변환
   * - snapshot(배열의 배열), teams(JSON/객체), board 등 다양한 저장 형태를 유연하게 처리
   * ────────────────────────────────────────────────────────── */
  function buildFetchMatchTeamsFromLocalMatches(localMatches){
    const safe = Array.isArray(localMatches) ? localMatches.slice().reverse() : []
    const coerceId = (v)=>String(v??"")
    const coerceIds = (arr)=>Array.isArray(arr)?arr.map(x=>typeof x==="object"&&x?coerceId(x.id??x.playerId??x.uid??x.user_id):coerceId(x)).filter(Boolean):[]

    // 라벨: 날짜/팀수 보조 표기 (가용한 필드 우선 사용)
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
        // 1) snapshot: number[][] or string[][]
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
        // 2) teams: { "Team A":[...], "Team B":[...] } or [{name, playerIds}]
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
        // 3) board: 포지션 좌표 기반 저장만 있고 팀 구성이 있을 수 있는 경우
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
        // 4) attendees만 있는 경우: 단일 팀으로 취급
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
  <div className="min-h-screen bg-stone-100 text-stone-800 antialiased leading-relaxed">
    <ToastHub/>
    <header className="sticky top-0 z-10 border-b border-stone-300 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="Semihan Football Manager Logo" className="h-7 w-7 object-contain" width={28} height={28} decoding="async"/>
          <h1 className="text-base font-semibold tracking-tight">Semihan-FM</h1>
        </div>
        <nav className="flex gap-1 items-center">
          <TabButton icon={<Home size={16}/>} label="대시보드" onClick={()=>setTab("dashboard")} active={tab==="dashboard"}/>
          {isAdmin&&<TabButton icon={<Users size={16}/>} label="선수 관리" onClick={()=>setTab("players")} active={tab==="players"}/>}
          {isAdmin&&<TabButton icon={<CalendarDays size={16}/>} label="매치 플래너" onClick={()=>setTab("planner")} active={tab==="planner"}/>}
          <TabButton icon={<IconPitch size={16}/>} label="포메이션 보드" onClick={()=>setTab("formation")} active={tab==="formation"}/>
          {isAdmin&&<TabButton icon={<ListChecks size={16}/>} label="기록 입력" onClick={()=>setTab("stats")} active={tab==="stats"}/>}
          <div className="ml-2 pl-2 border-l border-stone-300">
            {isAdmin?(
              <button onClick={adminLogout} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400">
                <X size={14}/> Admin 로그아웃
              </button>
            ):(
              <button onClick={()=>setLoginOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <Lock size={14}/> Admin 로그인
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-6xl p-4">
      {tab==="dashboard"&&(<Dashboard totals={totals} players={players} matches={matches} isAdmin={isAdmin} onUpdateMatch={handleUpdateMatch}/>)}
      {tab==="players"&&isAdmin&&(<PlayersPage players={players} selectedId={selectedPlayerId} onSelect={setSelectedPlayerId} onCreate={handleCreatePlayer} onUpdate={handleUpdatePlayer} onDelete={handleDeletePlayer} onImport={handleImportPlayers} onReset={handleResetPlayers}/>)}
      {tab==="planner"&&isAdmin&&(<MatchPlanner players={players} matches={matches} onSaveMatch={handleSaveMatch} onDeleteMatch={handleDeleteMatch} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin}/>)}
      {/* ⬇️ FormationBoard에 fetchMatchTeams 연결 */}
      {tab==="formation"&&(<FormationBoard players={players} isAdmin={isAdmin} fetchMatchTeams={fetchMatchTeams}/>)}
      {tab==="stats"&&isAdmin&&(<StatsInput players={players} matches={matches} onUpdateMatch={handleUpdateMatch} isAdmin={isAdmin}/>)}
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

    <AdminLoginDialog isOpen={loginOpen} onClose={()=>setLoginOpen(false)} onSuccess={onAdminSuccess} adminPass={ADMIN_PASS}/>
  </div>)}
function TabButton({icon,label,active,onClick}){return(<button onClick={onClick} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${active?"bg-emerald-500 text-white shadow-sm":"text-stone-700 hover:bg-stone-200 active:bg-stone-300"}`} aria-pressed={active}>{icon}<span className="hidden sm:inline">{label}</span></button>)}

/* ── Admin Login Dialog (기존 코드 유지) ─────────────────── */
function AdminLoginDialog({isOpen,onClose,onSuccess,adminPass}){const[pw,setPw]=useState(""),[show,setShow]=useState(false),[err,setErr]=useState(""),[caps,setCaps]=useState(false),[loading,setLoading]=useState(false)
  useEffect(()=>{if(isOpen){setPw("");setErr("");setCaps(false);setLoading(false);setTimeout(()=>document.getElementById("adminPw")?.focus(),50)}},[isOpen])
  const onKey=e=>{setCaps(!!e.getModifierState?.("CapsLock"));if(e.key==="Enter")submit()}
  const submit=()=>{if(loading)return;setLoading(true);setErr("");setTimeout(()=>{if(pw&&pw===adminPass)onSuccess?.();else{setErr("비밀번호가 올바르지 않습니다.");setLoading(false)}},250)}
  if(!isOpen)return null;return(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <div className="relative w-full max-w-sm rounded-2xl border border-stone-200 bg-white shadow-xl">
      <button className="absolute right-3 top-3 rounded-md p-1 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="닫기"><X size={18}/></button>
      <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><ShieldCheck size={20}/></div><div><h3 className="text/base font-semibold">Admin 로그인</h3><p className="text-xs text-stone-500">관리자 전용 기능을 사용하려면 인증하세요.</p></div></div>
      <div className="space-y-3 px-5 py-4">
        <label className="block text-xs font-medium text-stone-600">비밀번호</label>
        <div className={`flex items-center rounded-lg border px-3 ${err?"border-rose-300 bg-rose-50":"border-stone-300 bg-white"}`}>
          <Lock size={16} className="mr-2 shrink-0 text-stone-500"/>
          <input id="adminPw" type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} onKeyUp={onKey} onKeyDown={onKey} placeholder="Admin Password" className="w-full py-2 text-sm outline-none placeholder:text-stone-400" autoCapitalize="off" autoCorrect="off" autoComplete="current-password"/>
          <button type="button" className="ml-2 rounded p-1 text-stone-500 hover:bg-stone-100" onClick={()=>setShow(v=>!v)} aria-label={show?"비밀번호 숨기기":"비밀번호 보기"}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>
        </div>
        {caps&&(<div className="flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800"><AlertCircle size={12}/>Caps Lock이 켜져 있어요</div>)}
        {err&&(<div className="flex items-center gap-2 rounded-md bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700"><X size={12}/>{err}</div>)}
        <button onClick={submit} disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-50">{loading?<span className="inline-flex items-center gap-2"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" fill="none"/></svg> 확인 중…</span>:<><CheckCircle2 size={14}/> 로그인</>}</button>
      </div>
    </div>
  </div>)}
