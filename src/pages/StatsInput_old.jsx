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
      // normalize key to string to avoid mismatches with panelIds which are strings
      next[toStr(p.id)] = { goals: Number(rec.goals || 0), assists: Number(rec.assists || 0), events: Array.isArray(rec.events)? rec.events.slice() : [] }
    }
    setDraft(next)
  }, [editingMatch, players])

  const setVal = (pid, key, v) =>
    setDraft(prev => {
      const k = toStr(pid)
      const now = new Date().toISOString()
      const prevRec = prev?.[k] || { goals: 0, assists: 0, events: [] }
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
      next[k] = rec
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
  // Strict format checker: [date]goal[name] or [date]assist[name] or [date]goal:assist[scorer assister]
  function isStrictLine(line) {
    if (!line) return false
    return /^\s*\[[^\]]+\]\s*(?:goal|assist|goal\s*:\s*assist)\s*\[[^\]]+\]\s*$/i.test(line)
  }
  function parseBulkLines(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const out = []
    for (const line of lines) {
      if (!isStrictLine(line)) return []
      const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g)).map(m => m[1])
      const dateStr = bracketMatches[0]
      const namesField = bracketMatches[bracketMatches.length - 1]
      const betweenMatch = line.replace(/\[([^\]]+)\]/g, '¤').split('¤')[1] || ''
      const hasBoth = /goal\s*:\s*assist/i.test(betweenMatch)
      let type = null
      const dt = parseLooseDate(dateStr)
      if (!dt) return []
      if (hasBoth) {
        // Smart split: try to match two player names from the roster
        const nameList = rosterNamesForBulkMatch()
        const raw = String(namesField || '').trim()
        const tokens = raw.split(/\s+/).filter(Boolean)
        
        let found = null, foundSplits = []
        
        // 먼저 전체 텍스트가 한 명의 선수 이름인지 확인 (어시스트 없는 골)
        if (nameList.has(raw)) {
          out.push({ date: dt, type: 'goals', name: raw })
          continue
        }
        
        // Try all possible splits (두 명의 선수 이름으로 분리)
        for (let i = 1; i < tokens.length; ++i) {
          const left = tokens.slice(0, i).join(' ')
          const right = tokens.slice(i).join(' ')
          if (nameList.has(left) && nameList.has(right)) {
            foundSplits.push([left, right])
          }
        }
        if (foundSplits.length === 1) {
          found = foundSplits[0]
        } else if (foundSplits.length > 1) {
          // ambiguous, handled in applyBulkToDraft
          found = { ambiguous: true, splits: foundSplits }
        }
        if (found && !found.ambiguous) {
          out.push({ date: dt, type: 'goals', name: found[0] })
          out.push({ date: dt, type: 'assists', name: found[1] })
        } else if (found && found.ambiguous) {
          out.push({ date: dt, type: 'ambiguous', splits: found.splits, raw })
        } else {
          // No valid split found - treat as error
          out.push({ date: dt, type: 'ambiguous', splits: [], raw })
        }
      } else {
        if (!type) {
          if (/\bgoal\b/i.test(betweenMatch)) type = 'goals'
          else if (/\bassist\b/i.test(betweenMatch)) type = 'assists'
        }
        if (!type || !namesField) return []
        out.push({ date: dt, type, name: String(namesField).trim() })
      }
    }
    return out
  // Helper: get all player names in lowercased set for matching
  function rosterNamesForBulkMatch() {
    // Use the current roster (from the memoized roster)
    if (Array.isArray(roster) && roster.length > 0) {
      return new Set(roster.map(p => String((p.name || '').trim())))
    }
    // fallback: empty set
    return new Set()
  }
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

    // Check for ambiguous splits
    const ambiguous = parsed.filter(p => p.type === 'ambiguous')
    if (ambiguous.length > 0) {
      setBulkMsg('이름 구분이 모호한 줄이 있습니다: ' + ambiguous.map(a => `[${a.raw}]`).join(', ') + ' · 선수명 조합이 2가지 이상이거나, 둘 다 없는 경우입니다. 각 이름을 명확히 입력해 주세요.');
      return
    }

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
        const k = toStr(pid)
        const now = next[k] || { goals: 0, assists: 0, events: [] }
        const events = Array.isArray(now.events) ? now.events.slice() : []
        
        // 중복 이벤트 체크를 위한 Set (type + date 조합)
        const existingEventKeys = new Set(
          events.map(e => `${e.type}:${e.date}`)
        )
        
        // append parsed events (중복 제거)
        for (const e of (delta.events || [])) {
          const eventKey = `${e.type}:${e.date}`
          if (!existingEventKeys.has(eventKey)) {
            events.push({ type: e.type, date: e.date })
            existingEventKeys.add(eventKey)
          }
        }
        
        // 이벤트 기반으로 골/어시스트 재계산
        const goalCount = events.filter(e => e.type === 'goal').length
        const assistCount = events.filter(e => e.type === 'assist').length
        
        next[k] = { goals: goalCount, assists: assistCount, events }
      }
      return next
    })

    // 자동으로 편집 패널(panelIds)에 반영 (저장하지 않음)
    setPanelIds(prev => {
      const nextSet = new Set(Array.isArray(prev) ? prev.map(String) : [])
      for (const pid of deltas.keys()) nextSet.add(toStr(pid))
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
    
    // Filter out players already in the panel
    const panelSet = new Set(panelIds.map(toStr))
    pool = pool.filter(p => !panelSet.has(toStr(p.id)))
    
    return pool.sort((a,b)=>a.name.localeCompare(b.name))
  }, [players, editingMatch, teams, teamIdx, q, panelIds])

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
            {/* Match Selector */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">📅 경기 선택</label>
              <select
                key={sortedMatches.map(m=>toStr(m.id)).join('|')}
                value={toStr(editingMatchId)}
                onChange={(e)=>{
                  setPanelIds([])
                  setQ('')
                  setTeamIdx('all')
                  setEditingMatchId(toStr(e.target.value))
                }}
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
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
            </div>

            {/* Bulk Input Section */}
            <div className="mb-4 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border-2 border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📋</span>
                <label className="text-sm font-bold text-gray-800">Bulk 입력 (빠른 입력)</label>
              </div>
              <textarea 
                value={bulkText} 
                onChange={e=>setBulkText(e.target.value)} 
                placeholder="예시:
[11/08/2025 9:07AM]goal:assist[김현우 권오정]
[11/08/2025 9:16AM]goal:assist[Alex Kim 조상래]
[11/08/2025 8:05AM]assist[조상래]"
                className="w-full h-32 rounded-lg border-2 border-amber-300 bg-white px-3 py-2 text-sm resize-vertical font-mono focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all" 
              />
              <div className="flex items-center gap-2 mt-2">
                <button 
                  onClick={applyBulkToDraft} 
                  className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all"
                >
                  ✨ 적용하기
                </button>
                <button 
                  onClick={()=>{setBulkText(''); setBulkMsg('')}} 
                  className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 text-sm font-medium transition-colors"
                >
                  지우기
                </button>
                {bulkMsg && <div className="text-xs text-gray-700 ml-2 break-words flex-1">{bulkMsg}</div>}
              </div>
              <div className="mt-2 text-xs text-gray-600 bg-white/60 rounded px-2 py-1">
                💡 <strong>[날짜]goal:assist[득점자 도움자]</strong> 형식으로 입력하면 듀오가 자동 연결됩니다
              </div>
            </div>

            {/* Quick Stats Editor */}
            <QuickStatsEditor
              players={players}
              editingMatch={editingMatch}
              teams={teams}
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              showSaved={showSaved}
            />
          </>
        )}
      </Card>
    </div>
  )
}

