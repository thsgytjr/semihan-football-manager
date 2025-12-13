import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import InitialAvatar from './InitialAvatar'
import ConfirmDialog from './ConfirmDialog'
import { X, Edit2, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'

const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

export default function RefereeTimelineEditor({ match, players, teams: providedTeams, onSave }) {
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

  const gameIndices = useMemo(() => {
    return Array.from({ length: maxGameCount }, (_, i) => i)
  }, [maxGameCount])

  const getGameScore = (gameIndex) => {
    const evs = eventsByGame[gameIndex] || []
    const t0 = evs.filter(e => (e.type === 'goal' && e.teamIndex === 0) || (e.type === 'own_goal' && e.teamIndex === 1)).length
    const t1 = evs.filter(e => (e.type === 'goal' && e.teamIndex === 1) || (e.type === 'own_goal' && e.teamIndex === 0)).length
    return `${t0} : ${t1}`
  }

  const handleDeleteEvent = (eventId) => {
    setTimeline(prev => prev.filter(ev => ev.id !== eventId))
    setConfirmDelete({ open: false, eventId: null })
  }

  const handleDeleteGame = (gameIdx) => {
    setTimeline(prev => prev
      .filter(ev => Number(ev.gameIndex ?? 0) !== gameIdx)
      .map(ev => {
        const gi = Number(ev.gameIndex ?? 0)
        if (gi > gameIdx) return { ...ev, gameIndex: gi - 1 }
        return ev
      })
    )
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

  const handleAddEvent = (newEvent) => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setTimeline(prev => [...prev, { ...newEvent, id, timestamp: Date.now() }])
    setShowAddEvent(false)
    
    // Auto expand the game we just added to
    setExpandedGames(prev => {
      const next = new Set(prev)
      next.add(newEvent.gameIndex)
      return next
    })
  }

  const handleSaveToMatch = () => {
    const baseStats = match?.stats && typeof match.stats === 'object' ? match.stats : {}
    const teamCount = Math.max(teams.length || 0, 2)
    const gameCount = Math.max(maxGameCount, 1)

    const createBlankScores = () => Array.from({ length: teamCount }, () => 0)
    const gameScores = Array.from({ length: gameCount }, () => createBlankScores())

    timeline.forEach(ev => {
      const gi = Math.max(0, Number(ev.gameIndex) || 0)
      while (gameScores.length <= gi) gameScores.push(createBlankScores())

      const rawTeamIdx = Number(ev.teamIndex ?? 0)
      const teamIdx = Number.isFinite(rawTeamIdx) ? Math.max(0, Math.min(teamCount - 1, rawTeamIdx)) : 0
      const scoringTeam = ev.type === 'own_goal'
        ? (teamCount > 1 ? (teamIdx === 0 ? 1 : 0) : 0)
        : teamIdx

      if (ev.type === 'goal' || ev.type === 'own_goal') {
        gameScores[gi][scoringTeam] = (Number(gameScores[gi][scoringTeam]) || 0) + 1
      }
    })

    const quarterScores = Array.from({ length: teamCount }, (_, ti) => gameScores.map(gs => Number(gs[ti]) || 0))
    
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
        const gi = Math.max(0, Number(ev.gameIndex) || 0)
        const ti = Math.max(0, Number(ev.teamIndex) || 0)
        manualCleanSheets.add(`${gi}-${ti}`)
        const teamPlayers = teams[ti] || []
        teamPlayers.forEach(p => {
          const csEntry = ensureStat(p.id)
          if (csEntry) csEntry.cleanSheet += 1
        })
      }

      if (ev.type === 'yellow' && entry) entry.yellowCards += 1
      if (ev.type === 'red' && entry) entry.redCards += 1
      if (ev.type === 'foul' && entry) entry.fouls += 1
    })

    // Auto-derive clean sheets per game if not manually set for that team
    const cleanSheetMatrix = Array.from({ length: gameScores.length }, () => Array.from({ length: teamCount }, () => 0))

    for (let gi = 0; gi < gameScores.length; gi += 1) {
      const scores = gameScores[gi] || []
      scores.forEach((_, ti) => {
        const key = `${gi}-${ti}`
        const opponentScore = scores.reduce((sum, val, idx) => idx === ti ? sum : sum + (Number(val) || 0), 0)
        const isClean = opponentScore === 0 || manualCleanSheets.has(key)
        if (isClean) {
          cleanSheetMatrix[gi][ti] = 1
          // If manual event was added we already incremented; auto case increments here
          if (!manualCleanSheets.has(key)) {
            const teamPlayers = teams[ti] || []
            teamPlayers.forEach(p => {
              const csEntry = ensureStat(p.id)
              if (csEntry) csEntry.cleanSheet += 1
            })
          }
        }
      })
    }

    const prevGames = Array.isArray(match?.stats?.__games) ? match.stats.__games : []
    const nextGames = Array.from({ length: gameScores.length }, (_, gi) => {
      const prev = prevGames.find(g => Number(g?.matchNumber) === gi + 1) || {}
      const nextEvents = timeline.filter(ev => Number(ev.gameIndex ?? 0) === gi)
      return {
        ...prev,
        id: prev.id || `game-${gi + 1}`,
        matchNumber: gi + 1,
        scores: gameScores[gi] || createBlankScores(),
        cleanSheets: cleanSheetMatrix[gi] || [],
        events: nextEvents,
      }
    })

    const aggregateScores = gameScores.reduce((acc, gs) => {
      gs.forEach((val, ti) => {
        acc[ti] = (acc[ti] || 0) + (Number(val) || 0)
      })
      return acc
    }, [])

    const gameEventsPayload = timeline
      .filter(ev => ev && (ev.type === 'goal' || ev.type === 'own_goal' || ev.type === 'foul' || ev.type === 'yellow' || ev.type === 'red' || ev.type === 'super_save'))
      .map((ev, idx) => {
        const baseTeamIdx = Number(ev.teamIndex ?? 0)
        const scoringTeam = ev.type === 'own_goal'
          ? (teamCount > 1 ? (baseTeamIdx === 0 ? 1 : 0) : 0)
          : baseTeamIdx
        return {
          id: ev.id || `${ev.gameIndex ?? 0}-${scoringTeam}-${idx}`,
          gameIndex: Number(ev.gameIndex ?? 0),
          teamIndex: scoringTeam,
          scorerId: toStr(ev.playerId),
          assistId: ev.assistedBy ? toStr(ev.assistedBy) : '',
          ownGoal: ev.type === 'own_goal',
          eventType: ev.type,
          minute: ev.minute ? String(ev.minute) : '',
        }
      })

    const mergedStats = {
      ...baseStats,
      ...statsMap,
      __events: timeline,
      __games: nextGames,
      __scores: aggregateScores,
    }

    const nextDraft = {
      ...(match?.draft || {}),
      quarterScores,
    }

    const nextStatsMeta = {
      ...(match?.statsMeta || {}),
      gameEvents: gameEventsPayload,
      cleanSheets: cleanSheetMatrix,
    }

    onSave?.(match.id, {
      stats: mergedStats,
      quarterScores,
      draft: nextDraft,
      gameEvents: gameEventsPayload,
      statsMeta: nextStatsMeta,
    })
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
        />
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <EventAddModal
          players={players}
          teams={teams}
          onAdd={handleAddEvent}
          onCancel={() => setShowAddEvent(false)}
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
  const player = ev.type === 'clean_sheet' ? null : playersById.get(toStr(ev.playerId))
  const assistPlayer = ev.assistedBy ? playersById.get(toStr(ev.assistedBy)) : null
  
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
          {ev.type === 'clean_sheet' ? (
            <span className="text-sm font-semibold text-teal-700">팀 클린시트</span>
          ) : player ? (
            <div className="flex items-center gap-1.5">
              <InitialAvatar name={player.name} photoUrl={player.photoUrl} size={20} />
              <span className="text-sm font-semibold text-gray-800 truncate">{player.name}</span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">선수 미상</span>
          )}
          
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
function EventEditModal({ event, players, teams, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    type: event.type || 'goal',
    playerId: toStr(event.playerId || ''),
    teamIndex: event.teamIndex ?? 0,
    gameIndex: event.gameIndex ?? 0,
    minute: event.minute || '',
    assistedBy: toStr(event.assistedBy || ''),
  })

  const needsAssist = ['goal', 'own_goal'].includes(formData.type)
  const needsPlayer = formData.type !== 'clean_sheet'

  const handleSubmit = (e) => {
    e.preventDefault()
    const parsedGameIndex = Number.isFinite(Number(formData.gameIndex)) ? Number(formData.gameIndex) : 0
    onSave({
      ...event,
      type: formData.type,
      playerId: needsPlayer ? formData.playerId : '',
      teamIndex: Number(formData.teamIndex),
      gameIndex: parsedGameIndex,
      minute: formData.minute,
      assistedBy: needsAssist ? (formData.assistedBy || null) : null,
      assistedName: needsAssist && formData.assistedBy 
        ? players.find(p => toStr(p.id) === formData.assistedBy)?.name || ''
        : '',
      playerName: needsPlayer
        ? (players.find(p => toStr(p.id) === formData.playerId)?.name || '')
        : '',
    })
  }

  const selectedTeam = teams[Number(formData.teamIndex)] || []

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
              <option value="yellow">🟨 옐로카드</option>
              <option value="red">🟥 레드카드</option>
              <option value="foul">⚠️ 파울</option>
              <option value="super_save">🧤 슈퍼세이브</option>
              <option value="clean_sheet">🧱 클린시트 (팀)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">게임 번호</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500 font-bold">G</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  step="1"
                  value={Number(formData.gameIndex) + 1}
                  onChange={(e) => {
                    const raw = e.target.value
                    const parsed = Number.parseInt(raw, 10)
                    setFormData(prev => ({ ...prev, gameIndex: Number.isFinite(parsed) ? Math.max(0, parsed - 1) : 0 }))
                  }}
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
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
              {teams.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, teamIndex: idx, playerId: '', assistedBy: '' }))}
                  className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                    Number(formData.teamIndex) === idx
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  팀 {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">선수 선택</label>
            <select
              value={formData.playerId}
              onChange={(e) => setFormData(prev => ({ ...prev, playerId: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required={needsPlayer}
              disabled={!needsPlayer}
            >
              <option value="">{needsPlayer ? '선택해주세요...' : '클린시트는 팀 전체 반영'}</option>
              {needsPlayer && selectedTeam.map(p => (
                <option key={p.id} value={toStr(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>

          {needsAssist && needsPlayer && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                어시스트 (선택)
              </label>
              <select
                value={formData.assistedBy}
                onChange={(e) => setFormData(prev => ({ ...prev, assistedBy: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                <option value="">없음</option>
                {selectedTeam.filter(p => toStr(p.id) !== formData.playerId).map(p => (
                  <option key={p.id} value={toStr(p.id)}>{p.name}</option>
                ))}
              </select>
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
function EventAddModal({ players, teams, onAdd, onCancel }) {
  const [formData, setFormData] = useState({
    type: 'goal',
    playerId: '',
    teamIndex: 0,
    gameIndex: 0,
    minute: '',
    assistedBy: '',
  })

  const needsAssist = ['goal', 'own_goal'].includes(formData.type)
  const needsPlayer = formData.type !== 'clean_sheet'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (needsPlayer && !formData.playerId) return
    const parsedGameIndex = Number.isFinite(Number(formData.gameIndex)) ? Number(formData.gameIndex) : 0

    const player = players.find(p => toStr(p.id) === formData.playerId)
    const assistPlayer = formData.assistedBy 
      ? players.find(p => toStr(p.id) === formData.assistedBy)
      : null

    onAdd({
      type: formData.type,
      playerId: needsPlayer ? formData.playerId : '',
      playerName: needsPlayer ? (player?.name || '') : '',
      teamIndex: Number(formData.teamIndex),
      gameIndex: parsedGameIndex,
      minute: formData.minute,
      assistedBy: needsAssist ? (formData.assistedBy || null) : null,
      assistedName: needsAssist ? (assistPlayer?.name || '') : '',
    })
  }

  const selectedTeam = teams[Number(formData.teamIndex)] || []

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
              <option value="yellow">🟨 옐로카드</option>
              <option value="red">🟥 레드카드</option>
              <option value="foul">⚠️ 파울</option>
              <option value="super_save">🧤 슈퍼세이브</option>
              <option value="clean_sheet">🧱 클린시트 (팀)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">게임 번호</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500 font-bold">G</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  step="1"
                  value={Number(formData.gameIndex) + 1}
                  onChange={(e) => {
                    const raw = e.target.value
                    const parsed = Number.parseInt(raw, 10)
                    setFormData(prev => ({ ...prev, gameIndex: Number.isFinite(parsed) ? Math.max(0, parsed - 1) : 0 }))
                  }}
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
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
              {teams.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, teamIndex: idx, playerId: '', assistedBy: '' }))}
                  className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                    Number(formData.teamIndex) === idx
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  팀 {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">선수 선택</label>
            <select
              value={formData.playerId}
              onChange={(e) => setFormData(prev => ({ ...prev, playerId: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required={needsPlayer}
              disabled={!needsPlayer}
            >
              <option value="">{needsPlayer ? '선택해주세요...' : '클린시트는 팀 전체 반영'}</option>
              {needsPlayer && selectedTeam.map(p => (
                <option key={p.id} value={toStr(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>

          {needsAssist && needsPlayer && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                어시스트 (선택)
              </label>
              <select
                value={formData.assistedBy}
                onChange={(e) => setFormData(prev => ({ ...prev, assistedBy: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                <option value="">없음</option>
                {selectedTeam.filter(p => toStr(p.id) !== formData.playerId).map(p => (
                  <option key={p.id} value={toStr(p.id)}>{p.name}</option>
                ))}
              </select>
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
