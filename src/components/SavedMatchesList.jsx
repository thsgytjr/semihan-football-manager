// src/components/SavedMatchesList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import InitialAvatar from "./InitialAvatar"
import { overall } from "../lib/players"
import { hydrateMatch } from "../lib/match"
import { formatMatchLabel } from "../lib/matchLabel"

const S = (v)=>v==null?"":String(v)
const isMember = (m)=>{ const s=S(m).trim().toLowerCase(); return s==="member"||s.includes("정회원") }
const GuestBadge = ()=>(
  <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">G</span>
)
const kitForTeam=(i)=>[
  {label:"화이트",headerClass:"bg-white text-stone-800 border-b border-stone-300"},
  {label:"블랙",headerClass:"bg-stone-900 text-white border-b border-stone-900"},
  {label:"블루",headerClass:"bg-blue-600 text-white border-b border-blue-700"},
  {label:"레드",headerClass:"bg-red-600 text-white border-b border-red-700"},
  {label:"그린",headerClass:"bg-emerald-600 text-white border-b border-emerald-700"},
  {label:"퍼플",headerClass:"bg-violet-600 text-white border-b border-violet-700"},
  {label:"오렌지",headerClass:"bg-orange-500 text-white border-b border-orange-600"},
  {label:"티얼",headerClass:"bg-teal-600 text-white border-b border-teal-700"},
  {label:"핑크",headerClass:"bg-pink-600 text-white border-b border-pink-700"},
  {label:"옐로",headerClass:"bg-yellow-400 text-stone-900 border-b border-yellow-500"},
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

/* 요금 계산: 게스트 없으면 균등 분배, 있으면 +$2 규칙 */
function deriveFeesFromSnapshot(m, players){
  const ids=Array.isArray(m?.snapshot)&&m.snapshot.length?m.snapshot.flat():Array.isArray(m?.attendeeIds)?m.attendeeIds:[]
  const map=new Map(players.map(p=>[String(p.id),p])), atts=ids.map(id=>map.get(String(id))).filter(Boolean)
  const memberCount=atts.filter(p=>isMember(p.membership)).length, guestCount=Math.max(0, atts.length-memberCount)
  if(m?.fees&&typeof m.fees.memberFee==="number"&&typeof m.fees.guestFee==="number") return {...m.fees,memberCount,guestCount,_estimated:false}
  const preset=(m?.location?.preset||"").toLowerCase()
  const total = preset==="indoor-soccer-zone"?230 : preset==="coppell-west"?300 : (m?.fees?.total||0)
  if(!total||atts.length===0) return { total: total||0, memberFee:0, guestFee:0, memberCount, guestCount, _estimated:true }
  let memberFee=0, guestFee=0
  if(guestCount===0){
    memberFee=Math.round(total/Math.max(1,memberCount))
  }else{
    const denom=memberCount+guestCount, mEach=(total-2*guestCount)/Math.max(1,denom)
    memberFee=Math.max(0,Math.round(mEach)); guestFee=memberFee+2
    const diff=total-(memberCount*memberFee+guestCount*guestFee)
    if(diff){ const adj=Math.max(-2,Math.min(2,diff)); memberFee=Math.max(0,memberFee+adj); guestFee=memberFee+2 }
  }
  return { total, memberFee, guestFee, memberCount, guestCount, _estimated:true }
}

/* 유튜브 링크 입력 */
function VideoAdder({ onAdd }){
  const [val,setVal]=useState("")
  return (
    <div className="flex items-center gap-2">
      <input className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..." value={val} onChange={e=>setVal(e.target.value)}/>
      <button className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" onClick={()=>{const u=val.trim(); if(!u)return; onAdd(u); setVal("")}}>추가</button>
    </div>
  )
}

/* 빠른 출석 편집(드래프트만 수정) */
function QuickAttendanceEditor({ players, snapshot, onDraftChange }){
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
          {snapshot.map((_,i)=><option key={i} value={i}>팀 {i+1}</option>)}
        </select>
        <div className="relative min-w-[220px] flex-1">
          <input className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" placeholder="이름 검색 후 추가 (Enter)"
            value={q} onChange={e=>{setQ(e.target.value); setOpen(true); setHi(-1)}} onFocus={()=>setOpen(true)} onKeyDown={onKey}/>
          {open&&list.length>0&&(
            <div ref={listRef} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg" role="listbox" aria-label="가용 선수 목록">
              {list.map((p,idx)=>(
                <button key={p.id} type="button" data-idx={idx}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 ${idx===hi?"bg-gray-100":""}`}
                  onMouseEnter={()=>setHi(idx)} onMouseDown={e=>e.preventDefault()} onClick={()=>add(p)}>
                  <InitialAvatar id={p.id} name={p.name} size={22}/><span className="truncate">{p.name}</span>
                  {(p.position||p.pos)==="GK"&&<span className="ml-auto text-[11px] text-gray-400">GK</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs" onClick={()=>add(q)}>추가</button>
      </div>
    </div>
  )
}

/* 매치 카드 */
function MatchCard({ m, players, isAdmin, enableLoadToPlanner, onLoadToPlanner, onDeleteMatch, onUpdateMatch, showTeamOVRForAdmin, hideOVR }){
  const hydrated=useMemo(()=>hydrateMatch(m,players),[m,players])
  const initialSnap=useMemo(()=>normalizeSnapshot(m,hydrated.teams||[]),[m,hydrated.teams])
  const [draftSnap,setDraftSnap]=useState(initialSnap), [dirty,setDirty]=useState(false)
  const byId=useMemo(()=>new Map(players.map(p=>[String(p.id),p])),[players])
  const draftTeams=useMemo(()=>draftSnap.map(ids=>ids.map(id=>byId.get(String(id))).filter(Boolean)),[draftSnap,byId])
  const draftCount=useMemo(()=>draftSnap.flat().length,[draftSnap])
  const label=useMemo(()=>formatMatchLabel({...m,snapshot:draftSnap},{withDate:true,withCount:true,count:draftCount}),[m,draftSnap,draftCount])
  const fees=useMemo(()=>deriveFeesFromSnapshot({...m,snapshot:draftSnap},players),[m,draftSnap,players])
  const formatLabel=deriveFormatByLocation(m)
  const addVideo=(url)=>onUpdateMatch?.(m.id,{videos:[...(m.videos||[]),url]})
  const removeVideo=(idx)=>onUpdateMatch?.(m.id,{videos:(m.videos||[]).filter((_,i)=>i!==idx)})
  const setSnap=(next)=>{ setDraftSnap(next); setDirty(true) }
  const resetDraft=()=>{ setDraftSnap(initialSnap); setDirty(false) }
  const saveDraft=()=>{ onUpdateMatch?.(m.id,{snapshot:draftSnap,attendeeIds:draftSnap.flat()}); setDirty(false) }

  // ✅ 매치 카드 안의 팀 테이블을 "팀 수"에 맞춰 가로로 꽉 채우기 (최대 4열)
  const teamCols = Math.max(1, Math.min(4, draftTeams.length))
  const gridStyle = { gridTemplateColumns: `repeat(${teamCols}, minmax(0, 1fr))` }

  return (
    <li className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm"><b>{label}</b> · {formatLabel} · {m.teamCount}팀{m.location?.name&&<> · 장소 {m.location.name}</>}{dirty&&<span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 border border-amber-200">수정됨(저장 필요)</span>}</div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500">표기: <GuestBadge/> 게스트</div>
          {enableLoadToPlanner&&<button className="text-xs rounded border border-gray-300 bg-white px-2 py-1" onClick={()=>onLoadToPlanner?.(m)}>팀배정에 로드</button>}
          {isAdmin&&onDeleteMatch&&<button className="text-xs text-red-600" onClick={()=>{ if(window.confirm("정말 삭제하시겠어요?\n삭제 시 대시보드의 공격포인트/기록 집계에 영향을 줄 수 있습니다.")) onDeleteMatch(m.id) }}>삭제</button>}
        </div>
      </div>

      <div className="mb-2 text-xs text-gray-800">
        💰 총액 ${fees?.total??0}
        {typeof fees?.memberFee==="number"&&(
          <> · 멤버 ${fees.memberFee}/인{fees?.guestCount>0&&typeof fees?.guestFee==="number"&&<> · 게스트 ${fees.guestFee}/인</>}{fees?._estimated&&<span className="opacity-70"> · 추정</span>}</>
        )}
      </div>

      {/* ⬇️ 여기: 팀 수에 맞춰 1~4열 그리드로 자동 배치 */}
      <div className="grid gap-2 sm:gap-3" style={gridStyle}>
        {draftTeams.map((list,i)=>{
          const kit=kitForTeam(i), nonGK=list.filter(p=>(p.position||p.pos)!=="GK")
          const sum=nonGK.reduce((a,p)=>a+(p.ovr??overall(p)),0), avg=nonGK.length?Math.round(sum/nonGK.length):0
          return (
            <div key={i} className="space-y-1 overflow-hidden rounded border border-gray-200">
              <div className={`flex items-center justify-between px-3 py-1.5 text-xs ${kit.headerClass}`}>
                <div className="font-semibold">팀 {i+1}</div>
                {isAdmin&&showTeamOVRForAdmin&&!hideOVR
                  ? <div className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</div>
                  : <div className="opacity-80">{kit.label} · {list.length}명</div>}
              </div>
              <ul className="divide-y divide-gray-100">
                {list.map(p=>{
                  const member=isMember(p.membership)
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span className="flex items-center gap-2 min-w-0 flex-1">
                        <InitialAvatar id={p.id} name={p.name} size={22}/>
                        <span className="truncate">{p.name}{(p.position||p.pos)==="GK"&&<em className="ml-1 text-xs text-gray-400">(GK)</em>}</span>
                        {!member&&<GuestBadge/>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {isAdmin&&showTeamOVRForAdmin&&!hideOVR&&(p.position||p.pos)!=="GK"&&<span className="text-gray-500">OVR {p.ovr??overall(p)}</span>}
                        {isAdmin&&(
                          <button className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                            title="이 팀에서 제외 (저장 전 초안)"
                            onClick={()=>setSnap(draftSnap.map((arr,idx)=>idx===i?arr.filter(id=>String(id)!==String(p.id)):arr))}
                          >제외</button>
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

      {isAdmin&&<QuickAttendanceEditor players={players} snapshot={draftSnap} onDraftChange={setSnap}/>}
      {isAdmin&&dirty&&(
        <div className="mt-3 flex items-center justify-end gap-2">
          <button className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm" onClick={resetDraft} title="변경사항 취소">취소</button>
          <button className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700" onClick={saveDraft} title="변경사항 저장">저장</button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600">🎥 유튜브 링크</div>
        {(m.videos&&m.videos.length>0)?(
          <ul className="flex flex-wrap gap-2">
            {m.videos.map((url,idx)=>(
              <li key={idx} className="flex items-center gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="max-w-[240px] truncate rounded border border-gray-300 bg-white px-2 py-1 text-xs text-blue-600 hover:bg-blue-50" title={url}>{url}</a>
                {isAdmin&&onUpdateMatch&&<button className="text-[11px] text-red-600" onClick={()=>removeVideo(idx)} title="삭제">삭제</button>}
              </li>
            ))}
          </ul>
        ):<div className="text-xs text-gray-500">등록된 링크가 없습니다.</div>}
        {isAdmin&&onUpdateMatch&&<VideoAdder onAdd={addVideo}/>}
      </div>
    </li>
  )
}

/* 유틸: 최신순 정렬용 날짜 파서 */
function _ts(m){
  const cand = m?.dateISO || m?.dateIso || m?.dateiso || m?.date || m?.dateStr
  const t = cand ? new Date(cand).getTime() : NaN
  if(!Number.isFinite(t)) return 0
  return t
}

/* 메인 리스트 */
export default function SavedMatchesList({
  matches=[],
  players=[],
  isAdmin=false,
  enableLoadToPlanner=false,
  onLoadToPlanner,
  onDeleteMatch,
  onUpdateMatch,
  showTeamOVRForAdmin=true,
  hideOVR=false
}){
  if(!matches?.length) return <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div>

  // ✅ 최신 매치가 항상 위로 오도록 정렬 (dateISO 내림차순, fallback로 id/생성순은 유지)
  const sorted = useMemo(()=>{
    // 동일 타임스탬프일 땐 원래 입력 순서 유지 (안정 정렬 흉내)
    return matches.slice().sort((a,b)=>_ts(b)-_ts(a))
  },[matches])

  return (
    <ul className="space-y-2">
      {sorted.map(m=>(
        <MatchCard key={m.id} m={m} players={players} isAdmin={isAdmin}
          enableLoadToPlanner={enableLoadToPlanner} onLoadToPlanner={onLoadToPlanner}
          onDeleteMatch={onDeleteMatch} onUpdateMatch={onUpdateMatch}
          showTeamOVRForAdmin={showTeamOVRForAdmin} hideOVR={hideOVR}/>
      ))}
    </ul>
  )
}
