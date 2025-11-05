import React, { useState, useEffect, useRef } from 'react'
import UpcomingMatchCard from './UpcomingMatchCard'
import { updateMatchStatus, convertToRegularMatch, filterExpiredMatches } from '../lib/upcomingMatch'

export default function UpcomingMatchesWidget({
  upcomingMatches = [],
  players = [],
  matches = [],
  isAdmin = false,
  onDeleteUpcomingMatch,
  onUpdateUpcomingMatch
}) {
  const [isMinimized, setIsMinimized] = useState(true)
  const [hasBounced, setHasBounced] = useState(false)
  const [notificationCleared, setNotificationCleared] = useState(false)
  // Removed opening animation state
  
  // 실시간으로 만료된 매치들을 필터링
  const activeMatches = filterExpiredMatches(upcomingMatches)
  
  // 만료된 매치가 있으면 자동으로 삭제
  useEffect(() => {
    if (activeMatches.length !== upcomingMatches.length && upcomingMatches.length > 0) {
      const expiredMatches = upcomingMatches.filter(match => 
        !activeMatches.find(active => active.id === match.id)
      )
      
      // 만료된 매치들을 자동으로 삭제
      expiredMatches.forEach(expiredMatch => {
        onDeleteUpcomingMatch?.(expiredMatch.id)
      })
    }
  }, [upcomingMatches, activeMatches, onDeleteUpcomingMatch])

  if (activeMatches.length === 0) {
    return null
  }

  // Handle open animation
  // Removed opening animation effect

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        right: isMinimized ? '12px' : 'auto',
        left: isMinimized ? 'auto' : '50%',
        zIndex: 50,
        width: isMinimized ? '48px' : 'min(300px, calc(100vw - 24px))',
        height: isMinimized ? '48px' : 'auto',
        maxWidth: isMinimized ? 'none' : '90vw',
        backgroundColor: isMinimized ? '#1f2937' : 'white',
        borderRadius: isMinimized ? '50%' : '12px',
        boxShadow: isMinimized 
          ? '0 8px 24px rgba(31, 41, 55, 0.2)' 
          : '0 10px 25px rgba(0, 0, 0, 0.15)',
        border: isMinimized ? 'none' : '1px solid #e5e7eb',
        overflow: isMinimized ? 'visible' : 'hidden',
        transition: isMinimized ? 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
        cursor: isMinimized ? 'pointer' : 'default',
        ...(isMinimized
          ? {}
          : { left: '50%', transform: 'translateX(-50%)' })
      }}
  onClick={isMinimized ? () => { setIsMinimized(false); setHasBounced(true); setNotificationCleared(true); } : undefined}
      onMouseEnter={(e) => {
        if (isMinimized) {
          e.currentTarget.style.transform = 'scale(1.05)'
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(31, 41, 55, 0.3)'
        }
      }}
      onMouseLeave={(e) => {
        if (isMinimized) {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(31, 41, 55, 0.2)'
        }
      }}
    >
      {/* Opening animation style removed */}
      {isMinimized ? (
        // 최소화된 동그란 아이콘 상태 (bouncy until clicked once)
        <div 
          className={!hasBounced ? "sfm-bouncy-icon" : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            position: 'relative'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{color: 'white'}}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2"/>
            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2"/>
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="16" r="2" fill="currentColor"/>
          </svg>
          {!notificationCleared && activeMatches.length > 0 && (
            <div 
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                width: '20px',
                height: '20px',
                backgroundColor: '#ef4444',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                color: 'white',
                fontWeight: '700',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                zIndex: 10
              }}
            >
              {activeMatches.length > 9 ? '9+' : activeMatches.length}
            </div>
          )}
          <style>{`
            @keyframes sfm-bounce {
              0%, 100% { transform: scale(1); }
              10% { transform: scale(1.08, 0.92); }
              20% { transform: scale(0.96, 1.04); }
              30% { transform: scale(1.04, 0.98); }
              40% { transform: scale(0.98, 1.02); }
              50% { transform: scale(1.02, 0.98); }
              60% { transform: scale(0.98, 1.01); }
              70% { transform: scale(1.01, 0.99); }
              80% { transform: scale(0.99, 1.01); }
              90% { transform: scale(1.01, 0.99); }
            }
            .sfm-bouncy-icon {
              animation: sfm-bounce 1.2s infinite cubic-bezier(.68,-0.55,.27,1.55);
            }
          `}</style>
        </div>
      ) : (
        // 펼쳐진 상태의 헤더
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
            borderBottom: '1px solid #f3f4f6',
            backgroundColor: 'white'
          }}
        >
          <h3 
            style={{
              fontWeight: '600',
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              margin: 0
            }}
          >
            <span style={{
              display: 'inline-flex',
              opacity: isMinimized ? 0 : 1,
              transition: 'opacity 0.5s cubic-bezier(0.4,0,0.2,1)'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{color: '#111', display: 'block'}}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2"/>
                <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2"/>
                <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="16" r="2" fill="currentColor"/>
              </svg>
            </span>
            <span>예정된 매치</span>
          </h3>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <span 
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                borderRadius: '6px',
                fontWeight: '500',
                backgroundColor: '#dbeafe',
                color: '#1d4ed8'
              }}
            >
              {activeMatches.length}개
            </span>
            <button
              onClick={() => setIsMinimized(true)}
              style={{
                padding: '4px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#6b7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s ease'
              }}
              title="최소화"
              onMouseEnter={(e) => e.target.style.color = '#374151'}
              onMouseLeave={(e) => e.target.style.color = '#6b7280'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9"></polyline>
              </svg>
            </button>
          </div>
        </div>
      )}

      {!isMinimized && (
        <div 
          style={{
            maxHeight: '384px',
            overflowY: 'auto',
            padding: '12px'
          }}
        >
          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            {activeMatches.map(upcomingMatch => (
              <UpcomingMatchCard
                key={upcomingMatch.id}
                upcomingMatch={upcomingMatch}
                players={players}
                matches={matches}
                isAdmin={isAdmin}
                onEdit={(match) => {
                  // Edit functionality
                }}
                onDelete={(match) => {
                  if (window.confirm('정말로 이 예정된 매치를 삭제하시겠습니까?')) {
                    onDeleteUpcomingMatch?.(match.id)
                  }
                }}
                onStartDraft={(match) => {
                  const updatedMatch = updateMatchStatus(match, 'drafting')
                  onUpdateUpcomingMatch?.(match.id, updatedMatch)
                }}
                onCreateMatch={(match) => {
                  const regularMatch = convertToRegularMatch(match)
                  alert('매치 생성 기능은 MatchPlanner에서 "불러오기" 버튼을 사용하세요!')
                }}
                onUpdateCaptains={(match, updatedMatch) => {
                  // updatedMatch에 captainIds가 포함되어 있음
                  onUpdateUpcomingMatch?.(match.id, updatedMatch)
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
