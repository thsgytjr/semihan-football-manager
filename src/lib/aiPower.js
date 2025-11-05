// src/lib/aiPower.js
import { overall, isUnknownPlayer } from './players'

/**
 * 선수의 AI Overall 계산 (팀 밸런스용 - 순수 실력 지표, 50-100 스케일)
 * @param {Object} player - 선수 객체
 * @param {Array} matches - 매치 기록 배열
 * @returns {number} AI Overall 점수 (50-100)
 */
export function calculateAIPower(player, matches) {
  // 1. 기본 OVR
  const baseOVR = isUnknownPlayer(player) ? 50 : (player.ovr ?? overall(player))
  
  // 2. 매치 기록에서 실적 계산
  const playerMatches = matches.filter(m => {
    const attendees = m.attendeeIds || m.snapshot?.flat() || []
    return attendees.includes(player.id) || attendees.some(a => String(a) === String(player.id))
  })
  
  const stats = {
    gamesPlayed: playerMatches.length,
    goals: 0,
    assists: 0,
    wins: 0,
    draws: 0,
    cleanSheets: 0, // 쿼터별 클린시트 (드래프트전)
    recentGames: [] // 최근 10경기
  }
  
  // 최근 경기 우선 정렬
  const sortedMatches = [...playerMatches].sort((a, b) => {
    const aDate = new Date(a.dateISO || a.date || a.created_at || 0)
    const bDate = new Date(b.dateISO || b.date || b.created_at || 0)
    return bDate - aDate
  })
  
  sortedMatches.forEach((match, idx) => {
    // 골/어시스트
    const playerStats = match.playerStats?.[player.id] || match.stats?.[player.id] || {}
    const goals = Number(playerStats.goals || 0)
    const assists = Number(playerStats.assists || 0)
    
    stats.goals += goals
    stats.assists += assists
    
    // 승/무 계산
    if (match.teams && match.score) {
      const playerTeamIdx = match.teams.findIndex(team => {
        const teamArray = Array.isArray(team) ? team : team.playerIds || []
        return teamArray.some(p => String(p?.id || p) === String(player.id))
      })
      
      if (playerTeamIdx >= 0 && match.score[playerTeamIdx] !== undefined) {
        const myScore = match.score[playerTeamIdx]
        const opponentScores = match.score.filter((_, i) => i !== playerTeamIdx)
        const maxOpponentScore = Math.max(...opponentScores, 0)
        
        if (myScore > maxOpponentScore) {
          stats.wins += 1
        } else if (myScore === maxOpponentScore) {
          stats.draws += 1
        }
        
        // 드래프트전 클린시트 계산 (쿼터별 무실점)
        // draft 객체에 실제 데이터가 있는지 확인
        const hasDraftData = match.draft && (
          (match.draft.quarterScores && match.draft.quarterScores.length > 0) ||
          (match.draft.captains && Object.keys(match.draft.captains).length > 0)
        )
        const isDraft = (match.selectionMode === 'draft') || hasDraftData || match.draftMode
        if (isDraft && match.quarterScores) {
          // quarterScores 구조 확인
          let quarterScores = match.quarterScores
          if (match.draft?.quarterScores) {
            quarterScores = match.draft.quarterScores
          }
          
          if (Array.isArray(quarterScores)) {
            // 각 쿼터별로 클린시트 체크
            quarterScores.forEach(quarterData => {
              let teamScores = quarterData
              
              // 중첩 배열 처리
              if (quarterData.teamScores) {
                teamScores = quarterData.teamScores
              }
              
              if (Array.isArray(teamScores) && teamScores[playerTeamIdx] !== undefined) {
                // 모든 상대팀 점수가 0이면 클린시트
                const opponentQuarterScores = teamScores.filter((_, i) => i !== playerTeamIdx)
                if (opponentQuarterScores.every(s => s === 0)) {
                  stats.cleanSheets += 1
                }
              }
            })
          }
        }
      }
    }
    
    // 최근 10경기 기록
    if (idx < 10) {
      stats.recentGames.push({ goals, assists })
    }
  })
  
  // 3. 순수 실력 계산 (밸런스용)
  let power = baseOVR * 10 // 기본 파워
  
  if (stats.gamesPlayed > 0) {
    // === 경기당 공격 포인트 (핵심 지표) ===
    const goalsPerGame = stats.goals / stats.gamesPlayed
    const assistsPerGame = stats.assists / stats.gamesPlayed
    
    // 포지션 고려 (positions 배열 또는 레거시 position 필드)
    const positions = player.positions || (player.position ? [player.position] : [])
    const positionsStr = positions.join(',').toUpperCase()
    
    let goalWeight = 2.0
    let assistWeight = 1.0
    
    // 포지션별 가중치 조정 (여러 포지션 중 하나라도 해당하면 적용)
    if (/FW|ST|CF|LW|RW/i.test(positionsStr)) {
      goalWeight = 2.5  // 공격수는 골 더 중요
      assistWeight = 1.0
    } else if (/MF|CAM|CDM|CM|LM|RM/i.test(positionsStr)) {
      goalWeight = 2.0
      assistWeight = 1.3 // 미드필더는 어시 중요
    } else if (/CB|LB|RB|DF|WB|RWB|LWB/i.test(positionsStr)) {
      goalWeight = 3.0  // 수비수 골은 희소가치
      assistWeight = 2.0
    }
    
    const attackScore = goalsPerGame * goalWeight + assistsPerGame * assistWeight
    power += attackScore * 50
    
    // === 승률 (팀 기여도) ===
    const winRate = stats.wins / stats.gamesPlayed
    const drawRate = stats.draws / stats.gamesPlayed
    
    // 수비 포지션에서 승리가 많으면 가중치 추가 (팀 기여도 높음)
    let winBonus = winRate * 150 + drawRate * 30
    if (/CB|LB|RB|DF|WB|RWB|LWB|GK/i.test(positionsStr)) {
      // 수비수/골키퍼는 승리가 더 중요 (클린시트 기여)
      winBonus += winRate * 50  // 추가 보너스
      
      // 드래프트전 클린시트 보너스 (쿼터별 무실점)
      if (stats.cleanSheets > 0) {
        const cleanSheetRate = stats.cleanSheets / stats.gamesPlayed
        winBonus += cleanSheetRate * 100  // 클린시트당 추가 보너스
      }
    }
    
    power += winBonus
    
    // === 최근 폼 (최근 경기에 가중치) ===
    if (stats.recentGames.length >= 3) {
      const recentAttack = stats.recentGames.reduce((sum, g) => 
        sum + (g.goals * goalWeight + g.assists * assistWeight), 0) / stats.recentGames.length
      
      // 전체 평균과 최근 평균 비교
      const overallAttack = goalsPerGame * goalWeight + assistsPerGame * assistWeight
      const formDiff = recentAttack - overallAttack
      
      // 폼이 상승 중이면 +, 하락 중이면 - (최대 ±50점)
      power += Math.max(-50, Math.min(50, formDiff * 30))
    }
    
    // === 신뢰도 보정 (경기 수) ===
    let reliabilityFactor = 1.0
    if (stats.gamesPlayed >= 20) {
      reliabilityFactor = 1.0   // 충분한 샘플
    } else if (stats.gamesPlayed >= 10) {
      reliabilityFactor = 0.95
    } else if (stats.gamesPlayed >= 5) {
      reliabilityFactor = 0.85
    } else {
      reliabilityFactor = 0.7   // 적은 샘플은 불확실
    }
    
    const performanceBonus = power - (baseOVR * 10)
    power = (baseOVR * 10) + (performanceBonus * reliabilityFactor)
    
  } else {
    // 경기 기록 없으면 OVR만 사용
    power = baseOVR * 10
  }
  
  // 4. 선수 출신에 따른 보너스 (실력 경력 반영)
  const origin = player.origin || 'none'
  let originBonus = 0
  
  // 프로 출신: 프로 경험 보너스 (압도적 어드벤티지)
  if (origin === 'pro') {
    originBonus = 200  // 경기당 골 2개 수준의 엄청난 보너스
  } 
  // 아마추어 출신: 아마추어 팀 경험 (상당한 어드벤티지)
  else if (origin === 'amateur') {
    originBonus = 120
  }
  // 대학팀 출신: 조직적 훈련 경험 (어드벤티지)
  else if (origin === 'college') {
    originBonus = 70
  }
  // 일반: 보너스 없음
  
  power += originBonus
  
  // 5. AI 파워를 50-100 스케일의 AI Overall로 변환
  // 파워 범위: 500(최소) ~ 1500(최대) → Overall: 50 ~ 100
  const minPower = 500
  const maxPower = 1500
  const aiOverall = 50 + ((Math.max(minPower, Math.min(maxPower, power)) - minPower) / (maxPower - minPower)) * 50
  
  return Math.round(aiOverall)
}

