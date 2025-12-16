// src/pages/StatsInput.jsx
import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../components/ConfirmDialog'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import MoMAdminPanel from '../components/MoMAdminPanel'
import { notify } from '../components/Toast'
import { hydrateMatch } from '../lib/match'
import MatchHelpers from '../lib/matchHelpers'
import { formatMatchLabel } from '../lib/matchLabel'
import { isRefMatch } from '../lib/matchUtils'
import { summarizeVotes, buildMoMTieBreakerScores, getMoMPhase } from '../lib/momUtils'
import { fetchMoMVotes, submitMoMVote, deleteMoMVote, deleteMoMVotesByMatch } from '../services/momVotes.service'
import { deleteAllRefEvents } from '../services/refEvents.service'
import RefereeTimelineEditor from '../components/RefereeTimelineEditor'

const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

/* ======== Utility Functions ======== */
function asTime(v) {
  if (!v) return NaN
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const t = Date.parse(v)
  return Number.isNaN(t) ? NaN : t
}

// Get comparable match time for sorting (prefers dateISO, falls back to date/created_at)
function getMatchTime(m) {
  const candidates = [m?.dateISO, m?.date, m?.created_at]
  for (const c of candidates) {
    const t = asTime(c)
    if (!Number.isNaN(t)) return t
  }
  return 0
}

// Extract attendee IDs from various possible roster fields
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
      const cleanSheet = Number(v?.cleanSheet || v?.cs || 0)
      const yellowCards = Number(v?.yellowCards || v?.yc || 0)
      const redCards = Number(v?.redCards || v?.rc || 0)
      const blackCards = Number(v?.blackCards || v?.bc || 0)
      const events = Array.isArray(v?.events) ? v.events.map(e => ({
        type: e.type || e.event || (e?.isAssist ? 'assist' : 'goal'),
        date: e.dateISO || e.date || e.ts || e.time,
        assistedBy: e.assistedBy,
        assistedName: e.assistedName,
        linkedToGoal: e.linkedToGoal,
        teamIndex: e.teamIndex,
        gameIndex: e.gameIndex,
        minute: e.minute,
        playerName: e.playerName,
        timestamp: e.timestamp,
        id: e.id,
      })).filter(Boolean) : []
      out[pid] = { goals, assists, events, cleanSheet, yellowCards, redCards, blackCards }
    }
    return out
  }
  
  if (Array.isArray(src)) {
    // Legacy/array-form not expected here, but handle gracefully
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid)
      if (!pid) continue
      const type = (rec?.type || (rec?.goal ? 'goal' : rec?.assist ? 'assist' : '')).toString().toLowerCase()
      const date = rec?.dateISO || rec?.date || rec?.time || rec?.ts || null
      const isGoal = /goal/i.test(type)
      const isAssist = /assist/i.test(type)
      out[pid] = out[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      if (isGoal) {
        out[pid].goals = (out[pid].goals || 0) + Number(rec?.goals || 1)
        out[pid].events.push({ type: 'goal', date })
      } else if (isAssist) {
        out[pid].assists = (out[pid].assists || 0) + Number(rec?.assists || 1)
        out[pid].events.push({ type: 'assist', date })
      }
      if (Number(rec?.cleanSheet || 0) > 0) {
        out[pid].cleanSheet = (out[pid].cleanSheet || 0) + Number(rec.cleanSheet)
      }
      if (Number(rec?.yellowCards || 0) > 0) {
        out[pid].yellowCards = (out[pid].yellowCards || 0) + Number(rec.yellowCards)
      }
      if (Number(rec?.redCards || 0) > 0) {
        out[pid].redCards = (out[pid].redCards || 0) + Number(rec.redCards)
      }
      if (Number(rec?.blackCards || 0) > 0) {
        out[pid].blackCards = (out[pid].blackCards || 0) + Number(rec.blackCards)
      }
    }
    return out
  }

  return out
}


