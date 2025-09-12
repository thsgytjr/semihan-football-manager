// src/pages/MatchPlanner.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Card from '../components/Card'
import { mkMatch, decideMode, splitKTeams, hydrateMatch } from '../lib/match'
import { downloadJSON } from '../utils/io'
import { overall } from '../lib/players'

// dnd-kit
import {
  DndContext, DragOverlay, pointerWithin,
  PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, useDraggable
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/* ─ Formation helpers (내장) ─ */
const TEMPLATES={
  '4-3-3':[[92,[50]],[75,[12,35,65,88]],[55,[25,50,75]],[35,[20,50,80]]],
  '4-4-2':[[92,[50]],[75,[12,35,65,88]],[55,[15,40,60,85]],[35,[40,60]]],
  '3-5-2':[[92,[50]],[75,[30,50,70]],[55,[12,32,50,68,88]],[35,[45,55]]],
  '3-3-2':[[92,[50]],[75,[25,50,75]],[55,[30,50,70]],[35,[45,55]]],
  '3-2-3':[[92,[50]],[75,[25,50,75]],[55,[40,60]],[35,[20,50,80]]],
  '2-3-1':[[92,[50]],[72,[35,65]],[50,[25,50,75]],[30,[50]]],
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
const pct=(v)=>clamp(v,0,100)
const gridOf=(f)=>TEMPLATES[f]??TEMPLATES['4-3-3']
const countPositions=(list)=>list.reduce((a,p)=>{const r=(p.position||p.pos)||'FW';a[r]=(a[r]||0)+1;return a},{})
const recommendFormation=({count,mode='auto',positions={}})=>{
  const large=mode==='11v11'||(mode==='auto'&&count>=18)
  const medium=mode==='9v9'||(mode==='auto'&&count>=14&&count<18)
  if(large){ if((positions.DF||0)>=4&&(positions.FW||0)>=3) return '4-3-3'
             if((positions.MF||0)>=4) return '4-4-2'; return '3-5-2' }
  if(medium) return (positions.FW||0)>=3?'3-2-3':'3-3-2'
  return '2-3-1'
}
const assignToFormation = ({ players, formation }) => {
  const g = gridOf(formation) || []; // g가 undefined일 경우 빈 배열로 초기화
  const slots = g.flatMap(([y, xs]) => xs.map((x) => ({ x, y })));

  const order = [...players].sort(
    (a, b) =>
      ({ GK: 0, DF: 1, MF: 2, FW: 3 }[(a.position || a.pos) || 'FW'] -
      { GK: 0, DF: 1, MF: 2, FW: 3 }[(b.position || b.pos) || 'FW'])
  );

  const last = g[0] || { 0: 92, 1: [50] }; // 기본값 추가
  const gkSlots = (last[1] || [50]).map((x) => ({
    x,
    y: last[0] ?? 92, // 안전하게 last[0] 참조
  }));

  let field = 0,
    gkUsed = 0;

  return order.map((p) => {
    const role = (p.position || p.pos) || 'FW';
    if (role === 'GK' && gkUsed < gkSlots.length) {
      const s = gkSlots[gkUsed++];
      return { id: p.id, name: p.name, role, x: s.x, y: s.y };
    }
    const s = slots[field++] || slots[slots.length - 1] || { x: 50, y: 60 }; // 기본값 추가
    return { id: p.id, name: p.name, role, x: s.x, y: s.y };
  });
};

/* ─ 메인 ─ */
export default function MatchPlanner({ players, matches, onSaveMatch, onDeleteMatch }){
  const [dateISO,setDateISO]=useState(()=>new Date().toISOString().slice(0,16))
  const [attendeeIds,setAttendeeIds]=useState([])
  const [criterion,setCriterion]=useState('overall')
  const [teamCount,setTeamCount]=useState(2)
  const [hideOVR,setHideOVR]=useState(false)
  const [shuffleSeed,setShuffleSeed]=useState(0)
  const [locationPreset,setLocationPreset]=useState('coppell-west')
  const [locationName,setLocationName]=useState('Coppell Middle School - West')
  const [locationAddress,setLocationAddress]=useState('2701 Ranch Trail, Coppell, TX 75019')
  const [manualTeams,setManualTeams]=useState(null)
  const [activePlayerId,setActivePlayerId]=useState(null)
  const [activeFromTeam,setActiveFromTeam]=useState(null)

  // 필드 포메이션 상태
  const [formation,setFormation]=useState('4-3-3')
  const [selectedTeamIdx,setSelectedTeamIdx]=useState(0)
  const [boardPlaced,setBoardPlaced]=useState([])

  const count=attendeeIds.length, autoSuggestion=decideMode(count), mode=autoSuggestion.mode
  const teams=Math.max(2,Math.min(10,Number(teamCount)||2))
  const attendees=useMemo(()=>players.filter(p=>attendeeIds.includes(p.id)),[players,attendeeIds])
  const autoSplit=useMemo(()=>splitKTeams(attendees,teams,criterion),[attendees,teams,criterion])

  useEffect(()=>{ setManualTeams(null); setShuffleSeed(0) },[attendees,teams,criterion])

  const previewTeams=useMemo(()=>{
    let base=manualTeams??autoSplit.teams
    if(!manualTeams&&shuffleSeed) base=base.map(list=>seededShuffle(list,shuffleSeed+list.length))
    return base
  },[manualTeams,autoSplit.teams,shuffleSeed])

  const currentTeam=previewTeams[selectedTeamIdx]??[]
  useEffect(()=>{
    const pos=countPositions(currentTeam)
    const f=recommendFormation({count:currentTeam.length,mode,positions:pos})
    setFormation(f)
    setBoardPlaced(assignToFormation({players:currentTeam,formation:f}))
  },[currentTeam,mode])

  function toggle(id){ setAttendeeIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]) }
  function save(){
    onSaveMatch(mkMatch({
      id:crypto.randomUUID?.()||String(Date.now()),
      dateISO, attendeeIds, criterion, players, selectionMode:'manual',
      teamCount:teams, location:{preset:locationPreset,name:locationName,address:locationAddress},
      mode, snapshot:previewTeams.map(t=>t.map(p=>p.id))
    }))
  }
  function exportTeams(){
    const sumsNoGK=previewTeams.map(list=>list.filter(p=>(p.position||p.pos)!=='GK').reduce((a,p)=>a+(p.ovr??overall(p)),0))
    const avgsNoGK=sumsNoGK.map((sum,i)=>{const n=previewTeams[i].filter(p=>(p.position||p.pos)!=='GK').length;return n?Math.round(sum/n):0})
    downloadJSON({
      dateISO,mode,teamCount:teams,criterion,selectionMode:'manual',
      location:{preset:locationPreset,name:locationName,address:locationAddress},
      teams:previewTeams.map(t=>t.map(p=>({id:p.id,name:p.name,pos:p.position,ovr:p.ovr??overall(p)}))),
      sums:autoSplit.sums,sumsNoGK,avgsNoGK
    },`match_${dateISO.replace(/[:T]/g,'-')}.json`)
  }

  const allSelected=attendeeIds.length===players.length&&players.length>0
  function toggleSelectAll(){ allSelected?setAttendeeIds([]):setAttendeeIds(players.map(p=>p.id)) }

  // 팀 칼럼 DnD
  const sensors=useSensors(
    useSensor(PointerSensor,{activationConstraint:{distance:4}}),
    useSensor(TouchSensor,{activationConstraint:{delay:120,tolerance:6}})
  )
  function findTeamIndexByItemId(itemId){
    return previewTeams.findIndex(list=>list.some(p=>String(p.id)===String(itemId)))
  }
  function onDragStartHandler(e){ setActivePlayerId(e.active.id); setActiveFromTeam(findTeamIndexByItemId(e.active.id)); document.body.classList.add('cursor-grabbing') }
  function onDragCancel(){ setActivePlayerId(null); setActiveFromTeam(null); document.body.classList.remove('cursor-grabbing') }
  function onDragEndHandler(e){
    const {active,over}=e; setActivePlayerId(null); document.body.classList.remove('cursor-grabbing'); if(!over) return
    const from=activeFromTeam, overId=String(over.id)
    const to=overId.startsWith('team-')?Number(overId.split('-')[1]):findTeamIndexByItemId(overId)
    if(from==null||to==null||from<0||to<0) return
    const base=manualTeams??previewTeams, next=base.map(l=>l.slice())
    const fromIdx=next[from].findIndex(p=>String(p.id)===String(active.id)); if(fromIdx<0) return
    const moving=next[from][fromIdx]; next[from].splice(fromIdx,1)
    const overIdx=next[to].findIndex(p=>String(p.id)===overId)
    next[to].splice(overId.startsWith('team-')?next[to].length:(overIdx>=0?overIdx:next[to].length),0,moving)
    setManualTeams(next); setActiveFromTeam(null)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_600px]">
      <Card title="매치 설정"
        right={<div className="flex items-center gap-2">
          <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" value={criterion} onChange={e=>setCriterion(e.target.value)}>
            <option value="overall">전체</option><option value="attack">공격</option><option value="defense">수비</option><option value="pace">스피드</option>
          </select>
          <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">추천 {autoSuggestion.mode} · {autoSuggestion.teams}팀</span>
        </div>}
      >
        <div className="grid gap-4">
          <Row label="날짜/시간">
            <input type="datetime-local" value={dateISO} onChange={e=>setDateISO(e.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2" />
          </Row>

          <Row label="장소">
            <div className="grid gap-2">
              <select className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                value={locationPreset}
                onChange={e=>{
                  const v=e.target.value; setLocationPreset(v)
                  if(v==='coppell-west'){setLocationName('Coppell Middle School - West'); setLocationAddress('2701 Ranch Trail, Coppell, TX 75019')}
                  else if(v==='indoor-soccer-zone'){setLocationName('Indoor Soccer Zone'); setLocationAddress('2323 Crown Rd, Dallas, TX 75229')}
                  else{ setLocationName(''); setLocationAddress('') }
                }}>
                <option value="coppell-west">Coppell Middle School - West</option>
                <option value="indoor-soccer-zone">Indoor Soccer Zone</option>
                <option value="other">Other (Freeform)</option>
              </select>
              {locationPreset!=='other'
                ? <div className="text-xs text-gray-500">주소: {locationAddress}</div>
                : <div className="grid gap-2 sm:grid-cols-2">
                    <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="장소 이름" value={locationName} onChange={e=>setLocationName(e.target.value)} />
                    <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="주소" value={locationAddress} onChange={e=>setLocationAddress(e.target.value)} />
                  </div>}
            </div>
          </Row>

          <Row label="팀 수">
            <div className="flex items-center gap-3">
              <select className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" value={teams} onChange={e=>setTeamCount(Number(e.target.value))}>
                {Array.from({length:9},(_,i)=>i+2).map(n=><option key={n} value={n}>{n}팀</option>)}
              </select>
              <span className="text-xs text-gray-500">적용: {mode} · {teams}팀</span>
            </div>
          </Row>

          <Row label={<span className="flex items-center gap-2">참석 ({attendeeIds.length}명)
            <button type="button" onClick={toggleSelectAll}
              className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
              {allSelected?'모두 해제':'모두 선택'}</button></span>}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {players.map(p=>(
                <label key={p.id} className={`flex items-center gap-2 rounded border px-3 py-2 ${attendeeIds.includes(p.id)?'border-emerald-400 bg-emerald-50':'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={attendeeIds.includes(p.id)} onChange={()=>toggle(p.id)} />
                  <InitialAvatar id={p.id} name={p.name} size={24} />
                  <span className="text-sm flex-1 whitespace-normal break-words">
                    {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                  </span>
                  {!hideOVR && (p.position||p.pos)!=='GK' && <span className="text-xs text-gray-500 shrink-0">OVR {p.ovr??overall(p)}</span>}
                </label>
              ))}
            </div>
          </Row>

          <div className="flex gap-2">
            <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 text-white font-semibold">매치 저장</button>
            <button onClick={exportTeams} className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700">라인업 Export</button>
          </div>
        </div>
      </Card>

      {/* 우측: 포메이션 보드 + 팀 미리보기 */}
      <div className="grid gap-4">
        <Card title="포메이션 추천 & 필드 보드(BETA)"
          right={<div className="flex items-center gap-2">
            <div className="hidden md:flex rounded border border-gray-300 overflow-hidden">
              {previewTeams.map((_,i)=><button key={i} className={`px-2 py-1 text-xs ${i===selectedTeamIdx?'bg-emerald-500 text-white':'bg-white text-gray-700'}`} onClick={()=>setSelectedTeamIdx(i)}>팀{i+1}</button>)}
            </div>
            <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" value={formation} onChange={e=>setFormation(e.target.value)}>
              <option value="4-3-3">4-3-3</option><option value="4-4-2">4-4-2</option>
              <option value="3-5-2">3-5-2</option><option value="3-3-2">9v9 · 3-3-2</option>
              <option value="3-2-3">9v9 · 3-2-3</option><option value="2-3-1">7v7 · 2-3-1</option>
            </select>
            <button onClick={()=>setBoardPlaced(assignToFormation({players:currentTeam,formation}))}
              className="rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-white">자동 배치</button>
          </div>}
        >
          <div className="mb-2 text-xs text-gray-500">
            선택팀: <b>팀 {selectedTeamIdx+1}</b> · 모드: <b>{mode}</b> · 추천: <b>{formation}</b> · 인원: <b>{currentTeam.length}명</b>
          </div>
          <FreePitch players={currentTeam} placed={boardPlaced} setPlaced={setBoardPlaced} />
          <div className="mt-2 text-xs text-gray-500">* 필드 자유 배치 · GK는 하단 골키퍼 존(80~98%)만 이동 가능</div>
        </Card>

        <Card title="팀 배정 미리보기 (드래그 & 드랍 커스텀 가능)"
          right={<div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">기준: {criterion} · <span className="font-medium">GK 평균 제외</span></div>}>
          <Toolbar hideOVR={hideOVR} setHideOVR={setHideOVR}
                   reshuffleTeams={()=>{const seed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;setShuffleSeed(seed);setManualTeams(prev=>(prev??autoSplit.teams).map(l=>seededShuffle(l,seed+l.length)))}}
                   sortTeamsByOVR={(order='desc')=>{
                     const base=manualTeams??previewTeams
                     setManualTeams(base.map(list=>list.slice().sort((a,b)=>{const A=a.ovr??overall(a),B=b.ovr??overall(b);return order==='asc'?A-B:B-A})))
                   }}
                   resetManual={()=>{setManualTeams(null);setShuffleSeed(0)}}
                   manualTeams={manualTeams}/>
          <DndContext sensors={sensors} collisionDetection={pointerWithin}
            onDragStart={onDragStartHandler} onDragCancel={onDragCancel} onDragEnd={onDragEndHandler}>
            <div className="grid gap-4" style={{gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'}}>
              {previewTeams.map((list,i)=><TeamColumn key={i} teamIndex={i} labelKit={kitForTeam(i)} players={list} hideOVR={hideOVR} />)}
            </div>
            <DragOverlay>{activePlayerId? <DragGhost player={players.find(p=>String(p.id)===String(activePlayerId))} hideOVR={hideOVR}/>:null}</DragOverlay>
          </DndContext>
        </Card>

        <Card title="저장된 매치 (최신 선수 정보 반영)" right={<div className="text-xs text-gray-500"><span className="font-medium">GK 평균 제외</span></div>}>
          {matches.length===0 ? <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div> :
          <ul className="space-y-2">
            {matches.map(m=>{
              const hydrated=hydrateMatch(m,players)
              return (
                <li key={m.id} className="rounded border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm"><b>{m.dateISO.replace('T',' ')}</b> · {m.mode} · {m.teamCount}팀 · 참석 {m.attendeeIds.length}명{m.location?.name?<> · 장소 {m.location.name}</>:null}</div>
                    <button className="text-xs text-red-600" onClick={()=>onDeleteMatch(m.id)}>삭제</button>
                  </div>
                  <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'}}>
                    {hydrated.teams.map((list,i)=>{
                      const kit=kitForTeam(i), non=list.filter(p=>(p.position||p.pos)!=='GK')
                      const sum=non.reduce((a,p)=>a+(p.ovr??overall(p)),0), avg=non.length?Math.round(sum/non.length):0
                      return (
                        <div key={i} className="rounded border border-gray-200">
                          <div className={`mb-1 flex items-center justify-between px-2 py-1 text-xs ${kit.headerClass}`}>
                            <span>팀 {i+1}</span><span className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</span>
                          </div>
                          <ul className="space-y-1 p-2 pt-0 text-sm">
                            {list.map(p=>(
                              <li key={p.id} className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0">
                                <span className="flex items-center gap-2 min-w-0 flex-1">
                                  <InitialAvatar id={p.id} name={p.name} size={24} />
                                  <span className="truncate">{p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}</span>
                                </span>
                                {!hideOVR && (p.position||p.pos)!=='GK' && <span className="text-gray-500 shrink-0">OVR {p.ovr??overall(p)}</span>}
                              </li>
                            ))}
                            {list.length===0 && <li className="px-1 py-1 text-xs text-gray-400">팀원 없음</li>}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>}
        </Card>
      </div>
    </div>
  )
}

/* ─ 자유 드래그 필드(아바타 통일, GK 제한) ─ */
function FreePitch({players,placed,setPlaced,height=560}){
  const wrapRef=useRef(null)

  // players 변경 시 기존 좌표 유지하며 merge
  useEffect(()=>{
    const byId=new Map(placed.map(p=>[String(p.id),p]))
    const next=assignToFormation({players,formation:'4-3-3'}).map(d=>byId.get(String(d.id))||d)
    setPlaced(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[players])

  function onEnd(e){
    const {active,delta}=e; if(!active||!wrapRef.current) return
    setPlaced(prev=>{
      const i=prev.findIndex(p=>String(p.id)===String(active.id)); if(i<0) return prev
      const rect=wrapRef.current.getBoundingClientRect()
      const cur=prev[i], curX=cur.x/100*rect.width, curY=cur.y/100*rect.height
      let nx=clamp(curX+delta.x, 18, rect.width-18)
      let ny=clamp(curY+delta.y, 18, rect.height-18)
      if((cur.role||'').toUpperCase()==='GK') ny=clamp(ny, rect.height*0.80, rect.height*0.98)
      const next=prev.slice()
      next[i]={...cur, x:pct(nx/rect.width*100), y:pct(ny/rect.height*100)}
      return next
    })
  }

  return (
    <div ref={wrapRef} className="relative rounded-xl overflow-hidden" style={{height,background:'#0a7e2a'}}>
      <PitchLines/>
      <DndContext onDragEnd={onEnd}>
        {placed.map(p=><FieldDot key={p.id} data={p}/>)}
        <DragOverlay/>
      </DndContext>
      <div className="absolute right-2 top-2 rounded bg-black/40 text-white text-[11px] px-2 py-1">필드 자유 배치 · GK 하단 존</div>
    </div>
  )
}
function FieldDot({ data }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(data.id) });
  const style = {
    transform: CSS.Translate.toString(transform),
    left: `calc(${data.x}% - 18px)`,
    top: `calc(${data.y}% - 18px)`,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute flex flex-col items-center ${isDragging ? 'opacity-80' : ''}`}
      style={style}
      title={`${data.name} (${data.role})`}
    >
      {/* 아바타 */}
      <InitialAvatar id={data.id} name={data.name} size={36} />
      {/* 이름과 포지션 */}
      <div className="mt-1 text-center text-xs text-white">
        <div className="font-semibold">{data.name}</div>
      </div>
    </div>
  );
}

/* ─ 팀 배정 미리보기 구성요소 ─ */
function Row({label,children}){return(
  <div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
    <label className="mt-1 text-sm text-gray-600">{label}</label><div>{children}</div>
  </div>
)}
function Toolbar({hideOVR,setHideOVR,reshuffleTeams,sortTeamsByOVR,resetManual,manualTeams}){
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={hideOVR} onClick={()=>setHideOVR(v=>!v)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${hideOVR?'border-emerald-500 text-emerald-700 bg-emerald-50':'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${hideOVR?'bg-emerald-500':'bg-gray-300'}`}></span>OVR 숨기기
        </button>
        <span className="mx-1 hidden sm:inline-block h-5 w-px bg-gray-200" />
        <button type="button" onClick={reshuffleTeams} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><span className="text-base">🎲</span> 랜덤</button>
        <button type="button" onClick={()=>sortTeamsByOVR('asc')} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><span className="text-base">⬆️</span> OVR</button>
        <button type="button" onClick={()=>sortTeamsByOVR('desc')} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><span className="text-base">⬇️</span> OVR</button>
        {manualTeams && <button type="button" onClick={resetManual} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><span className="text-base">↺</span> 초기화</button>}
      </div>
    </div>
  )
}
function TeamColumn({ teamIndex,labelKit,players,hideOVR }){
  const id=`team-${teamIndex}`; const { setNodeRef,isOver }=useDroppable({ id })
  const non=players.filter(p=>(p.position||p.pos)!=='GK'), sum=non.reduce((a,p)=>a+(p.ovr??overall(p)),0), avg=non.length?Math.round(sum/non.length):0
  return (
    <div ref={setNodeRef} className={`rounded-lg border bg-white transition ${isOver?'border-emerald-500 ring-2 ring-emerald-200':'border-gray-200'}`}>
      <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${labelKit.headerClass}`}>
        <div className="font-semibold">팀 {teamIndex+1}</div><div className="opacity-80">{labelKit.label} · {players.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</div>
      </div>
      <SortableContext id={id} items={players.map(p=>String(p.id))} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1 px-3 pb-3 text-sm min-h-[44px]">
          {isOver && <li className="rounded border-2 border-dashed border-emerald-400/70 bg-emerald-50/40 px-2 py-1 text-xs text-emerald-700">여기에 드롭</li>}
          {players.map(p=><PlayerRow key={p.id} player={p} hideOVR={hideOVR} />)}
          {players.length===0 && !isOver && <li className="text-xs text-gray-400">팀원 없음 — 이 카드로 드래그해서 추가</li>}
        </ul>
      </SortableContext>
    </div>
  )
}
function PlayerRow({ player,hideOVR }){
  const { attributes,listeners,setNodeRef,transform,transition,isDragging }=useSortable({ id:String(player.id) })
  const style={ transform:CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.7 : 1, boxShadow:isDragging?'0 6px 18px rgba(0,0,0,.12)':undefined,
    borderRadius:8, background:isDragging?'rgba(16,185,129,0.06)':undefined }
  return (
    <li ref={setNodeRef} style={style}
      className="flex items-start gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0 touch-manipulation cursor-grab active:cursor-grabbing"
      {...attributes} {...listeners}>
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <InitialAvatar id={player.id} name={player.name} size={24} />
        <span className="whitespace-normal break-words">{player.name} {(player.position||player.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}</span>
      </span>
      {!hideOVR && (player.position||player.pos)!=='GK' && <span className="text-gray-500 text-xs shrink-0">OVR {player.ovr??overall(player)}</span>}
    </li>
  )
}
function DragGhost({ player,hideOVR }){
  if(!player) return null
  return (
    <div className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 shadow-xl text-sm flex items-center gap-2 scale-[1.04]" style={{filter:'drop-shadow(0 8px 20px rgba(0,0,0,.18))'}}>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">⇆</span>
      <span className="font-medium">{player.name}</span>
      {!hideOVR && (player.position||player.pos)!=='GK' && <span className="text-gray-500">OVR {player.ovr??overall(player)}</span>}
    </div>
  )
}
function kitForTeam(i){
  const a=[
    {label:'화이트',headerClass:'bg-white text-stone-800 border-b border-stone-300'},
    {label:'블랙',headerClass:'bg-stone-900 text-white border-b border-stone-900'},
    {label:'블루',headerClass:'bg-blue-600 text-white border-b border-blue-700'},
    {label:'레드',headerClass:'bg-red-600 text-white border-b border-red-700'},
    {label:'그린',headerClass:'bg-emerald-600 text-white border-b border-emerald-700'},
    {label:'퍼플',headerClass:'bg-violet-600 text-white border-b border-violet-700'},
    {label:'오렌지',headerClass:'bg-orange-500 text-white border-b border-orange-600'},
    {label:'티얼',headerClass:'bg-teal-600 text-white border-b border-teal-700'},
    {label:'핑크',headerClass:'bg-pink-600 text-white border-b border-pink-700'},
    {label:'옐로',headerClass:'bg-yellow-400 text-stone-900 border-b border-yellow-500'},
  ]; return a[i%a.length]
}

/* ─ 공용 아바타 & 유틸 ─ */
function InitialAvatar({ id,name,size=24 }){
  const initial=(name||'?').trim().charAt(0)?.toUpperCase()||'?'
  const color="#"+stringToColor(String(id||'seed'))
  return <div className="flex items-center justify-center rounded-full text-white font-semibold select-none" style={{width:size,height:size,fontSize:Math.max(10,size*.5),backgroundColor:color}}>{initial}</div>
}
function stringToColor(str){let h=0;for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);return ((h>>>0).toString(16)+'000000').substring(0,6)}
function seededShuffle(arr,seed=1){const a=[...arr],rand=mulberry32(seed>>>0);for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function mulberry32(a){return function(){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function PitchLines(){return(<>
  <div className="absolute inset-2 border-2 border-white/80 rounded-md"/><div className="absolute left-2 right-2 top-1/2 h-0.5 bg-white/70"/>
  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/80 rounded-full" style={{width:90,height:90}}/>
  <div className="absolute left-1/2 -translate-x-1/2 top-2 w-[60%] h-24 border-2 border-white/80 rounded-sm"/>
  <div className="absolute left-1/2 -translate-x-1/2 top-[74px] w-28 h-12 border-2 border-white/80 rounded-sm"/>
  <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-[60%] h-24 border-2 border-white/80 rounded-sm"/>
  <div className="absolute left-1/2 -translate-x-1/2 bottom-[74px] w-28 h-12 border-2 border-white/80 rounded-sm"/>
</>)}
