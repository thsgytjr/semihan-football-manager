// src/components/SavedMatchesList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from 'react-i18next'
import ConfirmDialog from './ConfirmDialog'
import InitialAvatar from "./InitialAvatar"
import { overall } from "../lib/players"
import { hydrateMatch } from "../lib/match"
import { formatMatchLabel } from "../lib/matchLabel"
import { logger } from "../lib/logger"
import { getMembershipBadge } from "../lib/membershipConfig"
import * as MatchHelpers from "../lib/matchHelpers"
import { isRefMatch } from "../lib/matchUtils"
import { computeGameEvents } from "../lib/gameEvents"
import draftIcon from "../assets/draft.png"
import captainIcon from "../assets/Captain.PNG"

// 두 구장에서 팀들이 완전히 분리되어 경기했는지 판별
function checkFieldSeparation(gameMatchups, teamCount) {
  if (!gameMatchups || gameMatchups.length === 0) return null

  const field1Teams = new Set()
  const field2Teams = new Set()

  for (const matchup of gameMatchups) {
    if (!matchup || !Array.isArray(matchup)) continue
    // 각 쿼터의 매치업은 보통 2개 페어 (2개 구장)
    matchup.forEach((pair, fieldIdx) => {
      if (!Array.isArray(pair) || pair.length !== 2) return
      const [a, b] = pair
      if (a === null || a === undefined || b === null || b === undefined) return
      if (fieldIdx === 0) {
        field1Teams.add(a)
        field1Teams.add(b)
      } else if (fieldIdx === 1) {
        field2Teams.add(a)
        field2Teams.add(b)
      }
    })
  }

  // 교집합이 있으면 섞인 것
  const intersection = new Set([...field1Teams].filter(t => field2Teams.has(t)))
  if (intersection.size > 0) return null

  // 합집합이 전체 팀을 커버하지 못하면 무효
  const allTeamsInFields = new Set([...field1Teams, ...field2Teams])
  if (allTeamsInFields.size !== teamCount) return null

  // 각 구장에 최소 2팀 이상 있어야 함
  if (field1Teams.size < 2 || field2Teams.size < 2) return null

  return { field1Teams, field2Teams }
}

// Confetti effect disabled for now to avoid layout/compile issues
function Confetti() { return null }

const S = (v)=>v==null?"":String(v)
const isMember = (m)=>{ const s=S(m).trim().toLowerCase(); return s==="member"||s.includes("정회원") }
const GuestBadge = ()=>(
  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700" title="게스트">
    G
  </span>
)
const CaptainBadge = () => (
  <img src={captainIcon} alt="주장" className="inline-block w-4 h-4 object-cover" title="주장" />
)

/* ---------------------- G/A 집계 유틸 ---------------------- */
const toStr = (v) => (v === null || v === undefined) ? '' : String(v)
/**
 * extractStatsByPlayerForOneMatch:
 * - 다양한 호환 필드(m.stats | m.records | m.playerStats | m.ga | m.scoreboard)를 받아
 *   playerId 별 { goals, assists }를 반환
 */
function extractStatsByPlayerForOneMatch(m){
  const src = m?.stats ?? m?.records ?? m?.playerStats ?? m?.ga ?? m?.scoreboard ?? null
  const out = {}
  if (!src) return out
  if (!Array.isArray(src) && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const pid = toStr(k)
      if (!pid) continue
      const goals = Number(v?.goals || v?.G || 0)
      const assists = Number(v?.assists || v?.A || 0)
      const fouls = Number(v?.fouls || 0)
      const yellowCards = Number(v?.yellowCards || 0)
      const redCards = Number(v?.redCards || 0)
      out[pid] = { goals, assists, fouls, yellowCards, redCards }
    }
    return out
  }
  if (Array.isArray(src)) {
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid ?? rec?.player)
      if (!pid) continue
      const type = (rec?.type || (rec?.goal ? 'goals' : rec?.assist ? 'assists' : null) || (rec?.action) || '').toString().toLowerCase()
      const isGoal = /goal/i.test(type)
      const isAssist = /assist/i.test(type)
      const g = Number(rec?.goals || (isGoal ? 1 : 0) || 0)
      const a = Number(rec?.assists || (isAssist ? 1 : 0) || 0)
      const prev = out[pid] || { goals: 0, assists: 0, fouls: 0, yellowCards: 0, redCards: 0 }
      out[pid] = { goals: prev.goals + (g||0), assists: prev.assists + (a||0), fouls: prev.fouls, yellowCards: prev.yellowCards, redCards: prev.redCards }
    }
    return out
  }
  return out
}

/* ---------------------- 공통 요금 유틸 ---------------------- */
/** 
 * calcFees: $1 단위, 게스트는 멤버보다 항상 +$2, 합계가 total 미만이면 $1씩 올려 충족(초과 허용)
 */
function calcFees({ total, memberCount, guestCount }) {
  total = Math.max(0, Number(total) || 0);
  const count = memberCount + guestCount;
  if (total <= 0 || count === 0) return { total, memberFee: 0, guestFee: 0 };

  // 1) 최소 단가로 시작: floor((T - 2g) / (m + g))
  let baseEach = Math.floor((total - 2 * guestCount) / count);
  if (!Number.isFinite(baseEach) || baseEach < 0) baseEach = 0;

  // 2) 게스트는 항상 멤버 +$2
  let memberFee = baseEach;
  let guestFee  = baseEach + 2;

  // 3) 모자라면 $1씩만 올려 최소 초과로 맞춤 (정확히 나누어떨어지면 딱 맞음)
  let sum = memberCount * memberFee + guestCount * guestFee;
  while (sum < total) {
    memberFee += 1;
    guestFee  = memberFee + 2;
    sum = memberCount * memberFee + guestCount * guestFee;
  }

  return { total, memberFee, guestFee };
}

/* ---------------------- YouTube 유틸 ---------------------- */
function parseYouTubeIdFromUrl(url) {
  const s = S(url).trim()
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id || null
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2] || u.pathname.split('/')[1]
        return id || null
      }
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2]
        return id || null
      }
      const v = u.searchParams.get('v')
      if (v) return v
    }
  } catch {}
  const rx = /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  const m = s.match(rx)
  if (m && m[1]) return m[1]
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  return null
}

/** match 객체에서 유튜브 {id,url,title,sourceIndex?} 배열 생성 */
function extractYouTubeEntries(match){
  const prefers = []

  // 1) 권장 단일 필드
  if (match?.youtubeUrl) {
    prefers.push({ url: match.youtubeUrl, title: match?.youtubeTitle })
  }

  // 2) videos 배열(문자열/객체 혼용)
  if (Array.isArray(match?.videos)) {
    match.videos.forEach((v, idx) => {
      if (typeof v === 'string') prefers.push({ url: v, title: match?.youtubeTitle, sourceIndex: idx })
      else if (v && typeof v === 'object') prefers.push({ url: v.url || v.link || v.href, title: v.title, sourceIndex: idx })
    })
  }

  // 3) 여분 배열 필드
  ;['links', 'media', 'attachments'].forEach(k=>{
    const arr = match?.[k]
    if (Array.isArray(arr)) {
      arr.forEach((item) => {
        const url = typeof item === 'string' ? item : (item?.url || item?.link || item?.href)
        const title = (typeof item === 'object' && item?.title) || match?.youtubeTitle || match?.title || match?.name
        if (url) prefers.push({ url, title })
      })
    }
  })

  // URL → ID 변환 + 정리
  const out = []
  prefers.forEach((cand) => {
    const id = parseYouTubeIdFromUrl(cand.url)
    if (id) out.push({ id, url: `https://www.youtube.com/watch?v=${id}`, title: S(cand.title||''), sourceIndex: cand.sourceIndex })
  })
  // 중복 제거(id 기준)
  const seen = new Set()
  return out.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
}

function YouTubeThumb({ videoId, title, dateKey }) {
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  const href  = `https://www.youtube.com/watch?v=${videoId}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group relative block overflow-hidden rounded-lg border border-stone-200"
      title={title}
    >
      <img
        src={thumb}
        alt={title}
        loading="lazy"
        className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/60 via-black/10 to-transparent p-2">
        <div className="text-[11px] leading-tight text-white drop-shadow">
          <div className="font-medium truncate max-w-[160px] sm:max-w-[200px]">{title || 'Match Video'}</div>
          {dateKey ? <div className="opacity-90">{dateKey}</div> : null}
        </div>
        <div className="mb-1 mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-md group-hover:bg-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
    </a>
  )
}

/* ----------------------- 기타 유틸 ------------------------ */
const kitForTeam=(i)=>[
  {label:"White",headerClass:"bg-white text-stone-800 border-b border-stone-300"},
  {label:"Black",headerClass:"bg-stone-900 text-white border-b border-stone-900"},
  {label:"Blue",headerClass:"bg-blue-600 text-white border-b border-blue-700"},
  {label:"Red",headerClass:"bg-red-600 text-white border-b border-red-700"},
  {label:"Green",headerClass:"bg-emerald-600 text-white border-b border-emerald-700"},
  {label:"Purple",headerClass:"bg-violet-600 text-white border-b border-violet-700"},
  {label:"Orange",headerClass:"bg-orange-500 text-white border-b border-orange-600"},
  {label:"Teal",headerClass:"bg-teal-600 text-white border-b border-teal-700"},
  {label:"Pink",headerClass:"bg-pink-600 text-white border-b border-pink-700"},
  {label:"Yellow",headerClass:"bg-yellow-400 text-stone-900 border-b border-yellow-500"},
][i%10]

const normalizeSnapshot=(m,teams)=>{
  const snap=Array.isArray(m?.snapshot)?m.snapshot:null
  return (snap&&snap.length===teams.length)?snap.map(a=>Array.isArray(a)?a.slice():[]):teams.map(list=>list.map(p=>p.id))
}
const notInMatchPlayers=(players,snap2D)=>{
  const inside=new Set(snap2D.flat().map(String))
  return players.filter(p=>!inside.has(String(p.id)))
}
const deriveFormatByLocation=(m)=>{
  const p=(m?.location?.preset||"").toLowerCase(), n=(m?.location?.name||"").toLowerCase()
  if(p==="indoor-soccer-zone"||n.includes("indoor soccer zone")) return "9v9"
  if(p==="coppell-west"||n.includes("coppell")) return "11v11"
  return m?.mode||""
}

/* ✅ 장소 → 구글맵 링크 생성 */
function getLocationLink(m){
  const preset = (m?.location?.preset || "").toLowerCase()
  if (preset === "indoor-soccer-zone")
    return "https://maps.app.goo.gl/cud8m52vVwZJEinN8?g_st=ic"
  if (preset === "coppell-west")
    return "https://maps.app.goo.gl/vBLE84hRB3ez1BJy5?g_st=ic"
  const addr = m?.location?.address || ""
  if (/^https?:\/\//i.test(addr)) return addr
  return null
}

/* 요금 계산: 새 규칙 (게스트 +$2, $1 단위, 총합 충족 보정) */
function deriveFeesFromSnapshot(m, players){
  // 1) 참석자 추출
  const ids=Array.isArray(m?.snapshot)&&m.snapshot.length?m.snapshot.flat():Array.isArray(m?.attendeeIds)?m.attendeeIds:[]
  const map=new Map(players.map(p=>[String(p.id),p]))
  const atts=ids.map(id=>map.get(String(id))).filter(Boolean)

  const memberCount=atts.filter(p=>isMember(p.membership)).length
  const guestCount=Math.max(0, atts.length-memberCount)

  // 2) 매치에 명시적 fees가 있으면 우선 사용
  // MatchPlanner에서 저장할 때 fees가 포함되어 있음
  if(m?.fees){
    // memberFee와 guestFee가 모두 있으면 바로 반환
    if(typeof m.fees.memberFee==="number"&&typeof m.fees.guestFee==="number"){
      const total = typeof m.fees.total === 'number' ? m.fees.total 
                    : (memberCount*m.fees.memberFee + guestCount*m.fees.guestFee)
      return { total, memberFee:m.fees.memberFee, guestFee:m.fees.guestFee, memberCount, guestCount, _estimated:false }
    }
    // total만 있으면 그것으로 계산
    if(typeof m.fees.total === 'number' && m.fees.total > 0){
      const { memberFee, guestFee } = calcFees({ total: m.fees.total, memberCount, guestCount })
      return { total: m.fees.total, memberFee, guestFee, memberCount, guestCount, _estimated:false }
    }
  }

  // 3) 장소 프리셋별 총액(Indoor=220, Coppell=330)
  const preset=(m?.location?.preset||"").toLowerCase()
  const total = preset==="indoor-soccer-zone" ? 220
              : preset==="coppell-west"        ? 330
              : (m?.fees?.total||0)

  // 4) 새 규칙 계산
  const { memberFee, guestFee } = calcFees({ total, memberCount, guestCount })
  return { total, memberFee, guestFee, memberCount, guestCount, _estimated:true }
}

/* ---------------------- 입력 컴포넌트 ---------------------- */
// 유튜브 링크 + 제목 추가
function VideoAdder({ onAdd }){
  const [url,setUrl]=useState("")
  const [title,setTitle]=useState("")
  const add=()=>{
    let u=url.trim()
    const t=title.trim()
    if(!u) return
    // URL에 프로토콜이 없으면 https:// 추가
    if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u
    }
    onAdd(u, t || null)
    setUrl(""); setTitle("")
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        placeholder="YouTube 링크 (https://youtu.be/... 또는 https://www.youtube.com/watch?v=...)"
        value={url} onChange={e=>setUrl(e.target.value)}
      />
      <input
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        placeholder="썸네일에 표시할 제목 (선택)"
        value={title} onChange={e=>setTitle(e.target.value)}
      />
      <button
        className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        onClick={add}
      >
        추가
      </button>
    </div>
  )
}

/* 빠른 출석 편집(드래프트만 수정) */
function QuickAttendanceEditor({ players, snapshot, onDraftChange, customMemberships }){
  const { t } = useTranslation()
  const [teamIdx,setTeamIdx]=useState(0),[q,setQ]=useState(""),[open,setOpen]=useState(false),[hi,setHi]=useState(-1)
  const wrapRef=useRef(null), listRef=useRef(null)
  const cands=useMemo(()=>notInMatchPlayers(players,snapshot),[players,snapshot])
  const list=useMemo(()=>{
    const t=q.trim().toLowerCase()
    const base=t?cands.filter(p=>(p.name||"").toLowerCase().includes(t)):cands
    return base.slice().sort((a,b)=>{
      const an=(a.name||"").toLowerCase(), bn=(b.name||"").toLowerCase()
      const ai=an.indexOf(t), bi=bn.indexOf(t); const aw=ai<0?999:ai, bw=bi<0?999:bi
      return aw-bw||an.localeCompare(bn)
    }).slice(0,40)
  },[cands,q])
  useEffect(()=>{
    const h=e=>{ if(!wrapRef.current) return; if(!wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h)
  },[])
  useEffect(()=>{
    if(listRef.current&&hi>=0){ const el=listRef.current.querySelector(`[data-idx="${hi}"]`)
      if(el){ const {offsetTop:h,offsetHeight:hh}=el; const {scrollTop:t,clientHeight:c}=listRef.current
        if(h<t) listRef.current.scrollTop=h; else if(h+hh>t+c) listRef.current.scrollTop=h-c+hh } }
  },[hi])
  const add=(pLike)=>{
    const p=typeof pLike==="string"?list.find(pp=>(pp.name||"").toLowerCase()===pLike.trim().toLowerCase()):pLike
    if(!p) return
    const id=p.id, next=snapshot.map((arr,i)=>i===teamIdx?(arr.some(x=>String(x)===String(id))?arr:[...arr,id]):arr)
    onDraftChange(next); setQ(""); setHi(-1); setOpen(false)
  }
  const onKey=(e)=>{
    if(!open&&(e.key==="ArrowDown"||e.key==="Enter")){ setOpen(true); return }
    if(!open) return
    if(e.key==="ArrowDown"){ e.preventDefault(); setHi(h=>Math.min(h+1,list.length-1)) }
    else if(e.key==="ArrowUp"){ e.preventDefault(); setHi(h=>Math.max(h-1,0)) }
    else if(e.key==="Enter"){ e.preventDefault(); if(hi>=0&&hi<list.length) add(list[hi]); else add(q) }
    else if(e.key==="Escape") setOpen(false)
  }
  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2" ref={wrapRef}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-600">빠른 출석 편집</label>
        <select className="rounded border border-gray-300 bg-white px-2 py-1 text-xs" value={teamIdx} onChange={e=>setTeamIdx(Number(e.target.value))}>
          {snapshot.map((_,i)=><option key={i} value={i}>{t('matchHistory.team')} {i+1}</option>)}
        </select>
        <div className="relative min-w-[220px] flex-1">
          <input className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" placeholder="이름 검색 후 추가 (Enter)"
            value={q} onChange={e=>{setQ(e.target.value); setOpen(true); setHi(-1)}} onFocus={()=>setOpen(true)} onKeyDown={onKey}/>
          {open&&list.length>0&&(
            <div ref={listRef} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg" role="listbox" aria-label="가용 선수 목록">
              {list.map((p,idx)=>{
                const membershipBadgeInfo = getMembershipBadge(p.membership, customMemberships || [])
                const badges = membershipBadgeInfo?.badge ? [membershipBadgeInfo.badge] : []
                return (
                  <button key={p.id} type="button" data-idx={idx}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 ${idx===hi?"bg-gray-100":""}`}
                    onMouseEnter={()=>setHi(idx)} onMouseDown={e=>e.preventDefault()} onClick={()=>add(p)}>
                    <InitialAvatar 
                      id={p.id} 
                      name={p.name} 
                      size={28} 
                      photoUrl={p.photoUrl} 
                      badges={badges}
                      customMemberships={customMemberships || []}
                      badgeInfo={membershipBadgeInfo}
                    />
                    <span className="truncate">{p.name}</span>
                    {(p.position||p.pos)==="GK"&&<span className="ml-auto text-[11px] text-gray-400">GK</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs" onClick={()=>add(q)}>추가</button>
      </div>
    </div>
  )
}

