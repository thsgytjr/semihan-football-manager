import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import InitialAvatar from './InitialAvatar'
import ConfirmDialog from './ConfirmDialog'
import { X, Edit2, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'

const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

export default function RefereeTimelineEditor({ match, players, teams: providedTeams, onSave, cardsEnabled = true }) {
  const { t } = useTranslation()
  const [timeline, setTimeline] = useState(
    Array.isArray(match?.stats?.__events) ? [...match.stats.__events] : []
  )
  const [editingEvent, setEditingEvent] = useState(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState({ open: false, eventId: null })
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDeleteGame, setConfirmDeleteGame] = useState({ open: false, gameIndex: null })
  const [showSaved, setShowSaved] = useState(false)
  const [wakeLockSupported, setWakeLockSupported] = useState(typeof navigator !== 'undefined' && 'wakeLock' in navigator)
  const [wakeLockActive, setWakeLockActive] = useState(false)
  const [wakeLockError, setWakeLockError] = useState('')
  const wakeLockRef = React.useRef(null)
  
  // Default expanded games
  const [expandedGames, setExpandedGames] = useState(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))

  // Sync timeline when match changes (e.g., after reset or new referee mode recording)
  React.useEffect(() => {
    setTimeline(Array.isArray(match?.stats?.__events) ? [...match.stats.__events] : [])
  }, [match?.id, match?.stats?.__events])

  const releaseWakeLock = React.useCallback(async () => {
    try {
      if (wakeLockRef.current?.release) {
        await wakeLockRef.current.release()
      }
    } catch (err) {
      console.warn('wakeLock release error', err)
    } finally {
      wakeLockRef.current = null
      setWakeLockActive(false)
    }
  }, [])

  const requestWakeLock = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.wakeLock) {
      setWakeLockSupported(false)
      return false
    }
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      wakeLockRef.current = sentinel
      setWakeLockActive(true)
      setWakeLockError('')
      sentinel.addEventListener('release', () => {
        setWakeLockActive(false)
      })
      return true
    } catch (err) {
      console.warn('wakeLock request error', err)
      setWakeLockActive(false)
      setWakeLockError(err?.message || '화면 깨우기 잠금 요청에 실패했습니다')
      return false
    }
  }, [])

  // Re-request when returning to tab; release when leaving
  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (wakeLockActive && !wakeLockRef.current) {
          requestWakeLock()
        }
      } else {
        if (wakeLockRef.current) {
          releaseWakeLock()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [wakeLockActive, releaseWakeLock, requestWakeLock])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      releaseWakeLock()
    }
  }, [releaseWakeLock])

  const toggleGame = (gameIndex) => {
    const newSet = new Set(expandedGames)
    if (newSet.has(gameIndex)) {
      newSet.delete(gameIndex)
    } else {
      newSet.add(gameIndex)
    }
    setExpandedGames(newSet)
  }

  const toggleWakeLock = async () => {
    if (wakeLockRef.current || wakeLockActive) {
      await releaseWakeLock()
    } else {
      await requestWakeLock()
    }
  }

  const playersById = useMemo(() => {
    return new Map(players.map(p => [toStr(p.id), p]))
  }, [players])

  const maxGameCount = useMemo(() => {
    const fromEvents = timeline.reduce((max, ev) => Math.max(max, Number(ev?.gameIndex ?? 0) + 1), 0)
    const fromGames = Array.isArray(match?.stats?.__games) ? match.stats.__games.length : 0
    const maxFromQuarterScores = (qs) => Array.isArray(qs)
      ? qs.reduce((max, arr) => Math.max(max, Array.isArray(arr) ? arr.length : 0), 0)
      : 0
    const fromQuarters = Math.max(
      maxFromQuarterScores(match?.quarterScores),
      maxFromQuarterScores(match?.draft?.quarterScores)
    )
    return Math.max(1, fromEvents, fromGames, fromQuarters)
  }, [timeline, match])

  // Hydrate teams with full player objects to ensure modals work correctly
  const teams = useMemo(() => {
    if (providedTeams && providedTeams.length > 0) return providedTeams

    if (!match || !match.teams) return [[], []]
    return match.teams.map(team => 
      team.map(p => {
        const pId = (typeof p === 'object' && p !== null) ? p.id : p
        return playersById.get(toStr(pId)) || { id: pId, name: 'Unknown' }
      })
    )
  }, [match, playersById, providedTeams])

  const sortedTimeline = useMemo(() => {
    return [...timeline].sort((a, b) => {
      const aGame = Number(a.gameIndex || 0)
      const bGame = Number(b.gameIndex || 0)
      if (aGame !== bGame) return aGame - bGame
      const aMin = Number(a.minute || 0)
      const bMin = Number(b.minute || 0)
      if (aMin !== bMin) return aMin - bMin
      const aTs = a.timestamp || 0
      const bTs = b.timestamp || 0
      return aTs - bTs
    })
  }, [timeline])

  // Group events by game
  const eventsByGame = useMemo(() => {
    const groups = {}
    sortedTimeline.forEach(ev => {
      const gIdx = ev.gameIndex || 0
      if (!groups[gIdx]) groups[gIdx] = []
      groups[gIdx].push(ev)
    })
    for (let i = 0; i < maxGameCount; i += 1) {
      if (!groups[i]) groups[i] = []
    }
    return groups
  }, [sortedTimeline, maxGameCount])

  const participantsByGame = useMemo(() => {
    const byGame = Array.from({ length: maxGameCount }, () => new Set())
    const addParticipant = (gi, ti) => {
      if (!Number.isFinite(ti)) return
      if (!byGame[gi]) byGame[gi] = new Set()
      byGame[gi].add(Number(ti))
    }

    const gameMeta = Array.isArray(match?.stats?.__games) ? match.stats.__games : []
    gameMeta.forEach((g, gi) => {
      if (!Array.isArray(g?.teamIndices)) return
      g.teamIndices.forEach(ti => addParticipant(gi, ti))
    })

    const qsSources = [match?.quarterScores, match?.draft?.quarterScores]
    qsSources.forEach((qs) => {
      if (!Array.isArray(qs)) return
      qs.forEach((teamScores, ti) => {
        if (!Array.isArray(teamScores)) return
        teamScores.forEach((score, gi) => {
          if (score !== null && score !== undefined) addParticipant(gi, ti)
        })
      })
    })

    Object.entries(eventsByGame || {}).forEach(([giStr, evs]) => {
      const gi = Number(giStr) || 0
      ;(evs || []).forEach(ev => {
        const ti = Number(ev.teamIndex ?? 0)
        if (Number.isFinite(ti)) addParticipant(gi, Math.max(0, ti))
      })
    })

    return byGame.map(set => Array.from(set).sort((a, b) => a - b))
  }, [eventsByGame, match?.draft?.quarterScores, match?.quarterScores, match?.stats?.__games, maxGameCount])

  const gameIndices = useMemo(() => {
    return Array.from({ length: maxGameCount }, (_, i) => i)
  }, [maxGameCount])

  const resolvedParticipantsByGame = useMemo(() => {
    const fallback = Array.from({ length: Math.max(teams.length, 2) }, (_, idx) => idx)
    return gameIndices.map((gi) => {
      const participants = participantsByGame[gi]
      if (participants && participants.length > 0) return participants
      return fallback
    })
  }, [gameIndices, participantsByGame, teams.length])

  const gameOptions = useMemo(() => {
    return gameIndices.map((gi) => {
      const labelTeams = resolvedParticipantsByGame[gi]
        ?.map(ti => `팀 ${ti + 1}`)
        ?.join(' vs ')
      const suffix = labelTeams ? ` · ${labelTeams}` : ''
      return {
        value: gi,
        label: `Game ${gi + 1}${suffix}`,
      }
    })
  }, [gameIndices, resolvedParticipantsByGame])

  const teamsPerGame = useMemo(() => {
    return gameIndices.map((gi) => {
      const participants = resolvedParticipantsByGame[gi]
      const entries = participants?.length
        ? participants
        : Array.from({ length: teams.length }, (_, idx) => idx)
      return entries.map((ti) => ({
        teamIndex: ti,
        label: `팀 ${ti + 1}`,
        players: teams[ti] || [],
      }))
    })
  }, [gameIndices, resolvedParticipantsByGame, teams])

  const suggestedNextGameTeams = useMemo(() => {
    const totalTeams = Math.max(teams.length, 2)
    if (totalTeams < 2) return null

    const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`
    const usage = new Map()
    const allPairs = []

    for (let i = 0; i < totalTeams; i += 1) {
      for (let j = i + 1; j < totalTeams; j += 1) {
        const key = pairKey(i, j)
        usage.set(key, 0)
        allPairs.push([i, j])
      }
    }

    if (allPairs.length === 0) return null

    participantsByGame.forEach((teamIndices) => {
      if (!Array.isArray(teamIndices) || teamIndices.length < 2) return
      const unique = []
      teamIndices.forEach((ti) => {
        if (!unique.includes(ti)) unique.push(ti)
      })
      if (unique.length < 2) return
      const [a, b] = unique
      const key = pairKey(a, b)
      if (usage.has(key)) {
        usage.set(key, (usage.get(key) || 0) + 1)
      }
    })

    let bestPair = allPairs[0]
    let bestScore = Number.POSITIVE_INFINITY

    allPairs.forEach((pair) => {
      const key = pairKey(pair[0], pair[1])
      const count = usage.get(key) ?? 0
      if (count < bestScore) {
        bestScore = count
        bestPair = pair
      }
    })

    return bestPair
  }, [participantsByGame, teams])

  const getGameScores = (gameIndex) => {
    const gamesMeta = Array.isArray(match?.stats?.__games) ? match.stats.__games : []
    const gameMeta = gamesMeta?.[gameIndex]
    const metaParticipants = Array.isArray(gameMeta?.teamIndices) && gameMeta.teamIndices.length > 0
      ? gameMeta.teamIndices
      : null

    const fallbackParticipants = participantsByGame[gameIndex]?.length
      ? participantsByGame[gameIndex]
      : Array.from({ length: Math.max(teams.length, 2) }, (_, i) => i)

    const orderedParticipants = (metaParticipants && metaParticipants.length > 0)
      ? metaParticipants
      : (fallbackParticipants.length > 0 ? fallbackParticipants : [0, 1])

    const scoresFromTimeline = orderedParticipants.map(() => 0)
    const scoreEvents = (eventsByGame[gameIndex] || []).filter(ev => ev && (ev.type === 'goal' || ev.type === 'own_goal'))

    const canonicalizeTeamIndex = (rawIdx) => {
      const idx = Number(rawIdx ?? 0)
      if (!Number.isFinite(idx)) return orderedParticipants[0] ?? 0
      if (!metaParticipants || metaParticipants.includes(idx)) return idx
      if (idx >= 0 && idx < metaParticipants.length) {
        return metaParticipants[idx]
      }
      return idx
    }

    if (scoreEvents.length > 0) {
      scoreEvents.forEach(ev => {
        const canonicalTeam = canonicalizeTeamIndex(ev.teamIndex)
        const participantIdx = orderedParticipants.indexOf(canonicalTeam)

        if (ev.type === 'goal') {
          if (participantIdx >= 0) {
            scoresFromTimeline[participantIdx] += 1
          }
          return
        }

        const recipientTeam = orderedParticipants.find(ti => ti !== canonicalTeam) ?? orderedParticipants[0]
        const recipientIdx = orderedParticipants.indexOf(recipientTeam)
        if (recipientIdx >= 0) {
          scoresFromTimeline[recipientIdx] += 1
        }
      })
      return scoresFromTimeline
    }

    if (Array.isArray(gameMeta?.scores) && gameMeta.scores.length > 0) {
      return orderedParticipants.map((ti, idx) => {
        if (metaParticipants) {
          const mappedIdx = metaParticipants.indexOf(ti)
          if (mappedIdx >= 0 && mappedIdx < gameMeta.scores.length) {
            return Number(gameMeta.scores[mappedIdx]) || 0
          }
        }
        if (idx < gameMeta.scores.length) {
          return Number(gameMeta.scores[idx]) || 0
        }
        return 0
      })
    }

    const qsSources = [match?.quarterScores, match?.draft?.quarterScores]
    const quarterScoreFallback = orderedParticipants.map((ti) => {
      for (const qs of qsSources) {
        const existing = Array.isArray(qs?.[ti]) ? qs[ti][gameIndex] : null
        if (existing !== null && existing !== undefined) {
          return Number(existing) || 0
        }
      }
      return 0
    })

    if (quarterScoreFallback.some(score => score !== 0)) {
      return quarterScoreFallback
    }

    return scoresFromTimeline
  }

  const getGameScore = (gameIndex) => {
    const scores = getGameScores(gameIndex)
    const left = scores?.[0] ?? 0
    const right = scores?.[1] ?? 0
    return `${left} : ${right}`
  }

  const handleDeleteEvent = (eventId) => {
    setTimeline(prev => prev.filter(ev => ev.id !== eventId))
    setConfirmDelete({ open: false, eventId: null })
  }

  const handleDeleteGame = (gameIdx) => {
    // Delete events and reindex
    setTimeline(prev => prev
      .filter(ev => Number(ev.gameIndex ?? 0) !== gameIdx)
      .map(ev => {
        const gi = Number(ev.gameIndex ?? 0)
        if (gi > gameIdx) return { ...ev, gameIndex: gi - 1 }
        return ev
      })
    )
    
    // Delete game data from match quarterScores and stats
    if (match?.id && onSave) {
      const patch = {}

      if (Array.isArray(match.quarterScores)) {
        patch.quarterScores = match.quarterScores.map(teamScores => {
          if (!Array.isArray(teamScores)) return teamScores
          return teamScores.filter((_, gi) => gi !== gameIdx)
        })
      }

      if (match.draft && Array.isArray(match.draft.quarterScores)) {
        patch.draft = {
          ...match.draft,
          quarterScores: match.draft.quarterScores.map(teamScores => {
            if (!Array.isArray(teamScores)) return teamScores
            return teamScores.filter((_, gi) => gi !== gameIdx)
          })
        }
      }

      if (match.stats) {
        const nextStats = { ...match.stats }
        if (Array.isArray(match.stats.__games)) {
          nextStats.__games = match.stats.__games.filter((_, gi) => gi !== gameIdx)
        }
        patch.stats = nextStats
      }

      onSave(match.id, patch)
    }
    
    setConfirmDeleteGame({ open: false, gameIndex: null })
  }

  const handleSaveEvent = (updatedEvent) => {
    setTimeline(prev => {
      const idx = prev.findIndex(ev => ev.id === updatedEvent.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updatedEvent
        return next
      }
      return prev
    })
    setEditingEvent(null)
  }

  const handleAddEvent = (newEventOrEvents, newGameTeams = null) => {
    const newEvents = Array.isArray(newEventOrEvents) ? newEventOrEvents : [newEventOrEvents]
    
    const eventsWithIds = newEvents.map(evt => ({
      ...evt,
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: Date.now()
    }))

    setTimeline(prev => [...prev, ...eventsWithIds])
    
    // If this is a new game with team selection, save the team metadata
    if (newGameTeams && newGameTeams.length === 2 && eventsWithIds.length > 0 && match?.id && onSave) {
      const gameIndex = eventsWithIds[0].gameIndex
      
      // Clone stats to append game metadata
      const nextStats = match.stats ? { ...match.stats } : {}
      if (!Array.isArray(nextStats.__games)) {
        nextStats.__games = []
      }
      
      // Ensure array is large enough
      while (nextStats.__games.length <= gameIndex) {
        nextStats.__games.push(null)
      }
      
      // Save team indices for this game
      nextStats.__games[gameIndex] = {
        teamIndices: [...newGameTeams].sort((a, b) => a - b),
        scores: [0, 0], // Initialize scores
      }
      
      onSave(match.id, { stats: nextStats })
    }
    
    setShowAddEvent(false)
    
    // Auto expand the game we just added to
    if (eventsWithIds.length > 0) {
      setExpandedGames(prev => {
        const next = new Set(prev)
        next.add(eventsWithIds[0].gameIndex)
        return next
      })
    }
  }

  const handleSaveToMatch = () => {
    const baseStats = match?.stats && typeof match.stats === 'object' ? match.stats : {}
    const teamCount = Math.max(teams.length || 0, 2)
    const gameCount = Math.max(maxGameCount, 1)

    const createBlankScores = () => Array.from({ length: teamCount }, () => 0)
    const gameScores = Array.from({ length: gameCount }, () => createBlankScores())

    const canonicalParticipants = Array.from({ length: gameCount }, () => new Set())
    const inferredParticipants = Array.from({ length: gameCount }, () => new Set())
    const seedParticipant = (gi, ti) => {
      if (!Number.isFinite(ti)) return
      const num = Number(ti)
      canonicalParticipants[gi]?.add(num)
      inferredParticipants[gi]?.add(num)
    }
    const addInferred = (gi, ti) => {
      if (!Number.isFinite(ti)) return
      inferredParticipants[gi]?.add(Number(ti))
    }

    let existingQS = match?.quarterScores || match?.draft?.quarterScores

    if (!existingQS && match?.stats?.__games && Array.isArray(match.stats.__games)) {
      const savedGames = match.stats.__games
      const teamMajor = Array.from({ length: teamCount }, () => [])

      savedGames.forEach((g) => {
        if (!Array.isArray(g?.scores)) return
        const teamMap = Array.isArray(g.teamIndices) ? g.teamIndices : null

        if (teamMap && teamMap.length > 0) {
          for (let ti = 0; ti < teamCount; ti++) {
            if (!teamMajor[ti]) teamMajor[ti] = []
            const participantIdx = teamMap.indexOf(ti)
            if (participantIdx >= 0 && participantIdx < g.scores.length) {
              teamMajor[ti].push(Number(g.scores[participantIdx]) || 0)
            } else {
              teamMajor[ti].push(null)
            }
          }
        } else {
          g.scores.forEach((val, idx) => {
            if (!teamMajor[idx]) teamMajor[idx] = []
            teamMajor[idx].push(Number(val) || 0)
          })
        }
      })

      if (teamMajor.some(arr => arr.length > 0)) {
        existingQS = teamMajor
      }
    }

    if (Array.isArray(existingQS)) {
      for (let ti = 0; ti < Math.min(teamCount, existingQS.length); ti++) {
        const teamScores = existingQS[ti]
        if (!Array.isArray(teamScores)) continue
        teamScores.forEach((score, gi) => {
          if (score !== null && score !== undefined) seedParticipant(gi, ti)
        })
      }
    }

    const existingGameMeta = Array.isArray(match?.stats?.__games) ? match.stats.__games : []
    existingGameMeta.forEach((g, gi) => {
      const teamMap = Array.isArray(g?.teamIndices) ? g.teamIndices : null
      if (teamMap && teamMap.length > 0) {
        teamMap.forEach(ti => seedParticipant(gi, ti))
      }
    })

    const gamesWithEvents = new Set()
    timeline.forEach(ev => {
      if (ev.type === 'goal' || ev.type === 'own_goal') {
        const gi = Math.max(0, Number(ev.gameIndex) || 0)
        gamesWithEvents.add(gi)
      }
    })

    existingGameMeta.forEach((g, gi) => {
      if (!Array.isArray(g?.scores)) return
      if (gamesWithEvents.has(gi)) return
      const teamMap = Array.isArray(g.teamIndices) && g.teamIndices.length > 0 ? g.teamIndices : null
      if (teamMap && teamMap.length > 0) {
        teamMap.forEach((ti, idx) => {
          addInferred(gi, ti)
          gameScores[gi][ti] = Number(g.scores[idx]) || 0
        })
      } else {
        g.scores.forEach((val, idx) => {
          addInferred(gi, idx)
          if (!canonicalParticipants[gi].has(idx)) {
            canonicalParticipants[gi].add(idx)
          }
          gameScores[gi][idx] = Number(val) || 0
        })
      }
    })

    if (Array.isArray(existingQS)) {
      for (let ti = 0; ti < Math.min(teamCount, existingQS.length); ti++) {
        const teamScores = existingQS[ti]
        if (!Array.isArray(teamScores)) continue
        teamScores.forEach((score, gi) => {
          if (score === null || score === undefined) return
          addInferred(gi, ti)
          if (!gamesWithEvents.has(gi)) {
            gameScores[gi][ti] = Number(score) || 0
          }
        })
      }
    }

    gamesWithEvents.forEach(gi => {
      if (gameScores[gi]) gameScores[gi] = createBlankScores()
    })

    const makeEventKey = (ev, idx) => (ev?.id ? `id:${ev.id}` : `idx:${idx}`)
    const ownGoalRecipients = new Map()

    timeline.forEach((ev, eventIdx) => {
      const gi = Math.max(0, Number(ev.gameIndex) || 0)
      if (!gameScores[gi]) gameScores[gi] = createBlankScores()

      const canonicalSet = canonicalParticipants[gi]
      const hasCanonical = canonicalSet && canonicalSet.size > 0
      const targetSet = hasCanonical ? canonicalSet : inferredParticipants[gi]

      const rawTeamIdx = Number(ev.teamIndex ?? 0)
      const teamIdx = Number.isFinite(rawTeamIdx) ? Math.max(0, Math.min(teamCount - 1, rawTeamIdx)) : 0

      if (hasCanonical && !canonicalSet.has(teamIdx)) {
        console.warn(`[RefereeTimelineEditor] Ignoring event for team ${teamIdx} in game ${gi + 1} (not a participant)`)
        return
      }

      if (!hasCanonical) targetSet.add(teamIdx)

      if (ev.type === 'goal') {
        gameScores[gi][teamIdx] = (Number(gameScores[gi][teamIdx]) || 0) + 1
      }

      if (ev.type === 'own_goal') {
        const participants = Array.from(targetSet).sort((a, b) => a - b)
        let recipient = participants.find(ti => ti !== teamIdx)

        if (recipient === undefined) {
          for (let candidate = 0; candidate < teamCount; candidate += 1) {
            if (candidate === teamIdx) continue
            if (!hasCanonical) targetSet.add(candidate)
            recipient = candidate
            break
          }
        }

        if (recipient === undefined) recipient = teamIdx
        gameScores[gi][recipient] = (Number(gameScores[gi][recipient]) || 0) + 1
        ownGoalRecipients.set(makeEventKey(ev, eventIdx), recipient)
      }
    })

    const finalParticipantsByGame = Array.from({ length: gameScores.length }, (_, gi) => {
      const canonical = canonicalParticipants[gi]
      if (canonical && canonical.size > 0) return Array.from(canonical).sort((a, b) => a - b)
      const inferred = inferredParticipants[gi]
      return inferred && inferred.size > 0 ? Array.from(inferred).sort((a, b) => a - b) : []
    })

    const participantSets = finalParticipantsByGame.map(arr => new Set(arr))
    const quarterScores = Array.from({ length: teamCount }, (_, ti) =>
      finalParticipantsByGame.map((_, gi) => {
        if (!participantSets[gi]?.has(ti)) return null
        return Number(gameScores[gi]?.[ti]) || 0
      })
    )
    
    // Rebuild per-player stats from timeline
    const statsMap = {}
    const ensureStat = (pid) => {
      const key = toStr(pid)
      if (!key) return null
      if (!statsMap[key]) {
        statsMap[key] = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, fouls: 0, cleanSheet: 0, events: [] }
      }
      return statsMap[key]
    }

    teams.flat().forEach(p => {
      if (p?.id) ensureStat(p.id)
    })

    const manualCleanSheets = new Set()
    const playerGameCleanSheets = new Set()

    timeline.forEach(ev => {
      const entry = ensureStat(ev.playerId)
      if (entry) entry.events.push(ev)

      if (ev.type === 'goal') {
        if (entry) entry.goals += 1
        if (ev.assistedBy) {
          const assistEntry = ensureStat(ev.assistedBy)
          if (assistEntry) assistEntry.assists += 1
        }
      }

      if (ev.type === 'own_goal' && ev.assistedBy) {
        const assistEntry = ensureStat(ev.assistedBy)
        if (assistEntry) assistEntry.assists += 1
      }

      if (ev.type === 'clean_sheet') {
        const gi = Number(ev.gameIndex ?? 0)
        const ti = Number(ev.teamIndex ?? 0)
        const pid = toStr(ev.playerId)
        
        // Mark this team-game as having manual clean sheets
        const teamKey = `${gi}-${ti}`
        manualCleanSheets.add(teamKey)

        // Only count once per player per game
        const pgKey = `${pid}-${gi}`
        if (!playerGameCleanSheets.has(pgKey)) {
          const entry = ensureStat(pid)
          if (entry) entry.cleanSheet += 1
          playerGameCleanSheets.add(pgKey)
        }
      }

      if (ev.type === 'yellow' && entry) entry.yellowCards += 1
      if (ev.type === 'red' && entry) entry.redCards += 1
      if (ev.type === 'foul' && entry) entry.fouls += 1
    })

    // Build clean sheet matrix based only on manual events
    const cleanSheetMatrix = Array.from({ length: gameScores.length }, () => Array.from({ length: teamCount }, () => 0))

    for (let gi = 0; gi < gameScores.length; gi += 1) {
      for (let ti = 0; ti < teamCount; ti += 1) {
        const key = `${gi}-${ti}`
        if (manualCleanSheets.has(key)) {
          cleanSheetMatrix[gi][ti] = 1
        }
      }
    }

    const prevGames = Array.isArray(match?.stats?.__games) ? match.stats.__games : []
    const nextGames = Array.from({ length: gameScores.length }, (_, gi) => {
      const prev = prevGames.find(g => Number(g?.matchNumber) === gi + 1) || {}
      const nextEvents = timeline.filter(ev => Number(ev.gameIndex ?? 0) === gi)
      const teamIndices = finalParticipantsByGame[gi] || []
      const participantScores = teamIndices.map(ti => Number(gameScores[gi]?.[ti]) || 0)
      return {
        ...prev,
        id: prev.id || `game-${gi + 1}`,
        matchNumber: gi + 1,
        scores: participantScores,
        cleanSheets: cleanSheetMatrix[gi] || [],
        events: nextEvents,
        teamIndices,
      }
    })

    const aggregateScores = gameScores.reduce((acc, gs) => {
      gs.forEach((val, ti) => {
        acc[ti] = (acc[ti] || 0) + (Number(val) || 0)
      })
      return acc
    }, [])

    const scoringEventTypes = new Set(['goal', 'own_goal', 'foul', 'yellow', 'red', 'super_save'])
    const gameEventsPayload = []
    timeline.forEach((ev, idx) => {
      if (!ev || !scoringEventTypes.has(ev.type)) return
      const baseTeamIdx = Number(ev.teamIndex ?? 0)
      let scoringTeam = baseTeamIdx
      if (ev.type === 'own_goal') {
        const credited = ownGoalRecipients.get(makeEventKey(ev, idx))
        const participants = finalParticipantsByGame[Math.max(0, Number(ev.gameIndex) || 0)] || []
        scoringTeam = credited !== undefined
          ? credited
          : (participants.find(ti => ti !== baseTeamIdx) ?? baseTeamIdx)
      }

      gameEventsPayload.push({
        id: ev.id || `${ev.gameIndex ?? 0}-${scoringTeam}-${idx}`,
        gameIndex: Number(ev.gameIndex ?? 0),
        teamIndex: scoringTeam,
        scorerId: toStr(ev.playerId),
        assistId: ev.assistedBy ? toStr(ev.assistedBy) : '',
        ownGoal: ev.type === 'own_goal',
        eventType: ev.type,
        minute: ev.minute ? String(ev.minute) : '',
      })
    })

    const mergedStats = {
      ...baseStats,
      ...statsMap,
      __events: timeline,
      __games: nextGames,
      __scores: aggregateScores,
    }

    const nextStatsMeta = {
      ...(match?.statsMeta || {}),
      gameEvents: gameEventsPayload,
      cleanSheets: cleanSheetMatrix,
    }

    const savePayload = {
      stats: mergedStats,
      quarterScores,
      gameEvents: gameEventsPayload,
      statsMeta: nextStatsMeta,
    }

    // Only update draft object if this is actually a draft match
    if (match.selectionMode === 'draft' || match.draftMode === true) {
      savePayload.draft = {
        ...(match?.draft || {}),
        quarterScores,
      }
    }

    onSave?.(match.id, savePayload)
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 1200)
  }

  const handleResetAll = () => {
    setTimeline([])
    
    const patch = {
      stats: {},
      quarterScores: [],
      gameEvents: [],
      statsMeta: { ...(match?.statsMeta || {}), gameEvents: [] },
    }
    
    // Preserve match type and captains appropriately
    if (match.selectionMode === 'draft' || match.draftMode === true) {
      // Draft match: preserve draft.captains and clear draft.quarterScores
      patch.selectionMode = 'draft'
      if (match.draftMode === true) {
        patch.draftMode = true // Preserve legacy draftMode field
      }
      patch.draft = {
        ...(match.draft || {}),
        captains: match.draft?.captains || [],
        quarterScores: []
      }
    } else {
      // Regular match: preserve captainIds at top level, don't modify draft
      patch.selectionMode = match.selectionMode || 'manual'
      if (match.captainIds) {
        patch.captainIds = match.captainIds
      }
    }
    
    onSave?.(match.id, patch)
    setConfirmReset(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-gray-50/95 backdrop-blur z-10 py-2 border-b border-gray-200 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent md:border-none md:static">
        <div>
          <div className="text-base font-bold text-gray-800">🎥 심판모드 타임라인 편집</div>
          <div className="text-xs text-gray-500 mt-0.5 hidden md:block">게임별로 그룹화된 이벤트를 수정하거나 추가하세요</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddEvent(true)}
            className="rounded-lg border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700 transition-all flex items-center gap-1.5"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">이벤트 추가</span>
            <span className="sm:hidden">추가</span>
          </button>
          <button
            onClick={() => setConfirmReset(true)}
            className="rounded-lg border-2 border-red-300 bg-white hover:bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition-all"
          >
            초기화
          </button>
          <button
            onClick={handleSaveToMatch}
            className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 px-5 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all"
          >
            💾 저장
          </button>
        </div>
      </div>

      {showSaved && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg px-4 py-2 text-sm text-green-800 font-medium animate-fade-in-down">
          ✅ 저장되었습니다
        </div>
      )}

      {/* Timeline Events Grouped by Game */}
      <div className="space-y-4">
        {gameIndices.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <div className="text-4xl mb-3">📝</div>
            <div className="text-gray-500 font-medium">기록된 이벤트가 없습니다</div>
            <div className="text-sm text-gray-400 mt-1">상단의 '이벤트 추가' 버튼을 눌러 기록을 시작하세요</div>
          </div>
        ) : (
          gameIndices.map(gameIdx => (
            <div key={gameIdx} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Game Header */}
              <div 
                className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => toggleGame(gameIdx)}
              >
                <div className="flex items-center gap-3">
                  <button className="text-gray-500 transition-transform duration-200">
                    {expandedGames.has(gameIdx) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 text-lg">Game {gameIdx + 1}</span>
                    <span className="text-sm font-mono bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-700 font-bold shadow-sm">
                      {getGameScore(gameIdx)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-gray-500 bg-gray-200/50 px-2 py-1 rounded-full">
                    {(eventsByGame[gameIdx] || []).length} events
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteGame({ open: true, gameIndex: gameIdx }) }}
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    title="이 게임 삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Events List */}
              {expandedGames.has(gameIdx) && (
                <div className="divide-y divide-gray-100">
                  {(eventsByGame[gameIdx] || []).map(ev => (
                    <TimelineEventItem 
                      key={ev.id} 
                      ev={ev} 
                      playersById={playersById} 
                      onEdit={setEditingEvent} 
                      onDelete={(id) => setConfirmDelete({ open: true, eventId: id })}
                    />
                  ))}
                  {(eventsByGame[gameIdx] || []).length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-gray-400 italic">
                      이 게임에 기록된 이벤트가 없습니다
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit Event Modal */}
      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          players={players}
          teams={teams}
          onSave={handleSaveEvent}
          onCancel={() => setEditingEvent(null)}
          cardsEnabled={cardsEnabled}
          getGameScores={getGameScores}
          gameOptions={gameOptions}
          teamsPerGame={teamsPerGame}
        />
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <EventAddModal
          players={players}
          teams={teams}
          onAdd={handleAddEvent}
          onCancel={() => setShowAddEvent(false)}
          cardsEnabled={cardsEnabled}
          getGameScores={getGameScores}
          timeline={timeline}
          gameOptions={gameOptions}
          teamsPerGame={teamsPerGame}
          suggestedTeamsForNextGame={suggestedNextGameTeams}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmDelete.open}
        title="이벤트 삭제"
        message="이 이벤트를 삭제하시겠습니까?"
        confirmLabel="삭제"
        cancelLabel="취소"
        tone="danger"
        onConfirm={() => handleDeleteEvent(confirmDelete.eventId)}
        onCancel={() => setConfirmDelete({ open: false, eventId: null })}
      />

      <ConfirmDialog
        open={confirmDeleteGame.open}
        title="게임 삭제"
        message="이 게임을 완전히 삭제합니다. 이후 게임 번호가 한 칸씩 당겨집니다. 진행할까요?"
        confirmLabel="게임 삭제"
        cancelLabel="취소"
        tone="danger"
        onConfirm={() => handleDeleteGame(confirmDeleteGame.gameIndex)}
        onCancel={() => setConfirmDeleteGame({ open: false, gameIndex: null })}
      />

      <ConfirmDialog
        open={confirmReset}
        title="심판모드 기록 초기화"
        message="이 경기의 심판모드 기록과 경기 결과를 모두 초기화합니다. 계속할까요?"
        confirmLabel="완전 초기화"
        cancelLabel="취소"
        tone="danger"
        onConfirm={handleResetAll}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}

function TimelineEventItem({ ev, playersById, onEdit, onDelete }) {
  const player = playersById.get(toStr(ev.playerId))
  const assistPlayer = ev.assistedBy ? playersById.get(toStr(ev.assistedBy)) : null

  // Try to resolve a player by name for avatar fallback when playerId doesn't cover everyone
  const findPlayerByName = (name) => {
    if (!name) return null
    const target = name.trim().toLowerCase()
    for (const p of playersById.values()) {
      if ((p?.name || '').trim().toLowerCase() === target) return p
    }
    return null
  }

  if (ev.type === 'clean_sheet') {
    const names = (ev.playerName || '')
      .split(',')
      .map(n => n.trim())
      .filter(Boolean)
    const hasNames = names.length > 0
    return (
      <div className="px-4 py-3 rounded-xl border border-teal-200 bg-teal-50/80 flex items-center gap-3">
        <div className="w-12 text-right font-mono text-xs text-teal-700 font-bold">FT</div>
        <div className="flex-shrink-0 rounded-lg px-2 py-1.5 bg-white border border-teal-200 text-teal-700 flex flex-col items-center justify-center min-w-[86px]">
          <div className="text-xl leading-none mb-0.5">🛡️</div>
          <div className="text-[9px] font-bold uppercase tracking-tight">Clean Sheet</div>
          <div className="text-[10px] text-teal-500 font-semibold">경기 후</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-teal-700 mb-1">클린시트 수상자</div>
          {hasNames ? (
            <div className="flex flex-wrap gap-2">
              {names.map((name, idx) => {
                const p = findPlayerByName(name) || player
                return (
                  <span key={`${name}-${idx}`} className="inline-flex items-center gap-1 bg-white border border-teal-200 rounded-full px-2 py-1 text-[12px] text-teal-800">
                    <InitialAvatar name={name} photoUrl={p?.photoUrl} size={22} />
                    <span className="font-semibold truncate max-w-[120px]">{name}</span>
                  </span>
                )
              })}
            </div>
          ) : (
            <span className="text-sm font-semibold text-teal-700">팀 클린시트</span>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(ev)}
            className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition-colors"
            title="수정"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDelete(ev.id)}
            className="p-1.5 rounded hover:bg-red-100 text-red-600 transition-colors"
            title="삭제"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    )
  }

  const getEventTypeLabel = (type) => {
    const map = {
      goal: { emoji: '⚽', label: '골', color: 'bg-emerald-100 text-emerald-700' },
      own_goal: { emoji: '🥅', label: '자책골', color: 'bg-rose-100 text-rose-700' },
      yellow: { emoji: '🟨', label: '옐로카드', color: 'bg-yellow-100 text-yellow-700' },
      red: { emoji: '🟥', label: '레드카드', color: 'bg-red-100 text-red-700' },
      foul: { emoji: '⚠️', label: '파울', color: 'bg-gray-100 text-gray-700' },
      super_save: { emoji: '🧤', label: '슈퍼세이브', color: 'bg-sky-100 text-sky-700' },
      clean_sheet: { emoji: '🧱', label: '클린시트', color: 'bg-teal-100 text-teal-700' },
    }
    return map[type] || { emoji: '❓', label: type, color: 'bg-gray-100 text-gray-600' }
  }

  const typeInfo = getEventTypeLabel(ev.type)
  const teamLabel = `팀 ${(ev.teamIndex || 0) + 1}`
  const minuteLabel = ev.minute ? `${ev.minute}'` : ''

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors group flex items-center gap-3">
      {/* Minute */}
      <div className="w-12 text-right font-mono text-sm text-gray-500 font-medium">
        {minuteLabel || '-'}
      </div>

      {/* Event Type Badge */}
      <div className={`flex-shrink-0 rounded-lg px-2 py-1.5 text-center min-w-[70px] ${typeInfo.color} flex flex-col items-center justify-center`}>
        <div className="text-xl leading-none mb-0.5">{typeInfo.emoji}</div>
        <div className="text-[9px] font-bold uppercase tracking-tight">{typeInfo.label}</div>
      </div>

      {/* Event Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
            {teamLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const cleanSheetNames = ev.type === 'clean_sheet' ? (ev.playerName || '') : ''
            const displayName = cleanSheetNames || player?.name
            if (displayName) {
              return (
                <div className="flex items-center gap-1.5">
                  <InitialAvatar name={displayName} photoUrl={player?.photoUrl} size={20} />
                  <span className="text-sm font-semibold text-gray-800 truncate">{displayName}</span>
                </div>
              )
            }
            if (ev.type === 'clean_sheet') {
              return <span className="text-sm font-semibold text-teal-700">팀 클린시트</span>
            }
            return <span className="text-sm text-gray-400 italic">선수 미상</span>
          })()}
          
          {assistPlayer && (
            <div className="flex items-center gap-1 text-xs text-gray-500 ml-1 pl-2 border-l border-gray-300">
              <span className="text-[10px] uppercase font-bold text-gray-400">Assist</span>
              <InitialAvatar name={assistPlayer.name} photoUrl={assistPlayer.photoUrl} size={16} />
              <span className="font-medium truncate max-w-[80px]">{assistPlayer.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(ev)}
          className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition-colors"
          title="수정"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={() => onDelete(ev.id)}
          className="p-1.5 rounded hover:bg-red-100 text-red-600 transition-colors"
          title="삭제"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

/* Event Edit Modal */
/* Event Edit Modal */
function EventEditModal({
  event,
  players,
  teams,
  onSave,
  onCancel,
  cardsEnabled = true,
  getGameScores,
  gameOptions = [],
  teamsPerGame = [],
}) {
  const [formData, setFormData] = useState({
    type: event.type || 'goal',
    playerId: toStr(event.playerId || ''),
    teamIndex: Number(event.teamIndex ?? 0),
    gameIndex: Number(event.gameIndex ?? 0),
    minute: event.minute || '',
    assistedBy: toStr(event.assistedBy || ''),
  })
  const [cleanSheetError, setCleanSheetError] = useState('')

  const needsAssist = ['goal', 'own_goal'].includes(formData.type)
  const needsPlayer = true // All events now support player selection
  const isCleanSheet = formData.type === 'clean_sheet'

  const availableGames = React.useMemo(() => {
    if (Array.isArray(gameOptions) && gameOptions.length > 0) return gameOptions
    return [{ value: 0, label: 'Game 1' }]
  }, [gameOptions])

  const availableTeams = React.useMemo(() => {
    const gi = Number(formData.gameIndex) || 0
    const gameTeams = Array.isArray(teamsPerGame?.[gi]) ? teamsPerGame[gi] : null
    if (gameTeams && gameTeams.length > 0) return gameTeams
    return teams.map((team, idx) => ({
      teamIndex: idx,
      label: `팀 ${idx + 1}`,
      players: team || [],
    }))
  }, [formData.gameIndex, teamsPerGame, teams])

  React.useEffect(() => {
    const hasGame = availableGames.some(opt => Number(opt.value) === Number(formData.gameIndex))
    if (hasGame) return
    const fallbackGame = Number(availableGames[0]?.value ?? 0)
    const fallbackTeam = Number(teamsPerGame?.[fallbackGame]?.[0]?.teamIndex ?? 0)
    setFormData(prev => ({
      ...prev,
      gameIndex: fallbackGame,
      teamIndex: fallbackTeam,
      playerId: '',
      assistedBy: '',
    }))
  }, [availableGames, formData.gameIndex, teamsPerGame])

  React.useEffect(() => {
    if (!availableTeams.length) return
    const hasSelection = availableTeams.some(teamInfo => teamInfo.teamIndex === Number(formData.teamIndex))
    if (hasSelection) return
    const fallbackTeam = availableTeams[0].teamIndex
    setFormData(prev => ({
      ...prev,
      teamIndex: fallbackTeam,
      playerId: '',
      assistedBy: '',
    }))
  }, [availableTeams, formData.teamIndex])

  React.useEffect(() => {
    if (!isCleanSheet) {
      setCleanSheetError('')
      return
    }
    if (typeof getGameScores !== 'function') {
      setCleanSheetError('')
      return
    }
    const parsedGameIndex = Math.max(0, Number(formData.gameIndex) || 0)
    const scores = getGameScores(parsedGameIndex) || []
    const participants = Array.isArray(teamsPerGame?.[parsedGameIndex])
      ? teamsPerGame[parsedGameIndex].map(teamInfo => teamInfo.teamIndex)
      : availableTeams.map(teamInfo => teamInfo.teamIndex)
    const currentIdx = participants.findIndex(idx => Number(idx) === Number(formData.teamIndex))
    if (currentIdx === -1) {
      setCleanSheetError('')
      return
    }
    const conceded = participants.some((_, idx) => idx !== currentIdx && (Number(scores?.[idx] ?? 0) > 0))
    setCleanSheetError(conceded ? '이 팀은 무실점 경기가 아닙니다.' : '')
  }, [availableTeams, formData.gameIndex, formData.teamIndex, getGameScores, isCleanSheet, teamsPerGame])

  const selectedTeamInfo = availableTeams.find(teamInfo => teamInfo.teamIndex === Number(formData.teamIndex))
  const selectedTeamPlayers = selectedTeamInfo?.players || []
  const assistCandidates = selectedTeamPlayers.filter(p => toStr(p.id) !== formData.playerId)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isCleanSheet && cleanSheetError) return
    if (needsPlayer && !formData.playerId) return
    const parsedGameIndex = Math.max(0, Number(formData.gameIndex) || 0)
    const player = players.find(p => toStr(p.id) === formData.playerId)
    const assistPlayer = formData.assistedBy 
      ? players.find(p => toStr(p.id) === formData.assistedBy)
      : null

    onSave({
      ...event,
      type: formData.type,
      playerId: needsPlayer ? formData.playerId : '',
      teamIndex: Number(formData.teamIndex),
      gameIndex: parsedGameIndex,
      minute: formData.minute,
      assistedBy: needsAssist ? (formData.assistedBy || null) : null,
      assistedName: needsAssist ? (assistPlayer?.name || '') : '',
      playerName: needsPlayer ? (player?.name || '') : '',
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-lg font-bold text-gray-900">이벤트 수정</div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">이벤트 종류</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            >
              <option value="goal">⚽ 골</option>
              <option value="own_goal">🥅 자책골</option>
              {(cardsEnabled || formData.type === 'yellow') && <option value="yellow">🟨 옐로카드</option>}
              {(cardsEnabled || formData.type === 'red') && <option value="red">🟥 레드카드</option>}
              <option value="foul">⚠️ 파울</option>
              {(formData.type === 'super_save') && <option value="super_save">🧤 슈퍼세이브</option>}
              <option value="clean_sheet">🧱 클린시트</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">게임 선택</label>
              <select
                value={String(formData.gameIndex)}
                onChange={(e) => {
                  const nextGame = Number(e.target.value)
                  setFormData(prev => ({
                    ...prev,
                    gameIndex: nextGame,
                    playerId: '',
                    assistedBy: '',
                  }))
                }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                {availableGames.map(option => (
                  <option key={option.value} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">시간 (분)</label>
              <input
                type="text"
                value={formData.minute}
                onChange={(e) => setFormData(prev => ({ ...prev, minute: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="예: 15"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">팀 선택</label>
            <div className="grid grid-cols-2 gap-2">
              {availableTeams.map(teamInfo => {
                const isSelected = Number(formData.teamIndex) === teamInfo.teamIndex
                return (
                  <button
                    key={teamInfo.teamIndex}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, teamIndex: teamInfo.teamIndex, playerId: '', assistedBy: '' }))}
                    className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {teamInfo.label}
                  </button>
                )
              })}
            </div>
            {cleanSheetError && (
              <div className="mt-2 text-xs font-bold text-red-600 bg-red-50 p-2 rounded border border-red-200">
                ⚠️ {cleanSheetError}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">선수 선택</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
              {selectedTeamPlayers.length === 0 && (
                <div className="col-span-full text-sm text-gray-500 italic text-center py-4">등록된 선수가 없습니다</div>
              )}
              {selectedTeamPlayers.map(p => {
                const pid = toStr(p.id)
                const isSelected = formData.playerId === pid
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      playerId: pid,
                      assistedBy: prev.assistedBy === pid ? '' : prev.assistedBy,
                    }))}
                    className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200 ring-offset-1'
                        : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <InitialAvatar name={p.name} photoUrl={p.photoUrl} size={40} className="mb-1.5 shadow-sm" />
                    <span className="text-xs font-bold truncate w-full text-center leading-tight">{p.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {needsAssist && needsPlayer && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                어시스트 (선택)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, assistedBy: '' }))}
                  className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${
                    !formData.assistedBy
                      ? 'border-slate-500 bg-slate-50 text-slate-700 ring-2 ring-slate-200 ring-offset-1'
                      : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 text-sm font-bold text-slate-600 mb-1">
                    없음
                  </div>
                  <span className="text-xs font-bold">없음</span>
                </button>
                {assistCandidates.length === 0 && (
                  <div className="col-span-full text-sm text-gray-500 italic text-center py-4">선택 가능한 선수가 없습니다</div>
                )}
                {assistCandidates.map(p => {
                  const pid = toStr(p.id)
                  const isSelected = formData.assistedBy === pid
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, assistedBy: pid }))}
                      className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200 ring-offset-1'
                          : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <InitialAvatar name={p.name} photoUrl={p.photoUrl} size={36} className="mb-1 shadow-sm" />
                      <span className="text-xs font-bold truncate w-full text-center leading-tight">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 font-bold text-gray-700 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* Event Add Modal */
function EventAddModal({ players, teams, onAdd, onCancel, cardsEnabled = true, getGameScores, timeline, gameOptions = [], teamsPerGame = [], suggestedTeamsForNextGame = null }) {
  const initialGameIndex = gameOptions?.[0]?.value ?? 0
  const initialTeamIndex = teamsPerGame?.[initialGameIndex]?.[0]?.teamIndex ?? 0

  const [formData, setFormData] = useState({
    type: 'goal',
    playerId: '',
    teamIndex: initialTeamIndex ?? 0,
    gameIndex: initialGameIndex,
    minute: '',
    assistedBy: '',
  })
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set())
  const [cleanSheetError, setCleanSheetError] = useState('')
  const [newGameTeams, setNewGameTeams] = useState([]) // Track selected teams for new game
  
  const isNewGame = React.useMemo(() => {
    return !Array.isArray(gameOptions) || Number(formData.gameIndex) >= gameOptions.length
  }, [formData.gameIndex, gameOptions])

  const availableTeams = React.useMemo(() => {
    const gi = Number(formData.gameIndex) || 0
    
    // For new games, use selected teams if available
    if (isNewGame && newGameTeams.length > 0) {
      return newGameTeams.map(teamIdx => ({
        teamIndex: teamIdx,
        label: `팀 ${teamIdx + 1}`,
        players: teams[teamIdx] || [],
      }))
    }
    
    const gameTeams = Array.isArray(teamsPerGame?.[gi]) ? teamsPerGame[gi] : null
    if (gameTeams && gameTeams.length > 0) return gameTeams
    
    // For new games without team selection or fallback, show all teams
    return teams.map((team, idx) => ({
      teamIndex: idx,
      label: `팀 ${idx + 1}`,
      players: team || [],
    }))
  }, [formData.gameIndex, teamsPerGame, teams, newGameTeams, isNewGame])

  React.useEffect(() => {
    if (!isNewGame) {
      if (newGameTeams.length) setNewGameTeams([])
      return
    }
    const canSuggest = Array.isArray(suggestedTeamsForNextGame) && suggestedTeamsForNextGame.length === 2
    if (newGameTeams.length === 0 && canSuggest) {
      setNewGameTeams(suggestedTeamsForNextGame)
      setFormData(prev => ({
        ...prev,
        teamIndex: suggestedTeamsForNextGame[0],
        playerId: '',
        assistedBy: '',
      }))
    }
  }, [isNewGame, suggestedTeamsForNextGame, newGameTeams.length])

  React.useEffect(() => {
    if (!availableTeams.length) return
    const hasSelection = availableTeams.some(t => t.teamIndex === Number(formData.teamIndex))
    if (!hasSelection) {
      const fallbackTeam = availableTeams[0].teamIndex
      setFormData(prev => ({
        ...prev,
        teamIndex: fallbackTeam,
        playerId: '',
        assistedBy: '',
      }))
    }
  }, [availableTeams, formData.teamIndex])

  const needsAssist = ['goal', 'own_goal'].includes(formData.type)
  const isCleanSheet = formData.type === 'clean_sheet'
  const needsPlayer = true // All events now support player selection

  // Get existing clean sheet players for current game/team
  const existingCleanSheetPlayers = React.useMemo(() => {
    if (!isCleanSheet) return new Set()
    const gi = Math.max(0, Number(formData.gameIndex) || 0)
    const ti = Number(formData.teamIndex)
    const existing = new Set()
    if (Array.isArray(timeline)) {
      timeline.forEach(ev => {
        if (ev.type === 'clean_sheet' && Number(ev.gameIndex ?? 0) === gi && Number(ev.teamIndex ?? 0) === ti) {
          existing.add(toStr(ev.playerId))
        }
      })
    }
    return existing
  }, [isCleanSheet, formData.gameIndex, formData.teamIndex, timeline])

  // Reset selection when team changes
  React.useEffect(() => {
    setSelectedPlayerIds(new Set())
  }, [formData.teamIndex])

  // Auto-select team for clean sheet & Validation
  React.useEffect(() => {
    if (formData.type === 'clean_sheet') {
      const parsedGameIndex = Math.max(0, Number(formData.gameIndex) || 0)
      // For new games (beyond existing games), there's no score data yet, so allow clean sheet
      const isNewGame = !Array.isArray(gameOptions) || parsedGameIndex >= gameOptions.length
      
      if (isNewGame) {
        // New game - no validation needed, no scores yet
        setCleanSheetError('')
      } else {
        const [s0, s1] = getGameScores ? getGameScores(parsedGameIndex) : [0, 0]
        
        // Team 0 clean sheet if s1 (opponent score) is 0
        const t0Clean = s1 === 0
        // Team 1 clean sheet if s0 (opponent score) is 0
        const t1Clean = s0 === 0

        // Let's check if current selection is invalid, and if the other one is valid, switch.
        const currentTeamIdx = Number(formData.teamIndex)
        const isCurrentClean = currentTeamIdx === 0 ? t0Clean : t1Clean
        
        if (!isCurrentClean) {
          if (currentTeamIdx === 0 && t1Clean) {
             // Switch to team 1
             setFormData(prev => ({ ...prev, teamIndex: 1 }))
          } else if (currentTeamIdx === 1 && t0Clean) {
             // Switch to team 0
             setFormData(prev => ({ ...prev, teamIndex: 0 }))
          }
        }
        
        if (!isCurrentClean) {
          setCleanSheetError('이 팀은 무실점 경기가 아닙니다.')
        } else {
          setCleanSheetError('')
        }
      }
    } else {
      setCleanSheetError('')
    }
  }, [formData.type, formData.gameIndex, formData.teamIndex, getGameScores, gameOptions])

  const togglePlayer = (pid) => {
    const newSet = new Set(selectedPlayerIds)
    if (newSet.has(pid)) newSet.delete(pid)
    else newSet.add(pid)
    setSelectedPlayerIds(newSet)
  }

  const selectedTeamInfo = availableTeams.find(teamInfo => teamInfo.teamIndex === Number(formData.teamIndex))
  const selectedTeamPlayers = selectedTeamInfo?.players || []
  const assistCandidates = selectedTeamPlayers.filter(p => toStr(p.id) !== formData.playerId)

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Validate new game team selection
    if (isNewGame && newGameTeams.length !== 2) {
      alert('새 게임에 참가할 팀 2개를 선택해주세요.')
      return
    }
    
    const parsedGameIndex = Math.max(0, Number(formData.gameIndex) || 0)

    if (isCleanSheet) {
      if (cleanSheetError) {
        // Prevent submit? User said "say it is not a clean sheet match".
        // Usually this implies blocking or at least strong warning.
        // I'll block it if it's an error.
        return
      }
      if (selectedPlayerIds.size === 0) return
      const events = Array.from(selectedPlayerIds).map(pid => {
        const player = players.find(p => toStr(p.id) === pid)
        return {
          type: 'clean_sheet',
          playerId: pid,
          playerName: player?.name || '',
          teamIndex: Number(formData.teamIndex),
          gameIndex: parsedGameIndex,
          minute: formData.minute,
          assistedBy: null,
          assistedName: '',
        }
      })
      // Pass newGameTeams info if it's a new game
      onAdd(events, isNewGame ? newGameTeams : null)
      return
    }

    if (needsPlayer && !formData.playerId) return

    const player = players.find(p => toStr(p.id) === formData.playerId)
    const assistPlayer = formData.assistedBy 
      ? players.find(p => toStr(p.id) === formData.assistedBy)
      : null

    const newEvent = {
      type: formData.type,
      playerId: needsPlayer ? formData.playerId : '',
      playerName: needsPlayer ? (player?.name || '') : '',
      teamIndex: Number(formData.teamIndex),
      gameIndex: parsedGameIndex,
      minute: formData.minute,
      assistedBy: needsAssist ? (formData.assistedBy || null) : null,
      assistedName: needsAssist ? (assistPlayer?.name || '') : '',
    }
    
    // Pass newGameTeams info if it's a new game
    onAdd(newEvent, isNewGame ? newGameTeams : null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-lg font-bold text-gray-900">새 이벤트 추가</div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">이벤트 종류</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            >
              <option value="goal">⚽ 골</option>
              <option value="own_goal">🥅 자책골</option>
              {cardsEnabled && <option value="yellow">🟨 옐로카드</option>}
              {cardsEnabled && <option value="red">🟥 레드카드</option>}
              <option value="foul">⚠️ 파울</option>
              <option value="clean_sheet">🧱 클린시트</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">게임 선택</label>
              <select
                value={String(formData.gameIndex)}
                onChange={(e) => {
                  const nextGame = Number(e.target.value)
                  setFormData(prev => ({
                    ...prev,
                    gameIndex: nextGame,
                    playerId: '',
                    assistedBy: '',
                  }))
                  setSelectedPlayerIds(new Set())
                }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                {gameOptions.map(option => (
                  <option key={option.value} value={String(option.value)}>{option.label}</option>
                ))}
                <option value={String(gameOptions.length)}>➕ 새 게임 추가</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">시간 (분)</label>
              <input
                type="text"
                value={formData.minute}
                onChange={(e) => setFormData(prev => ({ ...prev, minute: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="예: 15"
              />
            </div>
          </div>

          {isNewGame && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                🎮 새 게임 참가 팀 선택 (2개)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {teams.map((_, idx) => {
                  const isSelected = newGameTeams.includes(idx)
                  const isDisabled = !isSelected && newGameTeams.length >= 2
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isSelected) {
                          setNewGameTeams(prev => prev.filter(t => t !== idx))
                        } else if (newGameTeams.length < 2) {
                          setNewGameTeams(prev => [...prev, idx])
                          // Auto-select first team as current team if none selected
                          if (newGameTeams.length === 0) {
                            setFormData(prev => ({ ...prev, teamIndex: idx }))
                          }
                        }
                      }}
                      className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                        isSelected
                          ? 'border-yellow-500 bg-yellow-100 text-yellow-700 ring-2 ring-yellow-200'
                          : isDisabled
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-yellow-300'
                      }`}
                    >
                      팀 {idx + 1}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                {newGameTeams.length === 0 && '⚠️ 새 게임에 참가할 팀 2개를 선택해주세요'}
                {newGameTeams.length === 1 && '✓ 1개 선택됨 - 1개 더 선택해주세요'}
                {newGameTeams.length === 2 && '✅ 2개 팀 선택 완료'}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">팀 선택</label>
            <div className="grid grid-cols-2 gap-2">
              {availableTeams.map(teamInfo => {
                const isSelected = Number(formData.teamIndex) === teamInfo.teamIndex
                return (
                  <button
                    key={teamInfo.teamIndex}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, teamIndex: teamInfo.teamIndex, playerId: '', assistedBy: '' }))
                      setSelectedPlayerIds(new Set())
                    }}
                    className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {teamInfo.label}
                  </button>
                )
              })}
            </div>
            {cleanSheetError && (
              <div className="mt-2 text-xs font-bold text-red-600 bg-red-50 p-2 rounded border border-red-200">
                ⚠️ {cleanSheetError}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">선수 선택</label>
            {isCleanSheet ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
                {selectedTeamPlayers.map(p => {
                  const pid = toStr(p.id)
                  const isSelected = selectedPlayerIds.has(pid)
                  const alreadyHasCleanSheet = existingCleanSheetPlayers.has(pid)
                  const isDisabled = alreadyHasCleanSheet
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !isDisabled && togglePlayer(pid)}
                      disabled={isDisabled}
                      className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${
                        isDisabled
                          ? 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                          : isSelected 
                            ? 'border-teal-500 bg-teal-50 text-teal-700 ring-2 ring-teal-200 ring-offset-1' 
                            : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <InitialAvatar name={p.name} photoUrl={p.photoUrl} size={40} className="mb-1.5 shadow-sm" />
                      <span className="text-xs font-bold truncate w-full text-center leading-tight">{p.name}</span>
                      {alreadyHasCleanSheet && (
                        <span className="text-[9px] text-gray-500 mt-0.5">✓ 추가됨</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
                {selectedTeamPlayers.length === 0 && (
                  <div className="col-span-full text-sm text-gray-500 italic text-center py-4">등록된 선수가 없습니다</div>
                )}
                {selectedTeamPlayers.map(p => {
                  const pid = toStr(p.id)
                  const isSelected = formData.playerId === pid
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, playerId: pid }))}
                      className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200 ring-offset-1'
                          : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <InitialAvatar name={p.name} photoUrl={p.photoUrl} size={40} className="mb-1.5 shadow-sm" />
                      <span className="text-xs font-bold truncate w-full text-center leading-tight">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {isCleanSheet && (
               <div className="text-xs text-gray-500 mt-1.5 text-right">
                 {selectedPlayerIds.size}명 선택됨
               </div>
            )}
          </div>

          {needsAssist && needsPlayer && !isCleanSheet && formData.playerId && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                어시스트 (선택)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, assistedBy: '' }))}
                  className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${
                    !formData.assistedBy
                      ? 'border-slate-500 bg-slate-50 text-slate-700 ring-2 ring-slate-200 ring-offset-1'
                      : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 text-sm font-bold text-slate-600 mb-1">
                    없음
                  </div>
                  <span className="text-xs font-bold">없음</span>
                </button>
                {assistCandidates.length === 0 && (
                  <div className="col-span-full text-sm text-gray-500 italic text-center py-4">선택 가능한 선수가 없습니다</div>
                )}
                {assistCandidates.map(p => {
                  const pid = toStr(p.id)
                  const isSelected = formData.assistedBy === pid
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, assistedBy: pid }))}
                      className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200 ring-offset-1'
                          : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <InitialAvatar name={p.name} photoUrl={p.photoUrl} size={36} className="mb-1 shadow-sm" />
                      <span className="text-xs font-bold truncate w-full text-center leading-tight">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 font-bold text-gray-700 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
            >
              추가하기
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
