// src/pages/MatchPlanner.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Card from '../components/Card'
import { mkMatch, decideMode, splitKTeams, hydrateMatch } from '../lib/match'
import { downloadJSON } from '../utils/io'
import { overall } from '../lib/players'

export default function MatchPlanner({ players, matches, onSaveMatch, onDeleteMatch }){
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0,16))
  const [attendeeIds, setAttendeeIds] = useState([])
  const [criterion, setCriterion] = useState('overall')

  // 간편 팀 수 드롭다운 (2~10팀)
  const [teamCount, setTeamCount] = useState(2)

  // 표시 옵션
  const [hideOVR, setHideOVR] = useState(false)

  // 팀 내 랜덤 오더: 버튼 클릭 시에만 셔플되도록 "시드"를 저장
  const [shuffleSeed, setShuffleSeed] = useState(0)

  // 장소
  const [locationPreset, setLocationPreset] = useState('coppell-west')
  const [locationName, setLocationName] = useState('Coppell Middle School - West')
  const [locationAddress, setLocationAddress] = useState('2701 Ranch Trail, Coppell, TX 75019')

  // 수동 편집 상태(드래그앤드롭 결과 보관). null이면 자동 배정 결과 사용
  const [manualTeams, setManualTeams] = useState(null)

  // 드래그 상태 UI용
  const [dragOverTeam, setDragOverTeam] = useState(null)
  const dragDataRef = useRef({ fromTeam: null, playerId: null })

  const count = attendeeIds.length
  const autoSuggestion = decideMode(count)
  const mode = autoSuggestion.mode
  const teams = Math.max(2, Math.min(10, Number(teamCount) || 2))

  const attendees = useMemo(()=> players.filter(p=> attendeeIds.includes(p.id)), [players, attendeeIds])

  // 자동 배정
  const autoSplit = useMemo(()=> splitKTeams(attendees, teams, criterion), [attendees, teams, criterion])

  // 자동 배정 변경 시 수동 편집 초기화
  useEffect(()=>{
    setManualTeams(null)
    setShuffleSeed(0)
  }, [attendees, teams, criterion])

  // 미리보기용 팀 배열: 수동 편집 > 셔플 > 자동
  const previewTeams = useMemo(()=>{
    let base = manualTeams ?? autoSplit.teams
    if (!manualTeams && shuffleSeed) {
      base = base.map(list => seededShuffle(list, shuffleSeed + list.length))
    }
    return base
  }, [manualTeams, autoSplit.teams, shuffleSeed])

  function toggle(id){
    setAttendeeIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  // 저장/Export는 항상 "현재 미리보기 결과(previewTeams)" 기준
  function save(){
    const match = mkMatch({
      id: crypto.randomUUID?.() || String(Date.now()),
      dateISO,
      attendeeIds,
      criterion,
      players,
      selectionMode: 'manual',
      teamCount: teams,
      location: { preset: locationPreset, name: locationName, address: locationAddress },
      mode,
      // 참고용: 저장 시점 팀 구성도 함께 넣어두면 나중에 복원 용이
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
      teams: previewTeams.map(t => t.map(p => ({
        id: p.id, name: p.name, pos: p.position, ovr: (p.ovr ?? overall(p))
      }))),
      sums: autoSplit.sums, // 참고용 원본
      sumsNoGK,
      avgsNoGK,
    }
    downloadJSON(payload, `match_${dateISO.replace(/[:T]/g,'-')}.json`)
  }

  const allSelected = attendeeIds.length === players.length && players.length > 0
  function toggleSelectAll(){
    if (allSelected) setAttendeeIds([])
    else setAttendeeIds(players.map(p => p.id))
  }

  function reshuffleTeams(){
    setShuffleSeed((Date.now() ^ Math.floor(Math.random()*0xffffffff)) >>> 0)
    // 수동 편집 중이면 그 배열을 섞어줌
    setManualTeams(prev => {
      if (!prev) return prev
      const seed = (Date.now() ^ Math.floor(Math.random()*0xffffffff)) >>> 0
      return prev.map(list => seededShuffle(list, seed + list.length))
    })
  }

  // ---- Drag & Drop handlers ----
  function onDragStart(e, fromTeamIdx, playerId){
    dragDataRef.current = { fromTeam: fromTeamIdx, playerId }
    e.dataTransfer.setData('text/plain', JSON.stringify(dragDataRef.current))
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOverTeam(e, teamIdx){
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTeam(teamIdx)
  }
  function onDragLeaveTeam(e, teamIdx){
    if (dragOverTeam === teamIdx) setDragOverTeam(null)
  }
  function onDropToTeam(e, toTeamIdx){
    e.preventDefault()
    setDragOverTeam(null)
    let data = dragDataRef.current
    try {
      const raw = e.dataTransfer.getData('text/plain')
      if (raw) data = JSON.parse(raw)
    } catch {}
    const { fromTeam, playerId } = data || {}
    if (playerId == null || fromTeam == null || toTeamIdx == null) return
    if (fromTeam === toTeamIdx) return

    const current = manualTeams ?? autoSplit.teams
    const player = current[fromTeam].find(p => p.id === playerId)
    if (!player) return

    // 중복 방지
    if (current[toTeamIdx].some(p => p.id === playerId)) return

    const next = current.map(list => list.slice())
    // remove from source
    next[fromTeam] = next[fromTeam].filter(p => p.id !== playerId)
    // append to target
    next[toTeamIdx] = [...next[toTeamIdx], player]
    setManualTeams(next)
  }

  function resetManual(){
    setManualTeams(null)
    setShuffleSeed(0)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_520px]">
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
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr]">
            <label className="text-sm text-gray-600">날짜/시간</label>
            <input
              type="datetime-local"
              value={dateISO}
              onChange={(e)=>setDateISO(e.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2"
            />
          </div>

          {/* 장소 */}
          <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr]">
            <label className="mt-1 text-sm text-gray-600">장소</label>
            <div className="grid gap-2">
              <select
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                value={locationPreset}
                onChange={(e) => {
                  const v = e.target.value
                  setLocationPreset(v)
                  if (v === 'coppell-west') {
                    setLocationName('Coppell Middle School - West')
                    setLocationAddress('2701 Ranch Trail, Coppell, TX 75019')
                  } else if (v === 'indoor-soccer-zone') {
                    setLocationName('Indoor Soccer Zone')
                    setLocationAddress('2323 Crown Rd, Dallas, TX 75229')
                  } else {
                    setLocationName('')
                    setLocationAddress('')
                  }
                }}
                title="장소 프리셋 또는 Other 선택"
              >
                <option value="coppell-west">Coppell Middle School - West</option>
                <option value="indoor-soccer-zone">Indoor Soccer Zone</option>
                <option value="other">Other (Freeform)</option>
              </select>

              {locationPreset !== 'other' ? (
                <div className="text-xs text-gray-500">주소: {locationAddress}</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="장소 이름" value={locationName} onChange={(e)=>setLocationName(e.target.value)} />
                  <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="주소" value={locationAddress} onChange={(e)=>setLocationAddress(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* 팀 수 드롭다운 (2~10) */}
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr]">
            <label className="text-sm text-gray-600">팀 수</label>
            <div className="flex items-center gap-3">
              <select
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                value={teams}
                onChange={(e)=> setTeamCount(Number(e.target.value))}
                title="2~10팀까지 선택"
              >
                {Array.from({length:9}, (_,i)=> i+2).map(n=>(
                  <option key={n} value={n}>{n}팀</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">적용: {mode} · {teams}팀</span>
            </div>
          </div>

          {/* 표시/정렬/편집 */}
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr]">
            <label className="text-sm text-gray-600">표시/정렬</label>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={hideOVR} onChange={(e)=>setHideOVR(e.target.checked)} />
                OVR 숨기기
              </label>
              <button
                type="button"
                onClick={reshuffleTeams}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-100"
                title="팀 내 선수 순서를 랜덤으로 재배열"
              >
                팀 내 랜덤 오더
              </button>
              {manualTeams && (
                <button
                  type="button"
                  onClick={resetManual}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-100"
                  title="수동 편집을 초기 상태로 되돌리기"
                >
                  수동 편집 초기화
                </button>
              )}
            </div>
          </div>

          {/* 참석자 */}
          <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr]">
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
                  <span className="text-sm min-w-0 flex-1 truncate">
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

      <div className="grid gap-4">
        <Card
          title="팀 배정 미리보기 (드래그하여 팀 간 이동 가능)"
          right={
            <div className="text-xs text-gray-500">
              기준: {criterion} · <span className="font-medium">GK는 평균 계산에 포함되지 않습니다</span>
            </div>
          }
        >
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
          >
            {previewTeams.map((list, i)=>(
              <TeamPreview
                key={i}
                idx={i}
                list={list}
                hideOVR={hideOVR}
                dragOver={dragOverTeam === i}
                onDragOverTeam={(e)=>onDragOverTeam(e,i)}
                onDragLeaveTeam={(e)=>onDragLeaveTeam(e,i)}
                onDropToTeam={(e)=>onDropToTeam(e,i)}
                onDragStartItem={onDragStart}
              />
            ))}
          </div>
        </Card>

        <Card
          title="저장된 매치 (최신 선수 정보 반영)"
          right={<div className="text-xs text-gray-500"><span className="font-medium">GK 평균 제외</span></div>}
        >
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
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
                    >
                      {hydrated.teams.map((list, i)=>{
                        const kit = kitForTeam(i)
                        const nonGKs = list.filter(p => (p.position || p.pos) !== 'GK')
                        const sumNoGK = nonGKs.reduce((a,p)=> a + (p.ovr ?? overall(p)), 0)
                        const avgNoGK = nonGKs.length ? Math.round(sumNoGK / nonGKs.length) : 0
                        return (
                          <div key={i} className="rounded border border-gray-200">
                            <div className={`mb-1 flex items-center justify-between px-2 py-1 text-xs ${kit.headerClass}`}>
                              <span>팀 {i+1}</span>
                              <span className="opacity-80">
                                {kit.label} · {list.length}명 · <b>팀파워</b> {sumNoGK} · 평균 {avgNoGK}
                              </span>
                            </div>
                            <ul className="space-y-1 p-2 pt-0 text-sm">
                              {list.map(p=>(
                                <li key={p.id} className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0">
                                  <span className="flex items-center gap-2 min-w-0 flex-1">
                                    <InitialAvatar id={p.id} name={p.name} size={24} />
                                    <span className="truncate">
                                      {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                                    </span>
                                  </span>
                                  {!hideOVR && (p.position||p.pos)!=='GK' && (
                                    <span className="text-gray-500 shrink-0">OVR {p.ovr ?? overall(p)}</span>
                                  )}
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

/* --- 유니폼 규칙: 10가지 고정 팔레트(중복 없음) --- */
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

// 시드 기반 셔플 (Fisher–Yates + mulberry32)
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

/* === 팀 카드 컴포넌트 (드래그 대상/드롭 타겟) === */
function TeamPreview({ idx, list, hideOVR, dragOver, onDragOverTeam, onDragLeaveTeam, onDropToTeam, onDragStartItem }){
  const kit = kitForTeam(idx)
  const nonGKs = list.filter(p => (p.position || p.pos) !== 'GK')
  const sumNoGK = nonGKs.reduce((a,p)=> a + (p.ovr ?? overall(p)), 0)
  const avgNoGK = nonGKs.length ? Math.round(sumNoGK / nonGKs.length) : 0

  return (
    <div
      className={`rounded-lg border bg-white transition ${dragOver ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-200'}`}
      onDragOver={onDragOverTeam}
      onDragLeave={onDragLeaveTeam}
      onDrop={onDropToTeam}
    >
      <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${kit.headerClass}`}>
        <div className="font-semibold">팀 {idx+1}</div>
        <div className="opacity-80">
          {kit.label} · {list.length}명 · <b>팀파워</b> {sumNoGK} · 평균 {avgNoGK}
        </div>
      </div>
      <ul className="space-y-1 px-3 pb-3 text-sm">
        {list.map(p=>(
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0 cursor-move"
            draggable
            onDragStart={(e)=>onDragStartItem(e, idx, p.id)}
            title="다른 팀 카드로 끌어서 이동"
          >
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <InitialAvatar id={p.id} name={p.name} size={24} />
              <span className="truncate">
                {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
              </span>
            </span>
            {!hideOVR && (p.position||p.pos)!=='GK' && (
              <span className="text-gray-500 shrink-0">OVR {p.ovr ?? overall(p)}</span>
            )}
          </li>
        ))}
        {list.length===0 && <li className="text-xs text-gray-400">팀원 없음 — 여기에 드래그해서 추가</li>}
      </ul>
    </div>
  )
}

/* --- PlayersPage와 동일한 이니셜 아바타 --- */
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
