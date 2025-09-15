// src/pages/MatchPlanner.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Card from '../components/Card'
import { mkMatch, decideMode, splitKTeams, hydrateMatch } from '../lib/match'
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
import SavedMatchesList from '../components/SavedMatchesList'

/* 다가오는 토요일 06:30 로컬 -> "YYYY-MM-DDTHH:MM" */
function nextSaturday0630Local() {
  const now = new Date()
  const dow = now.getDay()
  let add = (6 - dow + 7) % 7
  if (add === 0) {
    const test = new Date(now)
    test.setHours(6, 30, 0, 0)
    if (now > test) add = 7
  }
  const d = new Date(now)
  d.setDate(now.getDate() + add)
  d.setHours(6, 30, 0, 0)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  const HH = String(d.getHours()).padStart(2,'0')
  const MM = String(d.getMinutes()).padStart(2,'0')
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}`
}

/* ────────────────────────────────────────────
 * 포지션 유틸 + 포지션 분산 스플리터
 * ──────────────────────────────────────────── */
function positionGroupOf(p) {
  const raw = String(p.position || p.pos || '').toUpperCase()
  if (raw === 'GK' || raw.includes('GK')) return 'GK'
  const df = ['DF','CB','LB','RB','LWB','RWB','CBR','CBL','SW']
  const mf = ['MF','CM','DM','AM','LM','RM','CDM','CAM','RDM','LDM','RCM','LCM']
  const fw = ['FW','ST','CF','LW','RW','RF','LF']
  if (df.some(k => raw.includes(k))) return 'DF'
  if (mf.some(k => raw.includes(k))) return 'MF'
  if (fw.some(k => raw.includes(k))) return 'FW'
  return 'OTHER'
}
const POSITION_ORDER = ['GK','DF','MF','FW','OTHER']
const positionOrderIndex = (p) => POSITION_ORDER.indexOf(positionGroupOf(p))

function sortByOVRDescWithSeed(list, seed=0) {
  const shuffled = seededShuffle(list.slice(), seed || 0x9e3779b1)
  return shuffled.sort((a,b) => (b.ovr ?? overall(b)) - (a.ovr ?? overall(a)))
}

function splitKTeamsPosAware(players, k, seed = 0) {
  const teams = Array.from({ length: k }, () => [])
  const meta  = Array.from({ length: k }, () => ({
    nonGkOVR: 0, counts: { GK:0, DF:0, MF:0, FW:0, OTHER:0 }
  }))

  const groups = {
    GK:   players.filter(p => positionGroupOf(p) === 'GK'),
    DF:   players.filter(p => positionGroupOf(p) === 'DF'),
    MF:   players.filter(p => positionGroupOf(p) === 'MF'),
    FW:   players.filter(p => positionGroupOf(p) === 'FW'),
    OTHER:players.filter(p => positionGroupOf(p) === 'OTHER'),
  }
  for (const key of Object.keys(groups)) {
    groups[key] = sortByOVRDescWithSeed(groups[key], seed + key.length)
  }

  function placeGroup(key) {
    const list = groups[key]
    let dir = 1
    while (list.length) {
      const orderedTeams = Array.from({ length: k }, (_, i) => i).sort((i, j) => {
        const ci = meta[i].counts[key], cj = meta[j].counts[key]
        if (ci !== cj) return ci - cj
        return meta[i].nonGkOVR - meta[j].nonGkOVR
      })
      const pickOrder = dir === 1 ? orderedTeams : orderedTeams.slice().reverse()
      for (const teamIndex of pickOrder) {
        if (!list.length) break
        const p = list.shift()
        teams[teamIndex].push(p)
        meta[teamIndex].counts[key]++
        if (key !== 'GK') meta[teamIndex].nonGkOVR += (p.ovr ?? overall(p))
      }
      dir *= -1
    }
  }
  ;['GK','DF','MF','FW','OTHER'].forEach(placeGroup)
  return { teams }
}

/* ──────────────────────────────────────────── */

export default function MatchPlanner({ players, matches, onSaveMatch, onDeleteMatch, onUpdateMatch, isAdmin }){
  const [dateISO,setDateISO]=useState(()=>nextSaturday0630Local())
  const [attendeeIds,setAttendeeIds]=useState([])
  const [criterion,setCriterion]=useState('overall')
  const [teamCount,setTeamCount]=useState(2)
  const [hideOVR,setHideOVR]=useState(false)
  const [shuffleSeed,setShuffleSeed]=useState(0)

  const [locationPreset,setLocationPreset]=useState('coppell-west')
  const [locationName,setLocationName]=useState('Coppell Middle School - West')
  const [locationAddress,setLocationAddress]=useState('2701 Ranch Trail, Coppell, TX 75019')

  const [feeMode, setFeeMode] = useState('preset') // 'preset' | 'custom'
  const [customBaseCost, setCustomBaseCost] = useState(0)

  const [manualTeams,setManualTeams]=useState(null)
  const [activePlayerId,setActivePlayerId]=useState(null)
  const [activeFromTeam,setActiveFromTeam]=useState(null)

  const [formations,setFormations]=useState([])
  const [placedByTeam,setPlacedByTeam]=useState([])

  const latestTeamsRef = useRef([])

  const [editorOpen,setEditorOpen]=useState(false)
  const [editingTeamIdx,setEditingTeamIdx]=useState(0)
  const [editingMatchId, setEditingMatchId] = useState(null)
  const [editorPlayers, setEditorPlayers] = useState([])

  // ✅ 포지션 고려 분산 토글(기본 ON)
  const [posAware, setPosAware] = useState(true)

  const count=attendeeIds.length
  const autoSuggestion=decideMode(count)
  const mode=autoSuggestion.mode
  const teams=Math.max(2,Math.min(10,Number(teamCount)||2))
  const attendees=useMemo(()=>players.filter(p=>attendeeIds.includes(p.id)),[players,attendeeIds])

  // ✅ 자동 분배: 포지션 고려 or 기존 방식
  const autoSplit=useMemo(()=>{
    if (posAware) {
      return splitKTeamsPosAware(attendees, teams, shuffleSeed)
    }
    return splitKTeams(attendees, teams, criterion)
  },[attendees,teams,criterion,posAware,shuffleSeed])

  const skipAutoResetRef = useRef(false)
  useEffect(()=>{
    if (skipAutoResetRef.current) { skipAutoResetRef.current = false; return }
    setManualTeams(null)
    setShuffleSeed(0)
  },[attendees,teams,criterion,posAware])

  /* 💰 베이스 금액(장소별 or 커스텀) */
  const baseCost = useMemo(()=>{
    if (feeMode === 'custom') return Math.max(0, Number(customBaseCost)||0)
    return (
      locationPreset==='indoor-soccer-zone' ? 230 :
      locationPreset==='coppell-west' ? 300 : 0
    )
  },[feeMode, customBaseCost, locationPreset])

  const PREMIUM = 1.2
  const liveFees = useMemo(()=>{
    const isMember = (v)=>String(v??'').trim()==='member'||String(v??'').trim()==='정회원'
    const memberCount = attendees.filter(p => isMember(p.membership)).length
    const guestCount  = attendees.length - memberCount
    if (attendees.length===0 || baseCost<=0) return { total: baseCost, memberFee: 0, guestFee: 0, premium: PREMIUM }
    const x = baseCost / (memberCount + PREMIUM * guestCount)
    return { total: baseCost, memberFee: Math.round(x), guestFee: Math.round(PREMIUM*x), premium: PREMIUM }
  },[attendees, baseCost])

  const previewTeams=useMemo(()=>{
    let base=manualTeams??autoSplit.teams
    if(!manualTeams&&shuffleSeed) {
      base = base.map(list=>seededShuffle(list,shuffleSeed+list.length))
    }
    return base
  },[manualTeams,autoSplit.teams,shuffleSeed])

  useEffect(()=>{ latestTeamsRef.current = previewTeams }, [previewTeams])

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

  function computeFeesAtSave({ baseCostValue, attendees }) {
    const base = Math.max(0, Number(baseCostValue)||0)
    const isMember = (v)=>String(v??'').trim()==='member'||String(v??'').trim()==='정회원'
    const memberCount = attendees.filter(p => isMember(p.membership)).length
    const guestCount  = attendees.length - memberCount
    if (base<=0 || attendees.length===0) return { total: base, memberFee: 0, guestFee: 0, premium: PREMIUM }
    const x = base / (memberCount + PREMIUM * guestCount)
    return { total: base, memberFee: Math.round(x), guestFee: Math.round(PREMIUM*x), premium: PREMIUM }
  }

  function save(){
    if(!isAdmin){ notify('Admin만 가능합니다.'); return }

    const baseTeams = (latestTeamsRef.current && latestTeamsRef.current.length)
      ? latestTeamsRef.current
      : previewTeams

    const snapshot = baseTeams.map(team => team.map(p => p.id))
    const attendeeIdsFromTeams = snapshot.flat()
    const attendeeObjs = players.filter(p => attendeeIdsFromTeams.includes(p.id))
    const fees = computeFeesAtSave({ baseCostValue: baseCost, attendees: attendeeObjs })
    const base = mkMatch({
      id: crypto.randomUUID?.() || String(Date.now()),
      dateISO,
      attendeeIds: attendeeIdsFromTeams,
      criterion: posAware ? 'pos-aware' : criterion,
      players,
      selectionMode: 'manual',
      teamCount: baseTeams.length,
      location: { preset: locationPreset, name: locationName, address: locationAddress },
      mode,
      snapshot,
      board: placedByTeam,
      formations,
      locked: true,
      videos: []
    })
    const payload = { ...base, fees }
    onSaveMatch(payload)
    notify('매치가 저장되었습니다 ✅')
  }

  // Select All
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
    latestTeamsRef.current = next
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

  const showOVR = isAdmin && !hideOVR

  function loadSavedIntoPlanner(match){
    if(!match) return
    skipAutoResetRef.current = true

    const hydrated = hydrateMatch(match, players)
    const teamsArr = hydrated.teams || []
    if(teamsArr.length === 0){
      notify('불러올 팀 구성이 없습니다.')
      return
    }

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

    setManualTeams(teamsArr)
    latestTeamsRef.current = teamsArr

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

              {/* 💰 금액 모드 */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="feeMode" value="preset" checked={feeMode==='preset'} onChange={()=>setFeeMode('preset')} />
                  자동(장소별 고정)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="feeMode" value="custom" checked={feeMode==='custom'} onChange={()=>setFeeMode('custom')} />
                  커스텀
                </label>
                {feeMode==='custom' && (
                  <input
                    type="number"
                    min="0"
                    placeholder="총 구장비(예: 230)"
                    value={customBaseCost}
                    onChange={e=>setCustomBaseCost(e.target.value)}
                    className="w-40 rounded border border-gray-300 bg-white px-3 py-1.5"
                  />
                )}
              </div>

              {/* 💰 예상 구장비 즉시 표시 */}
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div>
                  <b>예상 구장비</b>: ${baseCost} / 2시간
                  {feeMode==='preset' && <span className="ml-2 opacity-70">(장소별 고정 금액)</span>}
                  {feeMode==='custom' && <span className="ml-2 opacity-70">(사용자 지정 금액)</span>}
                </div>
                <div className="mt-1">
                  {attendees.length>0 && baseCost>0
                    ? <>멤버 {liveFees.memberFee}$/인 · 게스트 {liveFees.guestFee}$/인</>
                    : <span className="opacity-70">참석자를 선택하면 1인당 금액이 계산됩니다.</span>}
                </div>
              </div>

              {locationPreset==='other' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="장소 이름" value={locationName} onChange={e=>setLocationName(e.target.value)} />
                  <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="주소" value={locationAddress} onChange={e=>setLocationAddress(e.target.value)} />
                </div>
              )}
            </div>
          </Row>

          <Row label="팀 수">
            <div className="flex items-center gap-3">
              <select className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" value={teams} onChange={e=>setTeamCount(Number(e.target.value))}>
                {Array.from({length:9},(_,i)=>i+2).map(n=><option key={n} value={n}>{n}팀</option>)}
              </select>
              {/* ✅ 포지션 고려 매칭 토글 */}
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={posAware} onChange={()=>setPosAware(v=>!v)} />
                포지션 고려 매칭
              </label>
            </div>
          </Row>

          <Row label={<span className="flex items-center gap-2">참석 ({attendeeIds.length}명)
            <button type="button" onClick={toggleSelectAll}
              className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
              {allSelected?'모두 해제':'모두 선택'}</button>
              </span>}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {players.map(p=>{
                const mem = String(p.membership||'').trim()
                const isMember = (mem==='member' || mem.includes('정회원'))
                return (
                  <label key={p.id} className={`flex items-center gap-2 rounded border px-3 py-2 ${attendeeIds.includes(p.id)?'border-emerald-400 bg-emerald-50':'border-gray-200 bg-white hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={attendeeIds.includes(p.id)} onChange={()=>toggle(p.id)} />
                    <InitialAvatar id={p.id} name={p.name} size={24} />
                    <span className="text-sm flex-1 whitespace-normal break-words">
                      {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                    </span>
                    {!isMember && <GuestBadge />}
                    {isAdmin && !hideOVR && (p.position||p.pos)!=='GK' && <span className="text-xs text-gray-500 shrink-0">OVR {p.ovr??overall(p)}</span>}
                  </label>
                )
              })}
            </div>
          </Row>

          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 text-white font-semibold">매치 저장</button>
            )}
          </div>
        </div>
      </Card>

      {/* 오른쪽: 팀 배정 미리보기 */}
      <div className="grid gap-4">
        <Card
          title="팀 배정 미리보기 (드래그 & 드랍 커스텀 가능)"
          right={<div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
            기준: {posAware ? '포지션 분산' : criterion} · <span className="font-medium">GK 평균 제외</span>
          </div>}
        >
          <Toolbar
            isAdmin={isAdmin}
            hideOVR={hideOVR}
            setHideOVR={setHideOVR}
            reshuffleTeams={() => {
              const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
              setShuffleSeed(seed)
              if (posAware) setManualTeams(null)
              else {
                setManualTeams((prev) =>
                  (prev ?? autoSplit.teams).map((list) =>
                    seededShuffle(list, seed + list.length)
                  )
                )
              }
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
            /* ✅ 포지션별 정렬 버튼 (GK→DF→MF→FW→OTHER) */
            sortTeamsByPosition={(dir='asc')=>{
              const base = manualTeams ?? previewTeams
              const mul = dir==='asc' ? 1 : -1
              setManualTeams(
                base.map(list =>
                  list.slice().sort((a,b)=>{
                    const ia = positionOrderIndex(a), ib = positionOrderIndex(b)
                    if (ia !== ib) return (ia - ib) * mul
                    // 같은 포지션이면 OVR 내림
                    const A = a.ovr ?? overall(a), B = b.ovr ?? overall(b)
                    return (B - A) * (dir==='asc' ? 1 : 1) // 동일
                  })
                )
              )
            }}
            resetManual={() => { setManualTeams(null); setShuffleSeed(0) }}
            manualTeams={manualTeams}
          />

          <div className="mb-2 flex items-center justify-end text-[11px] text-gray-500">
            표기: <span className="ml-1 inline-flex items-center gap-1"><GuestBadge /> 게스트</span>
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
                  <TeamColumn
                    teamIndex={i}
                    labelKit={kitForTeam(i)}
                    players={list}
                    showOVR={isAdmin && !hideOVR}
                    isAdmin={isAdmin}
                  />
                </div>
              ))}
            </div>
            <DragOverlay>
              {activePlayerId ? (
                <DragGhost player={players.find(p => String(p.id) === String(activePlayerId))} showOVR={isAdmin && !hideOVR} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </Card>

        <Card title="저장된 매치" right={<div className="text-xs text-gray-500"><span className="font-medium">GK 평균 제외</span></div>}>
          <SavedMatchesList
            matches={matches}
            players={players}
            isAdmin={isAdmin}
            enableLoadToPlanner={true}
            onLoadToPlanner={loadSavedIntoPlanner}
            onDeleteMatch={onDeleteMatch}
            onUpdateMatch={onUpdateMatch}
            showTeamOVRForAdmin={true}
            hideOVR={hideOVR}
          />
        </Card>
      </div>

      {/* 포메이션 에디터(저장본) */}
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

/* ---------------------------- UI 조각들 ---------------------------- */
function Row({label,children}){
  return (
    <div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
      <label className="mt-1 text-sm text-gray-600">{label}</label><div>{children}</div>
    </div>
  )
}

function Toolbar({isAdmin,hideOVR,setHideOVR,reshuffleTeams,sortTeamsByOVR,sortTeamsByPosition,resetManual,manualTeams}){
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={reshuffleTeams} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">랜덤 섞기</button>

        {/* OVR 정렬 */}
        {isAdmin && (
          <>
            <button onClick={()=>sortTeamsByOVR('desc')} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">팀 OVR ↓</button>
            <button onClick={()=>sortTeamsByOVR('asc')} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">팀 OVR ↑</button>
          </>
        )}

        {/* ✅ 포지션 정렬 */}
        <button onClick={()=>sortTeamsByPosition('asc')} className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100">
          포지션 정렬 ↑ (GK→FW)
        </button>
        <button onClick={()=>sortTeamsByPosition('desc')} className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100">
          포지션 정렬 ↓ (FW→GK)
        </button>

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

        <button onClick={resetManual} disabled={!manualTeams} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">수동 편집 초기화</button>
      </div>
    </div>
  )
}

function TeamColumn({ teamIndex,labelKit,players,showOVR,isAdmin }){
  const id=`team-${teamIndex}`
  const { setNodeRef,isOver }=useDroppable({ id })
  const non=players.filter(p=>(p.position||p.pos)!=='GK')
  const sum=non.reduce((a,p)=>a+(p.ovr??overall(p)),0)
  const avg=non.length?Math.round(sum/non.length):0

  // ✅ 포지션 카운트
  const posCount = useMemo(()=>{
    const c = { GK:0, DF:0, MF:0, FW:0, OTHER:0 }
    for (const p of players) c[positionGroupOf(p)]++
    return c
  },[players])

  return (
    <div ref={setNodeRef} className={`rounded-lg border bg-white transition ${isOver?'border-emerald-500 ring-2 ring-emerald-200':'border-gray-200'}`}>
      <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${labelKit.headerClass}`}>
        <div className="font-semibold">팀 {teamIndex+1}</div>
        <div className="opacity-80 flex items-center gap-2">
          <span>{labelKit.label} · {players.length}명</span>
          {isAdmin && (
            <>
              <span className="hidden sm:inline">· <b>팀파워</b> {sum} · 평균 {avg}</span>
            </>
          )}
        </div>
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

  const pos = positionGroupOf(player)
  const isGK = pos === 'GK'
  const ovrVal = player.ovr ?? overall(player)

  return (
    <li ref={setNodeRef} style={style}
      className="flex items-start gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0 touch-manipulation cursor-grab active:cursor-grabbing"
      {...attributes} {...listeners}>
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <InitialAvatar id={player.id} name={player.name} size={24} />
        <span className="whitespace-normal break-words">
          {player.name}
        </span>

        {/* ✅ 포지션 배지 */}
        <span className={`ml-1 inline-flex items-center rounded-full px-2 py-[2px] text-[11px] ${
          isGK ? 'bg-amber-100 text-amber-800' :
          pos==='DF' ? 'bg-blue-100 text-blue-800' :
          pos==='MF' ? 'bg-emerald-100 text-emerald-800' :
          pos==='FW' ? 'bg-rose-100 text-rose-800' :
          'bg-stone-100 text-stone-700'
        }`}>
          {pos}
        </span>
      </span>

      {/* ✅ OVR 표기 (규칙 유지: GK는 OVR 제외) */}
      {showOVR && !isGK && (
        <span className="ovr-chip shrink-0 rounded-full bg-stone-900 text-white text-[11px] px-2 py-[2px] tabular-nums">
          OVR {ovrVal}
        </span>
      )}
    </li>
  )
}

function DragGhost({ player,showOVR }){
  if(!player) return null
  const pos = positionGroupOf(player)
  const isGK = pos === 'GK'
  return (
    <div className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 shadow-xl text-sm flex items-center gap-2 scale-[1.04]" style={{filter:'drop-shadow(0 8px 20px rgba(0,0,0,.18))'}}>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">⇆</span>
      <span className="font-medium">{player.name}</span>
      <span className="text-[11px] rounded-full bg-stone-100 px-2 py-[2px]">{pos}</span>
      {showOVR && !isGK && <span className="text-gray-600 text-[12px]">OVR {player.ovr??overall(player)}</span>}
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
  ]
  return a[i%a.length]
}

function FullscreenModal({ children, onClose }){
  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute inset-4 md:inset-10 rounded-lg bg-white p-4 overflow-auto">
        <div className="mb-2 flex justify-end">
          <button onClick={onClose} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm">닫기</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function GuestBadge(){
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">G</span>
  )
}