/* ======== Main Component ======== */
export default function StatsInput({ players = [], matches = [], onUpdateMatch, isAdmin, cardsFeatureEnabled = true, onStartRefereeMode }) {
  const { t } = useTranslation()
  const cardsEnabled = cardsFeatureEnabled !== false
  const sortedMatches = useMemo(() => {
    const arr = Array.isArray(matches) ? [...matches] : []
    return arr.sort((a, b) => getMatchTime(b) - getMatchTime(a))
  }, [matches])

  const [editingMatchId, setEditingMatchId] = useState('')
  useEffect(() => {
    const latestId = toStr(sortedMatches?.[0]?.id || '')
    if (!latestId) return
    setEditingMatchId((prev) => {
      if (!prev) return latestId
      const stillExists = sortedMatches.some(m => toStr(m.id) === toStr(prev))
      return stillExists ? prev : latestId
    })
  }, [sortedMatches])

  const editingMatch = useMemo(
    () => (sortedMatches || []).find(m => toStr(m.id) === toStr(editingMatchId)) || null,
    [sortedMatches, editingMatchId]
  )

  const [draft, setDraft] = useState({})
  const [momMatchId, setMomMatchId] = useState('')
  useEffect(() => {
    if (!editingMatch) { setDraft({}); return }
    const src = extractStatsByPlayer(editingMatch)
    const next = {}
    const attendeeList = extractAttendeeIds(editingMatch)
    const ids = attendeeList.length > 0
      ? new Set(attendeeList)
      : new Set((hydrateMatch(editingMatch, players).teams || []).flat().map(p => toStr(p.id)).filter(Boolean))
    for (const p of players) {
      if (!ids.has(toStr(p.id))) continue
      const rec = src?.[toStr(p.id)] || {}
      const csValue = Number(rec.cleanSheet || 0)
      next[toStr(p.id)] = {
        goals: Number(rec.goals || 0),
        assists: Number(rec.assists || 0),
        events: Array.isArray(rec.events) ? rec.events.slice() : [],
        cleanSheet: csValue,
        yellowCards: Number(rec.yellowCards || 0),
        redCards: Number(rec.redCards || 0),
        blackCards: Number(rec.blackCards || 0)
      }
    }
    setDraft(next)
  }, [editingMatch, players])

  useEffect(() => {
    if (momMatchId) return

    if (editingMatchId) {
      setMomMatchId(toStr(editingMatchId))
      return
    }

    const fallback = (sortedMatches || [])[0]
    if (fallback?.id) setMomMatchId(toStr(fallback.id))
  }, [momMatchId, editingMatchId, sortedMatches])

  const [bulkText, setBulkText] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')
  const [sectionTab, setSectionTab] = useState('manual') // bulk | manual | mom
  const [statsTab, setStatsTab] = useState('attack') // attack | defense | discipline
  const [showSaved, setShowSaved] = useState(false)
  const [confirmState, setConfirmState] = useState({ open: false, kind: null })
  const [alertState, setAlertState] = useState({ open: false, title: '안내', message: '' })
  const [momVotes, setMomVotes] = useState([])
  const [momLoadingVotes, setMomLoadingVotes] = useState(false)

  const momMatch = useMemo(() => {
    if (!momMatchId) return editingMatch || null
    return (sortedMatches || []).find(m => toStr(m.id) === toStr(momMatchId)) || null
  }, [momMatchId, sortedMatches, editingMatch])

  const buildTimelineFromDraft = (draftStats, teamsArr = []) => {
    const playerTeam = new Map()
    teamsArr.forEach((team, idx) => {
      (team || []).forEach(p => {
        if (p?.id == null) return
        playerTeam.set(toStr(p.id), idx)
      })
    })

    const timeline = []
    for (const [pid, rec] of Object.entries(draftStats || {})) {
      const evs = Array.isArray(rec?.events) ? rec.events : []
      evs.forEach((ev, idx) => {
        const type = ev?.type || ''
        if (!type) return
        // Keep only goal/own_goal/foul/yellow/red/super_save for timeline rendering
        const normalized = String(type).toLowerCase()
        const allow = ['goal', 'own_goal', 'foul', 'yellow', 'red', 'super_save']
        if (!allow.includes(normalized)) return

        const teamIndex = ev.teamIndex != null ? ev.teamIndex : playerTeam.get(toStr(pid)) ?? 0
        const gameIndex = ev.gameIndex != null ? ev.gameIndex : 0
        timeline.push({
          id: ev.id || `manual-${pid}-${idx}`,
          type: normalized,
          teamIndex,
          gameIndex,
          playerId: pid,
          playerName: ev.playerName || '',
          assistedBy: ev.assistedBy || null,
          assistedName: ev.assistedName || '',
          minute: ev.minute || '',
          timestamp: ev.timestamp || null,
          date: ev.date || ev.dateISO || null,
        })
      })
    }
    return timeline
  }

  const save = () => {
    if (!editingMatch) return
    const baseStats = editingMatch?.stats && typeof editingMatch.stats === 'object' ? editingMatch.stats : {}
    const keepTimeline = isRefMatch(editingMatch)

    const mergedStats = {
      ...baseStats,
      ...draft,
    }

    if (keepTimeline) {
      mergedStats.__events = buildTimelineFromDraft(draft, teams)
    } else if (mergedStats.__events) {
      // Remove referee timeline marker for manual-input matches
      delete mergedStats.__events
    }

    onUpdateMatch?.(editingMatch.id, { stats: mergedStats })
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 1200)
  }

  const resetAllRecords = async () => {
    if (!editingMatch) return
    setDraft({})
    // Wipe per-game timelines/scores so match history also clears
    // ✅ Preserve selectionMode and captains to prevent match type from changing
    const patch = {
      stats: {},
      quarterScores: [],
      statsMeta: { gameEvents: [] },
      gameEvents: [],
    }
    
    // Preserve match type and captains appropriately
    if (editingMatch.selectionMode === 'draft' || editingMatch.draftMode === true) {
      // Draft match: preserve draft.captains and clear draft.quarterScores
      patch.selectionMode = 'draft'
      if (editingMatch.draftMode === true) {
        patch.draftMode = true // Preserve legacy draftMode field
      }
      patch.draft = {
        ...(editingMatch.draft || {}),
        captains: editingMatch.draft?.captains || [],
        quarterScores: []
      }
    } else {
      // Regular match: preserve captainIds at top level, don't touch draft
      patch.selectionMode = editingMatch.selectionMode || 'manual'
      if (editingMatch.captainIds) {
        patch.captainIds = editingMatch.captainIds
      }
    }
    
    onUpdateMatch?.(editingMatch.id, patch)
    
    // Delete all referee events from database for this match
    try {
      const gamesCount = editingMatch.gameMatchups?.length || 1
      for (let gameIndex = 0; gameIndex < gamesCount; gameIndex++) {
        await deleteAllRefEvents(editingMatch.id, gameIndex)
      }
    } catch (err) {
      console.error('Failed to delete referee events:', err)
      // Don't block the reset operation if deletion fails
    }
  }

  const refreshMoMVotes = useCallback(async () => {
    if (!momMatch?.id) {
      setMomVotes([])
      return []
    }
    setMomLoadingVotes(true)
    try {
      const data = await fetchMoMVotes(momMatch.id)
      setMomVotes(data)
      return data
    } catch (err) {
      notify('MOM 투표 기록을 불러오는 데 실패했습니다.', 'error')
      throw err
    } finally {
      setMomLoadingVotes(false)
    }
  }, [momMatch?.id])

  useEffect(() => {
    if (!momMatch?.id) {
      setMomVotes([])
      return
    }
    refreshMoMVotes()
  }, [momMatch?.id, refreshMoMVotes])

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
          // Push a single pair item so we can auto-link goal<->assist later
          out.push({ date: dt, type: 'pair', goalName: foundSplits[0][0], assistName: foundSplits[0][1] })
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

    const dayKeys = Array.from(new Set(parsed.map(p => dayKeyOfDate(p.date))))
    if (dayKeys.length !== 1) { setBulkMsg('여러 날짜의 데이터가 섞여 있습니다. 한 번에 한 날짜씩 붙여넣어주세요.'); return }
    const dk = dayKeys[0]

    const matchForDay = sortedMatches.find(m => {
      const mt = getMatchTime(m)
      if (!mt) return false
      const dayKey = dayKeyOfDate(new Date(mt))
      return dayKey === dk
    })

    const matchForWeek = matchForDay ? matchForDay : sortedMatches.find(m => {
      const mt = getMatchTime(m)
      if (!mt) return false
      const k = weekKeyOfDate(new Date(mt))
      return k === wk
    })

    if (!matchForDay) {
      if (matchForWeek) {
        setBulkMsg('현재 선택된 매치와 붙여넣은 데이터의 날짜(주)가 일치하지 않습니다. 붙여넣은 날짜와 동일한 경기를 직접 선택하거나 해당 경기를 추가로 저장해 주세요.');
      } else {
        setBulkMsg('붙여넣은 날짜에 맞는 경기를 찾을 수 없습니다. 경기 정보가 저장되어 있는지 확인해 주세요.');
      }
      return
    }

    const desiredMatchId = toStr(matchForDay.id)
    const alreadySelectedId = toStr(editingMatchId)
    const willSwitchMatch = alreadySelectedId && alreadySelectedId !== desiredMatchId
    if (!alreadySelectedId || willSwitchMatch) {
      setEditingMatchId(desiredMatchId)
    }

    const targetMatchObj = (editingMatch && toStr(editingMatch.id) === desiredMatchId) ? editingMatch : matchForDay
    const selectedDateKey = dayKeyOfDate(new Date(getMatchTime(targetMatchObj)))

    if (selectedDateKey) {
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
      if (item.type === 'pair') {
        // Resolve both names and add linked events
        const gInput = String((item.goalName || '').trim())
        const aInput = String((item.assistName || '').trim())
        const gKey = normalizePlayerName(gInput).toLowerCase()
        const aKey = normalizePlayerName(aInput).toLowerCase()
        const gPlayer = nameMap.get(gKey)
        const aPlayer = nameMap.get(aKey)
        if (!gPlayer || !aPlayer) {
          if (!gPlayer) unmatched.push(item.goalName)
          if (!aPlayer) unmatched.push(item.assistName)
          continue
        }
        const gpid = gPlayer.id
        const apid = aPlayer.id
        const dateIso = item.date.toISOString()

        const gCur = deltas.get(gpid) || { goals: 0, assists: 0, events: [] }
        gCur.goals = (gCur.goals || 0) + 1
        gCur.events.push({ type: 'goal', date: dateIso, assistedBy: toStr(apid) })
        deltas.set(gpid, gCur)

        const aCur = deltas.get(apid) || { goals: 0, assists: 0, events: [] }
        aCur.assists = (aCur.assists || 0) + 1
        aCur.events.push({ type: 'assist', date: dateIso, linkedToGoal: toStr(gpid) })
        deltas.set(apid, aCur)
        continue
      }

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

        const eventKey = (e) => {
          const base = `${e.type}:${e.date || ''}`
          if (e.type === 'goal' && e.assistedBy) return `${base}:a=${toStr(e.assistedBy)}`
          if (e.type === 'assist' && e.linkedToGoal) return `${base}:g=${toStr(e.linkedToGoal)}`
          return base
        }
        const existingEventKeys = new Set(events.map(eventKey))

        for (const e of (delta.events || [])) {
          const key = eventKey(e)
          if (!existingEventKeys.has(key)) {
            const toPush = { type: e.type, date: e.date }
            if (e.assistedBy) toPush.assistedBy = toStr(e.assistedBy)
            if (e.linkedToGoal) toPush.linkedToGoal = toStr(e.linkedToGoal)
            events.push(toPush)
            existingEventKeys.add(key)
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

    const switchSuffix = willSwitchMatch ? ' (붙여넣은 날짜에 맞춰 경기 탭을 자동으로 전환했습니다)' : ''
    setBulkMsg(`✅ 초안에 적용 완료: ${deltas.size}명 (${playerNames.join(', ')}${deltas.size > 5 ? ' 외' : ''})${switchSuffix} - 아래 "💾 저장하기" 버튼을 눌러주세요!`)
  }

  const teams = useMemo(() => {
    if (!editingMatch) return []
    // If this is a referee-mode match with timeline, use the stored teams to avoid losing mapping
    if (Array.isArray(editingMatch?.teams) && editingMatch.teams.length > 0) {
      return editingMatch.teams
    }
    const hydrated = hydrateMatch(editingMatch, players)
    return hydrated.teams || []
  }, [editingMatch, players])

  const hasRefereeTimeline = useMemo(() => {
    if (!editingMatch) return false
    return Array.isArray(editingMatch?.stats?.__events) && editingMatch.stats.__events.length > 0
  }, [editingMatch])

  // 지난 경기이면서 기록이 있는지 확인 (오늘 진행중인 경기는 제외)
  const isPastMatchWithRecords = useMemo(() => {
    if (!editingMatch) return false
    
    // 오늘 날짜 기준으로 어제부터는 지난 경기
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const matchDate = new Date(editingMatch.dateISO || editingMatch.date || editingMatch.created_at)
    matchDate.setHours(0, 0, 0, 0)
    
    const isPast = matchDate < today
    if (!isPast) return false // 오늘 또는 미래 경기는 허용
    
    // 진행중 상태가 최근(24시간 이내)인지 확인
    const inProgressIsRecent = editingMatch.stats?.__inProgress?.lastUpdated
      ? (Date.now() - editingMatch.stats.__inProgress.lastUpdated) < 24 * 60 * 60 * 1000
      : false
    
    // 과거 경기인데 최근 진행중 상태면 허용 (이어서 할 수 있도록)
    if (inProgressIsRecent) return false
    
    // 기록이 있는지 확인 (stats 객체에 플레이어 기록이 있거나 quarterScores가 있으면 기록이 있는 것)
    const hasStats = editingMatch.stats && Object.keys(editingMatch.stats).some(key => 
      key !== '__inProgress' && 
      key !== '__events' && 
      key !== '__games' &&
      key !== 'gameEvents'
    )
    
    const hasScores = editingMatch.quarterScores && 
      Array.isArray(editingMatch.quarterScores) && 
      editingMatch.quarterScores.length > 0 &&
      editingMatch.quarterScores.some(q => Array.isArray(q) && q.length > 0)
    
    return hasStats || hasScores
  }, [editingMatch])

  const momMatchOptions = useMemo(() => {
    return (sortedMatches || []).filter(m => !isRefMatch(m)).map(m => {
      const count = extractAttendeeIds(m).length
      const label = typeof formatMatchLabel === 'function'
        ? formatMatchLabel(m, { withDate: true, withCount: true, count, t })
        : (m.label || m.title || m.name || `Match ${toStr(m.id)}`)
      return { value: toStr(m.id), label }
    })
  }, [sortedMatches, t])

  const momRoster = useMemo(() => {
    if (!momMatch) return []
    const attendeeIds = new Set(extractAttendeeIds(momMatch))
    return players.filter(p => attendeeIds.has(toStr(p.id)))
  }, [momMatch, players])

  const momTieBreakerScores = useMemo(() => {
    if (!momMatch) return null
    try {
      const statsByPlayer = extractStatsByPlayer(momMatch)
      return buildMoMTieBreakerScores(statsByPlayer, momMatch)
    } catch (err) {
      return null
    }
  }, [momMatch])

  const momSummary = useMemo(
    () => summarizeVotes(momVotes, { tieBreakerScores: momTieBreakerScores || undefined }),
    [momVotes, momTieBreakerScores]
  )

  const momOverride = momMatch?.draft?.momOverride || null
  const momPhase = momMatch ? getMoMPhase(momMatch) : 'hidden'
  const momOverrideLocked = momPhase === 'vote'

  const persistMomOverride = useCallback(async (overridePayload) => {
    if (!momMatch) return
    const currentDraft = momMatch.draft && typeof momMatch.draft === 'object' ? momMatch.draft : {}
    const nextDraft = { ...currentDraft }
    if (overridePayload) {
      nextDraft.momOverride = overridePayload
    } else {
      delete nextDraft.momOverride
    }
    try {
      await onUpdateMatch?.(momMatch.id, { draft: nextDraft })
    } catch (err) {
      throw err
    }
  }, [momMatch, onUpdateMatch])

  const handleMomAdminAddVote = async ({ playerId, note }) => {
    if (!momMatch?.id || !playerId) return
    try {
      await submitMoMVote({
        matchId: momMatch.id,
        playerId,
        voterLabel: note?.trim() || null,
        ipHash: null,
        visitorId: null
      })
      await refreshMoMVotes()
      notify('관리자 투표를 기록했어요.', 'success')
    } catch (err) {
      notify('관리자 투표 기록에 실패했습니다.', 'error')
    }
  }

  const handleMomAdminOverrideVote = async ({ playerId, note }) => {
    if (!momMatch?.id || !playerId) return
    if (momOverrideLocked) {
      notify('투표가 진행 중이라 MOM을 확정할 수 없습니다.', 'warning')
      return
    }
    try {
      await persistMomOverride({
        playerId,
        note: note?.trim() || '관리자 수동 확정',
        confirmedAt: new Date().toISOString(),
        source: 'admin',
      })
      notify('MOM 결과를 관리자 확정으로 저장했습니다.', 'success')
    } catch (err) {
      notify('MOM 결과 갱신에 실패했습니다.', 'error')
    }
  }

  const handleMomAdminDeleteVote = async (voteId) => {
    if (!voteId) return
    try {
      await deleteMoMVote(voteId)
      await refreshMoMVotes()
      notify('선택한 기록을 삭제했습니다.', 'success')
    } catch (err) {
      notify('기록 삭제에 실패했습니다.', 'error')
    }
  }

  const handleMomAdminResetVotes = async () => {
    if (!momMatch?.id) return
    try {
      await deleteMoMVotesByMatch(momMatch.id)
      if (momOverride) {
        await persistMomOverride(null)
      }
      await refreshMoMVotes()
      notify('MOM 투표 기록을 모두 삭제했습니다.', 'success')
    } catch (err) {
      notify('기록 삭제에 실패했습니다.', 'error')
    }
  }

  const handleMomAdminClearOverride = async () => {
    if (!momOverride) return
    try {
      await persistMomOverride(null)
      notify('관리자 확정을 해제했습니다.', 'success')
    } catch (err) {
      notify('확정 해제에 실패했습니다.', 'error')
    }
  }

  const handleMomManualToggle = async () => {
    if (!momMatch) return
    const current = momMatch.stats?.momManualOpen === true
    const next = !current
    
    const updatedStats = {
      ...(momMatch.stats || {}),
      momManualOpen: next
    }
    
    try {
      await onUpdateMatch(momMatch.id, { stats: updatedStats })
      notify(next ? '투표가 수동으로 활성화되었습니다.' : '투표 수동 활성화가 해제되었습니다.', 'success')
    } catch (err) {
      console.error(err)
      notify('설정 변경에 실패했습니다.', 'error')
    }
  }

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
              <div className="flex gap-2">
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
                        ? formatMatchLabel(m, { withDate: true, withCount: true, count, t })
                        : (m.label || m.title || m.name || `Match ${toStr(m.id)}`))
                    return (
                      <option key={toStr(m.id)} value={toStr(m.id)}>{label}</option>
                    )
                  })}
                </select>
              </div>
            </div>

            {/* Section Tabs */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'manual', label: '수동 입력' },
                  { key: 'bulk', label: '벌크 입력' },
                  { key: 'mom', label: '관리자 MoM' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setSectionTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-all border-2 ${
                      sectionTab === tab.key
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300 hover:text-blue-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {editingMatch && onStartRefereeMode && (
                <div className="ml-auto flex items-center gap-2">
                  {isPastMatchWithRecords ? (
                    <div className="text-xs text-gray-500 italic px-2">지난 경기 기록이 있어 심판모드 불가</div>
                  ) : editingMatch.stats?.__inProgress ? (
                    <button
                      onClick={() => {
                        const hydrated = hydrateMatch(editingMatch, players)
                        onStartRefereeMode(hydrated)
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all"
                      title="진행 중인 심판 모드로 돌아가기"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span>심판 모드 이어하기</span>
                      <span className="hidden sm:inline text-[11px] bg-white/20 rounded-full px-2 py-0.5">⏱️ 진행중</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const hydrated = hydrateMatch(editingMatch, players)
                        onStartRefereeMode(hydrated)
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all"
                      title="심판 모드로 바로 이동"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span>심판 모드</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bulk Input Section */}
            {sectionTab === 'bulk' && (
              <div className="mb-4 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border-2 border-amber-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <label className="text-sm font-bold text-gray-800">Bulk 입력 (빠른 입력)</label>
                  </div>
                  <div className="text-[11px] text-gray-500">붙여넣고 적용 → 수동 입력 탭에서 저장</div>
                </div>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder={bulkPlaceholder}
                  className="w-full h-32 rounded-lg border-2 border-amber-300 bg-white px-3 py-2 text-sm resize-vertical font-mono focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
                />
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
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
                    <span className="text-[11px] text-gray-500">적용 후 수동 입력 탭에서 💾 저장하기</span>
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
                  <div className="space-y-1 text-xs text-gray-600 bg-white/60 rounded px-2 py-1">
                    <div>
                      💡 <strong>[날짜]goal:assist[득점자 도움자]</strong> 형식으로 입력하면 듀오가 자동 연결됩니다<br />
                      💡 적용 후 <strong className="text-blue-700">수동 입력</strong> 탭에서 확인하고 <strong className="text-green-700">💾 저장하기</strong>
                    </div>
                    <div className="pt-1 border-t border-amber-200">
                      ⌚ <strong>Apple Watch 음성 Bulk 입력</strong>
                      <div className="mt-0.5 leading-relaxed">
                        1) 워치에서 <a href="https://www.icloud.com/shortcuts/085247e70699496cac2959a8ae377615" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">쇼컷 설치</a> 후 실행<br />
                        2) 이름 <strong>한 명만 말하면 골</strong> / <strong>두 명 말하면 첫 번째 골, 두 번째 어시스트</strong><br />
                        3) iPhone 동기화되면 미리알림 앱에 자동 생성:<br />
                        <code className="block bg-white/80 border border-gray-300 rounded px-2 py-1 mt-0.5 text-[11px] text-gray-700">[11/13/2025 9:16AM]goal:assist[김철수]<br />[11/13/2025 9:16AM]goal:assist[김철수 김영희]</code>
                        4) 복사 → Bulk 입력 → ✨ 적용 → 수동 입력 탭에서 💾 저장
                      </div>
                      <div className="mt-0.5 text-[10px] text-gray-500">
                        음성 인식으로 이름이 다르게 들어갈 수 있으니 <strong>앱 선수명과 일치</strong>하도록 수정 후 붙여넣으세요.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Stats Editor */}
            {sectionTab === 'manual' && (
              <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-3">
                {hasRefereeTimeline ? (
                  <RefereeTimelineEditor
                    match={editingMatch}
                    players={players}
                    teams={teams}
                    onSave={onUpdateMatch}
                    cardsEnabled={cardsFeatureEnabled}
                  />
                ) : (
                  <QuickStatsEditor
                    key={editingMatchId}
                    players={players}
                    editingMatch={editingMatch}
                    teams={teams}
                    draft={draft}
                    setDraft={setDraft}
                    resetAllRecords={resetAllRecords}
                    onSave={save}
                    showSaved={showSaved}
                    cardsEnabled={cardsEnabled}
                  />
                )}
              </div>
            )}
          </>
        )}
      </Card>
      {/* MoM admin panel: moved to its own 탭 */}
      {sectionTab === 'mom' && (
        momMatch ? (
          <MoMAdminPanel
            match={momMatch}
            matchOptions={momMatchOptions}
            selectedMatchId={toStr(momMatchId) || toStr(momMatch?.id || '')}
            onSelectMatch={(val) => {
              if (!val) return
              setMomMatchId(toStr(val))
            }}
            roster={momRoster}
            votes={momVotes}
            tally={momSummary.tally}
            totalVotes={momSummary.total}
            loading={momLoadingVotes}
            onAddVote={handleMomAdminAddVote}
            onOverrideVote={handleMomAdminOverrideVote}
            onDeleteVote={handleMomAdminDeleteVote}
            onResetVotes={handleMomAdminResetVotes}
            momOverride={momOverride}
            onClearOverride={handleMomAdminClearOverride}
            overrideLocked={momOverrideLocked}
            isRefMatch={isRefMatch(momMatch)}
            momManualOpen={momMatch?.stats?.momManualOpen === true}
            onToggleManualOpen={handleMomManualToggle}
            tieBreakMeta={{
              applied: momSummary.tieBreakApplied,
              category: momSummary.tieBreakCategory,
              requiresManual: momSummary.tieBreakRequiresManual,
              pendingCandidates: momSummary.tieBreakRequiresManual ? momSummary.winners : [],
            }}
          />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">MOM을 표시할 매치를 선택하세요.</div>
        )
      )}
    </div>
  )
}

