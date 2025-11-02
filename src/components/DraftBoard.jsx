import React from 'react'
import { Clock, Trophy, Users, Search } from 'lucide-react'
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
  draftSettings
}) {
  const isFirstTurn = team1.length === 1 && team2.length === 1
  const maxPicks = isFirstTurn ? draftSettings.firstPickCount : draftSettings.regularPickCount

  return (
    <div className="space-y-6">
      {/* 상태 표시 */}
      {!isCompleted && (
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${currentTurn === 'captain1' ? 'bg-emerald-500' : 'bg-blue-500'} animate-pulse`}></div>
              <div>
                <p className="text-sm text-gray-600">현재 턴</p>
                <p className="text-xl font-bold text-gray-900">
                  {currentTurn === 'captain1' ? captain1?.name : captain2?.name} 주장
                </p>
                <p className="text-xs text-gray-500">
                  {pickCount}/{maxPicks} 선택 완료 {isFirstTurn && '(첫 턴: 1명만)'}
                </p>
              </div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center mb-1">
                <Clock className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-600">남은 시간</span>
              </div>
              <div className={`text-4xl font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-900'}`}>
                {timeLeft}초
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 완료 메시지 */}
      {isCompleted && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-6 text-center">
          <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h3 className="text-2xl font-bold text-gray-900 mb-2">드래프트 완료!</h3>
          <p className="text-gray-600 mb-4">두 팀이 구성되었습니다.</p>
          <button
            onClick={onReset}
            className="px-6 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
          >
            새로운 드래프트 시작
          </button>
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
                className={`p-3 rounded-lg flex items-center gap-3 ${idx === 0 ? 'bg-emerald-100 border-2 border-emerald-300' : 'bg-white border border-gray-200'}`}
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
                {idx === 0 && (
                  <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded flex-shrink-0">주장</span>
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
                className={`p-3 rounded-lg flex items-center gap-3 ${idx === 0 ? 'bg-blue-100 border-2 border-blue-300' : 'bg-white border border-gray-200'}`}
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
                {idx === 0 && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded flex-shrink-0">주장</span>
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {playerPool.map(player => (
              <button
                key={player.id}
                onClick={() => onPickPlayer(player)}
                className="p-3 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left flex items-center gap-3"
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
