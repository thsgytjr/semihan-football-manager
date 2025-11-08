// src/lib/leaderboardComputations.js
// Computation functions for leaderboard data aggregation and ranking

import { toStr, isMember, extractAttendeeIds, extractStatsByPlayer } from './matchUtils'
import * as MatchHelpers from './matchHelpers'

/* --------------------- Attack Points Computation --------------------- */

/**
 * Compute attack points leaderboard rows
 * Aggregates goals, assists, and match appearances per player
 */
export function computeAttackRows(players = [], matches = []) {
  const index = new Map()
  const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
  
  for (const m of (matches || [])) {
    const attendedIds = new Set(extractAttendeeIds(m))
    const statsMap = extractStatsByPlayer(m)
    
    // Track appearances
    for (const pid of attendedIds) {
      const p = idToPlayer.get(pid)
      if (!p) continue
      const row = index.get(pid) || {
        id: pid, 
        name: p.name, 
        membership: p.membership || '',
        photoUrl: p.photoUrl || null,
        gp: 0, 
        g: 0, 
        a: 0
      }
      row.gp += 1
      index.set(pid, row)
    }
    
    // Track goals and assists
    for (const [pid, rec] of Object.entries(statsMap)) {
      const p = idToPlayer.get(pid)
      if (!p) continue
      const row = index.get(pid) || {
        id: pid, 
        name: p.name, 
        membership: p.membership || '',
        photoUrl: p.photoUrl || null,
        gp: 0, 
        g: 0, 
        a: 0
      }
      row.g += Number(rec?.goals || 0)
      row.a += Number(rec?.assists || 0)
      index.set(pid, row)
    }
  }
  
  return [...index.values()]
    .filter(r => r.gp > 0)
    .map(r => ({ 
      ...r, 
      pts: r.g + r.a, 
      isGuest: !isMember(r.membership) 
    }))
}

/**
 * Sort comparator for attack point rankings
 */
export function sortComparator(rankBy) {
  if (rankBy === 'g') {
    return (a, b) => (b.g - a.g) || (b.pts - a.pts) || (b.a - a.a) || (b.gp - a.gp) || a.name.localeCompare(b.name)
  }
  if (rankBy === 'a') {
    return (a, b) => (b.a - a.a) || (b.pts - a.pts) || (b.g - a.g) || (b.gp - a.gp) || a.name.localeCompare(b.name)
  }
  if (rankBy === 'gp') {
    return (a, b) => (b.gp - a.gp) || (b.pts - a.pts) || (b.g - a.g) || (b.a - a.a) || a.name.localeCompare(b.name)
  }
  // Default: pts > g > a > gp > name
  return (a, b) => (b.pts - a.pts) || (b.g - a.g) || (b.a - a.a) || (b.gp - a.gp) || a.name.localeCompare(b.name)
}

/**
 * Add rank numbers to sorted rows
 */
export function addRanks(rows, rankBy) {
  const sorted = [...rows].sort(sortComparator(rankBy))
  let lastRank = 0
  let lastKey = null
  
  return sorted.map((r, i) => {
    // For 동점자(동순위), rank는 해당 항목만 비교, 오더는 sort 순서 유지
    let keyVal
    if (rankBy === 'g') keyVal = r.g
    else if (rankBy === 'a') keyVal = r.a
    else if (rankBy === 'gp') keyVal = r.gp
    else keyVal = r.pts
    const rank = (i === 0) ? 1 : (keyVal === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = keyVal
    return { ...r, rank }
  })
}

/* --------------------- Duo Computation --------------------- */

/**
 * Parse loose date format from event string
 */
function parseLooseDate(s) {
  if (!s) return NaN
  if (typeof s === 'number') return Number.isFinite(s) ? s : NaN
  const inBracket = /\[([^\]]+)\]/.exec(String(s))
  const cand = inBracket ? inBracket[1] : String(s)
  const t = Date.parse(cand)
  return Number.isNaN(t) ? NaN : t
}

/**
 * Infer event type from raw string
 */
function inferTypeFromRaw(raw) {
  const s = (raw || '').toString()
  if (/goal/i.test(s)) return 'goal'
  if (/assist/i.test(s)) return 'assist'
  if (/[⚽️]/.test(s)) return 'goal'
  if (/[🤟]/.test(s)) return 'assist'
  return null
}

/**
 * Extract timeline events from match for duo computation
 */