/* ------------------------- 매치 카드 ------------------------- */
const MatchCard = React.forwardRef(function MatchCard({ m, players, isAdmin, enableLoadToPlanner, onLoadToPlanner, onDeleteMatch, onUpdateMatch, onUpdateVideos, showTeamOVRForAdmin, hideOVR, latestDraftId, isHighlighted, customMemberships, isExpanded, onToggleExpand }, ref){
  const { t } = useTranslation()
  const hydrated=useMemo(()=>hydrateMatch(m,players),[m,players])
  const initialSnap=useMemo(()=>normalizeSnapshot(m,hydrated.teams||[]),[m,hydrated.teams])
  const [draftSnap,setDraftSnap]=useState(initialSnap), [dirty,setDirty]=useState(false)
  const [captainIds, setCaptainIds] = useState([])
  const [quarterScores, setQuarterScores] = useState(null)
  const [localDraftMode, setLocalDraftMode] = useState(() => {
    // ✅ 헬퍼 사용 - 드래프트 판별 로직 통일
    return MatchHelpers.isDraftMatch(m)
  })
  const byId=useMemo(()=>new Map(players.map(p=>[String(p.id),p])),[players])
  const draftTeams=useMemo(()=>draftSnap.map(ids=>ids.map(id=>byId.get(String(id))).filter(Boolean)),[draftSnap,byId])
  const draftCount=useMemo(()=>draftSnap.flat().length,[draftSnap])
  const label=useMemo(()=>formatMatchLabel({...m,snapshot:draftSnap},{withDate:true,withCount:true,count:draftCount,t}),[m,draftSnap,draftCount,t])
  const fees=useMemo(()=>deriveFeesFromSnapshot({...m,snapshot:draftSnap},players),[m,draftSnap,players])
  const formatLabel=deriveFormatByLocation(m)
  const isDraftMode = localDraftMode

  // ✅ 이 매치의 선수별 G/A 매핑 계산
  const gaByPlayer = useMemo(()=>extractStatsByPlayerForOneMatch(m), [m])

  // ✅ 경기별 득점/어시 매핑: 저장값 우선, 없으면 시간순 자동계산
  const gameEvents = useMemo(() => {
    const stored = Array.isArray(m?.gameEvents)
      ? m.gameEvents
      : Array.isArray(m?.statsMeta?.gameEvents)
        ? m.statsMeta.gameEvents
        : null
    if (stored && stored.length > 0) return stored
    return computeGameEvents(m, players)
  }, [m, players])
  const groupedGameEvents = useMemo(() => {
    const fromEvents = Math.max(1, ...gameEvents.map(ev => Number(ev.gameIndex || 0) + 1))
    const fromQuarterScores = (() => {
      const qs = Array.isArray(m?.quarterScores) ? m.quarterScores : Array.isArray(m?.draft?.quarterScores) ? m.draft.quarterScores : []
      return Array.isArray(qs) ? qs.reduce((max, arr) => Math.max(max, Array.isArray(arr) ? arr.length : 0), 0) : 0
    })()
    const fromGames = Array.isArray(m?.stats?.__games) ? m.stats.__games.length : 0
    const maxGame = Math.max(1, fromEvents, fromQuarterScores, fromGames)

    const base = Array.from({ length: maxGame }, () => [])
    gameEvents.forEach(ev => {
      const gi = Math.min(maxGame - 1, Math.max(0, Number(ev.gameIndex) || 0))
      base[gi].push(ev)
    })
    return base
  }, [gameEvents, m])
  // Show game events section for all matches
  const hasTimeline = Array.isArray(m?.stats?.__events) && m.stats.__events.length > 0
  const hasGameEvents = useMemo(() => groupedGameEvents.some(arr => arr.length > 0), [groupedGameEvents])
  const [showGameEvents, setShowGameEvents] = useState(false)
  
  // ✅ G/A 표시 토글: 기본 꺼짐
  const [showGA, setShowGA] = useState(false)
  
  // ✅ 상태 수동 제어 (Admin 전용)
  const [statusOverride, setStatusOverride] = useState(m?.statusOverride || null) // 'live', null
  
  // ✅ 2개 경기장 모드 토글
  const [multiFieldMode, setMultiFieldMode] = useState(m?.multiField || false)
  // 삭제 확인 모달
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null })
          {enableLoadToPlanner&&<button className="text-[10px] rounded border border-blue-300 bg-blue-50 text-blue-700 px-1.5 py-0.5 hover:bg-blue-100 transition-colors leading-tight" onClick={()=>onLoadToPlanner?.(m)}>로드</button>}
          {isAdmin&&onDeleteMatch&&(
            <button
              className="text-[10px] rounded border border-red-300 bg-red-50 text-red-700 px-1.5 py-0.5 hover:bg-red-100 transition-colors leading-tight"
              onClick={()=> setConfirmDelete({ open: true, id: m.id })}
            >
              삭제
            </button>
          )}
  
  // ✅ 게임별 매치업 정보 (2개 경기장 모드용)
  // gameMatchups[gameIndex] = [[teamA1, teamA2], [teamB1, teamB2]]
  const [gameMatchups, setGameMatchups] = useState(m?.gameMatchups || [])

  // ✅ 초안 변경은 반드시 setSnap 경유 → dirty 플래그 유지
  const setSnap=(next)=>{ setDraftSnap(next); setDirty(true) }
  const setCaptain=(teamIdx, playerId)=>{ 
    const next=[...(captainIds||[])]
    const current = next[teamIdx] ? String(next[teamIdx]) : null
    // 토글: 같은 선수 다시 누르면 해제, 아니면 해당 선수로 지정
    next[teamIdx] = (current === String(playerId)) ? null : String(playerId)
    setCaptainIds(next)
    setDirty(true)
  }
  const resetDraft=()=>{ 
    setDraftSnap(initialSnap)
    setDirty(false)
    // ✅ 헬퍼 사용 - 드래프트 판별 로직 통일
    setLocalDraftMode(MatchHelpers.isDraftMatch(m))
    
    // Reset captains to initial state - ✅ 헬퍼 사용
    const caps = MatchHelpers.getCaptains(m)
    if(caps && caps.length) setCaptainIds(caps)
    else setCaptainIds(initialSnap.map(team=>team[0]?String(team[0]):null))
    
    // Reset quarter scores to initial state - ✅ 헬퍼 사용
    const qs = MatchHelpers.getQuarterScores(m)
    setQuarterScores(qs.length > 0 ? qs : (initialSnap.length? initialSnap.map(()=>[]): null))
  }
  const saveDraft=()=>{ 
    const patch = {
      snapshot: draftSnap,
      attendeeIds: draftSnap.flat(),
      multiField: multiFieldMode,
      gameMatchups: gameMatchups,
      statusOverride: statusOverride
    }
    
    // Draft 모드 저장
    if (localDraftMode) {
      patch.selectionMode = 'draft'
      patch.draft = {
        ...(m.draft || {}),
        captains: captainIds,
        quarterScores: quarterScores
      }
    } else {
      // 일반 모드: selectionMode를 명시적으로 'manual'로 설정
      patch.selectionMode = 'manual'
      patch.draft = {
        ...(m.draft || {}),
        captains: captainIds, // 주장 정보는 일반 모드에서도 저장
        quarterScores: [] // quarterScores 초기화
      }
    }
    
    onUpdateMatch?.(m.id, patch)
    setDirty(false)
  }

  useEffect(()=>{ 
    setDraftSnap(initialSnap); 
    setDirty(false); 
    // ✅ 헬퍼 사용 - 드래프트 판별 로직 통일
    setLocalDraftMode(MatchHelpers.isDraftMatch(m))
  }, [m.id, initialSnap.join('|')])
  
  useEffect(()=>{
    // ✅ 헬퍼 사용 - Captain/QuarterScore 초기화
    const caps = MatchHelpers.getCaptains(m)
    if(caps && caps.length) setCaptainIds(caps)
    else setCaptainIds(initialSnap.map(team=>team[0]?String(team[0]):null))
    
    const qs = MatchHelpers.getQuarterScores(m)
    setQuarterScores(qs.length > 0 ? qs : (initialSnap.length? initialSnap.map(()=>[]): null))
  }, [m.id, initialSnap.join('|')])

  const teamCols = Math.max(1, Math.min(4, draftTeams.length))
  const gridStyle = { gridTemplateColumns: `repeat(${teamCols}, minmax(0, 1fr))` }

  // ✅ 유튜브 항목 뽑기
  const ytEntries = useMemo(()=>extractYouTubeEntries(m), [m])

  // ✅ 추가/삭제(배열은 문자열/객체 혼합 호환)
  const addVideo=(url, title)=>{
    const next = [...(m.videos||[]), title ? { url, title } : url]
    onUpdateMatch?.(m.id,{ videos: next, youtubeUrl: m.youtubeUrl ?? null, youtubeTitle: m.youtubeTitle ?? null })
  }
  const removeVideoBySourceIndex=(sourceIndex)=>{
    if (!Array.isArray(m.videos)) return
    const next = m.videos.filter((_,i)=>i!==sourceIndex)
    onUpdateMatch?.(m.id,{ videos: next })
  }

  const locLink = getLocationLink(m)
  const displayedQuarterScores = useMemo(()=>{
    const hasNonEmpty = (arr) => Array.isArray(arr) && arr.some(item => {
      if (Array.isArray(item)) return item.some(v => v !== null && v !== undefined && v !== '')
      return item !== null && item !== undefined && item !== ''
    })

    const refMode = isRefMatch(m)

    if (m?.draft && hasNonEmpty(m.draft.quarterScores)) return m.draft.quarterScores
    if (hasNonEmpty(m.quarterScores)) return m.quarterScores
    // baseTeamCount: 원본 매치의 팀 수를 정확히 계산
    // 우선순위: snapshot.length > teams.length > draftSnap.length > teamCount
    const snapshotTeamCount = Array.isArray(m?.snapshot) ? m.snapshot.length : 0
    const matchTeamsCount = Array.isArray(m?.teams) ? m.teams.length : 0
    const draftSnapCount = Array.isArray(draftSnap) ? draftSnap.length : 0
    const baseTeamCount = snapshotTeamCount || matchTeamsCount || draftSnapCount || Number(m?.teamCount) || 0
    const gameScores = m?.stats?.__games
    if (refMode && Array.isArray(gameScores) && gameScores.length > 0) {
      const teamCount = gameScores.reduce((max, g) => {
        const len = Array.isArray(g?.scores) ? g.scores.length : 0
        const maxIdx = Array.isArray(g?.teamIndices) && g.teamIndices.length > 0 
          ? Math.max(...g.teamIndices) + 1 
          : 0
        return Math.max(max, len, maxIdx)
      }, baseTeamCount)
      if (teamCount > 0) {
        const teamMajor = Array.from({ length: teamCount }, () => [])
        gameScores.forEach((g, gameIdx) => {
          if (!Array.isArray(g?.scores)) return
          const teamMap = Array.isArray(g.teamIndices) ? g.teamIndices : null
          
          // If teamMap exists, only those teams played this game
          if (teamMap && teamMap.length > 0) {
            // All teams get a slot for this game, but only participating teams get scores
            for (let ti = 0; ti < teamCount; ti++) {
              if (!teamMajor[ti]) teamMajor[ti] = []
              const participantIdx = teamMap.indexOf(ti)
              if (participantIdx >= 0 && participantIdx < g.scores.length) {
                teamMajor[ti].push(Number(g.scores[participantIdx]) || 0)
              } else {
                teamMajor[ti].push(null) // Team did not play in this game
              }
            }
          } else {
            // Legacy: all teams participated
            g.scores.forEach((val, idx) => {
              if (!teamMajor[idx]) teamMajor[idx] = []
              teamMajor[idx].push(Number(val) || 0)
            })
          }
        })
        if (teamMajor.some(arr => arr.length > 0)) return teamMajor
      }
    }
    const statScores = m?.stats?.__scores
    if (refMode && Array.isArray(statScores) && statScores.length > 0) {
      return statScores.map(val => [Number(val) || 0])
    }
    if (Array.isArray(m.scores) && Array.isArray(draftSnap) && m.scores.length===draftSnap.length) return draftSnap.map((_,i)=>[m.scores[i]])
    return null
  },[m, draftSnap])

  const hasRecordedScores = useMemo(() => {
    if (!Array.isArray(displayedQuarterScores)) return false
    // Show table if any team has game data (even if scores are all 0)
    const hasGameData = displayedQuarterScores.some(teamScores => {
      if (Array.isArray(teamScores)) {
        return teamScores.length > 0
      }
      return teamScores !== null && teamScores !== undefined && teamScores !== ''
    })
    if (hasGameData) return true
    
    // Fallback: check if any non-empty score exists
    return displayedQuarterScores.some(teamScores => {
      if (Array.isArray(teamScores)) {
        return teamScores.some(v => v !== null && v !== undefined && v !== '')
      }
      return teamScores !== null && teamScores !== undefined && teamScores !== ''
    })
  }, [displayedQuarterScores])

  const perGameScores = useMemo(() => {
    const baseTeamCount = draftSnap.length
    if (!baseTeamCount) return []

    const gamesMeta = Array.isArray(m?.stats?.__games) ? m.stats.__games : []

    const maxGameFromQuarters = Array.isArray(displayedQuarterScores)
      ? displayedQuarterScores.reduce((max, teamScores) => {
          const len = Array.isArray(teamScores) ? teamScores.length : 0
          return Math.max(max, len)
        }, 0)
      : 0

    const gameCount = Math.max(groupedGameEvents.length || 0, maxGameFromQuarters, gamesMeta.length)

    return Array.from({ length: gameCount }, (_, gi) => {
      const gameMeta = gamesMeta[gi] || {}
      const teamMap = Array.isArray(gameMeta.teamIndices) && gameMeta.teamIndices.length > 0
        ? gameMeta.teamIndices
        : Array.from({ length: baseTeamCount }, (_, i) => i)
      const viewTeamCount = teamMap.length

      const eventScoreByTeam = {}
      const evs = groupedGameEvents[gi] || []
      evs.forEach(ev => {
        const ti = Math.max(0, Number(ev.teamIndex) || 0)
        eventScoreByTeam[ti] = (eventScoreByTeam[ti] || 0) + 1
      })

      const scores = Array.from({ length: viewTeamCount }, (_, idx) => {
        const originalIdx = teamMap[idx] ?? idx
        const qScore = Array.isArray(displayedQuarterScores?.[originalIdx]) ? displayedQuarterScores[originalIdx][gi] : undefined
        if (qScore !== undefined) return Number(qScore) || 0
        return eventScoreByTeam[idx] || 0
      })

      const maxScore = scores.length ? Math.max(...scores) : 0
      const winners = scores.map((score, idx) => score === maxScore ? idx : -1).filter(idx => idx >= 0)
      const isDraw = winners.length > 1

      return { scores, winners, isDraw, teamMap }
    })
  }, [displayedQuarterScores, groupedGameEvents, draftSnap, m?.stats?.__games])

  // ✅ Check if match has any recorded stats (goals or assists)
  const hasStats = useMemo(() => {
    const statsObj = gaByPlayer || {}
    return Object.values(statsObj).some(rec => (rec?.goals > 0 || rec?.assists > 0))
  }, [gaByPlayer])

  // ✅ Current time tracker for real-time status updates
  const [currentTime, setCurrentTime] = useState(Date.now())

  // ✅ Determine match status based on dateISO and stats
  const matchStatus = useMemo(() => {
    // ✅ 수동 오버라이드가 'off'면 배지를 표시하지 않음
    if (statusOverride === 'off') return null
    // ✅ 수동 오버라이드가 있으면 우선 사용
    if (statusOverride) return statusOverride
    
    if (hasStats) return 'completed' // Has stats = already finished
    if (!m?.dateISO) return null // No date = can't determine
    
    const matchTime = new Date(m.dateISO)
    const now = new Date(currentTime)
    const diffMs = matchTime - now
    const diffHours = diffMs / (1000 * 60 * 60)
    
    // If match hasn't started yet = upcoming
    if (diffMs > 0) return 'upcoming'
    
    // If match started and within 3 hours after = live
    if (diffHours > -3) return 'live'
    
    return null
  }, [m?.dateISO, hasStats, currentTime, statusOverride])

  // ✅ Countdown timer for upcoming matches
  const [countdown, setCountdown] = useState('')
  
  useEffect(() => {
    if (!m?.dateISO) return
    
    const updateCountdown = () => {
      const matchTime = new Date(m.dateISO)
      const now = new Date()
      const diffMs = matchTime - now
      
      // Update current time to trigger matchStatus recalculation
      setCurrentTime(Date.now())
      
      if (diffMs <= 0) {
        setCountdown('')
        return
      }
      
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)
      
      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`)
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`)
      } else {
        setCountdown(`${seconds}s`)
      }
    }
    
    updateCountdown()
    const interval = setInterval(updateCountdown, 1000) // Update every second
    
    return () => clearInterval(interval)
  }, [m?.dateISO])

  // 컴팩트 요약 정보
  const attendeeCount = draftSnap.flat().length
  const dateStr = m?.dateISO ? new Date(m.dateISO).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }) : ''
  const teamCount = draftSnap.length

  return (
  <li ref={ref} className={`relative min-w-0 rounded-xl border-2 transition-all ${isExpanded ? 'border-gray-200 bg-gradient-to-br from-white via-stone-50 to-stone-100 shadow-lg' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'} ${isHighlighted ? 'match-highlight-pulse' : ''}`}>
      
      {/* 컴팩트 헤더 - 클릭 가능 */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* 날짜 */}
          <div className="flex-shrink-0 text-center min-w-[60px]">
            <div className="text-xs font-semibold text-gray-700">{dateStr.split(' ')[0]}</div>
            <div className="text-[10px] text-gray-500">{dateStr.split(' ').slice(1).join(' ')}</div>
          </div>
          
          {/* 구분선 */}
          <div className="h-8 w-px bg-gray-300"></div>
          
          {/* 참석 인원 */}
          <div className="flex-shrink-0">
            <span className="text-sm font-semibold text-gray-700">{attendeeCount}명</span>
          </div>
          
          {/* 구분선 */}
          <div className="h-8 w-px bg-gray-300"></div>
          
          {/* 팀 수 */}
          <div className="flex-shrink-0">
            <span className="text-sm font-semibold text-gray-700">{teamCount}팀</span>
          </div>
          
          {/* 드래프트/일반 매치 표시 */}
          {isDraftMode && (
            <>
              <div className="h-8 w-px bg-gray-300"></div>
              <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200">
                <img src={draftIcon} alt="" className="w-3 h-3" loading="lazy" />
                Draft
              </span>
            </>
          )}
          
          {/* LIVE 배지만 헤더에 표시 */}
          {matchStatus === 'live' && (
            <span className="ml-2 flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white bg-red-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white"></span>
              LIVE
            </span>
          )}
        </div>
        
        {/* 펼침 표시 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {dirty && isExpanded && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 font-semibold">수정됨</span>}
          <svg 
            className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {/* 펼쳐진 상세 내용 */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-5">
      {/* Status indicator based on match time and stats */}
      {matchStatus === 'live' && (
        <div className="absolute -top-3 -right-2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white live-badge-natural">
            <span className="inline-block h-2 w-2 rounded-full bg-white live-dot"></span>
            <span>LIVE</span>
          </span>
        </div>
      )}
      {matchStatus === 'upcoming' && (
        <div className="absolute -top-3 -right-2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-300 shadow-sm">
            <span aria-hidden="true">📅</span>
            <span>{countdown || 'UPCOMING'}</span>
          </span>
        </div>
      )}
      {isDraftMode && (
        <div className="absolute -top-3 -left-2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-amber-900 bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-200 shadow-md">
            <img 
              src={draftIcon} 
              alt="Draft" 
              className="w-4 h-4 mr-1 align-middle"
              loading="lazy"
              style={{ filter: 'drop-shadow(0 1px 1px rgba(251,191,36,0.15))' }}
            />
            <span className="align-middle">Draft Match</span>
          </span>
        </div>
      )}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-sm min-w-0 flex-1">
          {/* 데스크탑: 한 줄, 모바일: 두 줄 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <div className="flex items-center gap-2">
              <b className="truncate">{label}</b>
              {dirty && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">수정됨</span>}
            </div>
            {m.location?.name && (
              <div className="text-gray-500 sm:shrink-0">
                @ {locLink ? (
                  <a 
                    href={locLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    title="구글 지도에서 보기"
                  >
                    {m.location.name}
                  </a>
                ) : (
                  <a 
                    href={`https://www.google.com/maps/search/${encodeURIComponent(m.location.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    title="구글 지도에서 보기"
                  >
                    {m.location.name}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-1 text-[10px] leading-tight">
              <select 
                className="w-16 h-5 text-[10px] rounded border border-gray-300 bg-white"
                value={statusOverride || ''}
                onChange={e => {
                  const val = e.target.value || null
                  setStatusOverride(val)
                  // 즉시 저장
                  onUpdateMatch?.(m.id, { statusOverride: val })
                }}
                title="상태 배지 수동 설정"
              >
                <option value="">Auto</option>
                <option value="live">Live</option>
                <option value="off">Off</option>
              </select>
            </div>
          )}
          {enableLoadToPlanner&&<button className="text-[10px] rounded border border-blue-300 bg-blue-50 text-blue-700 px-1.5 py-0.5 hover:bg-blue-100 transition-colors leading-tight" onClick={()=>onLoadToPlanner?.(m)}>로드</button>}
          {isAdmin&&onDeleteMatch&&(
            <button
              className="text-[10px] rounded border border-red-300 bg-red-50 text-red-700 px-1.5 py-0.5 hover:bg-red-100 transition-colors leading-tight"
              onClick={()=> setConfirmDelete({ open: true, id: m.id })}
            >
              삭제
            </button>
          )}
        </div>
      </div>

      <div className="mb-2 text-xs text-gray-600">
        {/* 요금 표시: 구장비 미사용 매치(feesDisabled) 또는 total 0이면 숨김 */}
        {!(m.feesDisabled || ((fees?.total ?? m.venueTotalOverride ?? m.totalCost ?? 0) === 0)) ? (
          <>
            {m.teamCount}{t('matchHistory.teams')} ·💰{t('matchHistory.totalFees')} ${ (fees?.total ?? m.venueTotalOverride ?? m.totalCost ?? 0) }
            {typeof fees?.memberFee==="number" && (
              <> · {t('matchHistory.fees.memberEach', { amount: fees.memberFee })}</>
            )}
            {fees?.guestCount>0 && typeof fees?.guestFee==="number" && (
              <> · {t('matchHistory.fees.guestEach', { amount: fees.guestFee })}</>
            )}
            {fees?._estimated && <span className="opacity-70"> (추정)</span>}
          </>
        ) : null}
      </div>

      {/* 실시간 결과 현황판 (3팀 이상, 드래프트 모드, 편집 모드에서만 표시) */}
      {isDraftMode && quarterScores && quarterScores.length >= 3 && !displayedQuarterScores && (
        (() => {
          const teamCount = quarterScores.length
          const isThreeTeams = teamCount === 3
          let leaders = []
          let currentStats = []
          
          if (isThreeTeams) {
            // 승점 계산: G1 0vs1, G2 1vs2, G3 0vs2 반복
            const pairs = [[0,1],[1,2],[0,2]]
            const teamGames = [[],[],[]] // 각 게임 정보: {points, scored, conceded}
            const gamesPlayed = [0,0,0]
            const totals = [0,0,0]
            const maxQ = Math.max(0, ...quarterScores.map(a=>Array.isArray(a)?a.length:0))
            
            for (let qi=0; qi<maxQ; qi++){
              const [a,b] = pairs[qi%3]
              const aVal = quarterScores[a]?.[qi]
              const bVal = quarterScores[b]?.[qi]
              // null/undefined는 경기하지 않은 것으로 처리
              if (aVal === null || aVal === undefined || bVal === null || bVal === undefined) continue
              
              const aScore = Number(aVal)
              const bScore = Number(bVal)
              if (!Number.isFinite(aScore) || !Number.isFinite(bScore)) continue
              
              totals[a]+=aScore; totals[b]+=bScore
              gamesPlayed[a]+=1; gamesPlayed[b]+=1
              
              let aPts = 0, bPts = 0
              if(aScore>bScore){ aPts=3; bPts=0 } 
              else if(bScore>aScore){ aPts=0; bPts=3 } 
              else { aPts=1; bPts=1 }
              
              teamGames[a].push({ points: aPts, scored: aScore, conceded: bScore })
              teamGames[b].push({ points: bPts, scored: bScore, conceded: aScore })
            }
            
            const unequalGP = gamesPlayed.some(g=>g!==gamesPlayed[0])
            const totalPoints = teamGames.map(games => games.reduce((sum, g) => sum + g.points, 0))
            const goalDiff = teamGames.map(games => games.reduce((sum, g) => sum + (g.scored - g.conceded), 0))
            
            let weightedPoints = totalPoints
            let weightedGoalDiff = goalDiff
            let minGames = 0
            
            if (unequalGP) {
              minGames = Math.min(...gamesPlayed.filter(g => g > 0))
              if (minGames > 0) {
                // 게임 품질 비교: 1) 승점, 2) 골득실, 3) 득점
                const compareGames = (g1, g2) => {
                  if (g2.points !== g1.points) return g2.points - g1.points
                  const diff2 = g2.scored - g2.conceded
                  const diff1 = g1.scored - g1.conceded
                  if (diff2 !== diff1) return diff2 - diff1
                  if (g2.scored !== g1.scored) return g2.scored - g1.scored
                  return 0
                }
                
                const summarizeTopGames = (games, count) => {
                  if (!games.length || !count || count <= 0) return { points: 0, goalDiff: 0 }
                  const sorted = [...games].sort(compareGames)
                  const selected = sorted.slice(0, count)
                  return {
                    points: selected.reduce((sum, g) => sum + g.points, 0),
                    goalDiff: selected.reduce((sum, g) => sum + (g.scored - g.conceded), 0)
                  }
                }
                
                const summaries = teamGames.map(games => summarizeTopGames(games, minGames))
                weightedPoints = summaries.map(s => s.points)
                weightedGoalDiff = summaries.map(s => s.goalDiff)
              }
              
              const maxWPts = Math.max(...weightedPoints)
              let candidates = weightedPoints.map((p,i)=>p===maxWPts?i:-1).filter(i=>i>=0)
              
              // 가중 승점 동점일 때 가중 골득실로 판단
              if (candidates.length > 1) {
                const maxGD = Math.max(...candidates.map(i => weightedGoalDiff[i]))
                leaders = candidates.filter(i => weightedGoalDiff[i] === maxGD)
              } else {
                leaders = candidates
              }
            } else {
              const maxPts = Math.max(...totalPoints)
              let candidates = totalPoints.map((p,i)=>p===maxPts?i:-1).filter(i=>i>=0)
              
              // 승점 동점일 때 골득실로 판단
              if (candidates.length > 1) {
                const maxGD = Math.max(...candidates.map(i => goalDiff[i]))
                leaders = candidates.filter(i => goalDiff[i] === maxGD)
              } else {
                leaders = candidates
              }
            }
            
            currentStats = teamGames.map((games,i)=>({ 
              totalPoints: totalPoints[i], 
              weightedPoints: weightedPoints[i],
              total: totals[i], 
              gp: gamesPlayed[i],
              gamePoints: games.map(g => g.points),
              minGames,
              goalDifference: unequalGP ? weightedGoalDiff[i] : goalDiff[i]
            }))
          } else {
            // 4팀 이상
            const maxQ = Math.max(0, ...quarterScores.map(a=>Array.isArray(a)?a.length:0))
            
            // 매치업 정보가 있으면 승점제, 없으면 골득실
            if (multiFieldMode && gameMatchups && gameMatchups.length > 0) {
              // 먼저 팀들이 구장별로 완전히 분리되어 있는지 확인
              const separation = checkFieldSeparation(gameMatchups, teamCount)
              
              if (separation) {
                // ✅ 구장별로 완전히 분리됨 → 각 구장별로 독립 계산
                const { field1Teams, field2Teams } = separation
                const field1Array = Array.from(field1Teams)
                const field2Array = Array.from(field2Teams)
                
                // 각 구장별 승점 계산
                const calculateFieldStats = (fieldTeams, fieldIdx) => {
                  const teamGamePoints = {}
                  const gamesPlayed = {}
                  const totals = {}
                  fieldTeams.forEach(t => {
                    teamGamePoints[t] = []
                    gamesPlayed[t] = 0
                    totals[t] = 0
                  })
                  
                  for (let qi = 0; qi < maxQ; qi++) {
                    const matchup = gameMatchups[qi]
                    if (!matchup || !Array.isArray(matchup)) continue
                    const pair = matchup[fieldIdx]
                    if (!Array.isArray(pair) || pair.length !== 2) continue
                    const [a, b] = pair
                    if (!fieldTeams.has(a) || !fieldTeams.has(b)) continue
                    
                    const aScore = Number(quarterScores[a]?.[qi] ?? 0)
                    const bScore = Number(quarterScores[b]?.[qi] ?? 0)
                    totals[a] += aScore
                    totals[b] += bScore
                    gamesPlayed[a] += 1
                    gamesPlayed[b] += 1
                    
                    let aPts = 0, bPts = 0
                    if (aScore > bScore) { aPts = 3; bPts = 0 }
                    else if (bScore > aScore) { aPts = 0; bPts = 3 }
                    else { aPts = 1; bPts = 1 }
                    
                    teamGamePoints[a].push(aPts)
                    teamGamePoints[b].push(bPts)
                  }
                  
                  const totalPoints = {}
                  Object.keys(teamGamePoints).forEach(t => {
                    totalPoints[t] = teamGamePoints[t].reduce((a,b) => a+b, 0)
                  })
                  
                  const maxPts = Math.max(...Object.values(totalPoints))
                  const fieldLeaders = Object.keys(totalPoints)
                    .filter(t => totalPoints[t] === maxPts)
                    .map(t => parseInt(t))
                  
                  // 동점일 때 골득실로 판단
                  let finalLeaders = fieldLeaders
                  if (fieldLeaders.length > 1) {
                    const maxGoals = Math.max(...fieldLeaders.map(t => totals[t]))
                    finalLeaders = fieldLeaders.filter(t => totals[t] === maxGoals)
                  }
                  
                  return { leaders: finalLeaders, stats: { teamGamePoints, gamesPlayed, totals, totalPoints } }
                }
                
                const field1Result = calculateFieldStats(field1Teams, 0)
                const field2Result = calculateFieldStats(field2Teams, 1)
                
                // 전체 leaders 배열 (구장별 승자들)
                leaders = [...field1Result.leaders, ...field2Result.leaders]
                
                // currentStats 구성 (모든 팀)
                currentStats = Array.from({ length: teamCount }, (_, i) => {
                  let fieldResult = null
                  let fieldName = ''
                  if (field1Teams.has(i)) {
                    fieldResult = field1Result.stats
                    fieldName = '구장1'
                  } else if (field2Teams.has(i)) {
                    fieldResult = field2Result.stats
                    fieldName = '구장2'
                  }
                  
                  if (!fieldResult) return { totalPoints: 0, total: 0, gp: 0, gamePoints: [], fieldName: '' }
                  
                  return {
                    totalPoints: fieldResult.totalPoints[i] || 0,
                    total: fieldResult.totals[i] || 0,
                    gp: fieldResult.gamesPlayed[i] || 0,
                    gamePoints: fieldResult.teamGamePoints[i] || [],
                    fieldName
                  }
                })
              } else {
                // ❌ 섞임 → 기존 통합 계산 방식
                const teamGamePoints = Array.from({ length: teamCount }, () => [])
                const gamesPlayed = Array.from({ length: teamCount }, () => 0)
                const totals = Array.from({ length: teamCount }, () => 0)
                
                for (let qi = 0; qi < maxQ; qi++) {
                  const matchup = gameMatchups[qi]
                  if (!matchup || !Array.isArray(matchup)) continue
                  
                  for (const pair of matchup) {
                    if (!Array.isArray(pair) || pair.length !== 2) continue
                    const [a, b] = pair
                    if (a === null || b === null || a === undefined || b === undefined || a < 0 || b < 0 || a >= teamCount || b >= teamCount) continue
                    
                    const aScore = Number(quarterScores[a]?.[qi] ?? 0)
                    const bScore = Number(quarterScores[b]?.[qi] ?? 0)
                    totals[a] += aScore
                    totals[b] += bScore
                    gamesPlayed[a] += 1
                    gamesPlayed[b] += 1
                    
                    let aPts = 0, bPts = 0
                    if (aScore > bScore) { aPts = 3; bPts = 0 }
                    else if (bScore > aScore) { aPts = 0; bPts = 3 }
                    else { aPts = 1; bPts = 1 }
                    
                    teamGamePoints[a].push(aPts)
                    teamGamePoints[b].push(bPts)
                  }
                }
                
                const unequalGP = gamesPlayed.some(g => g !== gamesPlayed[0])
                const totalPoints = teamGamePoints.map(pts => pts.reduce((a,b)=>a+b, 0))
                
                let weightedPoints = totalPoints
                let minGames = 0
                if (unequalGP) {
                  minGames = Math.min(...gamesPlayed.filter(g => g > 0))
                  weightedPoints = teamGamePoints.map(pts => {
                    if (pts.length === 0) return 0
                    const sorted = [...pts].sort((a,b) => b - a)
                    return sorted.slice(0, minGames).reduce((a,b) => a + b, 0)
                  })
                  const maxWPts = Math.max(...weightedPoints)
                  const topCandidates = weightedPoints.map((p,i)=>p===maxWPts?i:-1).filter(i=>i>=0)
                  
                  if (topCandidates.length > 1) {
                    const goalDiffs = topCandidates.map(i => totals[i])
                    const maxGoals = Math.max(...goalDiffs)
                    leaders = topCandidates.filter(i => totals[i] === maxGoals)
                  } else {
                    leaders = topCandidates
                  }
                } else {
                  const maxPts = Math.max(...totalPoints)
                  const topCandidates = totalPoints.map((p,i)=>p===maxPts?i:-1).filter(i=>i>=0)
                  
                  if (topCandidates.length > 1) {
                    const goalDiffs = topCandidates.map(i => totals[i])
                    const maxGoals = Math.max(...goalDiffs)
                    leaders = topCandidates.filter(i => totals[i] === maxGoals)
                  } else {
                    leaders = topCandidates
                  }
                }
                
                currentStats = teamGamePoints.map((pts,i)=>({ 
                  totalPoints: totalPoints[i], 
                  weightedPoints: weightedPoints[i],
                  total: totals[i], 
                  gp: gamesPlayed[i],
                  gamePoints: pts,
                  minGames
                }))
              }
            } else {
              // 단일 경기장: 최고 골득실 유지
              currentStats = quarterScores.map((_, teamIdx) => {
                let bestDiff = -Infinity
                let currentTotal = 0
                const quarters = quarterScores[teamIdx] || []
                quarters.forEach((score, qi) => {
                  const qScores = quarterScores.map(t => Number(t[qi] || 0))
                  const myScore = Number(score || 0)
                  currentTotal += myScore
                  const opponentScores = qScores.filter((_, idx) => idx !== teamIdx)
                  const avgOpponent = opponentScores.length > 0 
                    ? opponentScores.reduce((a, b) => a + b, 0) / opponentScores.length 
                    : 0
                  const goalDiff = myScore - avgOpponent
                  if (goalDiff > bestDiff) bestDiff = goalDiff
                })
                return { bestDiff, total: currentTotal }
              })
              const maxBestDiff = Math.max(...currentStats.map(s => s.bestDiff))
              leaders = currentStats.map((s, i) => s.bestDiff === maxBestDiff ? i : -1).filter(i => i >= 0)
            }
          }
          
          return (
            <div className="mb-3 rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold">
                    🏆
                  </div>
                  <span className="text-xs font-bold text-blue-900">{t('matchHistory.matchResults')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isThreeTeams && (()=>{
                    const unequal = currentStats.some(s=>s.gp!==currentStats[0].gp)
                    const minGames = unequal ? Math.min(...currentStats.map(s=>s.gp)) : 0
                    return unequal ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-[10px] text-purple-800" title={t('matchHistory.weightedPointsTooltip', { minGames })}>
                        {t('matchHistory.weightedPoints')}
                      </span>
                    ) : null
                  })()}
                  <div className="text-[10px] text-blue-700 font-medium">
                    {(() => {
                      // 구장별 분리 여부 확인
                      const hasFieldNames = currentStats.some(s => s.fieldName)
                      if (hasFieldNames) {
                        // 구장별로 승자 표시
                        const field1Leaders = leaders.filter(i => currentStats[i]?.fieldName === '구장1')
                        const field2Leaders = leaders.filter(i => currentStats[i]?.fieldName === '구장2')
                        const f1Text = field1Leaders.length > 1 ? t('matchHistory.tied') : `${t('matchHistory.team')} ${field1Leaders[0] + 1}`
                        const f2Text = field2Leaders.length > 1 ? t('matchHistory.tied') : `${t('matchHistory.team')} ${field2Leaders[0] + 1}`
                        return `🏆 ${t('matchHistory.fieldN',{n:1})}: ${f1Text} | ${t('matchHistory.fieldN',{n:2})}: ${f2Text}`
                      }
                      return leaders.length > 1 ? `${t('matchHistory.tied')}!` : `${t('matchHistory.team')}${leaders[0] + 1} ${t('matchHistory.victory')}`
                    })()}
                  </div>
                </div>
              </div>
              
              <div className="space-y-1.5">
                {(() => {
                  // 구장별로 팀 그룹화
                  const hasFieldSeparation = currentStats.some(s => s.fieldName && s.fieldName !== '')
                  
                  if (hasFieldSeparation) {
                        const field1Teams = currentStats.map((s, i) => ({ ...s, index: i })).filter(s => s.fieldName === '구장1')
                        const field2Teams = currentStats.map((s, i) => ({ ...s, index: i })).filter(s => s.fieldName === '구장2')
                    
                    return (
                      <>
                        {/* 구장1 */}
                        <div className="mb-3">
                          <div className="text-xs font-bold text-indigo-700 mb-1 px-2">{t('matchHistory.fieldN',{n:1})}</div>
                          <div className="space-y-1">
                            {field1Teams.map(({ index: ti, ...score }) => {
                              const isLeader = leaders.includes(ti)
                              return (
                                <div 
                                  key={ti} 
                                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg transition-all ${
                                    isLeader 
                                      ? 'bg-amber-50 border border-amber-200 shadow-sm' 
                                      : 'bg-white border border-blue-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[12px] sm:text-sm font-semibold ${isLeader ? 'text-amber-900' : 'text-gray-700'}`}>
                                      {t('matchHistory.team')} {ti + 1}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1 sm:gap-1.5">
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                      {t('matchHistory.points')} {score.totalPoints}
                                    </span>
                                    <span className="text-[11px] text-gray-600">{t('matchHistory.totalGoals',{count: score.total})}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        
                        {/* 구장2 */}
                        <div>
                          <div className="text-xs font-bold text-indigo-700 mb-1 px-2">{t('matchHistory.fieldN',{n:2})}</div>
                          <div className="space-y-1">
                            {field2Teams.map(({ index: ti, ...score }) => {
                              const isLeader = leaders.includes(ti)
                              return (
                                <div 
                                  key={ti} 
                                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg transition-all ${
                                    isLeader 
                                      ? 'bg-amber-50 border border-amber-200 shadow-sm' 
                                      : 'bg-white border border-blue-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[12px] sm:text-sm font-semibold ${isLeader ? 'text-amber-900' : 'text-gray-700'}`}>
                                      {t('matchHistory.team')} {ti + 1}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1 sm:gap-1.5">
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                      {t('matchHistory.points')} {score.totalPoints}
                                    </span>
                                    <span className="text-[11px] text-gray-600">{t('matchHistory.totalGoals',{count: score.total})}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </>
                    )
                  }
                  
                  // 기존 방식 (구장 분리 없음)
                  return currentStats.map((score, ti) => {
                    const isLeader = leaders.includes(ti)
                    
                    return (
                      <div 
                        key={ti} 
                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg transition-all ${
                          isLeader 
                            ? 'bg-amber-50 border border-amber-200 shadow-sm' 
                            : 'bg-white border border-blue-200'
                        }`}
                      >
                                  <div className="flex items-center gap-1">
                          <span className={`text-[12px] sm:text-sm font-semibold ${isLeader ? 'text-amber-900' : 'text-gray-700'}`}>
                            {t('matchHistory.team')} {ti + 1}
                          </span>
                        </div>
                        
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                          {isThreeTeams || (score.totalPoints !== undefined) ? (
                            <>
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                {t('matchHistory.points')} {score.totalPoints}
                              </span>
                              {score.gp && (currentStats.some(s=>s.gp!==currentStats[0].gp)) && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-700" title={t('matchHistory.weightedCalc', { gp: score.gp, minGames: score.minGames, weightedPoints: score.weightedPoints })}>
                                  {t('matchHistory.weightedShort', { points: score.weightedPoints })}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                              (score.bestDiff ?? 0) > 0 ? 'bg-blue-100 text-blue-700' :
                              (score.bestDiff ?? 0) < 0 ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {t('matchHistory.goalDiff')} {(score.bestDiff ?? 0) > 0 ? '+' : ''}{((score.bestDiff ?? 0)).toFixed(1)}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-600">{t('matchHistory.totalGoals',{count: score.total})}</span>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
              
              <div className="mt-2 text-[10px] text-blue-600 text-center">
                {isThreeTeams || (currentStats[0]?.totalPoints !== undefined)
                  ? (currentStats.some(s=>s.gp!==currentStats[0].gp)
                      ? t('matchHistory.weightedPointsInfo', { minGames: currentStats[0].minGames })
                      : t('matchHistory.pointsSystemInfo'))
                  : t('matchHistory.goalDiffInfo')}
              </div>
              {(isThreeTeams || currentStats[0]?.totalPoints !== undefined) && currentStats.some(s=>s.gp!==currentStats[0].gp) && (
                <div className="mt-1 text-[10px] text-purple-700 text-center font-medium">
                  예: T1과 T2가 3경기, T3가 2경기 → 모든 팀의 최고 2경기만 비교
                </div>
              )}
            </div>
          )
        })()
      )}

      {!isDraftMode && hasRecordedScores && displayedQuarterScores && (
        <div className="mb-2 text-[11px] text-gray-600 text-center">
          {t('matchHistory.regularNoDraftImpact')}
        </div>
      )}

      {/* 저장된 게임 점수 표시 (스코어가 하나라도 있을 때만 렌더) */}
      {hasRecordedScores && displayedQuarterScores && (
        (() => {
          const maxQ = Math.max(...displayedQuarterScores.map(a=>Array.isArray(a)?a.length:1))
          const teamTotals = displayedQuarterScores.map(a=>Array.isArray(a)?a.reduce((s,v)=>s+Number(v||0),0):Number(a||0))
          const maxTotal = Math.max(...teamTotals)
          const winners = teamTotals.map((t,i)=>t===maxTotal?i:-1).filter(i=>i>=0)
          const teamCount = displayedQuarterScores.length
          const isMultiTeam = teamCount >= 3 // 3팀 이상 여부
          const isThreeTeams = teamCount === 3
          const isFourPlusWithMatchups = teamCount >= 4 && m?.multiField && m?.gameMatchups && Array.isArray(m.gameMatchups) && m.gameMatchups.length > 0
          
          // 승점 계산 (3팀 또는 4팀+ 매치업 모드)
          const points = (isThreeTeams || isFourPlusWithMatchups) ? (()=>{
            const teamGamePoints = Array.from({ length: teamCount }, () => [])
            const totalPts = Array.from({ length: teamCount }, () => 0)
            const gp = Array.from({ length: teamCount }, () => 0)
            const goalScored = Array.from({ length: teamCount }, () => 0) // 득점
            const goalConceded = Array.from({ length: teamCount }, () => 0) // 실점
            const fieldNames = Array.from({ length: teamCount }, () => '') // 구장 정보
            let teamGames = null // 3팀 경기 게임 정보
            
            if (isThreeTeams) {
              // 3팀: 각 쿼터마다 한 팀이 휴식하고 두 팀만 경기
              teamGames = [[], [], []]
              
              for(let qi=0; qi<maxQ; qi++){
                // 각 쿼터에서 누가 경기하는지 null이 아닌 팀들을 찾기
                const scores = displayedQuarterScores.map((teamScores, ti) => ({
                  teamIdx: ti,
                  score: Array.isArray(teamScores) ? teamScores[qi] : (qi===0 ? teamScores : null)
                }))
                
                // null이 아닌 팀들 찾기 (경기에 참여한 팀들)
                const playingTeams = scores.filter(s => s.score !== null && s.score !== undefined)
                
                if (playingTeams.length === 3) {
                  // 3팀 동시 경기 (배틀로얄): 1위 3점, 2위 1점, 3위 0점
                  
                  // 점수별로 정렬 (높은 순)
                  const sorted = playingTeams
                    .map(t => ({ ...t, score: Number(t.score) }))
                    .filter(t => Number.isFinite(t.score))
                    .sort((a, b) => b.score - a.score)
                  
                  if (sorted.length !== 3) continue
                  
                  // 각 팀의 순위 결정
                  const rankings = sorted.map((team, idx) => {
                    // 동점자 처리: 같은 점수면 같은 순위
                    let rank = 0
                    for (let i = 0; i < idx; i++) {
                      if (sorted[i].score > team.score) rank++
                    }
                    return { ...team, rank }
                  })
                  
                  rankings.forEach(({ teamIdx, score, rank }) => {
                    gp[teamIdx] += 1
                    goalScored[teamIdx] += score
                    
                    // 실점은 다른 2팀의 평균 득점
                    const otherScores = sorted.filter(t => t.teamIdx !== teamIdx).map(t => t.score)
                    const avgConceded = otherScores.reduce((a, b) => a + b, 0) / otherScores.length
                    goalConceded[teamIdx] += avgConceded
                    
                    // 순위별 승점: 1위 3점, 2위 1점, 3위 0점 (동점이면 공동 순위)
                    let pts = 0
                    if (rank === 0) pts = 3  // 1위
                    else if (rank === 1) pts = 1  // 2위
                    else pts = 0  // 3위
                    
                    // 동점자가 있으면 승점 분배
                    const sameRankCount = rankings.filter(r => r.rank === rank).length
                    if (sameRankCount > 1) {
                      // 동점자 처리: 해당 순위들의 평균 승점
                      if (rank === 0) pts = (3 + 1) / 2  // 1-2위 공동: 2점
                      else if (rank === 1) pts = (1 + 0) / 2  // 2-3위 공동: 0.5점
                    }
                    
                    teamGamePoints[teamIdx].push(pts)
                    teamGames[teamIdx].push({ points: pts, scored: score, conceded: avgConceded })
                    totalPts[teamIdx] += pts
                  })
                  
                } else if (playingTeams.length === 2) {
                  // 2팀 대결 (로테이션): 승자 3점, 무승부 1점, 패자 0점
                  const [team1, team2] = playingTeams
                  const a = team1.teamIdx
                  const b = team2.teamIdx
                  const aVal = team1.score
                  const bVal = team2.score
                  
                  const aScore = Number(aVal)
                  const bScore = Number(bVal)
                  if (!Number.isFinite(aScore) || !Number.isFinite(bScore)) continue
                  
                  gp[a]+=1; gp[b]+=1
                  goalScored[a] += aScore
                  goalScored[b] += bScore
                  goalConceded[a] += bScore
                  goalConceded[b] += aScore
                  
                  let aPts = 0, bPts = 0
                  if(aScore>bScore) { aPts=3; bPts=0 }
                  else if(bScore>aScore) { aPts=0; bPts=3 }
                  else { aPts=1; bPts=1 }
                  
                  teamGamePoints[a].push(aPts)
                  teamGamePoints[b].push(bPts)
                  teamGames[a].push({ points: aPts, scored: aScore, conceded: bScore })
                  teamGames[b].push({ points: bPts, scored: bScore, conceded: aScore })
                  totalPts[a]+=aPts
                  totalPts[b]+=bPts
                } else {
                  console.log(`[3Team Skip] Q${qi} skipped - expected 2 or 3 teams, got ${playingTeams.length}`)
                }
              }
            } else if (isFourPlusWithMatchups) {
              // 4팀+: 매치업 기반 - 구장 분리 체크
              const separation = checkFieldSeparation(m.gameMatchups, teamCount)
              
              if (separation) {
                // 구장별 분리됨
                const { field1Teams, field2Teams } = separation
                field1Teams.forEach(t => { fieldNames[t] = '구장1' })
                field2Teams.forEach(t => { fieldNames[t] = '구장2' })
              }
              
              for(let qi=0; qi<maxQ; qi++){
                const matchup = m.gameMatchups[qi]
                if (!matchup || !Array.isArray(matchup)) continue
                
                for (const pair of matchup) {
                  if (!Array.isArray(pair) || pair.length !== 2) continue
                  const [a, b] = pair
                  if (a === null || b === null || a === undefined || b === undefined || a < 0 || b < 0 || a >= teamCount || b >= teamCount) continue
                  
                  const aScore = Number(Array.isArray(displayedQuarterScores[a]) ? (displayedQuarterScores[a][qi] ?? 0) : 0)
                  const bScore = Number(Array.isArray(displayedQuarterScores[b]) ? (displayedQuarterScores[b][qi] ?? 0) : 0)
                  gp[a]+=1; gp[b]+=1
                  goalScored[a] += aScore
                  goalScored[b] += bScore
                  goalConceded[a] += bScore
                  goalConceded[b] += aScore
                  
                  let aPts = 0, bPts = 0
                  if(aScore>bScore) { aPts=3; bPts=0 }
                  else if(bScore>aScore) { aPts=0; bPts=3 }
                  else { aPts=1; bPts=1 }
                  
                  teamGamePoints[a].push(aPts)
                  teamGamePoints[b].push(bPts)
                  totalPts[a]+=aPts
                  totalPts[b]+=bPts
                }
              }
            }
            
            // 골득실 계산 (먼저 계산)
            const goalDifference = goalScored.map((scored, i) => scored - goalConceded[i])
            
            let weightedPts = totalPts.slice()
            let weightedGoalDiff = goalDifference.slice()
            let weightedGoalsScored = goalScored.slice()  // 가중치 득점 추가
            const minGames = Math.min(...gp.filter(g => g > 0))
            const unequalGP = gp.some(v=>v!==gp[0])
            
            if (unequalGP && minGames > 0 && isThreeTeams && teamGames) {
              // 게임 품질 비교: 1) 승점, 2) 골득실, 3) 득점
              const compareGames = (g1, g2) => {
                if (g2.points !== g1.points) return g2.points - g1.points
                const diff2 = g2.scored - g2.conceded
                const diff1 = g1.scored - g1.conceded
                if (diff2 !== diff1) return diff2 - diff1
                if (g2.scored !== g1.scored) return g2.scored - g1.scored
                return 0
              }
              
              const summarizeTopGames = (games, count) => {
                if (!games || !games.length || !count || count <= 0) return { points: 0, goalDiff: 0, goalsScored: 0 }
                const sorted = [...games].sort(compareGames)
                const selected = sorted.slice(0, count)
                return {
                  points: selected.reduce((sum, g) => sum + g.points, 0),
                  goalDiff: selected.reduce((sum, g) => sum + (g.scored - g.conceded), 0),
                  goalsScored: selected.reduce((sum, g) => sum + g.scored, 0)  // 득점 합계 추가
                }
              }
              
              const summaries = teamGames.map(games => summarizeTopGames(games, minGames))
              weightedPts = summaries.map(s => s.points)
              weightedGoalDiff = summaries.map(s => s.goalDiff)
              weightedGoalsScored = summaries.map(s => s.goalsScored)  // 가중치 득점
            } else if (unequalGP && minGames > 0) {
              // 기존 방식 (승점만 정렬)
              weightedPts = teamGamePoints.map(pts => {
                if (pts.length === 0) return 0
                const sorted = [...pts].sort((a,b) => b - a)
                return sorted.slice(0, minGames).reduce((a,b) => a + b, 0)
              })
            }
            
            return { 
              totalPts, 
              weightedPts, 
              gp, 
              minGames, 
              teamGamePoints, 
              goalDifference, 
              weightedGoalDiff,
              goalScored,  // 전체 득점
              weightedGoalsScored,  // 가중치 득점 (최고 경기들만)
              fieldNames 
            }
          })() : null
          
          
          const unequalGP = points ? points.gp.some(v=>v!==points.gp[0]) : false
          
          // Calculate quarter wins for each team
          const allTeamQuarterWins = displayedQuarterScores.map((_, teamIdx) => {
            return Array.from({length: maxQ}).filter((_,qi) => {
              const scores = displayedQuarterScores.map(teamScores => 
                Array.isArray(teamScores) ? (teamScores[qi] ?? 0) : (qi===0 ? (teamScores||0) : 0)
              )
              const maxScore = Math.max(...scores)
              return scores[teamIdx] === maxScore && scores.filter(s => s === maxScore).length === 1
            }).length
          })
          
          // 3팀+: 각 팀의 최고 골득실 계산 (4팀 이상 단일 경기장에만 의미)
          const bestGoalDiffs = (isMultiTeam && !isThreeTeams && !isFourPlusWithMatchups) ? displayedQuarterScores.map((_, teamIdx) => {
            let bestDiff = -Infinity
            for (let qi = 0; qi < maxQ; qi++) {
              const scores = displayedQuarterScores.map(teamScores => 
                Array.isArray(teamScores) ? (teamScores[qi] ?? 0) : (qi===0 ? (teamScores||0) : 0)
              )
              const myScore = scores[teamIdx]
              const opponentScores = scores.filter((_, idx) => idx !== teamIdx)
              const avgOpponent = opponentScores.length > 0 
                ? opponentScores.reduce((a, b) => a + b, 0) / opponentScores.length 
                : 0
              const goalDiff = myScore - avgOpponent
              if (goalDiff > bestDiff) bestDiff = goalDiff
            }
            return bestDiff
          }) : []
          
          // 승자 결정: 3팀 또는 4팀+ 매치업은 승점, 4팀+ 단일 경기장은 최고 골득실
          const bestDiffWinners = (!isMultiTeam || isThreeTeams || isFourPlusWithMatchups) ? [] : (()=>{
            const maxBestDiff = Math.max(...bestGoalDiffs)
            return bestGoalDiffs.map((diff, i) => diff === maxBestDiff ? i : -1).filter(i => i >= 0)
          })()
          
          // 타이브레이커 정보를 추적
          let tiebreakerInfo = { method: null, data: {} }
          
          const pointWinners = (isThreeTeams || isFourPlusWithMatchups) ? (()=>{
            // 구장별 분리 체크
            if (!points) return []
            const hasFieldSeparation = points.fieldNames.some(f => f !== '')
            
            if (hasFieldSeparation) {
              // 구장별로 승자 결정
              const field1Candidates = []
              const field2Candidates = []
              
              for (let i = 0; i < teamCount; i++) {
                if (points.fieldNames[i] === '구장1') field1Candidates.push(i)
                else if (points.fieldNames[i] === '구장2') field2Candidates.push(i)
              }
              
              const getFieldWinners = (candidates) => {
                if (candidates.length === 0) return []
                let topCandidates = []
                if (unequalGP) {
                  const maxWPts = Math.max(...candidates.map(i => points.weightedPts[i]))
                  topCandidates = candidates.filter(i => points.weightedPts[i] === maxWPts)
                } else {
                  const maxPts = Math.max(...candidates.map(i => points.totalPts[i]))
                  topCandidates = candidates.filter(i => points.totalPts[i] === maxPts)
                }
                
                // 1단계 타이브레이커: 골득실
                if (topCandidates.length > 1) {
                  const gdArray = unequalGP ? points.weightedGoalDiff : points.goalDifference
                  const maxGoalDiff = Math.max(...topCandidates.map(i => gdArray[i]))
                  topCandidates = topCandidates.filter(i => gdArray[i] === maxGoalDiff)
                }
                
                // 2단계 타이브레이커: 총 득점 (골득실이 같으면)
                if (topCandidates.length > 1) {
                  const goalsArray = unequalGP ? points.weightedGoalsScored : points.goalScored
                  const maxGoals = Math.max(...topCandidates.map(i => goalsArray[i]))
                  topCandidates = topCandidates.filter(i => goalsArray[i] === maxGoals)
                }
                
                return topCandidates
              }
              
              const field1Winners = getFieldWinners(field1Candidates)
              const field2Winners = getFieldWinners(field2Candidates)
              
              return [...field1Winners, ...field2Winners]
            } else {
              // 통합 승자
              let topCandidates = []
              if (unequalGP) {
                const maxWPts = Math.max(...points.weightedPts)
                topCandidates = points.weightedPts.map((p,i)=>p===maxWPts?i:-1).filter(i=>i>=0)
              } else {
                const maxPts = Math.max(...points.totalPts)
                topCandidates = points.totalPts.map((p,i)=>p===maxPts?i:-1).filter(i=>i>=0)
              }
              
              // 1단계 타이브레이커: 골득실
              if (topCandidates.length > 1) {
                const gdArray = unequalGP ? points.weightedGoalDiff : points.goalDifference
                const maxGoalDiff = Math.max(...topCandidates.map(i => gdArray[i]))
                const beforeGD = topCandidates.length
                topCandidates = topCandidates.filter(i => gdArray[i] === maxGoalDiff)
                
                // 골득실로 결정됨
                if (beforeGD > topCandidates.length && topCandidates.length === 1) {
                  tiebreakerInfo = {
                    method: 'goalDifference',
                    data: { winner: topCandidates[0], gd: gdArray[topCandidates[0]] }
                  }
                }
              }
              
              // 2단계 타이브레이커: 총 득점 (골득실이 같으면)
              if (topCandidates.length > 1) {
                const goalsArray = unequalGP ? points.weightedGoalsScored : points.goalScored
                const maxGoals = Math.max(...topCandidates.map(i => goalsArray[i]))
                const beforeGoals = topCandidates.length
                topCandidates = topCandidates.filter(i => goalsArray[i] === maxGoals)
                
                // 총 득점으로 결정됨
                if (beforeGoals > topCandidates.length && topCandidates.length >= 1) {
                  tiebreakerInfo = {
                    method: 'goalsScored',
                    data: { winners: topCandidates, goalsArray }
                  }
                }
              }
              
              return topCandidates
            }
          })() : []
          
          return (
            <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-gray-700">{t('matchHistory.resultHeader')}</div>
                 <div className="flex items-center gap-2">
                   {/* 승자 표시 */}
                   {(isThreeTeams || isFourPlusWithMatchups) ? (
                     (() => {
                       const hasFieldSeparation = points.fieldNames.some(f => f !== '')
                       if (hasFieldSeparation) {
                         // 구장별 승자 표시
                         const field1Winners = pointWinners.filter(i => points.fieldNames[i] === '구장1')
                         const field2Winners = pointWinners.filter(i => points.fieldNames[i] === '구장2')
                         const f1Text = field1Winners.length > 1 ? t('matchHistory.tied') : field1Winners.length === 1 ? t('matchHistory.teamN', { n: field1Winners[0] + 1 }) : '-'
                         const f2Text = field2Winners.length > 1 ? t('matchHistory.tied') : field2Winners.length === 1 ? t('matchHistory.teamN', { n: field2Winners[0] + 1 }) : '-'
                         return (
                           <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300">
                             <span className="text-amber-600 text-xs">🏆</span>
                             <span className="text-xs font-bold text-amber-900">{t('matchHistory.field1')}: {f1Text} | {t('matchHistory.field2')}: {f2Text}</span>
                           </div>
                         )
                       }
                       // 통합 승자 표시
                       if (pointWinners.length === 1) {
                         return (
                           <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300">
                             <span className="text-amber-600 text-xs">🏆</span>
                             <span className="text-xs font-bold text-amber-900">{t('matchHistory.teamWin',{ n: pointWinners[0] + 1 })}</span>
                           </div>
                         )
                       } else if (pointWinners.length > 1) {
                         return (
                           <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 border border-gray-300">
                             <span className="text-xs font-bold text-gray-700">
                               {t('matchHistory.teamsDraw',{ teams: pointWinners.map(i => `${t('matchHistory.team')} ${i + 1}`).join(', ') })}
                             </span>
                           </div>
                         )
                       } else {
                         return null
                       }
                     })()
                   ) : isMultiTeam ? (
                     bestDiffWinners.length === 1 ? (
                       <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300">
                         <span className="text-amber-600 text-xs">🏆</span>
                         <span className="text-xs font-bold text-amber-900">{t('matchHistory.teamWin',{ n: bestDiffWinners[0] + 1 })}</span>
                       </div>
                     ) : bestDiffWinners.length > 1 ? (
                       <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 border border-gray-300">
                         <span className="text-xs font-bold text-gray-700">
                           {t('matchHistory.teamsDraw',{ teams: bestDiffWinners.map(i => `${t('matchHistory.team')} ${i + 1}`).join(', ') })}
                         </span>
                       </div>
                     ) : null
                   ) : (
                     winners.length === 1 ? (
                       <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300">
                         <span className="text-amber-600 text-xs">🏆</span>
                         <span className="text-xs font-bold text-amber-900">{t('matchHistory.teamWin',{ n: winners[0] + 1 })}</span>
                       </div>
                     ) : winners.length > 1 ? (
                       <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 border border-gray-300">
                         <span className="text-xs font-bold text-gray-700">
                           {t('matchHistory.teamsDraw',{ teams: winners.map(i => `${t('matchHistory.team')} ${i + 1}`).join(', ') })}
                         </span>
                       </div>
                     ) : null
                   )}
                   <div className="text-[10px] text-gray-500">
                     <span className="inline-flex items-center gap-1">
                       <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      {(isThreeTeams || isFourPlusWithMatchups) ? (unequalGP ? t('matchHistory.weightedPointsShort') : t('matchHistory.points')) : (isMultiTeam ? t('matchHistory.bestGoalDiff') : t('matchHistory.gameWins'))}
                     </span>
                     {(isThreeTeams || isFourPlusWithMatchups) && unequalGP && (
                       <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-purple-800" title={t('matchHistory.compareTopMatches', { minGames: points.minGames })}>
                         {t('matchHistory.weightedPointsAppliedBadge')}
                       </span>
                     )}
                   </div>
                 </div>
              </div>              {/* 컬럼 헤더 */}
              {/* Responsive scoreboard header: wrap when narrow to avoid horizontal scroll */}
              <div className="overflow-x-auto -mx-2 px-2 pb-1">
                <div className="min-w-max">
                  <div className="flex flex-nowrap items-center justify-between text-[10px] sm:text-[11px] text-gray-600 mb-1 px-2 gap-y-0.5 gap-x-0.5">
                    <span className="min-w-[52px] flex-shrink-0 pr-0.5">{t('matchHistory.team')}</span>
                    <div className="flex flex-nowrap items-center gap-0.5 sm:gap-1">
                      <div className="flex gap-0.5 sm:gap-1">
                    {Array.from({length:maxQ}).map((_,qi)=>(
                      <span key={qi} className="w-[22px] sm:w-[26px] text-center font-medium">G{qi+1}</span>
                    ))}
                  </div>
                  {(isThreeTeams || isFourPlusWithMatchups) && <span className="w-8 sm:w-9 text-center">{t('matchHistory.points')}</span>}
                  {(isThreeTeams || isFourPlusWithMatchups) && unequalGP && <span className="w-10 sm:w-11 text-center">{t('matchHistory.weightedShort',{ points: '' }).trim() || t('matchHistory.points')}</span>}
                  {(isThreeTeams || isFourPlusWithMatchups) && <span className="w-10 sm:w-11 text-center">{t('matchHistory.goalDiff')}</span>}
                  {(!isMultiTeam) && <span className="w-6 sm:w-7 text-center">{t('matchHistory.victory')}</span>}
                  {(!isThreeTeams && !isFourPlusWithMatchups && isMultiTeam) && <span className="w-10 sm:w-11 text-center">{t('matchHistory.bestGoalDiff')}</span>}
                  <span className="w-8 text-right">{t('matchHistory.total')}</span>
                </div>
              </div>
              
              <div className="space-y-1">
                {(() => {
                  // 구장별로 팀 그룹화
                  const hasFieldSeparation = points && points.fieldNames && points.fieldNames.some(f => f !== '')
                  
                  if (hasFieldSeparation) {
                    // 구장별로 팀 분리
                    const field1Indices = []
                    const field2Indices = []
                    
                    displayedQuarterScores.forEach((arr, ti) => {
                      if (points.fieldNames[ti] === '구장1') field1Indices.push(ti)
                      else if (points.fieldNames[ti] === '구장2') field2Indices.push(ti)
                    })
                    
                    const renderTeamRow = (ti, fieldColor) => {
                      const arr = displayedQuarterScores[ti]
                      const teamTotal = teamTotals[ti]
                      
                      // 승/무/패 결정 (구장별) - 같은 구장 내에서만 비교
                      let matchResult = null
                      const myField = points.fieldNames[ti]
                      const myFieldWinners = pointWinners.filter(i => points.fieldNames[i] === myField)
                      
                      if (myFieldWinners.includes(ti)) {
                        matchResult = myFieldWinners.length === 1 ? 'W' : 'D'
                      } else {
                        matchResult = 'L'
                      }
                      
                      const isWinner = pointWinners.includes(ti)
                      const totalPts = points.totalPts[ti]
                      const thisWeightedPts = unequalGP ? points.weightedPts[ti] : 0
                      
                      // 쿼터 승리 표시: 구장 분리 시에는 같은 구장 팀끼리만 비교해야 함 (기존에는 전체 팀 비교 -> 버그)
                      const wonQuarters = Array.from({length: maxQ}).map((_, qi) => {
                        const myFieldTeams = points.fieldNames.map((f, idx) => f === myField ? idx : -1).filter(idx => idx >= 0)
                        if (myFieldTeams.length === 0) return false
                        // 같은 구장 팀들의 해당 쿼터 점수만 추출
                        const fieldScores = myFieldTeams.map(tidx => {
                          const teamScores = displayedQuarterScores[tidx]
                          return Array.isArray(teamScores) ? (teamScores[qi] ?? 0) : (qi === 0 ? (teamScores || 0) : 0)
                        })
                        const myScore = Array.isArray(displayedQuarterScores[ti]) ? (displayedQuarterScores[ti][qi] ?? 0) : (qi === 0 ? (displayedQuarterScores[ti] || 0) : 0)
                        const maxFieldScore = Math.max(...fieldScores)
                        return myScore === maxFieldScore && fieldScores.filter(s => s === maxFieldScore).length === 1
                      })
                      
                      return (
                        <div key={ti} className={`flex items-center justify-between text-xs sm:text-sm py-1.5 sm:py-2 px-2 rounded border-l-4 ${
                          isWinner 
                            ? `bg-amber-50 font-medium ${fieldColor}` 
                            : `bg-white ${fieldColor}`
                        }`}>
                          <div className="w-24 flex-shrink-0 flex items-center gap-1">
                            <span className="font-semibold whitespace-nowrap">{t('matchHistory.teamN', { n: ti+1 })}</span>
                            {matchResult && (
                              <span className={`inline-flex items-center justify-center w-5 h-5 flex-shrink-0 rounded text-[10px] font-bold ${
                                matchResult === 'W' ? 'bg-blue-500 text-white' :
                                matchResult === 'D' ? 'bg-gray-400 text-white' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {matchResult}
                              </span>
                            )}
                            {isWinner && <span className="text-amber-600 flex-shrink-0">🏆</span>}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="flex gap-1">
                              {Array.from({length:maxQ}).map((_,qi)=>{
                                const v = Array.isArray(arr) ? arr[qi] : (qi===0? (arr||0) : 0)
                                // null인 경우 빈 칸 또는 대시 표시
                                if (v === null) {
                                  return (
                                    <div key={qi} className="w-6 text-center text-xs text-gray-400 relative">
                                      <span>–</span>
                                    </div>
                                  )
                                }
                                const numV = Number(v ?? 0)
                                const wonThisQuarter = wonQuarters[qi]
                                
                                return (
                                  <div key={qi} className="w-6 sm:w-7 text-center text-xs text-gray-700 relative">
                                    <span className={wonThisQuarter ? 'font-semibold' : ''}>{numV}</span>
                                    {wonThisQuarter && (
                                      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="w-9 sm:w-10 text-center">
                              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">
                                {totalPts}
                              </span>
                            </div>
                            {unequalGP && (
                              <div className="w-11 sm:w-12 text-center">
                                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700" title={`가중 승점: ${thisWeightedPts}점 (각 팀의 최고 ${points.minGames}경기)`}>
                                  {thisWeightedPts}
                                </span>
                              </div>
                            )}
                            <div className="w-11 sm:w-12 text-center">
                              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold ${
                                points && (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) > 0 ? 'bg-blue-100 text-blue-700' : 
                                points && (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) < 0 ? 'bg-red-100 text-red-700' : 
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {points && (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) > 0 ? '+' : ''}{points ? (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) : 0}
                              </span>
                            </div>
                            <div className="w-8 text-right text-sm font-semibold">{teamTotal}</div>
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <div>
                        {/* 구장1 팀들 */}
                        {field1Indices.length > 0 && (
                          <div className="mb-2">
                            <div className="text-xs font-bold text-indigo-700 mb-1 px-2">🏟️ 구장 1</div>
                            {field1Indices.map(ti => renderTeamRow(ti, 'border-indigo-400'))}
                          </div>
                        )}
                        
                        {/* 구장2 팀들 */}
                        {field2Indices.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-purple-700 mb-1 px-2">🏟️ 구장 2</div>
                            {field2Indices.map(ti => renderTeamRow(ti, 'border-purple-400'))}
                          </div>
                        )}
                      </div>
                    )
                  }
                  
                  // 기존 방식 (구장 분리 없음)
                  return (
                    <>
                      {displayedQuarterScores.map((arr,ti)=>{
                  const teamTotal = teamTotals[ti]
                  
                  // 승/무/패 결정 - pointWinners 재사용 (모든 타이브레이커 포함)
                  let matchResult = null // 'W', 'D', 'L'
                  if (isThreeTeams || isFourPlusWithMatchups) {
                    // pointWinners가 이미 모든 타이브레이커를 적용했으므로 직접 사용
                    if (pointWinners.includes(ti)) {
                      matchResult = pointWinners.length === 1 ? 'W' : 'D'  // 단독 승자 또는 공동 우승
                    } else {
                      matchResult = 'L'  // 패배
                    }
                  } else if (isMultiTeam) {
                    // 최고 골득실 기반 (4팀+ 단일 경기장)
                    const maxBestDiff = Math.max(...bestGoalDiffs)
                    const topTeams = bestGoalDiffs.map((d, i) => d === maxBestDiff ? i : -1).filter(i => i >= 0)
                    
                    if (topTeams.length > 1 && topTeams.includes(ti)) {
                      matchResult = 'D'
                    } else if (topTeams.length === 1 && topTeams.includes(ti)) {
                      matchResult = 'W'
                    } else {
                      matchResult = 'L'
                    }
                  } else {
                    // 2팀 게임 승수 기반
                    const maxTotal = Math.max(...teamTotals)
                    const topTeams = teamTotals.map((t, i) => t === maxTotal ? i : -1).filter(i => i >= 0)
                    
                    if (topTeams.length > 1 && topTeams.includes(ti)) {
                      matchResult = 'D'
                    } else if (topTeams.length === 1 && topTeams.includes(ti)) {
                      matchResult = 'W'
                    } else {
                      matchResult = 'L'
                    }
                  }
                  
                  const isWinner = (isThreeTeams || isFourPlusWithMatchups)
                    ? pointWinners.includes(ti)  // 공동 우승 포함
                    : (isMultiTeam 
                        ? bestDiffWinners.includes(ti)  // 공동 우승 포함
                        : winners.includes(ti))  // 공동 우승 포함
                  const quarterWins = allTeamQuarterWins[ti]
                  const bestDiff = (!isThreeTeams && !isFourPlusWithMatchups && isMultiTeam) ? bestGoalDiffs[ti] : 0
                  const totalPts = (isThreeTeams || isFourPlusWithMatchups) && points ? points.totalPts[ti] : 0
                  const thisWeightedPts = (isThreeTeams || isFourPlusWithMatchups) && points && unequalGP ? points.weightedPts[ti] : 0
                  
                  // Calculate which quarters this team won
                  const wonQuarters = Array.from({length: maxQ}).map((_,qi) => {
                    const scores = displayedQuarterScores.map(teamScores => 
                      Array.isArray(teamScores) ? (teamScores[qi] ?? 0) : (qi===0 ? (teamScores||0) : 0)
                    )
                    const maxScore = Math.max(...scores)
                    return scores[ti] === maxScore && scores.filter(s => s === maxScore).length === 1
                  })
                  
                  // 각 게임의 골득실 계산 (3팀+용)
                  const quarterGoalDiffs = (!isThreeTeams && isMultiTeam) ? Array.from({length: maxQ}).map((_,qi) => {
                    const scores = displayedQuarterScores.map(teamScores => 
                      Array.isArray(teamScores) ? (teamScores[qi] ?? 0) : (qi===0 ? (teamScores||0) : 0)
                    )
                    const myScore = scores[ti]
                    const opponentScores = scores.filter((_, idx) => idx !== ti)
                    const avgOpponent = opponentScores.length > 0 
                      ? opponentScores.reduce((a, b) => a + b, 0) / opponentScores.length 
                      : 0
                    return myScore - avgOpponent
                  }) : []
                  
                  return (
                    <div key={ti} className={`flex items-center justify-between text-xs sm:text-sm py-1.5 sm:py-2 px-2 rounded ${isWinner ? 'bg-amber-100 font-medium' : 'bg-white'}`}> 
                      <div className="w-16 min-w-[56px] flex-shrink-0 flex items-center gap-1">
                        <span className="whitespace-nowrap">{t('matchHistory.teamN', { n: ti+1 })}</span>
                        {points && points.fieldNames[ti] && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium whitespace-nowrap flex-shrink-0">
                            {points.fieldNames[ti] === '구장1' ? t('matchHistory.field1') : points.fieldNames[ti] === '구장2' ? t('matchHistory.field2') : points.fieldNames[ti]}
                          </span>
                        )}
                        {matchResult && (
                          <span className={`inline-flex items-center justify-center w-5 h-5 flex-shrink-0 rounded text-[10px] font-bold ${
                            matchResult === 'W' ? 'bg-blue-500 text-white' :
                            matchResult === 'D' ? 'bg-gray-400 text-white' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {matchResult}
                          </span>
                        )}
                        {/* Trophy marker removed to save horizontal space */}
                      </div>
                      <div className="flex items-center gap-0.5 sm:gap-1">
                        <div className="flex gap-0.5 sm:gap-1">
                          {Array.from({length:maxQ}).map((_,qi)=>{
                            const v = Array.isArray(arr) ? arr[qi] : (qi===0? (arr||0) : 0)
                            // null인 경우 대시 표시
                            if (v === null) {
                              return (
                                <div key={qi} className="w-[22px] sm:w-[26px] text-center text-xs text-gray-400 relative">
                                  <span>–</span>
                                </div>
                              )
                            }
                            const numV = Number(v ?? 0)
                            const wonThisQuarter = wonQuarters[qi]
                            const qDiff = (!isThreeTeams && isMultiTeam) ? quarterGoalDiffs[qi] : 0
                            const isBestQuarter = (!isThreeTeams && isMultiTeam) && Math.abs(qDiff - bestDiff) < 0.01
                            
                            return (
                              <div key={qi} className="w-[22px] sm:w-[26px] text-center text-xs text-gray-700 relative">
                                <span className={wonThisQuarter || isBestQuarter ? 'font-semibold' : ''}>{numV}</span>
                                {(!isThreeTeams && isMultiTeam) ? (
                                  isBestQuarter && (
                                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                  )
                                ) : (
                                  wonThisQuarter && (
                                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                  )
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {(isThreeTeams || isFourPlusWithMatchups) ? (
                          <>
                            <div className="w-8 sm:w-9 text-center">
                              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700`}>
                                {totalPts}
                              </span>
                            </div>
                            {unequalGP && (
                              <div className="w-10 sm:w-11 text-center">
                                <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700`} title={`가중 승점: ${thisWeightedPts}점 (각 팀의 최고 ${points.minGames}경기)`}>
                                  {thisWeightedPts}
                                </span>
                              </div>
                            )}
                            <div className="w-10 sm:w-11 text-center">
                              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold ${
                                points && (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) > 0 ? 'bg-blue-100 text-blue-700' : 
                                points && (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) < 0 ? 'bg-red-100 text-red-700' : 
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {points && (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) > 0 ? '+' : ''}{points ? (unequalGP ? points.weightedGoalDiff[ti] : points.goalDifference[ti]) : 0}
                              </span>
                            </div>
                          </>
                        ) : (isMultiTeam ? (
                          <div className="w-10 sm:w-11 text-center">
                            <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold ${
                              bestDiff > 0 ? 'bg-blue-100 text-blue-700' : 
                              bestDiff < 0 ? 'bg-red-100 text-red-700' : 
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {bestDiff > 0 ? '+' : ''}{bestDiff.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <div className="w-6 sm:w-7 text-center">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold ${quarterWins > 0 ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400'}`}>
                              {quarterWins}
                            </span>
                          </div>
                        ))}
                        <span className="font-semibold w-8 text-right">{teamTotal}</span>
                      </div>
                    </div>
                  )
                      })}
                    </>
                  )
                })()}
              </div>
                </div>
              </div>
              
              {/* 하단 설명 */}
              {isThreeTeams && (
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                  {/* 가중 승점 안내 */}
                  <div className="text-[10px] text-gray-600 text-center">
                    {unequalGP ? (
                      <>
                        <div>{t('matchHistory.weightedGamesNote', { minGames: points.minGames })}</div>
                        <div className="mt-0.5 text-purple-600 font-medium">
                          {t('matchHistory.weightedGamesExample')}
                        </div>
                      </>
                    ) : (
                      <div>{t('matchHistory.pointsSystemInfo')}</div>
                    )}
                  </div>
                  
                  {/* 타이브레이커 규칙 - 실제로 발동되었을 때만 표시 */}
                  {(tiebreakerInfo.method === 'goalDifference' || tiebreakerInfo.method === 'goalsScored') && (
                    <div className="text-[10px] bg-blue-50 rounded px-2 py-1.5 border border-blue-100">
                      <div className="text-gray-700 text-center">
                        {tiebreakerInfo.method === 'goalsScored' && (
                          <span>🎯 {t('matchHistory.decidedByGoalsScored')}</span>
                        )}
                        {tiebreakerInfo.method === 'goalDifference' && (
                          <span>📊 {t('matchHistory.decidedByGoalDiff')}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()
      )}

      {hasGameEvents && (
        <div className="mt-3 mb-4 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-sky-900">{t('matchHistory.gameEventsTitle')}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGameEvents(v => !v)}
                className="rounded border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100"
              >{showGameEvents ? t('matchHistory.collapse') : t('matchHistory.expand')}</button>
            </div>
          </div>

          {showGameEvents && (
            <div className="mt-2 space-y-3">
              {groupedGameEvents.map((evs, gi) => {
                const kitPalette = [
                  { bg: '#f8fafc', text: '#0f172a', border: '#0f172a', label: 'White' },
                  { bg: '#0f172a', text: '#ffffff', border: '#0b1220', label: 'Black' },
                  { bg: '#2563eb', text: '#ffffff', border: '#1d4ed8', label: 'Blue' },
                  { bg: '#dc2626', text: '#ffffff', border: '#b91c1c', label: 'Red' },
                  { bg: '#6dff2e', text: '#0f172a', border: '#5ce625', label: 'Green' },
                  { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9', label: 'Purple' },
                  { bg: '#ea580c', text: '#ffffff', border: '#c2410c', label: 'Orange' },
                  { bg: '#0d9488', text: '#ffffff', border: '#0f766e', label: 'Teal' },
                  { bg: '#ec4899', text: '#ffffff', border: '#db2777', label: 'Pink' },
                  { bg: '#facc15', text: '#0f172a', border: '#eab308', label: 'Yellow' }
                ]
                const getTeamColor = (ti) => {
                  if (Array.isArray(m?.teamColors) && m.teamColors[ti] && typeof m.teamColors[ti] === 'object') return m.teamColors[ti]
                  return kitPalette[ti % kitPalette.length]
                }

                return (
                <div
                  key={gi}
                  className={`relative rounded-2xl border border-sky-100 bg-white/90 px-3 pb-2.5 pt-8 shadow-sm ${gi === 0 ? 'mt-3' : 'mt-4'}`}
                >
                  <div className="absolute left-0 top-0 -translate-x-1 -translate-y-1/2 inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50/95 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sky-900 shadow-sm">
                    <span>{t('matchHistory.gameNumber', { n: gi + 1 })}</span>
                  </div>
                  {(() => {
                    const scoreMeta = perGameScores[gi]
                    if (!scoreMeta) return null
                    const { scores, winners, isDraw, teamMap } = scoreMeta

                    const badges = Array.from({ length: scores?.length || 0 }, (_, idx) => {
                      const originalIdx = Array.isArray(teamMap) ? teamMap[idx] : idx
                      const color = getTeamColor(originalIdx)
                      const label = color?.label || t('matchHistory.teamN', { n: (originalIdx ?? idx) + 1 })
                      const isWinner = !isDraw && winners.includes(idx)
                      return { color, label, score: Number(scores?.[idx] ?? 0), isWinner }
                    })

                    const findCaptainPlayer = (teamIdx) => {
                      const originalIdx = Array.isArray(teamMap) ? teamMap[teamIdx] : teamIdx
                      const capId = Array.isArray(captainIds) ? captainIds[originalIdx] : null
                      if (!capId) return null
                      const teamList = Array.isArray(draftTeams?.[originalIdx]) ? draftTeams[originalIdx] : []
                      return teamList.find(p => String(p.id) === String(capId)) || null
                    }

                    const labelForTeam = (teamIdx) => {
                      const originalIdx = Array.isArray(teamMap) ? teamMap[teamIdx] : teamIdx
                      const captain = findCaptainPlayer(teamIdx)
                      if (captain?.name) return `Team ${captain.name}`
                      return badges[teamIdx]?.label || t('matchHistory.teamN', { n: (originalIdx ?? teamIdx) + 1 })
                    }

                    const renderCaptainAvatar = (teamIdx) => {
                      const player = findCaptainPlayer(teamIdx)
                      if (!player) return null
                      const tint = badges?.[teamIdx]?.color || {}
                      const isWhiteTeam = (tint.label || '').toLowerCase() === 'white' || (tint.bg || '').toLowerCase() === '#f8fafc'
                      const ring = isWhiteTeam ? '#ffffff' : (tint.border || tint.bg || '#0f172a')
                      const originalIdx = Array.isArray(teamMap) ? teamMap[teamIdx] : teamIdx
                      const innerBg = '#fff'
                      return (
                        <div
                          key={`cap-${teamIdx}`}
                          className="relative flex items-center justify-center shrink-0"
                          style={{ width: 32, height: 32 }}
                          aria-label={`${t('matchHistory.teamN', { n: (originalIdx ?? teamIdx) + 1 })} captain`}
                        >
                          <span
                            className="absolute inset-0 rounded-full border-2 shadow-sm"
                            style={{ background: ring, borderColor: ring }}
                            aria-hidden="true"
                          />
                          <span
                            className="absolute inset-[3px] rounded-full border border-white/70"
                            style={{ background: innerBg }}
                            aria-hidden="true"
                          />
                          <InitialAvatar
                            id={player.id}
                            name={player.name}
                            photoUrl={player.photoUrl}
                            size={22}
                            className="relative border border-white/80"
                          />
                        </div>
                      )
                    }

                    const matchupsForGame = Array.isArray(m?.gameMatchups) ? m.gameMatchups[gi] : null
                    const hasFieldMatchups = Array.isArray(matchupsForGame) && matchupsForGame.some(pair => Array.isArray(pair) && pair.some(v => v !== null && v !== undefined))
                    const teamCount = badges.length
                    const playingTeams = (() => {
                      if (!Array.isArray(displayedQuarterScores)) return []
                      return displayedQuarterScores.map((teamScores, ti) => {
                        if (Array.isArray(teamScores)) return teamScores[gi]
                        if (gi === 0) return teamScores
                        return null
                      }).map((v, ti) => ({ v, ti }))
                        .filter(({ v }) => v !== null && v !== undefined)
                        .map(({ ti }) => ti)
                    })()
                    const renderTeamChip = (b) => {
                      const style = {
                        backgroundColor: b.color?.bg,
                        color: b.color?.text,
                        borderColor: b.color?.border || b.color?.bg
                      }
                      return (
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shadow-sm" style={style}>
                          <span
                            className="h-2 w-2 rounded-full border border-white/60"
                            style={{ backgroundColor: b.color?.text || '#0f172a' }}
                            aria-hidden="true"
                          />
                          <span className="text-[10px] font-semibold">{b.label}</span>
                          <span className="text-[11px] font-bold">{b.score}</span>
                        </span>
                      )
                    }

                    const jerseySwatch = (bVal) => {
                      const label = (bVal?.color?.label || '').toLowerCase()
                      const baseColor = bVal?.color?.bg || bVal?.color?.border || bVal?.color?.text || '#0f172a'
                      const isWhite = label === 'white'
                      const isBlack = label === 'black'
                      const fill = isWhite ? '#ffffff' : (isBlack ? '#0f172a' : baseColor)
                      const stroke = isWhite
                        ? '#0f172a'
                        : (isBlack ? '#ffffff' : 'rgba(0,0,0,0.38)')
                      const strokeW = isWhite ? 16 : (isBlack ? 16 : 12)

                      return (
                        <svg
                          width={20}
                          height={20}
                          viewBox="0 0 969.982 969.982"
                          aria-hidden="true"
                          className="drop-shadow-sm"
                        >
                          <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round">
                            <path d="M937.031,250.555c-21.249-9.669-42.856-19.473-63.752-28.955c-40.639-18.439-82.662-37.507-123.886-56.416
                              c-7.768-3.562-15.452-7.376-23.589-11.414c-32.479-16.116-69.289-34.382-112.309-34.382h-24.032
                              c-9.62,0-18.902,3.651-26.139,10.282c-5.699,5.223-9.85,11.987-12.004,19.56c-0.424,1.492-4.271,6.993-15.981,12.504
                              c-13.478,6.343-31.194,9.837-49.89,9.837s-36.413-3.494-49.89-9.837c-11.71-5.511-15.558-11.012-15.981-12.504
                              c-2.153-7.572-6.304-14.337-12.004-19.561c-7.235-6.63-16.518-10.282-26.138-10.282h-24.035
                              c-45.053,0-85.888,20.228-121.917,38.074c-10.214,5.06-19.862,9.838-29.321,14.056c-26.528,11.827-53.271,24.134-79.133,36.037
                              c-20.479,9.425-41.656,19.171-62.506,28.576c-5.352,2.414-10.726,4.885-15.923,7.275c-5.125,2.356-10.424,4.793-15.6,7.127
                              c-28.17,12.706-40.753,45.961-28.049,74.132l48.462,107.458c9.044,20.053,29.104,33.01,51.105,33.01
                              c7.979,0,15.726-1.669,23.026-4.962l0.525-0.236l0.516-0.258l53.535-26.664V760.42c0,15.051,6.94,36.486,40.003,53.125
                              c16.869,8.488,40.303,15.705,69.649,21.449c51.413,10.061,120.193,15.602,193.674,15.602c73.479,0,142.261-5.541,193.674-15.602
                              c29.347-5.744,52.78-12.959,69.649-21.449c33.062-16.639,40.003-38.074,40.003-53.125V432.662l52.291,26.848l0.676,0.348
                              l0.693,0.312c7.3,3.292,15.047,4.962,23.025,4.962c22.001,0,42.062-12.958,51.105-33.01l48.462-107.457
                              C977.728,296.51,965.166,263.278,937.031,250.555z" />
                            <path d="M937.684,312.331l-48.463,107.457c-4.346,9.637-13.829,15.344-23.757,15.344
                              c-3.58,0-7.217-0.741-10.691-2.309l-95.994-49.286V760.42c0,40.117-136.664,60.176-273.327,60.176s-273.327-20.059-273.327-60.176
                              V384.555l-96.91,48.268c-3.476,1.567-7.112,2.309-10.692,2.309c-9.927,0-19.411-5.707-23.757-15.344L32.301,312.331
                              c-5.914-13.113-0.078-28.537,13.035-34.45c10.526-4.747,20.993-9.653,31.525-14.403c47.267-21.321,94.162-43.445,141.52-64.559
                              c43.683-19.476,89.679-49.529,139.021-49.53c0.001,0,24.034,0,24.034,0c4.503,0,8.055,3.717,9.287,8.048
                              c7.108,24.999,46.812,44.135,94.728,44.135s87.618-19.136,94.729-44.135c1.231-4.332,4.783-8.048,9.286-8.048h24.032
                              c45.275,0,83.509,24.772,123.389,43.064c62.499,28.667,125.178,56.948,187.763,85.427
                              C937.761,283.793,943.596,299.218,937.684,312.331z" />
                            <path d="M561.662,387.069c0,21.831,17.697,42.614,39.528,42.614s39.527-20.783,39.527-42.614v-30.276h-79.056V387.069z" />
                            <path d="M647.68,311.997H554.7c-22.056,0-40,17.944-40,40v33.27c0,22.443,8.814,45.174,24.182,62.361
                              c7.839,8.768,16.962,15.736,27.117,20.713c11.179,5.479,23.021,8.259,35.192,8.259s24.013-2.778,35.191-8.259
                              c10.155-4.977,19.278-11.945,27.117-20.713c15.368-17.188,24.183-39.918,24.183-62.361v-33.27
                              C687.68,329.941,669.737,311.997,647.68,311.997z" />
                          </g>
                        </svg>
                      )
                    }

                    const winnerLabel = (!isDraw && winners.length === 1)
                      ? labelForTeam(winners[0])
                      : null
                    const resultLabel = isDraw
                      ? t('matchHistory.gameDraw')
                      : (winnerLabel ? t('matchHistory.gameWin', { team: winnerLabel }) : null)

                    if (badges.length === 2) {
                      const dot = (b) => jerseySwatch(b)

                      return (
                        <div className="mt-1 w-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-3 py-2 shadow-inner">
                          <div className="flex items-center justify-center gap-2 sm:gap-3">
                            {renderCaptainAvatar(0)}
                            {dot(badges[0])}
                            <div className="flex items-baseline gap-1 text-slate-900">
                              <span className="text-2xl sm:text-3xl font-black leading-none">{badges[0].score}</span>
                              <span className="text-sm font-bold text-slate-400">-</span>
                              <span className="text-2xl sm:text-3xl font-black leading-none">{badges[1].score}</span>
                            </div>
                            {dot(badges[1])}
                            {renderCaptainAvatar(1)}
                          </div>
                          {resultLabel && (
                            <div className="mt-1 flex justify-center">
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-amber-700">
                                {resultLabel}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    }

                    // 멀티 필드 매치업(4팀 이상) - 구장별로 명확히 표시
                    if (hasFieldMatchups) {
                      const renderFieldLabel = (idx) => {
                        if (idx === 0) return t('matchHistory.field1')
                        if (idx === 1) return t('matchHistory.field2')
                        return `Field ${idx + 1}`
                      }

                      return (
                        <div className="flex flex-col gap-1.5 text-[11px] font-semibold text-gray-800 w-full">
                          {matchupsForGame.map((pair, fieldIdx) => {
                            if (!Array.isArray(pair) || pair.length === 0) return null
                            const validTeams = pair.filter(ti => ti !== null && ti !== undefined && ti >= 0 && ti < teamCount)
                            if (validTeams.length === 0) return null
                            return (
                              <div key={`${gi}-field-${fieldIdx}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 shadow-sm">
                                <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                                  {renderFieldLabel(fieldIdx)}
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {validTeams.map((ti, idx) => {
                                    const b = badges[ti]
                                    const style = {
                                      backgroundColor: b.color?.bg,
                                      color: b.color?.text,
                                      borderColor: b.color?.border || b.color?.bg
                                    }
                                    return (
                                      <React.Fragment key={`${gi}-field-${fieldIdx}-team-${ti}`}>
                                        {idx > 0 && <span className="text-slate-400 font-bold">vs</span>}
                                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shadow-sm" style={style}>
                                          <span
                                            className="h-2 w-2 rounded-full border border-white/60"
                                            style={{ backgroundColor: b.color?.text || '#0f172a' }}
                                            aria-hidden="true"
                                          />
                                          <span className="text-[10px] font-semibold">{b.label}</span>
                                          <span className="text-[11px] font-bold">{b.score}</span>
                                        </span>
                                      </React.Fragment>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    }

                      // 3팀 경기: 실제 매치업 + 순위/점수
                      if (teamCount === 3) {
                        const sorted = badges
                          .map((b, idx) => ({ ...b, teamIdx: idx }))
                          .sort((a, b) => b.score - a.score)
                        const rankLabel = (rank) => {
                          if (rank === 0) return '1위'
                          if (rank === 1) return '2위'
                          return '3위'
                        }

                        // 2팀만 뛴 라운드는 2팀 전용 레이아웃으로 표기
                        if (playingTeams.length === 2) {
                          const [aIdx, bIdx] = playingTeams
                          const a = badges[aIdx]
                          const b = badges[bIdx]
                          const aScore = Number(a?.score || 0)
                          const bScore = Number(b?.score || 0)
                          const isDraw2 = aScore === bScore
                          const winnerIdx = isDraw2 ? null : (aScore > bScore ? aIdx : bIdx)
                          const resultLabel2 = isDraw2
                            ? t('matchHistory.gameDraw')
                            : t('matchHistory.gameWin', { team: winnerIdx === aIdx ? labelForTeam(aIdx) : labelForTeam(bIdx) })
                          const dot2 = (bVal) => jerseySwatch(bVal)

                          return (
                            <div className="flex flex-col gap-1 text-[11px] font-semibold text-gray-800 w-full">
                              <div className="mt-1 w-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-3 py-2 shadow-inner">
                                <div className="flex items-center justify-center gap-2 sm:gap-3">
                                  {dot2(a)}
                                  <div className="flex items-baseline gap-1 text-slate-900">
                                    <span className="text-2xl sm:text-3xl font-black leading-none">{aScore}</span>
                                    <span className="text-sm font-bold text-slate-400">-</span>
                                    <span className="text-2xl sm:text-3xl font-black leading-none">{bScore}</span>
                                  </div>
                                  {dot2(b)}
                                </div>
                                {resultLabel2 && (
                                  <div className="mt-1 flex justify-center">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-amber-700">
                                      {resultLabel2}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div className="flex flex-col gap-1.5 text-[11px] font-semibold text-gray-800 w-full">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">매치업</span>
                            {playingTeams.length > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {playingTeams.map((ti, idx) => (
                                  <React.Fragment key={`${gi}-playing-${ti}`}>
                                    {idx > 0 && (
                                      <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                                        <span className="text-[10px]">vs</span>
                                        {playingTeams.length === 2 && (
                                          <span className="text-[11px] font-bold text-slate-800">
                                            {badges[playingTeams[0]]?.score ?? 0}
                                            <span className="mx-1 text-slate-400">-</span>
                                            {badges[playingTeams[1]]?.score ?? 0}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    {renderTeamChip({ ...badges[ti] })}
                                  </React.Fragment>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">참여 팀 정보를 찾을 수 없음</span>
                            )}
                            </div>

                            {sorted.map((b, idx) => {
                              const style = {
                                backgroundColor: b.color?.bg,
                                color: b.color?.text,
                                borderColor: b.color?.border || b.color?.bg
                              }
                              return (
                                <div key={`${gi}-tri-${b.teamIdx}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                    {rankLabel(idx)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shadow-sm" style={style}>
                                    <span
                                      className="h-2 w-2 rounded-full border border-white/60"
                                      style={{ backgroundColor: b.color?.text || '#0f172a' }}
                                      aria-hidden="true"
                                    />
                                    <span className="text-[10px] font-semibold">{b.label}</span>
                                    <span className="text-[11px] font-bold">{b.score}</span>
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      }

                    return (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-gray-800">
                        <div className="flex flex-wrap items-center gap-1">
                          {badges.map((b, idx) => {
                            const style = {
                              backgroundColor: b.color?.bg,
                              color: b.color?.text,
                              borderColor: b.color?.border || b.color?.bg
                            }
                            const divider = badges.length === 2 ? '-' : '/'
                            return (
                              <React.Fragment key={`${gi}-${idx}`}>
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shadow-sm"
                                  style={style}
                                >
                                  <span
                                    className="h-2 w-2 rounded-full border border-white/60"
                                    style={{ backgroundColor: b.color?.text || '#0f172a' }}
                                    aria-hidden="true"
                                  />
                                  <span className="text-[10px] font-semibold">{b.label}</span>
                                  <span className="text-[11px] font-bold">{b.score}</span>
                                </span>
                                {idx < badges.length - 1 && (
                                  <span className="text-slate-400 font-semibold">{divider}</span>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </div>
                        {resultLabel && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-200">{resultLabel}</span>
                        )}
                      </div>
                    )
                  })()}

                  {evs.length === 0 ? (
                    <div className="mt-2 text-[11px] text-gray-500">{t('matchHistory.noRecord')}</div>
                  ) : (
                    <>
                      {(() => {
                        // Collect unique event types in this game
                        const eventTypes = new Set(evs.map(ev => ev.eventType || 'goal'))
                        const legends = []
                        
                        if (eventTypes.has('goal') || evs.some(ev => !ev.eventType && !ev.ownGoal)) {
                          legends.push({ emoji: '⚽', label: t('matchHistory.legendGoal', '골') })
                        }
                        if (eventTypes.has('own_goal') || evs.some(ev => ev.ownGoal)) {
                          legends.push({ emoji: '🥅', label: t('matchHistory.legendOwnGoal', '자책골') })
                        }
                        if (eventTypes.has('foul')) {
                          legends.push({ emoji: '⚠️', label: t('matchHistory.legendFoul', '파울') })
                        }
                        if (eventTypes.has('yellow')) {
                          legends.push({ emoji: '🟨', label: t('matchHistory.legendYellow', '옐로카드') })
                        }
                        if (eventTypes.has('red')) {
                          legends.push({ emoji: '🟥', label: t('matchHistory.legendRed', '레드카드') })
                        }
                        if (eventTypes.has('super_save')) {
                          legends.push({ emoji: '🧤', label: t('matchHistory.legendSuperSave', '슈퍼세이브') })
                        }
                        
                        return legends.length > 0 ? (
                          <div className="mt-2 mb-1 flex flex-wrap items-center gap-2 text-[9px] text-gray-500">
                            {legends.map((l, i) => (
                              <span key={i} className="inline-flex items-center gap-1">
                                <span>{l.emoji}</span>
                                <span>{l.label}</span>
                              </span>
                            ))}
                          </div>
                        ) : null
                      })()}
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-white/95 text-[11px] text-gray-900">
                      {evs.map(ev => {
                        const scorerPlayer = ev.scorerId ? byId.get(String(ev.scorerId)) : null
                        const assistPlayer = ev.assistId ? byId.get(String(ev.assistId)) : null
                        const scorerName = scorerPlayer?.name || (ev.scorerId ? ev.scorerId : t('matchHistory.ownGoal'))
                        const assistName = assistPlayer?.name || (ev.assistId ? ev.assistId : '')
                        const scorerPhoto = scorerPlayer?.photoUrl || null
                        const assistPhoto = assistPlayer?.photoUrl || null
                        const scorerBadgeInfo = scorerPlayer ? getMembershipBadge(scorerPlayer.membership, customMemberships || []) : null
                        const assistBadgeInfo = assistPlayer ? getMembershipBadge(assistPlayer.membership, customMemberships || []) : null
                        const scorerBadges = scorerBadgeInfo?.badge ? [scorerBadgeInfo.badge] : []
                        const assistBadges = assistBadgeInfo?.badge ? [assistBadgeInfo.badge] : []
                        const isOwnGoal = !!ev.ownGoal
                        const eventType = ev.eventType || 'goal'
                        const isFoul = eventType === 'foul'
                        const isYellow = eventType === 'yellow'
                        const isRed = eventType === 'red'
                        const isSuperSave = eventType === 'super_save'
                        const minuteText = ev.minute ? `${ev.minute}'` : ''
                        const kitPaletteRow = [
                          { bg: '#f8fafc', text: '#0f172a', border: '#e2e8f0', label: 'White' },
                          { bg: '#0f172a', text: '#ffffff', border: '#0b1220', label: 'Black' },
                          { bg: '#2563eb', text: '#ffffff', border: '#1d4ed8', label: 'Blue' },
                          { bg: '#dc2626', text: '#ffffff', border: '#b91c1c', label: 'Red' },
                          { bg: '#6dff2e', text: '#0f172a', border: '#5ce625', label: 'Green' },
                          { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9', label: 'Purple' },
                          { bg: '#ea580c', text: '#ffffff', border: '#c2410c', label: 'Orange' },
                          { bg: '#0d9488', text: '#ffffff', border: '#0f766e', label: 'Teal' },
                          { bg: '#ec4899', text: '#ffffff', border: '#db2777', label: 'Pink' },
                          { bg: '#facc15', text: '#0f172a', border: '#eab308', label: 'Yellow' }
                        ]
                        const resolvedColor = (Array.isArray(m?.teamColors) && m.teamColors[ev.teamIndex] && typeof m.teamColors[ev.teamIndex] === 'object')
                          ? m.teamColors[ev.teamIndex]
                          : kitPaletteRow[Number(ev.teamIndex) % kitPaletteRow.length]
                        const teamLabel = resolvedColor?.label || t('matchHistory.teamN', { n: Number(ev.teamIndex) + 1 })
                        const jerseySwatchEvent = (color) => {
                          const label = (color?.label || '').toLowerCase()
                          const base = color?.bg || color?.border || color?.text || '#0f172a'
                          const isWhite = label === 'white'
                          const isBlack = label === 'black'
                          const fill = isWhite ? '#ffffff' : (isBlack ? '#0f172a' : base)
                          const stroke = isWhite
                            ? '#0f172a'
                            : (isBlack ? '#ffffff' : 'rgba(0,0,0,0.38)')
                          const strokeW = isWhite ? 16 : (isBlack ? 16 : 12)
                          return (
                            <svg
                              width={18}
                              height={18}
                              viewBox="0 0 969.982 969.982"
                              aria-hidden="true"
                              className="drop-shadow-sm"
                            >
                              <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round">
                                <path d="M937.031,250.555c-21.249-9.669-42.856-19.473-63.752-28.955c-40.639-18.439-82.662-37.507-123.886-56.416 c-7.768-3.562-15.452-7.376-23.589-11.414c-32.479-16.116-69.289-34.382-112.309-34.382h-24.032 c-9.62,0-18.902,3.651-26.139,10.282c-5.699,5.223-9.85,11.987-12.004,19.56c-0.424,1.492-4.271,6.993-15.981,12.504 c-13.478,6.343-31.194,9.837-49.89,9.837s-36.413-3.494-49.89-9.837c-11.71-5.511-15.558-11.012-15.981-12.504 c-2.153-7.572-6.304-14.337-12.004-19.561c-7.235-6.63-16.518-10.282-26.138-10.282h-24.035 c-45.053,0-85.888,20.228-121.917,38.074c-10.214,5.06-19.862,9.838-29.321,14.056c-26.528,11.827-53.271,24.134-79.133,36.037 c-20.479,9.425-41.656,19.171-62.506,28.576c-5.352,2.414-10.726,4.885-15.923,7.275c-5.125,2.356-10.424,4.793-15.6,7.127 c-28.17,12.706-40.753,45.961-28.049,74.132l48.462,107.458c9.044,20.053,29.104,33.01,51.105,33.01 c7.979,0,15.726-1.669,23.026-4.962l0.525-0.236l0.516-0.258l53.535-26.664V760.42c0,15.051,6.94,36.486,40.003,53.125 c16.869,8.488,40.303,15.705,69.649,21.449c51.413,10.061,120.193,15.602,193.674,15.602c73.479,0,142.261-5.541,193.674-15.602 c29.347-5.744,52.78-12.959,69.649-21.449c33.062-16.639,40.003-38.074,40.003-53.125V432.662l52.291,26.848l0.676,0.348 l0.693,0.312c7.3,3.292,15.047,4.962,23.025,4.962c22.001,0,42.062-12.958,51.105-33.01l48.462-107.457 C977.728,296.51,965.166,263.278,937.031,250.555z" />
                                <path d="M937.684,312.331l-48.463,107.457c-4.346,9.637-13.829,15.344-23.757,15.344 c-3.58,0-7.217-0.741-10.691-2.309l-95.994-49.286V760.42c0,40.117-136.664,60.176-273.327,60.176s-273.327-20.059-273.327-60.176 V384.555l-96.91,48.268c-3.476,1.567-7.112,2.309-10.692,2.309c-9.927,0-19.411-5.707-23.757-15.344L32.301,312.331 c-5.914-13.113-0.078-28.537,13.035-34.45c10.526-4.747,20.993-9.653,31.525-14.403c47.267-21.321,94.162-43.445,141.52-64.559 c43.683-19.476,89.679-49.529,139.021-49.53c0.001,0,24.034,0,24.034,0c4.503,0,8.055,3.717,9.287,8.048 c7.108,24.999,46.812,44.135,94.728,44.135s87.618-19.136,94.729-44.135c1.231-4.332,4.783-8.048,9.286-8.048h24.032 c45.275,0,83.509,24.772,123.389,43.064c62.499,28.667,125.178,56.948,187.763,85.427 C937.761,283.793,943.596,299.218,937.684,312.331z" />
                                <path d="M561.662,387.069c0,21.831,17.697,42.614,39.528,42.614s39.527-20.783,39.527-42.614v-30.276h-79.056V387.069z" />
                                <path d="M647.68,311.997H554.7c-22.056,0-40,17.944-40,40v33.27c0,22.443,8.814,45.174,24.182,62.361 c7.839,8.768,16.962,15.736,27.117,20.713c11.179,5.479,23.021,8.259,35.192,8.259s24.013-2.778,35.191-8.259 c10.155-4.977,19.278-11.945,27.117-20.713c15.368-17.188,24.183-39.918,24.183-62.361v-33.27 C687.68,329.941,669.737,311.997,647.68,311.997z" />
                              </g>
                            </svg>
                          )
                        }

                        return (
                          <li key={ev.id} className="flex items-start gap-3 px-3 py-2.5">
                            <div className="flex flex-col items-start gap-1 text-[10px] font-semibold min-w-[88px]">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 shadow-sm">
                                {jerseySwatchEvent(resolvedColor)}
                                <span className="text-gray-800">{teamLabel}</span>
                              </span>
                              {hasTimeline && minuteText && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                  ⏱️ {minuteText}
                                </span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-900">
                                <span className="flex-shrink-0">
                                  <InitialAvatar 
                                    size={22} 
                                    name={scorerName || t('matchHistory.scorerUnspecified')} 
                                    photoUrl={scorerPhoto}
                                    badges={scorerBadges}
                                    customMemberships={customMemberships || []}
                                    badgeInfo={scorerBadgeInfo}
                                  />
                                </span>
                                <span className="inline-flex min-w-0 max-w-[140px] overflow-x-auto whitespace-nowrap scrollbar-thin pr-1" title={scorerName || t('matchHistory.scorerUnspecified')}>
                                  {scorerName || t('matchHistory.scorerUnspecified')}
                                </span>
                                <span className={`inline-flex items-center rounded-full px-1 py-[1px] text-[10px] shrink-0 ${
                                  isFoul ? 'bg-gray-100' :
                                  isYellow ? 'bg-yellow-100' :
                                  isRed ? 'bg-red-100' :
                                  isOwnGoal ? 'bg-rose-100' :
                                  isSuperSave ? 'bg-sky-100' :
                                  'bg-emerald-100'
                                }`}>
                                  {isFoul ? '⚠️' : isYellow ? '🟨' : isRed ? '🟥' : isOwnGoal ? '🥅' : isSuperSave ? '🧤' : '⚽'}
                                </span>
                              </div>
                              {!isFoul && !isYellow && !isRed && !isSuperSave && assistName && (
                                <div className="text-[10px] text-gray-600 flex items-center gap-1.5">
                                  <span className="flex-shrink-0">
                                    <InitialAvatar 
                                      size={18} 
                                      name={assistName} 
                                      photoUrl={assistPhoto}
                                      badges={assistBadges}
                                      customMemberships={customMemberships || []}
                                      badgeInfo={assistBadgeInfo}
                                    />
                                  </span>
                                  <span className="inline-flex min-w-0 max-w-[140px] overflow-x-auto whitespace-nowrap scrollbar-thin pr-1" title={assistName}>
                                    {isOwnGoal
                                      ? t('matchHistory.inducedBy', { name: assistName })
                                      : t('matchHistory.assistBy', { name: assistName })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    </>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 삭제/초기화 확인 모달 */}
      <ConfirmDialog
        open={confirmDelete.open}
        title={confirmDelete.id === '__reset_quarter_scores__' ? '점수 초기화' : '매치 삭제'}
        message={confirmDelete.id === '__reset_quarter_scores__' 
          ? '모든 게임 점수를 0으로 초기화하시겠습니까?'
          : '정말 삭제하시겠어요?\n삭제 시 대시보드의 공격포인트/기록 집계에 영향을 줄 수 있습니다.'}
        confirmLabel={confirmDelete.id === '__reset_quarter_scores__' ? '초기화' : '삭제하기'}
        cancelLabel="취소"
        tone="danger"
        onCancel={() => setConfirmDelete({ open: false, id: null })}
        onConfirm={() => {
          if (confirmDelete.id === '__reset_quarter_scores__') {
            setQuarterScores(initialSnap.map(()=>[]))
            // Reset referee mode data if present
            if (hasTimeline && onUpdateMatch) {
              const cleanedStats = { ...(m?.stats || {}) }
              delete cleanedStats.__games
              delete cleanedStats.__events
              delete cleanedStats.__scores
              delete cleanedStats.__matchMeta
              // Also reset player stats to empty shell
              Object.keys(cleanedStats).forEach(key => {
                if (key.startsWith('__')) return
                cleanedStats[key] = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, fouls: 0, events: [] }
              })
              onUpdateMatch(m.id, { stats: cleanedStats, quarterScores: initialSnap.map(()=>[]) })
            }
            setDirty(true)
          } else if (confirmDelete.id && onDeleteMatch) {
            onDeleteMatch(confirmDelete.id)
          }
          setConfirmDelete({ open: false, id: null })
        }}
      />

      {/* 골/어시 토글과 배지 범례 */}
      <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* 왼쪽: G/A 표시 슬라이드 토글 */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600 font-medium">골/어시</span>
          <button
            onClick={() => setShowGA(prev => !prev)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 ${
              showGA ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
            title={showGA ? "골/어시 숨기기" : "골/어시 표시"}
            role="switch"
            aria-checked={showGA}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                showGA ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        
        {/* 오른쪽: 배지 범례 (이 매치에서 실제 사용된 배지만 표시) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-600">
          {(() => {
            // 이 매치의 모든 선수들의 멤버십 수집
            const allPlayers = draftTeams.flat()
            
            // 주장이 있는지 확인
            const hasCaptain = captainIds && captainIds.some(id => id)
            
            // 사용된 배지 정보 수집 (중복 제거)
            const usedBadgesMap = new Map() // badge -> { membership, badgeInfo }
            
            if (customMemberships && customMemberships.length > 0) {
              // 모든 선수의 배지 정보 수집
              allPlayers.forEach(p => {
                const badgeInfo = getMembershipBadge(p.membership, customMemberships)
                if (badgeInfo && badgeInfo.badge) {
                  // 같은 배지는 한 번만 저장
                  if (!usedBadgesMap.has(badgeInfo.badge)) {
                    // 해당 배지의 멤버십 찾기
                    const membership = customMemberships.find(m => 
                      getMembershipBadge(m.name, customMemberships)?.badge === badgeInfo.badge
                    )
                    if (membership) {
                      usedBadgesMap.set(badgeInfo.badge, { membership, badgeInfo })
                    }
                  }
                }
              })
            } else {
              // 기본 멤버십 체크 (게스트)
              const hasGuest = allPlayers.some(p => {
                const mem = String(p.membership || '').trim().toLowerCase()
                return !(mem === 'member' || mem.includes('정회원'))
              })
              
              if (hasGuest) {
                usedBadgesMap.set('G', { isDefaultGuest: true })
              }
            }
            
            // 배지가 하나도 없으면 아무것도 표시하지 않음
            if (!hasCaptain && usedBadgesMap.size === 0) return null
            
            return (
              <>
                {hasCaptain && (
                  <span className="inline-flex items-center gap-1">
                    <CaptainBadge /> <span>주장</span>
                  </span>
                )}
                
                {Array.from(usedBadgesMap.values()).map((item, idx) => {
                  if (item.isDefaultGuest) {
                    return (
                      <React.Fragment key="default-guest">
                        <span className="mx-1 text-gray-400">·</span>
                        <span className="inline-flex items-center gap-1">
                          <GuestBadge /> <span>게스트</span>
                        </span>
                      </React.Fragment>
                    )
                  }
                  
                  const { membership, badgeInfo } = item
                  return (
                    <React.Fragment key={membership.id || idx}>
                      <span className="mx-1 text-gray-400">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="inline-flex items-center justify-center rounded-full border shadow-sm"
                          style={{
                            width: '18px',
                            height: '18px',
                            fontSize: '9px',
                            lineHeight: 1,
                            backgroundColor: badgeInfo.colorStyle?.bg,
                            borderColor: badgeInfo.colorStyle?.border,
                            color: badgeInfo.colorStyle?.text
                          }}
                        >
                          {badgeInfo.badge}
                        </span>
                        <span>{membership.name}</span>
                      </span>
                    </React.Fragment>
                  )
                })}
              </>
            )
          })()}
        </div>
      </div>

      <div className="grid gap-2 sm:gap-3" style={gridStyle}>
        {draftTeams.map((list,i)=>{
          const kit=kitForTeam(i), nonGK=list.filter(p=>(p.position||p.pos)!=="GK")
          const sum=nonGK.reduce((a,p)=>a+(p.ovr??overall(p)),0), avg=nonGK.length?Math.round(sum/nonGK.length):0
          const capId=(captainIds&&captainIds[i])?String(captainIds[i]):null
          
          // Avatar size: 기본 32px, 4팀 이상일 때는 아바타 숨김
          const avatarSize = 32
          
          // 주장이 있으면 항상 제일 위로 정렬 (드래프트 모드 여부와 무관)
          const listOrdered=capId?[...list].sort((a,b)=>{
            const aid=String(a.id),bid=String(b.id)
            if(aid===capId && bid!==capId) return -1
            if(bid===capId && aid!==capId) return 1
            return 0
          }):list
          
          // Get saved team color if available (check for non-null value)
          const teamColor = (m.teamColors && Array.isArray(m.teamColors) && m.teamColors[i] && typeof m.teamColors[i] === 'object') ? m.teamColors[i] : null
          
          // compute winner index from scores
          let isWinner = false
          if (Array.isArray(quarterScores) && Array.isArray(quarterScores[i])) {
            const teamLen = quarterScores.length
            const maxQ = Math.max(0, ...quarterScores.map(a=>Array.isArray(a)?a.length:0))
            const gameMatchups = m?.gameMatchups || null
            
            if (teamLen === 3) {
              // 3팀: 위에서 계산한 pointWinners 재사용
              // 하지만 스코프 문제로 여기서 다시 계산 (동일한 로직)
              // null 체크로 rotation vs battle royale 구분
              const hasNulls = quarterScores.some(teamScores => 
                Array.isArray(teamScores) && teamScores.some(s => s === null)
              )
              
              if (hasNulls) {
                // Rotation format: 동적으로 페어 찾기
                const pts = [0, 0, 0]
                const goalScored = [0, 0, 0]
                const goalConceded = [0, 0, 0]
                
                for (let qi = 0; qi < maxQ; qi++) {
                  const playingTeams = quarterScores.map((teamScores, ti) => ({
                    teamIdx: ti,
                    score: Array.isArray(teamScores) ? teamScores[qi] : (qi === 0 ? teamScores : null)
                  })).filter(t => t.score !== null)
                  
                  if (playingTeams.length === 2) {
                    const [t1, t2] = playingTeams
                    goalScored[t1.teamIdx] += t1.score
                    goalScored[t2.teamIdx] += t2.score
                    goalConceded[t1.teamIdx] += t2.score
                    goalConceded[t2.teamIdx] += t1.score
                    
                    if (t1.score > t2.score) pts[t1.teamIdx] += 3
                    else if (t2.score > t1.score) pts[t2.teamIdx] += 3
                    else { pts[t1.teamIdx] += 1; pts[t2.teamIdx] += 1 }
                  }
                }
                
                // 타이브레이커: 승점 → 골득실 → 총 득점
                const maxPts = Math.max(...pts)
                let winners = pts.map((p, idx) => p === maxPts ? idx : -1).filter(idx => idx >= 0)
                
                if (winners.length > 1) {
                  const goalDiff = winners.map(idx => goalScored[idx] - goalConceded[idx])
                  const maxGD = Math.max(...goalDiff)
                  winners = winners.filter((_, wIdx) => goalDiff[wIdx] === maxGD)
                  
                  if (winners.length > 1) {
                    const maxGoals = Math.max(...winners.map(idx => goalScored[idx]))
                    winners = winners.filter(idx => goalScored[idx] === maxGoals)
                  }
                }
                
                isWinner = winners.length === 1 && winners[0] === i
              } else {
                // Battle royale: 3팀 동시 경기
                // 간단하게 승점만 계산 (battle royale는 보통 타이브레이커 불필요)
                const pts = [0, 0, 0]
                for (let qi = 0; qi < maxQ; qi++) {
                  const scores = quarterScores.map(ts => Number(Array.isArray(ts) ? ts[qi] : (qi === 0 ? ts : 0)))
                  const sorted = [...scores].sort((a, b) => b - a)
                  
                  scores.forEach((s, idx) => {
                    if (s === sorted[0] && scores.filter(x => x === sorted[0]).length === 1) pts[idx] += 3
                    else if (s === sorted[1] && scores.filter(x => x === sorted[1]).length === 1) pts[idx] += 1
                  })
                }
                const maxPts = Math.max(...pts)
                const winners = pts.map((p, idx) => p === maxPts ? idx : -1).filter(idx => idx >= 0)
                isWinner = winners.length === 1 && winners[0] === i
              }
            } else if (teamLen >= 4 && gameMatchups && Array.isArray(gameMatchups) && gameMatchups.length > 0) {
              // 4팀+ 매치업 모드: 구장 분리 체크
              const separation = checkFieldSeparation(gameMatchups, teamLen)
              
              if (separation) {
                // 구장별로 분리된 경우: 각 구장의 승자 판정
                const { field1Teams, field2Teams } = separation
                const myField = field1Teams.has(i) ? field1Teams : field2Teams.has(i) ? field2Teams : null
                
                if (myField) {
                  const teamGamePoints = {}
                  const teamTotals = {}
                  myField.forEach(t => {
                    teamGamePoints[t] = []
                    teamTotals[t] = 0
                  })
                  
                  const fieldIdx = field1Teams.has(i) ? 0 : 1
                  
                  for (let qi = 0; qi < maxQ; qi++) {
                    const matchup = gameMatchups[qi]
                    if (!matchup || !Array.isArray(matchup)) continue
                    const pair = matchup[fieldIdx]
                    if (!Array.isArray(pair) || pair.length !== 2) continue
                    const [a, b] = pair
                    if (!myField.has(a) || !myField.has(b)) continue
                    
                    const aScore = Number(quarterScores[a]?.[qi] ?? 0)
                    const bScore = Number(quarterScores[b]?.[qi] ?? 0)
                    teamTotals[a] += aScore
                    teamTotals[b] += bScore
                    
                    let aPts = 0, bPts = 0
                    if (aScore > bScore) { aPts = 3; bPts = 0 }
                    else if (bScore > aScore) { aPts = 0; bPts = 3 }
                    else { aPts = 1; bPts = 1 }
                    
                    teamGamePoints[a].push(aPts)
                    teamGamePoints[b].push(bPts)
                  }
                  
                  const totalPoints = {}
                  Object.keys(teamGamePoints).forEach(t => {
                    totalPoints[t] = teamGamePoints[t].reduce((a,b) => a+b, 0)
                  })
                  
                  const maxPts = Math.max(...Object.values(totalPoints))
                  let winners = Object.keys(totalPoints).filter(t => totalPoints[t] === maxPts).map(t => parseInt(t))
                  
                  // 동점일 때 골득실로 판단
                  if (winners.length > 1) {
                    const maxGoals = Math.max(...winners.map(t => teamTotals[t]))
                    winners = winners.filter(t => teamTotals[t] === maxGoals)
                  }
                  
                  isWinner = winners.length === 1 && winners[0] === i
                }
              } else {
                // 통합 모드: 기존 승점 계산
                const teamGamePoints = Array.from({ length: teamLen }, () => [])
                const teamTotals = Array.from({ length: teamLen }, () => 0)
                
                for (let qi = 0; qi < maxQ; qi++) {
                  const matchup = gameMatchups[qi]
                  if (!matchup || !Array.isArray(matchup)) continue
                  
                  for (const pair of matchup) {
                    if (!Array.isArray(pair) || pair.length !== 2) continue
                    const [a, b] = pair
                    if (a === null || b === null || a === undefined || b === undefined || a < 0 || b < 0 || a >= teamLen || b >= teamLen) continue
                    
                    const aScore = Number(quarterScores[a]?.[qi] ?? 0)
                    const bScore = Number(quarterScores[b]?.[qi] ?? 0)
                    teamTotals[a] += aScore
                    teamTotals[b] += bScore
                    
                    let aPts = 0, bPts = 0
                    if (aScore > bScore) { aPts = 3; bPts = 0 }
                    else if (bScore > aScore) { aPts = 0; bPts = 3 }
                    else { aPts = 1; bPts = 1 }
                    
                    teamGamePoints[a].push(aPts)
                    teamGamePoints[b].push(bPts)
                  }
                }
                
                const totalPoints = teamGamePoints.map(pts => pts.reduce((a,b) => a+b, 0))
                const maxPts = Math.max(...totalPoints)
                let winners = totalPoints.map((p,idx)=>p===maxPts?idx:-1).filter(idx=>idx>=0)
                
                // 동점일 때 골득실로 판단
                if (winners.length > 1) {
                  const maxGoals = Math.max(...winners.map(idx => teamTotals[idx]))
                  winners = winners.filter(idx => teamTotals[idx] === maxGoals)
                }
                
                isWinner = winners.length === 1 && winners[0] === i
              }
            } else {
              // fallback: total goals
              const totals = quarterScores.map(arr => Array.isArray(arr)?arr.reduce((a,b)=>a+Number(b||0),0):0)
              const max = Math.max(...totals)
              const winners = totals.map((v,idx)=>v===max?idx:-1).filter(idx=>idx>=0)
              isWinner = winners.length === 1 && winners[0] === i
            }
          } else if (Array.isArray(m.scores) && m.scores.length) {
            const totals = m.scores.map(Number)
            const max = Math.max(...totals)
            const winners = totals.map((v,idx)=>v===max?idx:-1).filter(idx=>idx>=0)
            isWinner = winners.length === 1 && winners[0] === i
          }
          
          // Header style: use teamColor if available, otherwise kit color
          const headerStyle = teamColor ? {
            backgroundColor: teamColor.bg,
            color: teamColor.text,
            borderColor: teamColor.border,
          } : {}
          const teamLabel = teamColor ? teamColor.label : kit.label
          const playerUnit = list.length === 1
            ? t('matchHistory.playerUnit.one')
            : t('matchHistory.playerUnit.other')
          const teamSummary = t('matchHistory.teamSummary', { label: teamLabel, count: list.length, unit: playerUnit })
          
          return (
            <div key={i} className="overflow-hidden rounded border border-gray-200 relative">
              <div 
                className={`flex items-center justify-between px-3 py-1.5 text-xs ${!teamColor ? kit.headerClass : ''} relative z-10`}
                style={teamColor ? headerStyle : {}}
              >
                <div className="font-semibold">
                  {t('matchHistory.teamN', { n: i+1 })} {isWinner && <span className="ml-2">🏆</span>}
                </div>
                {isAdmin && !hideOVR
                  ? <div className="opacity-80">{teamSummary} · <b>{t('matchHistory.teamPower')}</b> {sum} · {t('matchHistory.teamAvgPower', { value: avg })}</div>
                  : <div className="opacity-80">{teamSummary}</div>}
              </div>
              <ul className="divide-y divide-gray-100 relative z-10">
                {isWinner && isDraftMode && m?.id===latestDraftId && <Confetti />}
                {listOrdered.map(p=>{
                  const rec = gaByPlayer[toStr(p.id)] || { goals: 0, assists: 0, fouls: 0, yellowCards: 0, redCards: 0 }
                  const isCaptain = captainIds && captainIds[i] === String(p.id)
                  
                  // 멤버십 뱃지 계산
                  const membershipBadgeInfo = getMembershipBadge(p.membership, customMemberships || [])
                  const badges = [
                    ...(isCaptain ? ['C'] : []),
                    ...(membershipBadgeInfo?.badge ? [membershipBadgeInfo.badge] : []),
                  ]
                  
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      {/* Left block: avatar (with badges) | name | stats */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* 아바타: 모바일에서 3팀 이상일 때만 숨김, 데스크탑/태블릿은 항상 표시 */}
                        <div className={`shrink-0 ${teamCols >= 3 ? 'hidden sm:block' : ''}`}>
                          <InitialAvatar 
                            id={p.id} 
                            name={p.name} 
                            size={avatarSize} 
                            photoUrl={p.photoUrl} 
                            badges={badges}
                            customMemberships={customMemberships || []}
                            badgeInfo={membershipBadgeInfo}
                          />
                        </div>
                        {/* 이름 */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
                            <span className="font-medium whitespace-nowrap flex items-center gap-1.5" title={p.name}>
                              {/* 모바일에서 3팀 이상일 때 주장 배지만 이름 앞에 표시 */}
                              {teamCols >= 3 && isCaptain && (
                                <span className="inline-flex items-center gap-0.5 shrink-0 sm:hidden">
                                  <CaptainBadge />
                                </span>
                              )}
                              <span>
                                {p.name}
                                {(p.position||p.pos)==="GK"&&<em className="ml-1 text-xs font-normal text-gray-400">(GK)</em>}
                              </span>
                            </span>
                          </div>
                        </div>
                        {/* Stats: Goals / Assists (조건부 표시) */}
                        {showGA && (
                          <div className="flex items-center gap-2 justify-self-end">
                            {rec.goals>0 && (
                              <div className="relative inline-flex items-center justify-center" title="골">
                                <span role="img" aria-label="goals" className="text-2xl leading-none">⚽</span>
                                <span className="absolute right-0 bottom-0 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-black text-[10px] font-bold text-white shadow-sm">{rec.goals}</span>
                              </div>
                            )}
                            {rec.assists>0 && (
                              <div className="relative inline-flex items-center justify-center" title="어시스트">
                                <span role="img" aria-label="assists" className="text-2xl leading-none">🎯</span>
                                <span className="absolute right-0 bottom-0 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-black text-[10px] font-bold text-white shadow-sm">{rec.assists}</span>
                              </div>
                            )}
                            {rec.fouls>0 && (
                              <div className="relative inline-flex items-center justify-center" title="반칙">
                                <span role="img" aria-label="fouls" className="text-xl leading-none">⚠️</span>
                                <span className="absolute right-0 bottom-0 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-gray-700 text-[10px] font-bold text-white shadow-sm">{rec.fouls}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right block: admin actions */}
                      <span className="flex items-center gap-2 shrink-0">
                        {isAdmin&&(
                          <div className="flex items-center gap-2">
                            {/* 주장 지정 버튼 - 드래프트 모드 여부와 무관하게 표시 */}
                            <button
                              className={`border-0 bg-transparent w-6 h-6 flex items-center justify-center hover:opacity-80 p-0 transition-all ${
                                captainIds && captainIds[i] === String(p.id) 
                                  ? 'ring-2 ring-yellow-400 rounded-full scale-110 brightness-110' 
                                  : ''
                              }`}
                              title={captainIds && captainIds[i] === String(p.id) ? "주장 해제" : "이 선수를 주장으로 지정"}
                              onClick={()=>setCaptain(i, p.id)}
                              aria-label={captainIds && captainIds[i] === String(p.id) ? "주장 해제" : "주장 지정"}
                            >
                              <img src={captainIcon} alt="주장" className="w-full h-full object-contain" />
                            </button>
                            <button
                              className="rounded-full border border-gray-300 bg-white w-6 h-6 flex items-center justify-center text-gray-700 hover:bg-gray-100 p-0"
                              title="이 팀에서 제외 (저장 전 초안)"
                              onClick={()=>setSnap(draftSnap.map((arr,idx)=>idx===i?arr.filter(id=>String(id)!==String(p.id)):arr))}
                              aria-label="팀에서 제외"
                            >
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
                            </button>
                          </div>
                        )}
                      </span>
                    </li>
                  )
                })}
                {list.length===0&&<li className="px-3 py-2 text-xs text-gray-400">팀원 없음</li>}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Admin: Draft editors (simplified UI) */}
      {isAdmin && isDraftMode && (() => {
        // Normalize quarter scores to match current team count
        const teamLen = draftTeams.length
        const qs = (quarterScores && Array.isArray(quarterScores))
          ? quarterScores.map(a => Array.isArray(a) ? a.slice() : [])
          : Array.from({ length: teamLen }, () => [])
        while (qs.length < teamLen) qs.push([])
        if (qs.length > teamLen) qs.length = teamLen
        const maxQ = Math.max(0, ...qs.map(a => a.length))

        // Hide score editing for referee mode with recorded games
        const hasRefereeGames = hasTimeline && Array.isArray(m?.stats?.__games) && m.stats.__games.length > 0

        return (

          <div className="mt-3">
            {/* Redesigned Game Scores Input - Mobile Optimized */}
            {!hasRefereeGames && (
            <div className="rounded-lg border-2 border-blue-100 p-2 sm:p-4 bg-gradient-to-br from-blue-50 to-white shadow-sm">
              {/* 경기장 모드 토글 (4팀 이상일 때만 표시) */}
              {teamLen >= 4 && (
                <div className="mb-3 pb-3 border-b border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-700">경기장 모드</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { 
                          setMultiFieldMode(false); 
                          setDirty(true);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          !multiFieldMode 
                            ? 'bg-blue-500 text-white shadow-sm' 
                            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        🏟️ 단일 경기장
                      </button>
                      <button
                        onClick={() => { 
                          setMultiFieldMode(true);
                          // gameMatchups 초기화 (각 게임마다 null로 초기화하여 사용자가 선택하도록)
                          if (!gameMatchups || gameMatchups.length === 0) {
                            const defaultMatchups = Array.from({length: maxQ || 1}, () => [[null, null], [null, null]]);
                            setGameMatchups(defaultMatchups);
                          }
                          setDirty(true);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          multiFieldMode 
                            ? 'bg-blue-500 text-white shadow-sm' 
                            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        🏟️🏟️ 2개 경기장
                      </button>
                    </div>
                  </div>
                  {multiFieldMode && (
                    <div className="mt-2 text-[10px] text-blue-600 bg-blue-50 px-2 py-1.5 rounded">
                      💡 2개 경기장에서 동시에 경기 진행 시 각 경기장별로 점수를 입력하세요
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className="text-sm sm:text-base font-semibold text-gray-800">게임 점수</div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    className="rounded-lg border-2 border-blue-400 bg-blue-500 hover:bg-blue-600 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-white shadow-sm transition-all active:scale-95 font-semibold text-base sm:text-lg"
                    title="게임 추가"
                    onClick={()=>{
                      // quarterScores 상태를 직접 사용하여 최신 값 반영
                      let baseQS = quarterScores && Array.isArray(quarterScores) 
                        ? quarterScores.map(a => Array.isArray(a) ? a.slice() : [])
                        : Array.from({ length: teamLen }, () => [])
                      
                      // 팀 수에 맞게 조정
                      while (baseQS.length < teamLen) baseQS.push([])
                      if (baseQS.length > teamLen) baseQS.length = teamLen
                      
                      // 모든 배열이 비어있다면 초기화
                      if (baseQS.every(arr => arr.length === 0)) {
                        baseQS = Array.from({ length: teamLen }, () => [])
                      }
                      
                      const next = baseQS.map(arr => [...arr, 0])
                      setQuarterScores(next)
                      // 2개 경기장 모드면 매치업도 추가 (null로 초기화하여 사용자가 선택하도록)
                      if (multiFieldMode) {
                        const nextMatchups = [...gameMatchups, [[null, null], [null, null]]]
                        setGameMatchups(nextMatchups)
                      }
                      setDirty(true)
                    }}
                  >+</button>
                  <button
                    className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-gray-700 shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 font-semibold text-base sm:text-lg"
                    title="마지막 게임 삭제"
                    disabled={maxQ===0}
                    onClick={()=>{
                      const newLen = Math.max(0, maxQ - 1)
                      const next = qs.map(arr => arr.slice(0, newLen))
                      setQuarterScores(next)
                      // 2개 경기장 모드면 매치업도 삭제
                      if (multiFieldMode && gameMatchups.length > newLen) {
                        const nextMatchups = gameMatchups.slice(0, newLen)
                        setGameMatchups(nextMatchups)
                      }
                      setDirty(true)
                    }}
                  >−</button>
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5 sm:gap-3">
                {!multiFieldMode ? (
                  <>
                    {/* 단일 경기장 모드: 기존 UI */}
                    {/* Header Row */}
                    <div className="flex items-center gap-1 sm:gap-2 pl-10 sm:pl-16">
                      {Array.from({length: Math.max(1, maxQ)}).map((_,qi)=>(
                        <div key={qi} className="w-14 sm:w-20 text-center">
                          <div className="inline-flex items-center justify-center px-1.5 py-0.5 sm:px-2.5 sm:py-1 bg-blue-100 rounded-full">
                            <span className="text-[10px] sm:text-xs font-bold text-blue-700">G{qi+1}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Team Rows */}
                    {draftTeams.map((_, ti) => {
                      return (
                        <div key={`qrow-${ti}`} className="flex items-center gap-1 sm:gap-2 bg-white rounded-lg p-1 sm:p-2 shadow-sm border border-gray-200">
                          <div className="w-8 sm:w-12 flex items-center justify-center">
                            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                              <span className="text-white font-bold text-xs sm:text-sm">{ti+1}</span>
                            </div>
                          </div>
                          
                          {Array.from({length: Math.max(1, maxQ)}).map((_,qi)=>{
                            const raw = qs[ti][qi]
                            const isAbsent = raw === null && teamLen === 3
                            const val = raw ?? 0
                            return (
                              <div key={`qcell-${ti}-${qi}`} className="w-14 sm:w-20 relative">
                                {teamLen === 3 && (
                                  <button
                                    type="button"
                                    className={`absolute -top-2 -left-2 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shadow-md ${isAbsent ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-400 text-white hover:bg-gray-500'} transition-all active:scale-95 z-10`}
                                    title={isAbsent ? '참가로 변경 (클릭)' : '불참 표시 (클릭)'}
                                    onClick={() => {
                                      const next = qs.map(a=>a.slice())
                                      if (isAbsent) {
                                        // absent → present(0)
                                        next[ti][qi] = 0
                                      } else {
                                        // present → absent(null). 다른 팀이 이미 null이면 해제
                                        for (let t=0; t<teamLen; t++) {
                                          if (t!==ti && next[t][qi] === null) next[t][qi] = 0
                                        }
                                        next[ti][qi] = null
                                      }
                                      setQuarterScores(next)
                                      setDirty(true)
                                    }}
                                    aria-label={isAbsent ? '참가로 변경' : '불참 표시'}
                                  >{isAbsent ? '↺' : '×'}</button>
                                )}
                                {isAbsent ? (
                                  <div className="flex items-center justify-center bg-gray-50 rounded-lg p-1 sm:p-1.5 border border-dashed border-gray-300 text-[10px] sm:text-xs text-gray-400">–</div>
                                ) : (
                                  <div className="flex items-center gap-0.5 sm:gap-1 justify-center bg-gray-50 rounded-lg p-1 sm:p-1.5 border border-gray-200">
                                    <button
                                      className="rounded-md bg-white border border-gray-300 hover:border-red-400 hover:bg-red-50 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-gray-600 hover:text-red-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed font-bold shadow-sm text-xs sm:text-base"
                                      title="점수 내리기"
                                      disabled={val <= 0}
                                      onClick={() => {
                                        const next = qs.map(a=>a.slice())
                                        next[ti][qi] = Math.max(0, val - 1)
                                        setQuarterScores(next)
                                        setDirty(true)
                                      }}
                                      aria-label="점수 -1"
                                    >−</button>
                                    <div className="w-6 sm:w-8 flex items-center justify-center">
                                      <span className="inline-block text-center select-none font-bold text-sm sm:text-base text-gray-800">{val}</span>
                                    </div>
                                    <button
                                      className="rounded-md bg-blue-500 hover:bg-blue-600 border border-blue-600 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-white transition-all disabled:opacity-30 font-bold shadow-sm text-xs sm:text-base"
                                      title="점수 올리기"
                                      disabled={val >= 99}
                                      onClick={() => {
                                        const next = qs.map(a=>a.slice())
                                        next[ti][qi] = Math.min(99, val + 1)
                                        setQuarterScores(next)
                                        setDirty(true)
                                      }}
                                      aria-label="점수 +1"
                                    >+</button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <>
                    {/* 2개 경기장 모드: 새로운 UI */}
                    {Array.from({length: Math.max(1, maxQ)}).map((_,qi)=>{
                      // 현재 게임의 매치업 가져오기 또는 기본값 설정 (null로 초기화)
                      const currentMatchup = gameMatchups[qi] || [[null, null], [null, null]]
                      const fieldA = currentMatchup[0] || [null, null]
                      const fieldB = currentMatchup[1] || [null, null]
                      
                      // 이 게임에서 이미 선택된 팀들 (중복 방지용)
                      const usedTeams = new Set()
                      fieldA.forEach(t => { if (t !== null) usedTeams.add(t) })
                      fieldB.forEach(t => { if (t !== null) usedTeams.add(t) })
                      
                      // 매치업 업데이트 함수
                      const updateMatchup = (fieldIndex, positionIndex, newTeamIndex) => {
                        const nextMatchups = [...gameMatchups]
                        if (!nextMatchups[qi]) nextMatchups[qi] = [[null, null], [null, null]]
                        nextMatchups[qi][fieldIndex][positionIndex] = newTeamIndex
                        setGameMatchups(nextMatchups)
                        setDirty(true)
                      }
                      
                      return (
                      <div key={`game-${qi}`} className="bg-white rounded-lg border-2 border-blue-200 p-2 sm:p-3">
                        {/* 게임 헤더 */}
                        <div className="flex items-center justify-center mb-2">
                          <div className="inline-flex items-center justify-center px-2.5 py-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full">
                            <span className="text-xs sm:text-sm font-bold text-white">G{qi+1}</span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {/* 경기장 A */}
                          <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg p-2 border border-emerald-200">
                            <div className="text-center mb-2">
                              <span className="inline-block px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded">경기장 A</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {[0, 1].map((position) => {
                                const teamIdx = fieldA[position]
                                const val = teamIdx !== null ? (qs[teamIdx]?.[qi] ?? 0) : 0
                                return (
                                  <div key={`fieldA-${position}`} className="bg-white rounded p-1.5 border border-emerald-300">
                                    {/* 팀 선택 드롭다운 */}
                                    <select
                                      className="w-full text-[10px] text-center text-gray-700 font-medium mb-1 bg-emerald-50 border border-emerald-300 rounded px-1 py-0.5 cursor-pointer hover:bg-emerald-100"
                                      value={teamIdx ?? ''}
                                      onChange={(e) => {
                                        const value = e.target.value === '' ? null : Number(e.target.value)
                                        updateMatchup(0, position, value)
                                      }}
                                    >
                                      <option value="">팀 선택</option>
                                      {draftTeams.map((_, ti) => {
                                        // 현재 선택된 팀이거나 아직 사용되지 않은 팀만 표시
                                        const isCurrentSelection = ti === teamIdx
                                        const isUsed = usedTeams.has(ti) && !isCurrentSelection
                                        return (
                                          <option key={ti} value={ti} disabled={isUsed}>
                                            팀 {ti + 1} {isUsed ? '(사용중)' : ''}
                                          </option>
                                        )
                                      })}
                                    </select>
                                    {teamIdx !== null ? (
                                      <div className="flex items-center gap-0.5 justify-center">
                                        <button
                                          className="rounded bg-white border border-gray-300 hover:bg-red-50 w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-600 transition-all disabled:opacity-30 font-bold text-xs"
                                          disabled={val <= 0}
                                          onClick={() => {
                                            const next = qs.map(a=>a.slice())
                                            next[teamIdx][qi] = Math.max(0, val - 1)
                                            setQuarterScores(next)
                                            setDirty(true)
                                          }}
                                        >−</button>
                                        <div className="w-8 flex items-center justify-center">
                                          <span className="font-bold text-sm text-gray-800">{val}</span>
                                        </div>
                                        <button
                                          className="rounded bg-emerald-500 hover:bg-emerald-600 w-5 h-5 flex items-center justify-center text-white transition-all disabled:opacity-30 font-bold text-xs"
                                          disabled={val >= 99}
                                          onClick={() => {
                                            const next = qs.map(a=>a.slice())
                                            next[teamIdx][qi] = Math.min(99, val + 1)
                                            setQuarterScores(next)
                                            setDirty(true)
                                          }}
                                        >+</button>
                                      </div>
                                    ) : (
                                      <div className="text-[9px] text-center text-gray-400 py-1">팀 선택 필요</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="text-[9px] text-center text-emerald-700 mt-1.5 font-medium">
                              {fieldA[0] !== null && fieldA[1] !== null 
                                ? `팀${fieldA[0]+1} vs 팀${fieldA[1]+1}`
                                : '팀 선택 필요'}
                            </div>
                          </div>
                          
                          {/* 경기장 B */}
                          {teamLen >= 4 && (
                            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-2 border border-purple-200">
                              <div className="text-center mb-2">
                                <span className="inline-block px-2 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded">경기장 B</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {[0, 1].map((position) => {
                                  const teamIdx = fieldB[position]
                                  const val = teamIdx !== null ? (qs[teamIdx]?.[qi] ?? 0) : 0
                                  return (
                                    <div key={`fieldB-${position}`} className="bg-white rounded p-1.5 border border-purple-300">
                                      {/* 팀 선택 드롭다운 */}
                                      <select
                                        className="w-full text-[10px] text-center text-gray-700 font-medium mb-1 bg-purple-50 border border-purple-300 rounded px-1 py-0.5 cursor-pointer hover:bg-purple-100"
                                        value={teamIdx ?? ''}
                                        onChange={(e) => {
                                          const value = e.target.value === '' ? null : Number(e.target.value)
                                          updateMatchup(1, position, value)
                                        }}
                                      >
                                        <option value="">팀 선택</option>
                                        {draftTeams.map((_, ti) => {
                                          // 현재 선택된 팀이거나 아직 사용되지 않은 팀만 표시
                                          const isCurrentSelection = ti === teamIdx
                                          const isUsed = usedTeams.has(ti) && !isCurrentSelection
                                          return (
                                            <option key={ti} value={ti} disabled={isUsed}>
                                              팀 {ti + 1} {isUsed ? '(사용중)' : ''}
                                            </option>
                                          )
                                        })}
                                      </select>
                                      {teamIdx !== null ? (
                                        <div className="flex items-center gap-0.5 justify-center">
                                          <button
                                            className="rounded bg-white border border-gray-300 hover:bg-red-50 w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-600 transition-all disabled:opacity-30 font-bold text-xs"
                                            disabled={val <= 0}
                                            onClick={() => {
                                              const next = qs.map(a=>a.slice())
                                              next[teamIdx][qi] = Math.max(0, val - 1)
                                              setQuarterScores(next)
                                              setDirty(true)
                                            }}
                                          >−</button>
                                          <div className="w-8 flex items-center justify-center">
                                            <span className="font-bold text-sm text-gray-800">{val}</span>
                                          </div>
                                          <button
                                            className="rounded bg-purple-500 hover:bg-purple-600 w-5 h-5 flex items-center justify-center text-white transition-all disabled:opacity-30 font-bold text-xs"
                                            disabled={val >= 99}
                                            onClick={() => {
                                              const next = qs.map(a=>a.slice())
                                              next[teamIdx][qi] = Math.min(99, val + 1)
                                              setQuarterScores(next)
                                              setDirty(true)
                                            }}
                                          >+</button>
                                        </div>
                                      ) : (
                                        <div className="text-[9px] text-center text-gray-400 py-1">팀 선택 필요</div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="text-[9px] text-center text-purple-700 mt-1.5 font-medium">
                                {fieldB[0] !== null && fieldB[1] !== null 
                                  ? `팀${fieldB[0]+1} vs 팀${fieldB[1]+1}`
                                  : '팀 선택 필요'}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )})}
                  </>
                )}
              </div>
              
              {/* Quick Actions - Hidden on mobile, shown on larger screens */}
              <div className="mt-2 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-200 flex items-center justify-end">
                <button 
                  className="px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="모든 게임 점수 초기화"
                  onClick={()=> setConfirmDelete({ open: true, id: '__reset_quarter_scores__' })}
                >
                  초기화
                </button>
              </div>
            </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 mt-2 sm:mt-3">
              <button className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors" title="주장/게임 점수 입력값을 모두 비웁니다." onClick={()=>{
                // reset editors to a clearly empty state
                setCaptainIds(initialSnap.map(()=>null))
                setQuarterScores(initialSnap.map(()=>[]))
                setDirty(true)
              }}>전체 초기화</button>
              <button className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-3 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-semibold shadow-md transition-all hover:shadow-lg" onClick={()=>{
                // save snapshot + draft info + draft mode
                const patch = { 
                  snapshot: draftSnap, 
                  attendeeIds: draftSnap.flat(),
                  multiField: multiFieldMode, // 2개 경기장 모드 저장
                  gameMatchups: multiFieldMode ? gameMatchups : undefined // 매치업 정보 저장
                }
                
                if (localDraftMode) {
                  // 드래프트 모드: draft 객체에 모든 정보 저장
                  patch.selectionMode = 'draft'
                  patch.draft = {
                    ...(m.draft || {}),
                    captains: captainIds,
                    quarterScores: quarterScores
                  }
                } else {
                  // 일반 모드: draft 필드 제거하지 않고 quarterScores만 최상위로
                  patch.selectionMode = null
                  patch.quarterScores = quarterScores
                  // 기존 draft 데이터는 유지 (captains 등)
                  if (m.draft) {
                    patch.draft = {
                      ...m.draft,
                      quarterScores: quarterScores
                    }
                  }
                }
                
                onUpdateMatch?.(m.id, patch); setDirty(false)
              }}>저장하기</button>
            </div>
          </div>
        )
      })()}

      {isAdmin&&<QuickAttendanceEditor players={players} snapshot={draftSnap} onDraftChange={setSnap} customMemberships={customMemberships}/>}
      {isAdmin&&dirty&&(
        <div className="mt-3 flex items-center justify-end gap-2">
          <button className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm" onClick={resetDraft} title="변경사항 취소">취소</button>
          <button className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700" onClick={saveDraft} title="변경사항 저장">저장</button>
        </div>
      )}

      {/* 🎥 유튜브: 카드 내부 썸네일 + 어드민 입력 */}
      <div className="mt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600">🎥 Match Video(s)</div>

        {/* 썸네일 그리드 (있는 경우에만) */}
        {ytEntries.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ytEntries.map((e,i)=>(
              <div key={`${e.id}-${i}`} className="relative">
                <YouTubeThumb
                  videoId={e.id}
                  title={e.title}
                  dateKey={m?.dateISO || m?.date || ""}
                />
                {/* 어드민만 삭제 버튼 표시 */}
                {isAdmin && typeof e.sourceIndex === 'number' && (
                  <button
                    className="absolute right-2 top-2 rounded bg-white/95 px-2 py-0.5 text-[11px] text-red-700 shadow hover:bg-white"
                    title="삭제"
                    onClick={()=>removeVideoBySourceIndex(e.sourceIndex)}
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500">{t('matchHistory.noVideoLinks')}</div>
        )}

        {/* 어드민: 링크+제목 추가 */}
        {isAdmin && (
          <VideoAdder onAdd={addVideo}/>
        )}
      </div>
        </div>
      )}
    </li>
  )
})

/* -------------------- 최신순 정렬 & 리스트 ------------------- */
function _ts(m){
  const cand = m?.dateISO || m?.dateIso || m?.dateiso || m?.date || m?.dateStr
  const t = cand ? new Date(cand).getTime() : NaN
  if(!Number.isFinite(t)) return 0
  return t
}

export default function SavedMatchesList({
  matches=[],
  players=[],
  isAdmin=false,
  enableLoadToPlanner=false,
  onLoadToPlanner,
  onDeleteMatch,
  onUpdateMatch,
  showTeamOVRForAdmin=false,
  hideOVR=false,
  highlightedMatchId=null, // 하이라이트할 매치 ID
  customMemberships=[] // 커스텀 멤버십 설정
}){
  const { t } = useTranslation()
  const highlightedMatchRef = useRef(null)
  const ordered = useMemo(()=>matches.slice().sort((a,b)=>_ts(b)-_ts(a)),[matches])
  // ✅ 가장 최신 draft 매치의 ID를 계산
  const latestDraftId = useMemo(()=>{
    for (const mm of ordered){
      if (mm?.selectionMode === 'draft' || mm?.draftMode || mm?.draft) return mm.id
    }
    return null
  }, [ordered])
  
  // 🎯 각 매치의 펼침/접힘 상태 관리 (기본적으로 최근 5개만 펼침)
  const [expandedMatches, setExpandedMatches] = useState(() => {
    const initial = new Set()
    ordered.slice(0, 5).forEach(m => initial.add(m.id))
    return initial
  })
  
  const toggleExpand = (matchId) => {
    setExpandedMatches(prev => {
      const next = new Set(prev)
      if (next.has(matchId)) {
        next.delete(matchId)
      } else {
        next.add(matchId)
      }
      return next
    })
  }
  
  // ✅ 하이라이트된 매치가 있을 때 스크롤 & 자동 펼침
  useEffect(() => {
    if (highlightedMatchId) {
      setExpandedMatches(prev => new Set(prev).add(highlightedMatchId))
      if (highlightedMatchRef.current) {
        setTimeout(() => {
          highlightedMatchRef.current?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          })
        }, 100)
      }
    }
  }, [highlightedMatchId])
  return (
    <>
      <ul className="grid gap-3">
        {ordered.map((m) => (
          <MatchCard
            key={m.id}
            ref={highlightedMatchId === m.id ? highlightedMatchRef : null}
            m={m}
            players={players}
            isAdmin={isAdmin}
            enableLoadToPlanner={enableLoadToPlanner}
            onLoadToPlanner={onLoadToPlanner}
            onDeleteMatch={onDeleteMatch}
            onUpdateMatch={onUpdateMatch}
            showTeamOVRForAdmin={showTeamOVRForAdmin}
            hideOVR={hideOVR}
            latestDraftId={latestDraftId}
            isHighlighted={m.id === highlightedMatchId}
            customMemberships={customMemberships}
            isExpanded={expandedMatches.has(m.id)}
            onToggleExpand={() => toggleExpand(m.id)}
          />
        ))}
        {ordered.length===0&&<li className="text-sm text-stone-500">표시할 매치가 없습니다.</li>}
      </ul>
      
      {/* CSS 스타일 */}
      <style>{`
        @keyframes livePulse {
          0%, 100% {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
            transform: scale(1);
          }
          50% {
            background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
            box-shadow: 0 0 12px rgba(239, 68, 68, 0.8);
            transform: scale(1.02);
          }
        }
        
        @keyframes liveDotBreathe {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.2);
          }
        }
        
        .live-badge-natural {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          border: 1px solid #f87171;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
          animation: livePulse 3s infinite ease-in-out;
          will-change: transform, box-shadow, background;
        }
        
        .live-dot {
          animation: liveDotBreathe 2s infinite ease-in-out;
          will-change: opacity, transform;
        }
        
        /* 접근성 - 애니메이션 감소 선호 사용자 */
        @media (prefers-reduced-motion: reduce) {
          .live-badge-natural {
            animation: none !important;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
          }
          
          .live-dot {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}
