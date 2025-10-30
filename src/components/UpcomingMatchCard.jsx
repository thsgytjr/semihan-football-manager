// src/components/UpcomingMatchCard.jsx
import React, { useMemo, useState } from 'react'
import InitialAvatar from './InitialAvatar'
import { getMatchStatus } from '../lib/upcomingMatch'
import { computeCaptainWinsRows } from '../lib/leaderboardComputations'

const formatDateDisplay = (dateISO) => {
  if (!dateISO) return ''
  
  try {
    const date = new Date(dateISO)
    const now = new Date()
    
    // 같은 날인지 확인
    const isToday = date.toDateString() === now.toDateString()
    
    // 내일인지 확인
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const isTomorrow = date.toDateString() === tomorrow.toDateString()
    
    // 시간 표시
    const timeStr = date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    })
    
    // 날짜 표시
    const monthDay = date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric'
    })
    
    // 요일 표시
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    const dayName = dayNames[date.getDay()]
    
    if (isToday) {
      return `오늘 (${monthDay}) ${timeStr}`
    }
    
    if (isTomorrow) {
      return `내일 (${monthDay}) ${timeStr}`
    }
    
    // 이번 주인지 확인 (7일 이내)
    const diffTime = date - now
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays <= 7 && diffDays > 0) {
      return `${monthDay} (${dayName}요일) ${timeStr}`
    }
    
    // 그 외에는 전체 날짜 표시
    return `${monthDay} (${dayName}요일) ${timeStr}`
    
  } catch (error) {
    return dateISO
  }
}

const getLocationDisplayName = (location) => {
  if (!location) return '미정'
  
  if (location.preset === 'coppell-west') {
    return 'Coppell Middle School - West'
  } else if (location.preset === 'indoor-soccer-zone') {
    return 'Indoor Soccer Zone'
  } else if (location.name) {
    return location.name
  }
  
  return '미정'
}

