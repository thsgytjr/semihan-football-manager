// src/pages/MatchPlanner.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import { mkMatch, decideMode, splitKTeams, hydrateMatch } from '../lib/match'
import { downloadJSON } from '../utils/io'
import { overall } from '../lib/players'

// dnd-kit
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function MatchPlanner({ players, matches, onSaveMatch, onDeleteMatch }){
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0,16))
  const [attendeeIds, setAttendeeIds] = useState([])
  const [criterion, setCriterion] = useState('overall')
  const [teamCount, setTeamCount] = useState(2)

  // 표시 옵션
  const [hideOVR, setHideOVR] = useState(false)

  // 랜덤 오더(버튼 클릭 시 시드로 섞음)
  const [shuffleSeed, setShuffleSeed] = useState(0)

  // 장소
  const [locationPreset, setLocationPreset] = useState('coppell-west')
  const [locationName, setLocationName] = useState('Coppell Middle School - West')
  const [locationAddress, setLocationAddress] = useState('2701 Ranch Trail, Coppell, TX 75019')

  // 수동 편집(드래그/정렬 결과 저장)
  const [manualTeams, setManualTeams] = useState(null)

  // dnd state
  const [activePlayerId, setActivePlayerId] = useState(null)
  const [activeFromTeam, setActiveFromTeam] = useState(null)

  const count = attendeeIds.length
  const autoSuggestion = decideMode(count)
  const mode = autoSuggestion.mode
  const teams = Math.max(2, Math.min(10, Number(teamCount) || 2))
  const attendees = useMemo(()=> players.filter(p=> attendeeIds.includes(p.id)), [players, attendeeIds])

  // 자동 배정 결과
  const autoSplit = useMemo(()=> splitKTeams(attendees, teams, criterion), [attendees, teams, criterion])

  // 트리거 바뀌면 수동/셔플 초기화
  useEffect(()=>{
    setManualTeams(null)
    setShuffleSeed(0)
  }, [attendees, teams, criterion])

  // 미리보기: 수동 > 셔플 > 자동
  const previewTeams = useMemo(()=>{
    let base = manualTeams ?? autoSplit.teams
    if (!manualTeams && shuffleSeed) base = base.map(list => seededShuffle(list, shuffleSeed + list.length))
    return base
  }, [manualTeams, autoSplit.teams, shuffleSeed])

  function toggle(id){
    setAttendeeIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  function save(){
    const match = mkMatch({
      id: crypto.randomUUID?.() || String(Date.now()),
      dateISO, attendeeIds, criterion, players,
      selectionMode: 'manual',
      teamCount: teams,
      location: { preset: locationPreset, name: locationName, address: locationAddress },
      mode,
      snapshot: previewTeams.map(t => t.map(p => p.id)),
    })
    onSaveMatch(match)
  }

  function exportTeams(){
    const sumsNoGK = previewTeams.map(list =>
      list.filter(p => (p.position || p.pos) !== 'GK').reduce((a, p) => a + (p.ovr ?? overall(p)), 0)
    )
    const avgsNoGK = sumsNoGK.map((sum, i) => {
      const cnt = previewTeams[i].filter(p => (p.position || p.pos) !== 'GK').length
      return cnt ? Math.round(sum / cnt) : 0
    })
    const payload = {
      dateISO, mode, teamCount: teams, criterion,
      selectionMode: 'manual',
      location: { preset: locationPreset, name: locationName, address: locationAddress },
      teams: previewTeams.map(t => t.map(p => ({ id: p.id, name: p.name, pos: p.position, ovr: (p.ovr ?? overall(p)) }))),
      sums: autoSplit.sums, sumsNoGK, avgsNoGK,
    }
    downloadJSON(payload, `match_${dateISO.replace(/[:T]/g,'-')}.json`)
  }

  const allSelected = attendeeIds.length === players.length && players.length > 0
  function toggleSelectAll(){ allSelected ? setAttendeeIds([]) : setAttendeeIds(players.map(p => p.id)) }

  // --- 팀 내 정렬 액션들(툴바에서 사용) ---
  function reshuffleTeams(){
    const seed = (Date.now() ^ Math.floor(Math.random()*0xffffffff)) >>> 0
    setShuffleSeed(seed)
    setManualTeams(prev => {
      const base = prev ?? autoSplit.teams
      return base.map(list => seededShuffle(list, seed + list.length))
    })
  }
  function sortTeamsByOVR(order = 'desc'){
    const base = manualTeams ?? previewTeams
    const sorted = base.map(list => {
      const a = list.map(p => ({ p, s: p.ovr ?? overall(p) }))
      a.sort((x,y)=> order==='asc' ? (x.s - y.s) : (y.s - x.s))
      return a.map(x=>x.p)
    })
    setManualTeams(sorted)
  }
  function resetManual(){ setManualTeams(null); setShuffleSeed(0) }

  // ====== dnd-kit: 센서 & 핸들러 ======
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 120, tolerance: 6 } })
  )

  function findTeamIndexByItemId(itemId){
    return previewTeams.findIndex(list => list.some(p => String(p.id) === String(itemId)))
  }

  function onDragStartHandler(e){
    setActivePlayerId(e.active.id)
    setActiveFromTeam(findTeamIndexByItemId(e.active.id))
    document.body.classList.add('cursor-grabbing')
  }
  function onDragCancel(){
    setActivePlayerId(null); setActiveFromTeam(null)
    document.body.classList.remove('cursor-grabbing')
  }
  function onDragEndHandler(e){
    const { active, over } = e
    setActivePlayerId(null)
    document.body.classList.remove('cursor-grabbing')
    if (!over) return

    const fromTeam = activeFromTeam
    let toTeam = -1
    const overId = String(over.id)
    if (overId.startsWith('team-')) toTeam = Number(overId.split('-')[1])
    else toTeam = findTeamIndexByItemId(overId)

    if (fromTeam == null || toTeam == null || fromTeam < 0 || toTeam < 0) return

    const base = manualTeams ?? previewTeams
    const next = base.map(list => list.slice())

    const fromIdx = next[fromTeam].findIndex(p => String(p.id) === String(active.id))
    if (fromIdx < 0) return
    const moving = next[fromTeam][fromIdx]
    next[fromTeam].splice(fromIdx, 1)

    if (fromTeam === toTeam) {
      const overIdx = next[toTeam].findIndex(p => String(p.id) === overId)
      const insertAt = overId.startsWith('team-') ? next[toTeam].length : (overIdx >= 0 ? overIdx : next[toTeam].length)
      next[toTeam].splice(insertAt, 0, moving)
    } else {
      if (!next[toTeam].some(p => String(p.id) === String(moving.id))) {
        const overIdx = next[toTeam].findIndex(p => String(p.id) === overId)
        const insertAt = overId.startsWith('team-') ? next[toTeam].length : (overIdx >= 0 ? overIdx : next[toTeam].length)
        next[toTeam].splice(insertAt, 0, moving)
      }
    }
    setManualTeams(next)
    setActiveFromTeam(null)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_560px]">
      <Card title="매치 설정"
        right={
          <div className="flex items-center gap-2">
            <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" value={criterion} onChange={(e)=>setCriterion(e.target.value)}>
              <option value="overall">전체</option>
              <option value="attack">공격</option>
              <option value="defense">수비</option>
              <option value="pace">스피드</option>
            </select>
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              추천 {autoSuggestion.mode} · {autoSuggestion.teams}팀
            </span>
          </div>
        }
      >
        <div className="grid gap-4">
          {/* 날짜/시간 */}
          <div className="grid items-center gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
            <label className="text-sm text-gray-600">날짜/시간</label>
            <input type="datetime-local" value={dateISO} onChange={(e)=>setDateISO(e.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2" />
          </div>

          {/* 장소 */}
          <div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
            <label className="mt-1 text-sm text-gray-600">장소</label>
            <div className="grid gap-2">
              <select
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                value={locationPreset}
                onChange={(e) => {
                  const v = e.target.value
                  setLocationPreset(v)
                  if (v === 'coppell-west') { setLocationName('Coppell Middle School - West'); setLocationAddress('2701 Ranch Trail, Coppell, TX 75019') }
                  else if (v === 'indoor-soccer-zone') { setLocationName('Indoor Soccer Zone'); setLocationAddress('2323 Crown Rd, Dallas, TX 75229') }
                  else { setLocationName(''); setLocationAddress('') }
                }}
              >
                <option value="coppell-west">Coppell Middle School - West</option>
                <option value="indoor-soccer-zone">Indoor Soccer Zone</option>
                <option value="other">Other (Freeform)</option>
              </select>
              {locationPreset !== 'other'
                ? <div className="text-xs text-gray-500">주소: {locationAddress}</div>
                : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="장소 이름" value={locationName} onChange={(e)=>setLocationName(e.target.value)} />
                    <input className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="주소" value={locationAddress} onChange={(e)=>setLocationAddress(e.target.value)} />
                  </div>
                )}
            </div>
          </div>

          {/* 팀 수 */}
          <div className="grid items-center gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
            <label className="text-sm text-gray-600">팀 수</label>
            <div className="flex items-center gap-3">
              <select className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" value={teams} onChange={(e)=> setTeamCount(Number(e.target.value))}>
                {Array.from({length:9}, (_,i)=> i+2).map(n=> <option key={n} value={n}>{n}팀</option>)}
              </select>
              <span className="text-xs text-gray-500">적용: {mode} · {teams}팀</span>
            </div>
          </div>

          {/* 참석자 — 가로 한 줄 레이아웃(원복 유지) */}
          <div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
            <label className="text-sm text-gray-600 flex items-center gap-2">
              참석 ({attendeeIds.length}명)
              <button
                type="button"
                onClick={toggleSelectAll}
                className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                title={allSelected ? '모두 해제' : '모두 선택'}
              >
                {allSelected ? '모두 해제' : '모두 선택'}
              </button>
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {players.map(p=>(
                <label
                  key={p.id}
                  className={`flex items-center gap-2 rounded border px-3 py-2 ${
                    attendeeIds.includes(p.id) ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input type="checkbox" checked={attendeeIds.includes(p.id)} onChange={()=>toggle(p.id)} />
                  <InitialAvatar id={p.id} name={p.name} size={24} />
                  <span className="text-sm flex-1 whitespace-normal break-words">
                    {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                  </span>
                  {!hideOVR && (p.position || p.pos) !== 'GK' && (
                    <span className="text-xs text-gray-500 shrink-0">OVR {p.ovr ?? overall(p)}</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 text-white font-semibold">매치 저장</button>
            <button onClick={exportTeams} className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700">라인업 Export</button>
          </div>
        </div>
      </Card>

      {/* 우측: 팀 배정 미리보기 + 정렬/편집 툴바(이 섹션으로 이동) */}
      <div className="grid gap-4">
        <Card title="팀 배정 미리보기 (드레그 & 드랍 으로 커트텀 팀 조합 가능)"
          right={
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
              기준: {criterion} · <span className="font-medium">GK는 평균 계산에 포함되지 않습니다</span>
            </div>
          }
        >
          {/* === 정렬/편집 툴바 === */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-gray-500 sm:hidden">
              기준: {criterion} · <span className="font-medium">GK 평균 제외</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* OVR 숨기기 토글 버튼(알약 스위치) */}
              <button
                type="button"
                aria-pressed={hideOVR}
                onClick={()=>setHideOVR(v=>!v)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                  hideOVR ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                }`}
                title="OVR 표시/숨김"
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${hideOVR ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                OVR 숨기기
              </button>

              {/* 구분점 */}
              <span className="mx-1 hidden sm:inline-block h-5 w-px bg-gray-200" />

              {/* 팀 내 정렬/랜덤 */}
              <button
                type="button"
                onClick={reshuffleTeams}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                title="각 팀 내 선수 순서를 무작위로 섞기"
              >
                <span className="text-base">🎲</span> 랜덤
              </button>
              <button
                type="button"
                onClick={()=>sortTeamsByOVR('asc')}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                title="각 팀 내 OVR 오름차순 정렬"
              >
                <span className="text-base">⬆️</span> OVR
              </button>
              <button
                type="button"
                onClick={()=>sortTeamsByOVR('desc')}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                title="각 팀 내 OVR 내림차순 정렬"
              >
                <span className="text-base">⬇️</span> OVR
              </button>

              {/* 수동 편집 초기화 */}
              {manualTeams && (
                <button
                  type="button"
                  onClick={resetManual}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                  title="드래그/정렬로 바뀐 순서를 초기화"
                >
                  <span className="text-base">↺</span> 초기화
                </button>
              )}
            </div>
          </div>

          {/* === DnD 컨텍스트 === */}
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}  // 넓은 드롭 판정
            onDragStart={onDragStartHandler}
            onDragCancel={onDragCancel}
            onDragEnd={onDragEndHandler}
          >
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {previewTeams.map((list, i)=>(
                <TeamColumn key={i} teamIndex={i} labelKit={kitForTeam(i)} players={list} hideOVR={hideOVR} />
              ))}
            </div>

            {/* 드래그 고스트: 알약 + 그림자 */}
            <DragOverlay>
              {activePlayerId ? (
                <DragGhost player={players.find(p => String(p.id) === String(activePlayerId))} hideOVR={hideOVR} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </Card>

        {/* 저장된 매치 */}
        <Card title="저장된 매치 (최신 선수 정보 반영)" right={<div className="text-xs text-gray-500"><span className="font-medium">GK 평균 제외</span></div>}>
          {matches.length === 0 ? (
            <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div>
          ) : (
            <ul className="space-y-2">
              {matches.map(m => {
                const hydrated = hydrateMatch(m, players)
                return (
                  <li key={m.id} className="rounded border border-gray-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm">
                        <b>{m.dateISO.replace('T',' ')}</b> · {m.mode} · {m.teamCount}팀 · 참석 {m.attendeeIds.length}명
                        {m.location?.name ? <> · 장소 {m.location.name}</> : null}
                      </div>
                      <button className="text-xs text-red-600" onClick={()=> onDeleteMatch(m.id)}>삭제</button>
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      {hydrated.teams.map((list, i)=>{
                        const kit = kitForTeam(i)
                        const nonGKs = list.filter(p => (p.position || p.pos) !== 'GK')
                        const sumNoGK = nonGKs.reduce((a,p)=> a + (p.ovr ?? overall(p)), 0)
                        const avgNoGK = nonGKs.length ? Math.round(sumNoGK / nonGKs.length) : 0
                        return (
                          <div key={i} className="rounded border border-gray-200">
                            <div className={`mb-1 flex items-center justify-between px-2 py-1 text-xs ${kit.headerClass}`}>
                              <span>팀 {i+1}</span>
                              <span className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sumNoGK} · 평균 {avgNoGK}</span>
                            </div>
                            <ul className="space-y-1 p-2 pt-0 text-sm">
                              {list.map(p=>(
                                <li key={p.id} className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0">
                                  <span className="flex items-center gap-2 min-w-0 flex-1">
                                    <InitialAvatar id={p.id} name={p.name} size={24} />
                                    <span className="truncate">{p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}</span>
                                  </span>
                                  {!hideOVR && (p.position||p.pos)!=='GK' && <span className="text-gray-500 shrink-0">OVR {p.ovr ?? overall(p)}</span>}
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
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

/* === 팀 컬럼(드롭존 + 팀 내 정렬 컨텍스트) === */
function TeamColumn({ teamIndex, labelKit, players, hideOVR }){
  const containerId = `team-${teamIndex}`
  const { setNodeRef, isOver } = useDroppable({ id: containerId })
  return (
    <div ref={setNodeRef} className={`rounded-lg border bg-white transition ${isOver ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-200'}`}>
      <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${labelKit.headerClass}`}>
        <div className="font-semibold">팀 {teamIndex+1}</div>
        <div className="opacity-80">
          {labelKit.label} · {players.length}명 · <b>팀파워</b> {
            players.filter(p => (p.position || p.pos) !== 'GK').reduce((a,p)=> a + (p.ovr ?? overall(p)), 0)
          } · 평균 {
            (() => {
              const non = players.filter(p => (p.position || p.pos) !== 'GK')
              return non.length ? Math.round(non.reduce((a,p)=> a + (p.ovr ?? overall(p)), 0) / non.length) : 0
            })()
          }
        </div>
      </div>
      <SortableContext id={containerId} items={players.map(p => String(p.id))} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1 px-3 pb-3 text-sm min-h-[44px]">
          {/* 드롭 가이드 */}
          {isOver && (
            <li className="rounded border-2 border-dashed border-emerald-400/70 bg-emerald-50/40 px-2 py-1 text-xs text-emerald-700">
              여기에 드롭
            </li>
          )}
          {players.map(p => <PlayerRow key={p.id} player={p} hideOVR={hideOVR} />)}
          {players.length===0 && !isOver && <li className="text-xs text-gray-400">팀원 없음 — 이 카드로 드래그해서 추가</li>}
        </ul>
      </SortableContext>
    </div>
  )
}

/* === 개별 선수 행 === */
function PlayerRow({ player, hideOVR }){
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(player.id) })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    boxShadow: isDragging ? '0 6px 18px rgba(0,0,0,.12)' : undefined,
    borderRadius: 8,
    background: isDragging ? 'rgba(16,185,129,0.06)' : undefined,
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0 touch-manipulation cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <InitialAvatar id={player.id} name={player.name} size={24} />
        <span className="whitespace-normal break-words">
          {player.name} {(player.position||player.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
        </span>
      </span>
      {!hideOVR && (player.position||player.pos)!=='GK' && (
        <span className="text-gray-500 text-xs shrink-0">OVR {player.ovr ?? overall(player)}</span>
      )}
    </li>
  )
}

/* --- 드래그 오버레이 고스트 (알약 + 그림자) --- */
function DragGhost({ player, hideOVR }){
  if (!player) return null
  return (
    <div
      className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 shadow-xl text-sm flex items-center gap-2 scale-[1.04]"
      style={{ filter: 'drop-shadow(0 8px 20px rgba(0,0,0,.18))' }}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">⇆</span>
      <span className="font-medium">{player.name}</span>
      {!hideOVR && (player.position||player.pos)!=='GK' && (
        <span className="text-gray-500">OVR {player.ovr ?? overall(player)}</span>
      )}
    </div>
  )
}

/* --- 10가지 팀 팔레트 --- */
function kitForTeam(idx){
  const kits = [
    { label: '화이트', headerClass: 'bg-white text-stone-800 border-b border-stone-300' },
    { label: '블랙',   headerClass: 'bg-stone-900 text-white border-b border-stone-900' },
    { label: '블루',   headerClass: 'bg-blue-600 text-white border-b border-blue-700' },
    { label: '레드',   headerClass: 'bg-red-600 text-white border-b border-red-700' },
    { label: '그린',   headerClass: 'bg-emerald-600 text-white border-b border-emerald-700' },
    { label: '퍼플',   headerClass: 'bg-violet-600 text-white border-b border-violet-700' },
    { label: '오렌지', headerClass: 'bg-orange-500 text-white border-b border-orange-600' },
    { label: '티얼',   headerClass: 'bg-teal-600 text-white border-b border-teal-700' },
    { label: '핑크',   headerClass: 'bg-pink-600 text-white border-b border-pink-700' },
    { label: '옐로',   headerClass: 'bg-yellow-400 text-stone-900 border-b border-yellow-500' },
  ]
  return kits[idx % kits.length]
}

/* --- 셔플 & 랜덤함수 --- */
function seededShuffle(arr, seed = 1){
  const a = [...arr]
  const rand = mulberry32(seed >>> 0)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function mulberry32(a){
  return function(){
    let t = (a += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* --- 이니셜 아바타 --- */
function InitialAvatar({ id, name, size = 24 }) {
  const initial = (name || "?").trim().charAt(0)?.toUpperCase() || "?"
  const color = "#" + stringToColor(String(id || "seed"))
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.5), backgroundColor: color }
  return (
    <div className="flex items-center justify-center rounded-full text-white font-semibold select-none" style={style}>
      {initial}
    </div>
  )
}
function stringToColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return ((hash >>> 0).toString(16) + "000000").substring(0, 6)
}
