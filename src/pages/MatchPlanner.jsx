// src/pages/MatchPlanner.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import { mkMatch, decideMode, splitKTeams, hydrateMatch } from '../lib/match'
import { downloadJSON } from '../utils/io'
import { overall } from '../lib/players'

// dnd-kit
import {
  DndContext, DragOverlay, pointerWithin,
  PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import InitialAvatar from '../components/InitialAvatar'
// ❌ 미리보기/저장본 카드에서 포메이션 프리뷰는 제거하므로 MiniPitch 불필요
// import MiniPitch from '../components/pitch/MiniPitch'
import FreePitch from '../components/pitch/FreePitch'
import { assignToFormation, recommendFormation, countPositions } from '../lib/formation'
import { seededShuffle } from '../utils/random'

export default function MatchPlanner({ players, matches, onSaveMatch, onDeleteMatch, onUpdateMatch }){
  const [dateISO,setDateISO]=useState(()=>new Date().toISOString().slice(0,16))
  const [attendeeIds,setAttendeeIds]=useState([])
  const [criterion,setCriterion]=useState('overall')
  const [teamCount,setTeamCount]=useState(2)
  const [hideOVR,setHideOVR]=useState(false)
  const [shuffleSeed,setShuffleSeed]=useState(0)

  const [locationPreset,setLocationPreset]=useState('coppell-west')
  const [locationName,setLocationName]=useState('Coppell Middle School - West')
  const [locationAddress,setLocationAddress]=useState('2701 Ranch Trail, Coppell, TX 75019')

  // 팀 배정/보드 상태
  const [manualTeams,setManualTeams]=useState(null)
  const [activePlayerId,setActivePlayerId]=useState(null)
  const [activeFromTeam,setActiveFromTeam]=useState(null)

  // 포메이션/좌표 — UI에선 숨기지만 저장/로드를 위해 유지
  const [formations,setFormations]=useState([])      // string[]
  const [placedByTeam,setPlacedByTeam]=useState([])  // Array<Array<{id,name,role,x,y}>>

  // 풀스크린 포메이션 편집 모달(저장본 전용)
  const [editorOpen,setEditorOpen]=useState(false)
  const [editingTeamIdx,setEditingTeamIdx]=useState(0)
  const [editingMatchId, setEditingMatchId] = useState(null)
  const [editorPlayers, setEditorPlayers] = useState([]) // 모달 내 FreePitch에 공급할 팀별 선수 배열

  // 저장된 매치: 유튜브 링크 간편 입력 상태
  const [videoDrafts, setVideoDrafts] = useState({}) // { [matchId]: 'https://youtu.be/...' }
  const handleVideoInput = (matchId, val) => setVideoDrafts(d => ({ ...d, [matchId]: val }))
  const addVideoLink = (m) => {
    const url = (videoDrafts[m.id] || '').trim()
    if (!url) return
    const next = [ ...(m.videos || []), url ]
    onUpdateMatch(m.id, { videos: next })
    setVideoDrafts(d => ({ ...d, [m.id]: '' }))
  }
  const removeVideoLink = (m, idx) => {
    const next = (m.videos || []).filter((_, i) => i !== idx)
    onUpdateMatch(m.id, { videos: next })
  }

  const count=attendeeIds.length
  const autoSuggestion=decideMode(count)
  const mode=autoSuggestion.mode
  const teams=Math.max(2,Math.min(10,Number(teamCount)||2))
  const attendees=useMemo(()=>players.filter(p=>attendeeIds.includes(p.id)),[players,attendeeIds])
  const autoSplit=useMemo(()=>splitKTeams(attendees,teams,criterion),[attendees,teams,criterion])

  useEffect(()=>{ setManualTeams(null); setShuffleSeed(0) },[attendees,teams,criterion])

  const previewTeams=useMemo(()=>{
    let base=manualTeams??autoSplit.teams
    if(!manualTeams&&shuffleSeed) base=base.map(list=>seededShuffle(list,shuffleSeed+list.length))
    return base
  },[manualTeams,autoSplit.teams,shuffleSeed])

  // 팀별 기본 포메이션/좌표 (UI는 숨김)
  useEffect(()=>{
    setFormations(prev=>{
      const next=[...previewTeams].map((list,i)=>{
        if(prev[i]) return prev[i]
        return recommendFormation({count:list.length,mode,positions:countPositions(list)})
      })
      return next
    })
    setPlacedByTeam(prev=>{
      const prevArr=Array.isArray(prev)?prev:[]
      const next=previewTeams.map((list,i)=>{
        const existed=Array.isArray(prevArr[i])?prevArr[i]:[]
        const byId=new Map(existed.map(p=>[String(p.id),p]))
        const base=assignToFormation({players:list,formation:(formations[i]||recommendFormation({count:list.length,mode,positions:countPositions(list)}))})
        return base.map(d=>byId.get(String(d.id))||d)
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[previewTeams,mode])

  const toggle=id=>setAttendeeIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])

  function save(){
    onSaveMatch(mkMatch({
      id:crypto.randomUUID?.()||String(Date.now()),
      dateISO, attendeeIds, criterion, players, selectionMode:'manual',
      teamCount:teams,
      location:{preset:locationPreset,name:locationName,address:locationAddress},
      mode,
      snapshot:previewTeams.map(t=>t.map(p=>p.id)),
      board: placedByTeam,
      formations,
      videos: [] // ✅ 새 매치는 기본적으로 빈 배열로 시작
    }))
  }
  function exportTeams(){
    const sumsNoGK=previewTeams.map(list=>list.filter(p=>(p.position||p.pos)!=='GK').reduce((a,p)=>a+(p.ovr??overall(p)),0))
    const avgsNoGK=sumsNoGK.map((sum,i)=>{const n=previewTeams[i].filter(p=>(p.position||p.pos)!=='GK').length;return n?Math.round(sum/n):0})
    downloadJSON(
      {
        dateISO,mode,teamCount:teams,criterion,selectionMode:'manual',
        location:{preset:locationPreset,name:locationName,address:locationAddress},
        teams:previewTeams.map(t=>t.map(p=>({id:p.id,name:p.name,pos:p.position,ovr:p.ovr??overall(p)}))),
        sums:autoSplit.sums,sumsNoGK,avgsNoGK, formations, board: placedByTeam
      },
      `match_${dateISO.replace(/[:T]/g,'-')}.json`
    )
  }

  const allSelected=attendeeIds.length===players.length&&players.length>0
  const toggleSelectAll=()=>allSelected?setAttendeeIds([]):setAttendeeIds(players.map(p=>p.id))

  /* ───────────────  Team list DnD  ─────────────── */
  const sensors=useSensors(
    useSensor(PointerSensor,{activationConstraint:{distance:4}}),
    useSensor(TouchSensor,{activationConstraint:{delay:120,tolerance:6}})
  )
  const findTeamIndexByItemId=(itemId)=>previewTeams.findIndex(list=>list.some(p=>String(p.id)===String(itemId)))
  const onDragStartHandler=e=>{ setActivePlayerId(e.active.id); setActiveFromTeam(findTeamIndexByItemId(e.active.id)); document.body.classList.add('cursor-grabbing') }
  const onDragCancel=()=>{ setActivePlayerId(null); setActiveFromTeam(null); document.body.classList.remove('cursor-grabbing') }
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

    // 보드 반영(저장용 데이터)
    setPlacedByTeam(prev=>{
      const arr=Array.isArray(prev)?[...prev]:[]
      // to
      {
        const list=next[to]
        const existed=Array.isArray(arr[to])?arr[to]:[]
        const byId=new Map(existed.map(p=>[String(p.id),p]))
        const base=assignToFormation({players:list,formation:formations[to]||'4-3-3'})
        arr[to]=base.map(d=>byId.get(String(d.id))||d)
      }
      // from
      {
        const listFrom=next[from]
        const existedFrom=Array.isArray(arr[from])?arr[from]:[]
        const byIdFrom=new Map(existedFrom.map(p=>[String(p.id),p]))
        const baseFrom=assignToFormation({players:listFrom,formation:formations[from]||'4-3-3'})
        arr[from]=baseFrom.map(d=>byIdFrom.get(String(d.id))||d)
      }
      return arr
    })
  }

  // 저장본을 모달로 열기 (프리뷰는 제거)
  const openEditorSaved = (match, i) => {
    const hydrated = hydrateMatch(match, players)
    setFormations(Array.isArray(match.formations) ? match.formations.slice() : [])
    setPlacedByTeam(Array.isArray(match.board) ? match.board.map(a => Array.isArray(a) ? a.slice() : []) : [])
    setEditorPlayers(hydrated.teams || [])
    setEditingMatchId(match.id)
    setEditingTeamIdx(i)
    setEditorOpen(true)
  }
  const closeEditor=()=> setEditorOpen(false)

  const setTeamFormation=(i,f)=>{
    setFormations(prev=>{ const copy=[...prev]; copy[i]=f; return copy })
    setPlacedByTeam(prev=>{
      const copy=Array.isArray(prev)?[...prev]:[]
      copy[i]=assignToFormation({players:editorPlayers[i]||[],formation:f})
      return copy
    })
  }
  const autoPlaceTeam=i=>{
    setPlacedByTeam(prev=>{
      const copy=Array.isArray(prev)?[...prev]:[]
      const f=formations[i]||'4-3-3'
      copy[i]=assignToFormation({players:editorPlayers[i]||[],formation:f})
      return copy
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_600px]">
      <Card title="매치 설정"
        right={<div className="flex items-center gap-2">
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
            </div>
          </Row>

          <Row label={<span className="flex items-center gap-2">참석 ({attendeeIds.length}명)
            <button type="button" onClick={toggleSelectAll}
              className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
              {allSelected?'모두 해제':'모두 선택'}</button>
              </span>}>
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

      {/* 오른쪽: 팀 배정 미리보기 — ⚠️ 포메이션 프리뷰 완전 제거 */}
      <div className="grid gap-4">
      <Card title="팀 배정 미리보기 (드래그 & 드랍 커스텀 가능)"
  right={
    <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
      기준: {criterion} · <span className="font-medium">GK 평균 제외</span>
    </div>
  }
>
{/* Toolbar with OVR 숨기기 and 랜덤 섞기 */}
<Toolbar
  hideOVR={hideOVR}
  setHideOVR={setHideOVR}
  reshuffleTeams={() => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    setShuffleSeed(seed);
    setManualTeams((prev) =>
      (prev ?? autoSplit.teams).map((list) =>
        seededShuffle(list, seed + list.length)
      )
    );
  }}
  sortTeamsByOVR={(order = "desc") => {
    const base = manualTeams ?? previewTeams;
    setManualTeams(
      base.map((list) =>
        list.slice().sort((a, b) => {
          const A = a.ovr ?? overall(a),
            B = b.ovr ?? overall(b);
          return order === "asc" ? A - B : B - A;
        })
      )
    );
  }}
  resetManual={() => {
    setManualTeams(null);
    setShuffleSeed(0);
  }}
  manualTeams={manualTeams}
/>

{/* 랜덤 섞기 버튼 바로 옆에 추가 */}
<div className="mb-3 flex flex-wrap items-center gap-2">
  <button
    type="button"
    aria-pressed={hideOVR}
    onClick={() => setHideOVR((v) => !v)}
    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
      hideOVR
        ? "border-emerald-500 text-emerald-700 bg-emerald-50"
        : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
    }`}
  >
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        hideOVR ? "bg-emerald-500" : "bg-gray-300"
      }`}
    ></span>
    OVR 숨기기
  </button>

  <button
    onClick={() => {
      setManualTeams((prev) =>
        (prev ?? previewTeams).map((list) =>
          list.slice().sort(() => Math.random() - 0.5)
        )
      );
    }}
    className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2 text-white text-sm font-medium shadow-lg hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl transition-all duration-300"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 19.5l15-15m-15 0l15 15"
      />
    </svg>
    랜덤 섞기
  </button>
</div>

  <DndContext
    sensors={sensors}
    collisionDetection={pointerWithin}
    onDragStart={onDragStartHandler}
    onDragCancel={onDragCancel}
    onDragEnd={onDragEndHandler}
  >
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
    >
      {previewTeams.map((list, i) => (
        <div key={i} className="space-y-2">
          <TeamColumn
            teamIndex={i}
            labelKit={kitForTeam(i)}
            players={list}
            hideOVR={hideOVR}
          />
        </div>
      ))}
    </div>
    <DragOverlay>
      {activePlayerId ? (
        <DragGhost
          player={players.find((p) => String(p.id) === String(activePlayerId))}
          hideOVR={hideOVR}
        />
      ) : null}
    </DragOverlay>
  </DndContext>
</Card>

        {/* 저장된 매치: 프리뷰 없이 '포메이션 편집' 버튼만 제공 + 툴바 + 유튜브 링크 관리 */}
        <Card
          title="저장된 매치"
          right={<div className="text-xs text-gray-500"><span className="font-medium">GK 평균 제외</span></div>}
        >
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

                  {/* 팀 표: 모바일에서도 항상 2열 고정 */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {hydrated.teams.map((list,i)=>{
                      const kit=kitForTeam(i)
                      const non=list.filter(p=>(p.position||p.pos)!=='GK')
                      const sum=non.reduce((a,p)=>a+(p.ovr??overall(p)),0)
                      const avg=non.length?Math.round(sum/non.length):0

                      return (
                        <div key={i} className="space-y-2 rounded border border-gray-200">
                          <div className={`mb-1 flex items-center justify-between px-2 py-1 text-xs ${kit.headerClass}`}>
                            <span>팀 {i+1}</span>
                            <span className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</span>
                          </div>

                          <div className="px-2 pb-2">
                            <button
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                              onClick={()=>openEditorSaved(m, i)}
                            >
                              포메이션 편집
                            </button>
                          </div>

                          {/* 팀원 리스트 */}
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

                  {/* 🎥 유튜브 링크 간편 관리 섹션 */}
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-600">🎥 유튜브 링크</div>

                    {(m.videos && m.videos.length > 0) ? (
                      <ul className="flex flex-wrap gap-2">
                        {m.videos.map((url, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <a
                              href={url}
                              target="_blank" rel="noreferrer"
                              className="max-w-[220px] truncate rounded border border-gray-300 bg-white px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                              title={url}
                            >
                              {url}
                            </a>
                            <button
                              className="text-[11px] text-red-600"
                              onClick={()=>removeVideoLink(m, idx)}
                              title="삭제"
                            >
                              삭제
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500">등록된 링크가 없습니다.</div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                        placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..."
                        value={videoDrafts[m.id] || ''}
                        onChange={e=>handleVideoInput(m.id, e.target.value)}
                      />
                      <button
                        className="whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                        onClick={()=>addVideoLink(m)}
                      >
                        추가
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>}
        </Card>
      </div>

      {/* ───────────────  풀스크린 포메이션 에디터 (저장본 전용)  ─────────────── */}
      {editorOpen && (
        <FullscreenModal onClose={closeEditor}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">팀 {editingTeamIdx+1} · 포메이션 편집</h3>
            <div className="flex items-center gap-2">
              <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                value={formations[editingTeamIdx]||'4-3-3'}
                onChange={e=>setTeamFormation(editingTeamIdx, e.target.value)}>
                <option value="4-3-3">4-3-3</option>
                <option value="4-4-2">4-4-2</option>
                <option value="3-5-2">3-5-2</option>
                <option value="3-3-2">9v9 · 3-3-2</option>
                <option value="3-2-3">9v9 · 3-2-3</option>
                <option value="2-3-1">7v7 · 2-3-1</option>
              </select>
              <button onClick={()=>autoPlaceTeam(editingTeamIdx)} className="rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-white">자동 배치</button>

              <button
                onClick={()=>{
                  onUpdateMatch(editingMatchId, { formations, board: placedByTeam })
                  setEditorOpen(false)
                }}
                className="rounded bg-stone-900 px-3 py-1 text-sm font-semibold text-white"
              >
                저장
              </button>

              <button onClick={closeEditor} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm">닫기</button>
            </div>
          </div>
          <div className="mb-2 text-xs text-gray-500">
            컨텍스트: <b>저장본 편집</b>
            &nbsp;·&nbsp; 팀: <b>{editingTeamIdx+1}</b>
            &nbsp;·&nbsp; 포메이션: <b>{formations[editingTeamIdx]||'4-3-3'}</b>
            &nbsp;·&nbsp; 인원: <b>{(editorPlayers[editingTeamIdx]||[]).length}명</b>
          </div>
          <FreePitch
            players={(editorPlayers[editingTeamIdx]||[])}
            placed={Array.isArray(placedByTeam[editingTeamIdx])?placedByTeam[editingTeamIdx]:[]}
            setPlaced={(nextOrUpdater)=>{
              setPlacedByTeam(prev=>{
                const copy = Array.isArray(prev) ? [...prev] : []
                const current = Array.isArray(copy[editingTeamIdx]) ? copy[editingTeamIdx] : []
                const resolved = (typeof nextOrUpdater === 'function') ? nextOrUpdater(current) : nextOrUpdater
                copy[editingTeamIdx] = Array.isArray(resolved) ? resolved : []
                return copy
              })
            }}
            height={620}
          />
          <div className="mt-2 text-xs text-gray-500">* 필드 자유 배치 · GK는 하단 골키퍼 존(80~98%)만 이동 가능</div>
        </FullscreenModal>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Right column: team list components
   ────────────────────────────────────────────────────────────────────────── */
function Row({label,children}){return(
  <div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
    <label className="mt-1 text-sm text-gray-600">{label}</label><div>{children}</div>
  </div>
)}
function Toolbar({hideOVR,setHideOVR,reshuffleTeams,sortTeamsByOVR,resetManual,manualTeams}){
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
    
     
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

/* ──────────────────────────────────────────────────────────────────────────
   모달 Wrapper
   ────────────────────────────────────────────────────────────────────────── */
function FullscreenModal({children,onClose}){
  useEffect(()=>{
    const onEsc=(e)=>{ if(e.key==='Escape') onClose() }
    document.addEventListener('keydown',onEsc)
    document.body.style.overflow='hidden'
    return ()=>{ document.removeEventListener('keydown',onEsc); document.body.style.overflow='' }
  },[onClose])
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}/>
      <div className="absolute inset-2 md:inset-6 xl:inset-12 rounded-2xl bg-white shadow-2xl p-3 md:p-4 overflow-auto">
        {children}
      </div>
    </div>
  )
}
