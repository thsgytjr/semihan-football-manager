import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Pause, Save, X, Clock } from 'lucide-react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import ConfirmDialog from '../components/ConfirmDialog'
import { notify } from '../components/Toast'
import { getCaptains } from '../lib/matchHelpers'

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
  const [gameStatus, setGameStatus] = useState('setup') // setup -> ready -> playing/paused -> finished
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
  const [showCleanSheetPicker, setShowCleanSheetPicker] = useState(false)
  const [cleanSheetCandidates, setCleanSheetCandidates] = useState([])
  const [cleanSheetSelections, setCleanSheetSelections] = useState([])

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
  const canRecord = gameStatus === 'playing' || gameStatus === 'paused' || gameStatus === 'finished'

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

  const handlePause = () => setGameStatus('paused')
  const handleResume = () => setGameStatus('playing')

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

  const handleRemoveEvent = (eventId) => {
    const target = events.find(e => e.id === eventId)
    if (!target) return
    if (!window.confirm(t('referee.confirmDeleteEvent', 'Delete this event?'))) return

    setEvents(prev => prev.filter(e => e.id !== eventId))

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

  const finishMatch = (cleanSheetAwardees = cleanSheetSelections) => {
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
        className={`p-3 rounded-xl border w-full text-left flex items-center gap-3 bg-white/90 hover:border-gray-300 active:scale-[0.99] transition shadow-sm ${!canRecord ? 'opacity-60 cursor-not-allowed' : ''}`}
        disabled={!canRecord}
      >
        <InitialAvatar name={player.name} photoUrl={photo} size={42} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate text-[14px] text-gray-900">{player.name}</div>
          {(player.position || player.pos) && (
            <div className="text-xs text-gray-500 truncate">{player.position || player.pos}</div>
          )}
        </div>
      </button>
    )
  }

  if (gameStatus === 'setup') {
    return (
      <div className="fixed inset-0 bg-slate-100 z-50 overflow-y-auto flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card title={t('referee.setupTitle', 'Match Setup')}>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">매치 정보</div>
                <div className="text-[15px] font-bold text-slate-900 truncate">{activeMatch?.title || activeMatch?.name || t('referee.matchLabel', 'Match')}</div>
                {activeMatch?.dateISO && (
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(activeMatch.dateISO).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</div>
                )}
                <div className="text-xs text-slate-500 mt-1">이 매치의 {initialGameIndex + 1}번째 게임을 기록합니다.</div>
              </div>

              {activeMatch?.teams && activeMatch.teams.length > 2 && (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">경기할 팀 선택 (2팀)</label>
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
                                <div 
                                  className="w-4 h-4 rounded-full border flex-shrink-0" 
                                  style={{ 
                                    backgroundColor: teamColor?.bg || '#f3f4f6',
                                    borderColor: teamColor?.border || '#d1d5db'
                                  }}
                                  title={teamColor?.label || 'No color'}
                                />
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
                  {t('common.cancel', 'Cancel')}
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
      <div className="bg-white/90 shadow-sm p-3 sticky top-0 z-20 border-b backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-700 font-semibold">
            <Clock size={16} />
            <span>Game {matchNumber}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className={`text-3xl font-mono font-bold leading-none ${
              gameStatus === 'paused' || gameStatus === 'ready' 
                ? 'text-yellow-600' 
                : currentMinute > duration 
                  ? 'text-red-600' 
                  : 'text-gray-900'
            }`}>
              {formatTime(elapsedSeconds)}
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold">
              <div className={`${
                currentMinute > duration ? 'text-red-600' : 'text-gray-500'
              }`}>{displayMinute}</div>
              <span className="text-gray-400">/</span>
              <span className="text-gray-500">{duration} min</span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {gameStatus === 'playing' && (
              <button onClick={handlePause} className="p-2 bg-yellow-100 text-yellow-700 rounded-full">
                <Pause size={22} />
              </button>
            )}
            {gameStatus === 'paused' && (
              <button onClick={handleResume} className="p-2 bg-green-100 text-green-700 rounded-full">
                <Play size={22} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 items-center bg-slate-50 rounded-xl p-3 border border-slate-200">
          {[0, 1].map(idx => {
            const color = resolveTeamColor(idx)
            return (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {renderJersey(color, 20)}
                  <div>
                    <div className="text-[11px] uppercase text-slate-500 font-semibold">{t('referee.team', 'Team')} {idx + 1}</div>
                    <div className="text-xs text-slate-500">{color?.label || 'Kit'}</div>
                  </div>
                </div>
                <span className="text-3xl font-bold text-slate-900">{scores[idx] || 0}</span>
              </div>
            )
          })}
        </div>

        {gameStatus === 'ready' && (
          <div className="mt-4">
            <button
              onClick={handleKickOff}
              className="w-full py-6 rounded-2xl bg-emerald-600 text-white text-2xl font-extrabold shadow-xl shadow-emerald-200 active:scale-[0.99]"
            >
              {t('referee.kickoff', 'Kick Off')}
            </button>
            <div className="text-center text-sm text-slate-700 mt-2 font-semibold">킥오프를 눌러야 기록을 시작할 수 있습니다.</div>
          </div>
        )}
      </div>

      <div className="p-4 pb-40 flex-1 space-y-4">
        <div className={`bg-white border rounded-xl p-3 ${!canRecord ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-700 uppercase">{t('referee.timeline', 'Timeline')}</h3>
            {events.length > 0 && <span className="text-xs text-gray-500">{events.length} events</span>}
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {events.length === 0 && (
              <div className="text-xs text-gray-400 italic">{t('referee.noEvents', 'No events yet')}</div>
            )}
            {events.map((ev, idx) => {
              const scoringTeam = ev.type === 'own_goal' ? (ev.teamIndex === 0 ? 1 : 0) : ev.teamIndex
              const minDisplay = ev.minute > duration ? `${duration} +${ev.minute - duration}'` : `${ev.minute}'`
              return (
                <div key={ev.id || `${ev.timestamp}-${idx}`} className="flex items-center gap-2 text-sm group">
                  <span className="font-mono text-xs text-gray-500 w-14">{minDisplay}</span>
                  <span className={`font-semibold ${scoringTeam === 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {ev.playerName}
                  </span>
                  <span className="text-gray-700 flex-1">
                    {ev.type === 'goal' && (ev.assistedName ? `⚽ Goal (assist: ${ev.assistedName})` : '⚽ Goal')}
                    {ev.type === 'own_goal' && '🥅 Own Goal'}
                    {ev.type === 'yellow' && '🟨 Yellow Card'}
                    {ev.type === 'red' && '🟥 Red Card'}
                    {ev.type === 'foul' && '⚠️ Foul'}
                    {ev.type === 'super_save' && '🧤 Super Save'}
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
        <div className="grid grid-cols-2 gap-3">
          {teams.map((team, idx) => {
            const color = resolveTeamColor(idx)
            const captain = findCaptainPlayer(idx)
            return (
              <div key={idx} className="bg-white/95 rounded-2xl border border-slate-200 p-3 space-y-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {renderJersey(color, 24)}
                    <div>
                      <div className="text-xs uppercase text-slate-500 font-semibold">{t('referee.team', 'Team')} {idx + 1}</div>
                      <div className="text-sm text-slate-600">{color?.label || 'Kit'}</div>
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">{scores[idx] || 0}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Array.isArray(team) && team.length > 0 ? team.map(player => renderPlayerCard(player, idx)) : (
                    <div className="text-sm text-gray-500 italic">{t('referee.noPlayers', 'No players')}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {gameStatus === 'ready' && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-center space-y-4">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Kick Off Required</div>
            <div className="text-2xl font-extrabold text-slate-900">Game {matchNumber}</div>
            <div className="text-sm text-slate-600">킥오프를 누르기 전까지 어떤 액션도 기록되지 않습니다.</div>
            <button
              onClick={handleKickOff}
              className="w-full py-5 rounded-2xl bg-emerald-600 text-white text-xl font-extrabold shadow-lg shadow-emerald-200 active:scale-[0.99]"
            >
              {t('referee.kickoff', 'Kick Off')}
            </button>
            <div className="text-xs text-slate-500">타이머와 기록이 함께 시작됩니다.</div>
          </div>
        </div>
      )}

      <div className="bg-white/95 border-t p-4 sticky bottom-0 backdrop-blur shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="flex gap-2">
          <button onClick={() => setShowCancelConfirm(true)} className="flex-1 py-3 bg-gray-200 rounded-xl font-bold text-gray-700">
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={() => setShowSaveConfirm(true)}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {t('referee.finish', 'Finish Match')}
          </button>
        </div>
      </div>

      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-3 border-b pb-3">
              <InitialAvatar name={selectedPlayer.name} photoUrl={selectedPlayer.photoUrl || selectedPlayer.avatar} size={48} />
              <div>
                <div className="font-bold text-lg">{selectedPlayer.name}</div>
                <div className="text-sm text-gray-500">{t('referee.team', 'Team')} {selectedTeamIndex + 1}</div>
              </div>
              <button onClick={() => setSelectedPlayer(null)} className="ml-auto p-2 text-gray-400">
                <X size={22} />
              </button>
            </div>

            {assistSelectionMode ? (
              <div className="space-y-3">
                <h3 className="font-bold text-center text-lg">{t('referee.assistPrompt', 'Who assisted?')}</h3>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => recordGoalWithAssist(null)}
                    className="col-span-2 p-3 bg-gray-100 rounded-lg font-medium text-gray-700"
                  >
                    {t('referee.noAssist', 'No Assist')}
                  </button>
                  {teams[selectedTeamIndex]
                    .filter(p => p.id !== selectedPlayer.id)
                    .map(teammate => (
                      <button
                        key={teammate.id}
                        onClick={() => recordGoalWithAssist(teammate)}
                        className="p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2"
                      >
                        <InitialAvatar name={teammate.name} photoUrl={teammate.photoUrl || teammate.avatar} size={24} />
                        <span className="text-sm font-medium truncate">{teammate.name}</span>
                      </button>
                    ))}
                </div>
                <button
                  onClick={() => setAssistSelectionMode(false)}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold"
                >
                  {t('common.back', 'Back')}
                </button>
              </div>
            ) : ownGoalAssistMode ? (
              <div className="space-y-3">
                <h3 className="font-bold text-center text-lg">{t('referee.ownGoalAssistPrompt', 'Did someone force the own goal?')}</h3>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => {
                      handleEvent('own_goal', pendingOwnGoal?.teamIndex, pendingOwnGoal?.player, { ownGoal: true })
                      setOwnGoalAssistMode(false)
                      setPendingOwnGoal(null)
                      setSelectedPlayer(null)
                      setSelectedTeamIndex(null)
                    }}
                    className="col-span-2 p-3 bg-gray-100 rounded-lg font-medium text-gray-700"
                  >
                    {t('referee.noAssist', 'No Assist')}
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
                      className="p-2 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-2"
                    >
                      <InitialAvatar name={teammate.name} photoUrl={teammate.photoUrl || teammate.avatar} size={24} />
                      <span className="text-sm font-medium truncate">{teammate.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setOwnGoalAssistMode(false); setPendingOwnGoal(null); setSelectedPlayer(null); setSelectedTeamIndex(null) }}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startGoalFlow}
                  className="flex flex-col items-center justify-center p-4 bg-green-50 text-green-700 rounded-xl border border-green-100"
                >
                  <span className="text-2xl mb-1">⚽</span>
                  <span className="font-bold">{t('referee.goal', 'Goal')}</span>
                </button>
                <button
                  onClick={recordOwnGoal}
                  className="flex flex-col items-center justify-center p-4 bg-orange-50 text-orange-700 rounded-xl border border-orange-100"
                >
                  <span className="text-2xl mb-1">🥅</span>
                  <span className="font-bold">{t('referee.ownGoal', 'Own Goal')}</span>
                </button>

                {cardsEnabled && (
                  <button
                    onClick={() => recordCard('yellow')}
                    className="flex flex-col items-center justify-center p-4 bg-yellow-50 text-yellow-700 rounded-xl border border-yellow-200"
                  >
                    <span className="w-6 h-8 bg-yellow-400 rounded-sm mb-1 border border-yellow-500" />
                    <span className="font-bold">{t('referee.yellowCard', 'Yellow Card')}</span>
                  </button>
                )}

                {cardsEnabled && (
                  <button
                    onClick={() => recordCard('red')}
                    className="flex flex-col items-center justify-center p-4 bg-red-50 text-red-700 rounded-xl border border-red-200"
                  >
                    <span className="w-6 h-8 bg-red-600 rounded-sm mb-1 border border-red-700" />
                    <span className="font-bold">{t('referee.redCard', 'Red Card')}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    handleEvent('foul', selectedTeamIndex, selectedPlayer)
                    setSelectedPlayer(null)
                    setSelectedTeamIndex(null)
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 text-gray-700 rounded-xl border border-gray-300"
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
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelConfirm}
        title="경기 취소"
        message={`진행 중인 모든 기록(${events.length}개 이벤트)이 삭제됩니다.\n정말 취소하시겠습니까?`}
        confirmLabel="취소하기"
        cancelLabel="계속 진행"
        tone="danger"
        onConfirm={() => {
          setShowCancelConfirm(false)
          onCancel()
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* Save Confirmation Dialog */}
      <ConfirmDialog
        open={showSaveConfirm}
        title="경기 저장"
        message="경기를 종료하고 결과를 저장하시겠습니까?"
        confirmLabel="저장하기"
        cancelLabel="취소"
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
            finishMatch()
          }
        }}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {showCleanSheetPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold">클린시트 지정</div>
                <div className="text-lg font-bold text-slate-900">무실점 경기 팀의 선수 선택</div>
                <p className="text-sm text-slate-600 mt-1">무실점 팀의 수비/키퍼 등을 선택해 클린시트를 부여하세요.</p>
              </div>
              <button onClick={() => { setShowCleanSheetPicker(false); setCleanSheetSelections([]); }} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
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
                  finishMatch(cleanSheetSelections)
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold"
              >
                선택 완료 후 저장
              </button>
              <button
                onClick={() => {
                  setShowCleanSheetPicker(false)
                  setGameStatus('finished')
                  finishMatch([])
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
        title="⚠️ 기존 게임 덮어쓰기"
        message={`Match ${pendingMatchNumber}은(는) 이미 저장된 게임입니다.\n기존 기록을 덮어쓰시겠습니까?`}
        confirmLabel="덮어쓰기"
        cancelLabel="취소"
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
