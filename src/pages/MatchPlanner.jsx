import React, { useEffect, useMemo, useRef, useState } from 'react'
import Card from '../components/Card'
import { mkMatch, decideMode, splitKTeams, hydrateMatch } from '../lib/match'
import { downloadJSON } from '../utils/io'
import { overall } from '../lib/players'
import { notify } from '../components/Toast'

import {
  DndContext, DragOverlay, pointerWithin,
  PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import InitialAvatar from '../components/InitialAvatar'
import FreePitch from '../components/pitch/FreePitch'
import { assignToFormation, recommendFormation, countPositions } from '../lib/formation'
import { seededShuffle } from '../utils/random'

export default function MatchPlanner({ players, matches, onSaveMatch, onDeleteMatch, onUpdateMatch, isAdmin }){
  const [dateISO,setDateISO]=useState(()=>new Date().toISOString().slice(0,16))
  const [attendeeIds,setAttendeeIds]=useState([])
  const [criterion,setCriterion]=useState('overall')
  const [teamCount,setTeamCount]=useState(2)
  const [hideOVR,setHideOVR]=useState(false) // Admin만 토글 가능(일반 사용자는 항상 숨김)
  const [shuffleSeed,setShuffleSeed]=useState(0)

  const [locationPreset,setLocationPreset]=useState('coppell-west')
  const [locationName,setLocationName]=useState('Coppell Middle School - West')
  const [locationAddress,setLocationAddress]=useState('2701 Ranch Trail, Coppell, TX 75019')

  const [manualTeams,setManualTeams]=useState(null)
  const [activePlayerId,setActivePlayerId]=useState(null)
  const [activeFromTeam,setActiveFromTeam]=useState(null)

  const [formations,setFormations]=useState([])
  const [placedByTeam,setPlacedByTeam]=useState([])

  // 지금 화면의 팀 배열을 항상 들고 있는 ref
  const latestTeamsRef = useRef([])

  // 저장본 포메이션 에디터(전체화면)
  const [editorOpen,setEditorOpen]=useState(false)
  const [editingTeamIdx,setEditingTeamIdx]=useState(0)
  const [editingMatchId, setEditingMatchId] = useState(null)
  const [editorPlayers, setEditorPlayers] = useState([])

  // 저장본 유튜브 링크(매치 단위 관리)
  const [videoDrafts, setVideoDrafts] = useState({})
  const handleVideoInput = (matchId, val) => setVideoDrafts(d => ({ ...d, [matchId]: val }))
  const addVideoLink = (m) => {
    const url = (videoDrafts[m.id] || '').trim(); if (!url) return
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

  // ✅ 자동 초기화 스킵 플래그 (불러오기 시 덮어씀 방지)
  const skipAutoResetRef = useRef(false)

  // 참석자/팀수/기준 변경 시 수동 편집 초기화 (단, 불러오기 직후는 스킵)
  useEffect(()=>{
    if (skipAutoResetRef.current) {
      skipAutoResetRef.current = false
      return
    }
    setManualTeams(null)
    setShuffleSeed(0)
  },[attendees,teams,criterion])

  const previewTeams=useMemo(()=>{
    let base=manualTeams??autoSplit.teams
    if(!manualTeams&&shuffleSeed) base=base.map(list=>seededShuffle(list,shuffleSeed+list.length))
    return base
  },[manualTeams,autoSplit.teams,shuffleSeed])

  // 항상 현재 화면의 팀 배열을 ref에 동기화
  useEffect(()=>{ latestTeamsRef.current = previewTeams }, [previewTeams])

  // 기본 포메이션/좌표 유지(저장에도 사용)
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

  // 저장: "지금 보이는 그대로" 스냅샷 저장 (Admin만)
  function save(){
    if(!isAdmin){ notify('Admin만 가능합니다.'); return }
    const baseTeams = (latestTeamsRef.current && latestTeamsRef.current.length)
      ? latestTeamsRef.current
      : previewTeams

    const snapshot = baseTeams.map(team => team.map(p => p.id))
    const attendeeIdsFromTeams = snapshot.flat()
    const teamCountFromTeams   = baseTeams.length

    onSaveMatch(mkMatch({
      id: crypto.randomUUID?.() || String(Date.now()),
      dateISO,
      attendeeIds: attendeeIdsFromTeams,
      criterion,
      players,
      selectionMode: 'manual',
      teamCount: teamCountFromTeams,
      location: { preset: locationPreset, name: locationName, address: locationAddress },
      mode,
      snapshot,           // ✅ 스냅샷 우선
      board: placedByTeam,
      formations,
      locked: true,
      videos: []
    }))

    notify('매치가 저장되었습니다 ✅')
  }

  function exportTeams(){
    if(!isAdmin){ notify('Admin만 가능합니다.'); return }
    const sumsNoGK=previewTeams.map(list=>list.filter(p=>(p.position||p.pos)!=='GK').reduce((a,p)=>a+(p.ovr??overall(p)),0))
    const avgsNoGK=sumsNoGK.map((sum,i)=>{const n=previewTeams[i].filter(p=>(p.position||p.pos)!=='GK').length;return n?Math.round(sum/n):0})
    downloadJSON(
      {
        dateISO,mode,teamCount:teams,criterion,selectionMode:'manual',
        location:{preset:locationPreset,name:locationName,address:locationAddress},
        teams:previewTeams.map(t=>t.map(p=>({id:p.id,name:p.name,pos:p.position}))), // 비관리자 노출 고려: OVR 제외
        sums:autoSplit.sums,sumsNoGK,avgsNoGK, formations, board: placedByTeam
      },
      `match_${dateISO.replace(/[:T]/g,'-')}.json`
    )
  }

  const allSelected=attendeeIds.length===players.length&&players.length>0
  const toggleSelectAll=()=>allSelected?setAttendeeIds([]):setAttendeeIds(players.map(p=>p.id))

  // DnD
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

    setManualTeams(next)
    latestTeamsRef.current = next // 👈 드래그 직후 즉시 최신 고정
    setActiveFromTeam(null)

    setPlacedByTeam(prev=>{
      const arr=Array.isArray(prev)?[...prev]:[]
      { // to
        const list=next[to]
        const existed=Array.isArray(arr[to])?arr[to]:[]
        const byId=new Map(existed.map(p=>[String(p.id),p]))
        const basePlaced=assignToFormation({players:list,formation:formations[to]||'4-3-3'})
        arr[to]=basePlaced.map(d=>byId.get(String(d.id))||d)
      }
      { // from
        const listFrom=next[from]
        const existedFrom=Array.isArray(arr[from])?arr[from]:[]
        const byIdFrom=new Map(existedFrom.map(p=>[String(p.id),p]))
        const baseFrom=assignToFormation({players:listFrom,formation:formations[from]||'4-3-3'})
        arr[from]=baseFrom.map(d=>byIdFrom.get(String(d.id))||d)
      }
      return arr
    })
  }

  // 저장본 포메이션 에디터 오픈(팀별)
  const openEditorSaved = (match, i) => {
    const hydrated = hydrateMatch(match, players) // ✅ snapshot 우선 복원
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

  // 표시 제어: 일반 사용자는 OVR 항상 숨김
  const showOVR = isAdmin && !hideOVR

  // ✅ 저장된 매치를 현재 팀배정 화면으로 불러오기 (스냅샷/포메이션/좌표 포함)
  function loadSavedIntoPlanner(match){
    if(!match) return
    // 불러오기로 인해 연쇄적으로 발생하는 초기화를 1회 스킵
    skipAutoResetRef.current = true

    const hydrated = hydrateMatch(match, players) // teams: Player[][] (snapshot 우선)
    const teamsArr = hydrated.teams || []
    if(teamsArr.length === 0){
      notify('불러올 팀 구성이 없습니다.')
      return
    }

    // 참석자/팀수/기준/장소/날짜 동기화
    const newAttendeeIds = teamsArr.flat().map(p => p.id)
    setAttendeeIds(newAttendeeIds)
    setTeamCount(teamsArr.length)
    if (match.criterion) setCriterion(match.criterion)
    if (match.location) {
      setLocationPreset(match.location.preset || 'other')
      setLocationName(match.location.name || '')
      setLocationAddress(match.location.address || '')
    }
    if (match.dateISO) setDateISO(match.dateISO.slice(0,16))
    setShuffleSeed(0)

    // 수동 팀 구성 고정
    setManualTeams(teamsArr)
    latestTeamsRef.current = teamsArr

    // 포메이션/필드 배치 복원 (없으면 자동)
    const baseFormations = Array.isArray(match.formations) && match.formations.length === teamsArr.length
      ? match.formations.slice()
      : teamsArr.map(list => recommendFormation({ count:list.length, mode: match.mode || '11v11', positions: countPositions(list) }))
    setFormations(baseFormations)

    const baseBoard =
      Array.isArray(match.board) && match.board.length === teamsArr.length
        ? match.board.map(a => Array.isArray(a) ? a.slice() : [])
        : teamsArr.map((list, i) => assignToFormation({ players:list, formation: baseFormations[i] || '4-3-3' }))

    setPlacedByTeam(baseBoard)

    notify('저장된 매치를 팀배정에 불러왔습니다 ✅')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_600px]">
      <Card title="매치 설정">
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
                  {showOVR && (p.position||p.pos)!=='GK' && <span className="text-xs text-gray-500 shrink-0">OVR {p.ovr??overall(p)}</span>}
                </label>
              ))}
            </div>
          </Row>

          <div className="flex gap-2">
            {isAdmin && (
              <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 text-white font-semibold">매치 저장</button>
            )}
            {isAdmin && (
              <button onClick={exportTeams} className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700">라인업 Export</button>
            )}
          </div>
        </div>
      </Card>

      {/* 오른쪽: 팀 배정 미리보기 */}
      <div className="grid gap-4">
        <Card
          title="팀 배정 미리보기 (드래그 & 드랍 커스텀 가능)"
          right={<div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
            기준: {criterion} · <span className="font-medium">GK 평균 제외</span>
          </div>}
        >
          <Toolbar
            isAdmin={isAdmin}
            hideOVR={hideOVR}
            setHideOVR={setHideOVR}
            reshuffleTeams={() => {
              const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
              setShuffleSeed(seed)
              setManualTeams((prev) =>
                (prev ?? autoSplit.teams).map((list) =>
                  seededShuffle(list, seed + list.length)
                )
              )
            }}
            sortTeamsByOVR={(order = "desc") => {
              const base = manualTeams ?? previewTeams
              setManualTeams(
                base.map((list) =>
                  list.slice().sort((a, b) => {
                    const A = a.ovr ?? overall(a), B = b.ovr ?? overall(b)
                    return order === "asc" ? A - B : B - A
                  })
                )
              )
            }}
            resetManual={() => { setManualTeams(null); setShuffleSeed(0) }}
            manualTeams={manualTeams}
          />

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                aria-pressed={hideOVR}
                onClick={() => setHideOVR((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                  hideOVR ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                          : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                }`}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${hideOVR ? "bg-emerald-500" : "bg-gray-300"}`}></span>
                OVR 숨기기
              </button>
            )}

            <button
              onClick={() => {
                setManualTeams((prev) =>
                  (prev ?? previewTeams).map((list) =>
                    list.slice().sort(() => Math.random() - 0.5)
                  )
                )
              }}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2 text-white text-sm font-medium shadow-lg hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m-15 0l15 15"/>
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
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {previewTeams.map((list, i) => (
                <div key={i} className="space-y-2">
                  <TeamColumn teamIndex={i} labelKit={kitForTeam(i)} players={list} showOVR={showOVR} isAdmin={isAdmin} />
                </div>
              ))}
            </div>
            <DragOverlay>
              {activePlayerId ? (
                <DragGhost player={players.find(p => String(p.id) === String(activePlayerId))} showOVR={showOVR} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </Card>

        {/* 저장된 매치 */}
        <Card title="저장된 매치" right={<div className="text-xs text-gray-500"><span className="font-medium">GK 평균 제외</span></div>}>
          {matches.length===0 ? <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div> :
          <ul className="space-y-2">
            {matches.map(m=>{
              const hydrated=hydrateMatch(m,players)  // ✅ snapshot 우선 복원
              return (
                <li key={m.id} className="rounded border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm"><b>{m.dateISO.replace('T',' ')}</b> · {m.mode} · {m.teamCount}팀 · 참석 {attendeesCount(m)}명{m.location?.name?<> · 장소 {m.location.name}</>:null}</div>
                    <div className="flex items-center gap-2">
                      <button className="text-xs rounded border border-gray-300 bg-white px-2 py-1"
                        onClick={()=>loadSavedIntoPlanner(m)}>팀배정에 로드</button>
                      {isAdmin && <button className="text-xs text-red-600" onClick={()=>onDeleteMatch(m.id)}>삭제</button>}
                    </div>
                  </div>

                  {/* 팀 테이블(읽기용) + 팀별 포메이션 편집 버튼 */}
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
                            <div className="flex items-center gap-2">
                              {isAdmin && <span className="opacity-80 hidden sm:inline">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</span>}
                              {!isAdmin && <span className="opacity-80 hidden sm:inline">{kit.label} · {list.length}명</span>}
                              {/* 🔧 이 팀 포메이션 편집 */}
                              <button
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                                onClick={()=>openEditorSaved(m, i)}
                              >이 팀 포메이션</button>
                            </div>
                          </div>
                          <ul className="space-y-1 p-2 pt-0 text-sm">
                            {list.map(p=>(
                              <li key={p.id} className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0">
                                <span className="flex items-center gap-2 min-w-0 flex-1">
                                  <InitialAvatar id={p.id} name={p.name} size={24} />
                                  <span className="truncate">{p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}</span>
                                </span>
                                {showOVR && (p.position||p.pos)!=='GK' && <span className="text-gray-500 shrink-0">OVR {p.ovr??overall(p)}</span>}
                              </li>
                            ))}
                            {list.length===0 && <li className="px-1 py-1 text-xs text-gray-400">팀원 없음</li>}
                          </ul>
                        </div>
                      )
                    })}
                  </div>

                  {/* 🎥 유튜브 링크 — ✅ 매치 단위로 1회만 표시(중복 제거) */}
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-600">🎥 유튜브 링크</div>
                    {(m.videos && m.videos.length > 0) ? (
                      <ul className="flex flex-wrap gap-2">
                        {m.videos.map((url, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <a href={url} target="_blank" rel="noreferrer" className="max-w-[220px] truncate rounded border border-gray-300 bg-white px-2 py-1 text-xs text-blue-600 hover:bg-blue-50" title={url}>
                              {url}
                            </a>
                            {isAdmin && <button className="text-[11px] text-red-600" onClick={()=>removeVideoLink(m, idx)} title="삭제">삭제</button>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500">등록된 링크가 없습니다.</div>
                    )}
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <input className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..." value={videoDrafts[m.id] || ''} onChange={e=>handleVideoInput(m.id, e.target.value)} />
                        <button className="whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-2 text-sm" onClick={()=>addVideoLink(m)}>추가</button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>}
        </Card>
      </div>

      {/* 포메이션 에디터(저장본 전용, 팀별로 열리도록) */}
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
                  notify('포메이션이 저장되었습니다 ✅')
                }}
                className="rounded bg-stone-900 px-3 py-1 text-sm font-semibold text-white"
              >저장</button>
              <button onClick={closeEditor} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm">닫기</button>
            </div>
          </div>
          <div className="mb-2 text-xs text-gray-500">
            컨텍스트: <b>저장본 편집</b> · 팀: <b>{editingTeamIdx+1}</b> · 포메이션: <b>{formations[editingTeamIdx]||'4-3-3'}</b> · 인원: <b>{(editorPlayers[editingTeamIdx]||[]).length}명</b>
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

function attendeesCount(m){
  if(Array.isArray(m?.snapshot) && m.snapshot.length) return m.snapshot.flat().length
  if(Array.isArray(m?.attendeeIds)) return m.attendeeIds.length
  return 0
}

function Row({label,children}){return(
  <div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
    <label className="mt-1 text-sm text-gray-600">{label}</label><div>{children}</div>
  </div>
)}
function Toolbar({isAdmin,hideOVR,setHideOVR,reshuffleTeams,sortTeamsByOVR,resetManual,manualTeams}){
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={reshuffleTeams} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">시드로 섞기</button>
        {isAdmin && (
          <>
            <button onClick={()=>sortTeamsByOVR('desc')} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">팀 OVR 내림차순</button>
            <button onClick={()=>sortTeamsByOVR('asc')} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">팀 OVR 오름차순</button>
            <button onClick={resetManual} disabled={!manualTeams} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">수동 편집 초기화</button>
          </>
        )}
        {!isAdmin && (
          <button onClick={resetManual} disabled={!manualTeams} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">수동 편집 초기화</button>
        )}
      </div>
    </div>
  )
}
function TeamColumn({ teamIndex,labelKit,players,showOVR,isAdmin }){
  const id=`team-${teamIndex}`; const { setNodeRef,isOver }=useDroppable({ id })
  const non=players.filter(p=>(p.position||p.pos)!=='GK'), sum=non.reduce((a,p)=>a+(p.ovr??overall(p)),0), avg=non.length?Math.round(sum/non.length):0
  return (
    <div ref={setNodeRef} className={`rounded-lg border bg-white transition ${isOver?'border-emerald-500 ring-2 ring-emerald-200':'border-gray-200'}`}>
      <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${labelKit.headerClass}`}>
        <div className="font-semibold">팀 {teamIndex+1}</div>
        {isAdmin ? (
          <div className="opacity-80">{labelKit.label} · {players.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</div>
        ) : (
          <div className="opacity-80">{labelKit.label} · {players.length}명</div>
        )}
      </div>
      <SortableContext id={id} items={players.map(p=>String(p.id))} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1 px-3 pb-3 text-sm min-h-[44px]">
          {isOver && <li className="rounded border-2 border-dashed border-emerald-400/70 bg-emerald-50/40 px-2 py-1 text-xs text-emerald-700">여기에 드롭</li>}
          {players.map(p=><PlayerRow key={p.id} player={p} showOVR={showOVR} />)}
          {players.length===0 && !isOver && <li className="text-xs text-gray-400">팀원 없음 — 이 카드로 드래그해서 추가</li>}
        </ul>
      </SortableContext>
    </div>
  )
}
function PlayerRow({ player,showOVR }){
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
      {showOVR && (player.position||player.pos)!=='GK' && <span className="text-gray-500 text-xs shrink-0">OVR {player.ovr??overall(player)}</span>}
    </li>
  )
}
function DragGhost({ player,showOVR }){
  if(!player) return null
  return (
    <div className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 shadow-xl text-sm flex items-center gap-2 scale-[1.04]" style={{filter:'drop-shadow(0 8px 20px rgba(0,0,0,.18))'}}>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">⇆</span>
      <span className="font-medium">{player.name}</span>
      {showOVR && (player.position||player.pos)!=='GK' && <span className="text-gray-500">OVR {player.ovr??overall(player)}</span>}
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