/**
 * AI Overall 점수에 따른 그라데이션 클래스
 * @param {number} aiOVR - AI Overall 점수 (50-100)
 * @returns {string} Tailwind CSS 클래스
 */
export function aiPowerChipClass(aiOVR) {
  if (aiOVR >= 95) return 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm'
  if (aiOVR >= 90) return 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-sm'
  if (aiOVR >= 85) return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm'
  if (aiOVR >= 80) return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
  if (aiOVR >= 70) return 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm'
  return 'bg-gradient-to-r from-stone-500 to-stone-600 text-white shadow-sm'
}

/**
 * 선수의 포지션별 강점 분석
 * @param {Object} player - 선수 객체
 * @returns {Object} {attack, defense, midfield} - 각 영역별 점수
 */
export function analyzePlayerStrengths(player) {
  const stats = player.stats || {}
  
  // 공격력: Pace, Shooting, Dribbling
  const attack = Math.round(
    ((stats.Pace || 50) + (stats.Shooting || 50) + (stats.Dribbling || 50)) / 3
  )
  
  // 수비력: Physical, Stamina (+ Pace for recovery)
  const defense = Math.round(
    ((stats.Physical || 50) * 1.5 + (stats.Stamina || 50) + (stats.Pace || 50) * 0.5) / 3
  )
  
  // 미드필드: Passing, Stamina, Dribbling
  const midfield = Math.round(
    ((stats.Passing || 50) + (stats.Stamina || 50) + (stats.Dribbling || 50)) / 3
  )
  
  return { attack, defense, midfield }
}
