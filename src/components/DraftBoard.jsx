import React from 'react'
import { Clock, Trophy, Users, Search, Undo2, X, ArrowRight, Check, Save, RefreshCw } from 'lucide-react'
import InitialAvatar from './InitialAvatar'

export default function DraftBoard({
  captain1,
  captain2,
  team1,
  team2,
  playerPool,
  totalPlayers,
  currentTurn,
  timeLeft,
  onPickPlayer,
  isCompleted,
  onReset,
  firstPick,
  pickCount,
  searchTerm,
  onSearchChange,
  draftSettings,
  onUndo,
  canUndo,
  onRemovePlayer,
  isReadyForNextTurn,
  onProceedToNextTurn,
  onCompleteTurn,
  onSaveToUpcomingMatch,
  selectedUpcomingMatchId
}) {
  // 첫 번째 턴 판단: 선공 주장의 턴이고, 양쪽 팀 모두 주장만 있거나 선공 주장이 1명 선택한 상태
  const isVeryFirstTurn = (currentTurn === firstPick && team1.length <= 2 && team2.length <= 2)
  const maxPicks = isVeryFirstTurn ? draftSettings.firstPickCount : draftSettings.regularPickCount
  
  // 선택 완료 여부 (모든 선수를 선택했는지)
  const isPickComplete = pickCount >= maxPicks
  
  // 현재 턴에서 추가된 선수의 시작 인덱스 계산
  // 턴 시작 시 팀 크기 = 현재 팀 크기 - 현재 턴에서 선택한 수
  const team1StartSize = team1.length - (currentTurn === 'captain1' ? pickCount : 0)
  const team2StartSize = team2.length - (currentTurn === 'captain2' ? pickCount : 0)

  return (
    <div className="space-y-6">
      {/* 완료 메시지 */}
      {isCompleted && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-6 text-center">
          <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h3 className="text-2xl font-bold text-gray-900 mb-2">드래프트 완료!</h3>
          <p className="text-gray-600 mb-4">두 팀이 구성되었습니다.</p>
          
          <div className="flex items-center justify-center gap-3">
            {/* 예정된 매치에 저장 버튼 */}
            {onSaveToUpcomingMatch && selectedUpcomingMatchId && (
              <button
                onClick={onSaveToUpcomingMatch}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors shadow-md"
              >
                <Save className="w-5 h-5" />
                예정된 매치에 저장
              </button>
            )}
            
            {/* 새 드래프트 시작 버튼 */}
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              새로운 드래프트 시작
            </button>
          </div>
        </div>
      )}

      {/* 팀 표시 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Team 1 */}
        <div className={`border-2 rounded-xl p-4 ${currentTurn === 'captain1' && !isCompleted ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold">
              1
            </div>
            <div>
              <p className="font-bold text-lg">{captain1?.name}</p>
              <p className="text-xs text-gray-500">
                주장 {firstPick === 'captain1' && '(선공)'}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            {team1.map((player, idx) => (
              <div
                key={player.id}
                className={`p-3 rounded-lg flex items-center gap-3 relative ${idx === 0 ? 'bg-emerald-100 border-2 border-emerald-300' : 'bg-white border border-gray-200'}`}
              >
                <InitialAvatar 
                  id={player.id} 
                  name={player.name} 
                  size={36} 
                  badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} 
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{player.name}</p>
                  <p className="text-xs text-gray-500">{player.position}</p>
                </div>
                {idx === 0 ? (
                  <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded flex-shrink-0">주장</span>
                ) : (
                  // X 버튼: 자기 차례 + 드래프트 진행중 + 시간 남음 + 현재 턴에서 추가된 선수만
                  currentTurn === 'captain1' && 
                  !isCompleted && 
                  !isReadyForNextTurn && 
                  (draftSettings.timerEnabled ? timeLeft > 0 : true) &&
                  idx >= team1StartSize && (
                    <button
                      onClick={() => onRemovePlayer(player, 'team1')}
                      className="p-1 hover:bg-red-100 rounded-full transition-colors"
                      title="선수 제거"
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
          
          <div className="mt-4 text-center text-sm text-gray-500">
            <Users className="w-4 h-4 inline mr-1" />
            {team1.length}명
          </div>
        </div>

        {/* Team 2 */}
        <div className={`border-2 rounded-xl p-4 ${currentTurn === 'captain2' && !isCompleted ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
              2
            </div>
            <div>
              <p className="font-bold text-lg">{captain2?.name}</p>
              <p className="text-xs text-gray-500">
                주장 {firstPick === 'captain2' && '(선공)'}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            {team2.map((player, idx) => (
              <div
                key={player.id}
                className={`p-3 rounded-lg flex items-center gap-3 relative ${idx === 0 ? 'bg-blue-100 border-2 border-blue-300' : 'bg-white border border-gray-200'}`}
              >
                <InitialAvatar 
                  id={player.id} 
                  name={player.name} 
                  size={36} 
                  badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} 
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{player.name}</p>
                  <p className="text-xs text-gray-500">{player.position}</p>
                </div>
                {idx === 0 ? (
                  <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded flex-shrink-0">주장</span>
                ) : (
                  // X 버튼: 자기 차례 + 드래프트 진행중 + 시간 남음 + 현재 턴에서 추가된 선수만
                  currentTurn === 'captain2' && 
                  !isCompleted && 
                  !isReadyForNextTurn && 
                  (draftSettings.timerEnabled ? timeLeft > 0 : true) &&
                  idx >= team2StartSize && (
                    <button
                      onClick={() => onRemovePlayer(player, 'team2')}
                      className="p-1 hover:bg-red-100 rounded-full transition-colors"
                      title="선수 제거"
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
          
          <div className="mt-4 text-center text-sm text-gray-500">
            <Users className="w-4 h-4 inline mr-1" />
            {team2.length}명
          </div>
        </div>
      </div>

      {/* 현재 턴 및 타이머 - 팀과 선수 풀 사이 */}
      {!isCompleted && (
        <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-200 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${currentTurn === 'captain1' ? 'bg-emerald-500' : 'bg-blue-500'} animate-pulse`}></div>
              <div>
                <p className="text-sm text-gray-600">현재 턴</p>
                <p className="text-xl font-bold text-gray-900">
                  {currentTurn === 'captain1' ? captain1?.name : captain2?.name} 주장
                </p>
                <p className="text-xs text-gray-500">
                  {pickCount}/{maxPicks} 선택 완료 {isVeryFirstTurn && '(첫 턴: 1명만)'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* 타이머 - 타이머가 켜져있을 때 항상 표시 */}
              {draftSettings.timerEnabled && (
                <div className="text-center">
                  <div className="flex items-center gap-2 justify-center mb-1">
                    <Clock className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-600">남은 시간</span>
                  </div>
                  <div className={`text-4xl font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-900'}`}>
                    {timeLeft}초
                  </div>
                </div>
              )}

              {/* 되돌리기 버튼 */}
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="마지막 선택 취소"
              >
                <Undo2 className="w-4 h-4" />
                <span className="hidden sm:inline">되돌리기</span>
              </button>
              
              {/* 완료 버튼 - 선택 완료 시 표시 */}
              {isPickComplete && !isReadyForNextTurn && (
                <button
                  onClick={onCompleteTurn}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 transition-colors shadow-lg"
                >
                  <Check className="w-5 h-5" />
                  <span>선택 완료</span>
                </button>
              )}
              
              {/* 다음 진행 버튼 - 선택 완료 시 항상 표시 (타이머 상관없이) */}
              {isReadyForNextTurn && (
                <button
                  onClick={onProceedToNextTurn}
                  className="flex items-center gap-2 px-6 py-2 bg-emerald-500 text-white rounded-lg font-bold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-xl"
                >
                  <span>다음 턴</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 선수 풀 */}
      {!isCompleted && totalPlayers > 0 && (
        <div className="border-2 border-gray-200 rounded-xl p-4">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            선수 풀 ({totalPlayers}명)
          </h3>

          {/* 검색바 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="선수 이름 또는 포지션 검색..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
            {playerPool.map(player => (
              <button
                key={player.id}
                onClick={() => onPickPlayer(player)}
                disabled={isPickComplete}
                className={`p-1.5 border rounded-md transition-all flex flex-col items-center gap-1 ${
                  isPickComplete 
                    ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed' 
                    : 'border-gray-200 hover:border-emerald-500 hover:bg-emerald-50'
                }`}
              >
                <InitialAvatar 
                  id={player.id} 
                  name={player.name} 
                  size={28} 
                  badges={player.membership && player.membership.includes('게스트') ? ['G'] : []} 
                />
                <div className="w-full text-center">
                  <p className="font-semibold text-[10px] truncate leading-tight">{player.name}</p>
                  <p className="text-[9px] text-gray-500 truncate">{player.position}</p>
                </div>
              </button>
            ))}
          </div>

          {playerPool.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
