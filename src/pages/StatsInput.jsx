// src/pages/StatsInput.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import { hydrateMatch } from '../lib/match'
import { formatMatchLabel } from '../lib/matchLabel'

const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

/* ======== 날짜 파싱 유틸 ======== */
function asTime(v) {
  if (!v) return NaN
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const t = Date.parse(v) // ISO 등 표준 문자열 우선
  return Number.isNaN(t) ? NaN : t
}
function getMatchTime(m) {
  // 우선순위: dateISO → date → created_at
  const candidates = [m?.dateISO, m?.date, m?.created_at]
  for (const c of candidates) {
    const t = asTime(c)
    if (!Number.isNaN(t)) return t
  }
  return 0
}

/* ======== 공용 유틸 ======== */
function extractAttendeeIds(m) {
  const candidates = [m?.snapshot, m?.attendeeIds, m?.attendees, m?.participants, m?.roster].filter(Boolean)
  let raw = []
  for (const c of candidates) { if (Array.isArray(c)) { raw = c; break } }
  if (!Array.isArray(raw)) raw = []
  return raw.flat().map((x) => {
    if (typeof x === 'object' && x !== null) {
      const cand = x.id ?? x.playerId ?? x.user_id ?? x.userId ?? x.pid ?? x.uid
      return toStr(cand)
    }
    return toStr(x)
  }).filter(Boolean)
}

function extractStatsByPlayer(m) {
  const src = m?.stats ?? m?.records ?? m?.playerStats ?? m?.ga ?? m?.scoreboard ?? null
  const out = {}
  if (!src) return out
  if (!Array.isArray(src) && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const pid = toStr(k)
      if (!pid) continue
      out[pid] = { goals: Number(v?.goals || 0), assists: Number(v?.assists || 0) }
    }
    return out
  }
  if (Array.isArray(src)) {
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid)
      if (!pid) continue
      out[pid] = {
        goals: (out[pid]?.goals || 0) + Number(rec?.goals || 0),
        assists: (out[pid]?.assists || 0) + Number(rec?.assists || 0)
      }
    }
  }
  return out
}

/* ======== 컴포넌트 ======== */
export default function StatsInput({ players = [], matches = [], onUpdateMatch, isAdmin }) {
  // 1) 최신순 정렬: dateISO(→date→created_at) 내림차순
  const sortedMatches = useMemo(() => {
    const arr = Array.isArray(matches) ? [...matches] : []
    return arr.sort((a, b) => getMatchTime(b) - getMatchTime(a))
  }, [matches])

  // 2) 항상 "가장 최근"을 기본 선택
  const [editingMatchId, setEditingMatchId] = useState('')
  useEffect(() => {
    const latestId = toStr(sortedMatches?.[0]?.id || '')
    setEditingMatchId(latestId)
  }, [sortedMatches])

  const editingMatch = useMemo(
    () => (sortedMatches || []).find(m => toStr(m.id) === toStr(editingMatchId)) || null,
    [sortedMatches, editingMatchId]
  )

  // 3) 패널 드래프트
  const [draft, setDraft] = useState({})
  useEffect(() => {
    if (!editingMatch) { setDraft({}); return }
    const src = extractStatsByPlayer(editingMatch)
    const next = {}
    const ids = new Set(extractAttendeeIds(editingMatch))
    for (const p of players) {
      if (!ids.has(toStr(p.id))) continue
      const rec = src?.[toStr(p.id)] || {}
      next[p.id] = { goals: Number(rec.goals || 0), assists: Number(rec.assists || 0) }
    }
    setDraft(next)
  }, [editingMatch, players])

  const setVal = (pid, key, v) =>
    setDraft(prev => ({ ...prev, [pid]: { ...prev[pid], [key]: Math.max(0, v || 0) } }))

  const [q, setQ] = useState('')
  const [teamIdx, setTeamIdx] = useState('all')
  const [panelIds, setPanelIds] = useState([])
  const [showSaved, setShowSaved] = useState(false)

  const teams = useMemo(() => {
    if (!editingMatch) return []
    const hydrated = hydrateMatch(editingMatch, players)
    return hydrated.teams || []
  }, [editingMatch, players])

  const roster = useMemo(() => {
    if (!editingMatch) return []
    const ids = new Set(extractAttendeeIds(editingMatch))
    let pool = players.filter(p => ids.has(toStr(p.id)))
    if (teamIdx !== 'all' && teams[teamIdx]) {
      const tset = new Set((teams[teamIdx] || []).map(p => toStr(p.id)))
      pool = pool.filter(p => tset.has(toStr(p.id)))
    }
    const needle = q.trim().toLowerCase()
    if (needle) pool = pool.filter(p => (p.name||'').toLowerCase().includes(needle))
    return pool.sort((a,b)=>a.name.localeCompare(b.name))
  }, [players, editingMatch, teams, teamIdx, q])

  const save = () => {
    if (!editingMatch) return
    onUpdateMatch?.(editingMatch.id, { stats: draft })
    setShowSaved(true); setTimeout(()=>setShowSaved(false), 1200)
  }

  if (!isAdmin) {
    return (
      <Card title="기록 입력">
        <div className="text-sm text-stone-600">접근 권한이 없습니다.</div>
      </Card>
    )
  }

  return (
    <div className="grid gap-6">
      <Card title="경기별 골/어시 기록 입력">
        {sortedMatches.length === 0 ? (
          <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {/* 옵션 재구성 시 리마운트 → 시각적으로도 최신이 기본 표시 */}
                <select
                  key={sortedMatches.map(m=>toStr(m.id)).join('|')}
                  value={toStr(editingMatchId)}
                  onChange={(e)=>{
                    setPanelIds([])
                    setQ('')
                    setTeamIdx('all')
                    setEditingMatchId(toStr(e.target.value))
                  }}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {sortedMatches.map(m => {
                    const count = extractAttendeeIds(m).length
                    const label =
                      (typeof formatMatchLabel === 'function'
                        ? formatMatchLabel(m, { withDate: true, withCount: true, count })
                        : (m.label || m.title || m.name || `Match ${toStr(m.id)}`))
                    return (
                      <option key={toStr(m.id)} value={toStr(m.id)}>{label}</option>
                    )
                  })}
                </select>

                <Pill active={teamIdx==='all'} onClick={()=>setTeamIdx('all')}>전체팀</Pill>
                {teams.map((_,i)=>(<Pill key={i} active={teamIdx===i} onClick={()=>setTeamIdx(i)}>팀 {i+1}</Pill>))}
              </div>

              <input
                value={q}
                onChange={e=>setQ(e.target.value)}
                placeholder="선수 검색 (이름)"
                className="w-full md:w-64 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="mb-2">
              <ul className="max-h-56 overflow-auto rounded border border-gray-200 bg-white">
                {roster.map(p => (
                  <li key={toStr(p.id)} className="flex items-center justify-between px-3 py-2 hover:bg-stone-50">
                    <div className="flex items-center gap-2">
                      <InitialAvatar id={p.id} name={p.name} size={20} />
                      <span className="text-sm">{p.name}</span>
                      <span className="text-xs text-gray-500">{p.position||p.pos||'-'}</span>
                    </div>
                    <button
                      onClick={()=>setPanelIds(prev => prev.includes(p.id)? prev : [...prev, p.id])}
                      className="rounded bg-stone-900 px-2 py-1 text-xs text-white"
                    >
                      패널에 추가
                    </button>
                  </li>
                ))}
                {roster.length===0 && (
                  <li className="px-3 py-3 text-sm text-gray-500">일치하는 선수가 없습니다.</li>
                )}
              </ul>
            </div>

            <EditorPanel
              players={players}
              panelIds={panelIds}
              setPanelIds={setPanelIds}
              draft={draft}
              setVal={setVal}
              onSave={save}
            />

            {showSaved && <div className="mt-2 text-right text-xs text-emerald-700">✅ 저장되었습니다</div>}
          </>
        )}
      </Card>
    </div>
  )
}

