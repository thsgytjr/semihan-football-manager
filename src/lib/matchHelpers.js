// src/lib/matchHelpers.js
/**
 * Match 데이터 접근을 위한 헬퍼 함수들
 * 
 * 목적: 
 * - 드래프트 판별 로직 통일
 * - 레거시 데이터 구조와 새 구조 모두 지원
 * - 기존 코드를 망가뜨리지 않으면서 점진적 마이그레이션 가능
 * 
 * 사용법:
 * - 기존 코드: if (match.selectionMode === 'draft' || match.draftMode) { ... }
 * - 새 코드: if (MatchHelpers.isDraft(match)) { ... }
 */

/**
 * 매치가 드래프트 모드인지 판별
 * 
 * 체크 순서:
 * 1. selectionMode === 'draft' (가장 신뢰할 수 있는 기준)
 * 2. draftMode === true (레거시)
 * 3. draft.quarterScores 존재 여부 (실제 드래프트 데이터 확인)
 * 
 * @param {Object} match - 매치 객체
 * @returns {boolean} 드래프트 매치 여부
 */
export function isDraftMatch(match) {
  if (!match) return false
  
  // 1순위: selectionMode (가장 명확한 기준)
  if (match.selectionMode === 'draft') return true
  
  // 2순위: 레거시 draftMode 필드
  if (match.draftMode === true) return true
  
  // 3순위: 실제 드래프트 데이터 존재 여부 (드래프트 필드에 한정)
  if (match.draft?.quarterScores && Array.isArray(match.draft.quarterScores) && match.draft.quarterScores.length > 0) {
    // Check if it has actual quarter data, not just empty arrays
    const hasQuarterData = match.draft.quarterScores.some(q => Array.isArray(q) && q.length > 0)
    if (hasQuarterData) return true
  }

  // 레거시: snapshot(팀 배열) + quarterScores 조합만 드래프트로 인정
  const hasSnapshot = Array.isArray(match?.snapshot) && match.snapshot.every(Array.isArray)
  if (hasSnapshot && match.quarterScores && Array.isArray(match.quarterScores) && match.quarterScores.length > 0) {
    const hasQuarterData = match.quarterScores.some(q => Array.isArray(q) && q.length > 0)
    if (hasQuarterData) return true
  }
  
  return false
}

/**
 * 매치의 주장(Captain) ID 배열 가져오기
 * 
 * 우선순위:
 * 1. draft.captains (최신)
 * 2. captainIds (중간)
 * 3. captains (레거시)
 * 
 * @param {Object} match - 매치 객체
 * @returns {Array<string>} 주장 ID 배열 (팀 수만큼)
 */
export function getCaptains(match) {
  if (!match) return []
  
  // 1순위: draft.captains
  if (match.draft?.captains && Array.isArray(match.draft.captains)) {
    return match.draft.captains.map(String)
  }
  
  // 2순위: captainIds
  if (match.captainIds && Array.isArray(match.captainIds)) {
    return match.captainIds.map(String)
  }
  
  // 3순위: captains
  if (match.captains && Array.isArray(match.captains)) {
    return match.captains.map(String)
  }
  
  return []
}

/**
 * 특정 팀의 주장 ID 가져오기
 * 
 * @param {Object} match - 매치 객체
 * @param {number} teamIndex - 팀 인덱스 (0부터 시작)
 * @returns {string|null} 주장 선수 ID
 */
export function getCaptainForTeam(match, teamIndex) {
  const captains = getCaptains(match)
  if (teamIndex < 0 || teamIndex >= captains.length) return null
  return captains[teamIndex] || null
}

/**
 * 매치에 주장이 지정되어 있는지 확인
 * 
 * @param {Object} match - 매치 객체
 * @returns {boolean} 주장 존재 여부
 */
export function hasCaptains(match) {
  const captains = getCaptains(match)
  return captains.length > 0 && captains.some(c => c != null && c !== '')
}

/**
 * 매치의 쿼터 점수 가져오기
 * 
 * 우선순위:
 * 1. draft.quarterScores
 * 2. quarterScores (레거시)
 * 3. scores를 쿼터 형식으로 변환
 * 
 * @param {Object} match - 매치 객체
 * @returns {Array<Array<number>>} 쿼터별 점수 [[team1_q1, team2_q1], [team1_q2, team2_q2], ...]
 */