export function extractTimelineEventsFromMatch(m) {
  const stats = extractStatsByPlayer(m)
  const out = []
  let seq = 0
  
  for (const [pid, rec] of Object.entries(stats)) {
    const arr = Array.isArray(rec?.events) ? rec.events : []
    for (const e of arr) {
      let type = e?.type
      if (!type) type = inferTypeFromRaw(e?.date)
      type = type === 'goals' ? 'goal' : (type === 'assists' ? 'assist' : type)
      if (type !== 'goal' && type !== 'assist') continue
      const ts = parseLooseDate(e?.date)
      out.push({ 
        pid: toStr(pid), 
        type, 
        ts: Number.isNaN(ts) ? 0 : ts, 
        rawIdx: seq++, 
        raw: e 
      })
    }
  }
  
  const extraText = m?.log || m?.events || m?.notes || ''
  if (typeof extraText === 'string' && extraText.trim()) {
    const lines = extraText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    for (const line of lines) {
      const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g)).map(mm => mm[1])
      if (bracketMatches.length >= 2) {
        const dateStr = bracketMatches[0]
        const namesField = bracketMatches[bracketMatches.length - 1]
        const between = line.replace(/\[([^\]]+)\]/g, '¤').split('¤')[1] || ''
        const ts = parseLooseDate(dateStr)
        const hasBoth = /goal\s*:\s*assist/i.test(between)
        
        if (hasBoth) {
          const parts = String(namesField || '').trim().split(/\s+/).filter(Boolean)
          if (parts.length >= 2) {
            const scorer = parts[0]
            const assister = parts[parts.length - 1]
            out.push({ 
              pid: `__name__:${scorer}`, 
              type: 'goal', 
              ts: Number.isNaN(ts) ? 0 : ts, 
              rawIdx: seq++, 
              raw: line 
            })
            out.push({ 
              pid: `__name__:${assister}`, 
              type: 'assist', 
              ts: Number.isNaN(ts) ? 0 : ts, 
              rawIdx: seq++, 
              raw: line 
            })
          }
        } else {
          let type = null
          if (/\bgoal\b/i.test(between) || /[⚽️]/.test(line)) type = 'goal'
          else if (/\bassist\b/i.test(between) || /[👉☝👆]/.test(line)) type = 'assist'
          const name = namesField
          if (type && name) {
            out.push({ 
              pid: `__name__:${name}`, 
              type, 
              ts: Number.isNaN(ts) ? 0 : ts, 
              rawIdx: seq++, 
              raw: line 
            })
          }
        }
      }
    }
  }
  
  return out
}

/**
 * Compute duo (assist→goal pairs) leaderboard rows
 */
export function computeDuoRows(players = [], matches = []) {
  const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
  const nameToId = new Map(players.map(p => [toStr(p.name).trim().toLowerCase(), toStr(p.id)]))
  
  let evts = []
  for (const m of (matches || [])) {
    evts = evts.concat(extractTimelineEventsFromMatch(m))
  }
  
  evts.forEach(e => {
    if (e.pid?.startsWith('__name__:')) {
      const name = e.pid.slice('__name__:'.length).trim().toLowerCase()
      const pid = nameToId.get(name)
      if (pid) e.pid = pid
    }
  })
  
  evts = evts.filter(e => idToPlayer.has(toStr(e.pid)))
  
  const typePri = (t) => (t === 'goal' ? 0 : 1)
  evts.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts
    if (typePri(a.type) !== typePri(b.type)) return typePri(a.type) - typePri(b.type)
    return a.rawIdx - b.rawIdx
  })
  
  const unmatchedGoals = []
  const duoCount = new Map()
  
  for (const e of evts) {
    if (e.type === 'goal') {
      unmatchedGoals.push(e)
    } else if (e.type === 'assist') {
      while (unmatchedGoals.length > 0) {
        const g = unmatchedGoals.pop()
        if (toStr(g.pid) === toStr(e.pid)) continue
        const key = `${toStr(e.pid)}|${toStr(g.pid)}`
        duoCount.set(key, (duoCount.get(key) || 0) + 1)
        break
      }
    }
  }
  
  const rows = []
  for (const [key, cnt] of duoCount.entries()) {
    const [assistId, goalId] = key.split('|')
    const aP = idToPlayer.get(assistId)
    const gP = idToPlayer.get(goalId)
    if (!aP || !gP) continue
    
    rows.push({
      id: key,
      assistId,
      goalId,
      duoLabel: `${aP.name} → ${gP.name}`,
      aName: aP.name,
      gName: gP.name,
      aPhotoUrl: aP.photoUrl || null,
      gPhotoUrl: gP.photoUrl || null,
      aMembership: aP.membership || '',
      gMembership: gP.membership || '',
      count: cnt,
      aIsGuest: !isMember(aP.membership),
      gIsGuest: !isMember(gP.membership)
    })
  }
  
  rows.sort((x, y) => (y.count - x.count) || x.duoLabel.localeCompare(y.duoLabel))
  
  let lastRank = 0
  let lastKey = null
  const ranked = rows.map((r, i) => {
    const keyVal = r.count
    const rank = (i === 0) ? 1 : (keyVal === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = keyVal
    return { ...r, rank }
  })
  
  return ranked
}

