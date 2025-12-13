import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Save, X, Clock, ChevronDown } from 'lucide-react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import ConfirmDialog from '../components/ConfirmDialog'
import { notify } from '../components/Toast'
import { getCaptains } from '../lib/matchHelpers'
import { fetchRefEvents, saveRefEvent, deleteRefEvent, subscribeRefEvents, safeMatchId, deleteAllRefEvents } from '../services/refEvents.service'
import { upsertRefSession, cancelRefSession, completeRefSession, subscribeRefSession, updateLastEventTime } from '../services/refSession.service'

const statShell = () => ({ goals: 0, assists: 0, yellowCards: 0, redCards: 0, fouls: 0, cleanSheet: 0, events: [] })

export default function RefereeMode({ activeMatch, onFinish, onCancel, onAutoSave, cardsEnabled = true }) {
  const { t } = useTranslation()

  const initialGameIndex = useMemo(() => {
    if (!activeMatch) return 0
    const stats = activeMatch.stats || {}
    const games = Array.isArray(stats.__games) ? stats.__games.filter(Boolean) : []
    const explicitCount = games.length
    const maxMatchNumber = games.reduce((max, game) => {
      const num = Number(game?.matchNumber) || 0
      return num > max ? num : max
    }, 0)
    const events = Array.isArray(stats.__events) ? stats.__events : []
    const maxEventIndex = events.reduce((max, ev) => {
      const idx = typeof ev?.gameIndex === 'number' ? ev.gameIndex : null
      if (idx === null || idx < 0) return max
      return Math.max(max, idx + 1)
    }, 0)
    const metaNumber = Number(stats.__matchMeta?.matchNumber) || 0
    const matchLevelNumber = Number(activeMatch.matchNumber) || 0
    const best = Math.max(explicitCount, maxMatchNumber, maxEventIndex, metaNumber, matchLevelNumber)
    return best
  }, [activeMatch])

  const captains = useMemo(() => getCaptains(activeMatch), [activeMatch])

  const [duration, setDuration] = useState(20)
  const [matchNumber, setMatchNumber] = useState(initialGameIndex + 1)
  const [matchNumberInput, setMatchNumberInput] = useState(String(initialGameIndex + 1))
  const [durationInput, setDurationInput] = useState('20')
  const [gameStatus, setGameStatus] = useState('setup') // setup -> ready -> playing -> finished
  const [startTime, setStartTime] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [teams, setTeams] = useState(activeMatch?.teams || [[], []])
  const [scores, setScores] = useState([0, 0])
  const [events, setEvents] = useState([])

  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(null)
  const [assistSelectionMode, setAssistSelectionMode] = useState(false)
  const [pendingGoalEvent, setPendingGoalEvent] = useState(null)
  const [ownGoalAssistMode, setOwnGoalAssistMode] = useState(false)
  const [pendingOwnGoal, setPendingOwnGoal] = useState(null)
  const [showRecentEvents, setShowRecentEvents] = useState(false)
  const [revertTarget, setRevertTarget] = useState(null)
  const [showCleanSheetPicker, setShowCleanSheetPicker] = useState(false)
  const [cleanSheetCandidates, setCleanSheetCandidates] = useState([])
  const [cleanSheetSelections, setCleanSheetSelections] = useState([])
  const matchIdForRef = useMemo(() => safeMatchId(activeMatch), [activeMatch])
  const gameIndexForRef = useMemo(() => matchNumber - 1, [matchNumber])

  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showOverrideWarning, setShowOverrideWarning] = useState(false)
  const [pendingMatchNumber, setPendingMatchNumber] = useState(null)
  const [selectedTeamIndices, setSelectedTeamIndices] = useState([0, 1])

  const timerRef = useRef(null)

  // Keep input strings in sync with numeric state
  useEffect(() => {
    setMatchNumberInput(matchNumber === null || matchNumber === undefined ? '' : String(matchNumber))
  }, [matchNumber])

  useEffect(() => {
    setDurationInput(duration === null || duration === undefined ? '' : String(duration))
  }, [duration])

  const kitPalette = useMemo(() => ([
    { bg: '#f8fafc', text: '#0f172a', border: '#0f172a', label: 'White' },
    { bg: '#0f172a', text: '#ffffff', border: '#0b1220', label: 'Black' },
    { bg: '#2563eb', text: '#ffffff', border: '#1d4ed8', label: 'Blue' },
    { bg: '#dc2626', text: '#ffffff', border: '#b91c1c', label: 'Red' },
    { bg: '#6dff2e', text: '#0f172a', border: '#5ce625', label: 'Green' },
    { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9', label: 'Purple' },
    { bg: '#ea580c', text: '#ffffff', border: '#c2410c', label: 'Orange' },
    { bg: '#0d9488', text: '#ffffff', border: '#0f766e', label: 'Teal' },
    { bg: '#ec4899', text: '#ffffff', border: '#db2777', label: 'Pink' },
    { bg: '#facc15', text: '#0f172a', border: '#eab308', label: 'Yellow' }
  ]), [])

  const resolveTeamColor = (teamIndex) => {
    const color = Array.isArray(activeMatch?.teamColors) && typeof activeMatch.teamColors[teamIndex] === 'object'
      ? activeMatch.teamColors[teamIndex]
      : kitPalette[teamIndex % kitPalette.length]
    return color || kitPalette[teamIndex % kitPalette.length]
  }

  const renderJersey = (color, size = 20) => {
    const label = (color?.label || '').toLowerCase()
    const baseColor = color?.bg || color?.border || color?.text || '#0f172a'
    const isWhite = label === 'white'
    const isBlack = label === 'black'
    const fill = isWhite ? '#ffffff' : (isBlack ? '#0f172a' : baseColor)
    const stroke = isWhite ? '#0f172a' : (isBlack ? '#ffffff' : 'rgba(0,0,0,0.38)')
    const strokeW = isWhite ? 16 : (isBlack ? 16 : 12)

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 969.982 969.982"
        aria-hidden="true"
        className="drop-shadow-sm"
      >
        <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round">
          <path d="M937.031,250.555c-21.249-9.669-42.856-19.473-63.752-28.955c-40.639-18.439-82.662-37.507-123.886-56.416 c-7.768-3.562-15.452-7.376-23.589-11.414c-32.479-16.116-69.289-34.382-112.309-34.382h-24.032 c-9.62,0-18.902,3.651-26.139,10.282c-5.699,5.223-9.85,11.987-12.004,19.56c-0.424,1.492-4.271,6.993-15.981,12.504 c-13.478,6.343-31.194,9.837-49.89,9.837s-36.413-3.494-49.89-9.837c-11.71-5.511-15.558-11.012-15.981-12.504 c-2.153-7.572-6.304-14.337-12.004-19.561c-7.235-6.63-16.518-10.282-26.138-10.282h-24.035 c-45.053,0-85.888,20.228-121.917,38.074c-10.214,5.06-19.862,9.838-29.321,14.056c-26.528,11.827-53.271,24.134-79.133,36.037 c-20.479,9.425-41.656,19.171-62.506,28.576c-5.352,2.414-10.726,4.885-15.923,7.275c-5.125,2.356-10.424,4.793-15.6,7.127 c-28.17,12.706-40.753,45.961-28.049,74.132l48.462,107.458c9.044,20.053,29.104,33.01,51.105,33.01 c7.979,0,15.726-1.669,23.026-4.962l0.525-0.236l0.516-0.258l53.535-26.664V760.42c0,15.051,6.94,36.486,40.003,53.125 c16.869,8.488,40.303,15.705,69.649,21.449c51.413,10.061,120.193,15.602,193.674,15.602c73.479,0,142.261-5.541,193.674-15.602 c29.347-5.744,52.78-12.959,69.649-21.449c33.062-16.639,40.003-38.074,40.003-53.125V432.662l52.291,26.848l0.676,0.348 l0.693,0.312c7.3,3.292,15.047,4.962,23.025,4.962c22.001,0,42.062-12.958,51.105-33.01l48.462-107.457 C977.728,296.51,965.166,263.278,937.031,250.555z" />
          <path d="M937.684,312.331l-48.463,107.457c-4.346,9.637-13.829,15.344-23.757,15.344 c-3.58,0-7.217-0.741-10.691-2.309l-95.994-49.286V760.42c0,40.117-136.664,60.176-273.327,60.176s-273.327-20.059-273.327-60.176 V384.555l-96.91,48.268c-3.476,1.567-7.112,2.309-10.692,2.309c-9.927,0-19.411-5.707-23.757-15.344L32.301,312.331 c-5.914-13.113-0.078-28.537,13.035-34.45c10.526-4.747,20.993-9.653,31.525-14.403c47.267-21.321,94.162-43.445,141.52-64.559 c43.683-19.476,89.679-49.529,139.021-49.53c0.001,0,24.034,0,24.034,0c4.503,0,8.055,3.717,9.287,8.048 c7.108,24.999,46.812,44.135,94.728,44.135s87.618-19.136,94.729-44.135c1.231-4.332,4.783-8.048,9.286-8.048h24.032 c45.275,0,83.509,24.772,123.389,43.064c62.499,28.667,125.178,56.948,187.763,85.427 C937.761,283.793,943.596,299.218,937.684,312.331z" />
          <path d="M561.662,387.069c0,21.831,17.697,42.614,39.528,42.614s39.527-20.783,39.527-42.614v-30.276h-79.056V387.069z" />
          <path d="M647.68,311.997H554.7c-22.056,0-40,17.944-40,40v33.27c0,22.443,8.814,45.174,24.182,62.361 c7.839,8.768,16.962,15.736,27.117,20.713c11.179,5.479,23.021,8.259,35.192,8.259s24.013-2.778,35.191-8.259 c10.155-4.977,19.278-11.945,27.117-20.713c15.368-17.188,24.183-39.918,24.183-62.361v-33.27 C687.68,329.941,669.737,311.997,647.68,311.997z" />
        </g>
      </svg>
    )
  }

  const findCaptainPlayer = (teamIndex) => {
    const captainId = captains?.[teamIndex]
    if (!captainId) return null
    const roster = Array.isArray(teams?.[teamIndex]) ? teams[teamIndex] : []
    return roster.find(p => String(p.id) === String(captainId)) || null
  }

  const matchMeta = useMemo(() => {
    return {}
  }, [activeMatch])

  // Reset when activeMatch changes OR restore in-progress game
  useEffect(() => {
    const inProgress = activeMatch?.stats?.__inProgress
    if (inProgress && inProgress.matchNumber === (initialGameIndex + 1)) {
      // Restore in-progress game
      setMatchNumber(inProgress.matchNumber)
      setMatchNumberInput(String(inProgress.matchNumber || initialGameIndex + 1))
      setDuration(inProgress.duration || 20)
      setDurationInput(String(inProgress.duration || 20))
      setTeams(inProgress.teams || activeMatch?.teams || [[], []])
      setScores(inProgress.scores || [0, 0])
      setEvents(inProgress.events || [])
      setGameStatus(inProgress.gameStatus || 'setup')
      setStartTime(inProgress.startTime || null)
      // Sync elapsed time based on actual start time
      if (inProgress.startTime && inProgress.gameStatus === 'playing') {
        const elapsed = Math.floor((Date.now() - inProgress.startTime) / 1000)
        setElapsedSeconds(elapsed)
      } else {
        setElapsedSeconds(inProgress.elapsedSeconds || 0)
      }
    } else {
      // Start fresh game
      setMatchNumber(initialGameIndex + 1)
      setMatchNumberInput(String(initialGameIndex + 1))
      setDuration(20)
      setTeams(activeMatch?.teams || [[], []])
      setScores([0, 0])
      setEvents([])
      setGameStatus('setup')
      setElapsedSeconds(0)
      setStartTime(null)
      setDurationInput('20')
    }
    setSelectedPlayer(null)
    setSelectedTeamIndex(null)
    setAssistSelectionMode(false)
    setPendingGoalEvent(null)
    setOwnGoalAssistMode(false)
    setPendingOwnGoal(null)
  }, [activeMatch, initialGameIndex])

  // Recompute scores from events list (e.g., when loading from DB)
  const recomputeScores = React.useCallback((evts) => {
    const next = [0, 0]
    evts.forEach(e => {
      if (e.type === 'goal') {
        const t = e.teamIndex ?? e.team_id ?? e.team
        if (t === 0 || t === 1) next[t] = (next[t] || 0) + 1
      }
      if (e.type === 'own_goal') {
        const t = e.teamIndex ?? e.team_id ?? e.team
        const opp = t === 0 ? 1 : 0
        if (opp === 0 || opp === 1) next[opp] = (next[opp] || 0) + 1
      }
    })
    setScores(next)
  }, [])

  useEffect(() => {
    if (gameStatus === 'playing' && startTime) {
      // Sync timer with actual elapsed time from startTime
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        setElapsedSeconds(elapsed)
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [gameStatus, startTime])

  // Load persisted events when match id changes
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!matchIdForRef) return
      const rows = await fetchRefEvents(matchIdForRef, gameIndexForRef)
      if (cancelled) return
      if (Array.isArray(rows) && rows.length) {
        setEvents(rows)
        recomputeScores(rows)
      }
    }
    load()
    return () => { cancelled = true }
  }, [matchIdForRef, gameIndexForRef, recomputeScores])

  // Subscribe to realtime changes for this match/game
  useEffect(() => {
    if (!matchIdForRef) return undefined
    const sub = subscribeRefEvents(
      matchIdForRef,
      gameIndexForRef,
      // onInsert
      (ev) => {
        setEvents(prev => {
          const exists = prev.some(e => e.id === ev.id)
          const next = exists ? prev.map(e => e.id === ev.id ? ev : e) : [ev, ...prev]
          recomputeScores(next)
          return next.sort((a, b) => new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0))
        })
        // 이벤트 발생 시 마지막 이벤트 시간 업데이트
        updateLastEventTime(matchIdForRef, gameIndexForRef)
      },
      // onDelete
      (id) => {
        if (!id) return
        setEvents(prev => {
          const next = prev.filter(e => e.id !== id)
          recomputeScores(next)
          return next
        })
      },
      // onUpdate
      (ev) => {
        setEvents(prev => {
          const next = prev.map(e => e.id === ev.id ? ev : e)
          recomputeScores(next)
          return next.sort((a, b) => new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0))
        })
        // 이벤트 업데이트 시 마지막 이벤트 시간 업데이트
        updateLastEventTime(matchIdForRef, gameIndexForRef)
      }
    )
    return () => sub?.unsubscribe?.()
  }, [matchIdForRef, gameIndexForRef, recomputeScores])

  // 세션 시작 시 세션 생성 및 구독
  useEffect(() => {
    if (!matchIdForRef || gameStatus !== 'playing') return undefined

    // 세션 생성
    upsertRefSession(matchIdForRef, gameIndexForRef, {
      status: 'active',
      duration: duration,
      startedAt: new Date(startTime).toISOString(),
      lastEventAt: new Date().toISOString()
    })

    // 세션 상태 변경 구독
    const sessionSub = subscribeRefSession(
      matchIdForRef,
      gameIndexForRef,
      (session) => {
        if (session.status === 'cancelled') {
          notify.warning(t('referee.sessionCancelledByOther') || '다른 디바이스에서 심판모드가 취소되었습니다.')
          setTimeout(() => {
            onCancel?.()
          }, 1500)
        }
      }
    )

    return () => sessionSub?.unsubscribe?.()
  }, [matchIdForRef, gameIndexForRef, gameStatus, duration, startTime, onCancel, t])

  // 자동 저장/취소: 경기 시간의 50% 초과 시
  useEffect(() => {
    if (!matchIdForRef || gameStatus !== 'playing' || !startTime) return undefined

    const checkAutoSave = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const minDuration = duration * 60 * 0.5 // 50% of duration

      if (elapsed >= minDuration) {
        if (events.length > 0) {
          // 이벤트가 있으면 자동 저장
          notify.info(t('referee.autoSavingWithEvents') || '경기 시간 50% 초과 & 이벤트가 있어 자동으로 저장합니다.')
          
          // 세션 완료 처리
          await completeRefSession(matchIdForRef, gameIndexForRef)
          
          // 자동 저장: finishMatch 호출
          finishMatch().catch(err => console.error('Auto-save failed:', err))
        } else {
          // 이벤트가 없으면 자동 취소
          notify.info(t('referee.autoCancellingNoEvents') || '경기 시간 50% 초과 & 이벤트가 없어 자동으로 취소합니다.')
          
          // 이벤트 삭제
          try {
            await deleteAllRefEvents(matchIdForRef, gameIndexForRef)
          } catch (err) {
            console.error('Failed to delete referee events:', err)
          }
          
          // 세션 취소 처리
          await cancelRefSession(matchIdForRef, gameIndexForRef)
          
          // 취소 콜백 호출
          onCancel?.()
        }
      }
    }, 10000) // 10초마다 체크

    return () => clearInterval(checkAutoSave)
  }, [matchIdForRef, gameIndexForRef, gameStatus, startTime, duration, events.length, onCancel, t])

  const formatTime = (seconds) => {
    const totalMinutes = Math.floor(seconds / 60)
    if (totalMinutes < duration) {
      const s = seconds % 60
      return `${totalMinutes.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    const extraMinutes = totalMinutes - duration
    const s = seconds % 60
    return `${duration.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} +${extraMinutes}`
  }

  const currentMinute = useMemo(() => Math.max(1, Math.floor(elapsedSeconds / 60) + 1), [elapsedSeconds])
  const displayMinute = useMemo(() => {
    const min = Math.floor(elapsedSeconds / 60) + 1
    if (min <= duration) return `${min}'`
    const extra = min - duration
    return `${duration} +${extra}'`
  }, [elapsedSeconds, duration])
  const canRecord = gameStatus === 'playing' || gameStatus === 'finished'

  const handleStartSetup = () => {
    // Filter teams based on selection
    if (activeMatch?.teams && activeMatch.teams.length > 2) {
      const filteredTeams = selectedTeamIndices.map(idx => activeMatch.teams[idx])
      setTeams(filteredTeams)
      setScores(new Array(filteredTeams.length).fill(0))
    }
    setGameStatus('ready')
  }

  const handleKickOff = () => {
    setGameStatus('playing')
    setStartTime(Date.now())
  }

  const ensureStat = (stats, playerId) => {
    const pid = playerId || ''
    if (!stats[pid]) stats[pid] = statShell()
    return stats[pid]
  }

  const handleEvent = (type, teamIndex, player, extra = {}) => {
    if (!canRecord) {
      notify(t('referee.kickoffFirst', 'Kick off to start recording'))
      return
    }
    if (!player) return

    const newEvent = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type, // goal, own_goal, yellow, red, foul
      teamIndex,
      playerId: player.id,
      playerName: player.name,
      minute: currentMinute,
      timestamp: Date.now(),
      assistedBy: extra.assistedBy || null,
      assistedName: extra.assistedName || '',
      ownGoal: type === 'own_goal',
      gameIndex: matchNumber - 1,
    }

    setEvents(prev => [newEvent, ...prev])
    saveRefEvent(matchIdForRef, gameIndexForRef, { ...newEvent, created_at: new Date().toISOString() })

    if (type === 'goal') {
      setScores(prev => {
        const next = [...prev]
        next[teamIndex] = (next[teamIndex] || 0) + 1
        return next
      })
    }

    if (type === 'own_goal') {
      const opp = teamIndex === 0 ? 1 : 0
      setScores(prev => {
        const next = [...prev]
        next[opp] = (next[opp] || 0) + 1
        return next
      })
    }
  }

  const applyRemoveEvent = (target) => {
    if (!target) return
    setEvents(prev => prev.filter(e => e.id !== target.id))
    deleteRefEvent(matchIdForRef, gameIndexForRef, target.id)

    if (target.type === 'goal') {
      setScores(prev => {
        const next = [...prev]
        next[target.teamIndex] = Math.max(0, (next[target.teamIndex] || 0) - 1)
        return next
      })
    }

    if (target.type === 'own_goal') {
      const opp = target.teamIndex === 0 ? 1 : 0
      setScores(prev => {
        const next = [...prev]
        next[opp] = Math.max(0, (next[opp] || 0) - 1)
        return next
      })
    }
  }

  const handleRemoveEvent = (eventId) => {
    const target = events.find(e => e.id === eventId)
    if (!target) return
    setRevertTarget(target)
  }

  const buildStats = (cleanSheetAwardees = []) => {
    const stats = {}
    teams.flat().forEach(p => {
      if (p?.id) stats[p.id] = statShell()
    })

    events.forEach(ev => {
      const entry = ensureStat(stats, ev.playerId)
      entry.events.push(ev)

      if (ev.type === 'goal') {
        entry.goals += 1
        if (ev.assistedBy) {
          const assistEntry = ensureStat(stats, ev.assistedBy)
          assistEntry.assists += 1
        }
      }
      if (ev.type === 'own_goal' && ev.assistedBy) {
        const assistEntry = ensureStat(stats, ev.assistedBy)
        assistEntry.assists += 1
      }
      if (ev.type === 'yellow') entry.yellowCards += 1
      if (ev.type === 'red') entry.redCards += 1
      if (ev.type === 'foul') entry.fouls += 1
    })

    cleanSheetAwardees.forEach(pid => {
      const entry = ensureStat(stats, pid)
      if (entry) {
        entry.cleanSheet = (entry.cleanSheet || 0) + 1
      }
    })

    return stats
  }

  const finishMatch = async (cleanSheetAwardees = cleanSheetSelections) => {
    const taggedEvents = events.map(ev => ({ ...ev, gameIndex: ev.gameIndex ?? (matchNumber - 1) }))
    const stats = buildStats(cleanSheetAwardees)

    const payload = {
      ...activeMatch,
      matchNumber,
      duration,
      startTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
      endTime: new Date().toISOString(),
      teams,
      scores,
      quarterScores: [scores],
      events: taggedEvents,
      stats,
      cleanSheetAwardees,
      clearInProgress: true, // Signal to clear __inProgress from stats
      selectedTeamIndices: activeMatch?.teams && activeMatch.teams.length > 2 ? selectedTeamIndices : undefined,
    }

    // Delete all referee events after match is finished
    try {
      await deleteAllRefEvents(matchIdForRef, gameIndexForRef)
    } catch (err) {
      console.error('Failed to delete referee events:', err)
    }

    if (onFinish) onFinish(payload)
  }

  // Auto-save in-progress game to DB on every change
  useEffect(() => {
    if (!onAutoSave || gameStatus === 'setup') return
    
    const inProgressData = {
      matchNumber,
      duration,
      gameStatus,
      startTime,
      elapsedSeconds,
      teams,
      scores,
      events,
      lastUpdated: Date.now(),
    }
    
    // Debounce to avoid too many DB writes
    const timer = setTimeout(() => {
      onAutoSave(inProgressData)
    }, 500)
    
    return () => clearTimeout(timer)
  }, [duration, matchNumber, gameStatus, startTime, elapsedSeconds, teams, scores, events, onAutoSave])

  const openPlayerActions = (player, teamIndex) => {
    if (!canRecord) {
      notify(t('referee.kickoffFirst', 'Kick off to start recording'))
      return
    }
    setSelectedPlayer(player)
    setSelectedTeamIndex(teamIndex)
    setAssistSelectionMode(false)
    setPendingGoalEvent(null)
    setOwnGoalAssistMode(false)
    setPendingOwnGoal(null)
  }

  const startGoalFlow = () => {
    if (!selectedPlayer) return
    setPendingGoalEvent({ player: selectedPlayer, teamIndex: selectedTeamIndex })
    setAssistSelectionMode(true)
  }

  const recordGoalWithAssist = (assistant) => {
    if (!pendingGoalEvent) return
    const assistId = assistant ? assistant.id : null
    handleEvent('goal', pendingGoalEvent.teamIndex, pendingGoalEvent.player, {
      assistedBy: assistId,
      assistedName: assistant?.name || '',
    })
    setAssistSelectionMode(false)
    setPendingGoalEvent(null)
    setSelectedPlayer(null)
    setSelectedTeamIndex(null)
  }

  const recordOwnGoal = () => {
    if (!selectedPlayer) return
    setPendingOwnGoal({ player: selectedPlayer, teamIndex: selectedTeamIndex })
    setOwnGoalAssistMode(true)
    setAssistSelectionMode(false)
  }

  const recordCard = (type) => {
    handleEvent(type, selectedTeamIndex, selectedPlayer)
    setSelectedPlayer(null)
    setSelectedTeamIndex(null)
  }

  const renderPlayerCard = (player, teamIndex) => {
    const photo = player.photoUrl || player.avatar
    return (
      <button
        key={player.id}
        onClick={() => openPlayerActions(player, teamIndex)}
        className={`p-1.5 rounded-xl border border-slate-200/60 w-full text-center flex flex-col items-center gap-0 bg-gradient-to-b from-white to-slate-50/30 hover:from-slate-50 hover:to-white hover:border-slate-300/80 hover:shadow-md active:scale-[0.98] transition-all duration-200 shadow-sm h-[78px] ${!canRecord ? 'opacity-60 cursor-not-allowed' : ''}`}
        disabled={!canRecord}
      >
        <InitialAvatar name={player.name} photoUrl={photo} size={44} />
        <div className="w-full min-h-[14px] flex items-center justify-center">
          <div className="font-semibold text-[11px] text-slate-800 leading-tight break-words whitespace-normal max-h-9 overflow-hidden">
            {player.name}
          </div>
        </div>
      </button>
    )
  }

  const latestEvent = events?.[0]
  useEffect(() => {
    if (!events || events.length === 0) {
      setShowRecentEvents(false)
    }
  }, [events])
  const describeEvent = (ev) => {
    if (!ev) return ''
    if (ev.type === 'goal') return ev.assistedName ? `${ev.playerName} (assist ${ev.assistedName})` : `${ev.playerName} goal`
    if (ev.type === 'own_goal') return `${ev.playerName} own goal`
    if (ev.type === 'yellow') return `${ev.playerName} yellow card`
    if (ev.type === 'red') return `${ev.playerName} red card`
    if (ev.type === 'foul') return `${ev.playerName} foul`
    return ev.playerName || 'Event'
  }

  if (gameStatus === 'setup') {
    return (
      <div className="fixed inset-0 bg-slate-100 z-50 overflow-y-auto flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card title={t('referee.setupTitle', 'Match Setup')}>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Match Info</div>
                <div className="text-[15px] font-bold text-slate-900 truncate">{activeMatch?.title || activeMatch?.name || t('referee.matchLabel', 'Match')}</div>
                <div className="text-xs text-slate-600">
                  <span className="font-semibold">When:</span>{' '}
                  {activeMatch?.dateISO
                    ? new Date(activeMatch.dateISO).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
                    : 'Not set'}
                </div>
                {(() => {
                  const loc = activeMatch?.location || activeMatch?.venue || activeMatch?.place || activeMatch?.address
                  const locText = typeof loc === 'string'
                    ? loc
                    : (loc?.name || loc?.address || loc?.preset || '')
                  return (
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold">Where:</span>{' '}
                      {locText || 'Not set'}
                    </div>
                  )
                })()}
                <div className="text-xs text-slate-600">
                  <span className="font-semibold">Participants:</span>{' '}
                  {(() => {
                    const total = Array.isArray(activeMatch?.teams)
                      ? activeMatch.teams.reduce((sum, team) => sum + (Array.isArray(team) ? team.length : 0), 0)
                      : 0
                    return total > 0 ? `${total} players` : 'Not set'
                  })()}
                </div>
                <div className="text-xs text-slate-500">Recording game {matchNumber} for this match.</div>
              </div>

              {activeMatch?.teams && activeMatch.teams.length > 2 && (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Select teams to play (2 teams)</label>
                  <div className="space-y-2">
                    {activeMatch.teams.map((team, idx) => {
                      const isSelected = selectedTeamIndices.includes(idx)
                      const teamColor = resolveTeamColor(idx)
                      const captainId = captains?.[idx]
                      const captain = captainId ? team.find(p => String(p.id) === String(captainId)) : null
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedTeamIndices(prev => {
                              const current = prev || []
                              if (current.includes(idx)) {
                                // Deselect this team
                                return current.filter(i => i !== idx)
                              }
                              // Add or replace to keep at most 2 selections
                              if (current.length < 2) return [...current, idx]
                              return [current[1], idx]
                            })
                          }}
                          className={`w-full p-3 rounded-lg border-2 text-left transition ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                            }`}>
                              {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="text-sm font-bold text-gray-900">팀 {idx + 1}</div>
                                <div className="text-xs text-gray-500">{team.length}명</div>
                              </div>
                              {captain && (
                                <div className="flex items-center gap-1.5">
                                  <InitialAvatar 
                                    name={captain.name} 
                                    photoUrl={captain.photoUrl || captain.avatar} 
                                    size={20} 
                                  />
                                  <div className="text-xs text-gray-600 truncate">
                                    <span className="font-semibold">주장:</span> {captain.name}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t('referee.matchNumber', 'Match Number')}</label>
                  <input
                    type="number"
                    value={matchNumberInput}
                    onChange={(e) => {
                      const val = e.target.value
                      setMatchNumberInput(val)
                      if (val === '') return
                      const newNum = parseInt(val, 10)
                      if (isNaN(newNum) || newNum < 1) return
                      
                      // Check if this match number already exists in previously saved games
                      const prevGames = activeMatch?.stats?.__games || []
                      const currentGameNumber = initialGameIndex + 1
                      const existingGame = prevGames.find(g => g.matchNumber === newNum)

                      if (existingGame && newNum !== currentGameNumber) {
                        // Only warn when attempting to override a different saved game
                        setPendingMatchNumber(newNum)
                        setShowOverrideWarning(true)
                      } else {
                        // No conflict (or same as current), set directly
                        setMatchNumber(newNum)
                      }
                    }}
                    onBlur={(e) => {
                      // Ensure valid number on blur
                      const val = e.target.value
                      if (val === '' || parseInt(val, 10) < 1) {
                        setMatchNumber(initialGameIndex + 1)
                        setMatchNumberInput(String(initialGameIndex + 1))
                      }
                    }}
                    className="w-full p-3 border rounded-lg bg-white"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t('referee.duration', 'Duration (minutes)')}</label>
                  <input
                    type="number"
                    value={durationInput}
                    onChange={(e) => {
                      const val = e.target.value
                      setDurationInput(val)
                      if (val === '') return
                      const num = parseInt(val, 10)
                      if (!isNaN(num) && num >= 1) {
                        setDuration(num)
                      }
                    }}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val === '' || parseInt(val, 10) < 1) {
                        setDuration(20)
                        setDurationInput('20')
                      }
                    }}
                    className="w-full p-3 border rounded-lg bg-white"
                    min={1}
                  />
                </div>
              </div>
              <div className="pt-2 flex gap-2">
                <button onClick={onCancel} className="flex-1 py-3 bg-gray-200 rounded-lg font-bold text-gray-700">
                  Cancel
                </button>
                <button
                  onClick={handleStartSetup}
                  disabled={activeMatch?.teams && activeMatch.teams.length > 2 && selectedTeamIndices.length !== 2}
                  className={`flex-1 py-3 rounded-lg font-bold flex items-center justify-center gap-2 text-lg ${
                    activeMatch?.teams && activeMatch.teams.length > 2 && selectedTeamIndices.length !== 2
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  <Play size={18} />
                  {t('referee.start', 'Start')}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-100 z-50 overflow-y-auto flex flex-col">
      <div className="bg-white/90 shadow-sm px-3 py-4 sticky top-0 z-20 border-b backdrop-blur">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2 text-sm text-slate-600 font-bold">
            <Clock size={16} className="text-slate-500" />
            <span className="tracking-tight">Game {matchNumber}</span>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1">
            <div className={`text-4xl sm:text-5xl font-mono font-black leading-none tracking-tight ${
              currentMinute > duration ? 'text-red-600' : 'text-slate-900'
            }`}>
              {formatTime(elapsedSeconds)}
            </div>
            <span className="text-xs font-bold text-slate-500 tracking-wide">{displayMinute} / {duration} min</span>
            {latestEvent && (
              <button
                type="button"
                onClick={() => setShowRecentEvents((prev) => !prev)}
                className="mt-1 px-3 py-1 rounded-full bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200/60 text-[11px] text-slate-700 flex items-center gap-2 shadow-sm hover:shadow active:scale-[0.98] transition"
              >
                <span className="font-bold">Recent Events ({events.length})</span>
                <span className="line-clamp-1 font-medium max-w-[120px]">{describeEvent(latestEvent)}</span>
                <ChevronDown size={14} className={`transition-transform ${showRecentEvents ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="h-8 w-8 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 active:scale-[0.98] transition flex items-center justify-center"
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
            <button
              onClick={() => setShowSaveConfirm(true)}
              className="h-8 w-8 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition flex items-center justify-center"
              title="Finish"
              aria-label="Finish"
            >
              <Save size={14} />
            </button>
          </div>
        </div>

        {gameStatus === 'ready' && (
          <div className="mt-4">
            <button
              onClick={handleKickOff}
              className="w-full py-6 rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-700 text-white text-2xl font-extrabold shadow-2xl shadow-emerald-300/50 hover:shadow-emerald-400/60 hover:from-emerald-700 hover:to-emerald-800 active:scale-[0.98] transition-all duration-300"
            >
              {t('referee.kickoff', 'Kick Off')}
            </button>
            <div className="text-center text-sm text-slate-600 mt-2 font-medium">Press Kick Off to start recording.</div>
          </div>
        )}
      </div>

      <div className="p-4 pb-40 flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {teams.map((team, idx) => {
            const color = resolveTeamColor(idx)
            const captain = findCaptainPlayer(idx)
            const accent = color?.border || color?.bg || '#0f172a'
            return (
              <div key={idx} className="space-y-2">
                <div className="bg-white/80 backdrop-blur border border-slate-200/50 rounded-2xl p-3 shadow-sm flex items-center gap-3">
                  {renderJersey(color, 24)}
                  <div>
                    <div className="text-[11px] uppercase font-black tracking-wider" style={{ color: accent }}>
                      {t('referee.team', 'Team')} {idx + 1}
                    </div>
                    <div className="text-xs text-slate-500 font-medium">{color?.label || 'Kit'}</div>
                  </div>
                  <div className="flex-1" />
                  <div className="text-3xl font-black text-slate-900 tracking-tight">{scores[idx] || 0}</div>
                </div>

                <div 
                  className="bg-gradient-to-b from-slate-50/60 to-white/80 rounded-xl p-2 max-h-[720px] overflow-y-auto shadow-inner"
                  style={{ 
                    border: `2px solid ${accent}`,
                    borderColor: accent
                  }}
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    {Array.isArray(team) && team.length > 0 ? team.map(player => renderPlayerCard(player, idx)) : (
                      <div className="text-sm text-gray-500 italic">{t('referee.noPlayers', 'No players')}</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {gameStatus === 'ready' && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-gradient-to-br from-white to-slate-50 rounded-3xl shadow-2xl p-6 text-center space-y-4 border border-slate-200/50">
            <div className="text-sm font-bold text-slate-500 uppercase tracking-wide">Kick Off Required</div>
            <div className="text-2xl font-black text-slate-900">Game {matchNumber}</div>
            <div className="text-sm text-slate-600 font-medium">No actions will be recorded until you press Kick Off.</div>
            <button
              onClick={handleKickOff}
              className="w-full py-5 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white text-xl font-extrabold shadow-xl shadow-emerald-300/50 hover:shadow-2xl hover:from-emerald-700 hover:to-emerald-800 active:scale-[0.98] transition-all duration-300"
            >
              {t('referee.kickoff', 'Kick Off')}
            </button>
            <div className="text-xs text-slate-500 font-medium">타이머와 기록이 함께 시작됩니다.</div>
          </div>
        </div>
      )}

      {showRecentEvents && events.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-black/20" onClick={() => setShowRecentEvents(false)}>
          <div className="fixed inset-x-0 top-[120px] px-4">
            <div 
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl mx-auto max-h-[400px] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="sticky top-0 bg-slate-50 border-b px-4 py-2 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-700 uppercase">All Events ({events.length})</div>
              <button
                onClick={() => setShowRecentEvents(false)}
                className="p-1 text-slate-600 hover:bg-slate-200 rounded-full"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-2 space-y-1">
              {events.map((ev, idx) => {
                const scoringTeam = ev.type === 'own_goal' ? (ev.teamIndex === 0 ? 1 : 0) : ev.teamIndex
                const minDisplay = ev.minute > duration ? `${duration} +${ev.minute - duration}'` : `${ev.minute}'`
                const badge = ev.type === 'goal' ? '⚽' : ev.type === 'own_goal' ? '🥅' : ev.type === 'yellow' ? '🟨' : ev.type === 'red' ? '🟥' : '⚠️'
                return (
                  <div key={ev.id || `${ev.timestamp}-${idx}`} className="flex items-center gap-2 text-sm group bg-slate-50/60 hover:bg-slate-100 rounded-lg px-3 py-2">
                    <span className="font-mono text-xs text-gray-500 w-14">{minDisplay}</span>
                    <span className="text-lg" aria-hidden>{badge}</span>
                    <span className={`font-semibold ${scoringTeam === 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {ev.playerName}
                    </span>
                    <span className="text-gray-700 flex-1 truncate">
                      {ev.type === 'goal' && (ev.assistedName ? `Goal (assist: ${ev.assistedName})` : 'Goal')}
                      {ev.type === 'own_goal' && 'Own Goal'}
                      {ev.type === 'yellow' && 'Yellow Card'}
                      {ev.type === 'red' && 'Red Card'}
                      {ev.type === 'foul' && 'Foul'}
                      {ev.type === 'super_save' && 'Super Save'}
                    </span>
                    <button
                      onClick={() => handleRemoveEvent(ev.id)}
                      className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded transition"
                      title="Revert"
                    >
                      Revert
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
          </div>
        </div>
      )}

      {revertTarget && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-white to-slate-50 w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 border border-slate-200/50">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold">!</div>
              <div className="flex-1">
                <div className="text-lg font-bold text-slate-900">Revert this event?</div>
                <div className="text-sm text-slate-600 mt-1 break-words">
                  {revertTarget.playerName} · {revertTarget.type}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRevertTarget(null)}
                className="flex-1 py-3 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 active:scale-[0.98] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => { applyRemoveEvent(revertTarget); setRevertTarget(null) }}
                className="flex-1 py-3 rounded-lg bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200"
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPlayer && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelectedPlayer(null)
            setSelectedTeamIndex(null)
            setAssistSelectionMode(false)
            setPendingGoalEvent(null)
            setOwnGoalAssistMode(false)
            setPendingOwnGoal(null)
          }}
        >
          <div 
            className="bg-gradient-to-br from-white to-slate-50 w-full max-w-sm rounded-2xl p-4 space-y-4 shadow-2xl border border-slate-200/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b pb-3">
              <InitialAvatar name={selectedPlayer.name} photoUrl={selectedPlayer.photoUrl || selectedPlayer.avatar} size={48} />
              <div>
                <div className="font-bold text-lg">{selectedPlayer.name}</div>
                <div className="text-sm text-gray-500">{t('referee.team', 'Team')} {selectedTeamIndex + 1}</div>
              </div>
              <button onClick={() => {
                setSelectedPlayer(null)
                setSelectedTeamIndex(null)
                setAssistSelectionMode(false)
                setPendingGoalEvent(null)
                setOwnGoalAssistMode(false)
                setPendingOwnGoal(null)
              }} className="ml-auto p-2 text-gray-400">
                <X size={22} />
              </button>
            </div>

            {assistSelectionMode ? (
              <div className="fixed inset-0 bg-slate-50/90 z-[60] flex items-center justify-center p-3">
                <div className="flex-1 max-w-3xl w-full bg-white shadow-2xl rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white py-2 px-4 shadow-lg">
                    <h3 className="font-bold text-center text-lg">Select Assist</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => recordGoalWithAssist(null)}
                        className="col-span-2 p-2.5 bg-yellow-400 hover:bg-yellow-500 rounded-lg font-bold text-gray-900 text-sm active:scale-[0.98] transition border-2 border-yellow-600"
                      >
                        NO ASSIST
                      </button>
                      {teams[selectedTeamIndex]
                        .filter(p => p.id !== selectedPlayer.id)
                        .map(teammate => (
                          <button
                            key={teammate.id}
                            onClick={() => recordGoalWithAssist(teammate)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex flex-col items-center gap-1 active:scale-[0.98] transition"
                          >
                            <InitialAvatar name={teammate.name} photoUrl={teammate.photoUrl || teammate.avatar} size={40} />
                            <span className="text-xs font-bold text-gray-900 truncate w-full text-center leading-tight px-0.5">{teammate.name}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                  <div className="p-3 bg-white border-t">
                    <button
                      onClick={() => setAssistSelectionMode(false)}
                      className="w-full py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold text-sm active:scale-[0.98] transition"
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            ) : ownGoalAssistMode ? (
              <div className="fixed inset-0 bg-slate-50/90 z-[60] flex items-center justify-center p-3">
                <div className="flex-1 max-w-3xl w-full bg-white shadow-2xl rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white py-2 px-4 shadow-lg">
                    <h3 className="font-bold text-center text-lg">{t('referee.ownGoalAssistPrompt', 'Did someone force the own goal?')}</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          handleEvent('own_goal', pendingOwnGoal?.teamIndex, pendingOwnGoal?.player, { ownGoal: true })
                          setOwnGoalAssistMode(false)
                          setPendingOwnGoal(null)
                          setSelectedPlayer(null)
                          setSelectedTeamIndex(null)
                        }}
                        className="col-span-2 p-2.5 bg-yellow-400 hover:bg-yellow-500 rounded-lg font-bold text-gray-900 text-sm active:scale-[0.98] transition border-2 border-yellow-600"
                      >
                        NO ASSIST
                      </button>
                      {(teams[pendingOwnGoal?.teamIndex === 0 ? 1 : 0] || []).map(teammate => (
                        <button
                          key={teammate.id}
                          onClick={() => {
                            handleEvent('own_goal', pendingOwnGoal?.teamIndex, pendingOwnGoal?.player, {
                              ownGoal: true,
                              assistedBy: teammate.id,
                              assistedName: teammate.name,
                            })
                            setOwnGoalAssistMode(false)
                            setPendingOwnGoal(null)
                            setSelectedPlayer(null)
                            setSelectedTeamIndex(null)
                          }}
                          className="p-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg flex flex-col items-center gap-1 active:scale-[0.98] transition"
                        >
                          <InitialAvatar name={teammate.name} photoUrl={teammate.photoUrl || teammate.avatar} size={40} />
                          <span className="text-xs font-bold text-gray-900 truncate w-full text-center leading-tight px-0.5">{teammate.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 bg-white border-t">
                    <button
                      onClick={() => { setOwnGoalAssistMode(false); setPendingOwnGoal(null); setSelectedPlayer(null); setSelectedTeamIndex(null) }}
                      className="w-full py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold text-sm active:scale-[0.98] transition"
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startGoalFlow}
                  className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 text-green-700 rounded-xl border border-green-200 shadow-sm hover:shadow-md active:scale-[0.97] transition-all duration-200"
                >
                  <span className="text-2xl mb-1">⚽</span>
                  <span className="font-bold">{t('referee.goal', 'Goal')}</span>
                </button>
                <button
                  onClick={recordOwnGoal}
                  className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-red-50 hover:from-orange-100 hover:to-red-100 text-orange-700 rounded-xl border border-orange-200 shadow-sm hover:shadow-md active:scale-[0.97] transition-all duration-200"
                >
                  <span className="text-2xl mb-1">🥅</span>
                  <span className="font-bold">{t('referee.ownGoal', 'Own Goal')}</span>
                </button>

                {cardsEnabled && (
                  <button
                    onClick={() => recordCard('yellow')}
                    className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-yellow-50 to-amber-50 hover:from-yellow-100 hover:to-amber-100 text-yellow-700 rounded-xl border border-yellow-200 shadow-sm hover:shadow-md active:scale-[0.97] transition-all duration-200"
                  >
                    <span className="w-6 h-8 bg-yellow-400 rounded-sm mb-1 border border-yellow-500 shadow-sm" />
                    <span className="font-bold">{t('referee.yellowCard', 'Yellow Card')}</span>
                  </button>
                )}

                {cardsEnabled && (
                  <button
                    onClick={() => recordCard('red')}
                    className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100 text-red-700 rounded-xl border border-red-200 shadow-sm hover:shadow-md active:scale-[0.97] transition-all duration-200"
                  >
                    <span className="w-6 h-8 bg-red-600 rounded-sm mb-1 border border-red-700 shadow-sm" />
                    <span className="font-bold">{t('referee.redCard', 'Red Card')}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    handleEvent('foul', selectedTeamIndex, selectedPlayer)
                    setSelectedPlayer(null)
                    setSelectedTeamIndex(null)
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-gray-50 hover:from-slate-100 hover:to-gray-100 text-slate-700 rounded-xl border border-slate-300 shadow-sm hover:shadow-md active:scale-[0.97] transition-all duration-200"
                >
                  <span className="text-2xl mb-1">⚠️</span>
                  <span className="font-bold">{t('referee.foul', 'Foul')}</span>
                </button>
                {/* Super Save temporarily disabled
                <button
                  onClick={() => {
                    handleEvent('super_save', selectedTeamIndex, selectedPlayer)
                    setSelectedPlayer(null)
                    setSelectedTeamIndex(null)
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-sky-50 text-sky-700 rounded-xl border border-sky-200"
                >
                  <span className="text-2xl mb-1">🧤</span>
                  <span className="font-bold">{t('referee.superSave', 'Super Save')}</span>
                </button>
                */}

                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Match"
        message={`All in-progress records (${events.length} events) will be deleted.\nThis action cannot be undone.\nAre you sure you want to cancel?`}
        confirmLabel="Cancel Match"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={async () => {
          setShowCancelConfirm(false)
          // Delete all referee events for this match
          try {
            await deleteAllRefEvents(matchIdForRef, gameIndexForRef)
          } catch (err) {
            console.error('Failed to delete referee events:', err)
          }
          // 다른 디바이스에 취소 알림
          await cancelRefSession(matchIdForRef, gameIndexForRef)
          onCancel()
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* Save Confirmation Dialog */}
      <ConfirmDialog
        open={showSaveConfirm}
        title="Save Match"
        message="End the game and save the results?"
        confirmLabel="Save"
        cancelLabel="Cancel"
        tone="default"
        onConfirm={() => {
          setShowSaveConfirm(false)
          const zeroConcededTeams = []
          const s0 = Number(scores?.[0] || 0)
          const s1 = Number(scores?.[1] || 0)
          if (s1 === 0) zeroConcededTeams.push({ teamIndex: 0, players: teams?.[0] || [] })
          if (s0 === 0) zeroConcededTeams.push({ teamIndex: 1, players: teams?.[1] || [] })

          if (zeroConcededTeams.length > 0) {
            const defaults = zeroConcededTeams.flatMap(group =>
              (group.players || []).filter(p => {
                const pos = (p?.position || p?.pos || '').toString().toUpperCase()
                return pos.includes('GK') || pos.includes('DF') || pos.includes('DEF') || pos.includes('수비') || pos.includes('골키퍼')
              }).map(p => p.id)
            )
            setCleanSheetCandidates(zeroConcededTeams)
            setCleanSheetSelections(Array.from(new Set(defaults)))
            setShowCleanSheetPicker(true)
          } else {
            setGameStatus('finished')
            finishMatch().catch(err => console.error('Failed to finish match:', err))
          }
        }}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {showCleanSheetPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl max-h-[80vh] rounded-2xl p-6 space-y-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold">클린시트 지정</div>
                <div className="text-lg font-bold text-slate-900">Select players from the clean-sheet team</div>
                <p className="text-sm text-slate-600 mt-1">Choose defenders/goalkeeper from the team that conceded zero.</p>
              </div>
              <button onClick={() => { setShowCleanSheetPicker(false); setCleanSheetSelections([]); }} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              {cleanSheetCandidates.map(group => (
                <div key={group.teamIndex} className="border rounded-xl p-3 bg-slate-50/70">
                  <div className="text-xs font-semibold text-slate-500 mb-2">Team {group.teamIndex + 1}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(group.players || []).map(p => {
                      const checked = cleanSheetSelections.includes(p.id)
                      return (
                        <label key={p.id} className={`flex items-center gap-2 border rounded-lg px-3 py-2 bg-white shadow-sm cursor-pointer ${checked ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'}`}>
                          <input
                            type="checkbox"
                            className="accent-emerald-600"
                            checked={checked}
                            onChange={(e) => {
                              setCleanSheetSelections(prev => {
                                const set = new Set(prev)
                                if (e.target.checked) set.add(p.id)
                                else set.delete(p.id)
                                return Array.from(set)
                              })
                            }}
                          />
                          <InitialAvatar name={p.name} photoUrl={p.photoUrl || p.avatar} size={28} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                            {(p.position || p.pos) && <div className="text-[11px] text-slate-500 truncate">{p.position || p.pos}</div>}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCleanSheetPicker(false)
                  setGameStatus('finished')
                  finishMatch(cleanSheetSelections).catch(err => console.error('Failed to finish match:', err))
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold"
              >
                선택 완료 후 저장
              </button>
              <button
                onClick={() => {
                  setShowCleanSheetPicker(false)
                  setGameStatus('finished')
                  finishMatch([]).catch(err => console.error('Failed to finish match:', err))
                }}
                className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold"
              >
                건너뛰기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Warning Dialog */}
      <ConfirmDialog
        open={showOverrideWarning}
        title="⚠️ Overwrite saved game"
        message={`Match ${pendingMatchNumber} is already saved.\nOverwrite the existing record?`}
        confirmLabel="Overwrite"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          setMatchNumber(pendingMatchNumber)
          setMatchNumberInput(String(pendingMatchNumber))
          setShowOverrideWarning(false)
          setPendingMatchNumber(null)
        }}
        onCancel={() => {
          setShowOverrideWarning(false)
          setPendingMatchNumber(null)
        }}
      />
    </div>
  )
}
