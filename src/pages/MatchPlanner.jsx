// src/pages/MatchPlanner.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import { mkMatch, decideMode, splitKTeams, determineConfig, hydrateMatch } from '../lib/match'
import { downloadJSON } from '../utils/io'
import { overall } from '../lib/players'

export default function MatchPlanner({ players, matches, onSaveMatch, onDeleteMatch }){
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0,16))
  const [attendeeIds, setAttendeeIds] = useState([])
  const [criterion, setCriterion] = useState('overall')

  const [selectionMode, setSelectionMode] = useState('auto') // 'auto' | '9v9' | '11v11'
  const [teamCount, setTeamCount] = useState(null)           // null = 추천 기본값

  // 장소 상태
  const [locationPreset, setLocationPreset] = useState('coppell-west') // 'coppell-west' | 'indoor-soccer-zone' | 'other'
  const [locationName, setLocationName] = useState('Coppell Middle School - West')
  const [locationAddress, setLocationAddress] = useState('2701 Ranch Trail, Coppell, TX 75019')

  const count = attendeeIds.length
  const autoSuggestion = decideMode(count)
  const { mode, teams } = determineConfig(count, selectionMode, teamCount)

  const attendees = useMemo(()=> players.filter(p=> attendeeIds.includes(p.id)), [players, attendeeIds])
  const split = useMemo(()=> splitKTeams(attendees, teams, criterion), [attendees, teams, criterion])

  function toggle(id){
    setAttendeeIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  function save(){
    const match = mkMatch({
      id: crypto.randomUUID?.() || String(Date.now()),
      dateISO,
      attendeeIds,
      criterion,
      players,
      selectionMode,
      teamCount,
      location: {
        preset: locationPreset,
        name: locationName,
        address: locationAddress,
      },
    })
    onSaveMatch(match)
  }

  function exportTeams(){
    // GK 제외 합계/평균도 함께 내보내기
    const sumsNoGK = split.teams.map(list =>
      list.filter(p => (p.position || p.pos) !== 'GK').reduce((a, p) => a + (p.ovr ?? overall(p)), 0)
    )
    const avgsNoGK = sumsNoGK.map((sum, i) => {
      const cnt = split.teams[i].filter(p => (p.position || p.pos) !== 'GK').length
      return cnt ? Math.round(sum / cnt) : 0
    })

    const payload = {
      dateISO, mode, teamCount: teams, criterion,
      selectionMode,
      location: {
        preset: locationPreset,
        name: locationName,
        address: locationAddress,
      },
      teams: split.teams.map(t => t.map(p => ({
        id: p.id, name: p.name, pos: p.position, ovr: (p.ovr ?? overall(p))
      }))),
      sums: split.sums,           // 원래 합계(참고용)
      sumsNoGK,                   // GK 제외 합계
      avgsNoGK,                   // GK 제외 평균
    }
    downloadJSON(payload, `match_${dateISO.replace(/[:T]/g,'-')}.json`)
  }

  useEffect(()=>{
    if (teamCount === null) {
      if (selectionMode === '11v11') setTeamCount(2)
      else if (selectionMode === '9v9') setTeamCount(3)
      else setTeamCount(null)
    }
  }, [selectionMode]) // eslint-disable-line react-hooks/exhaustive-deps

  function onChangeTeams(val){
    if (val === '' || val === null) { setTeamCount(null); return }
    const n = Math.max(2, Math.min(8, Math.floor(Number(val))))
    setTeamCount(Number.isFinite(n) ? n : null)
  }

  const allSelected = attendeeIds.length === players.length && players.length > 0
  function toggleSelectAll(){
    if (allSelected) {
      setAttendeeIds([]) // 모두 해제
    } else {
      setAttendeeIds(players.map(p => p.id)) // 모두 선택
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
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
                <div className="text-xs text-gray-500">
                  주소: {locationAddress}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                    placeholder="장소 이름"
                    value={locationName}
                    onChange={(e)=>setLocationName(e.target.value)}
                  />
                  <input
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                    placeholder="주소"
                    value={locationAddress}
                    onChange={(e)=>setLocationAddress(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 모드 / 팀 수 */}
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr]">
            <label className="text-sm text-gray-600">모드/팀수</label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <ModeButton label="Auto" active={selectionMode==='auto'} onClick={()=>setSelectionMode('auto')} />
                <ModeButton label="9:9" active={selectionMode==='9v9'} onClick={()=>setSelectionMode('9v9')} />
                <ModeButton label="11:11" active={selectionMode==='11v11'} onClick={()=>setSelectionMode('11v11')} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">팀 수</span>
                <input
                  type="number"
                  min={2}
                  max={8}
                  placeholder={selectionMode==='auto' ? String(autoSuggestion.teams) : (selectionMode==='11v11' ? '2' : '3')}
                  value={teamCount ?? ''}
                  onChange={(e)=>onChangeTeams(e.target.value)}
                  className="w-20 rounded border border-gray-300 bg-white px-2 py-1"
                  title="비워두면 Auto/모드 기본값 사용 (2~8)"
                />
                <span className="text-xs text-gray-500">적용: {mode} · {teams}팀</span>
              </div>
            </div>
          </div>

          {/* 참석자 — 모두선택 버튼 추가 + GK OVR 숨김 유지 */}
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
                  <span className="text-sm">{p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}</span>
                  {(p.position || p.pos) !== 'GK' && (
                    <span className="text-xs text-gray-500">OVR {p.ovr ?? overall(p)}</span>
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
          title="팀 배정 미리보기"
          right={
            <div className="text-xs text-gray-500">
              기준: {criterion} · <span className="font-medium">GK는 평균 계산에 포함되지 않습니다</span>
            </div>
          }
        >
          <div className={`grid gap-4 ${teams>=3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {split.teams.map((list, i)=>(
              <TeamPreview key={i} idx={i} list={list} />
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
                const hydrated = hydrateMatch(m, players) // {teams: [...], sums: [...] (원본)
                return (
                  <li key={m.id} className="rounded border border-gray-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm">
                        <b>{m.dateISO.replace('T',' ')}</b> · {m.mode} · {m.teamCount}팀 · 참석 {m.attendeeIds.length}명
                        {m.location?.name ? <> · 장소 {m.location.name}</> : null}
                      </div>
                      <button className="text-xs text-red-600" onClick={()=> onDeleteMatch(m.id)}>삭제</button>
                    </div>
                    <div className={`grid gap-3 ${m.teamCount>=3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
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
                                {kit.label} · {list.length}명 · 합계 {sumNoGK} · 평균 {avgNoGK}
                              </span>
                            </div>
                            <ul className="space-y-1 p-2 pt-0 text-sm">
                              {list.map(p=>(
                                <li key={p.id} className="flex items-center justify-between border-t border-gray-100 pt-1 first:border-0 first:pt-0">
                                  <span className="flex items-center gap-2">
                                    <InitialAvatar id={p.id} name={p.name} size={24} />
                                    {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                                  </span>
                                  {/* GK는 OVR 숨김, 그 외 표기 */}
                                  {(p.position||p.pos)!=='GK' && (
                                    <span className="text-gray-500">OVR {p.ovr ?? overall(p)}</span>
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

function ModeButton({ label, active, onClick }){
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-sm border transition ${
        active ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

/* --- 유니폼 규칙: 팀1=화이트, 팀2=블랙, 팀3=블루(있으면), 그 외 그레이 --- */
function kitForTeam(idx){
  switch (idx) {
    case 0: return { label: '화이트', headerClass: 'bg-white text-stone-800 border-b border-stone-300' }
    case 1: return { label: '블랙',   headerClass: 'bg-stone-900 text-white border-b border-stone-900' }
    case 2: return { label: '블루',   headerClass: 'bg-blue-600 text-white border-b border-blue-700' }
    default:return { label: '그레이',  headerClass: 'bg-stone-400 text-white border-b border-stone-500' }
  }
}

function TeamPreview({ idx, list }){
  const kit = kitForTeam(idx)
  const nonGKs = list.filter(p => (p.position || p.pos) !== 'GK')
  const sumNoGK = nonGKs.reduce((a,p)=> a + (p.ovr ?? overall(p)), 0)
  const avgNoGK = nonGKs.length ? Math.round(sumNoGK / nonGKs.length) : 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${kit.headerClass}`}>
        <div className="font-semibold">팀 {idx+1}</div>
        <div className="opacity-80">
          {kit.label} · {list.length}명 · 합계 {sumNoGK} · 평균 {avgNoGK}
        </div>
      </div>
      <ul className="space-y-1 px-3 pb-3 text-sm">
        {list.map(p=>(
          <li key={p.id} className="flex items-center justify-between border-t border-gray-100 pt-1 first:border-0 first:pt-0">
            <span className="flex items-center gap-2">
              <InitialAvatar id={p.id} name={p.name} size={24} />
              {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
            </span>
            {/* GK는 OVR 숨김, 그 외 표기 */}
            {(p.position||p.pos)!=='GK' && (
              <span className="text-gray-500">OVR {p.ovr ?? overall(p)}</span>
            )}
          </li>
        ))}
        {list.length===0 && <li className="text-xs text-gray-400">선택된 인원이 없습니다.</li>}
      </ul>
    </div>
  )
}

/* --- PlayersPage와 일치하는 컨셉: 이니셜 아바타(배경색은 id 기반 고정) --- */
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
