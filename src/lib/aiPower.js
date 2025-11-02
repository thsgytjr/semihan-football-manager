// src/lib/aiPower.js
import { overall, isUnknownPlayer } from './players'

/**
 * 선수의 AI 파워 점수 계산 (팀 밸런스용 - 순수 실력 지표)
 * @param {Object} player - 선수 객체
 * @param {Array} matches - 매치 기록 배열
 * @returns {number} AI 파워 점수
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
    
    // 포지션 고려
    const position = player.position || player.pos || ''
    let goalWeight = 2.0
    let assistWeight = 1.0
    
    // 포지션별 가중치 조정
    if (/FW|ST|CF|LW|RW/i.test(position)) {
      goalWeight = 2.5  // 공격수는 골 더 중요
      assistWeight = 1.0
    } else if (/MF|CAM|CDM|CM|LM|RM/i.test(position)) {
      goalWeight = 2.0
      assistWeight = 1.3 // 미드필더는 어시 중요
    } else if (/CB|LB|RB|DF|WB/i.test(position)) {
      goalWeight = 3.0  // 수비수 골은 희소가치
      assistWeight = 2.0
    }
    
    const attackScore = goalsPerGame * goalWeight + assistsPerGame * assistWeight
    power += attackScore * 50
    
    // === 승률 (팀 기여도) ===
    const winRate = stats.wins / stats.gamesPlayed
    const drawRate = stats.draws / stats.gamesPlayed
    power += (winRate * 150 + drawRate * 30)
    
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
  
  return Math.round(power)
}

/**
 * AI 파워 점수에 따른 그라데이션 클래스
 * @param {number} power - AI 파워 점수
 * @returns {string} Tailwind CSS 클래스
 */
export function aiPowerChipClass(power) {
  if (power >= 1500) return 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm'
  if (power >= 1300) return 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-sm'
  if (power >= 1100) return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm'
  if (power >= 900) return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
  if (power >= 700) return 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm'
  return 'bg-gradient-to-r from-stone-500 to-stone-600 text-white shadow-sm'
}