const StatusBadge = ({ status, isDraftMode = false }) => {
  // 사파리 호환성을 위해 인라인 스타일 사용
  const getStatusStyle = (status, isDraftMode) => {
    // 드래프트 모드이고 upcoming일 때는 drafting 스타일 사용
    if (isDraftMode && status === 'upcoming') {
      return {
        backgroundColor: '#fed7aa',
        color: '#c2410c',
        borderColor: '#fdba74'
      }
    }
    
    switch(status) {
      case 'drafting':
        return {
          backgroundColor: '#fed7aa',
          color: '#c2410c',
          borderColor: '#fdba74'
        }
      case 'completed':
        return {
          backgroundColor: '#dcfce7',
          color: '#166534',
          borderColor: '#bbf7d0'
        }
      default: // upcoming
        return {
          backgroundColor: '#dbeafe',
          color: '#1d4ed8',
          borderColor: '#93c5fd'
        }
    }
  }
  
  const getLabel = (status, isDraftMode) => {
    if (isDraftMode && status === 'upcoming') {
      return 'Draft in Progress'
    }
    
    switch(status) {
      case 'drafting':
        return 'Draft in Progress'
      case 'completed':
        return '완료'
      default:
        return 'Upcoming'
    }
  }
  
  const statusStyle = getStatusStyle(status, isDraftMode)
  const label = getLabel(status, isDraftMode)
  const showPulse = status === 'drafting' || (isDraftMode && status === 'upcoming')
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium border ${showPulse ? 'animate-pulse' : ''}`}
      style={statusStyle}
    >
      {showPulse && (
        <span 
          className="inline-block rounded-full animate-pulse"
          style={{ 
            width: '6px', 
            height: '6px', 
            backgroundColor: statusStyle.color 
          }}
        />
      )}
      <span>{label}</span>
    </span>
  )
}

export default function UpcomingMatchCard({ 
  upcomingMatch, 
  players, 
  matches = [], // 실제 매치 데이터 추가
  isAdmin, 
  onUpdateCaptains, 
  onStartDraft, 
  onCreateMatch, 
  onDeleteMatch 
}) {
  const {
    id,
    dateISO,
    location,
    mode,
    attendeeIds = [],
    participantIds = [],
    status,
    isDraftMode
  } = upcomingMatch
  
  const attendees = useMemo(() => {
    const ids = attendeeIds.length > 0 ? attendeeIds : participantIds
    return players.filter(p => ids.includes(p.id))
  }, [players, attendeeIds, participantIds])
  
  const matchStatus = getMatchStatus(upcomingMatch)
  
  const dateDisplay = formatDateDisplay(dateISO)
  const locationDisplay = getLocationDisplayName(location)
  
  const handleStartDraft = () => {
    if (onStartDraft) {
      onStartDraft(upcomingMatch)
    }
  }
  
  const handleCreateMatch = () => {
    if (onCreateMatch) {
      onCreateMatch(upcomingMatch)
    }
  }
  
  return (
    <div 
      className="group relative"
      style={{
        borderRadius: '8px',
        backgroundColor: '#f9fafb',
        padding: '12px',
        border: '1px solid #e5e7eb',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'white'
        e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#f9fafb'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* 헤더 - 상태와 관리 버튼 */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <StatusBadge status={matchStatus} isDraftMode={isDraftMode} />
        </div>
        
        {isAdmin && (
          <div 
            className="group-hover:opacity-100"
            style={{
              display: 'flex', 
              alignItems: 'center', 
              gap: '2px',
              opacity: 0,
              transition: 'opacity 0.2s ease'
            }}
          >
            {status === 'upcoming' && (
              <>
                <button
                  onClick={handleStartDraft}
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#ea580c',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                  title="드래프트 시작"
                >
                  ⚔️
                </button>
                <button
                  onClick={handleCreateMatch}
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#059669',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer'
                  }}
                  title="매치 생성"
                >
                  ⚽
                </button>
              </>
            )}
            <button
              onClick={() => onEdit?.(upcomingMatch)}
              style={{
                padding: '4px',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#6b7280',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer'
              }}
              title="편집"
            >
              ✏️
            </button>
            <button
              onClick={() => onDelete?.(upcomingMatch)}
              style={{
                padding: '4px',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#dc2626',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer'
              }}
              title="삭제"
            >
              🗑️
            </button>
          </div>
        )}
      </div>
      
      {/* 매치 정보 - 컴팩트 */}
      <div style={{display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px'}}>
        {/* 날짜 시간 */}
        <div style={{fontWeight: '500', color: '#111827'}}>
          {dateDisplay}
        </div>
        
        {/* 장소 */}
        <div style={{color: '#6b7280', fontSize: '11px'}}>
          {locationDisplay}
        </div>
      </div>
      
      {/* 주장 선택/대결 표시 */}
      <div style={{marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f3f4f6'}}>
        {upcomingMatch.captains && upcomingMatch.captains.length === 2 ? (
          // 주장이 선택된 경우 - VS 대결 구도 표시
          <CaptainVsDisplay 
            captains={upcomingMatch.captains}
            players={players}
            matches={matches}
          />
        ) : isAdmin ? (
          // 주장 선택 드롭다운 (Admin만)
          <CaptainSelector 
            attendees={attendees}
            currentCaptains={upcomingMatch.captains || []}
            onUpdateCaptains={(captains) => onUpdateCaptains?.(upcomingMatch, captains)}
          />
        ) : (
          // 주장 미선택 상태 표시
          <div style={{textAlign: 'center', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px'}}>
            <span style={{fontSize: '12px', color: '#6b7280'}}>주장 선택 대기중</span>
          </div>
        )}
      </div>

      {/* 참가자 */}
      {attendees.length > 0 && (
        <div style={{marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #f3f4f6'}}>
          <div style={{fontSize: '10px', color: '#6b7280', marginBottom: '4px'}}>
            {attendees.length}명 참가
          </div>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px'}}>
            {attendees.slice(0, 4).map(player => (
              <div 
                key={player.id} 
                style={{
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  borderRadius: '4px', 
                  padding: '2px 6px',
                  backgroundColor: '#f9fafb'
                }}
              >
                <InitialAvatar 
                  id={player.id} 
                  name={player.name} 
                  size={10}
                  badges={player.membership === 'guest' ? ['G'] : []}
                />
                <span style={{fontSize: '10px', color: '#374151'}}>{player.name}</span>
              </div>
            ))}
            {attendees.length > 4 && (
              <span style={{fontSize: '12px', color: '#6b7280', padding: '2px 6px'}}>+{attendees.length - 4}</span>
            )}
          </div>
        </div>
      )}
      
      {/* 빈 상태 */}
      {attendees.length === 0 && (
        <div style={{marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f3f4f6', textAlign: 'center'}}>
          <div style={{fontSize: '12px', color: '#6b7280'}}>참가자 없음</div>
        </div>
      )}
      
      {/* CSS 스타일 */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
        
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        
        @keyframes draftingPulse {
          0%, 100% {
            background-color: #f97316 !important;
            box-shadow: 0 0 12px rgba(249, 115, 22, 0.8) !important;
            transform: scale(1);
          }
          25% {
            background-color: #ea580c !important;
            box-shadow: 0 0 16px rgba(234, 88, 12, 0.9) !important;
            transform: scale(1.02);
          }
          50% {
            background-color: #dc2626 !important;
            box-shadow: 0 0 20px rgba(220, 38, 38, 1) !important;
            transform: scale(1.04);
          }
          75% {
            background-color: #ea580c !important;
            box-shadow: 0 0 16px rgba(234, 88, 12, 0.9) !important;
            transform: scale(1.02);
          }
        }
        
        .drafting-badge {
          animation: draftingPulse 1.5s infinite ease-in-out !important;
          will-change: background-color, box-shadow, transform !important;
        }
        
        .drafting-icon {
          animation: spin 1.5s linear infinite !important;
        }
        
        @keyframes draftModeGlow {
          0%, 100% {
            background-color: #fbbf24;
            box-shadow: 0 0 5px rgba(251, 191, 36, 0.4);
          }
          50% {
            background-color: #f59e0b;
            box-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
          }
        }
        
        .draft-mode-badge {
          animation: draftModeGlow 3s infinite ease-in-out !important;
        }
        
        /* 모바일 최적화 */
        @media (max-width: 640px) {
          .drafting-badge {
            font-size: 9px !important;
            padding: 2px 4px !important;
            gap: 2px !important;
          }
        }
      `}</style>
    </div>
  )
}

