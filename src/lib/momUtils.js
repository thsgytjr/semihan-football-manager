import { toStr, extractStatsByPlayer } from './matchUtils'

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

  if (winners.length > 1 && tieBreakerScores && typeof tieBreakerScores === 'object') {
    const scored = winners.map(pid => {
      const raw = Number(tieBreakerScores[pid])
      return { pid, score: Number.isFinite(raw) ? raw : 0 }
    })
    const bestScore = Math.max(...scored.map(s => s.score))
    if (Number.isFinite(bestScore)) {
      const narrowed = scored.filter(s => s.score === bestScore).map(s => s.pid)
      if (narrowed.length > 0 && narrowed.length <= winners.length) {
        winners = narrowed
      }
    }
  }
  return {
    tally,
    total: votes.length,
    maxVotes,
    winners,
  }
}

export function buildMoMTieBreakerScores(statsByPlayer = {}) {
  const map = {}
  if (!statsByPlayer || typeof statsByPlayer !== 'object') return map
  Object.entries(statsByPlayer).forEach(([pid, stat]) => {
    if (!pid) return
    const goals = Number(stat?.goals || 0)
    const assists = Number(stat?.assists || 0)
    const cleanSheet = Number(stat?.cleanSheet || 0)
    map[toStr(pid)] = goals * 100 + assists * 10 + cleanSheet
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
    tieBreakerCache.set(toStr(match.id), buildMoMTieBreakerScores(statsByPlayer))
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
      }
      countsByPlayer[overridePid] = (countsByPlayer[overridePid] || 0) + 1
      return
    }
    if (!summary.total || summary.maxVotes === 0) return
    winnersByMatch[matchId] = summary
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
