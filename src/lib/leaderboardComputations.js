// src/lib/leaderboardComputations.js
// Computation functions for leaderboard data aggregation and ranking

import { toStr, isMember, extractAttendeeIds, extractStatsByPlayer } from './matchUtils'
import * as MatchHelpers from './matchHelpers'

/**
 * 2개 구장에서 팀들이 완전히 분리되어 경기했는지 판별
 * @param {Array} gameMatchups - 매치업 배열 [[field1_pair, field2_pair], ...]
 * @param {number} teamCount - 전체 팀 수
 * @returns {Object|null} - {field1Teams: Set, field2Teams: Set} 또는 null (섞임)
 */
function checkFieldSeparation(gameMatchups, teamCount) {
  if (!gameMatchups || !Array.isArray(gameMatchups) || gameMatchups.length === 0) {
    return null
  }
  
  const field1Teams = new Set()
  const field2Teams = new Set()
  
  for (const matchup of gameMatchups) {
    if (!Array.isArray(matchup)) continue
    
    matchup.forEach((pair, fieldIdx) => {
      if (!Array.isArray(pair) || pair.length !== 2) return
      const [a, b] = pair
      
      if (fieldIdx === 0) {
        // 구장1 (첫 번째 매치업)
        if (a !== null && a !== undefined && a >= 0) field1Teams.add(a)
        if (b !== null && b !== undefined && b >= 0) field1Teams.add(b)
      } else if (fieldIdx === 1) {
        // 구장2 (두 번째 매치업)
        if (a !== null && a !== undefined && a >= 0) field2Teams.add(a)
        if (b !== null && b !== undefined && b >= 0) field2Teams.add(b)
      }
    })
  }
  
  // 팀들이 섞였는지 확인 (교집합이 있으면 섞임)
  const intersection = new Set([...field1Teams].filter(t => field2Teams.has(t)))
  if (intersection.size > 0) {
    return null // 섞임
  }
  
  // 각 구장에 최소 2팀 이상 있어야 함
  if (field1Teams.size < 2 || field2Teams.size < 2) {
    return null
  }
  
  // 모든 팀이 커버되어야 함
  const allTeams = new Set([...field1Teams, ...field2Teams])
  if (allTeams.size !== teamCount) {
    return null
  }
  
  return { field1Teams, field2Teams }
}

/* --------------------- Attack Points Computation --------------------- */

/**
 * Compute attack points leaderboard rows
 * Aggregates goals, assists, and match appearances per player
 */