/* --------------------- Draft Match Utilities --------------------- */

/**
 * Extract quarter scores from match object
 */
/**
 * Get quarter scores from match (supports legacy formats)
 * @deprecated Use MatchHelpers.getQuarterScores instead
 * @param {Object} m - Match object
 * @returns {Array<Array<number>>|null} Quarter scores
 */
export function coerceQuarterScores(m) {
  // ✅ 헬퍼 사용 - 기존 로직과 100% 동일하지만 중앙화됨
  const result = MatchHelpers.getQuarterScores(m)
  return result.length > 0 ? result : null
}

/**
 * Check if match is a draft match
 * @deprecated Use MatchHelpers.isDraftMatch instead
 * @param {Object} m - Match object
 * @returns {boolean} True if draft match
 */
export function isDraftMatch(m) {
  // ✅ 헬퍼 사용 - 드래프트 판별 로직 통일
  return MatchHelpers.isDraftMatch(m)
}

/**
 * Extract team rosters from draft match snapshot
 */
export function extractSnapshotTeams(m) {
  const snap = Array.isArray(m?.snapshot) ? m.snapshot : null
  if (!snap || !snap.every(Array.isArray)) return []
  
  return snap.map(team => team.map(v => {
    if (typeof v === 'object' && v !== null) {
      const cand = v.id ?? v.playerId ?? v.user_id ?? v.userId ?? v.pid ?? v.uid
      return toStr(cand)
    }
    return toStr(v)
  }).filter(Boolean))
}

/**
 * Extract captain IDs by team from draft match
 * @deprecated Use MatchHelpers.getCaptains instead
 * @param {Object} m - Match object
 * @returns {Array<string>} Captain IDs by team
 */
export function extractCaptainsByTeam(m) {
  // ✅ 헬퍼 사용 - Captain 데이터 접근 통일
  return MatchHelpers.getCaptains(m)
}

/**
 * Extract match timestamp for sorting
 */
export function extractMatchTS(m) {
  const c = m?.dateISO ?? m?.dateIso ?? m?.dateiso ?? m?.date ?? m?.dateStr ?? m?.createdAt ?? m?.updatedAt ?? null
  if (!c) return 0
  const t = (typeof c === 'number') ? c : Date.parse(String(c))
  return Number.isFinite(t) ? t : 0
}

/**
 * Determine winner index from quarter scores
 * @deprecated Use MatchHelpers.getWinnerIndex instead (for new code)
 * 
 * 2팀 경기: 쿼터 승수 → 총득점
 * 3팀+ 경기: 각 팀의 최고 골득실 비교 → 총득점
 */
