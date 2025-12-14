import { toStr, extractStatsByPlayer, extractAttendeeIds, isRefMatch } from './matchUtils'

const HOUR_MS = 60 * 60 * 1000
export const MOM_VOTE_WINDOW_HOURS = 24
export const MOM_ANNOUNCE_WINDOW_HOURS = 24

function getMatchDayEnd(match) {
  if (!match) return null
  const iso = match.dateISO || match.date || match.date_local || match.matchDate
  if (!iso) return null
  const base = new Date(iso)
  if (Number.isNaN(base.getTime())) return null
  const end = new Date(base)
  end.setHours(23, 59, 59, 999)
  return end
}

function hasQuarterScores(qs) {
  if (!Array.isArray(qs)) return false
  return qs.some(team => Array.isArray(team) && team.some(score => score !== null && score !== undefined))
}

export function hasScoreData(match) {
  if (!match) return false
  const stats = match.stats
  if (stats && typeof stats === 'object' && Object.keys(stats).length > 0) return true
  const draftStats = match.draft?.stats
  if (draftStats && typeof draftStats === 'object' && Object.keys(draftStats).length > 0) return true
  if (hasQuarterScores(match.quarterScores)) return true
  if (hasQuarterScores(match.draft?.quarterScores)) return true
  return false
}

export function getMomAnchorISO(match) {
  if (!match) return null
  return match.momVoteAnchor ||
    match.draft?.momVoteAnchor ||
    match.updated_at ||
    match.updatedAt ||
    match.created_at ||
    match.createdAt ||
    match.dateISO ||
    null
}

export function getMoMWindow(match) {
  if (!match) return null
  if (!hasScoreData(match)) return null
  const anchorISO = getMomAnchorISO(match)
  if (!anchorISO) return null
  const anchor = new Date(anchorISO)
  if (Number.isNaN(anchor.getTime())) return null
  const defaultVoteEnd = new Date(anchor.getTime() + MOM_VOTE_WINDOW_HOURS * HOUR_MS)
  const matchDayEnd = getMatchDayEnd(match)
  const voteEnd = matchDayEnd && matchDayEnd.getTime() < defaultVoteEnd.getTime()
    ? matchDayEnd
    : defaultVoteEnd
  const announceEnd = new Date(voteEnd.getTime() + MOM_ANNOUNCE_WINDOW_HOURS * HOUR_MS)
  return { anchor, voteEnd, announceEnd, matchDayEnd }
}

export function getMoMPhase(match, now = new Date()) {
  const windowMeta = getMoMWindow(match)
  if (!windowMeta) return 'hidden'

  // Referee Mode Logic: Only open if manually enabled OR 3 hours passed since match time
  if (isRefMatch(match)) {
    const isManuallyOpen = match?.stats?.momManualOpen === true
    
    // If manually opened, force 'vote' phase immediately (unless already closed by time)
    if (isManuallyOpen) {
      const ts = now.getTime()
      if (ts < windowMeta.voteEnd.getTime()) return 'vote'
      if (ts < windowMeta.announceEnd.getTime()) return 'announce'
      return 'closed'
    }

    // Use dateISO (scheduled time) if available, otherwise fallback to anchor
    const matchTime = match.dateISO ? new Date(match.dateISO).getTime() : windowMeta.anchor.getTime()
    const threeHours = 3 * 60 * 60 * 1000
    const timePassed = (now.getTime() - matchTime) >= threeHours

    if (!timePassed) {
      return 'hidden'
    }
  }

  const ts = now.getTime()
  if (ts < windowMeta.anchor.getTime()) return 'pending'
  if (ts < windowMeta.voteEnd.getTime()) return 'vote'
  if (ts < windowMeta.announceEnd.getTime()) return 'announce'
  return 'closed'
}

export function findLatestMatchWithScores(matches = []) {
  if (!Array.isArray(matches)) return null
  return [...matches]
    .filter(m => m?.dateISO)
    .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
    .find(hasScoreData) || null
}

const TIE_BREAKER_ORDER = ['goals', 'assists', 'cleanSheet', 'appearances']

function normalizeTieRecord(raw) {
  if (raw == null) {
    return { goals: 0, assists: 0, cleanSheet: 0, appearances: 0 }
  }
  if (typeof raw === 'number') {
    return { goals: raw, assists: 0, cleanSheet: 0, appearances: 0 }
  }
  return {
    goals: Number(raw.goals || 0),
    assists: Number(raw.assists || 0),
    cleanSheet: Number(raw.cleanSheet || raw.cs || 0),
    appearances: Number(raw.appearances || 0),
  }
}

function resolveTieWithCriteria(winnerIds = [], tieRecords = {}) {
  let remaining = winnerIds.map(pid => ({ pid, ...normalizeTieRecord(tieRecords[pid]) }))
  let lastCategory = null
  
  for (const category of TIE_BREAKER_ORDER) {
    const maxVal = Math.max(...remaining.map(item => item[category] ?? 0))
    
    // 최댓값이 0이면 이 기준으로는 구분 불가 (다음 기준으로)
    if (maxVal === 0) {
      lastCategory = category
      continue
    }
    
    const filtered = remaining.filter(item => (item[category] ?? 0) === maxVal)
    
    // 한 명만 남으면 승자 결정
    if (filtered.length === 1) {
      return {
        winners: filtered.map(item => item.pid),
        info: { applied: true, category, requiresManual: false }
      }
    }
    
    // 여러 명이 같은 값이면 다음 기준으로
    remaining = filtered
    lastCategory = category
  }
  
  // 모든 기준을 적용했는데도 여러 명이 남으면 수동 결정 필요
  return {
    winners: remaining.map(item => item.pid),
    info: { applied: true, category: lastCategory ?? 'manual', requiresManual: true }
  }
}

