// src/components/UpcomingMatchCard.jsx
import React, { useMemo, useState } from 'react'
import InitialAvatar from './InitialAvatar'
import { getMatchStatus } from '../lib/upcomingMatch'
import { computeCaptainStatsRows } from '../lib/leaderboardComputations'

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

const StatusBadge = ({ status, isDraftMode = false, isDraftComplete = false }) => {
  // 사파리 호환성을 위해 인라인 스타일 사용
  const getStatusStyle = (status, isDraftMode, isDraftComplete) => {
    // 드래프트 모드에서 완료 상태
    if (isDraftMode && isDraftComplete) {
      return {
        backgroundColor: '#d1fae5',
        color: '#059669',
        borderColor: '#6ee7b7'
      }
    }
    
    // 드래프트 모드이고 upcoming일 때는 drafting 스타일 사용
    if (isDraftMode && status === 'upcoming') {
      return {
        backgroundColor: '#fef3c7',
        color: '#d97706',
        borderColor: '#fcd34d'
      }
    }
    
    switch(status) {
      case 'drafting':
        return {
          backgroundColor: '#fef3c7',
          color: '#d97706',
          borderColor: '#fcd34d'
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
  
  const getLabel = (status, isDraftMode, isDraftComplete) => {
    if (isDraftMode && isDraftComplete) {
      return 'Draft Complete'
    }
    
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
  
  const statusStyle = getStatusStyle(status, isDraftMode, isDraftComplete)
  const label = getLabel(status, isDraftMode, isDraftComplete)
  const showAnimation = (status === 'drafting' || (isDraftMode && status === 'upcoming' && !isDraftComplete))
  
  return (
    <span 
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all duration-200 ${showAnimation ? 'draft-progress-badge-enhanced' : ''}`}
      style={{
        ...statusStyle,
        ...(showAnimation && {
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 0 12px rgba(217, 119, 6, 0.5), 0 0 24px rgba(217, 119, 6, 0.2)',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)',
          backgroundSize: '200% 100%'
        })
      }}
    >

      
      <span style={{zIndex: 1, position: 'relative', fontWeight: '600'}}>{label}</span>
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
    isDraftMode,
    isDraftComplete = false
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
          <StatusBadge status={matchStatus} isDraftMode={isDraftMode} isDraftComplete={isDraftComplete} />
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
        {(() => {
          // captainIds 또는 captains 둘 중 하나라도 있으면 주장이 선택된 것으로 간주
          const captainIds = upcomingMatch.captainIds || []
          const captains = upcomingMatch.captains || []
          const teamCount = upcomingMatch.teamCount || 2
          
          // captainIds가 있으면 players에서 찾아서 captain 객체 생성
          let captainObjects = []
          
          // captainIds 우선 사용
          if (captainIds.length >= teamCount) {
            captainObjects = captainIds
              .slice(0, teamCount)
              .map(id => players.find(p => p.id === id))
              .filter(Boolean)
          } 
          // captainIds가 없으면 captains 배열 사용
          else if (captains.length >= teamCount) {
            captainObjects = captains.slice(0, teamCount)
          }
          
          // 주장이 충분히 선택된 경우
          if (captainObjects.length >= teamCount) {
            return (
              <CaptainVsDisplay 
                captains={captainObjects}
                players={players}
                matches={matches}
                teamCount={teamCount}
              />
            )
          }
          
          // Admin이면 주장 선택 UI 표시
          if (isAdmin) {
            return (
              <CaptainSelector 
                attendees={attendees}
                currentCaptainIds={captainIds}
                upcomingMatch={upcomingMatch}
                players={players}
                onUpdateCaptains={(newCaptainIds) => {
                  // captainIds 형태로 저장
                  const updated = { ...upcomingMatch, captainIds: newCaptainIds }
                  onUpdateCaptains?.(upcomingMatch, updated)
                }}
              />
            )
          }
          
          // 일반 사용자이고 주장이 선택되지 않은 경우
          return (
            <div style={{textAlign: 'center', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px'}}>
              <span style={{fontSize: '12px', color: '#6b7280'}}>주장 선택 대기중</span>
            </div>
          )
        })()}
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
        
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        

        
        @keyframes draftProgressPulse {
          0%, 100% {
            box-shadow: 0 0 12px rgba(217, 119, 6, 0.5), 0 0 24px rgba(217, 119, 6, 0.2);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 20px rgba(217, 119, 6, 0.7), 0 0 40px rgba(217, 119, 6, 0.3);
            transform: scale(1.05);
          }
        }
        
        @keyframes backgroundShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        .draft-progress-badge-enhanced {
          animation: 
            draftProgressPulse 2s infinite ease-in-out,
            backgroundShift 3s infinite ease-in-out;
          will-change: transform, box-shadow, background-position;
        }
        
        .animate-spin {
          animation: spin 2s linear infinite;
        }
        
        /* 부드러운 전환 효과 */
        .transition-all {
          transition: all 0.2s ease;
        }
        
        .duration-200 {
          transition-duration: 200ms;
        }
        
        /* 모바일 최적화 */
        @media (max-width: 640px) {
          .draft-progress-badge-enhanced {
            font-size: 10px !important;
            padding: 4px 10px !important;
            gap: 4px !important;
          }
          
          .draft-progress-badge-enhanced svg {
            width: 8px !important;
            height: 8px !important;
          }
        }
        
        /* 다크모드 대응 */
        @media (prefers-color-scheme: dark) {
          .draft-progress-badge-enhanced {
            box-shadow: 0 0 15px rgba(245, 158, 11, 0.4), 0 0 30px rgba(245, 158, 11, 0.2) !important;
          }
        }
        
        /* 접근성 - 애니메이션 감소 선호 사용자 */
        @media (prefers-reduced-motion: reduce) {
          .draft-progress-badge-enhanced {
            animation: none !important;
          }
          
          .draft-progress-badge-enhanced::before,
          .draft-progress-badge-enhanced::after {
            animation: none !important;
          }
          
          .animate-spin {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}

// 주장 대결 표시 컴포넌트
function CaptainVsDisplay({ captains, players, matches = [], teamCount = 2 }) {
  // 개선된 주장 통계 데이터 계산
  const captainStats = useMemo(() => {
    const captainStatsRows = computeCaptainStatsRows(players, matches)
    const statsMap = new Map()
    
    captainStatsRows.forEach(row => {
      statsMap.set(row.id, {
        wins: row.wins || 0,
        draws: row.draws || 0,
        losses: row.losses || 0,
        totalGames: row.totalGames || 0,
        points: row.points || 0,
        winRate: row.winRate || 0,
        last5: row.last5 || []
      })
    })
    
    return statsMap
  }, [players, matches])

  const getCaptainStats = (captainId) => {
    return captainStats.get(captainId) || {
      wins: 0,
      draws: 0,
      losses: 0,
      totalGames: 0,
      points: 0,
      winRate: 0,
      last5: []
    }
  }

  // 3팀 이상일 때는 리스트 형태로 표시
  if (teamCount > 2 || captains.length > 2) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px'}}>
        <div style={{fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'center', marginBottom: '4px'}}>
          주장 전적 ({captains.length}팀)
        </div>
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${Math.min(captains.length, 3)}, 1fr)`, gap: '8px'}}>
          {captains.map((captain, idx) => {
            const stats = getCaptainStats(captain.id)
            return (
              <div key={captain.id} style={{textAlign: 'center', padding: '8px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb'}}>
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginBottom: '4px'}}>
                  <InitialAvatar 
                    id={captain.id} 
                    name={captain.name} 
                    size={28}
                  />
                  <span style={{fontSize: '11px', fontWeight: '700', color: '#1f2937'}}>팀{idx + 1}: {captain.name}</span>
                </div>
                
                {/* 전적 */}
                <div style={{fontSize: '9px', color: '#6b7280', marginBottom: '3px'}}>
                  {stats.totalGames > 0 ? `${stats.wins}승 ${stats.draws}무 ${stats.losses}패` : '전적 없음'}
                </div>
                
                {/* Recent Form */}
                <div style={{display: 'flex', justifyContent: 'center', gap: '1px'}}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const result = stats.last5[stats.last5.length - 5 + i]
                    return (
                      <span 
                        key={i}
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '2px',
                          backgroundColor: result === 'W' ? '#10b981' : result === 'D' ? '#f59e0b' : result === 'L' ? '#ef4444' : '#e5e7eb',
                          color: result ? 'white' : '#9ca3af',
                          fontSize: '7px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700'
                        }}
                      >
                        {result || '-'}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 2팀일 때는 기존 VS 형태로 표시
  const captain1Stats = getCaptainStats(captains[0].id)
  const captain2Stats = getCaptainStats(captains[1].id)

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
      {/* 주장 전적 비교 */}
      <div style={{display: 'flex', gap: '8px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px'}}>
        {/* 주장 1 */}
        <div style={{flex: 1, textAlign: 'center'}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginBottom: '6px'}}>
            <InitialAvatar 
              id={captains[0].id} 
              name={captains[0].name} 
              size={32}
            />
            <span style={{fontSize: '13px', fontWeight: '700', color: '#1f2937'}}>{captains[0].name}</span>
          </div>
          
          {/* 전적 */}
          <div style={{fontSize: '10px', color: '#6b7280', marginBottom: '4px'}}>
            {captain1Stats.totalGames > 0 ? `${captain1Stats.wins}승 ${captain1Stats.draws}무 ${captain1Stats.losses}패` : '전적 없음'}
          </div>
          
          {/* Recent Form */}
          <div style={{fontSize: '9px', color: '#6b7280', marginBottom: '3px'}}>Recent Form</div>
          <div style={{display: 'flex', justifyContent: 'center', gap: '2px'}}>
            {Array.from({ length: 5 }, (_, i) => {
              const result = captain1Stats.last5[captain1Stats.last5.length - 5 + i]
              return (
                <span 
                  key={i}
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    backgroundColor: result === 'W' ? '#10b981' : result === 'D' ? '#f59e0b' : result === 'L' ? '#ef4444' : '#e5e7eb',
                    color: result ? 'white' : '#9ca3af',
                    fontSize: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700'
                  }}
                >
                  {result || '-'}
                </span>
              )
            })}
          </div>
        </div>
        
        {/* VS 중앙 */}
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '60px'}}>
          <div 
            className="vs-badge"
            style={{
              fontSize: '16px', 
              fontWeight: '900', 
              color: '#dc2626',
              textShadow: '0 2px 4px rgba(0,0,0,0.1)',
              padding: '6px 10px',
              backgroundColor: '#fef2f2',
              borderRadius: '6px',
              border: '2px solid #fecaca',
              animation: 'pulse 2s infinite'
            }}
          >
            VS
          </div>
          
          {/* 승률 비교 (작은 텍스트) */}
          {captain1Stats.totalGames > 0 && captain2Stats.totalGames > 0 && (
            <div style={{fontSize: '9px', color: '#6b7280', marginTop: '4px', textAlign: 'center'}}>
              {captain1Stats.winRate}% vs {captain2Stats.winRate}%
            </div>
          )}
        </div>
        
        {/* 주장 2 */}
        <div style={{flex: 1, textAlign: 'center'}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginBottom: '6px'}}>
            <InitialAvatar 
              id={captains[1].id} 
              name={captains[1].name} 
              size={32}
            />
            <span style={{fontSize: '13px', fontWeight: '700', color: '#1f2937'}}>{captains[1].name}</span>
          </div>
          
          {/* 전적 */}
          <div style={{fontSize: '10px', color: '#6b7280', marginBottom: '4px'}}>
            {captain2Stats.totalGames > 0 ? `${captain2Stats.wins}승 ${captain2Stats.draws}무 ${captain2Stats.losses}패` : '전적 없음'}
          </div>
          
          {/* Recent Form */}
          <div style={{fontSize: '9px', color: '#6b7280', marginBottom: '3px'}}>Recent Form</div>
          <div style={{display: 'flex', justifyContent: 'center', gap: '2px'}}>
            {Array.from({ length: 5 }, (_, i) => {
              const result = captain2Stats.last5[captain2Stats.last5.length - 5 + i]
              return (
                <span 
                  key={i}
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    backgroundColor: result === 'W' ? '#10b981' : result === 'D' ? '#f59e0b' : result === 'L' ? '#ef4444' : '#e5e7eb',
                    color: result ? 'white' : '#9ca3af',
                    fontSize: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700'
                  }}
                >
                  {result || '-'}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// 주장 선택 컴포넌트
function CaptainSelector({ attendees, currentCaptainIds = [], onUpdateCaptains, upcomingMatch, players }) {
  // 팀 수 확인 (snapshot 또는 teamCount 기반)
  const teamCount = upcomingMatch.teamCount || (upcomingMatch.snapshot?.length || 2)
  
  // 각 팀의 주장 ID를 배열로 관리
  const [captainIds, setCaptainIds] = useState(() => {
    const initial = Array(teamCount).fill('')
    currentCaptainIds.forEach((id, idx) => {
      if (idx < teamCount) initial[idx] = id || ''
    })
    return initial
  })

  // snapshot이 있으면 팀별로 선수 분류
  const teamPlayers = useMemo(() => {
    if (!upcomingMatch.snapshot || upcomingMatch.snapshot.length < teamCount) {
      // snapshot이 없으면 모든 참가자를 모든 팀에서 선택 가능하게
      return Array(teamCount).fill(attendees)
    }

    const playersByIds = new Map(players.map(p => [p.id, p]))
    
    return upcomingMatch.snapshot.map(teamIds => 
      (teamIds || []).map(id => playersByIds.get(id)).filter(Boolean)
    )
  }, [upcomingMatch.snapshot, players, attendees, teamCount])

  const handleUpdate = () => {
    // 모든 주장이 선택되었고 중복이 없는지 확인
    const validCaptains = captainIds.filter(Boolean)
    const uniqueCaptains = new Set(validCaptains)
    
    if (validCaptains.length === teamCount && uniqueCaptains.size === teamCount) {
      onUpdateCaptains(captainIds)
    }
  }

  const updateCaptain = (teamIndex, playerId) => {
    const newCaptains = [...captainIds]
    newCaptains[teamIndex] = playerId
    setCaptainIds(newCaptains)
  }

  // snapshot이 있는 경우 팀별 레이블 표시
  const hasTeamData = upcomingMatch.snapshot && upcomingMatch.snapshot.length >= teamCount

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <div style={{fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'center'}}>
        주장 선택 ({teamCount}팀)
      </div>
      <div style={{display: 'grid', gridTemplateColumns: `repeat(${Math.min(teamCount, 3)}, 1fr)`, gap: '8px'}}>
        {Array.from({ length: teamCount }).map((_, teamIdx) => (
          <div key={teamIdx} style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            {hasTeamData && (
              <div style={{fontSize: '10px', color: '#6b7280', fontWeight: '500'}}>
                팀 {teamIdx + 1} 주장
              </div>
            )}
            <select
              value={captainIds[teamIdx]}
              onChange={(e) => updateCaptain(teamIdx, e.target.value)}
              style={{
                width: '100%',
                padding: '4px 6px',
                fontSize: '11px',
                borderRadius: '4px',
                border: '1px solid #d1d5db'
              }}
            >
              <option value="">선택...</option>
              {(teamPlayers[teamIdx] || attendees).map(player => (
                <option 
                  key={player.id} 
                  value={player.id} 
                  disabled={captainIds.some((id, idx) => idx !== teamIdx && id === player.id)}
                >
                  {player.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {captainIds.filter(Boolean).length === teamCount && new Set(captainIds).size === teamCount && (
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
      {!hasTeamData && (
        <div style={{fontSize: '10px', color: '#9ca3af', textAlign: 'center', marginTop: '4px'}}>
          💡 팀 배정 후 주장을 선택하세요
        </div>
      )}
    </div>
  )
}