// 주장 대결 표시 컴포넌트
function CaptainVsDisplay({ captains, players, matches = [] }) {
  // 실제 드래프트 주장 승점 데이터에서 통계 계산
  const captainStats = useMemo(() => {
    const captainWinsRows = computeCaptainWinsRows(players, matches)
    const statsMap = new Map()
    
    captainWinsRows.forEach(row => {
      const last5 = row.last5 || []
      const wins = last5.filter(result => result === 'W').length
      const totalGames = last5.length
      const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0
      
      statsMap.set(row.id, {
        totalWins: row.wins || 0,
        last5: last5,
        recentWins: wins,
        recentGames: totalGames,
        winRate: winRate
      })
    })
    
    return statsMap
  }, [players, matches])

  const getCaptainStats = (captainId) => {
    return captainStats.get(captainId) || {
      totalWins: 0,
      last5: [],
      recentWins: 0,
      recentGames: 0,
      winRate: 0
    }
  }

  const captain1Stats = getCaptainStats(captains[0].id)
  const captain2Stats = getCaptainStats(captains[1].id)

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
      {/* VS 대결 구도 */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}}>
          <InitialAvatar 
            id={captains[0].id} 
            name={captains[0].name} 
            size={28}
          />
          <span style={{fontSize: '12px', fontWeight: '700', color: '#1f2937'}}>{captains[0].name}</span>
        </div>
        <div 
          className="vs-badge"
          style={{
            fontSize: '18px', 
            fontWeight: '900', 
            color: '#dc2626',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            borderRadius: '8px',
            border: '2px solid #fecaca',
            animation: 'pulse 2s infinite'
          }}
        >
          VS
        </div>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}}>
          <InitialAvatar 
            id={captains[1].id} 
            name={captains[1].name} 
            size={28}
          />
          <span style={{fontSize: '12px', fontWeight: '700', color: '#1f2937'}}>{captains[1].name}</span>
        </div>
      </div>
      
      {/* 주장 전적 비교 */}
      <div style={{display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px'}}>
        <div style={{flex: 1, textAlign: 'center'}}>
          <div style={{fontSize: '10px', color: '#6b7280', marginBottom: '2px'}}>Recent Form</div>
          <div style={{display: 'flex', justifyContent: 'center', gap: '1px', marginBottom: '2px'}}>
            {Array.from({ length: 5 }, (_, i) => {
              const result = captain1Stats.last5[i]
              return (
                <span 
                  key={i}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    backgroundColor: result === 'W' ? '#10b981' : result === 'L' ? '#ef4444' : '#e5e7eb',
                    color: result ? 'white' : '#9ca3af',
                    fontSize: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '600'
                  }}
                >
                  {result || '-'}
                </span>
              )
            })}
          </div>
          <div style={{fontSize: '9px', color: '#374151', fontWeight: '600'}}>
            Total: {captain1Stats.totalWins}승
          </div>
        </div>
        
        <div style={{width: '1px', backgroundColor: '#e5e7eb'}}></div>
        
        <div style={{flex: 1, textAlign: 'center'}}>
          <div style={{fontSize: '10px', color: '#6b7280', marginBottom: '2px'}}>Recent Form</div>
          <div style={{display: 'flex', justifyContent: 'center', gap: '1px', marginBottom: '2px'}}>
            {Array.from({ length: 5 }, (_, i) => {
              const result = captain2Stats.last5[i]
              return (
                <span 
                  key={i}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    backgroundColor: result === 'W' ? '#10b981' : result === 'L' ? '#ef4444' : '#e5e7eb',
                    color: result ? 'white' : '#9ca3af',
                    fontSize: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '600'
                  }}
                >
                  {result || '-'}
                </span>
              )
            })}
          </div>
          <div style={{fontSize: '9px', color: '#374151', fontWeight: '600'}}>
            Total: {captain2Stats.totalWins}승
          </div>
        </div>
      </div>
    </div>
  )
}