/* ======== Quick Stats Editor Component ======== */
function QuickStatsEditor({ players, editingMatch, teams, draft, setDraft, onSave, showSaved }) {
  const [showLinkPanel, setShowLinkPanel] = useState(false)
  
  if (!editingMatch) return null
  
  const attendeeIds = new Set(extractAttendeeIds(editingMatch))
  const attendees = players.filter(p => attendeeIds.has(toStr(p.id)))
  
  // Group by team
  const teamRosters = teams.map((team, idx) => ({
    idx,
    name: `팀 ${idx + 1}`,
    players: team.filter(p => attendeeIds.has(toStr(p.id)))
  }))
  
  const addGoal = (playerId) => {
    const now = new Date().toISOString()
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const k = toStr(playerId)
      const rec = next[k] || { goals: 0, assists: 0, events: [] }
      rec.goals = (rec.goals || 0) + 1
      rec.events.push({ type: 'goal', date: now })
      next[k] = rec
      return next
    })
  }
  
  const addAssist = (playerId) => {
    const now = new Date().toISOString()
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const k = toStr(playerId)
      const rec = next[k] || { goals: 0, assists: 0, events: [] }
      rec.assists = (rec.assists || 0) + 1
      rec.events.push({ type: 'assist', date: now })
      next[k] = rec
      return next
    })
  }
  
  const removeGoal = (playerId) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const k = toStr(playerId)
      const rec = next[k]
      if (!rec) return next
      
      // Find and remove the last goal event
      for (let i = rec.events.length - 1; i >= 0; i--) {
        if (rec.events[i].type === 'goal') {
          rec.events.splice(i, 1)
          rec.goals = Math.max(0, (rec.goals || 0) - 1)
          break
        }
      }
      next[k] = rec
      return next
    })
  }
  
  const removeAssist = (playerId) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const k = toStr(playerId)
      const rec = next[k]
      if (!rec) return next
      
      // Find and remove the last assist event
      for (let i = rec.events.length - 1; i >= 0; i--) {
        if (rec.events[i].type === 'assist') {
          rec.events.splice(i, 1)
          rec.assists = Math.max(0, (rec.assists || 0) - 1)
          break
        }
      }
      next[k] = rec
      return next
    })
  }
  
  return (
    <div className="space-y-4">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-gray-800">⚽ 수동 입력</div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowLinkPanel(!showLinkPanel)}
            className="rounded-lg border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700 transition-all"
          >
            {showLinkPanel ? '🔗 연결 닫기' : '🔗 골-어시 연결 관리'}
          </button>
          <button 
            onClick={onSave}
            className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 px-5 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all"
          >
            💾 저장하기
          </button>
        </div>
      </div>
      
      {showSaved && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg px-4 py-2 text-sm text-green-800 font-medium">
          ✅ 저장되었습니다
        </div>
      )}
      
      {/* Link Management Panel */}
      {showLinkPanel && (
        <GoalAssistLinkingPanel players={players} draft={draft} setDraft={setDraft} />
      )}
      
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {teamRosters.map(team => (
          <div key={team.idx} className="bg-white rounded-lg border-2 border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-white font-bold text-sm">
              {team.name}
            </div>
            <div className="divide-y divide-gray-100">
              {team.players.map(p => {
                const rec = draft[toStr(p.id)] || { goals: 0, assists: 0 }
                const hasStats = (rec.goals > 0 || rec.assists > 0)
                
                return (
                  <div key={toStr(p.id)} className={`px-3 py-3 transition-colors ${hasStats ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-3">
                      {/* Player Info */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <InitialAvatar 
                          id={p.id} 
                          name={p.name} 
                          size={32} 
                          badges={(() => { 
                            const s=toStr(p.membership).toLowerCase(); 
                            return (s==='member'||s.includes('정회원'))?[]:['G'] 
                          })()} 
                          photoUrl={p.photoUrl} 
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-gray-800 truncate">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.position||p.pos||'-'}</div>
                        </div>
                      </div>
                      
                      {/* Goal Counter */}
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                        <button
                          onClick={() => removeGoal(p.id)}
                          disabled={!rec.goals || rec.goals <= 0}
                          className="w-7 h-7 rounded bg-white border border-gray-300 hover:border-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 flex items-center justify-center text-gray-600 hover:text-red-600 font-bold text-sm transition-all"
                        >
                          −
                        </button>
                        <div className="flex items-center gap-1 px-1.5">
                          <span className="text-xs font-bold text-gray-600">⚽</span>
                          <span className="w-6 text-center font-bold text-sm tabular-nums">{rec.goals || 0}</span>
                        </div>
                        <button
                          onClick={() => addGoal(p.id)}
                          className="w-7 h-7 rounded bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 flex items-center justify-center text-white font-bold text-sm transition-all shadow-sm"
                        >
                          +
                        </button>
                      </div>
                      
                      {/* Assist Counter */}
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                        <button
                          onClick={() => removeAssist(p.id)}
                          disabled={!rec.assists || rec.assists <= 0}
                          className="w-7 h-7 rounded bg-white border border-gray-300 hover:border-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 flex items-center justify-center text-gray-600 hover:text-red-600 font-bold text-sm transition-all"
                        >
                          −
                        </button>
                        <div className="flex items-center gap-1 px-1.5">
                          <span className="text-xs font-bold text-gray-600">👉</span>
                          <span className="w-6 text-center font-bold text-sm tabular-nums">{rec.assists || 0}</span>
                        </div>
                        <button
                          onClick={() => addAssist(p.id)}
                          className="w-7 h-7 rounded bg-amber-500 hover:bg-amber-600 border border-amber-600 flex items-center justify-center text-white font-bold text-sm transition-all shadow-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        
        {teamRosters.length === 0 && (
          <div className="col-span-2 text-center py-8 text-gray-500 text-sm">
            팀 정보가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}

function GoalAssistLinkingPanel({ players, draft, setDraft }) {
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [selectedAssist, setSelectedAssist] = useState(null)

  const allGoals = useMemo(() => {
    const goals = []
    for (const [pid, rec] of Object.entries(draft)) {
      const player = players.find(p => toStr(p.id) === toStr(pid))
      if (!player) continue
      const events = Array.isArray(rec.events) ? rec.events : []
      events.forEach((evt, idx) => {
        if (evt.type === 'goal') {
          goals.push({
            playerId: pid,
            playerName: player.name,
            eventIdx: idx,
            date: evt.date,
            assistedBy: evt.assistedBy || null,
            uniqueKey: `${pid}-${idx}`
          })
        }
      })
    }
    return goals.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [draft, players])

  const allAssists = useMemo(() => {
    const assists = []
    for (const [pid, rec] of Object.entries(draft)) {
      const player = players.find(p => toStr(p.id) === toStr(pid))
      if (!player) continue
      const events = Array.isArray(rec.events) ? rec.events : []
      events.forEach((evt, idx) => {
        if (evt.type === 'assist') {
          assists.push({
            playerId: pid,
            playerName: player.name,
            eventIdx: idx,
            date: evt.date,
            linkedToGoal: evt.linkedToGoal || null,
            uniqueKey: `${pid}-${idx}`
          })
        }
      })
    }
    return assists.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [draft, players])

  const linkGoalToAssist = () => {
    if (!selectedGoal || !selectedAssist) return

    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      
      const goalRec = next[selectedGoal.playerId]
      if (goalRec && goalRec.events && goalRec.events[selectedGoal.eventIdx]) {
        goalRec.events[selectedGoal.eventIdx].assistedBy = selectedAssist.playerId
        goalRec.events[selectedGoal.eventIdx].assistedByIdx = selectedAssist.eventIdx
      }
      
      const assistRec = next[selectedAssist.playerId]
      if (assistRec && assistRec.events && assistRec.events[selectedAssist.eventIdx]) {
        assistRec.events[selectedAssist.eventIdx].linkedToGoal = selectedGoal.playerId
        assistRec.events[selectedAssist.eventIdx].linkedToGoalIdx = selectedGoal.eventIdx
      }
      
      return next
    })
    
    setSelectedGoal(null)
    setSelectedAssist(null)
  }

  const unlinkGoal = (goal) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      
      const goalRec = next[goal.playerId]
      if (goalRec && goalRec.events && goalRec.events[goal.eventIdx]) {
        const assistPlayerId = goalRec.events[goal.eventIdx].assistedBy
        const assistIdx = goalRec.events[goal.eventIdx].assistedByIdx
        
        delete goalRec.events[goal.eventIdx].assistedBy
        delete goalRec.events[goal.eventIdx].assistedByIdx
        
        if (assistPlayerId !== undefined && assistIdx !== undefined) {
          const assistRec = next[assistPlayerId]
          if (assistRec && assistRec.events && assistRec.events[assistIdx]) {
            delete assistRec.events[assistIdx].linkedToGoal
            delete assistRec.events[assistIdx].linkedToGoalIdx
          }
        }
      }
      
      return next
    })
  }

  return (
    <div className="border-b bg-blue-50 px-3 py-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-blue-900">골-어시스트 연결 (듀오 순위표 반영)</div>
        <div className="text-xs text-gray-600">
          {selectedGoal && selectedAssist ? (
            <span className="text-green-700 font-medium">
              {selectedAssist.playerName} → {selectedGoal.playerName} 연결 준비됨
            </span>
          ) : (
            <span>골 1개와 어시스트 1개를 선택하세요</span>
          )}
        </div>
      </div>
      
      <div className="grid gap-3 md:grid-cols-2">
        {/* Goals List */}
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-700">⚽ 골 목록</div>
          <div className="max-h-60 overflow-auto rounded border border-gray-300 bg-white">
            {allGoals.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500">골이 없습니다</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {allGoals.map(goal => {
                  const isSelected = selectedGoal?.uniqueKey === goal.uniqueKey
                  const assistedByPlayer = goal.assistedBy ? players.find(p => toStr(p.id) === toStr(goal.assistedBy)) : null
                  
                  return (
                    <li
                      key={goal.uniqueKey}
                      onClick={() => setSelectedGoal(isSelected ? null : goal)}
                      className={`cursor-pointer px-2 py-2 text-xs transition-colors ${
                        isSelected 
                          ? 'bg-emerald-100 border-l-4 border-emerald-600' 
                          : 'hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800">{goal.playerName}</div>
                          <div className="text-gray-500 text-[10px]">
                            {new Date(goal.date).toLocaleString('ko-KR', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                          {assistedByPlayer && (
                            <div className="mt-1 flex items-center gap-1 text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 w-fit">
                              <span className="text-[10px] font-medium">🔗 {assistedByPlayer.name}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  unlinkGoal(goal)
                                }}
                                className="text-red-600 hover:text-red-800 font-bold"
                                title="연결 해제"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <div className="text-emerald-600 font-bold">✓</div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Assists List */}
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-700">👉 어시스트 목록</div>
          <div className="max-h-60 overflow-auto rounded border border-gray-300 bg-white">
            {allAssists.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500">어시스트가 없습니다</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {allAssists.map(assist => {
                  const isSelected = selectedAssist?.uniqueKey === assist.uniqueKey
                  const linkedToPlayer = assist.linkedToGoal ? players.find(p => toStr(p.id) === toStr(assist.linkedToGoal)) : null
                  
                  return (
                    <li
                      key={assist.uniqueKey}
                      onClick={() => setSelectedAssist(isSelected ? null : assist)}
                      className={`cursor-pointer px-2 py-2 text-xs transition-colors ${
                        isSelected 
                          ? 'bg-amber-100 border-l-4 border-amber-600' 
                          : 'hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800">{assist.playerName}</div>
                          <div className="text-gray-500 text-[10px]">
                            {new Date(assist.date).toLocaleString('ko-KR', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                          {linkedToPlayer && (
                            <div className="mt-1 text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 w-fit">
                              <span className="text-[10px] font-medium">🔗 {linkedToPlayer.name}</span>
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <div className="text-amber-600 font-bold">✓</div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Link Button */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={linkGoalToAssist}
          disabled={!selectedGoal || !selectedAssist}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            selectedGoal && selectedAssist
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md hover:shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          🔗 듀오 연결하기
        </button>
        {(selectedGoal || selectedAssist) && (
          <button
            onClick={() => {
              setSelectedGoal(null)
              setSelectedAssist(null)
            }}
            className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 text-sm font-medium transition-colors"
          >
            선택 취소
          </button>
        )}
      </div>
      
      <div className="mt-2 text-[10px] text-gray-500 bg-white rounded px-2 py-1">
        💡 <strong>Bulk 입력 시 자동 연결:</strong> [날짜]goal:assist[득점자 도움자] 형식은 자동으로 듀오 연결됩니다.
        <br />
        💡 <strong>수동 연결:</strong> 골과 어시스트를 각각 클릭하여 선택 후 "듀오 연결하기" 버튼을 누르세요.
      </div>
    </div>
  )
}

  const markAssistAsOwnGoal = (assist) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const assistRec = next[assist.playerId]
      if (assistRec && assistRec.events && assistRec.events[assist.eventIdx]) {
        // Mark as own-goal assist and clear any existing link
        assistRec.events[assist.eventIdx].ownGoal = true
        delete assistRec.events[assist.eventIdx].linkedToGoal
        delete assistRec.events[assist.eventIdx].linkedToGoalIdx
      }
      return next
    })
  }

  const unmarkOwnGoal = (assist) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const assistRec = next[assist.playerId]
      if (assistRec && assistRec.events && assistRec.events[assist.eventIdx]) {
        delete assistRec.events[assist.eventIdx].ownGoal
      }
      return next
    })
  }

function EditorPanel({ players, panelIds, setPanelIds, draft, setDraft, setVal, onSave }){
  const [showLinkingPanel, setShowLinkingPanel] = useState(false)
  const [addingGoalFor, setAddingGoalFor] = useState(null)
  const [addingAssistFor, setAddingAssistFor] = useState(null)

  const addGoalWithAssist = (scorerId, assisterId) => {
    const now = new Date().toISOString()
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      
      // Add goal event
      const scorerRec = next[toStr(scorerId)] || { goals: 0, assists: 0, events: [] }
      const goalEvent = { type: 'goal', date: now }
      if (assisterId) {
        goalEvent.assistedBy = toStr(assisterId)
      }
      scorerRec.events.push(goalEvent)
      scorerRec.goals = (scorerRec.goals || 0) + 1
      next[toStr(scorerId)] = scorerRec
      
      // Add assist event if assister is selected
      if (assisterId) {
        const assisterRec = next[toStr(assisterId)] || { goals: 0, assists: 0, events: [] }
        const assistEvent = { type: 'assist', date: now, linkedToGoal: toStr(scorerId) }
        assisterRec.events.push(assistEvent)
        assisterRec.assists = (assisterRec.assists || 0) + 1
        next[toStr(assisterId)] = assisterRec
      }
      
      return next
    })
    setAddingGoalFor(null)
  }

  const addAssistForGoal = (assisterId, scorerId) => {
    const now = new Date().toISOString()
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      
      // Add assist event
      const assisterRec = next[toStr(assisterId)] || { goals: 0, assists: 0, events: [] }
      const assistEvent = { type: 'assist', date: now }
      if (scorerId) {
        assistEvent.linkedToGoal = toStr(scorerId)
      }
      assisterRec.events.push(assistEvent)
      assisterRec.assists = (assisterRec.assists || 0) + 1
      next[toStr(assisterId)] = assisterRec
      
      // Add goal event if scorer is selected
      if (scorerId) {
        const scorerRec = next[toStr(scorerId)] || { goals: 0, assists: 0, events: [] }
        const goalEvent = { type: 'goal', date: now, assistedBy: toStr(assisterId) }
        scorerRec.events.push(goalEvent)
        scorerRec.goals = (scorerRec.goals || 0) + 1
        next[toStr(scorerId)] = scorerRec
      }
      
      return next
    })
    setAddingAssistFor(null)
  }

  return (
    <div className="rounded-lg border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white shadow-sm">
      <div className="flex items-center justify-between px-2 sm:px-3 py-2 text-xs border-b border-blue-100">
        <div className="text-sm sm:text-base font-semibold text-gray-800">편집 패널 · {panelIds.length}명</div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button 
            onClick={()=>setShowLinkingPanel(!showLinkingPanel)} 
            className="rounded-lg border-2 border-blue-400 bg-blue-500 hover:bg-blue-600 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs text-white font-medium shadow-sm transition-all"
          >
            {showLinkingPanel ? '연결 닫기' : '골-어시 연결'}
          </button>
          <button 
            onClick={()=>{
              // Reset goals/assists for players currently in the panel, then clear the panel.
              setDraft(prev=>{
                const next = { ...prev }
                for (const pid of panelIds) {
                  next[toStr(pid)] = { goals: 0, assists: 0, events: [] }
                }
                return next
              })
              setPanelIds([])
            }} 
            className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors"
          >
            전체 제거
          </button>
          <button 
            onClick={onSave} 
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs text-white font-semibold shadow-md transition-all hover:shadow-lg"
          >
            저장하기
          </button>
        </div>
      </div>
      
      {showLinkingPanel && (
        <GoalAssistLinkingPanel players={players} draft={draft} setDraft={setDraft} />
      )}

      {/* Goal/Assist Adding Modal */}
      {addingGoalFor && (
        <div className="border-b border-green-200 bg-gradient-to-br from-green-50 to-white px-2 sm:px-3 py-2 sm:py-3">
          <div className="mb-2 text-xs sm:text-sm font-semibold text-gray-800">
            {players.find(p => toStr(p.id) === toStr(addingGoalFor))?.name}의 골 추가
          </div>
          <div className="mb-2 text-[10px] sm:text-xs text-gray-600">어시스트한 선수를 선택하세요 (선택사항):</div>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {panelIds.filter(pid => toStr(pid) !== toStr(addingGoalFor)).map(pid => {
              const p = players.find(pp => toStr(pp.id) === toStr(pid))
              const rec = draft[toStr(pid)] || { goals: 0, assists: 0, events: [] }
              if (!p) return null
              return (
                <button
                  key={pid}
                  onClick={() => addGoalWithAssist(addingGoalFor, pid)}
                  className="rounded-lg border-2 border-green-600 bg-white hover:bg-green-50 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors"
                >
                  {p.name} <span className="ml-1 text-gray-500">(A: {rec.assists})</span>
                </button>
              )
            })}
            <button
              onClick={() => addGoalWithAssist(addingGoalFor, null)}
              className="rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs text-white font-semibold shadow-md transition-all"
            >
              어시스트 없이 추가
            </button>
            <button
              onClick={() => setAddingGoalFor(null)}
              className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {addingAssistFor && (
        <div className="border-b border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 sm:px-3 py-2 sm:py-3">
          <div className="mb-2 text-xs sm:text-sm font-semibold text-gray-800">
            {players.find(p => toStr(p.id) === toStr(addingAssistFor))?.name}의 어시스트 추가
          </div>
          <div className="mb-2 text-[10px] sm:text-xs text-gray-600">골을 넣은 선수를 선택하세요 (선택사항):</div>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {panelIds.filter(pid => toStr(pid) !== toStr(addingAssistFor)).map(pid => {
              const p = players.find(pp => toStr(pp.id) === toStr(pid))
              const rec = draft[toStr(pid)] || { goals: 0, assists: 0, events: [] }
              if (!p) return null
              return (
                <button
                  key={pid}
                  onClick={() => addAssistForGoal(addingAssistFor, pid)}
                  className="rounded-lg border-2 border-blue-600 bg-white hover:bg-blue-50 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors"
                >
                  {p.name} <span className="ml-1 text-gray-500">(G: {rec.goals})</span>
                </button>
              )
            })}
            <button
              onClick={() => addAssistForGoal(addingAssistFor, null)}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs text-white font-semibold shadow-md transition-all"
            >
              골 없이 추가
            </button>
            <button
              onClick={() => setAddingAssistFor(null)}
              className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {panelIds.map(pid => {
          const p = players.find(pp => toStr(pp.id)===toStr(pid))
          const rec = draft[toStr(pid)] || { goals:0, assists:0, events:[] }
          if (!p) return null
          return (
            <li key={toStr(pid)} className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-white">
              <InitialAvatar id={p.id} name={p.name} size={22} badges={(() => { const s=toStr(p.membership).toLowerCase(); return (s==='member'||s.includes('정회원'))?[]:['G'] })()} photoUrl={p.photoUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs sm:text-sm font-medium">
                  {p.name} <span className="ml-1 text-[10px] sm:text-xs text-gray-500">{p.position||p.pos||'-'}</span>
                </div>
              </div>

              <LinkedCounter
                label="G"
                value={rec.goals}
                onAdd={() => setAddingGoalFor(p.id)}
                onDec={()=>setVal(p.id,'goals',Math.max(0,(rec.goals||0)-1))}
              />
              <LinkedCounter
                label="A"
                value={rec.assists}
                onAdd={() => setAddingAssistFor(p.id)}
                onDec={()=>setVal(p.id,'assists',Math.max(0,(rec.assists||0)-1))}
              />

              <button 
                onClick={()=>{
                  // Only remove from panel, keep draft data intact
                  setPanelIds(prev=>prev.filter(id=>id!==toStr(pid)))
                }}
                className="ml-1 rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-2 py-1 text-[10px] sm:text-xs font-medium transition-colors"
              >
                제거
              </button>
            </li>
          )
        })}
        {panelIds.length===0 && (
          <li className="px-2 sm:px-3 py-4 sm:py-6 text-center text-xs sm:text-sm text-gray-500">
            아직 선택된 선수가 없습니다. 위에서 검색 후 "패널에 추가"를 눌러주세요.
          </li>
        )}
      </ul>
    </div>
  )
}function Pill({ children, active, onClick }){
  return (
    <button onClick={onClick}
      className={`rounded-lg px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold shadow-sm transition-all ${
        active
          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-2 border-blue-700' 
          : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'
      }`}>
      {children}
    </button>
  )
}

function LinkedCounter({ label, value, onAdd, onDec }){
  const labelColor = label === 'G' ? 'from-emerald-500 to-emerald-600' : 'from-amber-500 to-amber-600'
  
  return (
    <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-50 rounded-lg p-1 sm:p-1.5 border border-gray-200">
      <button 
        onClick={onDec} 
        aria-label={`${label} 감소`} 
        disabled={value <= 0}
        className="rounded-md bg-white border border-gray-300 hover:border-red-400 hover:bg-red-50 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-gray-600 hover:text-red-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 disabled:hover:text-gray-600 font-bold shadow-sm text-xs sm:text-base"
      >
        −
      </button>
      <div className="flex items-center gap-0.5 sm:gap-1 px-0.5 sm:px-1">
        <span className={`inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-gradient-to-br ${labelColor} text-[10px] sm:text-xs font-bold text-white shadow-md`}>{label}</span>
        <span className="w-5 sm:w-6 text-center tabular-nums font-bold text-xs sm:text-sm text-gray-800">{value}</span>
      </div>
      <button 
        onClick={onAdd} 
        aria-label={`${label} 추가`} 
        className="rounded-md bg-blue-500 hover:bg-blue-600 border border-blue-600 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-white transition-all font-bold shadow-sm text-xs sm:text-base"
      >
        +
      </button>
    </div>
  )
}