export function winnerIndexFromQuarterScores(qs) {
  // ⚠️ 이 함수는 복잡한 로직이 있어서 헬퍼로 대체하지 않음
  // MatchHelpers.getWinnerIndex는 단순 총점 비교만 하므로 다름
  // 기존 로직 유지 (쿼터 승수, 골득실 등 고려)
  if (!Array.isArray(qs) || qs.length < 2) return -1
  
  const teamLen = qs.length
  const maxQ = Math.max(0, ...qs.map(a => Array.isArray(a) ? a.length : 0))
  const totals = qs.map(arr => (Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0))
  
  // 2팀 경기: 기존 로직 (쿼터 승수 비교)
  if (teamLen === 2) {
    const wins = Array.from({ length: teamLen }, () => 0)
    
    for (let qi = 0; qi < maxQ; qi++) {
      const scores = qs.map(arr => Array.isArray(arr) ? Number(arr[qi] || 0) : 0)
      const mx = Math.max(...scores)
      const winners = scores.map((v, i) => v === mx ? i : -1).filter(i => i >= 0)
      if (winners.length === 1) wins[winners[0]] += 1
    }
    
    const maxWins = Math.max(...wins)
    const tied = wins.map((w, i) => w === maxWins ? i : -1).filter(i => i >= 0)
    if (tied.length === 1) return tied[0]
    
    // tie-breaker by total goals
    const maxTotal = Math.max(...tied.map(i => totals[i]))
    const final = tied.filter(i => totals[i] === maxTotal)
    return final.length === 1 ? final[0] : -1
  }
  
  // 3팀+ 경기: 각 팀의 최고 골득실 비교
  const bestGoalDiffs = Array.from({ length: teamLen }, () => -Infinity)
  
  // 각 쿼터에서 골득실 계산
  for (let qi = 0; qi < maxQ; qi++) {
    const scores = qs.map(arr => Array.isArray(arr) ? Number(arr[qi] || 0) : 0)
    
    // 이 쿼터에서 각 팀의 골득실 계산 (상대팀 평균과 비교)
    // 상대 팀들의 평균 득점
    for (let ti = 0; ti < teamLen; ti++) {
      const myScore = scores[ti]
      const opponentScores = scores.filter((_, idx) => idx !== ti)
      const avgOpponent = opponentScores.length > 0 
        ? opponentScores.reduce((a, b) => a + b, 0) / opponentScores.length 
        : 0
      
      const goalDiff = myScore - avgOpponent
      
      if (goalDiff > bestGoalDiffs[ti]) {
        bestGoalDiffs[ti] = goalDiff
      }
    }
  }
  
  // 1단계: 최고 골득실이 가장 높은 팀 찾기
  const maxBestDiff = Math.max(...bestGoalDiffs)
  let candidates = bestGoalDiffs.map((diff, i) => diff === maxBestDiff ? i : -1).filter(i => i >= 0)
  
  // 골득실 동률이면 무승부 (여러 팀이 같은 최고 골득실)
  if (candidates.length > 1) return -1
  
  return candidates.length === 1 ? candidates[0] : -1
}

/* --------------------- Draft Wins Computation --------------------- */

/**
 * Compute draft player stats with wins/draws/losses
 */