// 주장 선택 컴포넌트
function CaptainSelector({ attendees, currentCaptains, onUpdateCaptains }) {
  const [captain1, setCaptain1] = useState(currentCaptains[0]?.id || '')
  const [captain2, setCaptain2] = useState(currentCaptains[1]?.id || '')

  const handleUpdate = () => {
    if (captain1 && captain2 && captain1 !== captain2) {
      const captains = [
        attendees.find(p => p.id === captain1),
        attendees.find(p => p.id === captain2)
      ].filter(Boolean)
      
      if (captains.length === 2) {
        onUpdateCaptains(captains)
      }
    }
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <div style={{fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'center'}}>
        주장 선택
      </div>
      <div style={{display: 'flex', gap: '8px'}}>
        <select
          value={captain1}
          onChange={(e) => setCaptain1(e.target.value)}
          style={{
            flex: 1,
            padding: '4px 6px',
            fontSize: '11px',
            borderRadius: '4px',
            border: '1px solid #d1d5db'
          }}
        >
          <option value="">주장 1 선택</option>
          {attendees.map(player => (
            <option key={player.id} value={player.id} disabled={player.id === captain2}>
              {player.name}
            </option>
          ))}
        </select>
        <select
          value={captain2}
          onChange={(e) => setCaptain2(e.target.value)}
          style={{
            flex: 1,
            padding: '4px 6px',
            fontSize: '11px',
            borderRadius: '4px',
            border: '1px solid #d1d5db'
          }}
        >
          <option value="">주장 2 선택</option>
          {attendees.map(player => (
            <option key={player.id} value={player.id} disabled={player.id === captain1}>
              {player.name}
            </option>
          ))}
        </select>
      </div>
      {captain1 && captain2 && captain1 !== captain2 && (
        <button
          onClick={handleUpdate}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          주장 설정
        </button>
      )}
    </div>
  )
}