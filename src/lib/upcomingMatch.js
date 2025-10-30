// src/lib/upcomingMatch.js
// Upcoming Match 관리를 위한 유틸리티

/**
 * Upcoming Match 생성
 * @param {Object} input - 매치 정보
 * @returns {Object} Upcoming Match 객체
 */
export function createUpcomingMatch(input = {}) {
  const {
    id,
    dateISO,
    location = { name: '', address: '' },
    mode = '7v7',
    attendeeIds = [],
    participantIds = [],
    status = 'upcoming', // 'upcoming' | 'drafting' | 'completed'
    createdAt = new Date().toISOString(),
    isDraftMode = false,
    captainIds = [],
    totalCost = 0
  } = input

  const ids = participantIds.length > 0 ? participantIds : attendeeIds

  return {
    id: id || crypto.randomUUID?.() || `upcoming_${Date.now()}`,
    type: 'upcoming', // 기존 매치와 구분하기 위한 타입
    dateISO,
    location,
    mode,
    attendeeIds: [...ids],
    participantIds: [...ids], // 호환성을 위해 두 필드 모두 포함
    status,
    createdAt,
    isDraftMode,
    totalCost,
    captainIds: [...captainIds],
    // 드래프트 관련 필드
    draftStartedAt: null,
    draftCompletedAt: null,
    teams: [], // 팀이 구성되면 여기에 저장
    snapshot: [] // 최종 팀 구성 스냅샷
  }
}

/**
 * Upcoming Match를 일반 매치로 변환 (팀 구성 완료 후)
 * @param {Object} upcomingMatch - Upcoming Match 객체
 * @returns {Object} 일반 매치 객체
 */
export function convertToRegularMatch(upcomingMatch) {
  const {
    id,
    dateISO,
    location,
    mode,
    attendeeIds,
    teams,
    snapshot,
    isDraftMode,
    captainIds
  } = upcomingMatch

  return {
    id,
    dateISO,
    attendeeIds,
    criterion: 'overall',
    teamCount: teams?.length || 2,
    location,
    mode,
    snapshot: snapshot.length > 0 ? snapshot : teams?.map(team => team.map(p => p.id)) || [],
    board: [],
    formations: [],
    selectionMode: isDraftMode ? 'draft' : 'manual',
    locked: true,
    videos: [],
    // 드래프트 매치인 경우 추가 필드
    ...(isDraftMode && {
      draft: true,
      draftMode: true,
      captainIds: captainIds || [],
      captains: captainIds || []
    })
  }
}

/**
 * 매치 상태 확인
 * @param {Object} match - 매치 객체 (upcoming 또는 regular)
 * @returns {string} 'upcoming' | 'drafting' | 'live' | 'completed'
 */
export function getMatchStatus(match) {
  const now = new Date()
  const matchTime = new Date(match.dateISO)
  
  // Upcoming Match 타입인 경우
  if (match.type === 'upcoming') {
    if (match.status === 'drafting') return 'drafting'
    if (match.status === 'completed') return 'completed'
    return 'upcoming'
  }
  
  // 일반 매치인 경우 (기존 로직)
  const hasStats = match.stats && Object.keys(match.stats).length > 0
  if (hasStats) return 'completed'
  
  const diffMs = matchTime - now
  const diffHours = diffMs / (1000 * 60 * 60)
  
  if (diffMs > 0) return 'upcoming'
  if (diffHours > -3) return 'live'
  
  return 'completed'
}

/**
 * Upcoming Match 상태 업데이트
 * @param {Object} upcomingMatch - Upcoming Match 객체
 * @param {string} newStatus - 새로운 상태
 * @returns {Object} 업데이트된 Upcoming Match 객체
 */
export function updateMatchStatus(upcomingMatch, newStatus) {
  const updated = { ...upcomingMatch, status: newStatus }
  
  if (newStatus === 'drafting' && !upcomingMatch.draftStartedAt) {
    updated.draftStartedAt = new Date().toISOString()
  }
  
  if (newStatus === 'completed' && !upcomingMatch.draftCompletedAt) {
    updated.draftCompletedAt = new Date().toISOString()
  }
  
  return updated
}

/**
 * 참가자 추가/제거
 * @param {Object} upcomingMatch - Upcoming Match 객체
 * @param {string} playerId - 선수 ID
 * @param {boolean} isAdding - true면 추가, false면 제거
 * @returns {Object} 업데이트된 Upcoming Match 객체
 */
export function toggleAttendee(upcomingMatch, playerId, isAdding = null) {
  const attendeeIds = [...upcomingMatch.attendeeIds]
  const index = attendeeIds.indexOf(playerId)
  
  if (isAdding === null) {
    // 토글 모드
    if (index >= 0) {
      attendeeIds.splice(index, 1)
    } else {
      attendeeIds.push(playerId)
    }
  } else if (isAdding && index < 0) {
    attendeeIds.push(playerId)
  } else if (!isAdding && index >= 0) {
    attendeeIds.splice(index, 1)
  }
  
  return {
    ...upcomingMatch,
    attendeeIds
  }
}

/**
 * 다음 토요일 오전 6:30 날짜 생성 (기존 MatchPlanner 로직과 동일)
 * @returns {string} ISO 형식 날짜 문자열
 */
export function getNextSaturday630() {
  const now = new Date()
  const date = new Date(now)
  const dayOfWeek = now.getDay()
  
  let daysToAdd = (6 - dayOfWeek + 7) % 7
  if (daysToAdd === 0) {
    const targetTime = new Date(now)
    targetTime.setHours(6, 30, 0, 0)
    if (now > targetTime) daysToAdd = 7
  }
  
  date.setDate(now.getDate() + daysToAdd)
  date.setHours(6, 30, 0, 0)
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day}T${hours}:${minutes}`
}