export function computeAttackRows(players = [], matches = []) {
  const index = new Map()
  const idToPlayer = new Map((players || []).map(p => [toStr(p.id), p]))
  const isDefOrGk = (p) => {
    const pos = (p?.position || p?.pos || '').toString().toUpperCase()
    const positions = Array.isArray(p?.positions) ? p.positions.map(x => String(x).toUpperCase()) : []
    const all = [pos, ...positions]
    return all.some(s => s.includes('GK') || s.includes('골키퍼') || s.includes('KEEPER') || s.includes('DF') || s.includes('DEF') || s.includes('수비'))
  }
  
  const seenMatchIds = new Set()

  for (const m of (matches || [])) {
    const mid = toStr(m?.id)
    if (mid) {
      if (seenMatchIds.has(mid)) continue
      seenMatchIds.add(mid)
    }
    const attendedIds = new Set(extractAttendeeIds(m))
    const statsMap = extractStatsByPlayer(m)
    const teams = extractSnapshotTeams(m)
    const qs = MatchHelpers.getQuarterScores ? MatchHelpers.getQuarterScores(m) : coerceQuarterScores(m)
    const gameMatchups = m?.gameMatchups || null
    const teamCount = Array.isArray(qs) ? qs.length : 0
    // Track which players have manual cleanSheet for this match to avoid double-counting
    const manualCSPlayers = new Set(
      Object.entries(statsMap)
        .filter(([_, rec]) => Number(rec?.cleanSheet || 0) > 0)
        .map(([pid, _]) => toStr(pid))
    )
    
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
        a: 0,
        cs: 0
      }
      row.gp += 1
      index.set(pid, row)
    }
    
    // Track goals, assists, and clean sheets from statsMap only (no auto-derivation)
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
        a: 0,
        cs: 0
      }
      row.g += Number(rec?.goals || 0)
      row.a += Number(rec?.assists || 0)
      // Only use manual cleanSheet from statsMap
      const csManual = Number(rec?.cleanSheet || 0)
      if (csManual > 0) row.cs += csManual
      index.set(pid, row)
    }

    // 자동 클린시트 제거: 더 이상 실점 0 자동 부여 로직을 수행하지 않음 (순수 수동 입력 기반)
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
  if (rankBy === 'cs') {
    return (a, b) => (b.cs - a.cs) || (b.gp - a.gp) || (b.pts - a.pts) || a.name.localeCompare(b.name)
  }
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
    if (rankBy === 'cs') keyVal = r.cs
    else if (rankBy === 'g') keyVal = r.g
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
  const playerArray = players || []
  const idToPlayer = new Map(playerArray.map(p => [toStr(p.id), p]))
  const nameToId = new Map(playerArray.map(p => [toStr(p.name).trim().toLowerCase(), toStr(p.id)]))
  
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
  
  // Only count from goal events with assistedBy
  // Ignore assist events with linkedToGoal to prevent double counting
  const duoCount = new Map()
  
  for (const e of evts) {
    const myPid = toStr(e.pid)
    
    // Only count from goal events
    if (e.type === 'goal') {
      const aid = toStr(e?.raw?.assistedBy)
      if (aid && idToPlayer.has(aid) && aid !== myPid) {
        const key = `${aid}|${myPid}`
        duoCount.set(key, (duoCount.get(key) || 0) + 1)
      }
    }
    // Completely ignore assist events with linkedToGoal
    // (they're just metadata for the UI, not for counting)
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
 * 3팀 경기: 승점제 (고정 패턴)
 * 4팀+ 경기 (단일 경기장): 각 팀의 최고 골득실 비교
 * 4팀+ 경기 (2개 경기장): 매치업 기반 승점제
 */
export function winnerIndexFromQuarterScores(qs, gameMatchups = null) {
  // ⚠️ 이 함수는 복잡한 로직이 있어서 헬퍼로 대체하지 않음
  // MatchHelpers.getWinnerIndex는 단순 총점 비교만 하므로 다름
  // 기존 로직 유지 (쿼터 승수, 골득실 등 고려)
  if (!Array.isArray(qs) || qs.length < 2) return -1
  
  const teamLen = qs.length
  const maxQ = Math.max(0, ...qs.map(a => Array.isArray(a) ? a.length : 0))
  const totals = qs.map(arr => (Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0))
  
  // 2팀 경기: 기존 로직 (게임 승수 비교)
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
  
  // 3팀 경기: 승점제로 승자 결정
  if (teamLen === 3) {
    // 각 팀별로 각 게임의 승점과 골득실을 기록 (나중에 가중 승점 계산 시 필요)
    const teamGames = [[], [], []] // 각 게임 정보: {points, scored, conceded}
    const gamesPlayed = [0, 0, 0]
    const totalsByTeam = [0, 0, 0]
    
    // null 체크로 rotation vs battle royale 구분
    const hasNulls = qs.some(teamScores => 
      Array.isArray(teamScores) && teamScores.some(s => s === null)
    )
    
    if (hasNulls) {
      // Rotation 모드: null이 있는 경우 동적으로 경기 쌍 감지
      for (let qi = 0; qi < maxQ; qi++) {
        const scores = qs.map(arr => Array.isArray(arr) ? arr[qi] : undefined)
        const playingTeams = []
        
        for (let ti = 0; ti < 3; ti++) {
          if (scores[ti] !== null && scores[ti] !== undefined) {
            playingTeams.push(ti)
          }
        }
        
        // 정확히 2팀이 경기하는 경우만 처리
        if (playingTeams.length === 2) {
          const [a, b] = playingTeams
          const aScore = Number(scores[a])
          const bScore = Number(scores[b])
          
          if (!Number.isFinite(aScore) || !Number.isFinite(bScore)) continue
          
          gamesPlayed[a] += 1
          gamesPlayed[b] += 1
          totalsByTeam[a] += aScore
          totalsByTeam[b] += bScore
          
          let aPts = 0, bPts = 0
          if (aScore > bScore) { aPts = 3; bPts = 0 }
          else if (bScore > aScore) { aPts = 0; bPts = 3 }
          else { aPts = 1; bPts = 1 }
          
          teamGames[a].push({ points: aPts, scored: aScore, conceded: bScore })
          teamGames[b].push({ points: bPts, scored: bScore, conceded: aScore })
        }
      }
    } else {
      // Battle royale 모드: 모든 팀이 동시에 경기
      for (let qi = 0; qi < maxQ; qi++) {
        const scores = qs.map(arr => Array.isArray(arr) ? Number(arr[qi] || 0) : 0)
        
        // 각 쿼터를 3팀 동시 경기로 처리 (순위 기반 승점)
        const ranked = scores.map((score, idx) => ({ idx, score }))
          .sort((a, b) => b.score - a.score)
        
        // 1등: 3점, 2등: 1점, 3등: 0점
        const points = [0, 0, 0]
        if (ranked[0].score > ranked[1].score) {
          points[ranked[0].idx] = 3
          if (ranked[1].score > ranked[2].score) {
            points[ranked[1].idx] = 1
          } else if (ranked[1].score === ranked[2].score) {
            points[ranked[1].idx] = 1
            points[ranked[2].idx] = 1
          }
        } else if (ranked[0].score === ranked[1].score && ranked[1].score > ranked[2].score) {
          points[ranked[0].idx] = 1
          points[ranked[1].idx] = 1
        } else if (ranked[0].score === ranked[1].score && ranked[1].score === ranked[2].score) {
          points[0] = 1
          points[1] = 1
          points[2] = 1
        }
        
        for (let ti = 0; ti < 3; ti++) {
          gamesPlayed[ti] += 1
          totalsByTeam[ti] += scores[ti]
          
          const otherScores = scores.filter((_, idx) => idx !== ti)
          const avgConceded = otherScores.reduce((a, b) => a + b, 0) / otherScores.length
          
          teamGames[ti].push({ 
            points: points[ti], 
            scored: scores[ti], 
            conceded: avgConceded 
          })
        }
      }
    }

    const allEqualGames = gamesPlayed.every(g => g === gamesPlayed[0])
    const validGames = gamesPlayed.filter(g => g > 0)
    if (validGames.length === 0) return -1 // 아무도 경기하지 않음
    
    if (allEqualGames) {
      // 모든 팀이 같은 경기 수 → 총 승점으로 비교
      const totalPoints = teamGames.map(games => games.reduce((sum, g) => sum + g.points, 0))
      const maxPts = Math.max(...totalPoints)
      let winners = totalPoints.map((p,i)=>p===maxPts?i:-1).filter(i=>i>=0)
      
      // 1단계 타이브레이커: 골득실
      if (winners.length > 1) {
        const goalDiff = teamGames.map(games => games.reduce((sum, g) => sum + (g.scored - g.conceded), 0))
        const maxGD = Math.max(...winners.map(i => goalDiff[i]))
        winners = winners.filter(i => goalDiff[i] === maxGD)
      }
      
      // 2단계 타이브레이커: 총 득점
      if (winners.length > 1) {
        const goalsScored = teamGames.map(games => games.reduce((sum, g) => sum + g.scored, 0))
        const maxGS = Math.max(...winners.map(i => goalsScored[i]))
        winners = winners.filter(i => goalsScored[i] === maxGS)
      }
      
      return winners.length === 1 ? winners[0] : -1
    }

    // 게임 수가 다른 경우: 가중 승점 (Weighted Points)
    // 최소 게임 수에 맞춰 각 팀의 최고 성적 게임만 선택
    const minGames = Math.min(...validGames)
    if (minGames <= 0) return -1
    
    // 게임 품질 비교: 1) 승점, 2) 골득실, 3) 득점
    const compareGames = (g1, g2) => {
      if (g2.points !== g1.points) return g2.points - g1.points
      const diff2 = g2.scored - g2.conceded
      const diff1 = g1.scored - g1.conceded
      if (diff2 !== diff1) return diff2 - diff1
      if (g2.scored !== g1.scored) return g2.scored - g1.scored
      return 0
    }
    
    const summarizeTopGames = (games, count) => {
      if (!games.length || !count || count <= 0) return { points: 0, goalDiff: 0, goalsScored: 0 }
      const sorted = [...games].sort(compareGames)
      const selected = sorted.slice(0, count)
      return {
        points: selected.reduce((sum, g) => sum + g.points, 0),
        goalDiff: selected.reduce((sum, g) => sum + (g.scored - g.conceded), 0),
        goalsScored: selected.reduce((sum, g) => sum + g.scored, 0)
      }
    }
    
    const summaries = teamGames.map(games => summarizeTopGames(games, minGames))
    const weightedPoints = summaries.map(s => s.points)
    const weightedGoalDiff = summaries.map(s => s.goalDiff)
    const weightedGoalsScored = summaries.map(s => s.goalsScored)
    
    const maxWPts = Math.max(...weightedPoints)
    let candidates = weightedPoints.map((p,i)=>p===maxWPts?i:-1).filter(i=>i>=0)
    
    // 1단계 타이브레이커: 가중 골득실
    if (candidates.length > 1) {
      const maxGD = Math.max(...candidates.map(i => weightedGoalDiff[i]))
      candidates = candidates.filter(i => weightedGoalDiff[i] === maxGD)
    }
    
    // 2단계 타이브레이커: 가중 총 득점
    if (candidates.length > 1) {
      const maxGS = Math.max(...candidates.map(i => weightedGoalsScored[i]))
      candidates = candidates.filter(i => weightedGoalsScored[i] === maxGS)
    }
    
    if (candidates.length === 1) return candidates[0]

    // 동률이면 타이브레이커: 동률 팀들 간 맞대결(H2H) 승점 비교 (rotation 모드만)
    if (candidates.length === 2 && hasNulls) {
      const [x, y] = candidates
      let h2hX = 0, h2hY = 0, gdX = 0, gdY = 0
      
      // 동적으로 x vs y 경기 찾기
      for (let qi = 0; qi < maxQ; qi++) {
        const scores = qs.map(arr => Array.isArray(arr) ? arr[qi] : undefined)
        const playingTeams = []
        
        for (let ti = 0; ti < 3; ti++) {
          if (scores[ti] !== null && scores[ti] !== undefined) {
            playingTeams.push(ti)
          }
        }
        
        // x와 y가 서로 경기한 쿼터인지 확인
        if (playingTeams.length === 2 && playingTeams.includes(x) && playingTeams.includes(y)) {
          const xScore = Number(scores[x])
          const yScore = Number(scores[y])
          
          if (xScore > yScore) h2hX += 3
          else if (yScore > xScore) h2hY += 3
          else { h2hX += 1; h2hY += 1 }
          
          gdX += (xScore - yScore)
          gdY += (yScore - xScore)
        }
      }
      
      if (h2hX !== h2hY) return h2hX > h2hY ? x : y
      if (gdX !== gdY) return gdX > gdY ? x : y
    }

    // 여전히 동률이면 단일 승자를 결정하지 않음
    return -1
  }
  
  // 4팀 이상 + 매치업 정보가 있는 경우 (2개 경기장 모드): 승점제
  if (teamLen >= 4 && gameMatchups && Array.isArray(gameMatchups) && gameMatchups.length > 0) {
    const teamGamePoints = Array.from({ length: teamLen }, () => [])
    const gamesPlayed = Array.from({ length: teamLen }, () => 0)
    const teamTotals = Array.from({ length: teamLen }, () => 0)
    
    for (let qi = 0; qi < maxQ; qi++) {
      const matchup = gameMatchups[qi]
      if (!matchup || !Array.isArray(matchup)) continue
      
      // 각 경기장별로 승점 계산
      for (const pair of matchup) {
        if (!Array.isArray(pair) || pair.length !== 2) continue
        const [a, b] = pair
        // null 체크 추가
        if (a === null || b === null || a === undefined || b === undefined || a < 0 || b < 0 || a >= teamLen || b >= teamLen) continue
        
        const aScore = Number(qs[a]?.[qi] ?? 0)
        const bScore = Number(qs[b]?.[qi] ?? 0)
        
        teamTotals[a] += aScore
        teamTotals[b] += bScore
        gamesPlayed[a] += 1
        gamesPlayed[b] += 1
        
        let aPts = 0, bPts = 0
        if (aScore > bScore) { aPts = 3; bPts = 0 }
        else if (bScore > aScore) { aPts = 0; bPts = 3 }
        else { aPts = 1; bPts = 1 }
        
        teamGamePoints[a].push(aPts)
        teamGamePoints[b].push(bPts)
      }
    }
    
    const allEqualGames = gamesPlayed.every(g => g === gamesPlayed[0] && g > 0)
    
    if (allEqualGames) {
      // 모든 팀이 같은 경기 수 → 총 승점으로 비교
      const totalPoints = teamGamePoints.map(pts => pts.reduce((a,b)=>a+b, 0))
      const maxPts = Math.max(...totalPoints)
      const topCandidates = totalPoints.map((p,i)=>p===maxPts?i:-1).filter(i=>i>=0)
      
      // 승점 동점일 때 골득실로 판단
      if (topCandidates.length > 1) {
        const maxGoals = Math.max(...topCandidates.map(i => teamTotals[i]))
        const winners = topCandidates.filter(i => teamTotals[i] === maxGoals)
        return winners.length === 1 ? winners[0] : -1
      }
      return topCandidates.length === 1 ? topCandidates[0] : -1
    }
    
    // 게임 수가 다른 경우: 가중 승점
    const minGames = Math.min(...gamesPlayed.filter(g => g > 0))
    if (minGames > 0) {
      const weightedPoints = teamGamePoints.map(pts => {
        if (pts.length === 0) return 0
        const sorted = [...pts].sort((a,b) => b - a)
        return sorted.slice(0, minGames).reduce((a,b) => a + b, 0)
      })
      
      const maxWPts = Math.max(...weightedPoints)
      const topCandidates = weightedPoints.map((p,i)=>p===maxWPts?i:-1).filter(i=>i>=0)
      
      // 승점 동점일 때 골득실로 판단
      if (topCandidates.length > 1) {
        const maxGoals = Math.max(...topCandidates.map(i => teamTotals[i]))
        const winners = topCandidates.filter(i => teamTotals[i] === maxGoals)
        return winners.length === 1 ? winners[0] : -1
      }
      return topCandidates.length === 1 ? topCandidates[0] : -1
    }
  }
  
  // 4팀 이상 (단일 경기장 또는 매치업 없음): 기존 로직 유지 (각 팀의 최고 골득실 비교)
  const bestGoalDiffs = Array.from({ length: teamLen }, () => -Infinity)
  for (let qi = 0; qi < maxQ; qi++) {
    const scores = qs.map(arr => Array.isArray(arr) ? Number(arr[qi] || 0) : 0)
    for (let ti = 0; ti < teamLen; ti++) {
      const myScore = scores[ti]
      const opponentScores = scores.filter((_, idx) => idx !== ti)
      const avgOpponent = opponentScores.length > 0 
        ? opponentScores.reduce((a, b) => a + b, 0) / opponentScores.length 
        : 0
      const goalDiff = myScore - avgOpponent
      if (goalDiff > bestGoalDiffs[ti]) bestGoalDiffs[ti] = goalDiff
    }
  }
  const maxBestDiff = Math.max(...bestGoalDiffs)
  const candidates = bestGoalDiffs.map((diff, i) => diff === maxBestDiff ? i : -1).filter(i => i >= 0)
  return candidates.length === 1 ? candidates[0] : -1
}

/* --------------------- Draft Wins Computation --------------------- */

/**
 * Compute draft player stats with wins/draws/losses
 */
export function computeDraftPlayerStatsRows(players = [], matches = []) {
  const playerArray = players || []
  const idToPlayer = new Map(playerArray.map(p => [toStr(p.id), p]))
  const stats = new Map()
  const last5Map = new Map()
  const lastWinTSMap = new Map()
  
  // 드래프트 매치만 필터링하고, 유효한 게임 데이터가 있는 매치만 포함
  const validMatches = [...(matches || [])]
    .filter(isDraftMatch)
    .filter(hasValidGameData)
    .sort((a, b) => extractMatchTS(a) - extractMatchTS(b))
  
  for (const m of validMatches) {
    const qs = coerceQuarterScores(m) || []
    if (!Array.isArray(qs) || qs.length === 0) continue
    const gameMatchups = m?.gameMatchups || null
    const teamCount = qs.length
    const teams = extractSnapshotTeams(m)
    if (teams.length === 0) continue

    // 구장 분리 체크 (4팀+ 매치업 모드)
    const separation = (teamCount >= 4 && gameMatchups && Array.isArray(gameMatchups) && gameMatchups.length > 0)
      ? checkFieldSeparation(gameMatchups, teamCount)
      : null
    
    // 승자 결정
    const topTeams = new Set()
    
    if (separation) {
      // 구장별로 분리된 경우: 각 구장의 승자를 모두 topTeams에 추가
      const { field1Teams, field2Teams } = separation
      
      const getFieldWinners = (fieldTeams, fieldIdx) => {
        const teamGamePoints = {}
        const teamTotals = {}
        const gamesPlayed = {}
        
        fieldTeams.forEach(t => {
          teamGamePoints[t] = []
          teamTotals[t] = 0
          gamesPlayed[t] = 0
        })
        
        const maxQ = Math.max(0, ...qs.map(a => Array.isArray(a) ? a.length : 0))
        
        for (let qi = 0; qi < maxQ; qi++) {
          const matchup = gameMatchups[qi]
          if (!matchup || !Array.isArray(matchup)) continue
          const pair = matchup[fieldIdx]
          if (!Array.isArray(pair) || pair.length !== 2) continue
          const [a, b] = pair
          if (!fieldTeams.has(a) || !fieldTeams.has(b)) continue
          
          const aScore = Number(qs[a]?.[qi] ?? 0)
          const bScore = Number(qs[b]?.[qi] ?? 0)
          teamTotals[a] += aScore
          teamTotals[b] += bScore
          gamesPlayed[a] += 1
          gamesPlayed[b] += 1
          
          let aPts = 0, bPts = 0
          if (aScore > bScore) { aPts = 3; bPts = 0 }
          else if (bScore > aScore) { aPts = 0; bPts = 3 }
          else { aPts = 1; bPts = 1 }
          
          teamGamePoints[a].push(aPts)
          teamGamePoints[b].push(bPts)
        }
        
        const totalPoints = {}
        Object.keys(teamGamePoints).forEach(t => {
          totalPoints[t] = teamGamePoints[t].reduce((a,b) => a+b, 0)
        })
        
        const maxPts = Math.max(...Object.values(totalPoints))
        let winners = Object.keys(totalPoints)
          .filter(t => totalPoints[t] === maxPts)
          .map(t => parseInt(t))
        
        // 동점일 때 골득실로 판단
        if (winners.length > 1) {
          const maxGoals = Math.max(...winners.map(t => teamTotals[t]))
          winners = winners.filter(t => teamTotals[t] === maxGoals)
        }
        
        return winners
      }
      
      const field1Winners = getFieldWinners(field1Teams, 0)
      const field2Winners = getFieldWinners(field2Teams, 1)
      
      field1Winners.forEach(t => topTeams.add(t))
      field2Winners.forEach(t => topTeams.add(t))
      
    } else {
      // 3팀 특수 처리: 실제로 경기에 참가하지 않은 팀(게임 수 0)은 무승부 그룹 포함/패배 처리하지 않음
      let gamesPlayed3 = null
      if (teamCount === 3 && (!gameMatchups || !Array.isArray(gameMatchups))) {
        const pairs = [[0,1],[1,2],[0,2]]
        const maxQLocal = Math.max(0, ...qs.map(a => Array.isArray(a) ? a.length : 0))
        gamesPlayed3 = [0,0,0]
        for (let qi = 0; qi < maxQLocal; qi++) {
          const [a,b] = pairs[qi % 3]
          // 해당 쿼터가 존재한다고 간주 (기록 배열 길이 기준) → 두 팀만 게임 증가
          if (qs[a] && qi < qs[a].length || qs[b] && qi < qs[b].length) {
            gamesPlayed3[a] += 1
            gamesPlayed3[b] += 1
          }
        }
      }

      // 기존 로직: 단일 승자 또는 공동 1등
      const winnerIdx = winnerIndexFromQuarterScores(qs, gameMatchups)
      if (winnerIdx < 0) {
        const totals = qs.map(arr => (Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0))
        const maxTotal = Math.max(...totals)
        for (let idx = 0; idx < totals.length; idx++) {
          const total = totals[idx]
          if (total === maxTotal) {
            // 3팀에서 게임에 전혀 참여하지 않은 팀은 제외
            if (gamesPlayed3 && gamesPlayed3[idx] === 0) continue
            topTeams.add(idx)
          }
        }
        // 만약 필터링 후 아무도 없으면(예: 0:0 한 게임만 존재) 참여한 팀들만 무승부로 처리
        if (topTeams.size === 0 && gamesPlayed3) {
          gamesPlayed3.forEach((gp, idx) => { if (gp > 0) topTeams.add(idx) })
        }
      } else {
        topTeams.add(winnerIdx)
      }

      // 이후 result 계산 시 gamesPlayed3를 사용하여 완전 불참 팀은 스킵
      if (gamesPlayed3) {
        // result 계산 루프 전에 저장 (아래 for 루프에서 사용)
        m.__gamesPlayed3 = gamesPlayed3
      }
    }
    
    const matchTS = extractMatchTS(m)
    for (let ti = 0; ti < teams.length; ti++) {
      // 3팀 특수: 완전 불참 팀은 스킵 (경기수/승무패 미반영)
      if (m.__gamesPlayed3 && m.__gamesPlayed3[ti] === 0) continue
      let result
      if (topTeams.size > 1 && topTeams.has(ti)) {
        // 공동 1등인 경우 무승부 (또는 구장별 승자 중 하나)
        // 구장 분리된 경우: 각 구장의 승자는 모두 승리로 처리
        if (separation) {
          result = 'W' // 구장별 승자는 승리
        } else {
          result = 'D' // 기존 공동 1등은 무승부
        }
      } else if (topTeams.size === 1 && topTeams.has(ti)) {
        // 단독 1등인 경우 승리
        result = 'W'
      } else {
        // 나머지는 패배
        result = 'L'
      }

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
  const playerArray = players || []
  const idToPlayer = new Map(playerArray.map(p => [toStr(p.id), p]))
  const stats = new Map()
  const last5Map = new Map()
  const lastWinTSMap = new Map()
  
  // 드래프트 매치만 필터링하고, 유효한 게임 데이터가 있는 매치만 포함
  const validMatches = [...(matches || [])]
    .filter(isDraftMatch)
    .filter(hasValidGameData)
    .sort((a, b) => extractMatchTS(a) - extractMatchTS(b))
  
  for (const m of validMatches) {
    const qs = coerceQuarterScores(m) || []
    if (!Array.isArray(qs) || qs.length === 0) continue
    const gameMatchups = m?.gameMatchups || null
    const teamCount = qs.length
    const caps = extractCaptainsByTeam(m)
    if (!Array.isArray(caps) || caps.length === 0) continue

    // 구장 분리 체크 (4팀+ 매치업 모드)
    const separation = (teamCount >= 4 && gameMatchups && Array.isArray(gameMatchups) && gameMatchups.length > 0)
      ? checkFieldSeparation(gameMatchups, teamCount)
      : null
    
    // 승자 결정
    const topTeams = new Set()
    
    if (separation) {
      // 구장별로 분리된 경우: 각 구장의 승자를 모두 topTeams에 추가
      const { field1Teams, field2Teams } = separation
      
      const getFieldWinners = (fieldTeams, fieldIdx) => {
        const teamGamePoints = {}
        const teamTotals = {}
        const gamesPlayed = {}
        
        fieldTeams.forEach(t => {
          teamGamePoints[t] = []
          teamTotals[t] = 0
          gamesPlayed[t] = 0
        })
        
        const maxQ = Math.max(0, ...qs.map(a => Array.isArray(a) ? a.length : 0))
        
        for (let qi = 0; qi < maxQ; qi++) {
          const matchup = gameMatchups[qi]
          if (!matchup || !Array.isArray(matchup)) continue
          const pair = matchup[fieldIdx]
          if (!Array.isArray(pair) || pair.length !== 2) continue
          const [a, b] = pair
          if (!fieldTeams.has(a) || !fieldTeams.has(b)) continue
          
          const aScore = Number(qs[a]?.[qi] ?? 0)
          const bScore = Number(qs[b]?.[qi] ?? 0)
          teamTotals[a] += aScore
          teamTotals[b] += bScore
          gamesPlayed[a] += 1
          gamesPlayed[b] += 1
          
          let aPts = 0, bPts = 0
          if (aScore > bScore) { aPts = 3; bPts = 0 }
          else if (bScore > aScore) { aPts = 0; bPts = 3 }
          else { aPts = 1; bPts = 1 }
          
          teamGamePoints[a].push(aPts)
          teamGamePoints[b].push(bPts)
        }
        
        const totalPoints = {}
        Object.keys(teamGamePoints).forEach(t => {
          totalPoints[t] = teamGamePoints[t].reduce((a,b) => a+b, 0)
        })
        
        const maxPts = Math.max(...Object.values(totalPoints))
        let winners = Object.keys(totalPoints)
          .filter(t => totalPoints[t] === maxPts)
          .map(t => parseInt(t))
        
        // 동점일 때 골득실로 판단
        if (winners.length > 1) {
          const maxGoals = Math.max(...winners.map(t => teamTotals[t]))
          winners = winners.filter(t => teamTotals[t] === maxGoals)
        }
        
        return winners
      }
      
      const field1Winners = getFieldWinners(field1Teams, 0)
      const field2Winners = getFieldWinners(field2Teams, 1)
      
      field1Winners.forEach(t => topTeams.add(t))
      field2Winners.forEach(t => topTeams.add(t))
      
    } else {
      // 3팀 특수 처리: 실제로 경기에 참가하지 않은 팀(게임 수 0)은 무승부 그룹 포함/패배 처리하지 않음
      let gamesPlayed3 = null
      if (teamCount === 3 && (!gameMatchups || !Array.isArray(gameMatchups))) {
        const pairs = [[0,1],[1,2],[0,2]]
        const maxQLocal = Math.max(0, ...qs.map(a => Array.isArray(a) ? a.length : 0))
        gamesPlayed3 = [0,0,0]
        for (let qi = 0; qi < maxQLocal; qi++) {
          const [a,b] = pairs[qi % 3]
          if (qs[a] && qi < qs[a].length || qs[b] && qi < qs[b].length) {
            gamesPlayed3[a] += 1
            gamesPlayed3[b] += 1
          }
        }
      }

      // 기존 로직: 단일 승자 또는 공동 1등
      const winnerIdx = winnerIndexFromQuarterScores(qs, gameMatchups)
      if (winnerIdx < 0) {
        const totals = qs.map(arr => (Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0))
        const maxTotal = Math.max(...totals)
        for (let idx = 0; idx < totals.length; idx++) {
          const total = totals[idx]
          if (total === maxTotal) {
            if (gamesPlayed3 && gamesPlayed3[idx] === 0) continue
            topTeams.add(idx)
          }
        }
        if (topTeams.size === 0 && gamesPlayed3) {
          gamesPlayed3.forEach((gp, idx) => { if (gp > 0) topTeams.add(idx) })
        }
      } else {
        topTeams.add(winnerIdx)
      }

      if (gamesPlayed3) {
        m.__gamesPlayed3_caps = gamesPlayed3
      }
    }

    const matchTS = extractMatchTS(m)
    for (let ti = 0; ti < caps.length; ti++) {
      const pid = toStr(caps[ti])
      if (!pid) continue

      // 3팀 특수: 완전 불참 팀은 스킵
      if (m.__gamesPlayed3_caps && m.__gamesPlayed3_caps[ti] === 0) continue

      let result
      if (topTeams.size > 1 && topTeams.has(ti)) {
        // 공동 1등인 경우 무승부 (또는 구장별 승자 중 하나)
        // 구장 분리된 경우: 각 구장의 승자는 모두 승리로 처리
        if (separation) {
          result = 'W' // 구장별 승자는 승리
        } else {
          result = 'D' // 기존 공동 1등은 무승부
        }
      } else if (topTeams.size === 1 && topTeams.has(ti)) {
        // 단독 1등인 경우 승리
        result = 'W'
      } else {
        // 나머지는 패배
        result = 'L'
      }

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
  const playerArray = players || []
  const idToPlayer = new Map(playerArray.map(p => [toStr(p.id), p]))
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

/* --------------------- Cards (Yellow/Red) Computation --------------------- */
/**
 * Compute cards leaderboard rows (yellow/red)
 */
export function computeCardsRows(players = [], matches = []) {
  const playerArray = players || []
  const idToPlayer = new Map(playerArray.map(p => [toStr(p.id), p]))
  const tally = new Map()

  for (const m of (matches || [])) {
    const statsMap = extractStatsByPlayer(m)
    for (const [pidRaw, rec] of Object.entries(statsMap)) {
      const pid = toStr(pidRaw)
      const p = idToPlayer.get(pid)
      if (!p) continue
      const row = tally.get(pid) || {
        id: pid,
        name: p.name,
        membership: p.membership || '',
        photoUrl: p.photoUrl || null,
        y: 0,
        r: 0,
        b: 0
      }
      row.y += Number(rec?.yellowCards || 0)
      row.r += Number(rec?.redCards || 0)
      row.b += Number(rec?.blackCards || 0)
      tally.set(pid, row)
    }
  }

  const rows = Array.from(tally.values()).filter(r => (r.y + r.r) > 0 || r.b > 0)
  // Default sort: red > yellow > black > name
  rows.sort((a, b) => (b.r - a.r) || (b.y - a.y) || (b.b - a.b) || a.name.localeCompare(b.name))
  let lastRank = 0
  let lastKey = null
  return rows.map((r, i) => {
    const key = `${r.r}-${r.y}-${r.b}`
    const rank = (i === 0) ? 1 : (key === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = key
    return { ...r, rank }
  })
}
