import React, { useState, useEffect, useRef } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import { Search, RefreshCw, Save, X, Clock, Check, ArrowRight, ArrowLeft } from 'lucide-react'
import Card from '../components/Card'
import DraftBoard from '../components/DraftBoard'
import InitialAvatar from '../components/InitialAvatar'
import { notify } from '../components/Toast'

export default function DraftPage({ players, upcomingMatches, onUpdateUpcomingMatch }) {
  const [draftState, setDraftState] = useState('setup') // setup, selectParticipants, selectCaptains, pickFirst, ready, drafting, completed
  
  // 다중 팀 지원
  const [teamCount, setTeamCount] = useState(2) // 팀 수 (2-8팀)
  const [captains, setCaptains] = useState([]) // 주장 배열
  const [teams, setTeams] = useState([]) // 팀 배열
  const [firstPick, setFirstPick] = useState(null) // 1번 픽 팀 인덱스 (turnOrder[0])
  const [currentTurn, setCurrentTurn] = useState(null) // 현재 턴 팀 인덱스
  const [turnOrder, setTurnOrder] = useState([]) // 드래프트 순서 [0, 1, 2, 3...]
  const [orderIndex, setOrderIndex] = useState(0) // turnOrder 내 현재 인덱스
  const [orderDirection, setOrderDirection] = useState(1) // 1: 정방향, -1: 역방향 (스네이크)
  const [confirmState, setConfirmState] = useState({ open: false, kind: null })
  const [alertState, setAlertState] = useState({ open: false, message: '' })
  
  // 하위 호환성을 위한 별칭 (DraftBoard 컴포넌트가 captain1, captain2, team1, team2를 참조할 수 있음)
  const captain1 = captains[0] || null
  const captain2 = captains[1] || null
  const team1 = teams[0] || []
  const team2 = teams[1] || []
  const setCaptain1 = (value) => {
    setCaptains(prev => {
      const newCaptains = [...prev]
      newCaptains[0] = value
      return newCaptains
    })
  }
  const setCaptain2 = (value) => {
    setCaptains(prev => {
      const newCaptains = [...prev]
      newCaptains[1] = value
      return newCaptains
    })
  }
  const setTeam1 = (value) => {
    setTeams(prev => {
      const newTeams = [...prev]
      newTeams[0] = typeof value === 'function' ? value(newTeams[0] || []) : value
      return newTeams
    })
  }
  const setTeam2 = (value) => {
    setTeams(prev => {
      const newTeams = [...prev]
      newTeams[1] = typeof value === 'function' ? value(newTeams[1] || []) : value
      return newTeams
    })
  }
  
  const [playerPool, setPlayerPool] = useState([])
  const [allPlayers, setAllPlayers] = useState([]) // 전체 선수 목록
  const [participatingPlayers, setParticipatingPlayers] = useState([]) // 참여하는 선수들
  const [pickHistory, setPickHistory] = useState([]) // 드래프트 히스토리 (스네이크 턴 계산용)
  const [timeLeft, setTimeLeft] = useState(15)
  const [pickCount, setPickCount] = useState(0) // 현재 턴에서 몇 명 픽했는지
  const pickCountRef = useRef(0) // pickCount의 즉시 업데이트되는 참조
  const [searchTerm, setSearchTerm] = useState('') // 검색어
  const [isReadyForNextTurn, setIsReadyForNextTurn] = useState(false) // 다음 턴 준비 상태
  const isTimeOutProcessing = useRef(false) // 타임아웃 처리 중복 방지
  
  // 선공 선택 애니메이션
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState(null)
  
  // 드래프트 설정
  const [draftSettings, setDraftSettings] = useState({
    timerDuration: 15, // 타이머 시간 (초)
    draftMode: 'snake', // 드래프트 방식: 'snake' (스네이크) 또는 'roundRobin' (라운드 로빈)
    timerEnabled: false, // 타이머 활성화 여부 (기본 OFF)
    turnTransitionEnabled: false, // 턴 전환 딜레이 활성화 여부 (기본 OFF)
    turnTransitionDelay: 5, // 다음 턴 전환 딜레이 (기본 5초)
  })
  
  // 턴 전환 카운트다운
  const [turnTransitionCountdown, setTurnTransitionCountdown] = useState(0)
  
  // 예정된 매치 선택
  const [selectedUpcomingMatchId, setSelectedUpcomingMatchId] = useState(null)
  const originalDateRef = useRef(null) // 선택된 예정 매치의 원본 시간 보존
  
  // 드래프트 보드 ref (스크롤용)
  const draftBoardRef = useRef(null)
  
  // 현재 턴 영역 ref (정확한 스크롤용)
  const currentTurnRef = useRef(null)

  // 초기 로드
  useEffect(() => {
    setAllPlayers([...players])
  }, [players])

  // 예정된 매치 선택 시 참가자 및 주장 정보 불러오기
  useEffect(() => {
    if (selectedUpcomingMatchId && upcomingMatches) {
      const selectedMatch = upcomingMatches.find(m => m.id === selectedUpcomingMatchId)
      if (selectedMatch) {
        // 최초 선택 시 원본 dateISO 저장 (변형 없이)
        if (!originalDateRef.current) {
          originalDateRef.current = selectedMatch.dateISO
        }
        // setup 상태가 아니면 불러오지 않음 (진행 중인 드래프트 보호)
        if (draftState !== 'setup') return
        
        // 새로운 매치 선택 시 기존 데이터 초기화
        setParticipatingPlayers([])
        setCaptains([])
        setTeams([])
        setPlayerPool([])
        
        // 드래프트가 이미 완료된 경우 - 완료된 팀 구성 불러오기
        if (selectedMatch.isDraftComplete && selectedMatch.snapshot && selectedMatch.snapshot.length >= 2) {
          const loadedTeamCount = selectedMatch.snapshot.length
          setTeamCount(loadedTeamCount)
          
          // 모든 팀 불러오기
          const loadedTeams = selectedMatch.snapshot.map(teamIds => 
            (teamIds || [])
              .map(id => players.find(p => p.id === id))
              .filter(Boolean)
          )
          
          // 주장 정보 불러오기
          const captainIds = selectedMatch.captainIds || []
          const loadedCaptains = captainIds
            .map(id => players.find(p => p.id === id))
            .filter(Boolean)
          
          if (loadedTeams.every(team => team.length > 0)) {
            // 주장을 각 팀의 첫 번째로 배치
            const sortedTeams = loadedTeams.map((team, idx) => {
              const captain = loadedCaptains[idx]
              return captain 
                ? [captain, ...team.filter(p => p.id !== captain.id)]
                : team
            })
            
            setTeams(sortedTeams)
            setCaptains(loadedCaptains)
            setDraftState('completed')
            
            const teamSummary = loadedTeams.map((team, idx) => `팀${idx + 1}: ${team.length}명`).join(', ')
            notify(`완료된 드래프트를 불러왔습니다. (${teamSummary})`)
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
          const loadedCaptains = captainIds
            .map(id => players.find(p => p.id === id))
            .filter(Boolean)
          
          // 팀 개수를 주장 수에 맞춤
          if (loadedCaptains.length >= 2) {
            setTeamCount(loadedCaptains.length)
            setCaptains(loadedCaptains)
            notify(`주장 ${loadedCaptains.length}명을 불러왔습니다.`)
          }
        }
      }
    } else if (!selectedUpcomingMatchId) {
      // 매치 선택 해제 시 데이터 초기화
      setParticipatingPlayers([])
      setCaptains([])
      setTeams([])
      setPlayerPool([])
      originalDateRef.current = null
    }
  }, [selectedUpcomingMatchId, upcomingMatches, players, draftState])

  // 드래프트 시작 - 참여 인원 선택 단계로 이동
  const startDraft = () => {
    if (allPlayers.length < 2) {
  setAlertState({ open: true, message: '최소 2명의 선수가 필요합니다.' })
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
  setAlertState({ open: true, message: '최소 2명의 선수를 선택해주세요.' })
      return
    }
    setPlayerPool([...participatingPlayers])
    setDraftState('selectCaptains')
  }

  // 주장 선택 토글
  const toggleCaptain = (player) => {
    // 이미 선택된 주장인지 확인
    const existingIndex = captains.findIndex(c => c?.id === player.id)
    
    if (existingIndex !== -1) {
      // 이미 선택되어 있으면 제거
      const newCaptains = [...captains]
      newCaptains[existingIndex] = null
      setCaptains(newCaptains)
      return
    }
    
    // 빈 슬롯 찾기
    const emptySlotIndex = captains.findIndex((c, idx) => idx < teamCount && !c)
    
    if (emptySlotIndex !== -1) {
      // 빈 슬롯에 할당
      const newCaptains = [...captains]
      newCaptains[emptySlotIndex] = player
      setCaptains(newCaptains)
    } else {
      // 모든 슬롯이 차있으면 첫 번째 슬롯 교체
      const newCaptains = [...captains]
      newCaptains[0] = player
      setCaptains(newCaptains)
    }
  }

  // 주장 선택 완료 후 순서 뽑기 단계로 이동 (통합)
  const confirmCaptains = () => {
    const selectedCaptains = captains.filter(Boolean)
    if (selectedCaptains.length !== teamCount) {
  setAlertState({ open: true, message: `주장 ${teamCount}명을 모두 선택해주세요.` })
      return
    }
    
    // 주장들을 풀에서 제거
    const captainIds = selectedCaptains.map(c => c.id)
    const remainingPool = playerPool.filter(p => !captainIds.includes(p.id))
    setPlayerPool(remainingPool)
    // 통합된 순서 뽑기 화면
    setTurnOrder([])
    setSpinResult(null)
    setIsSpinning(false)
    setDraftState('pickFirst')
  }

  // 순서 랜덤 선택 스피닝 시작 (2팀: 1번 픽, 3+팀: 전체 순서 섞기)
  const spinForFirstPick = () => {
    if (isSpinning) return
    
    setIsSpinning(true)
    setSpinResult(null)
    
    // 2초 후 결과 표시
    setTimeout(() => {
      if (teamCount === 2) {
        const winnerIndex = Math.floor(Math.random() * teamCount)
        setSpinResult(winnerIndex)
        const order = [winnerIndex, winnerIndex === 0 ? 1 : 0]
        setTurnOrder(order)
        setFirstPick(order[0])
      } else {
        const base = Array.from({ length: teamCount }, (_, i) => i)
        const shuffled = base.sort(() => Math.random() - 0.5)
        setTurnOrder(shuffled)
        setFirstPick(shuffled[0])
      }
      setIsSpinning(false)
    }, 2000)
  }

  // 순서 확정 후 준비 화면으로 이동
  const confirmFirstPick = () => {
    if (teamCount === 2) {
      if (!turnOrder.length && spinResult === null) {
  setAlertState({ open: true, message: '먼저 순서를 뽑아주세요.' })
        return
      }
      if (!turnOrder.length && spinResult !== null) {
        const order = [spinResult, spinResult === 0 ? 1 : 0]
        setTurnOrder(order)
      }
    } else {
      if (turnOrder.length !== teamCount) {
  setAlertState({ open: true, message: '먼저 순서를 뽑아주세요.' })
        return
      }
    }
    if (turnOrder.length) setFirstPick(turnOrder[0])
    // 각 주장을 팀 배열에 초기화
    const initialTeams = captains.filter(Boolean).map(captain => [captain])
    setTeams(initialTeams)
    setDraftState('ready')
  }

  // 드래프트 실제 시작
  const startDrafting = () => {
    setDraftState('drafting')
    setTimeLeft(draftSettings.timerDuration)
    setPickCount(0)
    pickCountRef.current = 0 // ref 초기화
    setPickHistory([]) // pickHistory 초기화
    
    // 첫 번째 턴 설정: turnOrder 우선, 없으면 2팀 케이스 보정
    const ensuredOrder = turnOrder.length ? turnOrder : (teamCount === 2 && firstPick !== null ? [firstPick, firstPick === 0 ? 1 : 0] : [])
    if (!turnOrder.length && ensuredOrder.length) {
      setTurnOrder(ensuredOrder)
    }
    const firstTurn = ensuredOrder.length ? ensuredOrder[0] : 0
    setCurrentTurn(firstTurn)
    setOrderIndex(0)
    setOrderDirection(1)
    
    // 현재 턴 정보 영역으로 스크롤 (드래프트 보드 내부의 턴 정보)
    setTimeout(() => {
      if (currentTurnRef.current) {
        currentTurnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  // 선수 선택
  const pickPlayer = (player) => {
    if (draftState !== 'drafting') return
    
    // 타임아웃 처리 중이거나 다음 턴 준비 중이면 선택 불가
    if (isTimeOutProcessing.current || isReadyForNextTurn) {
      return
    }
    
    // 현재 팀과 최대 선택 수 확인
    const currentTeamSize = teams[currentTurn]?.length || 0
    const isVeryFirstTurn = (currentTurn === firstPick && currentTeamSize <= 1)
    const maxPicks = 1 // 한 턴에 1명씩만 선택
    
    // 이미 최대 선택 수에 도달했으면 선택 불가
    if (pickCount >= maxPicks) {
      notify('⚠️ 선택 인원을 모두 채웠습니다. "선택 완료" 버튼을 눌러주세요.', 'warning')
      return
    }
    
    // 타이머 체크 - 시간이 0이면 선택 불가
    if (draftSettings.timerEnabled && timeLeft <= 0) {
      return
    }
    
    // 선수 추가
    const updatedTeams = teams.map((team, idx) => {
      if (idx === currentTurn) {
        return [...team, player]
      }
      return team
    })
    setTeams(updatedTeams)
    
    // 풀에서 제거
    const newPool = playerPool.filter(p => p.id !== player.id)
    const newPickCount = pickCount + 1
    const remainingPicks = maxPicks - newPickCount

    // ✅ 선수 풀이 비었으면 즉시 드래프트 완료 (현재 턴의 최대 선택 수를 채우지 못했어도 종료)
    if (newPool.length === 0) {
      // 히스토리 기록
      const newPickHistory = [...pickHistory, { turn: currentTurn, player }]
      setPickHistory(newPickHistory)

      setPlayerPool([])
      setPickCount(newPickCount)
      pickCountRef.current = newPickCount
      setDraftState('completed')
      notify('🎉 드래프트 완료!', 'success')
      return
    }
    
    // 🔑 자동 완료 로직: 남은 선택 수 >= 남은 선수 수 (풀에 선수가 없을 때만)
    if (remainingPicks > 0 && newPool.length > 0 && newPool.length <= remainingPicks) {
      // 남은 모든 선수를 현재 팀에 추가
      const playersToAdd = [...newPool]
      
      const finalTeams = updatedTeams.map((team, idx) => {
        if (idx === currentTurn) {
          return [...team, ...playersToAdd]
        }
        return team
      })
      setTeams(finalTeams)
      
      setPlayerPool([]) // 풀 비우기
      setPickCount(newPickCount + playersToAdd.length) // 선택 수 업데이트
      setDraftState('completed') // 즉시 완료
      
      notify(`🤖 자동 선택: ${playersToAdd.map(p => p.name).join(', ')} - 드래프트 완료!`, 'success')
      return
    }
    
  // 일반 선택 진행
  setPlayerPool(newPool)
    
  // pickHistory에 추가 (스네이크 드래프트 턴 계산용) - pickCount 업데이트 전에 해야 함
  const newPickHistory = [...pickHistory, { turn: currentTurn, player }]
  setPickHistory(newPickHistory)
    
    setPickCount(newPickCount)
    pickCountRef.current = newPickCount // ref 즉시 업데이트
    
    // 선택 완료 확인 - 최대 선택 수에 도달했는지
    if (newPickCount >= maxPicks) {
      // 선수 풀이 비었으면 드래프트 완료
      if (newPool.length === 0) {
        setDraftState('completed')
        notify('🎉 드래프트 완료!', 'success')
      } else {
        // 다음 턴 준비 상태로 전환
        setIsReadyForNextTurn(true)
        
        // 자동 턴 전환이 활성화되어 있으면 카운트다운 시작
        if (draftSettings.turnTransitionEnabled && draftSettings.turnTransitionDelay > 0) {
          setTurnTransitionCountdown(draftSettings.turnTransitionDelay)
        } else if (!draftSettings.turnTransitionEnabled) {
          // 자동 전환이 꺼져있으면 수동 모드 (버튼 대기)
        } else {
          // 딜레이가 0초이면 즉시 다음 턴
          setTimeout(() => {
            proceedToNextTurn()
          }, 100)
        }
      }
    }
  }
  
  // 선택 완료 버튼 - 다음 턴으로 전환
  const completeTurn = () => {
    const currentTeamSize = teams[currentTurn]?.length || 0
    const isVeryFirstTurn = (currentTurn === firstPick && currentTeamSize <= 1)
    const maxPicks = 1 // 한 턴에 1명씩만 선택
    
    if (pickCount < maxPicks) {
      notify('⚠️ 아직 선택을 완료하지 않았습니다.', 'warning')
      return
    }
    
    // 타임아웃 처리 방지 - 수동으로 완료했음을 표시
    isTimeOutProcessing.current = true
    
    // 다음 턴 준비 상태로 전환
    setIsReadyForNextTurn(true)
    
    // 턴 전환 딜레이가 활성화되어 있고 시간이 설정되어 있으면 카운트다운 시작
    if (draftSettings.turnTransitionEnabled && draftSettings.turnTransitionDelay > 0) {
      setTurnTransitionCountdown(draftSettings.turnTransitionDelay)
    } else if (!draftSettings.turnTransitionEnabled) {
      // 턴 전환 딜레이가 비활성화되어 있으면 수동 모드 (버튼 대기)
      // 아무것도 하지 않음 - 사용자가 "다음 턴" 버튼을 눌러야 함
    } else {
      // 딜레이가 0초이면 즉시 다음 턴
      proceedToNextTurn()
    }
  }
  
  // 다음 턴으로 진행
  const proceedToNextTurn = () => {
    if (!turnOrder.length) return
    
    let nextOrderIndex = orderIndex
    let nextDirection = orderDirection

    if (draftSettings.draftMode === 'snake') {
      // 스네이크 드래프트: 끝에 도달하면 역방향으로 전환
      if (orderDirection === 1) {
        if (orderIndex < teamCount - 1) {
          nextOrderIndex = orderIndex + 1
        } else {
          // 끝에 도달: 역방향으로 전환하며 같은 팀이 한 번 더 시작
          nextDirection = -1
          nextOrderIndex = orderIndex
        }
      } else {
        if (orderIndex > 0) {
          nextOrderIndex = orderIndex - 1
        } else {
          // 시작에 도달: 정방향으로 전환하며 같은 팀이 한 번 더 시작
          nextDirection = 1
          nextOrderIndex = orderIndex
        }
      }
    } else {
      // 라운드 로빈: 순서대로 반복, 끝에 도달하면 처음으로
      nextDirection = 1 // 항상 정방향
      if (orderIndex < teamCount - 1) {
        nextOrderIndex = orderIndex + 1
      } else {
        nextOrderIndex = 0 // 처음으로 돌아감
      }
    }

    setOrderIndex(nextOrderIndex)
    setOrderDirection(nextDirection)
    setCurrentTurn(turnOrder[nextOrderIndex])
    setTimeLeft(draftSettings.timerDuration)
    setPickCount(0)
    pickCountRef.current = 0
    setSearchTerm('')
    setIsReadyForNextTurn(false)
    setTurnTransitionCountdown(0)
    isTimeOutProcessing.current = false
    
    // 현재 턴 정보 영역으로 스크롤
    setTimeout(() => {
      if (currentTurnRef.current) {
        currentTurnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }
  
  // 선수 제거 (현재 턴에서 추가한 선수만)
  const removePlayer = (player, teamIndex) => {
    if (draftState !== 'drafting' || isReadyForNextTurn) return // 드래프트 진행 중이고 다음 턴 준비 전에만 제거 가능
    // 호환: 문자열(team1/team2) → 숫자 인덱스
    let idxParam = teamIndex
    if (typeof teamIndex === 'string') {
      idxParam = teamIndex === 'team1' ? 0 : teamIndex === 'team2' ? 1 : -1
    }
    if (idxParam === currentTurn) {
      // 주장(첫 번째 선수)이 아닌 경우만 제거 가능
      const playerIndex = teams[idxParam].findIndex(p => p.id === player.id)
      if (playerIndex > 0) {
        const updatedTeams = teams.map((team, idx) => {
          if (idx === idxParam) {
            return team.filter(p => p.id !== player.id)
          }
          return team
        })
        setTeams(updatedTeams)
        setPlayerPool([...playerPool, player])
        setPickCount(Math.max(0, pickCount - 1))
      }
    }
  }

  // 타이머
  useEffect(() => {
    if (draftState !== 'drafting' || !draftSettings.timerEnabled || isReadyForNextTurn) return
    
    // timeLeft가 0이면 타이머 중지
    if (timeLeft <= 0) return
    
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
  }, [draftState, draftSettings.timerEnabled, isReadyForNextTurn, timeLeft])
  
  // 턴 전환 카운트다운 타이머
  useEffect(() => {
    if (!isReadyForNextTurn || turnTransitionCountdown <= 0) return
    
    const timer = setInterval(() => {
      setTurnTransitionCountdown(prev => {
        if (prev <= 1) {
          // 카운트다운 종료 - 다음 턴으로 진행
          proceedToNextTurn()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [isReadyForNextTurn, turnTransitionCountdown])
  
  // 타이머 만료 시 처리
  const handleTimeOut = () => {
    if (isTimeOutProcessing.current) {
      return
    }
    
    // 이미 다음 턴 준비 상태면 실행하지 않음 (선택 완료 버튼으로 완료한 경우)
    if (isReadyForNextTurn) {
      return
    }
    
    isTimeOutProcessing.current = true
    
    // 선택된 선수들을 저장할 변수 (notify에서 사용)
    let autoSelectedPlayers = []
    let isDraftCompleted = false
    
    // 함수형 업데이트로 최신 상태 가져오기
    setTeams(currentTeams => {
      setPlayerPool(currentPool => {
        setPickCount(currentPickCount => {
          const currentTeam = currentTeams[currentTurn] || []
          
          // 첫 번째 턴 판단
          const isVeryFirstTurn = (currentTurn === firstPick && currentTeam.length <= 1)
          const maxPicks = 1 // 한 턴에 1명씩만 선택
          const picksNeeded = maxPicks - currentPickCount
          
          if (currentPool.length === 0) {
            setDraftState('completed')
            return currentPickCount
          }
          
          if (picksNeeded <= 0) {
            isTimeOutProcessing.current = false
            // 타이머를 멈추기 위해 timeLeft를 -1로 설정
            setTimeLeft(-1)
            return currentPickCount
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
          
          // 외부 변수에 저장 (notify에서 사용)
          autoSelectedPlayers = [...selectedPlayers]
          isDraftCompleted = remainingPool.length === 0
          
          // 선택된 선수들을 팀에 추가
          const updatedTeams = currentTeams.map((team, idx) => {
            if (idx === currentTurn) {
              return [...team, ...selectedPlayers]
            }
            return team
          })
          setTeams(updatedTeams)
          
          // 선수 풀 업데이트
          setPlayerPool(remainingPool)
          
          // 픽 카운트 업데이트
          const newPickCount = currentPickCount + selectedPlayers.length
          pickCountRef.current = newPickCount
          
          // 드래프트 완료 확인
          if (remainingPool.length === 0) {
            setDraftState('completed')
          } else {
            // 다음 턴 준비 상태로 설정
            setIsReadyForNextTurn(true)
            
            // 자동 턴 전환이 활성화되어 있으면 카운트다운 시작
            if (draftSettings.turnTransitionEnabled && draftSettings.turnTransitionDelay > 0) {
              setTurnTransitionCountdown(draftSettings.turnTransitionDelay)
            } else if (!draftSettings.turnTransitionEnabled) {
              // 자동 전환이 꺼져있으면 수동 모드 (버튼 대기)
              // 아무것도 하지 않음
            } else {
              // 딜레이가 0초이면 즉시 다음 턴
              setTimeout(() => {
                proceedToNextTurn()
              }, 100)
            }
          }
          
          return newPickCount
        })
        return currentPool
      })
      return currentTeams
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
    pickCountRef.current = 0 // ref 초기화
    setSearchTerm('')
    setIsReadyForNextTurn(false)
    // selectedUpcomingMatchId는 유지하여 같은 매치로 다시 드래프트 가능
  }
  
  // 이전 단계로 돌아가기
  const goBackToPreviousStep = () => {
    setConfirmState({ open: true, kind: 'back' })
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

    // 팀 스냅샷 생성 (선수 ID 배열) - 동적으로 모든 팀 포함
    const snapshot = (teams && teams.length > 0
      ? teams.map(team => (team || []).map(p => p.id))
      : [team1.map(p => p.id), team2.map(p => p.id)]
    ).filter(team => team.length > 0)

    // 주장 ID 배열 생성 (모든 주장)
    const captainIds = (captains && captains.length > 0
      ? captains.filter(Boolean).map(c => c.id)
      : [captain1?.id, captain2?.id].filter(Boolean)
    )

    // 매치 업데이트
    // dateISO를 건드리지 않고 팀 관련 정보만 업데이트 (시간 덮어쓰기 방지)
    onUpdateUpcomingMatch(selectedUpcomingMatchId, {
      snapshot,
      captainIds,
      isDraftComplete: true,
      draftCompletedAt: new Date().toISOString(),
      teamCount: snapshot.length
    })

    notify(`예정된 매치에 ${snapshot.length}팀 드래프트 결과가 저장되었습니다!`)
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
              참여 인원을 선택한 후, 주장 {teamCount}명을 지정하고 드래프트를 진행합니다.
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
                          {captains.filter(Boolean).length > 0 && `· 주장 ${captains.filter(Boolean).length}명`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 팀 수 선택 */}
                <div className="bg-white rounded-xl p-4 border border-blue-100">
                  <label className="block text-sm font-semibold text-blue-900 mb-3">
                    팀 수
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="2"
                      max="8"
                      value={teamCount}
                      onChange={(e) => setTeamCount(Number(e.target.value))}
                      className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, rgb(59 130 246) 0%, rgb(59 130 246) ${((teamCount - 2) / 6) * 100}%, rgb(229 231 235) ${((teamCount - 2) / 6) * 100}%, rgb(229 231 235) 100%)`
                      }}
                    />
                    <div className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold min-w-[70px] text-center">
                      {teamCount}팀
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    2팀부터 8팀까지 선택 가능합니다
                  </p>
                </div>

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

                {/* 턴 전환 자동/수동 토글 - 타이머가 켜져있을 때만 표시 */}
                {draftSettings.timerEnabled && (
                  <div className="bg-white rounded-xl p-4 border border-blue-100">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-blue-900">
                        자동 턴 전환
                      </label>
                      <button
                        onClick={() => setDraftSettings({...draftSettings, turnTransitionEnabled: !draftSettings.turnTransitionEnabled})}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          draftSettings.turnTransitionEnabled ? 'bg-orange-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            draftSettings.turnTransitionEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      {draftSettings.turnTransitionEnabled 
                        ? '켜짐: 선택 완료 또는 시간 초과 후 설정한 시간이 지나면 자동으로 다음 턴 시작' 
                        : '꺼짐: 선택 완료 또는 시간 초과 후 수동으로 "다음 턴" 버튼을 눌러 진행'}
                    </p>
                  </div>
                )}
                
                {/* 턴 전환 딜레이 - 타이머와 자동 전환이 모두 켜져있을 때만 표시 */}
                {draftSettings.timerEnabled && draftSettings.turnTransitionEnabled && (
                  <div className="bg-white rounded-xl p-4 border border-blue-100">
                    <label className="block text-sm font-semibold text-blue-900 mb-3">
                      다음 턴 전환 대기시간
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={draftSettings.turnTransitionDelay}
                        onChange={(e) => setDraftSettings({...draftSettings, turnTransitionDelay: Number(e.target.value)})}
                        className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, rgb(249 115 22) 0%, rgb(249 115 22) ${(draftSettings.turnTransitionDelay / 10) * 100}%, rgb(229 231 235) ${(draftSettings.turnTransitionDelay / 10) * 100}%, rgb(229 231 235) 100%)`
                        }}
                      />
                      <div className="bg-orange-500 text-white px-4 py-2 rounded-lg font-bold min-w-[70px] text-center">
                        {draftSettings.turnTransitionDelay}초
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      선택 완료 또는 시간 초과 후 다음 턴까지의 대기 시간입니다. 0초는 즉시 전환됩니다.
                    </p>
                  </div>
                )}

                {/* 드래프트 방식 선택 */}
                <div className="bg-white rounded-xl p-4 border border-blue-100">
                  <label className="block text-sm font-semibold text-blue-900 mb-3">
                    드래프트 방식
                  </label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDraftSettings({...draftSettings, draftMode: 'snake'})}
                      className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                        draftSettings.draftMode === 'snake'
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          draftSettings.draftMode === 'snake' ? 'bg-blue-500' : 'bg-gray-300'
                        }`}>
                          {draftSettings.draftMode === 'snake' && <Check className="w-4 h-4 text-white" />}
                        </div>
                        <span className="font-bold text-gray-900">스네이크 방식</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        라운드가 끝나면 순서가 <strong>역전</strong>됩니다. 마지막 선택자가 다음 라운드의 첫 선택자가 되어 공정성을 높입니다.
                      </p>
                      <div className="mt-2 text-[10px] text-gray-500 font-mono">
                        예) 1→2→3→4 → 4→3→2→1 → 1→2→3→4...
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setDraftSettings({...draftSettings, draftMode: 'roundRobin'})}
                      className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                        draftSettings.draftMode === 'roundRobin'
                          ? 'border-purple-500 bg-purple-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          draftSettings.draftMode === 'roundRobin' ? 'bg-purple-500' : 'bg-gray-300'
                        }`}>
                          {draftSettings.draftMode === 'roundRobin' && <Check className="w-4 h-4 text-white" />}
                        </div>
                        <span className="font-bold text-gray-900">라운드 로빈</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        매 라운드마다 <strong>같은 순서</strong>로 반복됩니다. 순서가 변하지 않아 예측 가능한 선택이 가능합니다.
                      </p>
                      <div className="mt-2 text-[10px] text-gray-500 font-mono">
                        예) 1→2→3→4 → 1→2→3→4 → 1→2→3→4...
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* 설정 요약 */}
              <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                <p className="text-xs text-blue-800">
                  💡 {teamCount}팀 드래프트 · 방식: <strong>{draftSettings.draftMode === 'snake' ? '스네이크 🐍' : '라운드 로빈 🔄'}</strong>
                  {draftSettings.timerEnabled && (
                    <>, 제한시간: <strong>{draftSettings.timerDuration}초</strong></>
                  )}
                  {draftSettings.turnTransitionEnabled && (
                    <>, 턴 전환: <strong>{draftSettings.turnTransitionDelay}초</strong> 후 자동</>
                  )}
                  {!draftSettings.turnTransitionEnabled && (
                    <>, 턴 전환: <strong>수동</strong></>
                  )}
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
                disabled={participatingPlayers.length < teamCount}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                참여 인원 확정 ({participatingPlayers.length}명 선택됨, 최소 {teamCount}명 필요)
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
                  setCaptains([])
                  setSearchTerm('')
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                ← 뒤로가기
              </button>
              <div className="text-center flex-1">
                <h3 className="text-xl font-bold">주장 {teamCount}명을 선택하세요</h3>
                {selectedUpcomingMatchId && captains.filter(Boolean).length === teamCount && (
                  <p className="text-xs text-blue-600 mt-1">
                    (예정된 매치에서 불러옴)
                  </p>
                )}
              </div>
              <div className="w-[100px]"></div>
            </div>
            
            {/* 선택된 주장 표시 - 동적 그리드 */}
            <div className={`grid gap-4 mb-6 ${
              teamCount === 2 ? 'md:grid-cols-2' : 
              teamCount === 3 ? 'md:grid-cols-3' : 
              teamCount === 4 ? 'md:grid-cols-2 lg:grid-cols-4' :
              teamCount <= 6 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' :
              'grid-cols-2 md:grid-cols-4 lg:grid-cols-8'
            }`}>
              {Array.from({ length: teamCount }).map((_, idx) => {
                const captain = captains[idx]
                const teamColorScheme = [
                  { bg: 'bg-emerald-500', border: 'border-emerald-500', bgLight: 'bg-emerald-50', borderLight: 'border-emerald-200' },
                  { bg: 'bg-blue-500', border: 'border-blue-500', bgLight: 'bg-blue-50', borderLight: 'border-blue-200' },
                  { bg: 'bg-purple-500', border: 'border-purple-500', bgLight: 'bg-purple-50', borderLight: 'border-purple-200' },
                  { bg: 'bg-orange-500', border: 'border-orange-500', bgLight: 'bg-orange-50', borderLight: 'border-orange-200' },
                  { bg: 'bg-red-500', border: 'border-red-500', bgLight: 'bg-red-50', borderLight: 'border-red-200' },
                  { bg: 'bg-indigo-500', border: 'border-indigo-500', bgLight: 'bg-indigo-50', borderLight: 'border-indigo-200' },
                  { bg: 'bg-pink-500', border: 'border-pink-500', bgLight: 'bg-pink-50', borderLight: 'border-pink-200' },
                  { bg: 'bg-teal-500', border: 'border-teal-500', bgLight: 'bg-teal-50', borderLight: 'border-teal-200' },
                ][idx]
                
                return (
                  <div key={idx} className={`border-2 rounded-xl p-4 ${captain ? `${teamColorScheme.border} ${teamColorScheme.bgLight}` : 'border-gray-300 bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 ${teamColorScheme.bg} rounded-full flex items-center justify-center text-white font-bold`}>{idx + 1}</div>
                      <p className="font-bold">주장 {idx + 1}</p>
                    </div>
                    {captain ? (
                      <div className={`bg-white rounded-lg p-3 border ${teamColorScheme.borderLight} flex items-center gap-3`}>
                        <InitialAvatar 
                          id={captain.id} 
                          name={captain.name} 
                          size={40} 
                          photoUrl={captain.photoUrl}
                          badges={captain.membership && captain.membership.includes('게스트') ? ['G'] : []} 
                        />
                        <div>
                          <p className="font-semibold">{captain.name}</p>
                          <p className="text-xs text-gray-500">{captain.position}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">아래에서 선수를 클릭하세요</p>
                    )}
                  </div>
                )
              })}
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
                  const captainIndex = captains.findIndex(c => c?.id === player.id)
                  const isSelected = captainIndex !== -1
                  
                  const teamColorScheme = [
                    { border: 'border-emerald-500', bg: 'bg-emerald-50', badgeBg: 'bg-emerald-500', label: '주장1' },
                    { border: 'border-blue-500', bg: 'bg-blue-50', badgeBg: 'bg-blue-500', label: '주장2' },
                    { border: 'border-purple-500', bg: 'bg-purple-50', badgeBg: 'bg-purple-500', label: '주장3' },
                    { border: 'border-orange-500', bg: 'bg-orange-50', badgeBg: 'bg-orange-500', label: '주장4' },
                    { border: 'border-red-500', bg: 'bg-red-50', badgeBg: 'bg-red-500', label: '주장5' },
                    { border: 'border-indigo-500', bg: 'bg-indigo-50', badgeBg: 'bg-indigo-500', label: '주장6' },
                    { border: 'border-pink-500', bg: 'bg-pink-50', badgeBg: 'bg-pink-500', label: '주장7' },
                    { border: 'border-teal-500', bg: 'bg-teal-50', badgeBg: 'bg-teal-500', label: '주장8' },
                  ]
                  
                  const colorScheme = isSelected ? teamColorScheme[captainIndex] : null
                  
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleCaptain(player)}
                      className={`p-2 border rounded-md transition-all flex flex-col items-center gap-1 relative ${
                        isSelected
                          ? `${colorScheme.border} ${colorScheme.bg}` 
                          : 'border-gray-200 hover:border-emerald-500 hover:bg-emerald-50'
                      }`}
                    >
                      {isSelected && (
                        <div className={`absolute top-0.5 right-0.5 text-[8px] ${colorScheme.badgeBg} text-white px-1 py-0.5 rounded font-semibold`}>
                          {colorScheme.label}
                        </div>
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
                disabled={captains.filter(Boolean).length !== teamCount}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                주장 선택 완료 ({captains.filter(Boolean).length}/{teamCount})
              </button>
            </div>
          </div>
        )}

        {/* 순서 뽑기 화면 (통합) */}
        {draftState === 'pickFirst' && (
          <div className="py-8 max-w-4xl mx-auto">
            {/* 뒤로가기 버튼 */}
            <div className="mb-6">
              <button
                onClick={() => {
                  setDraftState('selectCaptains')
                  setFirstPick(null)
                  setSpinResult(null)
                  setIsSpinning(false)
                  setTurnOrder([])
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                ← 뒤로가기
              </button>
            </div>
            
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-2">순서 뽑기</h3>
              <p className="text-gray-600">주장들의 드래프트 순서를 결정합니다.</p>
            </div>

            {/* 주장 카드들 - 동적 그리드 */}
            <div className={`grid gap-6 mb-8 ${
              teamCount === 2 ? 'grid-cols-2' : 
              teamCount === 3 ? 'grid-cols-3' : 
              teamCount === 4 ? 'grid-cols-2 md:grid-cols-4' :
              teamCount <= 6 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' :
              'grid-cols-2 md:grid-cols-4 lg:grid-cols-8'
            }`}>
              {captains.filter(Boolean).map((captain, idx) => {
                const teamColorScheme = [
                  { border: 'border-emerald-500', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
                  { border: 'border-blue-500', bg: 'bg-blue-50', ring: 'ring-blue-200' },
                  { border: 'border-purple-500', bg: 'bg-purple-50', ring: 'ring-purple-200' },
                  { border: 'border-orange-500', bg: 'bg-orange-50', ring: 'ring-orange-200' },
                  { border: 'border-red-500', bg: 'bg-red-50', ring: 'ring-red-200' },
                  { border: 'border-indigo-500', bg: 'bg-indigo-50', ring: 'ring-indigo-200' },
                  { border: 'border-pink-500', bg: 'bg-pink-50', ring: 'ring-pink-200' },
                  { border: 'border-teal-500', bg: 'bg-teal-50', ring: 'ring-teal-200' },
                ][idx]
                
                const isWinner = teamCount === 2 ? (spinResult === idx) : (turnOrder[0] === idx)
                // 순서가 모두 결정된 후 표시할 번호 (turnOrder가 팀 수만큼 채워진 경우)
                const orderNumber = (turnOrder.length === teamCount) ? (turnOrder.indexOf(idx) + 1) : null
                
                return (
                  <div 
                    key={captain.id}
                    className={`relative rounded-2xl p-6 border-4 transition-all duration-500 ${
                      isSpinning
                        ? 'border-yellow-400 bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-50'
                        : isWinner
                        ? `${teamColorScheme.border} ${teamColorScheme.bg} ring-4 ${teamColorScheme.ring}`
                        : `${teamColorScheme.border} ${teamColorScheme.bg}`
                    }`}
                    style={isSpinning ? {
                      animation: 'rainbow-border 1s ease-in-out infinite',
                      boxShadow: '0 0 30px rgba(251, 191, 36, 0.5)'
                    } : {}}>
                    {isWinner && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-lg animate-bounce">
                          ⭐ 1번 픽
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col items-center gap-3">
                      <div className={`transition-all duration-500 ${
                        isSpinning 
                          ? 'scale-105' 
                          : isWinner
                          ? 'scale-110'
                          : ''
                      }`}>
                        <InitialAvatar 
                          id={captain.id} 
                          name={captain.name} 
                          size={teamCount > 2 ? 80 : 96}
                          photoUrl={captain.photoUrl}
                          badges={captain.membership && captain.membership.includes('게스트') ? ['G'] : []} 
                        />
                      </div>
                      <p className="text-lg font-bold text-gray-900">{captain.name}</p>
                      {orderNumber && orderNumber !== 1 && (
                        <span className="inline-block mt-1 text-xs bg-gray-800 text-white px-3 py-1 rounded-full font-semibold">
                          {orderNumber}번 픽
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 결정된 순서 요약 */}
            {turnOrder.length === teamCount && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h4 className="font-semibold text-sm text-gray-700 mb-3">결정된 순서</h4>
                <div className="flex items-center gap-3 overflow-x-auto">
                  {turnOrder.map((idx, order) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm flex-shrink-0">
                      <div className="w-7 h-7 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">
                        {order + 1}
                      </div>
                      <div className="flex items-center gap-2">
                        <InitialAvatar id={captains[idx]?.id} name={captains[idx]?.name} size={24} photoUrl={captains[idx]?.photoUrl} />
                        <span className="text-sm font-medium text-gray-900">{captains[idx]?.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 버튼 영역 */}
            <div className="flex items-center justify-center gap-4">
              {(teamCount === 2 ? spinResult === null : turnOrder.length !== teamCount) ? (
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
                    '🎲 순서 뽑기'
                  )}
                </button>
              ) : (
                <button
                  onClick={confirmFirstPick}
                  className="px-8 py-4 bg-emerald-500 text-white rounded-xl font-bold text-lg hover:bg-emerald-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  순서 확정
                </button>
              )}
            </div>
          </div>
        )}


        {/* 드래프트 준비 완료 화면 */}
        {draftState === 'ready' && (
          <div className="py-8 max-w-6xl mx-auto space-y-6">
            {/* 뒤로가기 버튼 */}
            <div className="mb-6">
              <button
                onClick={() => {
                  // 통합된 순서 뽑기 화면으로 이동
                  setDraftState('pickFirst')
                  setSpinResult(null)
                  setIsSpinning(false)
                  setTurnOrder(turnOrder.length === teamCount ? turnOrder : [])
                  setCurrentTurn(null)
                  const initialTeams = captains.filter(Boolean).map(captain => [captain])
                  setTeams(initialTeams)
                  const captainIds = captains.filter(Boolean).map(c => c.id)
                  setPlayerPool(participatingPlayers.filter(p => !captainIds.includes(p.id)))
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                ← 뒤로가기
              </button>
            </div>
            
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
                  <h4 className="text-xl font-bold text-gray-900">1번 픽</h4>
                </div>
                <p className="text-center text-3xl font-bold text-yellow-600 mb-6">
                  {captains[firstPick]?.name}
                </p>
                
                {/* 드래프트 상세 정보 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">참여 선수</p>
                    <p className="text-2xl font-bold text-gray-900">{participatingPlayers.length}명</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">팀 수</p>
                    <p className="text-2xl font-bold text-gray-900">{teamCount}팀</p>
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

              {/* 주장 카드들 - 동적 그리드 */}
              <div className={`grid gap-6 ${
                teamCount === 2 ? 'grid-cols-2' : 
                teamCount === 3 ? 'grid-cols-3' : 
                teamCount === 4 ? 'grid-cols-2 md:grid-cols-4' :
                teamCount <= 6 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' :
                'grid-cols-2 md:grid-cols-4 lg:grid-cols-8'
              }`}>
                {(teamCount === 2 ? captains.filter(Boolean) : turnOrder.map(idx => captains[idx])).map((captain, displayIdx) => {
                  const captainIdx = teamCount === 2 ? displayIdx : turnOrder[displayIdx]
                  const teamColorScheme = [
                    { border: 'border-emerald-500', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
                    { border: 'border-blue-500', bg: 'bg-blue-50', ring: 'ring-blue-200' },
                    { border: 'border-purple-500', bg: 'bg-purple-50', ring: 'ring-purple-200' },
                    { border: 'border-orange-500', bg: 'bg-orange-50', ring: 'ring-orange-200' },
                    { border: 'border-red-500', bg: 'bg-red-50', ring: 'ring-red-200' },
                    { border: 'border-indigo-500', bg: 'bg-indigo-50', ring: 'ring-indigo-200' },
                    { border: 'border-pink-500', bg: 'bg-pink-50', ring: 'ring-pink-200' },
                    { border: 'border-teal-500', bg: 'bg-teal-50', ring: 'ring-teal-200' },
                  ][captainIdx]
                  
                  return (
                    <div 
                      key={captain.id}
                      className={`border-2 rounded-xl p-6 text-center ${
                        displayIdx === 0
                          ? `${teamColorScheme.border} ${teamColorScheme.bg} ring-2 ${teamColorScheme.ring}` 
                          : 'border-gray-300 bg-white'
                      }`}>
                      <div className="flex flex-col items-center gap-3">
                        <InitialAvatar 
                          id={captain.id} 
                          name={captain.name} 
                          size={64}
                          photoUrl={captain.photoUrl}
                          badges={captain.membership && captain.membership.includes('게스트') ? ['G'] : []} 
                        />
                        <div>
                          <p className="font-bold text-lg">{captain.name}</p>
                          <p className="text-sm text-gray-600 mt-1">{captain.position}</p>
                          {displayIdx === 0 ? (
                            <span className="inline-block mt-2 text-xs bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full font-semibold">
                              🥇 1번 픽
                            </span>
                          ) : teamCount > 2 && (
                            <span className="inline-block mt-2 text-xs bg-gray-200 text-gray-700 px-3 py-1 rounded-full font-semibold">
                              {displayIdx + 1}번 픽
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 드래프트 순서 안내 */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">📋</span>
                  드래프트 순서
                </h4>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {draftSettings.draftMode === 'snake' ? (
                    <>
                      <strong className="text-blue-600">스네이크 드래프트 🐍</strong> 방식으로 진행됩니다. 
                      {teamCount === 2 ? (
                        <>
                          <strong className="text-blue-600 mx-1">
                            {captains[firstPick]?.name}
                          </strong>
                          주장이 먼저 1명을 선택하며, 
                          이후 각 턴마다 1명씩 번갈아 선택합니다.
                        </>
                      ) : (
                        <>
                          순서: {turnOrder.map((idx, order) => (
                            <strong key={idx} className="text-blue-600 mx-1">
                              {order + 1}. {captains[idx]?.name}
                            </strong>
                          ))}
                          <br />
                          각 턴마다 1명씩 선택합니다.
                        </>
                      )}
                      {' '}각 라운드의 끝에서는 순서가 역전되어 마지막 선택자가 다음 라운드 첫 선택자가 됩니다.
                    </>
                  ) : (
                    <>
                      <strong className="text-purple-600">라운드 로빈 🔄</strong> 방식으로 진행됩니다. 
                      {teamCount === 2 ? (
                        <>
                          <strong className="text-purple-600 mx-1">
                            {captains[firstPick]?.name}
                          </strong>
                          주장이 먼저 1명을 선택하며, 
                          이후 각 턴마다 1명씩 같은 순서로 반복하여 선택합니다.
                        </>
                      ) : (
                        <>
                          순서: {turnOrder.map((idx, order) => (
                            <strong key={idx} className="text-purple-600 mx-1">
                              {order + 1}. {captains[idx]?.name}
                            </strong>
                          ))}
                          <br />
                          각 턴마다 1명씩 선택하며, 매 라운드마다 같은 순서로 반복됩니다.
                        </>
                      )}
                    </>
                  )}
                </p>
                <p className="text-gray-600 text-xs leading-relaxed mt-2 pt-2 border-t border-gray-200">
                  ⏱️ <strong>드래프트 시작!</strong> 버튼을 누르면 즉시 카운트다운이 시작됩니다. 
                  제한 시간 내에 선택하지 못하면 <strong className="text-amber-600">랜덤으로 선수가 자동 선택</strong>됩니다.
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
          teamCount === 2 ? (
            <DraftBoard
              captain1={captain1}
              captain2={captain2}
              team1={team1}
              team2={team2}
              playerPool={filteredDraftPool}
              totalPlayers={playerPool.length}
              currentTurn={currentTurn === 0 ? 'captain1' : 'captain2'}
              timeLeft={timeLeft}
              onPickPlayer={pickPlayer}
              isCompleted={draftState === 'completed'}
              onReset={resetDraft}
              onGoBack={draftState === 'drafting' ? goBackToPreviousStep : null}
              firstPick={firstPick === 0 ? 'captain1' : 'captain2'}
              pickCount={pickCount}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              draftSettings={draftSettings}
              onRemovePlayer={removePlayer}
              isReadyForNextTurn={isReadyForNextTurn}
              onProceedToNextTurn={proceedToNextTurn}
              onCompleteTurn={completeTurn}
              onSaveToUpcomingMatch={saveToUpcomingMatch}
              selectedUpcomingMatchId={selectedUpcomingMatchId}
              turnTransitionCountdown={turnTransitionCountdown}
              currentTurnRef={currentTurnRef}
            />
          ) : (
            <div className="space-y-6">
              {draftState === 'completed' && (
                <>
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-6 text-center">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">드래프트 완료!</h3>
                    <p className="text-gray-600 mb-4">{teamCount}팀이 구성되었습니다.</p>
                    <div className="flex items-center justify-center gap-3">
                      {onUpdateUpcomingMatch && selectedUpcomingMatchId && (
                        <button
                          onClick={saveToUpcomingMatch}
                          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors shadow-md"
                        >
                          <Save className="w-5 h-5" />
                          예정된 매치에 저장
                        </button>
                      )}
                      <button
                        onClick={resetDraft}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
                      >
                        <RefreshCw className="w-5 h-5" />
                        새로운 드래프트 시작
                      </button>
                    </div>
                  </div>
                  {/* 최종 결과 그리드 */}
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {teams.map((team, idx) => {
                      const captain = captains[idx]
                      const colors = [
                        { bg: 'bg-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200' },
                        { bg: 'bg-blue-500', light: 'bg-blue-50', border: 'border-blue-200' },
                        { bg: 'bg-purple-500', light: 'bg-purple-50', border: 'border-purple-200' },
                        { bg: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-200' },
                        { bg: 'bg-red-500', light: 'bg-red-50', border: 'border-red-200' },
                        { bg: 'bg-indigo-500', light: 'bg-indigo-50', border: 'border-indigo-200' },
                        { bg: 'bg-pink-500', light: 'bg-pink-50', border: 'border-pink-200' },
                        { bg: 'bg-teal-500', light: 'bg-teal-50', border: 'border-teal-200' }
                      ][idx % 8]
                      return (
                        <div key={idx} className={`rounded-xl border-2 ${colors.border} ${colors.light} p-4`}>
                          <div className="flex items-center gap-2 mb-4">
                            <div className={`w-8 h-8 ${colors.bg} rounded-full flex items-center justify-center text-white font-bold`}>{idx + 1}</div>
                            <div>
                              <p className="font-bold text-lg">{captain?.name}</p>
                              <p className="text-xs text-gray-500">주장 {idx === firstPick ? '(1번 픽)' : ''}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {team.map((player, pIdx) => (
                              <div key={player.id} className={`p-3 rounded-lg flex items-center gap-3 ${pIdx === 0 ? `${colors.light} border-2` : 'bg-white border'} border-gray-200`}>
                                <InitialAvatar id={player.id} name={player.name} size={36} photoUrl={player.photoUrl} badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} />
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold truncate">{player.name}</p>
                                  <p className="text-xs text-gray-500">{player.position}</p>
                                </div>
                                {pIdx === 0 && (
                                  <span className={`text-xs ${colors.bg} text-white px-2 py-1 rounded`}>주장</span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 text-center text-sm text-gray-600">총 {team.length}명</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {draftState === 'drafting' && (
                <>
                  {/* 상단 고정: 현재 턴/타이머/버튼 (2팀 UI와 통일) */}
                  {(() => {
                    const currentTeamSize = teams[currentTurn]?.length || 0
                    const isVeryFirstTurn = (currentTurn === firstPick && currentTeamSize <= 1)
                    const maxPicks = 1 // 한 턴에 1명씩만 선택
                    const isPickComplete = pickCount >= maxPicks
                    return (
                      <div 
                        ref={currentTurnRef}
                        className="sticky top-0 z-20 rounded-xl p-6 shadow-lg bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-200"
                        style={{ animation: 'highlight-pulse 2s ease-in-out infinite' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {goBackToPreviousStep && (
                              <button
                                onClick={goBackToPreviousStep}
                                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors border border-gray-300"
                              >
                                <ArrowLeft className="w-4 h-4" />
                                <span>뒤로가기</span>
                              </button>
                            )}
                            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                            <div>
                              <p className="text-sm text-gray-600">현재 턴</p>
                              <p className="text-xl font-bold text-gray-900">{captains[currentTurn]?.name} 주장</p>
                              <p className="text-xs text-gray-500">
                                {pickCount}/{maxPicks} 선택 완료
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {isReadyForNextTurn && turnTransitionCountdown > 0 && (
                              <div className="text-center">
                                <div className="flex items-center gap-2 justify-center mb-1">
                                  <Clock className="w-5 h-5 text-orange-600" />
                                  <span className="text-sm text-orange-600">다음 턴까지</span>
                                </div>
                                <div className="text-4xl font-bold text-orange-500 animate-pulse">{turnTransitionCountdown}초</div>
                              </div>
                            )}
                            {draftSettings.timerEnabled && !isReadyForNextTurn && (
                              <div className="text-center">
                                <div className="flex items-center gap-2 justify-center mb-1">
                                  <Clock className="w-5 h-5 text-gray-600" />
                                  <span className="text-sm text-gray-600">남은 시간</span>
                                </div>
                                <div className={`text-4xl font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-900'}`}>{timeLeft}초</div>
                              </div>
                            )}
                            {isPickComplete && !isReadyForNextTurn && (
                              <button
                                onClick={completeTurn}
                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-blue-500 text-white rounded-lg font-bold hover:from-emerald-600 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl"
                                style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
                              >
                                <Check className="w-6 h-6" />
                                <span className="text-lg">선택 완료</span>
                              </button>
                            )}
                            {isReadyForNextTurn && turnTransitionCountdown === 0 && (
                              <button
                                onClick={proceedToNextTurn}
                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-blue-500 text-white rounded-lg font-bold hover:from-emerald-600 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl animate-bounce"
                              >
                                <span className="text-lg">다음 턴</span>
                                <ArrowRight className="w-6 h-6" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="grid md:grid-cols-2 gap-6 mt-4">
                    {/* 현재 턴 팀 */}
                    <div className="border-2 border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold">
                          {turnOrder.indexOf(currentTurn) + 1}
                        </div>
                        <div>
                          <p className="font-bold text-lg">{captains[currentTurn]?.name}</p>
                          <p className="text-xs text-gray-500">주장 {currentTurn === firstPick && '(1번 픽)'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {(teams[currentTurn] || []).map((player, idx) => {
                          const startSize = (teams[currentTurn]?.length || 0) - pickCount
                          return (
                            <div key={player.id} className={`p-3 rounded-lg flex items-center gap-3 relative ${idx === 0 ? 'bg-emerald-100 border-2 border-emerald-300' : 'bg-white border border-gray-200'}`}>
                              <InitialAvatar id={player.id} name={player.name} size={36} photoUrl={player.photoUrl} badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{player.name}</p>
                                <p className="text-xs text-gray-500">{player.position}</p>
                              </div>
                              {idx === 0 ? (
                                <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded flex-shrink-0">주장</span>
                              ) : (
                                !isReadyForNextTurn && idx >= startSize && (
                                  <button onClick={() => removePlayer(player, currentTurn)} className="p-1 hover:bg-red-100 rounded-full transition-colors" title="선수 제거">
                                    <X className="w-4 h-4 text-red-500" />
                                  </button>
                                )
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-4 text-center text-sm text-gray-500">총 {(teams[currentTurn] || []).length}명</div>
                    </div>
                    {/* 선수 풀 */}
                    {playerPool.length > 0 && (
                      <div className="border-2 border-gray-200 rounded-xl p-4">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">선수 풀 ({playerPool.length}명)</h3>
                        <div className="relative mb-4">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            type="text"
                            placeholder="선수 이름 또는 포지션 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-[600px] overflow-y-auto">
                          {filteredDraftPool.map(player => (
                            <button
                              key={player.id}
                              onClick={() => pickPlayer(player)}
                              disabled={isReadyForNextTurn}
                              className={`p-2 border rounded-md transition-all flex flex-col items-center gap-1 ${isReadyForNextTurn ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed' : 'border-gray-200 hover:border-emerald-500 hover:bg-emerald-50'}`}
                            >
                              <InitialAvatar id={player.id} name={player.name} size={56} photoUrl={player.photoUrl} badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} />
                              <div className="w-full text-center">
                                <p className="font-semibold text-xs truncate leading-tight">{player.name}</p>
                                <p className="text-[10px] text-gray-500 truncate">{player.position}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                        {filteredDraftPool.length === 0 && (
                          <div className="text-center py-8 text-gray-500">검색 결과가 없습니다.</div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 하단 별도 제어는 상단 헤더로 통합 */}
                </>
              )}
            </div>
          )
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
        
        @keyframes rainbow-border {
          0%, 100% { 
            border-color: #fbbf24;
            box-shadow: 0 0 30px rgba(251, 191, 36, 0.5);
          }
          25% { 
            border-color: #f97316;
            box-shadow: 0 0 30px rgba(249, 115, 22, 0.5);
          }
          50% { 
            border-color: #ef4444;
            box-shadow: 0 0 30px rgba(239, 68, 68, 0.5);
          }
          75% { 
            border-color: #8b5cf6;
            box-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
          }
        }
        
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6);
            transform: scale(1.02);
          }
        }
        
        @keyframes highlight-pulse {
          0%, 100% {
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
            border-color: rgb(167, 243, 208);
          }
          50% {
            box-shadow: 0 8px 30px rgba(16, 185, 129, 0.5);
            border-color: rgb(52, 211, 153);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes slideInFromLeft {
          from {
            opacity: 0;
            transform: translateX(-100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
      {/* 인앱 Confirm/Alert 모달 */}
      <ConfirmDialog
        open={confirmState.open && confirmState.kind==='back'}
        title="드래프트 초기화"
        message={'정말 이전 단계로 돌아가시겠습니까? 현재 진행 중인 드래프트가 초기화됩니다.'}
        confirmLabel="돌아가기"
        cancelLabel="취소"
        tone="danger"
        onCancel={()=>setConfirmState({ open:false, kind:null })}
        onConfirm={()=>{
          setDraftState('ready')
          setTeam1([captain1])
          setTeam2([captain2])
          setPlayerPool(participatingPlayers.filter(p => p.id !== captain1.id && p.id !== captain2.id))
          setTimeLeft(draftSettings.timerDuration)
          setPickCount(0)
          pickCountRef.current = 0
          setSearchTerm('')
          setIsReadyForNextTurn(false)
          setCurrentTurn(firstPick)
          setConfirmState({ open:false, kind:null })
        }}
      />
      <ConfirmDialog
        open={alertState.open}
        title="안내"
        message={alertState.message}
        confirmLabel="확인"
        cancelLabel={null}
        tone="default"
        onConfirm={()=>setAlertState({ open:false, message:'' })}
      />
    </div>
  )
}
