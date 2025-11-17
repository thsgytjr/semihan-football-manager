import { useEffect, useMemo, useState } from 'react'
import { fetchAllMoMVotes } from '../services/momVotes.service'
import { buildMoMAwardsSummary } from '../lib/momUtils'

function parseMatchDate(match) {
  if (!match) return null
  const candidates = [match.dateISO, match.date, match.matchDate, match.created_at, match.createdAt]
  for (const value of candidates) {
    if (!value) continue
    const ts = new Date(value)
    if (!Number.isNaN(ts.getTime())) {
      return ts
    }
  }
  return null
}

export function useMoMAwardsSummary(matches = [], { limit = 40 } = {}) {
  const [countsByPlayer, setCountsByPlayer] = useState({})
  const [winnersByMatch, setWinnersByMatch] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const recentMatches = useMemo(() => {
    if (!Array.isArray(matches) || matches.length === 0) return []
    const enriched = matches
      .map(match => ({ match, ts: parseMatchDate(match) }))
      .filter(item => item.match?.id && item.ts)
      .sort((a, b) => b.ts - a.ts)
      .map(item => item.match)
    if (typeof limit === 'number' && limit > 0) {
      return enriched.slice(0, limit)
    }
    return enriched
  }, [matches, limit])

  const matchIds = useMemo(() => recentMatches.map(m => m?.id).filter(Boolean), [recentMatches])
  const matchKey = useMemo(() => matchIds.join(','), [matchIds])

  useEffect(() => {
    if (!matchIds.length) {
      setCountsByPlayer({})
      setWinnersByMatch({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchAllMoMVotes(matchIds)
      .then(votes => {
        if (cancelled) return
        const summary = buildMoMAwardsSummary({ votes, matches: recentMatches })
        setCountsByPlayer(summary.countsByPlayer || {})
        setWinnersByMatch(summary.winnersByMatch || {})
      })
      .catch(err => {
        if (cancelled) return
        setError(err)
        setCountsByPlayer({})
        setWinnersByMatch({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [matchKey, recentMatches, matchIds.length])

  return {
    countsByPlayer,
    winnersByMatch,
    loading,
    error,
  }
}
