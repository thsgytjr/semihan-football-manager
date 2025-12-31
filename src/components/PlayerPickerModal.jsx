// src/components/PlayerPickerModal.jsx
import React, { useState, useEffect } from 'react'
import InitialAvatar from './InitialAvatar'

/**
 * PlayerPickerModal
 * 
 * Modal for selecting a player from all teams with:
 * - Team tabs (default to same team as context)
 * - Player grid with avatars and names
 * - Current stats display (goals/assists)
 * 
 * @param {boolean} isOpen - Modal visibility
 * @param {function} onClose - Close handler
 * @param {function} onSelect - Player selection handler (playerId)
 * @param {array} teams - Team rosters [{name, players: [{id, name, photoUrl}]}]
 * @param {object} draft - Current stats draft {playerId: {goals, assists}}
 * @param {string} title - Modal title
 * @param {string} subtitle - Instructions text
 * @param {number} defaultTeamIdx - Default team tab index
 * @param {string} excludePlayerId - Player ID to exclude from selection
 * @param {boolean} showNoSelectionOption - Show "없이 추가" button
 * @param {string} noSelectionLabel - Label for no-selection button
 * @param {string} statLabel - Stat label to show (G or A)
 */
function PlayerPickerModal({
  isOpen,
  onClose,
  onSelect,
  teams = [],
  draft = {},
  title = '선수 선택',
  subtitle = '선수를 선택하세요',
  defaultTeamIdx = 0,
  excludePlayerId = null,
  showNoSelectionOption = false,
  noSelectionLabel = '없이 추가',
  statLabel = 'G'
}) {
  const [activeTabIdx, setActiveTabIdx] = useState(defaultTeamIdx)

  // Update active tab when defaultTeamIdx changes
  useEffect(() => {
    if (isOpen) {
      setActiveTabIdx(defaultTeamIdx)
    }
  }, [isOpen, defaultTeamIdx])

  if (!isOpen) return null

  const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

  const handlePlayerSelect = (playerId) => {
    onSelect(playerId)
    onClose()
  }

  const handleNoSelection = () => {
    onSelect(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="닫기"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Team Tabs */}
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
          <div className="flex gap-2 overflow-x-auto">
            {teams.map((team, idx) => {
              const isSameTeam = idx === defaultTeamIdx
              const isActive = idx === activeTabIdx
              
              return (
                <button
                  key={idx}
                  onClick={() => setActiveTabIdx(idx)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {team.name}
                  {isSameTeam && (
                    <span className={`ml-1.5 ${isActive ? 'opacity-90' : 'text-blue-600'}`}>
                      ⭐
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Player Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {teams.map((team, idx) => {
            if (idx !== activeTabIdx) return null

            const teamPlayers = team.players.filter(
              p => toStr(p.id) !== toStr(excludePlayerId)
            )

            if (teamPlayers.length === 0) {
              return (
                <div key={idx} className="text-center py-12 text-gray-500">
                  선택 가능한 선수가 없습니다
                </div>
              )
            }

            return (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {teamPlayers.map(player => {
                  const rec = draft[toStr(player.id)] || { goals: 0, assists: 0 }
                  const statValue = statLabel === 'G' ? rec.goals : rec.assists
                  
                  return (
                    <button
                      key={toStr(player.id)}
                      onClick={() => handlePlayerSelect(player.id)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-500 hover:bg-blue-50 hover:shadow-md transition-all group"
                    >
                      <InitialAvatar
                        playerId={player.id}
                        name={player.name}
                        photoUrl={player.photoUrl}
                        size={56}
                      />
                      <div className="text-center">
                        <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                          {player.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {statLabel}: {statValue}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3">
          {showNoSelectionOption && (
            <button
              onClick={handleNoSelection}
              className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold shadow-sm transition-all"
            >
              {noSelectionLabel}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlayerPickerModal
