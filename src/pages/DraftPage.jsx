import React, { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import Card from '../components/Card'
import DraftBoard from '../components/DraftBoard'
import InitialAvatar from '../components/InitialAvatar'

export default function DraftPage({ players }) {
  const [draftState, setDraftState] = useState('setup') // setup, selectParticipants, selectCaptains, drafting, completed
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

  // 초기 로드
  useEffect(() => {
    setAllPlayers([...players])
  }, [players])

  // 드래프트 시작 - 참여 인원 선택 단계로 이동
  const startDraft = () => {
    if (allPlayers.length < 2) {
      alert('최소 2명의 선수가 필요합니다.')
      return
    }
    setDraftState('selectParticipants')
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

  // 주장 선택 완료 및 드래프트 시작
  const confirmCaptains = () => {
    if (!captain1 || !captain2) {
      alert('두 주장을 모두 선택해주세요.')
      return
    }
    
    // 선공 랜덤 결정
    const first = Math.random() < 0.5 ? 'captain1' : 'captain2'
    setFirstPick(first)
    setCurrentTurn(first)
    
    // 주장들을 풀에서 제거하고 각 팀에 추가
    const remainingPool = playerPool.filter(p => p.id !== captain1.id && p.id !== captain2.id)
    setPlayerPool(remainingPool)
    setTeam1([captain1])
    setTeam2([captain2])
    
    setDraftState('drafting')
    setTimeLeft(15)
    setPickCount(0)
  }

  // 선수 선택
  const pickPlayer = (player) => {
    if (draftState !== 'drafting') return
    
    // 현재 턴이 주장1인지 주장2인지 확인
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
    
    // 픽 카운트 체크
    const isFirstTurn = (team1.length === 1 && team2.length === 1) // 주장만 있는 상태
    const maxPicks = isFirstTurn ? 1 : 2
    
    if (newPickCount >= maxPicks) {
      // 턴 교체
      if (newPool.length === 0) {
        setDraftState('completed')
      } else {
        setCurrentTurn(currentTurn === 'captain1' ? 'captain2' : 'captain1')
        setTimeLeft(15)
        setPickCount(0)
      }
    }
  }

  // 타이머
  useEffect(() => {
    if (draftState !== 'drafting') return
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // 시간 초과 - 자동으로 랜덤 선택
          if (playerPool.length > 0) {
            const isFirstTurn = (team1.length === 1 && team2.length === 1)
            const maxPicks = isFirstTurn ? 1 : 2
            const picksNeeded = maxPicks - pickCount
            
            for (let i = 0; i < picksNeeded && playerPool.length > 0; i++) {
              const randomPlayer = playerPool[Math.floor(Math.random() * playerPool.length)]
              pickPlayer(randomPlayer)
            }
          }
          return 15
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [draftState, playerPool, pickCount, team1.length, team2.length])

  // 리셋
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
    setTimeLeft(15)
    setPickCount(0)
    setSearchTerm('')
  }

  // 검색 필터링 - 참여 인원 선택 시
  const filteredAllPlayers = allPlayers.filter(player => 
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.position?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 검색 필터링 - 주장 선택 시
  const filteredPoolPlayers = playerPool.filter(player => 
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
          <div className="text-center py-8">
            <h3 className="text-xl font-bold mb-4">드래프트로 팀을 구성하세요</h3>
            <p className="text-gray-600 mb-6">
              참여 인원을 선택한 후, 주장 2명을 지정하고 드래프트를 진행합니다.<br/>
              첫 번째 턴은 1명, 그 이후는 각 턴마다 2명씩 선택할 수 있습니다.
            </p>
            <button
              onClick={startDraft}
              className="px-6 py-3 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
            >
              참여 인원 선택하기
            </button>
          </div>
        )}

        {draftState === 'selectParticipants' && (
          <div className="space-y-6 py-6">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold mb-2">드래프트 참여 인원을 선택하세요</h3>
              <p className="text-sm text-gray-600">
                선택된 선수: <span className="font-bold text-emerald-600">{participatingPlayers.length}명</span>
              </p>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {filteredAllPlayers.map(player => {
                  const isSelected = participatingPlayers.some(p => p.id === player.id)
                  
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleParticipant(player)}
                      className={`p-3 border-2 rounded-lg text-left transition-all flex items-center gap-3 ${
                        isSelected 
                          ? 'border-emerald-500 bg-emerald-50' 
                          : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <InitialAvatar 
                        id={player.id} 
                        name={player.name} 
                        size={40} 
                        badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{player.name}</p>
                        <p className="text-xs text-gray-500">{player.position}</p>
                      </div>
                      {isSelected && (
                        <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded font-semibold flex-shrink-0">참여</span>
                      )}
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
                주장 선택하기 ({participatingPlayers.length}명 선택됨)
              </button>
            </div>
          </div>
        )}

        {draftState === 'selectCaptains' && (
          <div className="space-y-6 py-6">
            <h3 className="text-xl font-bold text-center mb-6">주장 2명을 선택하세요</h3>
            
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {filteredPoolPlayers.map(player => {
                  const isCaptain1 = captain1?.id === player.id
                  const isCaptain2 = captain2?.id === player.id
                  const isSelected = isCaptain1 || isCaptain2
                  
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleCaptain(player)}
                      className={`p-3 border-2 rounded-lg text-left transition-all flex items-center gap-3 ${
                        isCaptain1 
                          ? 'border-emerald-500 bg-emerald-50' 
                          : isCaptain2
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <InitialAvatar 
                        id={player.id} 
                        name={player.name} 
                        size={40} 
                        badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{player.name}</p>
                        <p className="text-xs text-gray-500">{player.position}</p>
                      </div>
                      {isCaptain1 && (
                        <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded font-semibold flex-shrink-0">주장 1</span>
                      )}
                      {isCaptain2 && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded font-semibold flex-shrink-0">주장 2</span>
                      )}
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
                드래프트 시작
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
            playerPool={playerPool}
            currentTurn={currentTurn}
            timeLeft={timeLeft}
            onPickPlayer={pickPlayer}
            isCompleted={draftState === 'completed'}
            onReset={resetDraft}
            firstPick={firstPick}
            pickCount={pickCount}
          />
        )}
      </Card>
    </div>
  )
}