export function computeDraftPlayerStatsRows(players = [], matches = []) {
  const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
  const stats = new Map()
  const last5Map = new Map()
  const lastWinTSMap = new Map()
  
  // 드래프트 매치만 필터링하고, 유효한 게임 데이터가 있는 매치만 포함
  const validMatches = [...(matches || [])]
    .filter(isDraftMatch)
    .filter(hasValidGameData)
    .sort((a, b) => extractMatchTS(a) - extractMatchTS(b))
  
  for (const m of validMatches) {
    const qs = coerceQuarterScores(m)
    const winnerIdx = winnerIndexFromQuarterScores(qs)
    const teams = extractSnapshotTeams(m)
    if (teams.length === 0) continue

    const isDraw = winnerIdx < 0
    const matchTS = extractMatchTS(m)
    for (let ti = 0; ti < teams.length; ti++) {
      const result = isDraw ? 'D' : (ti === winnerIdx ? 'W' : 'L')

      for (const pid of teams[ti]) {
        // last5 기록 업데이트
        const list = last5Map.get(pid) || []
        list.push(result)
        last5Map.set(pid, list)

        // 최근 W 기록
        if (result === 'W') {
          const prevTS = lastWinTSMap.get(pid)
          if (!prevTS || matchTS > prevTS) lastWinTSMap.set(pid, matchTS)
        }

        // 통계 업데이트
        const p = idToPlayer.get(pid)
        const current = stats.get(pid) || { 
          id: pid, 
          name: p?.name || pid, 
          wins: 0,
          draws: 0,
          losses: 0,
          totalGames: 0,
          isGuest: p ? !isMember(p.membership) : false 
        }

        current.totalGames += 1
        if (result === 'W') current.wins += 1
        else if (result === 'D') current.draws += 1
        else if (result === 'L') current.losses += 1

        stats.set(pid, current)
      }
    }
  }
  
  const out = Array.from(stats.values()).sort((a, b) => {
  // 1. 승점(3점제)
  const pointsA = a.wins * 3 + a.draws
  const pointsB = b.wins * 3 + b.draws
  if (pointsA !== pointsB) return pointsB - pointsA

  // 2. 경기수 많은 선수
  if (a.totalGames !== b.totalGames) return b.totalGames - a.totalGames

  // 3. 최근에 W받은 선수 (더 최근이 우선)
  const lastWinA = lastWinTSMap.get(a.id) || 0
  const lastWinB = lastWinTSMap.get(b.id) || 0
  if (lastWinA !== lastWinB) return lastWinB - lastWinA

  // 4. 이름순
  return a.name.localeCompare(b.name)
  })
  
  let lastRank = 0
  let lastKey = null
  return out.map((r, i) => {
    const points = r.wins * 3 + r.draws
    // 동점자(동순위)는 승점만 비교하여 rank를 부여, 오더는 sort 순서 유지
    const key = `${points}`
    const rank = (i === 0) ? 1 : (key === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = key
    const last5 = (last5Map.get(r.id) || []).slice(-5)

    // 승률 계산
    const winRate = r.totalGames > 0 ? Math.round((r.wins / r.totalGames) * 100) : 0

    return { 
      ...r, 
      rank, 
      last5, 
      points,
      winRate,
      lastWinTS: lastWinTSMap.get(r.id) || 0,
      photoUrl: idToPlayer.get(r.id)?.photoUrl
    }
  })
}

/**
 * Compute draft wins leaderboard rows (기존 호환성 유지)
 */
export function computeDraftWinsRows(players = [], matches = []) {
  const statsRows = computeDraftPlayerStatsRows(players, matches)
  return statsRows.map(row => ({
    id: row.id,
    name: row.name,
    wins: row.wins,
    isGuest: row.isGuest,
    rank: row.rank,
    last5: row.last5
  }))
}

/**
 * Check if match has valid game data (at least 2 quarters)
 */
export function hasValidGameData(m) {
  const qs = coerceQuarterScores(m)
  if (!Array.isArray(qs) || qs.length < 2) return false
  
  // 최소 1쿼터 이상의 점수가 있는지 확인 (1쿼터만 입력해도 카운트)
  const maxQuarters = Math.max(...qs.map(team => Array.isArray(team) ? team.length : 0))
  return maxQuarters >= 1
}

/**
 * Compute captain stats with wins/draws/losses
 */
export function computeCaptainStatsRows(players = [], matches = []) {
  const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
  const stats = new Map()
  const last5Map = new Map()
  const lastWinTSMap = new Map()
  
  // 드래프트 매치만 필터링하고, 유효한 게임 데이터가 있는 매치만 포함
  const validMatches = [...(matches || [])]
    .filter(isDraftMatch)
    .filter(hasValidGameData)
    .sort((a, b) => extractMatchTS(a) - extractMatchTS(b))
  
  for (const m of validMatches) {
    const qs = coerceQuarterScores(m)
    const winnerIdx = winnerIndexFromQuarterScores(qs)
    const isDraw = winnerIdx < 0
    const caps = extractCaptainsByTeam(m)
    if (!Array.isArray(caps) || caps.length === 0) continue

    const matchTS = extractMatchTS(m)
    for (let ti = 0; ti < caps.length; ti++) {
      const pid = toStr(caps[ti])
      if (!pid) continue

      const result = isDraw ? 'D' : (ti === winnerIdx ? 'W' : 'L')

      // last5 기록 업데이트
      const list = last5Map.get(pid) || []
      list.push(result)
      last5Map.set(pid, list)

      // 최근 W 기록
      if (result === 'W') {
        const prevTS = lastWinTSMap.get(pid)
        if (!prevTS || matchTS > prevTS) lastWinTSMap.set(pid, matchTS)
      }

      // 통계 업데이트
      const p = idToPlayer.get(pid)
      const current = stats.get(pid) || { 
        id: pid, 
        name: p?.name || pid, 
        wins: 0,
        draws: 0,
        losses: 0,
        totalGames: 0,
        isGuest: p ? !isMember(p.membership) : false 
      }

      current.totalGames += 1
      if (result === 'W') current.wins += 1
      else if (result === 'D') current.draws += 1
      else if (result === 'L') current.losses += 1

      stats.set(pid, current)
    }
  }
  
  const out = Array.from(stats.values()).sort((a, b) => {
  // 1. 승점(3점제)
  const pointsA = a.wins * 3 + a.draws
  const pointsB = b.wins * 3 + b.draws
  if (pointsA !== pointsB) return pointsB - pointsA

  // 2. 경기수 많은 선수
  if (a.totalGames !== b.totalGames) return b.totalGames - a.totalGames

  // 3. 최근에 W받은 선수 (더 최근이 우선)
  const lastWinA = lastWinTSMap.get(a.id) || 0
  const lastWinB = lastWinTSMap.get(b.id) || 0
  if (lastWinA !== lastWinB) return lastWinB - lastWinA

  // 4. 이름순
  return a.name.localeCompare(b.name)
  })
  
  let lastRank = 0
  let lastKey = null
  return out.map((r, i) => {
    const points = r.wins * 3 + r.draws
    // 동점자(동순위)는 승점만 비교하여 rank를 부여, 오더는 sort 순서 유지
    const key = `${points}`
    const rank = (i === 0) ? 1 : (key === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = key
    const last5 = (last5Map.get(r.id) || []).slice(-5)

    // 승률 계산
    const winRate = r.totalGames > 0 ? Math.round((r.wins / r.totalGames) * 100) : 0

    return { 
      ...r, 
      rank, 
      last5, 
      points,
      winRate,
      lastWinTS: lastWinTSMap.get(r.id) || 0,
      photoUrl: idToPlayer.get(r.id)?.photoUrl
    }
  })
}

/**
 * Compute captain wins leaderboard rows (기존 호환성 유지)
 */
export function computeCaptainWinsRows(players = [], matches = []) {
  const statsRows = computeCaptainStatsRows(players, matches)
  return statsRows.map(row => ({
    id: row.id,
    name: row.name,
    wins: row.wins,
    isGuest: row.isGuest,
    rank: row.rank,
    last5: row.last5
  }))
}

/**
 * Compute draft attack points leaderboard rows (골/어시)
 */
export function computeDraftAttackRows(players = [], matches = []) {
  const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
  const stats = new Map()
  
  // 드래프트 매치만 필터링하고, 유효한 게임 데이터가 있는 매치만 포함
  const validMatches = [...(matches || [])]
    .filter(isDraftMatch)
    .filter(hasValidGameData)
  
  for (const m of validMatches) {
    const attendedIds = new Set(extractAttendeeIds(m))
    const statsMap = extractStatsByPlayer(m)
    
    // Track appearances
    for (const pid of attendedIds) {
      const p = idToPlayer.get(pid)
      if (!p) continue
      const row = stats.get(pid) || {
        id: pid, 
        name: p.name, 
        membership: p.membership || '',
        gp: 0, 
        g: 0, 
        a: 0,
        isGuest: !isMember(p.membership)
      }
      row.gp += 1
      stats.set(pid, row)
    }
    
    // Track goals and assists
    for (const [pid, rec] of Object.entries(statsMap)) {
      const p = idToPlayer.get(pid)
      if (!p) continue
      const row = stats.get(pid) || {
        id: pid, 
        name: p.name, 
        membership: p.membership || '',
        gp: 0, 
        g: 0, 
        a: 0,
        isGuest: !isMember(p.membership)
      }
      row.g += Number(rec?.goals || 0)
      row.a += Number(rec?.assists || 0)
      stats.set(pid, row)
    }
  }
  
  const out = Array.from(stats.values())
    .filter(r => r.gp > 0) // 경기에 참여한 선수만
    .map(r => ({ 
      ...r, 
      pts: r.g + r.a, // 공격 포인트 = 골 + 어시
      gpg: r.gp > 0 ? (r.g / r.gp).toFixed(2) : '0.00',
      apa: r.gp > 0 ? ((r.g + r.a) / r.gp).toFixed(2) : '0.00'
    }))
    .sort((a, b) => {
      // 공격 포인트로 먼저 정렬
      if (a.pts !== b.pts) return b.pts - a.pts
      // 골 수로 정렬
      if (a.g !== b.g) return b.g - a.g
      // 경기당 공격 포인트로 정렬
      if (parseFloat(a.apa) !== parseFloat(b.apa)) return parseFloat(b.apa) - parseFloat(a.apa)
      // 이름으로 정렬
      return a.name.localeCompare(b.name)
    })
  
  let lastRank = 0
  let lastKey = null
  return out.map((r, i) => {
    const key = `${r.pts}-${r.g}-${parseFloat(r.apa)}`
    const rank = (i === 0) ? 1 : (key === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = key
    
    return { 
      ...r, 
      rank,
      photoUrl: idToPlayer.get(r.id)?.photoUrl
    }
  })
}
