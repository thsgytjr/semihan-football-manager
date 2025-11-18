import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractStatsByPlayer, extractAttendeeIds, toStr } from '../lib/matchUtils'
import { hashText } from '../lib/hash'
import { getOrCreateEnhancedVisitorId } from '../lib/deviceFingerprint'
import { getVisitorIP } from '../lib/visitorTracking'
import { fetchMoMVotes, submitMoMVote } from '../services/momVotes.service'
import { findLatestMatchWithScores, getMoMPhase, getMoMWindow, summarizeVotes, buildMoMTieBreakerScores } from '../lib/momUtils'

function findLatestMatch(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null
  return [...matches]
    .filter(m => m?.dateISO)
    .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
    [0]
}

export function useMoMPrompt({ matches = [], players = [] }) {
  const [votes, setVotes] = useState([])
  const [loadingVotes, setLoadingVotes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [ipHash, setIpHash] = useState(null)
  const [visitorId, setVisitorId] = useState(null)
  const [alreadyVoted, setAlreadyVoted] = useState(null)
  const [voteStatusReady, setVoteStatusReady] = useState(false)
  const [nowTs, setNowTs] = useState(() => Date.now())

  const latestWithScores = useMemo(() => findLatestMatchWithScores(matches), [matches])
  const latestMatch = useMemo(() => latestWithScores, [latestWithScores])

  const windowMeta = useMemo(() => {
    if (!latestMatch) return null
    return getMoMWindow(latestMatch)
  }, [latestMatch])

  const phase = useMemo(() => {
    if (!latestMatch) return 'hidden'
    const base = getMoMPhase(latestMatch, new Date(nowTs))
    if (base === 'hidden' && windowMeta) return 'vote'
    return base
  }, [latestMatch, nowTs, windowMeta])

  const statsByPlayer = useMemo(() => {
    if (!latestMatch) return {}
    return extractStatsByPlayer(latestMatch)
  }, [latestMatch])

  const hasRecordedStats = useMemo(() => {
    if (!latestMatch) return false
    const values = Object.values(statsByPlayer || {})
    if (values.length === 0) return false
    return values.some(entry => {
      const goals = Number(entry?.goals || 0)
      const assists = Number(entry?.assists || 0)
      return goals > 0 || assists > 0
    })
  }, [latestMatch, statsByPlayer])

  const canShowVotePopup = phase === 'vote' && hasRecordedStats && (
    voteStatusReady && alreadyVoted === false
  )

  const shouldShow = Boolean(latestMatch) && hasRecordedStats && canShowVotePopup

  const roster = useMemo(() => {
    if (!latestMatch) return []
    const ids = new Set(extractAttendeeIds(latestMatch))
    return players.filter(p => ids.has(toStr(p.id)))
  }, [latestMatch, players])

  const recommended = useMemo(() => {
    if (!latestMatch) return []
    const scored = roster.map(p => {
      const stats = statsByPlayer[toStr(p.id)] || { goals: 0, assists: 0 }
      const score = (stats.goals || 0) + (stats.assists || 0)
      return { player: p, score }
    })
    const sorted = scored.sort((a, b) => b.score - a.score)
    const unique = []
    for (const item of sorted) {
      if (!unique.find(u => toStr(u.player.id) === toStr(item.player.id))) {
        unique.push(item)
      }
      if (unique.length >= 5) break
    }
    return unique.map(i => i.player)
  }, [roster, statsByPlayer])

  const playerMap = useMemo(() => {
    const map = new Map()
    players.forEach(p => map.set(toStr(p.id), p))
    return map
  }, [players])

  const tieBreakerScores = useMemo(() => buildMoMTieBreakerScores(statsByPlayer), [statsByPlayer])

  const summary = useMemo(() => summarizeVotes(votes, { tieBreakerScores }), [votes, tieBreakerScores])
  const winners = useMemo(() => {
    if (!summary.winners.length) return []
    return summary.winners.map(pid => {
      const player = playerMap.get(pid) || roster.find(p => toStr(p.id) === pid) || null
      return {
        playerId: pid,
        votes: summary.tally[pid] || 0,
        player,
        name: player?.name || pid,
        photoUrl: player?.photoUrl || null,
      }
    })
  }, [summary, playerMap, roster])

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setVoteStatusReady(false)
    setAlreadyVoted(null)
  }, [latestMatch?.id])

  useEffect(() => {
    if (!latestMatch?.id) {
      setVotes([])
      return
    }
  const allowFetch = phase === 'vote' || phase === 'announce'
    if (!allowFetch) {
      setVotes([])
      return
    }
    setLoadingVotes(true)
    fetchMoMVotes(latestMatch.id)
      .then(setVotes)
      .catch(err => setError(err))
      .finally(() => setLoadingVotes(false))
  }, [latestMatch?.id, phase])


  useEffect(() => {
    ;(async () => {
      try {
        const vid = await getOrCreateEnhancedVisitorId()
        setVisitorId(vid)
      } catch (error) {
        console.error('Failed to get visitor ID:', error)
        setVisitorId(null)
      }
    })()
    
    getVisitorIP()
      .then(ip => ip ? hashText(ip) : null)
      .then(setIpHash)
      .catch(() => setIpHash(null))
  }, [])

  useEffect(() => {
    if (!latestMatch?.id) {
      setAlreadyVoted(null)
      setVoteStatusReady(false)
      return
    }
    if (loadingVotes) {
      setVoteStatusReady(false)
      return
    }
    if (!votes || votes.length === 0) {
      if (!ipHash && !visitorId) {
        setVoteStatusReady(false)
        return
      }
      setAlreadyVoted(false)
      setVoteStatusReady(true)
      return
    }
    if (!ipHash && !visitorId) {
      setVoteStatusReady(false)
      return
    }
    
    // ⭐ 개선된 중복 체크: IP **AND** Visitor ID가 모두 일치해야 중복으로 판단
    // 같은 와이파이(같은 IP)를 쓰는 여러 디바이스(다른 visitor_id)는 각각 투표 가능
    const hasVote = votes.some(v => {
      // 둘 다 있는 경우: 둘 다 일치해야 중복
      if (ipHash && visitorId && v.ipHash && v.visitorId) {
        return v.ipHash === ipHash && v.visitorId === visitorId
      }
      
      // 하나만 있는 경우 (레거시 호환성)
      if (ipHash && v.ipHash && !v.visitorId) {
        return v.ipHash === ipHash
      }
      if (visitorId && v.visitorId && !v.ipHash) {
        return v.visitorId === visitorId
      }
      
      return false
    })
    
    setAlreadyVoted(hasVote)
    setVoteStatusReady(true)
  }, [latestMatch?.id, votes, ipHash, visitorId, loadingVotes])

  const reloadVotes = useCallback(async () => {
    if (!latestMatch?.id) return []
    setLoadingVotes(true)
    try {
      const data = await fetchMoMVotes(latestMatch.id)
      setVotes(data)
      return data
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setLoadingVotes(false)
    }
  }, [latestMatch?.id])

  const submitVote = async ({ playerId, voterLabel }) => {
    if (!latestMatch?.id || !playerId) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitMoMVote({
        matchId: latestMatch.id,
        playerId,
        voterLabel,
        ipHash,
        visitorId,
      })
      setVotes(prev => [...prev, result])
      setAlreadyVoted(true)
      return result
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  return {
    latestMatch,
    shouldShow,
    hasRecordedStats,
    phase,
    alreadyVoted: alreadyVoted === true,
    voteStatusReady,
    roster,
    recommended,
    statsByPlayer,
    votes,
    tally: summary.tally,
    totalVotes: summary.total,
    winners,
    windowMeta,
    nowTs,
    loadingVotes,
    submitting,
    error,
    submitVote,
    reloadVotes,
  }
}