function EditorPanel({ players, panelIds, setPanelIds, draft, setVal, onSave }){
  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <div className="font-semibold">편집 패널 · {panelIds.length}명</div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setPanelIds([])} className="rounded border px-2 py-1">모두 제거</button>
          <button onClick={onSave} className="rounded bg-emerald-600 px-3 py-1 text-white">저장</button>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {panelIds.map(pid => {
          const p = players.find(pp => toStr(pp.id)===toStr(pid))
          const rec = draft[pid] || { goals:0, assists:0 }
          if (!p) return null
          return (
            <li key={toStr(pid)} className="flex items-center gap-3 px-3 py-2">
              <InitialAvatar id={p.id} name={p.name} size={22} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {p.name} <span className="ml-1 text-xs text-gray-500">{p.position||p.pos||'-'}</span>
                </div>
              </div>

              <MiniCounter
                label="G"
                value={rec.goals}
                onDec={()=>setVal(p.id,'goals',Math.max(0,(rec.goals||0)-1))}
                onInc={()=>setVal(p.id,'goals',(rec.goals||0)+1)}
              />
              <MiniCounter
                label="A"
                value={rec.assists}
                onDec={()=>setVal(p.id,'assists',Math.max(0,(rec.assists||0)-1))}
                onInc={()=>setVal(p.id,'assists',(rec.assists||0)+1)}
              />

              <button onClick={()=>setPanelIds(prev=>prev.filter(id=>id!==pid))}
                      className="ml-1 rounded border px-2 py-1 text-xs">
                제거
              </button>
            </li>
          )
        })}
        {panelIds.length===0 && (
          <li className="px-3 py-6 text-center text-sm text-gray-500">
            아직 선택된 선수가 없습니다. 위에서 검색 후 "패널에 추가"를 눌러주세요.
          </li>
        )}
      </ul>
    </div>
  )
}

function Pill({ children, active, onClick }){
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${active? 'border-stone-900 bg-stone-900 text-white':'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}>
      {children}
    </button>
  )
}

function MiniCounter({ label, value, onDec, onInc }){
  return (
    <div className="flex items-center gap-1">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-800 text-[10px] font-bold text-white">{label}</span>
      <button onClick={onDec} aria-label={`${label} 감소`}>-</button>
      <span style={{ width: 24, textAlign: 'center' }} className="tabular-nums">{value}</span>
      <button onClick={onInc} aria-label={`${label} 증가`}>+</button>
    </div>
  )
}