export function getQuarterScores(match) {
  if (!match) return []
  
  // 1순위: draft.quarterScores
  if (match.draft?.quarterScores && Array.isArray(match.draft.quarterScores)) {
    return match.draft.quarterScores
  }
  
  // 2순위: quarterScores (레거시)
  if (match.quarterScores && Array.isArray(match.quarterScores)) {
    // 이미 2차원 배열인 경우
    if (match.quarterScores.length > 0 && Array.isArray(match.quarterScores[0])) {
      return match.quarterScores
    }
    // { teamScores: [...] } 형식인 경우
    if (match.quarterScores[0]?.teamScores) {
      return match.quarterScores.map(q => q.teamScores)
    }
  }

  // 2.5순위: referee __games를 팀-기준 점수 배열로 변환
  if (Array.isArray(match?.stats?.__games) && match.stats.__games.length > 0) {
    const teamCount = match.stats.__games.reduce((max, g) => {
      const len = Array.isArray(g?.scores) ? g.scores.length : 0
      return Math.max(max, len)
    }, Array.isArray(match?.teams) ? match.teams.length : 0)

    if (teamCount > 0) {
      const teamMajor = Array.from({ length: teamCount }, () => [])
      match.stats.__games.forEach(g => {
        if (!Array.isArray(g?.scores)) return
        g.scores.forEach((val, idx) => {
          if (!teamMajor[idx]) teamMajor[idx] = []
          teamMajor[idx].push(Number(val) || 0)
        })
      })
      if (teamMajor.some(arr => arr.length > 0)) return teamMajor
    }
  }

  // 2.6순위: 간단 합산 점수 (__scores)
  if (Array.isArray(match?.stats?.__scores) && match.stats.__scores.length > 0) {
    return match.stats.__scores.map(v => [Number(v) || 0])
  }
  
  // 3순위: scores를 단일 쿼터로 변환
  if (match.scores && Array.isArray(match.scores)) {
    return [match.scores]
  }
  
  return []
}

/**
 * 매치에 쿼터 점수가 있는지 확인
 * 
 * @param {Object} match - 매치 객체
 * @returns {boolean} 쿼터 점수 존재 여부
 */
export function hasQuarterScores(match) {
  const quarterScores = getQuarterScores(match)
  return quarterScores.length > 0
}

/**
 * 쿼터 점수에서 승자 팀 인덱스 찾기
 * 
 * @param {Array<Array<number>>} quarterScores - 쿼터별 점수
 * @returns {number|null} 승자 팀 인덱스 (무승부면 null)
 */
export function getWinnerIndex(quarterScores) {
  if (!quarterScores || quarterScores.length === 0) return null
  
  // 각 팀의 총점 계산
  const totals = []
  for (const quarter of quarterScores) {
    if (!Array.isArray(quarter)) continue
    quarter.forEach((score, teamIdx) => {
      totals[teamIdx] = (totals[teamIdx] || 0) + (Number(score) || 0)
    })
  }
  
  if (totals.length === 0) return null
  
  // 최고점 찾기
  const maxScore = Math.max(...totals)
  const winners = totals.map((s, i) => s === maxScore ? i : -1).filter(i => i >= 0)
  
  // 동점이면 null
  if (winners.length > 1) return null
  
  return winners[0]
}

/**
 * 매치의 승자 팀 인덱스 가져오기
 * 
 * @param {Object} match - 매치 객체
 * @returns {number|null} 승자 팀 인덱스 (무승부면 null)
 */
export function getMatchWinner(match) {
  const quarterScores = getQuarterScores(match)
  return getWinnerIndex(quarterScores)
}

/**
 * 선수가 특정 매치의 승자 팀에 속했는지 확인
 * 
 * @param {Object} match - 매치 객체
 * @param {string} playerId - 선수 ID
 * @returns {boolean} 승자 팀 소속 여부
 */
export function isPlayerOnWinningTeam(match, playerId) {
  if (!match || !playerId) return false
  
  const winnerIdx = getMatchWinner(match)
  if (winnerIdx === null) return false
  
  // 스냅샷에서 팀 찾기
  const snapshot = match.snapshot || []
  if (winnerIdx >= snapshot.length) return false
  
  const winningTeam = snapshot[winnerIdx] || []
  return winningTeam.some(id => String(id) === String(playerId))
}

/**
 * 선수가 특정 매치의 주장이었는지 확인
 * 
 * @param {Object} match - 매치 객체
 * @param {string} playerId - 선수 ID
 * @returns {boolean} 주장 여부
 */
export function isPlayerCaptain(match, playerId) {
  if (!match || !playerId) return false
  
  const captains = getCaptains(match)
  return captains.some(capId => capId && String(capId) === String(playerId))
}

/**
 * 선수가 주장으로 승리했는지 확인
 * 
 * @param {Object} match - 매치 객체
 * @param {string} playerId - 선수 ID
 * @returns {boolean} 주장 승리 여부
 */
export function didCaptainWin(match, playerId) {
  return isPlayerCaptain(match, playerId) && isPlayerOnWinningTeam(match, playerId)
}

// 네임스페이스로 export (기존 코드와 호환성)
export const MatchHelpers = {
  isDraft: isDraftMatch,
  getCaptains,
  getCaptainForTeam,
  hasCaptains,
  getQuarterScores,
  hasQuarterScores,
  getWinnerIndex,
  getMatchWinner,
  isPlayerOnWinningTeam,
  isPlayerCaptain,
  didCaptainWin
}

export default MatchHelpers