/* ======== Quick Stats Editor Component ======== */
function QuickStatsEditor({ players, editingMatch, teams, draft, setDraft, resetAllRecords = () => {}, onSave, showSaved, cardsEnabled = true }) {
  const [showLinkPanel, setShowLinkPanel] = useState(false)
  const [addingGoalFor, setAddingGoalFor] = useState(null) // { playerId, teamIdx }
  const [addingAssistFor, setAddingAssistFor] = useState(null) // { playerId, teamIdx }
  const [statsTab, setStatsTab] = useState('attack') // attack | defense | discipline
  const [confirmState, setConfirmState] = useState({ open: false, kind: null })
  const [alertState, setAlertState] = useState({ open: false, title: '안내', message: '' })

  if (!editingMatch) return null

  const attendeeList = extractAttendeeIds(editingMatch)
  const hasAttendees = attendeeList.length > 0
  const attendeeIds = hasAttendees
    ? new Set(attendeeList)
    : new Set(teams.flat().map(p => toStr(p.id)).filter(Boolean))

  // Group by team - include all players if no attendeeIds (referee mode)
  const teamRosters = teams.map((team, idx) => ({
    idx,
    name: `팀 ${idx + 1}`,
    players: hasAttendees ? team.filter(p => attendeeIds.has(toStr(p.id))) : team
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
      const goalEvent = { type: 'goal', date: now, teamIndex: addingGoalFor?.teamIdx }
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
        arec.events.push({ type: 'assist', date: now, linkedToGoal: toStr(playerId), teamIndex: addingGoalFor?.teamIdx })
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
      const assistEvent = { type: 'assist', date: now, teamIndex: addingAssistFor?.teamIdx }
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
        grec.events.push({ type: 'goal', date: now, assistedBy: toStr(assisterId), teamIndex: addingAssistFor?.teamIdx })
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

  const resetAllCS = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev || {}))
      Object.keys(next).forEach(k => {
        if (next[k]) next[k].cleanSheet = 0
      })
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-900">수동 입력</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmState({ open: true, kind: 'reset-all' })}
            className="rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors"
          >
            모두 초기화
          </button>
          <button
            onClick={() => setShowLinkPanel(!showLinkPanel)}
            className="rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors"
          >
            {showLinkPanel ? '연결 닫기' : '연결 수정'}
          </button>
          <button
            onClick={onSave}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all"
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

      {/* Goal/Assist Adding Panel (inline, non-modal) */}
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

              const isSameTeam = teamIdx === addingGoalFor.teamIdx
              if (!isSameTeam) return null

              return (
                <div key={teamIdx} className={isSameTeam ? 'order-first' : ''}>
                  <div className={`text-[10px] font-bold mb-1.5 flex items-center gap-1.5 ${isSameTeam ? 'text-blue-700' : 'text-gray-500'}`}>
                    {team.name}
                    {isSameTeam && (
                      <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[9px] font-bold">
                        ⭐ 같은 팀
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {teamPlayers.map(p => {
                      const rec = draft[toStr(p.id)] || { goals: 0, assists: 0 }
                      return (
                        <button
                          key={toStr(p.id)}
                          onClick={() => addGoalWithAssist(addingGoalFor.playerId, p.id)}
                          className={`rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                            isSameTeam
                              ? 'border-blue-500 bg-white hover:bg-blue-50 shadow-sm'
                              : 'border-gray-400 bg-white hover:bg-gray-50 opacity-75 hover:opacity-100'
                          }`}
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

              const isSameTeam = teamIdx === addingAssistFor.teamIdx
              if (!isSameTeam) return null

              return (
                <div key={teamIdx} className={isSameTeam ? 'order-first' : ''}>
                  <div className={`text-[10px] font-bold mb-1.5 flex items-center gap-1.5 ${isSameTeam ? 'text-blue-700' : 'text-gray-500'}`}>
                    {team.name}
                    {isSameTeam && (
                      <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[9px] font-bold">
                        ⭐ 같은 팀
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {teamPlayers.map(p => {
                      const rec = draft[toStr(p.id)] || { goals: 0, assists: 0 }
                      return (
                        <button
                          key={toStr(p.id)}
                          onClick={() => addAssistForGoal(addingAssistFor.playerId, p.id)}
                          className={`rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                            isSameTeam
                              ? 'border-emerald-500 bg-white hover:bg-emerald-50 shadow-sm'
                              : 'border-gray-400 bg-white hover:bg-gray-50 opacity-75 hover:opacity-100'
                          }`}
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

      {/* Stats Grid - Compact Table Layout */}
      <div className={`grid gap-4 ${teamRosters.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {teamRosters.map(team => {
          // Resolve team color from editingMatch.teamColors or default palette
          const kitPalette = [
            { bg: '#f8fafc', text: '#0f172a', border: '#cbd5e1', label: 'White' },
            { bg: '#0f172a', text: '#ffffff', border: '#1e293b', label: 'Black' },
            { bg: '#3b82f6', text: '#ffffff', border: '#2563eb', label: 'Blue' },
            { bg: '#dc2626', text: '#ffffff', border: '#b91c1c', label: 'Red' },
            { bg: '#6dff2e', text: '#0f172a', border: '#5ce625', label: 'Green' },
            { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9', label: 'Purple' },
            { bg: '#ea580c', text: '#ffffff', border: '#c2410c', label: 'Orange' },
            { bg: '#0d9488', text: '#ffffff', border: '#0f766e', label: 'Teal' },
            { bg: '#ec4899', text: '#ffffff', border: '#db2777', label: 'Pink' },
            { bg: '#facc15', text: '#0f172a', border: '#eab308', label: 'Yellow' }
          ]
          const teamColor = (Array.isArray(editingMatch?.teamColors) && editingMatch.teamColors[team.idx] && typeof editingMatch.teamColors[team.idx] === 'object')
            ? editingMatch.teamColors[team.idx]
            : kitPalette[team.idx % kitPalette.length]
          
          const headerStyle = {
            backgroundColor: teamColor.bg,
            color: teamColor.text,
            borderColor: teamColor.border
          }
          
          return (
          <div key={team.idx} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div 
              className="px-4 py-3 font-semibold text-sm flex items-center justify-between"
              style={headerStyle}
            >
              <span className="flex items-center gap-2">
                <span>{teamColor.label}</span>
                <span className="opacity-75">·</span>
                <span className="font-normal opacity-90">{team.name}</span>
              </span>
              <span className="text-xs font-normal opacity-80">{team.players.length}명</span>
            </div>
            {/* Tab Navigation */}
            <div className="flex gap-1 mb-3 border-b border-gray-200">
              <button
                onClick={() => setStatsTab('attack')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  statsTab === 'attack'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                ⚽ 공격
              </button>
              <button
                onClick={() => setStatsTab('defense')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  statsTab === 'defense'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                🛡️ 수비
              </button>
              {cardsEnabled && (
                <button
                  onClick={() => setStatsTab('discipline')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    statsTab === 'discipline'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🟨 경고
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr className="text-[11px] text-gray-500 font-medium">
                    <th className="px-3 py-2.5 text-left">선수</th>
                    {statsTab === 'attack' && (
                      <>
                        <th className="px-2 py-2.5 text-center min-w-[80px]">⚽ Goals</th>
                        <th className="px-2 py-2.5 text-center min-w-[80px]">🅰️ Assists</th>
                      </>
                    )}
                    {statsTab === 'defense' && (
                      <th className="px-2 py-2.5 text-center min-w-[100px]">🧤 Clean Sheet</th>
                    )}
                    {statsTab === 'discipline' && cardsEnabled && (
                      <>
                        <th className="px-2 py-2.5 text-center min-w-[80px]">🟨 Yellow</th>
                        <th className="px-2 py-2.5 text-center min-w-[80px]">🟥 Red</th>
                        <th className="px-2 py-2.5 text-center min-w-[80px]">⬛ Black</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {team.players.map(p => {
                    const rec = draft[toStr(p.id)] || { goals: 0, assists: 0, cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
                    const hasCardStats = cardsEnabled && (rec.yellowCards > 0 || rec.redCards > 0 || rec.blackCards > 0)
                    const hasAttackStats = (rec.goals > 0 || rec.assists > 0)
                    const hasDefenseStats = rec.cleanSheet > 0
                    const hasDisciplineStats = hasCardStats
                    
                    let hasCurrentTabStats = false
                    if (statsTab === 'attack') hasCurrentTabStats = hasAttackStats
                    if (statsTab === 'defense') hasCurrentTabStats = hasDefenseStats
                    if (statsTab === 'discipline') hasCurrentTabStats = hasDisciplineStats

                    return (
                      <tr key={toStr(p.id)} className={`transition-colors ${hasCurrentTabStats ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}`}>
                        {/* Player Info - Responsive Width */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 min-w-0">
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
                            <div className="min-w-0 max-w-[80px] overflow-x-auto scrollbar-hide">
                              <div className="font-semibold text-sm text-gray-800 whitespace-nowrap" title={p.name}>{p.name}</div>
                              {(p.position || p.pos) && (
                                <div className="text-[11px] text-gray-500 whitespace-nowrap">{p.position || p.pos}</div>
                              )}
                            </div>
                            {/* Stats badge indicators */}
                            <div className="flex gap-1">
                              {rec.goals > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                  {rec.goals}
                                </span>
                              )}
                              {rec.assists > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                                  {rec.assists}
                                </span>
                              )}
                              {rec.cleanSheet > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold">
                                  CS
                                </span>
                              )}
                              {rec.yellowCards > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-yellow-400 text-white text-[10px] font-bold">
                                  Y
                                </span>
                              )}
                              {rec.redCards > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-500 text-white text-[10px] font-bold">
                                  R
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        
                        {/* Attack Tab */}
                        {statsTab === 'attack' && (
                          <>
                            <td className="px-2 py-2">
                              <CompactCounter
                                value={rec.goals || 0}
                                onInc={() => addGoal(p.id, team.idx)}
                                onDec={() => removeGoal(p.id)}
                                color="emerald"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <CompactCounter
                                value={rec.assists || 0}
                                onInc={() => addAssist(p.id, team.idx)}
                                onDec={() => removeAssist(p.id)}
                                color="amber"
                              />
                            </td>
                          </>
                        )}
                        
                        {/* Defense Tab */}
                        {statsTab === 'defense' && (
                          <td className="px-2 py-2">
                            <CompactCounterCS player={p} draft={draft} setDraft={setDraft} />
                          </td>
                        )}
                        
                        {/* Discipline Tab */}
                        {statsTab === 'discipline' && cardsEnabled && (
                          <>
                            <td className="px-2 py-2">
                              <CompactCounterYC player={p} draft={draft} setDraft={setDraft} />
                            </td>
                            <td className="px-2 py-2">
                              <CompactCounterRC player={p} draft={draft} setDraft={setDraft} />
                            </td>
                            <td className="px-2 py-2">
                              <CompactCounterBC player={p} draft={draft} setDraft={setDraft} />
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
        })}

        {teamRosters.length === 0 && (
          <div className="col-span-2 text-center py-8 text-gray-500 text-sm">
            팀 정보가 없습니다
          </div>
        )}
      </div>
      {/* Confirm/Alert Dialogs */}
      <ConfirmDialog
        open={confirmState.open && confirmState.kind === 'reset-all'}
        title="초기화 확인"
        message="모든 골/어시스트 기록을 초기화하시겠습니까?"
        confirmLabel="초기화"
        cancelLabel="취소"
        tone="danger"
        onCancel={() => setConfirmState({ open: false, kind: null })}
        onConfirm={() => { resetAllRecords(); setConfirmState({ open: false, kind: null }) }}
      />
      <ConfirmDialog
        open={alertState.open}
        title={alertState.title}
        message={alertState.message}
        confirmLabel="확인"
        cancelLabel={null}
        tone="default"
        onConfirm={() => setAlertState({ open: false, title: '안내', message: '' })}
      />
    </div>
  )
}

/* ======== Compact Counter Components ======== */

// Generic compact counter (horizontal layout)
function CompactCounter({ value, onInc, onDec, color = 'emerald' }) {
  const hasValue = value > 0
  const isGoal = color === 'emerald'

  const colorClasses = isGoal
    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 border-emerald-500 hover:border-emerald-600 text-white shadow-md hover:shadow-emerald-300'
    : 'bg-gradient-to-r from-blue-400 to-blue-500 hover:from-blue-500 hover:to-blue-600 border-blue-500 hover:border-blue-600 text-white shadow-md hover:shadow-blue-300'

  return (
    <div className="flex items-center gap-0.5 justify-center">
      <button
        onClick={onDec}
        disabled={value <= 0}
        className="w-5 h-5 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-800 text-sm font-bold transition-all active:scale-90"
      >
        −
      </button>
      <div className={`min-w-[24px] px-1 flex items-center justify-center font-bold text-sm tabular-nums ${hasValue ? (isGoal ? 'text-emerald-600' : 'text-blue-600') : 'text-gray-400'}`}>
        {value}
      </div>
      <button
        onClick={onInc}
        className={`w-5 h-5 rounded border flex items-center justify-center text-sm font-bold transition-all active:scale-90 ${colorClasses}`}
      >
        +
      </button>
    </div>
  )
}

function CompactCounterCS({ player, draft, setDraft }) {
  const pid = toStr(player.id)
  const rec = draft[pid] || { cleanSheet: 0 }
  const value = Number(rec.cleanSheet || 0)
  const hasValue = value > 0

  const inc = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.cleanSheet = Math.max(0, Number(base.cleanSheet || 0) + 1)
      next[pid] = base
      return next
    })
  }

  const dec = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.cleanSheet = Math.max(0, Number(base.cleanSheet || 0) - 1)
      next[pid] = base
      return next
    })
  }

  return (
    <div className="flex items-center gap-0.5 justify-center">
      <button
        onClick={dec}
        disabled={value <= 0}
        className="w-5 h-5 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-800 text-sm font-bold transition-all active:scale-90"
      >
        −
      </button>
      <div className={`min-w-[24px] px-1 flex items-center justify-center font-bold text-sm tabular-nums ${hasValue ? 'text-sky-600' : 'text-gray-400'}`}>
        {value}
      </div>
      <button
        onClick={inc}
        className="w-5 h-5 rounded border bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 border-sky-500 hover:border-sky-600 text-white shadow-md hover:shadow-sky-300 flex items-center justify-center text-sm font-bold transition-all active:scale-90"
      >
        +
      </button>
    </div>
  )
}

function CompactCounterYC({ player, draft, setDraft }) {
  const pid = toStr(player.id)
  const rec = draft[pid] || { yellowCards: 0 }
  const value = Number(rec.yellowCards || 0)
  const hasValue = value > 0

  const inc = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.yellowCards = Math.max(0, Number(base.yellowCards || 0) + 1)
      next[pid] = base
      return next
    })
  }

  const dec = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.yellowCards = Math.max(0, Number(base.yellowCards || 0) - 1)
      next[pid] = base
      return next
    })
  }

  return (
    <div className="flex items-center gap-0.5 justify-center">
      <button
        onClick={dec}
        disabled={value <= 0}
        className="w-5 h-5 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-800 text-sm font-bold transition-all active:scale-90"
      >
        −
      </button>
      <div className={`min-w-[24px] px-1 flex items-center justify-center font-bold text-sm tabular-nums ${hasValue ? 'text-yellow-600' : 'text-gray-400'}`}>
        {value}
      </div>
      <button
        onClick={inc}
        className="w-5 h-5 rounded border bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 border-yellow-500 hover:border-yellow-600 text-white shadow-md hover:shadow-yellow-300 flex items-center justify-center text-sm font-bold transition-all active:scale-90"
      >
        +
      </button>
    </div>
  )
}

function CompactCounterRC({ player, draft, setDraft }) {
  const pid = toStr(player.id)
  const rec = draft[pid] || { redCards: 0 }
  const value = Number(rec.redCards || 0)
  const hasValue = value > 0

  const inc = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.redCards = Math.max(0, Number(base.redCards || 0) + 1)
      next[pid] = base
      return next
    })
  }

  const dec = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.redCards = Math.max(0, Number(base.redCards || 0) - 1)
      next[pid] = base
      return next
    })
  }

  return (
    <div className="flex items-center gap-0.5 justify-center">
      <button
        onClick={dec}
        disabled={value <= 0}
        className="w-5 h-5 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-800 text-sm font-bold transition-all active:scale-90"
      >
        −
      </button>
      <div className={`min-w-[24px] px-1 flex items-center justify-center font-bold text-sm tabular-nums ${hasValue ? 'text-red-600' : 'text-gray-400'}`}>
        {value}
      </div>
      <button
        onClick={inc}
        className="w-5 h-5 rounded border bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 border-red-600 hover:border-red-700 text-white shadow-md hover:shadow-red-300 flex items-center justify-center text-sm font-bold transition-all active:scale-90"
      >
        +
      </button>
    </div>
  )
}

function CompactCounterBC({ player, draft, setDraft }) {
  const pid = toStr(player.id)
  const rec = draft[pid] || { blackCards: 0 }
  const value = Number(rec.blackCards || 0)
  const hasValue = value > 0

  const inc = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.blackCards = Math.max(0, Number(base.blackCards || 0) + 1)
      next[pid] = base
      return next
    })
  }

  const dec = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.blackCards = Math.max(0, Number(base.blackCards || 0) - 1)
      next[pid] = base
      return next
    })
  }

  return (
    <div className="flex items-center gap-0.5 justify-center">
      <button
        onClick={dec}
        disabled={value <= 0}
        className="w-5 h-5 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-800 text-sm font-bold transition-all active:scale-90"
      >
        −
      </button>
      <div className={`min-w-[24px] px-1 flex items-center justify-center font-bold text-sm tabular-nums ${hasValue ? 'text-gray-800' : 'text-gray-400'}`}>
        {value}
      </div>
      <button
        onClick={inc}
        className="w-5 h-5 rounded border bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 border-gray-700 hover:border-gray-900 text-white shadow-md hover:shadow-gray-400 flex items-center justify-center text-sm font-bold transition-all active:scale-90"
      >
        +
      </button>
    </div>
  )
}

/* ======== Clean Sheet Counter (Legacy - kept for compatibility) ======== */
function CleanSheetCounter({ player, teamIdx, draft, setDraft }) {
  const pid = toStr(player.id)
  const rec = draft[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0 }

  const dec = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0 }
      base.cleanSheet = Math.max(0, Number(base.cleanSheet || 0) - 1)
      next[pid] = base
      return next
    })
  }

  const inc = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0 }
      base.cleanSheet = Math.max(0, Number(base.cleanSheet || 0) + 1)
      next[pid] = base
      return next
    })
  }

  return (
  <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1.5 py-1 shrink-0" title="클린시트 (수동 입력)">
      <button
        onClick={dec}
        disabled={!rec.cleanSheet || rec.cleanSheet <= 0}
        className="w-6 h-6 rounded bg-white border border-gray-300 hover:border-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 flex items-center justify-center text-gray-600 hover:text-red-600 font-bold text-[11px] transition-all"
      >
        −
      </button>
      <div className="flex items-center gap-0.5 px-1">
        <span className="text-[11px] font-bold text-gray-600">CS</span>
        <span className="w-5 text-center font-bold text-[12px] tabular-nums">{Number(rec.cleanSheet || 0)}</span>
      </div>
      <button
        onClick={inc}
        className="w-6 h-6 rounded bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 flex items-center justify-center text-white font-bold text-[11px] transition-all shadow-sm"
      >
        +
      </button>
    </div>
  )
}

function YellowCardCounter({ player, draft, setDraft }) {
  const pid = toStr(player.id)
  const rec = draft[pid] || { yellowCards: 0 }

  const dec = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.yellowCards = Math.max(0, Number(base.yellowCards || 0) - 1)
      next[pid] = base
      return next
    })
  }

  const inc = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.yellowCards = Math.max(0, Number(base.yellowCards || 0) + 1)
      next[pid] = base
      return next
    })
  }

  return (
    <div className="flex items-center gap-1 bg-yellow-50 rounded-lg px-1.5 py-1 shrink-0 border border-yellow-300" title="옐로우 카드">
      <button
        onClick={dec}
        disabled={!rec.yellowCards || rec.yellowCards <= 0}
        className="w-6 h-6 rounded bg-white border border-gray-300 hover:border-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 flex items-center justify-center text-gray-600 hover:text-red-600 font-bold text-[11px] transition-all"
      >
        −
      </button>
      <div className="flex items-center gap-0.5 px-1">
        <span className="text-[11px] font-bold text-yellow-700">YC</span>
        <span className="w-5 text-center font-bold text-[12px] tabular-nums text-yellow-800">{Number(rec.yellowCards || 0)}</span>
      </div>
      <button
        onClick={inc}
        className="w-6 h-6 rounded bg-yellow-500 hover:bg-yellow-600 border border-yellow-600 flex items-center justify-center text-white font-bold text-[11px] transition-all shadow-sm"
      >
        +
      </button>
    </div>
  )
}

function RedCardCounter({ player, draft, setDraft }) {
  const pid = toStr(player.id)
  const rec = draft[pid] || { redCards: 0 }

  const dec = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.redCards = Math.max(0, Number(base.redCards || 0) - 1)
      next[pid] = base
      return next
    })
  }

  const inc = () => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const base = next[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0, yellowCards: 0, redCards: 0, blackCards: 0 }
      base.redCards = Math.max(0, Number(base.redCards || 0) + 1)
      next[pid] = base
      return next
    })
  }

  return (
    <div className="flex items-center gap-1 bg-rose-50 rounded-lg px-1.5 py-1 shrink-0 border border-rose-300" title="레드 카드">
      <button
        onClick={dec}
        disabled={!rec.redCards || rec.redCards <= 0}
        className="w-6 h-6 rounded bg-white border border-gray-300 hover:border-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 flex items-center justify-center text-gray-600 hover:text-red-600 font-bold text-[11px] transition-all"
      >
        −
      </button>
      <div className="flex items-center gap-0.5 px-1">
        <span className="text-[11px] font-bold text-rose-700">RC</span>
        <span className="w-5 text-center font-bold text-[12px] tabular-nums text-rose-800">{Number(rec.redCards || 0)}</span>
      </div>
      <button
        onClick={inc}
        className="w-6 h-6 rounded bg-rose-500 hover:bg-rose-600 border border-rose-600 flex items-center justify-center text-white font-bold text-[11px] transition-all shadow-sm"
      >
        +
      </button>
    </div>
  )
}

function GoalAssistLinkingPanel({ players, draft, setDraft, teams }) {
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [selectedAssist, setSelectedAssist] = useState(null)
  const [alertState, setAlertState] = useState({ open: false, title: '안내', message: '' })

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
      setAlertState({ open: true, title: '안내', message: '자기 자신에게 어시스트할 수 없습니다' })
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
      
      {/* Alert Dialog */}
      <ConfirmDialog
        open={alertState.open}
        title={alertState.title}
        message={alertState.message}
        confirmLabel="확인"
        cancelLabel={null}
        tone="default"
        onConfirm={() => setAlertState({ open: false, title: '안내', message: '' })}
      />
    </div>
  )
}
