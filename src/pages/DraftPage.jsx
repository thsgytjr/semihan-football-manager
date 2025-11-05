import React, { useState, useEffect, useRef } from 'react'
import { Search, RefreshCw, Save } from 'lucide-react'
import Card from '../components/Card'
import DraftBoard from '../components/DraftBoard'
import InitialAvatar from '../components/InitialAvatar'
import { notify } from '../components/Toast'

export default function DraftPage({ players, upcomingMatches, onUpdateUpcomingMatch }) {
  const [draftState, setDraftState] = useState('setup') // setup, selectParticipants, selectCaptains, pickFirst, ready, drafting, completed
  const [captain1, setCaptain1] = useState(null)
  const [captain2, setCaptain2] = useState(null)
  const [firstPick, setFirstPick] = useState(null) // 'captain1' or 'captain2'
  const [currentTurn, setCurrentTurn] = useState(null)
  const [team1, setTeam1] = useState([])
  const [team2, setTeam2] = useState([])
  const [playerPool, setPlayerPool] = useState([])
  const [allPlayers, setAllPlayers] = useState([]) // 전체 선수 목록
  const [participatingPlayers, setParticipatingPlayers] = useState([]) // 참여하는 선수들
  const [timeLeft, setTimeLeft] = useState(15)
  const [pickCount, setPickCount] = useState(0) // 현재 턴에서 몇 명 픽했는지
  const [searchTerm, setSearchTerm] = useState('') // 검색어
  const [isReadyForNextTurn, setIsReadyForNextTurn] = useState(false) // 다음 턴 준비 상태
  const isTimeOutProcessing = useRef(false) // 타임아웃 처리 중복 방지
  
  // 선공 선택 애니메이션
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState(null)
  
  // 드래프트 설정
  const [draftSettings, setDraftSettings] = useState({
    timerDuration: 15, // 타이머 시간 (초)
    firstPickCount: 1, // 첫 턴 선택 수
    regularPickCount: 2, // 이후 턴 선택 수
    timerEnabled: true, // 타이머 활성화 여부
  })
  
  // 드래프트 히스토리 (뒤로가기용)
  const [draftHistory, setDraftHistory] = useState([])

  // 예정된 매치 선택
  const [selectedUpcomingMatchId, setSelectedUpcomingMatchId] = useState(null)

  // 초기 로드
  useEffect(() => {
    setAllPlayers([...players])
  }, [players])

  // 예정된 매치 선택 시 참가자 및 주장 정보 불러오기
  useEffect(() => {
    if (selectedUpcomingMatchId && upcomingMatches) {
      const selectedMatch = upcomingMatches.find(m => m.id === selectedUpcomingMatchId)
      if (selectedMatch) {
        // 새로운 매치 선택 시 기존 데이터 초기화
        setParticipatingPlayers([])
        setCaptain1(null)
        setCaptain2(null)
        setTeam1([])
        setTeam2([])
        setPlayerPool([])
        
        // 드래프트가 이미 완료된 경우 - 완료된 팀 구성 불러오기
        if (selectedMatch.isDraftComplete && selectedMatch.snapshot && selectedMatch.snapshot.length === 2) {
          const team1Ids = selectedMatch.snapshot[0] || []
          const team2Ids = selectedMatch.snapshot[1] || []
          
          // 팀 선수 객체로 변환
          const team1Players = team1Ids
            .map(id => players.find(p => p.id === id))
            .filter(Boolean)
          
          const team2Players = team2Ids
            .map(id => players.find(p => p.id === id))
            .filter(Boolean)
          
          // 주장 정보 불러오기
          const captainIds = selectedMatch.captainIds || []
          const captain1Obj = players.find(p => p.id === captainIds[0])
          const captain2Obj = players.find(p => p.id === captainIds[1])
          
          if (team1Players.length > 0 && team2Players.length > 0) {
            // 주장을 각 팀의 첫 번째로 배치
            const sortedTeam1 = captain1Obj 
              ? [captain1Obj, ...team1Players.filter(p => p.id !== captain1Obj.id)]
              : team1Players
            
            const sortedTeam2 = captain2Obj
              ? [captain2Obj, ...team2Players.filter(p => p.id !== captain2Obj.id)]
              : team2Players
            
            setTeam1(sortedTeam1)
            setTeam2(sortedTeam2)
            setCaptain1(captain1Obj)
            setCaptain2(captain2Obj)
            setDraftState('completed')
            notify(`완료된 드래프트를 불러왔습니다. (팀1: ${team1Players.length}명, 팀2: ${team2Players.length}명)`)
            return // 완료된 드래프트는 여기서 종료
          }
        }
        
        // 드래프트가 완료되지 않은 경우 - 참가자와 주장만 불러오기
        // 참가자 ID 목록 가져오기 (participantIds 우선, 없으면 attendeeIds)
        const participantIds = selectedMatch.participantIds || selectedMatch.attendeeIds || []
        
        // 참가자 선수 객체로 변환
        const participants = participantIds
          .map(id => players.find(p => p.id === id))
          .filter(Boolean) // null/undefined 제거
        
        if (participants.length > 0) {
          setParticipatingPlayers(participants)
          notify(`${participants.length}명의 참가자를 불러왔습니다.`)
        }

        // 주장 정보 불러오기
        const captainIds = selectedMatch.captainIds || []
        if (captainIds.length >= 2) {
          const captain1Obj = players.find(p => p.id === captainIds[0])
          const captain2Obj = players.find(p => p.id === captainIds[1])
          
          if (captain1Obj) setCaptain1(captain1Obj)
          if (captain2Obj) setCaptain2(captain2Obj)
          
          if (captain1Obj && captain2Obj) {
            notify('주장 정보를 불러왔습니다.')
          }
        }
      }
    } else if (!selectedUpcomingMatchId) {
      // 매치 선택 해제 시 데이터 초기화
      setParticipatingPlayers([])
      setCaptain1(null)
      setCaptain2(null)
      setTeam1([])
      setTeam2([])
      setPlayerPool([])
    }
  }, [selectedUpcomingMatchId, upcomingMatches, players])

  // 드래프트 시작 - 참여 인원 선택 단계로 이동
  const startDraft = () => {
    if (allPlayers.length < 2) {
      alert('최소 2명의 선수가 필요합니다.')
      return
    }
    
    // 예정된 매치에서 참가자를 불러온 경우, 주장도 이미 선택되어 있다면 주장 선택으로 바로 이동
    if (participatingPlayers.length >= 2 && captain1 && captain2) {
      setPlayerPool([...participatingPlayers])
      setDraftState('selectCaptains')
      notify('예정된 매치 정보로 시작합니다.')
    } else if (participatingPlayers.length >= 2) {
      // 참가자만 있고 주장이 없는 경우
      setPlayerPool([...participatingPlayers])
      setDraftState('selectCaptains')
      notify(`${participatingPlayers.length}명의 참가자가 선택되었습니다. 주장을 선택해주세요.`)
    } else {
      // 일반적인 경우 - 참가자 선택부터 시작
      setDraftState('selectParticipants')
    }
  }

  // 참여 선수 토글
  const toggleParticipant = (player) => {
    const isParticipating = participatingPlayers.some(p => p.id === player.id)
    if (isParticipating) {
      setParticipatingPlayers(participatingPlayers.filter(p => p.id !== player.id))
    } else {
      setParticipatingPlayers([...participatingPlayers, player])
    }
  }

  // 참여 인원 확정 후 주장 선택으로 이동
  const confirmParticipants = () => {
    if (participatingPlayers.length < 2) {
      alert('최소 2명의 선수를 선택해주세요.')
      return
    }
    setPlayerPool([...participatingPlayers])
    setDraftState('selectCaptains')
  }

  // 주장 선택 토글
  const toggleCaptain = (player) => {
    // 이미 주장 1로 선택되어 있으면
    if (captain1?.id === player.id) {
      setCaptain1(null)
      return
    }
    // 이미 주장 2로 선택되어 있으면
    if (captain2?.id === player.id) {
      setCaptain2(null)
      return
    }
    
    // 주장 1이 비어있으면 주장 1로 설정
    if (!captain1) {
      setCaptain1(player)
      return
    }
    
    // 주장 2가 비어있으면 주장 2로 설정
    if (!captain2) {
      setCaptain2(player)
      return
    }
    
    // 둘 다 차있으면 주장 1을 교체
    setCaptain1(player)
  }

  // 주장 선택 완료 후 선공 선택 단계로 이동
  const confirmCaptains = () => {
    if (!captain1 || !captain2) {
      alert('두 주장을 모두 선택해주세요.')
      return
    }
    
    // 주장들을 풀에서 제거
    const remainingPool = playerPool.filter(p => p.id !== captain1.id && p.id !== captain2.id)
    setPlayerPool(remainingPool)
    
    // 선공 선택 화면으로 이동
    setDraftState('pickFirst')
  }

  // 선공 랜덤 선택 스피닝 시작
  const spinForFirstPick = () => {
    if (isSpinning) return
    
    setIsSpinning(true)
    setSpinResult(null)
    
    // 2초 후 결과 표시
    setTimeout(() => {
      const winner = Math.random() < 0.5 ? 'captain1' : 'captain2'
      setSpinResult(winner)
      setFirstPick(winner)
      setIsSpinning(false)
    }, 2000)
  }

  // 선공 선택 확정 후 준비 화면으로 이동
  const confirmFirstPick = () => {
    if (!spinResult) {
      alert('먼저 선공을 뽑아주세요.')
      return
    }
    
    setCurrentTurn(spinResult)
    setTeam1([captain1])
    setTeam2([captain2])
    setDraftState('ready')
  }

  // 드래프트 실제 시작
  const startDrafting = () => {
    setDraftState('drafting')
    setTimeLeft(draftSettings.timerDuration)
    setPickCount(0)
  }

  // 선수 선택
  const pickPlayer = (player) => {
    if (draftState !== 'drafting' || isReadyForNextTurn) return
    
    // 현재 팀과 최대 선택 수 확인
    const currentTeam = currentTurn === 'captain1' ? team1 : team2
    const isVeryFirstTurn = (currentTurn === firstPick && team1.length <= 2 && team2.length <= 2)
    const maxPicks = isVeryFirstTurn ? draftSettings.firstPickCount : draftSettings.regularPickCount
    
    // 이미 최대 선택 수에 도달했으면 선택 불가
    if (pickCount >= maxPicks) {
      return
    }
    
    // 히스토리에 현재 상태 저장
    setDraftHistory(prev => [...prev, {
      team1: [...team1],
      team2: [...team2],
      playerPool: [...playerPool],
      currentTurn,
      pickCount,
      timeLeft,
    }])
    
    if (currentTurn === 'captain1') {
      setTeam1([...team1, player])
    } else {
      setTeam2([...team2, player])
    }
    
    // 풀에서 제거
    const newPool = playerPool.filter(p => p.id !== player.id)
    setPlayerPool(newPool)
    
    const newPickCount = pickCount + 1
    setPickCount(newPickCount)
    
    if (newPickCount >= maxPicks) {
      // 선택 완료 - 풀이 비었으면 완료
      if (newPool.length === 0) {
        setDraftState('completed')
      }
      // 타이머가 없으면 바로 다음 턴 준비
      if (!draftSettings.timerEnabled) {
        setIsReadyForNextTurn(true)
      }
      // 타이머가 있으면 시간이 끝날 때까지 대기 (isReadyForNextTurn은 타이머가 0이 될 때 설정됨)
    }
  }
  
  // 선택 완료 버튼 (턴 완료 시 즉시 다음 턴으로)
  const completeTurn = () => {
    setIsReadyForNextTurn(true)
    setTimeLeft(0) // 타이머 즉시 종료
  }
  
  // 다음 턴으로 진행
  const proceedToNextTurn = () => {
    setCurrentTurn(currentTurn === 'captain1' ? 'captain2' : 'captain1')
    setTimeLeft(draftSettings.timerDuration)
    setPickCount(0)
    setSearchTerm('')
    setIsReadyForNextTurn(false)
    isTimeOutProcessing.current = false // 타임아웃 플래그 리셋
  }
  
  // 선수 제거 (주장 제외)
  const removePlayer = (player, teamSide) => {
    if (isReadyForNextTurn) return // 다음 턴 준비 상태에서는 제거 불가
    
    // 히스토리에 현재 상태 저장
    setDraftHistory(prev => [...prev, {
      team1: [...team1],
      team2: [...team2],
      playerPool: [...playerPool],
      currentTurn,
      pickCount,
      timeLeft,
    }])
    
    if (teamSide === 'team1') {
      // 주장(첫 번째 선수)이 아닌 경우만 제거 가능
      const playerIndex = team1.findIndex(p => p.id === player.id)
      if (playerIndex > 0) {
        setTeam1(team1.filter(p => p.id !== player.id))
        setPlayerPool([...playerPool, player])
        setPickCount(Math.max(0, pickCount - 1))
      }
    } else {
      const playerIndex = team2.findIndex(p => p.id === player.id)
      if (playerIndex > 0) {
        setTeam2(team2.filter(p => p.id !== player.id))
        setPlayerPool([...playerPool, player])
        setPickCount(Math.max(0, pickCount - 1))
      }
    }
  }
  
  // 뒤로가기 (언두)
  const undoLastPick = () => {
    if (draftHistory.length === 0) return
    
    const lastState = draftHistory[draftHistory.length - 1]
    setTeam1(lastState.team1)
    setTeam2(lastState.team2)
    setPlayerPool(lastState.playerPool)
    setCurrentTurn(lastState.currentTurn)
    setPickCount(lastState.pickCount)
    setTimeLeft(lastState.timeLeft)
    setDraftHistory(prev => prev.slice(0, -1))
    setIsReadyForNextTurn(false) // 되돌리면 다음 턴 준비 상태 해제
  }

  // 타이머
  useEffect(() => {
    if (draftState !== 'drafting' || !draftSettings.timerEnabled || isReadyForNextTurn) return
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // 시간 초과 처리 - setTimeout으로 다음 틱에 실행
          setTimeout(() => {
            if (!isTimeOutProcessing.current) {
              handleTimeOut()
            }
          }, 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [draftState, draftSettings, isReadyForNextTurn])
  
  // 타이머 만료 시 처리
  const handleTimeOut = () => {
    if (isTimeOutProcessing.current) {
      console.log('⚠️ Timeout already processing, skipping...')
      return
    }
    
    isTimeOutProcessing.current = true
    console.log('🔒 Timeout processing started')
    
    // 한 번에 모든 상태 업데이트
    setPickCount(currentPickCount => {
      setTeam1(currentTeam1 => {
        setTeam2(currentTeam2 => {
          setPlayerPool(currentPool => {
            // 상태 업데이트 계산
            const currentTeam = currentTurn === 'captain1' ? currentTeam1 : currentTeam2
            // 첫 번째 턴 판단: 선공 주장의 턴이고, 양쪽 팀 모두 주장만 있거나 선공 주장이 1명 선택한 상태
            const isVeryFirstTurn = (currentTurn === firstPick && team1.length <= 2 && team2.length <= 2)
            const maxPicks = isVeryFirstTurn ? draftSettings.firstPickCount : draftSettings.regularPickCount
            const picksNeeded = maxPicks - currentPickCount
            
            console.log('⏰ Timer timeout - Auto pick:', {
              currentTurn,
              firstPick,
              team1Length: currentTeam1.length,
              team2Length: currentTeam2.length,
              currentTeamLength: currentTeam.length,
              isVeryFirstTurn,
              maxPicks,
              currentPickCount,
              picksNeeded
            })
            
            if (currentPool.length === 0) {
              setDraftState('completed')
              setIsReadyForNextTurn(true)
              return currentPool
            }
            
            if (picksNeeded <= 0) {
              console.log('✅ No picks needed')
              setIsReadyForNextTurn(true)
              return currentPool
            }
            
            // 필요한 만큼 랜덤 선택
            const selectedPlayers = []
            let remainingPool = [...currentPool]
            
            for (let i = 0; i < picksNeeded && remainingPool.length > 0; i++) {
              const randomIndex = Math.floor(Math.random() * remainingPool.length)
              const randomPlayer = remainingPool[randomIndex]
              selectedPlayers.push(randomPlayer)
              remainingPool = remainingPool.filter(p => p.id !== randomPlayer.id)
            }
            
            console.log(`🎲 Auto-selected ${selectedPlayers.length} player(s):`, selectedPlayers.map(p => p.name))
            
            // 선택된 선수들을 팀에 추가 (배치 업데이트)
            if (currentTurn === 'captain1') {
              setTeam1([...currentTeam1, ...selectedPlayers])
            } else {
              setTeam2([...currentTeam2, ...selectedPlayers])
            }
            
            // 상태 업데이트
            setIsReadyForNextTurn(true)
            
            if (remainingPool.length === 0) {
              setDraftState('completed')
            }
            
            console.log('🔓 Timeout processing completed')
            return remainingPool
          })
          return currentTeam2
        })
        return currentTeam1
      })
      return currentPickCount
    })
  }

  // 리셋 (예정된 매치 선택은 유지)
  const resetDraft = () => {
    setDraftState('setup')
    setCaptain1(null)
    setCaptain2(null)
    setFirstPick(null)
    setCurrentTurn(null)
    setTeam1([])
    setTeam2([])
    setPlayerPool([])
    setParticipatingPlayers([])
    setTimeLeft(draftSettings.timerDuration)
    setPickCount(0)
    setSearchTerm('')
    setDraftHistory([])
    setIsReadyForNextTurn(false)
    // selectedUpcomingMatchId는 유지하여 같은 매치로 다시 드래프트 가능
  }

  // 드래프트 결과를 예정된 매치에 저장
  const saveToUpcomingMatch = () => {
    if (!selectedUpcomingMatchId) {
      notify('예정된 매치를 선택해주세요.')
      return
    }

    if (!onUpdateUpcomingMatch) {
      notify('매치 업데이트 기능을 사용할 수 없습니다.')
      return
    }

    // 팀 스냅샷 생성 (선수 ID 배열)
    const snapshot = [
      team1.map(p => p.id),
      team2.map(p => p.id)
    ]

    // 매치 업데이트
    onUpdateUpcomingMatch(selectedUpcomingMatchId, {
      snapshot,
      captainIds: [captain1.id, captain2.id],
      isDraftComplete: true,
      draftCompletedAt: new Date().toISOString()
    })

    notify('예정된 매치에 드래프트 결과가 저장되었습니다!')
  }

  // 검색 필터링 - 참여 인원 선택 시
  const filteredAllPlayers = allPlayers.filter(player => 
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.position?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 검색 필터링 - 주장 선택 시
  const filteredPoolPlayers = participatingPlayers.filter(player => 
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.position?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 검색 필터링 - 드래프트 중 선수 풀
  const filteredDraftPool = playerPool.filter(player => 
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.position?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // OVR 계산 함수
  const calculateOVR = (player) => {
    if (!player.stats) return 0
    const stats = player.stats
    const total = (stats.pace || 0) + (stats.shooting || 0) + (stats.passing || 0) + 
                  (stats.dribbling || 0) + (stats.defending || 0) + (stats.physical || 0)
    return Math.round(total / 6)
  }

  return (
    <div className="space-y-4">
      <Card title="드래프트 모드">
        {draftState === 'setup' && (
          <div className="py-8 max-w-2xl mx-auto">
            <h3 className="text-xl font-bold mb-2 text-center">드래프트로 팀을 구성하세요</h3>
            <p className="text-gray-600 mb-8 text-center">
              참여 인원을 선택한 후, 주장 2명을 지정하고 드래프트를 진행합니다.
            </p>

            {/* 드래프트 설정 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100 mb-6">
              <h4 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                드래프트 설정
              </h4>
              
              <div className="space-y-4">
                {/* 예정된 매치 선택 */}
                {upcomingMatches && upcomingMatches.length > 0 && (
                  <div className="bg-white rounded-xl p-4 border border-blue-100">
                    <label className="block text-sm font-semibold text-blue-900 mb-3">
                      예정된 매치 선택 (선택사항)
                    </label>
                    <select
                      value={selectedUpcomingMatchId || ''}
                      onChange={(e) => setSelectedUpcomingMatchId(e.target.value || null)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">선택 안 함</option>
                      {upcomingMatches.map(match => {
                        const matchDate = new Date(match.dateISO)
                        const dateStr = matchDate.toLocaleDateString('ko-KR', { 
                          month: 'short', 
                          day: 'numeric', 
                          weekday: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                        return (
                          <option key={match.id} value={match.id}>
                            {dateStr} - {match.location?.name || '위치 미정'} ({match.mode})
                          </option>
                        )
                      })}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                      드래프트 완료 후 선택한 매치에 팀 정보가 저장됩니다
                    </p>
                    {selectedUpcomingMatchId && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-xs font-semibold text-blue-900 mb-1">✓ 매치 정보 불러오기 완료</p>
                        <p className="text-xs text-blue-700">
                          {participatingPlayers.length > 0 && `참가자 ${participatingPlayers.length}명 `}
                          {captain1 && captain2 && `· 주장 2명`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 타이머 ON/OFF */}
                <div className="bg-white rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-semibold text-blue-900 mb-1">
                        턴당 시간 제한
                      </label>
                      <p className="text-xs text-gray-500">
                        {draftSettings.timerEnabled ? '시간 제한이 활성화됩니다' : '시간 제한 없이 진행됩니다'}
                      </p>
                    </div>
                    <button
                      onClick={() => setDraftSettings({...draftSettings, timerEnabled: !draftSettings.timerEnabled})}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                        draftSettings.timerEnabled ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          draftSettings.timerEnabled ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 타이머 시간 */}
                {draftSettings.timerEnabled && (
                  <div className="bg-white rounded-xl p-4 border border-blue-100">
                    <label className="block text-sm font-semibold text-blue-900 mb-3">
                      턴당 제한 시간
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={draftSettings.timerDuration}
                        onChange={(e) => setDraftSettings({...draftSettings, timerDuration: Number(e.target.value)})}
                        className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, rgb(59 130 246) 0%, rgb(59 130 246) ${((draftSettings.timerDuration - 5) / 55) * 100}%, rgb(229 231 235) ${((draftSettings.timerDuration - 5) / 55) * 100}%, rgb(229 231 235) 100%)`
                        }}
                      />
                      <div className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold min-w-[70px] text-center">
                        {draftSettings.timerDuration}초
                      </div>
                    </div>
                  </div>
                )}

                {/* 첫 턴 선택 수 */}
                <div className="bg-white rounded-xl p-4 border border-blue-100">
                  <label className="block text-sm font-semibold text-blue-900 mb-3">
                    첫 번째 턴 선택 인원
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={draftSettings.firstPickCount}
                      onChange={(e) => setDraftSettings({...draftSettings, firstPickCount: Number(e.target.value)})}
                      className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, rgb(16 185 129) 0%, rgb(16 185 129) ${((draftSettings.firstPickCount - 1) / 4) * 100}%, rgb(229 231 235) ${((draftSettings.firstPickCount - 1) / 4) * 100}%, rgb(229 231 235) 100%)`
                      }}
                    />
                    <div className="bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold min-w-[70px] text-center">
                      {draftSettings.firstPickCount}명
                    </div>
                  </div>
                </div>

                {/* 이후 턴 선택 수 */}
                <div className="bg-white rounded-xl p-4 border border-blue-100">
                  <label className="block text-sm font-semibold text-blue-900 mb-3">
                    이후 턴 선택 인원
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={draftSettings.regularPickCount}
                      onChange={(e) => setDraftSettings({...draftSettings, regularPickCount: Number(e.target.value)})}
                      className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, rgb(168 85 247) 0%, rgb(168 85 247) ${((draftSettings.regularPickCount - 1) / 4) * 100}%, rgb(229 231 235) ${((draftSettings.regularPickCount - 1) / 4) * 100}%, rgb(229 231 235) 100%)`
                      }}
                    />
                    <div className="bg-purple-500 text-white px-4 py-2 rounded-lg font-bold min-w-[70px] text-center">
                      {draftSettings.regularPickCount}명
                    </div>
                  </div>
                </div>
              </div>

              {/* 설정 요약 */}
              <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                <p className="text-xs text-blue-800">
                  💡 첫 번째 턴: <strong>{draftSettings.firstPickCount}명</strong> 선택, 
                  이후 턴: <strong>{draftSettings.regularPickCount}명</strong>씩 선택, 
                  제한시간: <strong>{draftSettings.timerDuration}초</strong>
                </p>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={startDraft}
                className="px-8 py-3 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors shadow-lg"
              >
                참여 인원 선택하기
              </button>
            </div>
          </div>
        )}

        {draftState === 'selectParticipants' && (
          <div className="space-y-6 py-6">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => {
                  setDraftState('setup')
                  setParticipatingPlayers([])
                  setSearchTerm('')
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                ← 뒤로가기
              </button>
              <div className="text-center flex-1">
                <h3 className="text-xl font-bold mb-1">드래프트 참여 인원을 선택하세요</h3>
                <p className="text-sm text-gray-600">
                  선택된 선수: <span className="font-bold text-emerald-600">{participatingPlayers.length}명</span>
                  {selectedUpcomingMatchId && (
                    <span className="ml-2 text-xs text-blue-600">
                      (예정된 매치에서 불러옴)
                    </span>
                  )}
                </p>
              </div>
              <div className="w-[100px]"></div> {/* 균형을 위한 빈 공간 */}
            </div>

            {/* 검색바 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="선수 이름 또는 포지션 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* 선수 목록 */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center justify-between">
                <span>전체 선수 목록</span>
                <span className="text-sm text-gray-500">
                  {filteredAllPlayers.length}명 {searchTerm && `(전체 ${allPlayers.length}명)`}
                </span>
              </h4>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 max-h-[500px] overflow-y-auto">
                {filteredAllPlayers.map(player => {
                  const isSelected = participatingPlayers.some(p => p.id === player.id)
                  
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleParticipant(player)}
                      className={`p-2 border rounded-md transition-all flex flex-col items-center gap-1 relative ${
                        isSelected 
                          ? 'border-emerald-500 bg-emerald-50' 
                          : 'border-gray-200 hover:border-emerald-500 hover:bg-emerald-50'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-0.5 right-0.5 text-[8px] bg-emerald-500 text-white px-1 py-0.5 rounded font-semibold">참여</div>
                      )}
                      <InitialAvatar 
                        id={player.id} 
                        name={player.name} 
                        size={64} 
                        photoUrl={player.photoUrl}
                        badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} 
                      />
                      <div className="w-full text-center">
                        <p className="font-semibold text-xs truncate leading-tight">{player.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{player.position}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
              {filteredAllPlayers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>

            {/* 확인 버튼 */}
            <div className="text-center pt-4">
              <button
                onClick={confirmParticipants}
                disabled={participatingPlayers.length < 2}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                참여 인원 선택({participatingPlayers.length}명 선택됨)
              </button>
            </div>
          </div>
        )}

        {draftState === 'selectCaptains' && (
          <div className="space-y-6 py-6">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => {
                  setDraftState('selectParticipants')
                  setCaptain1(null)
                  setCaptain2(null)
                  setSearchTerm('')
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                ← 뒤로가기
              </button>
              <div className="text-center flex-1">
                <h3 className="text-xl font-bold">주장 2명을 선택하세요</h3>
                {selectedUpcomingMatchId && captain1 && captain2 && (
                  <p className="text-xs text-blue-600 mt-1">
                    (예정된 매치에서 불러옴)
                  </p>
                )}
              </div>
              <div className="w-[100px]"></div> {/* 균형을 위한 빈 공간 */}
            </div>
            
            {/* 선택된 주장 표시 */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className={`border-2 rounded-xl p-4 ${captain1 ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                  <p className="font-bold">주장 1</p>
                </div>
                {captain1 ? (
                  <div className="bg-white rounded-lg p-3 border border-emerald-200 flex items-center gap-3">
                    <InitialAvatar 
                      id={captain1.id} 
                      name={captain1.name} 
                      size={40} 
                      photoUrl={captain1.photoUrl}
                      badges={captain1.membership && captain1.membership.includes('게스트') ? ['G'] : []} 
                    />
                    <div>
                      <p className="font-semibold">{captain1.name}</p>
                      <p className="text-xs text-gray-500">{captain1.position}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">아래에서 선수를 클릭하세요</p>
                )}
              </div>

              <div className={`border-2 rounded-xl p-4 ${captain2 ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
                  <p className="font-bold">주장 2</p>
                </div>
                {captain2 ? (
                  <div className="bg-white rounded-lg p-3 border border-blue-200 flex items-center gap-3">
                    <InitialAvatar 
                      id={captain2.id} 
                      name={captain2.name} 
                      size={40} 
                      photoUrl={captain2.photoUrl}
                      badges={captain2.membership && captain2.membership.includes('게스트') ? ['G'] : []} 
                    />
                    <div>
                      <p className="font-semibold">{captain2.name}</p>
                      <p className="text-xs text-gray-500">{captain2.position}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">아래에서 선수를 클릭하세요</p>
                )}
              </div>
            </div>

            {/* 검색바 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="선수 이름 또는 포지션 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* 선수 목록 */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center justify-between">
                <span>참여 선수 목록</span>
                <span className="text-sm text-gray-500">
                  {filteredPoolPlayers.length}명 {searchTerm && `(전체 ${participatingPlayers.length}명)`}
                </span>
              </h4>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 max-h-[500px] overflow-y-auto">
                {filteredPoolPlayers.map(player => {
                  const isCaptain1 = captain1?.id === player.id
                  const isCaptain2 = captain2?.id === player.id
                  const isSelected = isCaptain1 || isCaptain2
                  
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleCaptain(player)}
                      className={`p-2 border rounded-md transition-all flex flex-col items-center gap-1 relative ${
                        isCaptain1 
                          ? 'border-emerald-500 bg-emerald-50' 
                          : isCaptain2
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-emerald-500 hover:bg-emerald-50'
                      }`}
                    >
                      {isCaptain1 && (
                        <div className="absolute top-0.5 right-0.5 text-[8px] bg-emerald-500 text-white px-1 py-0.5 rounded font-semibold">주장1</div>
                      )}
                      {isCaptain2 && (
                        <div className="absolute top-0.5 right-0.5 text-[8px] bg-blue-500 text-white px-1 py-0.5 rounded font-semibold">주장2</div>
                      )}
                      <InitialAvatar 
                        id={player.id} 
                        name={player.name} 
                        size={64} 
                        photoUrl={player.photoUrl}
                        badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} 
                      />
                      <div className="w-full text-center">
                        <p className="font-semibold text-xs truncate leading-tight">{player.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{player.position}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
              {filteredPoolPlayers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>

            {/* 확인 버튼 */}
            <div className="text-center pt-4">
              <button
                onClick={confirmCaptains}
                disabled={!captain1 || !captain2}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                주장 선택 완료
              </button>
            </div>
          </div>
        )}

        {/* 선공 선택 화면 */}
        {draftState === 'pickFirst' && (
          <div className="py-8 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-2">선공 뽑기</h3>
              <p className="text-gray-600">어느 주장이 먼저 선택할까요?</p>
            </div>

            {/* 간소화된 주장 카드들 */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* 주장 1 카드 */}
              <div className={`relative rounded-2xl p-8 border-4 transition-all duration-500 ${
                isSpinning 
                  ? 'border-gray-400 bg-gray-100 animate-pulse'
                  : spinResult === 'captain1'
                  ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-200'
                  : spinResult === 'captain2'
                  ? 'border-gray-300 bg-gray-50 opacity-50'
                  : 'border-emerald-500 bg-emerald-50'
              }`}>
                {spinResult === 'captain1' && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-lg">
                      ⭐ 선공!
                    </div>
                  </div>
                )}
                <div className="flex flex-col items-center gap-3">
                  <div className={`transition-all duration-500 ${
                    isSpinning 
                      ? 'opacity-50' 
                      : spinResult === 'captain1'
                      ? 'scale-110'
                      : ''
                  }`}>
                    <InitialAvatar 
                      id={captain1.id} 
                      name={captain1.name} 
                      size={96}
                      photoUrl={captain1.photoUrl}
                      badges={captain1.membership && captain1.membership.includes('게스트') ? ['G'] : []} 
                    />
                  </div>
                  <p className="text-lg font-bold text-gray-900">{captain1.name}</p>
                </div>
              </div>

              {/* 주장 2 카드 */}
              <div className={`relative rounded-2xl p-8 border-4 transition-all duration-500 ${
                isSpinning 
                  ? 'border-gray-400 bg-gray-100 animate-pulse'
                  : spinResult === 'captain2'
                  ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-200'
                  : spinResult === 'captain1'
                  ? 'border-gray-300 bg-gray-50 opacity-50'
                  : 'border-blue-500 bg-blue-50'
              }`}>
                {spinResult === 'captain2' && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-lg">
                      ⭐ 선공!
                    </div>
                  </div>
                )}
                <div className="flex flex-col items-center gap-3">
                  <div className={`transition-all duration-500 ${
                    isSpinning 
                      ? 'opacity-50' 
                      : spinResult === 'captain2'
                      ? 'scale-110'
                      : ''
                  }`}>
                    <InitialAvatar 
                      id={captain2.id} 
                      name={captain2.name} 
                      size={96}
                      photoUrl={captain2.photoUrl}
                      badges={captain2.membership && captain2.membership.includes('게스트') ? ['G'] : []} 
                    />
                  </div>
                  <p className="text-lg font-bold text-gray-900">{captain2.name}</p>
                </div>
              </div>
            </div>

            {/* 버튼 영역 */}
            <div className="flex items-center justify-center gap-4">
              {!spinResult ? (
                <button
                  onClick={spinForFirstPick}
                  disabled={isSpinning}
                  className="px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-bold text-lg hover:from-yellow-500 hover:to-orange-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
                >
                  {isSpinning ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      뽑는 중...
                    </span>
                  ) : (
                    '🎲 선공 뽑기'
                  )}
                </button>
              ) : (
                <button
                  onClick={confirmFirstPick}
                  className="px-8 py-4 bg-emerald-500 text-white rounded-xl font-bold text-lg hover:bg-emerald-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  준비 완료
                </button>
              )}
            </div>
          </div>
        )}

        {/* 드래프트 준비 완료 화면 */}
        {draftState === 'ready' && (
          <div className="py-8 max-w-4xl mx-auto space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">드래프트 준비 완료!</h3>
              <p className="text-gray-600">모든 설정이 완료되었습니다.</p>
            </div>

            {/* 핵심 정보와 주장들 */}
            <div className="space-y-6">
              {/* 선공 결과 및 기본 정보 */}
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-2xl p-6">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <span className="text-2xl">⭐</span>
                  <h4 className="text-xl font-bold text-gray-900">선공 주장</h4>
                </div>
                <p className="text-center text-3xl font-bold text-yellow-600 mb-6">
                  {firstPick === 'captain1' ? captain1.name : captain2.name}
                </p>
                
                {/* 드래프트 상세 정보 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">참여 선수</p>
                    <p className="text-2xl font-bold text-gray-900">{participatingPlayers.length}명</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">총 드래프트 라운드</p>
                    <p className="text-2xl font-bold text-gray-900">{Math.floor((participatingPlayers.length - 2) / 2)}라운드</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">한 턴당 시간</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {draftSettings.timerEnabled ? `${draftSettings.timerDuration}초` : '무제한'}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">드래프트 방식</p>
                    <p className="text-2xl font-bold text-gray-900">스네이크</p>
                  </div>
                </div>
              </div>

              {/* 주장 카드들 */}
              <div className="grid grid-cols-2 gap-6">
                <div className={`border-2 rounded-xl p-6 text-center ${
                  firstPick === 'captain1' 
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' 
                    : 'border-gray-300 bg-white'
                }`}>
                  <div className="flex flex-col items-center gap-3">
                    <InitialAvatar 
                      id={captain1.id} 
                      name={captain1.name} 
                      size={64}
                      photoUrl={captain1.photoUrl}
                      badges={captain1.membership && captain1.membership.includes('게스트') ? ['G'] : []} 
                    />
                    <div>
                      <p className="font-bold text-lg">{captain1.name}</p>
                      <p className="text-sm text-gray-600 mt-1">{captain1.position}</p>
                      {firstPick === 'captain1' && (
                        <span className="inline-block mt-2 text-xs bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full font-semibold">
                          🥇 1번 픽
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`border-2 rounded-xl p-6 text-center ${
                  firstPick === 'captain2' 
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                    : 'border-gray-300 bg-white'
                }`}>
                  <div className="flex flex-col items-center gap-3">
                    <InitialAvatar 
                      id={captain2.id} 
                      name={captain2.name} 
                      size={64}
                      photoUrl={captain2.photoUrl}
                      badges={captain2.membership && captain2.membership.includes('게스트') ? ['G'] : []} 
                    />
                    <div>
                      <p className="font-bold text-lg">{captain2.name}</p>
                      <p className="text-sm text-gray-600 mt-1">{captain2.position}</p>
                      {firstPick === 'captain2' && (
                        <span className="inline-block mt-2 text-xs bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full font-semibold">
                          🥇 1번 픽
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 드래프트 순서 안내 */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">📋</span>
                  드래프트 순서
                </h4>
                <p className="text-gray-700 text-sm leading-relaxed">
                  스네이크 드래프트 방식으로 진행됩니다. 
                  <strong className="text-blue-600 mx-1">
                    {firstPick === 'captain1' ? captain1.name : captain2.name}
                  </strong>
                  주장이 먼저 <strong>{draftSettings.firstPickCount}명</strong>을 선택하며, 
                  이후 각 턴마다 <strong>{draftSettings.regularPickCount}명</strong>씩 번갈아 선택합니다. 
                  각 라운드의 끝에서는 순서가 역전되어 마지막 선택자가 다음 라운드 첫 선택자가 됩니다.
                </p>
              </div>
            </div>

            {/* 시작 버튼 */}
            <div className="text-center pt-2">
              <button
                onClick={startDrafting}
                className="px-12 py-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold text-xl hover:from-emerald-600 hover:to-green-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                🎯 드래프트 시작!
              </button>
            </div>
          </div>
        )}

        {(draftState === 'drafting' || draftState === 'completed') && (
          <DraftBoard
            captain1={captain1}
            captain2={captain2}
            team1={team1}
            team2={team2}
            playerPool={filteredDraftPool}
            totalPlayers={playerPool.length}
            currentTurn={currentTurn}
            timeLeft={timeLeft}
            onPickPlayer={pickPlayer}
            isCompleted={draftState === 'completed'}
            onReset={resetDraft}
            firstPick={firstPick}
            pickCount={pickCount}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            draftSettings={draftSettings}
            onUndo={undoLastPick}
            canUndo={draftHistory.length > 0}
            onRemovePlayer={removePlayer}
            isReadyForNextTurn={isReadyForNextTurn}
            onProceedToNextTurn={proceedToNextTurn}
            onCompleteTurn={completeTurn}
            onSaveToUpcomingMatch={saveToUpcomingMatch}
            selectedUpcomingMatchId={selectedUpcomingMatchId}
          />
        )}
      </Card>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          border: 3px solid currentColor;
          transition: all 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 3px solid currentColor;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          transition: all 0.15s ease;
        }
        input[type="range"]::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  )
}
