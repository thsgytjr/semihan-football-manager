// src/pages/StatsInput.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import { hydrateMatch } from '../lib/match'
import { formatMatchLabel } from '../lib/matchLabel'

const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

/* ======== Utility Functions ======== */
function asTime(v) {
  if (!v) return NaN
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const t = Date.parse(v)
  return Number.isNaN(t) ? NaN : t
}

function getMatchTime(m) {
  const candidates = [m?.dateISO, m?.date, m?.created_at]
  for (const c of candidates) {
    const t = asTime(c)
    if (!Number.isNaN(t)) return t
  }
  return 0
}

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
      const goals = Number(v?.goals || v?.G || 0)
      const assists = Number(v?.assists || v?.A || 0)
      const events = Array.isArray(v?.events) ? v.events.map(e => ({
        type: e.type || e.event || (e?.isAssist ? 'assist' : 'goal'),
        date: e.dateISO || e.date || e.ts || e.time,
        assistedBy: e.assistedBy,
        linkedToGoal: e.linkedToGoal
      })).filter(Boolean) : []
      out[pid] = { goals, assists, events }
    }
    return out
  }

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
      }
    }
    return out
  }

  return out
}

/* ======== Main Component ======== */
export default function StatsInput({ players = [], matches = [], onUpdateMatch, isAdmin }) {
  const sortedMatches = useMemo(() => {
    const arr = Array.isArray(matches) ? [...matches] : []
    return arr.sort((a, b) => getMatchTime(b) - getMatchTime(a))
  }, [matches])

  const [editingMatchId, setEditingMatchId] = useState('')
  useEffect(() => {
    const latestId = toStr(sortedMatches?.[0]?.id || '')
    setEditingMatchId(latestId)
  }, [sortedMatches])

  const editingMatch = useMemo(
    () => (sortedMatches || []).find(m => toStr(m.id) === toStr(editingMatchId)) || null,
    [sortedMatches, editingMatchId]
  )

  const [draft, setDraft] = useState({})
  useEffect(() => {
    if (!editingMatch) { setDraft({}); return }
    const src = extractStatsByPlayer(editingMatch)
    const next = {}
    const ids = new Set(extractAttendeeIds(editingMatch))
    for (const p of players) {
      if (!ids.has(toStr(p.id))) continue
      const rec = src?.[toStr(p.id)] || {}
      next[toStr(p.id)] = {
        goals: Number(rec.goals || 0),
        assists: Number(rec.assists || 0),
        events: Array.isArray(rec.events) ? rec.events.slice() : []
      }
    }
    setDraft(next)
  }, [editingMatch, players])

  const [bulkText, setBulkText] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')
  const [showSaved, setShowSaved] = useState(false)

  const save = () => {
    if (!editingMatch) return
    onUpdateMatch?.(editingMatch.id, { stats: draft })
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 1200)
  }

  // Bulk parsing functions (simplified from original)
  function parseLooseDate(s) {
    if (!s) return null
    const t = s.trim()
    const iso = Date.parse(t)
    if (!Number.isNaN(iso)) return new Date(iso)

    const parts = t.split(/\s+/)
    const datePart = parts[0]
    const timePart = parts.slice(1).join(' ') || ''
    const dateSep = datePart.includes('/') ? '/' : datePart.includes('-') ? '-' : null
    const datePieces = dateSep ? datePart.split(dateSep) : [datePart]
    if (datePieces.length !== 3) return null
    let a = Number(datePieces[0]), b = Number(datePieces[1]), y = Number(datePieces[2])
    if (y < 100) y += 2000
    let day, month
    if (a > 12) { day = a; month = b } else { month = a; day = b }

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
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = (date.getDay() + 6) % 7
    const monday = new Date(date)
    monday.setDate(date.getDate() - day)
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

  function isStrictLine(line) {
    if (!line) return false
    return /^\s*\[[^\]]+\]\s*(?:goal|assist|goal\s*:\s*assist)\s*\[[^\]]+\]\s*$/i.test(line)
  }

  // Smart name normalization: removes content in parentheses
  function normalizePlayerName(name) {
    if (!name) return ''
    // Remove content in parentheses: 알렉스(Alejandro Gomez) -> 알렉스
    return String(name).replace(/\s*\([^)]*\)/g, '').trim()
  }

  function parseBulkLines(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const out = []
    const attendeeIds = new Set(extractAttendeeIds(editingMatch))
    const roster = players.filter(p => attendeeIds.has(toStr(p.id)))
    
    // Build name mapping with normalized names
    const nameMap = new Map()
    roster.forEach(p => {
      const fullName = String((p.name || '').trim())
      const normalized = normalizePlayerName(fullName)
      nameMap.set(fullName, p) // exact match
      nameMap.set(normalized, p) // normalized match
    })

    for (const line of lines) {
      if (!isStrictLine(line)) return []
      const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g)).map(m => m[1])
      const dateStr = bracketMatches[0]
      const namesField = bracketMatches[bracketMatches.length - 1]
      const betweenMatch = line.replace(/\[([^\]]+)\]/g, '¤').split('¤')[1] || ''
      const hasBoth = /goal\s*:\s*assist/i.test(betweenMatch)
      const dt = parseLooseDate(dateStr)
      if (!dt) return []

      if (hasBoth) {
        const raw = String(namesField || '').trim()
        
        // Try exact match first
        if (nameMap.has(raw)) {
          out.push({ date: dt, type: 'goals', name: raw })
          continue
        }

        // Try normalized match
        const normalizedRaw = normalizePlayerName(raw)
        if (nameMap.has(normalizedRaw)) {
          out.push({ date: dt, type: 'goals', name: normalizedRaw })
          continue
        }

        // Try splitting into two names
        const tokens = raw.split(/\s+/).filter(Boolean)
        let foundSplits = []
        for (let i = 1; i < tokens.length; ++i) {
          const left = tokens.slice(0, i).join(' ')
          const right = tokens.slice(i).join(' ')
          const leftNorm = normalizePlayerName(left)
          const rightNorm = normalizePlayerName(right)
          
          const leftMatch = nameMap.has(left) || nameMap.has(leftNorm)
          const rightMatch = nameMap.has(right) || nameMap.has(rightNorm)
          
          if (leftMatch && rightMatch) {
            const leftName = nameMap.has(left) ? left : leftNorm
            const rightName = nameMap.has(right) ? right : rightNorm
            foundSplits.push([leftName, rightName])
          }
        }
        if (foundSplits.length === 1) {
          out.push({ date: dt, type: 'goals', name: foundSplits[0][0] })
          out.push({ date: dt, type: 'assists', name: foundSplits[0][1] })
        } else {
          out.push({ date: dt, type: 'ambiguous', splits: foundSplits, raw })
        }
      } else {
        let type = null
        if (/\bgoal\b/i.test(betweenMatch)) type = 'goals'
        else if (/\bassist\b/i.test(betweenMatch)) type = 'assists'
        if (!type || !namesField) return []
        
        const inputName = String(namesField).trim()
        const normalized = normalizePlayerName(inputName)
        const finalName = nameMap.has(inputName) ? inputName : (nameMap.has(normalized) ? normalized : inputName)
        
        out.push({ date: dt, type, name: finalName })
      }
    }
    return out
  }

  async function applyBulkToDraft() {
    setBulkMsg('')
    if (!bulkText.trim()) { setBulkMsg('붙여넣을 데이터가 비어 있습니다.'); return }
    
    const rawLines = String(bulkText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const bad = rawLines.filter(l => !isStrictLine(l))
    if (bad.length > 0) {
      setBulkMsg('모든 줄이 [date]goal[name] 또는 [date]assist[name] 형식이어야 합니다. 오류 예시: ' + (bad.slice(0, 3).join('; ')))
      return
    }

    const parsed = parseBulkLines(bulkText)
    if (parsed.length === 0) { setBulkMsg('파싱된 항목이 없습니다. 형식을 확인해 주세요.'); return }

    const ambiguous = parsed.filter(p => p.type === 'ambiguous')
    if (ambiguous.length > 0) {
      setBulkMsg('이름 구분이 모호한 줄이 있습니다: ' + ambiguous.map(a => `[${a.raw}]`).join(', '))
      return
    }

    const weekKeys = Array.from(new Set(parsed.map(p => weekKeyOfDate(p.date))))
    if (weekKeys.length !== 1) { setBulkMsg('여러 주의 데이터가 포함되어 있습니다. 한 번에 하나의 주만 처리하세요.'); return }
    const wk = weekKeys[0]

    const matchForWeek = sortedMatches.find(m => {
      const mt = getMatchTime(m)
      if (!mt) return false
      const k = weekKeyOfDate(new Date(mt))
      return k === wk
    })
    if (!matchForWeek) { setBulkMsg('해당 주에 저장된 매치를 찾을 수 없습니다.'); return }

    if (editingMatchId && toStr(editingMatchId) !== toStr(matchForWeek.id)) {
      setBulkMsg('현재 선택된 매치와 붙여넣은 데이터의 날짜(주)가 일치하지 않습니다.')
      return
    }

    if (!editingMatchId) setEditingMatchId(toStr(matchForWeek.id))

    const selectedMatchObj = (editingMatch && toStr(editingMatch.id) === toStr(editingMatchId)) ? editingMatch : matchForWeek
    const selectedDateKey = dayKeyOfDate(new Date(getMatchTime(selectedMatchObj)))

    if (editingMatchId) {
      const mismatched = parsed.filter(item => dayKeyOfDate(item.date) !== selectedDateKey)
      if (mismatched.length > 0) {
        const names = Array.from(new Set(mismatched.map(x => x.name))).slice(0, 10)
        setBulkMsg(`선택된 매치 날짜와 일치하지 않는 항목이 있습니다: ${names.join(', ')}`)
        return
      }
    }

    const nameMap = new Map(players.map(p => {
      const fullName = String((p.name || '').trim())
      const normalized = normalizePlayerName(fullName)
      return [normalized.toLowerCase(), p]
    }))

    const deltas = new Map()
    const unmatched = []
    for (const item of parsed) {
      const inputName = String((item.name || '').trim())
      const normalized = normalizePlayerName(inputName)
      const key = normalized.toLowerCase()
      const player = nameMap.get(key)
      if (!player) { unmatched.push(item.name); continue }
      const pid = player.id
      const cur = deltas.get(pid) || { goals: 0, assists: 0, events: [] }
      if (item.type === 'goals' || item.type === 'goal') {
        cur.goals = (cur.goals || 0) + 1
        cur.events.push({ type: 'goal', date: item.date.toISOString() })
      } else if (item.type === 'assists' || item.type === 'assist') {
        cur.assists = (cur.assists || 0) + 1
        cur.events.push({ type: 'assist', date: item.date.toISOString() })
      }
      deltas.set(pid, cur)
    }

    if (unmatched.length > 0) {
      setBulkMsg('일치하지 않는 선수명이 있습니다: ' + Array.from(new Set(unmatched)).slice(0, 10).join(', '))
      return
    }

    if (deltas.size === 0) {
      setBulkMsg('일치하는 선수가 없습니다.')
      return
    }

    setDraft(prev => {
      const next = { ...(prev || {}) }
      for (const [pid, delta] of deltas.entries()) {
        const k = toStr(pid)
        const now = next[k] || { goals: 0, assists: 0, events: [] }
        const events = Array.isArray(now.events) ? now.events.slice() : []

        const existingEventKeys = new Set(events.map(e => `${e.type}:${e.date}`))

        for (const e of (delta.events || [])) {
          const eventKey = `${e.type}:${e.date}`
          if (!existingEventKeys.has(eventKey)) {
            events.push({ type: e.type, date: e.date })
            existingEventKeys.add(eventKey)
          }
        }

        const goalCount = events.filter(e => e.type === 'goal').length
        const assistCount = events.filter(e => e.type === 'assist').length

        next[k] = { goals: goalCount, assists: assistCount, events }
      }
      return next
    })

    const playerNames = Array.from(deltas.keys()).map(pid => {
      const p = players.find(x => toStr(x.id) === toStr(pid))
      return p ? p.name : ''
    }).filter(Boolean).slice(0, 5)

    setBulkMsg(`✅ 초안에 적용 완료: ${deltas.size}명 (${playerNames.join(', ')}${deltas.size > 5 ? ' 외' : ''}) - 아래 "💾 저장하기" 버튼을 눌러주세요!`)
  }

  const teams = useMemo(() => {
    if (!editingMatch) return []
    const hydrated = hydrateMatch(editingMatch, players)
    return hydrated.teams || []
  }, [editingMatch, players])

  // Generate dynamic placeholder examples based on roster
  const bulkPlaceholder = useMemo(() => {
    if (!editingMatch) return "예시:\n[11/08/2025 9:07AM]goal:assist[득점자 도움자]\n[11/08/2025 9:16AM]goal[득점자]\n[11/08/2025 8:05AM]assist[도움자]"
    
    const attendeeIds = new Set(extractAttendeeIds(editingMatch))
    const roster = players.filter(p => attendeeIds.has(toStr(p.id)))
    if (roster.length === 0) return "예시:\n[11/08/2025 9:07AM]goal:assist[득점자 도움자]\n[11/08/2025 9:16AM]goal[득점자]\n[11/08/2025 8:05AM]assist[도움자]"

    // Find examples: one with parentheses (complex), one without (simple)
    const withParens = roster.find(p => /\([^)]+\)/.test(p.name))
    const withoutParens = roster.find(p => !/\([^)]+\)/.test(p.name) && p.name.length > 2)
    const anyPlayer = roster[0]

    const matchTime = editingMatch.date ? new Date(editingMatch.date) : new Date()
    const dateStr = `${matchTime.getMonth() + 1}/${matchTime.getDate()}/${matchTime.getFullYear()}`

    const examples = []
    if (withoutParens && roster.length > 1) {
      const assister = roster.find(p => toStr(p.id) !== toStr(withoutParens.id)) || anyPlayer
      examples.push(`[${dateStr} 9:07AM]goal:assist[${withoutParens.name} ${assister.name}]`)
    }
    if (withParens) {
      examples.push(`[${dateStr} 9:16AM]goal[${withParens.name}]`)
    }
    if (roster.length > 2) {
      const third = roster[2] || anyPlayer
      examples.push(`[${dateStr} 8:05AM]assist[${third.name}]`)
    }

    return examples.length > 0 ? `예시:\n${examples.join('\n')}` : "예시:\n[11/08/2025 9:07AM]goal:assist[득점자 도움자]"
  }, [editingMatch, players])

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
                key={sortedMatches.map(m => toStr(m.id)).join('|')}
                value={toStr(editingMatchId)}
                onChange={(e) => {
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
                onChange={e => setBulkText(e.target.value)}
                placeholder={bulkPlaceholder}
                className="w-full h-32 rounded-lg border-2 border-amber-300 bg-white px-3 py-2 text-sm resize-vertical font-mono focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
              />
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={applyBulkToDraft}
                    className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all"
                  >
                    ✨ 초안에 적용하기
                  </button>
                  <button
                    onClick={() => { setBulkText(''); setBulkMsg('') }}
                    className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 text-sm font-medium transition-colors"
                  >
                    지우기
                  </button>
                </div>
                {bulkMsg && (
                  <div className={`text-sm px-3 py-2 rounded-lg border-2 ${
                    bulkMsg.includes('✅') 
                      ? 'bg-green-50 border-green-300 text-green-800' 
                      : 'bg-red-50 border-red-300 text-red-800'
                  }`}>
                    {bulkMsg}
                  </div>
                )}
                <div className="text-xs text-gray-600 bg-white/60 rounded px-2 py-1">
                  💡 <strong>[날짜]goal:assist[득점자 도움자]</strong> 형식으로 입력하면 듀오가 자동 연결됩니다
                  <br />
                  💡 적용 후 아래 <strong>수동 입력</strong> 섹션에서 확인하고 <strong className="text-green-700">💾 저장하기</strong> 버튼을 눌러주세요
                </div>
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
  const [addingGoalFor, setAddingGoalFor] = useState(null) // { playerId, teamIdx }
  const [addingAssistFor, setAddingAssistFor] = useState(null) // { playerId, teamIdx }

  if (!editingMatch) return null

  const attendeeIds = new Set(extractAttendeeIds(editingMatch))

  // Group by team
  const teamRosters = teams.map((team, idx) => ({
    idx,
    name: `팀 ${idx + 1}`,
    players: team.filter(p => attendeeIds.has(toStr(p.id)))
  }))

  const addGoal = (playerId, teamIdx) => {
    // Show assist selection for same team
    setAddingGoalFor({ playerId, teamIdx })
  }

  const addGoalWithAssist = (playerId, assisterId) => {
    const now = new Date().toISOString()
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const k = toStr(playerId)
      const rec = next[k] || { goals: 0, assists: 0, events: [] }
      rec.goals = (rec.goals || 0) + 1
      const goalEvent = { type: 'goal', date: now }
      if (assisterId) {
        goalEvent.assistedBy = toStr(assisterId)
      }
      rec.events.push(goalEvent)
      next[k] = rec

      // Add assist event if selected
      if (assisterId) {
        const ak = toStr(assisterId)
        const arec = next[ak] || { goals: 0, assists: 0, events: [] }
        arec.assists = (arec.assists || 0) + 1
        arec.events.push({ type: 'assist', date: now, linkedToGoal: toStr(playerId) })
        next[ak] = arec
      }

      return next
    })
    setAddingGoalFor(null)
  }

  const addAssist = (playerId, teamIdx) => {
    // Show goal selection for same team
    setAddingAssistFor({ playerId, teamIdx })
  }

  const addAssistForGoal = (assisterId, goalPlayerId) => {
    const now = new Date().toISOString()
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const ak = toStr(assisterId)
      const arec = next[ak] || { goals: 0, assists: 0, events: [] }
      arec.assists = (arec.assists || 0) + 1
      const assistEvent = { type: 'assist', date: now }
      if (goalPlayerId) {
        assistEvent.linkedToGoal = toStr(goalPlayerId)
      }
      arec.events.push(assistEvent)
      next[ak] = arec

      // Add goal event if selected
      if (goalPlayerId) {
        const gk = toStr(goalPlayerId)
        const grec = next[gk] || { goals: 0, assists: 0, events: [] }
        grec.goals = (grec.goals || 0) + 1
        grec.events.push({ type: 'goal', date: now, assistedBy: toStr(assisterId) })
        next[gk] = grec
      }

      return next
    })
    setAddingAssistFor(null)
  }

  const removeGoal = (playerId) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const k = toStr(playerId)
      const rec = next[k]
      if (!rec) return next

      // Find the most recent goal event and its linked assist
      for (let i = rec.events.length - 1; i >= 0; i--) {
        if (rec.events[i].type === 'goal') {
          const goalEvent = rec.events[i]
          const assistPlayerId = goalEvent.assistedBy
          const assistIdx = goalEvent.assistedByIdx

          // Remove the goal event
          rec.events.splice(i, 1)
          rec.goals = Math.max(0, (rec.goals || 0) - 1)

          // If this goal was linked to an assist, also remove that assist
          if (assistPlayerId !== undefined) {
            const assistRec = next[toStr(assistPlayerId)]
            if (assistRec && assistRec.events) {
              // Find and remove the linked assist event
              if (assistIdx !== undefined && assistRec.events[assistIdx]) {
                // If we have the exact index, use it
                if (assistRec.events[assistIdx].type === 'assist' && 
                    toStr(assistRec.events[assistIdx].linkedToGoal) === k) {
                  assistRec.events.splice(assistIdx, 1)
                  assistRec.assists = Math.max(0, (assistRec.assists || 0) - 1)
                }
              } else {
                // Otherwise find the assist linked to this goal
                for (let j = assistRec.events.length - 1; j >= 0; j--) {
                  if (assistRec.events[j].type === 'assist' && 
                      toStr(assistRec.events[j].linkedToGoal) === k) {
                    assistRec.events.splice(j, 1)
                    assistRec.assists = Math.max(0, (assistRec.assists || 0) - 1)
                    break
                  }
                }
              }
            }
          }
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

      // Find the most recent assist event and its linked goal
      for (let i = rec.events.length - 1; i >= 0; i--) {
        if (rec.events[i].type === 'assist') {
          const assistEvent = rec.events[i]
          const goalPlayerId = assistEvent.linkedToGoal
          const goalIdx = assistEvent.linkedToGoalIdx

          // Remove the assist event
          rec.events.splice(i, 1)
          rec.assists = Math.max(0, (rec.assists || 0) - 1)

          // If this assist was linked to a goal, also remove that goal
          if (goalPlayerId !== undefined) {
            const goalRec = next[toStr(goalPlayerId)]
            if (goalRec && goalRec.events) {
              // Find and remove the linked goal event
              if (goalIdx !== undefined && goalRec.events[goalIdx]) {
                // If we have the exact index, use it
                if (goalRec.events[goalIdx].type === 'goal' && 
                    toStr(goalRec.events[goalIdx].assistedBy) === k) {
                  goalRec.events.splice(goalIdx, 1)
                  goalRec.goals = Math.max(0, (goalRec.goals || 0) - 1)
                }
              } else {
                // Otherwise find the goal linked to this assist
                for (let j = goalRec.events.length - 1; j >= 0; j--) {
                  if (goalRec.events[j].type === 'goal' && 
                      toStr(goalRec.events[j].assistedBy) === k) {
                    goalRec.events.splice(j, 1)
                    goalRec.goals = Math.max(0, (goalRec.goals || 0) - 1)
                    break
                  }
                }
              }
            }
          }
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
            onClick={() => {
              if (confirm('모든 골/어시스트 기록을 초기화하시겠습니까?')) {
                setDraft({})
              }
            }}
            className="rounded-lg border-2 border-red-300 bg-red-50 hover:bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 transition-all"
          >
            🗑️ 모두 초기화
          </button>
          <button
            onClick={() => setShowLinkPanel(!showLinkPanel)}
            className="rounded-lg border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700 transition-all"
          >
            {showLinkPanel ? '🔗 연결 관리 닫기' : '🔗 연결 수정'}
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
        <GoalAssistLinkingPanel 
          players={players} 
          draft={draft} 
          setDraft={setDraft}
          teams={teamRosters}
        />
      )}

      {/* Goal/Assist Adding Modal */}
      {addingGoalFor && (
        <div className="border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg px-4 py-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">
            ⚽ {players.find(p => toStr(p.id) === toStr(addingGoalFor.playerId))?.name}의 골 추가
          </div>
          <div className="mb-2 text-xs text-gray-600">어시스트한 선수를 선택하세요:</div>
          <div className="space-y-3">
            {teamRosters.map((team, teamIdx) => {
              const teamPlayers = team.players.filter(p => toStr(p.id) !== toStr(addingGoalFor.playerId))
              if (teamPlayers.length === 0) return null
              
              return (
                <div key={teamIdx}>
                  <div className="text-[10px] font-bold text-gray-500 mb-1.5">{team.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {teamPlayers.map(p => {
                      const rec = draft[toStr(p.id)] || { goals: 0, assists: 0 }
                      return (
                        <button
                          key={toStr(p.id)}
                          onClick={() => addGoalWithAssist(addingGoalFor.playerId, p.id)}
                          className="rounded-lg border-2 border-blue-500 bg-white hover:bg-blue-50 px-3 py-1.5 text-xs font-medium transition-colors"
                        >
                          {p.name} <span className="ml-1 text-gray-500">(A: {rec.assists})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="flex gap-2 pt-2 border-t border-emerald-200">
              <button
                onClick={() => addGoalWithAssist(addingGoalFor.playerId, null)}
                className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 px-3 py-1.5 text-xs text-white font-semibold shadow-sm transition-all"
              >
                어시스트 없이 추가
              </button>
              <button
                onClick={() => setAddingGoalFor(null)}
                className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-medium transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {addingAssistFor && (
        <div className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg px-4 py-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">
            👉 {players.find(p => toStr(p.id) === toStr(addingAssistFor.playerId))?.name}의 어시스트 추가
          </div>
          <div className="mb-2 text-xs text-gray-600">골을 넣은 선수를 선택하세요:</div>
          <div className="space-y-3">
            {teamRosters.map((team, teamIdx) => {
              const teamPlayers = team.players.filter(p => toStr(p.id) !== toStr(addingAssistFor.playerId))
              if (teamPlayers.length === 0) return null
              
              return (
                <div key={teamIdx}>
                  <div className="text-[10px] font-bold text-gray-500 mb-1.5">{team.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {teamPlayers.map(p => {
                      const rec = draft[toStr(p.id)] || { goals: 0, assists: 0 }
                      return (
                        <button
                          key={toStr(p.id)}
                          onClick={() => addAssistForGoal(addingAssistFor.playerId, p.id)}
                          className="rounded-lg border-2 border-emerald-500 bg-white hover:bg-emerald-50 px-3 py-1.5 text-xs font-medium transition-colors"
                        >
                          {p.name} <span className="ml-1 text-gray-500">(G: {rec.goals})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="flex gap-2 pt-2 border-t border-amber-200">
              <button
                onClick={() => addAssistForGoal(addingAssistFor.playerId, null)}
                className="rounded-lg bg-gradient-to-r from-amber-600 to-yellow-700 hover:from-amber-700 hover:to-yellow-800 px-3 py-1.5 text-xs text-white font-semibold shadow-sm transition-all"
              >
                골 없이 추가
              </button>
              <button
                onClick={() => setAddingAssistFor(null)}
                className="rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-medium transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
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
                            const s = toStr(p.membership).toLowerCase();
                            return (s === 'member' || s.includes('정회원')) ? [] : ['G']
                          })()}
                          photoUrl={p.photoUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-gray-800 truncate">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.position || p.pos || '-'}</div>
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
                          onClick={() => addGoal(p.id, team.idx)}
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
                          onClick={() => addAssist(p.id, team.idx)}
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

/* ======== Goal/Assist Linking Panel Component ======== */
function GoalAssistLinkingPanel({ players, draft, setDraft, teams }) {
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [selectedAssist, setSelectedAssist] = useState(null)

  // Helper to find team of a player
  const getPlayerTeam = (playerId) => {
    for (let teamIdx = 0; teamIdx < teams.length; teamIdx++) {
      if (teams[teamIdx].players.some(p => toStr(p.id) === toStr(playerId))) {
        return teamIdx
      }
    }
    return null
  }

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
            teamIdx: getPlayerTeam(pid),
            eventIdx: idx,
            date: evt.date,
            assistedBy: evt.assistedBy || null,
            uniqueKey: `${pid}-${idx}`
          })
        }
      })
    }
    return goals.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [draft, players, teams])

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
            teamIdx: getPlayerTeam(pid),
            eventIdx: idx,
            date: evt.date,
            linkedToGoal: evt.linkedToGoal || null,
            uniqueKey: `${pid}-${idx}`
          })
        }
      })
    }
    return assists.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [draft, players, teams])

  // Filter assists/goals based on selection (exclude self only)
  const visibleGoals = selectedAssist
    ? allGoals.filter(g => g.playerId !== selectedAssist.playerId)
    : allGoals

  const visibleAssists = selectedGoal
    ? allAssists.filter(a => a.playerId !== selectedGoal.playerId)
    : allAssists

  const linkGoalToAssist = () => {
    if (!selectedGoal || !selectedAssist) return
    if (selectedGoal.playerId === selectedAssist.playerId) {
      alert('자기 자신에게 어시스트할 수 없습니다')
      return
    }

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
    <div className="border-2 border-blue-200 bg-blue-50 px-4 py-4 rounded-lg">
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
          <div className="mb-2 text-xs font-semibold text-gray-700">
            ⚽ 골 목록
            {selectedAssist && (
              <span className="ml-2 text-blue-600 font-normal">
                ({selectedAssist.playerName} 제외)
              </span>
            )}
          </div>
          <div className="max-h-60 overflow-auto rounded border-2 border-gray-300 bg-white">
            {visibleGoals.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500">골이 없습니다</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visibleGoals.map(goal => {
                  const isSelected = selectedGoal?.uniqueKey === goal.uniqueKey
                  const assistedByPlayer = goal.assistedBy ? players.find(p => toStr(p.id) === toStr(goal.assistedBy)) : null

                  return (
                    <li
                      key={goal.uniqueKey}
                      onClick={() => setSelectedGoal(isSelected ? null : goal)}
                      className={`cursor-pointer px-2 py-2 text-xs transition-colors ${isSelected
                        ? 'bg-emerald-100 border-l-4 border-emerald-600'
                        : 'hover:bg-blue-50'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800">{goal.playerName}</div>
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
          <div className="mb-2 text-xs font-semibold text-gray-700">
            👉 어시스트 목록
            {selectedGoal && (
              <span className="ml-2 text-emerald-600 font-normal">
                ({selectedGoal.playerName} 제외)
              </span>
            )}
          </div>
          <div className="max-h-60 overflow-auto rounded border-2 border-gray-300 bg-white">
            {visibleAssists.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500">어시스트가 없습니다</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visibleAssists.map(assist => {
                  const isSelected = selectedAssist?.uniqueKey === assist.uniqueKey
                  const linkedToPlayer = assist.linkedToGoal ? players.find(p => toStr(p.id) === toStr(assist.linkedToGoal)) : null

                  return (
                    <li
                      key={assist.uniqueKey}
                      onClick={() => setSelectedAssist(isSelected ? null : assist)}
                      className={`cursor-pointer px-2 py-2 text-xs transition-colors ${isSelected
                        ? 'bg-amber-100 border-l-4 border-amber-600'
                        : 'hover:bg-blue-50'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800">{assist.playerName}</div>
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
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${selectedGoal && selectedAssist
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

      <div className="mt-2 text-[10px] text-gray-600 bg-white rounded px-2 py-1">
        💡 <strong>Bulk 입력 시 자동 연결:</strong> [날짜]goal:assist[득점자 도움자] 형식은 자동으로 듀오 연결됩니다.
        <br />
        💡 <strong>수동 연결:</strong> 골과 어시스트를 각각 클릭하여 선택 후 "듀오 연결하기" 버튼을 누르세요.
        <br />
        💡 <strong>연결 해제:</strong> 연결된 골 옆의 ✕ 버튼을 클릭하여 연결을 해제할 수 있습니다.
      </div>
    </div>
  )
}
