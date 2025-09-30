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

  // If src is an object mapping playerId -> { goals, assists } or -> { events: [...] }
  if (!Array.isArray(src) && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const pid = toStr(k)
      if (!pid) continue
      // normalize: v may be number counts or object
      const goals = Number(v?.goals || v?.G || 0)
      const assists = Number(v?.assists || v?.A || 0)
      const events = Array.isArray(v?.events) ? (v.events.map(e=>({ type: e.type || e.event || (e?.isAssist? 'assist':'goal'), date: e.dateISO || e.date || e.ts || e.time || e?.dateISO }))).filter(Boolean) : []
      out[pid] = { goals, assists, events }
    }
    return out
  }

  // If src is an array of event records: { playerId, type/goal/assist, date }
  if (Array.isArray(src)) {
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid ?? rec?.player)
      if (!pid) continue
      const type = (rec?.type || (rec?.goal ? 'goals' : rec?.assist ? 'assists' : null) || (rec?.action) || '').toString().toLowerCase()
      const isGoal = /goal/i.test(type)
      const isAssist = /assist/i.test(type)
      const date = rec?.dateISO || rec?.date || rec?.time || rec?.ts || null
      out[pid] = out[pid] || { goals: 0, assists: 0, events: [] }
      if (isGoal) {
        out[pid].goals = (out[pid].goals || 0) + Number(rec?.goals || 1)
        out[pid].events.push({ type: 'goal', date: date || null })
      } else if (isAssist) {
        out[pid].assists = (out[pid].assists || 0) + Number(rec?.assists || 1)
        out[pid].events.push({ type: 'assist', date: date || null })
      } else {
        // fallback: if record has numeric goals/assists properties
        const g = Number(rec?.goals || 0), a = Number(rec?.assists || 0)
        if (g) {
          out[pid].goals = (out[pid].goals || 0) + g
          for (let i = 0; i < g; i++) out[pid].events.push({ type: 'goal', date: date || null })
        }
        if (a) {
          out[pid].assists = (out[pid].assists || 0) + a
          for (let i = 0; i < a; i++) out[pid].events.push({ type: 'assist', date: date || null })
        }
      }
    }
    return out
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
      next[p.id] = { goals: Number(rec.goals || 0), assists: Number(rec.assists || 0), events: Array.isArray(rec.events)? rec.events.slice() : [] }
    }
    setDraft(next)
  }, [editingMatch, players])

  const setVal = (pid, key, v) =>
    setDraft(prev => {
      const now = new Date().toISOString()
      const prevRec = prev?.[pid] || { goals: 0, assists: 0, events: [] }
      const prevVal = Number(prevRec[key] || 0)
      const nextVal = Math.max(0, Number(v || 0))
      const diff = nextVal - prevVal
      const next = { ...(prev || {}) }
      const rec = { goals: prevRec.goals || 0, assists: prevRec.assists || 0, events: Array.isArray(prevRec.events)? prevRec.events.slice() : [] }
      if (diff > 0) {
        // add timestamped events for increments
        for (let i=0;i<diff;i++) rec.events.push({ type: key === 'goals' ? 'goal' : 'assist', date: now })
      } else if (diff < 0) {
        // remove latest events of this type when decrementing
        let toRemove = -diff
        for (let i = rec.events.length - 1; i >= 0 && toRemove > 0; i--) {
          if (rec.events[i].type === (key === 'goals' ? 'goal' : 'assist')) {
            rec.events.splice(i, 1); toRemove--
          }
        }
      }
      rec[key] = nextVal
      next[pid] = rec
      return next
    })

  // Bulk paste states: raw text and status message
  const [bulkText, setBulkText] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')

  const [q, setQ] = useState('')
  const [teamIdx, setTeamIdx] = useState('all')
  const [panelIds, setPanelIds] = useState([])
  const [showSaved, setShowSaved] = useState(false)

  // Helpers: parse date string like "10/04/2025 9:15AM" (tries D/M/Y or M/D/Y based on heuristics)
  function parseLooseDate(s) {
    if (!s) return null
    const t = s.trim()
    // Try ISO directly
    const iso = Date.parse(t)
    if (!Number.isNaN(iso)) return new Date(iso)

    // Split date and time
    const parts = t.split(/\s+/)
    const datePart = parts[0]
    const timePart = parts.slice(1).join(' ') || ''
    const dateSep = datePart.includes('/') ? '/' : datePart.includes('-') ? '-' : null
    const datePieces = dateSep ? datePart.split(dateSep) : [datePart]
    if (datePieces.length !== 3) return null
    let a = Number(datePieces[0]), b = Number(datePieces[1]), y = Number(datePieces[2])
    if (y < 100) y += 2000
    // Heuristic: if first piece > 12, treat as day-first (DD/MM/YYYY)
    let day, month
    if (a > 12) { day = a; month = b } else { month = a; day = b }

    // parse time like 9:15AM or 21:05
    let hour = 0, minute = 0
    const tm = timePart.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/)
    if (tm) {
      hour = Number(tm[1])
      minute = Number(tm[2] || 0)
      const ampm = tm[3]
      if (ampm) {
        const up = ampm.toUpperCase()
        if (up === 'PM' && hour < 12) hour += 12
        if (up === 'AM' && hour === 12) hour = 0
      }
    }

    try {
      return new Date(y, Math.max(0, month - 1), Math.max(1, day), hour, minute, 0, 0)
    } catch (e) {
      return null
    }
  }

  function weekKeyOfDate(d) {
    if (!d) return null
    // use Monday-start week key: YYYY-Wnn
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = (date.getDay() + 6) % 7 // Mon=0..Sun=6
    const monday = new Date(date)
    monday.setDate(date.getDate() - day)
    // normalize to yyyy-mm-dd
    const y = monday.getFullYear()
    const m = String(monday.getMonth() + 1).padStart(2, '0')
    const dd = String(monday.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  function dayKeyOfDate(d) {
    if (!d) return null
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  // Parse bulk text lines into { date:Date, type:'goal'|'assist', name }
  // Strict format checker: [date]goal[name] or [date]assist[name]
  function isStrictLine(line) {
    if (!line) return false
    return /^\s*\[[^\]]+\]\s*(?:goal|assist)\s*\[[^\]]+\]\s*$/i.test(line)
  }
  function parseBulkLines(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const out = []
    for (const line of lines) {
      // Enforce strict format: require explicit 'goal' or 'assist' between brackets
      if (!isStrictLine(line)) return []
      const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g)).map(m => m[1])
      const dateStr = bracketMatches[0]
      const name = bracketMatches[bracketMatches.length - 1]
      // extract the literal word between the first and last bracket group
      const betweenMatch = line.replace(/\[([^\]]+)\]/g, '¤').split('¤')[1] || ''
      let type = null
      if (/\bgoal\b/i.test(betweenMatch)) type = 'goals'
      else if (/\bassist\b/i.test(betweenMatch)) type = 'assists'
      const dt = parseLooseDate(dateStr)
      if (!dt || !type || !name) return []
      out.push({ date: dt, type, name: String(name).trim() })
    }
    return out
  }

  // Apply bulk text to draft. Do NOT auto-save. Require all lines to belong to same week and a saved match must exist for that week.
  async function applyBulkToDraft() {
    setBulkMsg('')
    if (!bulkText.trim()) { setBulkMsg('붙여넣을 데이터가 비어 있습니다.'); return }
    // Quick strict validation: every non-empty line must match the required pattern
    const rawLines = String(bulkText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const bad = rawLines.filter(l => !isStrictLine(l))
    if (bad.length > 0) {
      setBulkMsg('모든 줄이 [date]goal[name] 또는 [date]assist[name] 형식이어야 합니다. 오류 예시: ' + (bad.slice(0,3).join('; ')))
      return
    }
    const parsed = parseBulkLines(bulkText)
    if (parsed.length === 0) { setBulkMsg('파싱된 항목이 없습니다. 형식을 확인해 주세요.'); return }

    // group by week key
    const weekKeys = Array.from(new Set(parsed.map(p => weekKeyOfDate(p.date))))
    if (weekKeys.length !== 1) { setBulkMsg('여러 주의 데이터가 포함되어 있습니다. 한 번에 하나의 주만 처리하세요.'); return }
    const wk = weekKeys[0]

    // find saved match that falls into same week
    const matchForWeek = sortedMatches.find(m => {
      const mt = getMatchTime(m)
      if (!mt) return false
      const k = weekKeyOfDate(new Date(mt))
      return k === wk
    })
    if (!matchForWeek) { setBulkMsg('해당 주에 저장된 매치를 찾을 수 없습니다.'); return }

    if (editingMatchId && toStr(editingMatchId) !== toStr(matchForWeek.id)) {
      setBulkMsg('현재 선택된 매치와 붙여넣은 데이터의 날짜(주)가 일치하지 않습니다. 먼저 해당 주의 매치를 선택하거나, 선택을 비운 후 다시 시도하세요.')
      return
    }

    if (!editingMatchId) setEditingMatchId(toStr(matchForWeek.id))

    // determine selected match full-day key (YYYY-MM-DD)
    const selectedMatchObj = (editingMatch && toStr(editingMatch.id) === toStr(editingMatchId)) ? editingMatch : matchForWeek
    const selectedDateKey = dayKeyOfDate(new Date(getMatchTime(selectedMatchObj)))

    // If a match is explicitly selected, abort the operation when any parsed line's day differs
    // from the selected match's day. This prevents partial application.
    if (editingMatchId) {
      const mismatched = parsed.filter(item => dayKeyOfDate(item.date) !== selectedDateKey)
      if (mismatched.length > 0) {
        const names = Array.from(new Set(mismatched.map(x => x.name))).slice(0, 10)
        setBulkMsg(`선택된 매치 날짜와 일치하지 않는 항목이 있습니다: ${names.join(', ')}. 모든 항목의 날짜가 선택된 매치와 동일해야 합니다.`)
        return
      }
    }

    // build name->player map
    const nameMap = new Map(players.map(p => [String((p.name||'').trim()).toLowerCase(), p]))

    // accumulate deltas from parsed lines (all lines match the selected date at this point)
    // store counts and events
    const deltas = new Map() // pid -> {goals,assists, events: [{type,date}]}
    const unmatched = []
    for (const item of parsed) {
      const key = String((item.name || '').trim()).toLowerCase()
      const player = nameMap.get(key)
      if (!player) { unmatched.push(item.name); continue }
      const pid = player.id
      const cur = deltas.get(pid) || { goals: 0, assists: 0, events: [] }
      if (item.type === 'goals' || item.type === 'goal') { cur.goals = (cur.goals || 0) + 1; cur.events.push({ type: 'goal', date: item.date.toISOString() }) }
      else if (item.type === 'assists' || item.type === 'assist') { cur.assists = (cur.assists || 0) + 1; cur.events.push({ type: 'assist', date: item.date.toISOString() }) }
      deltas.set(pid, cur)
    }

    // If any parsed name does not match a known player, abort the whole bulk apply.
    if (unmatched.length > 0) {
      setBulkMsg('일치하지 않는 선수명이 있습니다: ' + Array.from(new Set(unmatched)).slice(0,10).join(', '))
      return
    }

    if (deltas.size === 0) {
      setBulkMsg('일치하는 선수가 없습니다.')
      return
    }

    // apply deltas to current draft (for the matched match)
    setDraft(prev => {
      const next = { ...(prev || {}) }
      for (const [pid, delta] of deltas.entries()) {
        const now = next[pid] || { goals: 0, assists: 0, events: [] }
        const events = Array.isArray(now.events) ? now.events.slice() : []
        // append parsed events
        for (const e of (delta.events || [])) events.push({ type: e.type, date: e.date })
        next[pid] = { goals: (now.goals || 0) + (delta.goals || 0), assists: (now.assists || 0) + (delta.assists || 0), events }
      }
      return next
    })

    // 자동으로 편집 패널(panelIds)에 반영 (저장하지 않음)
    setPanelIds(prev => {
      const nextSet = new Set(Array.isArray(prev) ? prev.map(String) : [])
      for (const pid of deltas.keys()) nextSet.add(String(pid))
      return Array.from(nextSet)
    })

    let parts = [`초안에 적용되었습니다: ${deltas.size}명 업데이트`]
    if (unmatched.length) parts.push(`이름 불일치: ${unmatched.slice(0,5).join(', ')}`)
    setBulkMsg(parts.join(' · '))
  }

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
            <div className="mb-3 w-full">
              <div className="w-full grid gap-3 md:grid-cols-2 md:items-start">
                {/* Left: match selector, pills, search */}
                <div className="space-y-2">
                  <select
                    key={sortedMatches.map(m=>toStr(m.id)).join('|')}
                    value={toStr(editingMatchId)}
                    onChange={(e)=>{
                      setPanelIds([])
                      setQ('')
                      setTeamIdx('all')
                      setEditingMatchId(toStr(e.target.value))
                    }}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
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

                  <div className="flex flex-wrap items-center gap-2">
                    <Pill active={teamIdx==='all'} onClick={()=>setTeamIdx('all')}>전체팀</Pill>
                    {teams.map((_,i)=>(<Pill key={i} active={teamIdx===i} onClick={()=>setTeamIdx(i)}>팀 {i+1}</Pill>))}
                  </div>

                  <input
                    value={q}
                    onChange={e=>setQ(e.target.value)}
                    placeholder="선수 검색 (이름)"
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                {/* Right: bulk textarea and actions */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 block">Bulk 입력 (예: [10/04/2025 9:15AM]goal[홍길동] or [10/04/2025 9:15AM]assist[홍길동])</label>
                  <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder="각 줄마다 날짜·goal·이름 또는 날짜·assist·이름을 대괄호로 감싸 입력하세요." className="w-full h-28 md:h-36 rounded border border-gray-300 bg-white px-3 py-2 text-sm resize-vertical" />
                  <div className="flex items-center gap-2">
                    <button onClick={applyBulkToDraft} className="rounded bg-amber-500 px-3 py-1 text-xs text-white">파싱하여 초안에 적용</button>
                    <button onClick={()=>{setBulkText(''); setBulkMsg('')}} className="rounded border px-2 py-1 text-xs">지우기</button>
                    {bulkMsg && <div className="text-xs text-gray-600 ml-2 break-words">{bulkMsg}</div>}
                  </div>
                </div>
              </div>
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
                      onClick={()=>{
                        // When adding to panel, reset this player's draft stats to zero (per user request)
                        setDraft(prev=>({ ...(prev||{}), [p.id]: { goals: 0, assists: 0, events: [] } }))
                        setPanelIds(prev => prev.includes(p.id)? prev : [...prev, p.id])
                      }}
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
              setDraft={setDraft}
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

function EditorPanel({ players, panelIds, setPanelIds, draft, setDraft, setVal, onSave }){
  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <div className="font-semibold">편집 패널 · {panelIds.length}명</div>
        <div className="flex items-center gap-2">
          <button onClick={()=>{
            // Reset goals/assists for players currently in the panel, then clear the panel.
            setDraft(prev=>{
              const next = { ...prev }
              for (const pid of panelIds) {
                next[pid] = { goals: 0, assists: 0, events: [] }
              }
              return next
            })
            setPanelIds([])
          }} className="rounded border px-2 py-1">모두 제거</button>
          <button onClick={onSave} className="rounded bg-emerald-600 px-3 py-1 text-white">저장</button>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {panelIds.map(pid => {
          const p = players.find(pp => toStr(pp.id)===toStr(pid))
          const rec = draft[pid] || { goals:0, assists:0, events:[] }
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

              <button onClick={()=>{
                  // Reset this player's draft stats to zero when removed from panel
                  setDraft(prev=>{
                    const next = { ...(prev||{}) }
                    next[pid] = { goals: 0, assists: 0, events: [] }
                    return next
                  })
                  setPanelIds(prev=>prev.filter(id=>id!==pid))
                }}
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