export function summarizeVotes(votes = [], { tieBreakerScores = null } = {}) {
  const tally = {}
  votes.forEach(vote => {
    const pid = toStr(vote.playerId || vote.player_id)
    if (!pid) return
    tally[pid] = (tally[pid] || 0) + 1
  })
  const entries = Object.entries(tally)
  const maxVotes = entries.length ? Math.max(...entries.map(([, cnt]) => cnt)) : 0
  let winners = entries
    .filter(([, cnt]) => cnt === maxVotes && cnt > 0)
    .map(([pid]) => pid)

  let tieBreakApplied = false
  let tieBreakCategory = null
  let tieBreakRequiresManual = false

  if (winners.length > 1 && tieBreakerScores && typeof tieBreakerScores === 'object') {
    const { winners: resolved, info } = resolveTieWithCriteria(winners, tieBreakerScores)
    winners = resolved
    tieBreakApplied = info?.applied ?? false
    tieBreakCategory = info?.category ?? null
    tieBreakRequiresManual = Boolean(info?.requiresManual)
  }
  return {
    tally,
    total: votes.length,
    maxVotes,
    winners,
    tieBreakApplied,
    tieBreakCategory,
    tieBreakRequiresManual,
  }
}

export function buildMoMTieBreakerScores(statsByPlayer = {}, match = null) {
  const map = {}
  if (!statsByPlayer || typeof statsByPlayer !== 'object') statsByPlayer = {}
  const attendees = match ? extractAttendeeIds(match) : []
  const attendeeSet = new Set(attendees.map(toStr))
  const allIds = new Set([...Object.keys(statsByPlayer), ...Array.from(attendeeSet)])
  allIds.forEach(pid => {
    if (!pid) return
    const stat = statsByPlayer[pid] || {}
    map[toStr(pid)] = {
      goals: Number(stat?.goals || 0),
      assists: Number(stat?.assists || 0),
      cleanSheet: Number(stat?.cleanSheet || stat?.cs || 0),
      appearances: attendeeSet.has(toStr(pid)) ? 1 : 0,
    }
  })
  return map
}

export function buildMoMAwardsSummary({ votes = [], matches = [], now = new Date() } = {}) {
  const countsByPlayer = {}
  const winnersByMatch = {}
  if (!Array.isArray(votes) || votes.length === 0 || !Array.isArray(matches) || matches.length === 0) {
    return { countsByPlayer, winnersByMatch }
  }

  const matchMap = new Map()
  matches.forEach(match => {
    if (!match?.id) return
    matchMap.set(toStr(match.id), match)
  })

  const tieBreakerCache = new Map()
  matches.forEach(match => {
    if (!match?.id) return
    const statsByPlayer = extractStatsByPlayer(match)
    tieBreakerCache.set(toStr(match.id), buildMoMTieBreakerScores(statsByPlayer, match))
  })

  const votesByMatch = new Map()
  votes.forEach(vote => {
    const matchId = toStr(vote.matchId || vote.match_id)
    if (!matchId) return
    if (!votesByMatch.has(matchId)) votesByMatch.set(matchId, [])
    votesByMatch.get(matchId).push(vote)
  })

  matches.forEach(match => {
    if (!match?.id) return
    const matchId = toStr(match.id)
    const phase = getMoMPhase(match, now)
    const tieScores = tieBreakerCache.get(matchId)
    const voteArr = votesByMatch.get(matchId) || []
    const summary = summarizeVotes(voteArr, { tieBreakerScores: tieScores })
    const overrideRecord = match?.draft?.momOverride || match?.momOverride
    const overridePid = overrideRecord?.playerId ? toStr(overrideRecord.playerId) : null
    if (!overridePid && (phase === 'hidden' || phase === 'pending' || phase === 'vote')) {
      return
    }
    if (overridePid) {
      winnersByMatch[matchId] = {
        ...summary,
        winners: [overridePid],
        override: overrideRecord,
        manualResolutionRequired: false,
      }
      countsByPlayer[overridePid] = (countsByPlayer[overridePid] || 0) + 1
      return
    }
    if (!summary.total || summary.maxVotes === 0) return
    if (summary.tieBreakRequiresManual) {
      winnersByMatch[matchId] = {
        ...summary,
        winners: [],
        manualResolutionRequired: true,
        pendingWinners: summary.winners,
      }
      return
    }
    winnersByMatch[matchId] = {
      ...summary,
      manualResolutionRequired: false,
    }
    summary.winners.forEach(pid => {
      countsByPlayer[pid] = (countsByPlayer[pid] || 0) + 1
    })
  })

  return { countsByPlayer, winnersByMatch }
}

export function getCountdownParts(target, nowTs = Date.now()) {
  if (!target) return null
  const targetMs = target instanceof Date ? target.getTime() : new Date(target).getTime()
  if (!Number.isFinite(targetMs)) return null
  const diffMs = targetMs - nowTs
  const clamped = Math.max(diffMs, 0)
  const totalSeconds = Math.floor(clamped / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const label = days > 0 ? `${days}일 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
  return { diffMs, days, hours, minutes, seconds, label }
}
