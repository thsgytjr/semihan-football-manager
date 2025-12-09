// src/lib/gameEvents.js
// Compute per-game goal/assist mapping from stats + quarter scores

const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

function parseTs(raw) {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw).trim()
  if (!s) return null

  // Time-only formats (mm:ss, m:ss, HH:MM(:SS), optional AM/PM)
  const timeOnly = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*$/
  const mt = s.match(timeOnly)
  if (mt) {
    let hour = Number(mt[1]) || 0
    const minute = Number(mt[2]) || 0
    const second = Number(mt[3] || 0) || 0
    const ampm = mt[4]
    if (ampm) {
      const upper = ampm.toUpperCase()
      if (upper === 'PM' && hour < 12) hour += 12
      if (upper === 'AM' && hour === 12) hour = 0
    }
    return ((hour * 3600) + (minute * 60) + second) * 1000 // ms
  }

  const parsed = Date.parse(s)
  if (Number.isFinite(parsed)) return parsed

  const maybeSeconds = Number(s)
  if (Number.isFinite(maybeSeconds)) {
    if (maybeSeconds < 10_000_000) return maybeSeconds * 1000 // seconds → ms
    return maybeSeconds
  }
  return null
}

function minuteLabelFromTs(ts) {
  if (!Number.isFinite(ts)) return ''
  // If within a day, treat as time-of-day; otherwise use HH:MM from date
  const dayMs = 24 * 60 * 60 * 1000
  if (ts < dayMs) {
    const totalMin = Math.floor(ts / 60000)
    const sec = Math.floor((ts % 60000) / 1000)
    return `${totalMin}:${String(sec).padStart(2, '0')}`
  }
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function getQuarterScores(match) {
  if (match?.draft && Array.isArray(match.draft.quarterScores)) return match.draft.quarterScores
  if (Array.isArray(match?.quarterScores)) return match.quarterScores
  return []
}

function buildPlayerTeamMap(match, players) {
  const snap = Array.isArray(match?.snapshot) ? match.snapshot : []
  const map = new Map()
  snap.forEach((team, ti) => {
    if (!Array.isArray(team)) return
    team.forEach(pid => map.set(toStr(pid), ti))
  })
  if (map.size === 0 && Array.isArray(players)) {
    players.forEach(p => {
      if (p.teamIndex != null) map.set(toStr(p.id), Number(p.teamIndex))
    })
  }
  return map
}

function collectEvents(match) {
  const stats = match?.stats || {}
  const eventsByTeam = []
  const playerTeamMap = buildPlayerTeamMap(match, match?.players || [])
  let globalOrder = 0

  for (const [pidRaw, rec] of Object.entries(stats)) {
    if (String(pidRaw).startsWith('__')) continue
    const pid = toStr(pidRaw)
    if (!pid) continue
    const teamIdx = playerTeamMap.get(pid)
    if (teamIdx === undefined || teamIdx === null) continue
    const evs = Array.isArray(rec?.events) ? rec.events : []
    const seen = new Set()
    evs.forEach((ev, idx) => {
      const type = String(ev?.type || ev?.event || '').toLowerCase()
      const isGoal = type.includes('goal') || type === 'g'
      const isAssistOnly = type.includes('assist') && !isGoal
      if (!isGoal && !isAssistOnly) return
      const ts = parseTs(ev.dateISO || ev.date || ev.ts || ev.time)
      const assistedBy = ev.assistedBy ? toStr(ev.assistedBy) : null
      const key = `${isGoal ? 'g' : 'a'}|${pid}|${assistedBy || ''}|${Number.isFinite(ts) ? ts : 'na'}`
      if (seen.has(key)) return
      seen.add(key)
      if (!eventsByTeam[teamIdx]) eventsByTeam[teamIdx] = []
      eventsByTeam[teamIdx].push({
        pid,
        kind: isGoal ? 'goal' : 'assist-only',
        assistedBy,
        ts,
        minuteLabel: minuteLabelFromTs(ts),
        order: idx,
        globalOrder: globalOrder++,
      })
    })
  }

  return eventsByTeam.map(list => list || [])
}

function sortEvents(arr) {
  return arr.sort((a, b) => {
    const aHas = Number.isFinite(a.ts)
    const bHas = Number.isFinite(b.ts)
    if (aHas && bHas && a.ts !== b.ts) return a.ts - b.ts
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    const kindOrder = { goal: 0, 'assist-only': 1 }
    const ka = kindOrder[a.kind] ?? 0
    const kb = kindOrder[b.kind] ?? 0
    if (ka !== kb) return ka - kb
    if (a.globalOrder !== b.globalOrder) return a.globalOrder - b.globalOrder
    if (a.order !== b.order) return a.order - b.order
    return 0
  })
}

export function computeGameEvents(match, players = []) {
  const quarterScores = getQuarterScores(match)
  const teamCount = Math.max(match?.teamCount || 0, quarterScores.length || 0, Array.isArray(match?.snapshot) ? match.snapshot.length : 0, 2)

  // If referee-mode timeline exists, prefer it for accurate per-game details
  const timeline = Array.isArray(match?.stats?.__events) ? match.stats.__events : []
  const hasTimeline = timeline.length > 0

  if (hasTimeline) {
    return timeline
      .filter(ev => ev && (ev.type === 'goal' || ev.type === 'own_goal' || ev.type === 'foul' || ev.type === 'yellow' || ev.type === 'red' || ev.type === 'super_save'))
      .map((ev, idx) => {
        const gameIndex = Number(ev.gameIndex ?? 0)
        const scoringTeam = ev.type === 'own_goal'
          ? (ev.teamIndex === 0 ? 1 : 0)
          : (ev.teamIndex ?? 0)
        return {
          id: ev.id || `${gameIndex}-${scoringTeam}-${idx}`,
          gameIndex,
          teamIndex: scoringTeam,
          scorerId: toStr(ev.playerId),
          assistId: ev.assistedBy ? toStr(ev.assistedBy) : '',
          ownGoal: ev.type === 'own_goal',
          eventType: ev.type,
          minute: ev.minute ? String(ev.minute) : '',
        }
      })
  }
  const eventsByTeam = collectEvents({ ...match, players })
  const byTeam = Array.from({ length: teamCount }, (_, i) => sortEvents(eventsByTeam[i] ? [...eventsByTeam[i]] : []))

  // Determine effective game count: ignore trailing 0-0 games
  let lastNonZeroIdx = -1
  quarterScores.forEach(teamArr => {
    if (!Array.isArray(teamArr)) return
    teamArr.forEach((val, idx) => {
      const num = Number(val)
      if (Number.isFinite(num) && num > 0) {
        lastNonZeroIdx = Math.max(lastNonZeroIdx, idx)
      }
    })
  })
  const maxGames = Math.max(1, lastNonZeroIdx + 1)
  const result = []

  for (let ti = 0; ti < teamCount; ti++) {
    const queue = byTeam[ti]
    for (let gi = 0; gi < maxGames; gi++) {
      const scoreRaw = quarterScores?.[ti]?.[gi]
      const score = Number(scoreRaw || 0)
      if (!Number.isFinite(score) || score <= 0) continue

      const goals = queue.filter(e => e.kind === 'goal')

      const takeGoals = goals.slice(0, score)
      const missing = Math.max(0, score - takeGoals.length)

      takeGoals.forEach((ev, idx) => {
        result.push({
          id: `${gi}-${ti}-g-${idx}-${ev.pid}`,
          gameIndex: gi,
          teamIndex: ti,
          scorerId: ev.pid,
          assistId: ev.assistedBy || '',
          ownGoal: false,
          minute: ev.minuteLabel || '',
        })
      })

      for (let k = 0; k < missing; k++) {
        result.push({
          id: `${gi}-${ti}-missing-${k}`,
          gameIndex: gi,
          teamIndex: ti,
          scorerId: '', // unknown scorer
          assistId: '',
          ownGoal: false,
          minute: '',
        })
      }

      // consume exactly the events we used (do not pop unrelated later events)
      const used = new Set([...takeGoals])
      const remainingQueue = queue.filter(ev => !used.has(ev))
      queue.length = 0
      queue.push(...remainingQueue)
    }
  }

  return result
}

export default computeGameEvents
