// src/lib/aiPower.js
import { overall, isUnknownPlayer } from './players'

/**
 * 선수의 AI 파워 점수 계산
 * @param {Object} player - 선수 객체
 * @param {Array} matches - 매치 기록 배열
 * @returns {number} AI 파워 점수
 */
export function calculateAIPower(player, matches) {
  // 1. 기본 OVR
  const baseOVR = isUnknownPlayer(player) ? 50 : (player.ovr ?? overall(player))
  
  // 2. 매치 기록에서 실적 계산
  const playerMatches = matches.filter(m => {
    const attendees = m.attendeeIds || []
    return attendees.includes(player.id)
  })
  
  const stats = {
    gamesPlayed: playerMatches.length,
    goals: 0,
    assists: 0,
    wins: 0,
    totalScore: 0
  }
  
  // 각 매치에서 골, 어시스트, 승리 집계
  playerMatches.forEach(match => {
    // 골/어시스트
    const playerStats = match.playerStats?.[player.id] || {}
    stats.goals += Number(playerStats.goals || 0)
    stats.assists += Number(playerStats.assists || 0)
    
    // 승리 계산 (선수가 속한 팀이 이겼는지)
    if (match.teams && match.score) {
      const playerTeamIdx = match.teams.findIndex(team => 
        team.some(p => String(p.id) === String(player.id))
      )
      if (playerTeamIdx >= 0 && match.score[playerTeamIdx]) {
        const myScore = match.score[playerTeamIdx]
        const maxScore = Math.max(...match.score)
        if (myScore === maxScore && match.score.filter(s => s === maxScore).length === 1) {
          stats.wins += 1
        }
      }
    }
    
    // 경기 점수 (있으면)
    if (match.ratings?.[player.id]) {
      stats.totalScore += Number(match.ratings[player.id])
    }
  })
  
  // 3. 종합 파워 계산 (경기당 퍼포먼스 중심)
  let power = baseOVR * 10 // 기본 파워 (500~1000)
  
  if (stats.gamesPlayed > 0) {
    // === 경기당 공격 포인트 (핵심 지표) ===
    const goalsPerGame = stats.goals / stats.gamesPlayed
    const assistsPerGame = stats.assists / stats.gamesPlayed
    const attackPerGame = goalsPerGame * 2 + assistsPerGame // 골에 2배 가중치
    
    // 공격 포인트 점수 (매우 높은 가중치)
    power += attackPerGame * 50
    
    // === 승률 (팀 기여도) ===
    const winRate = stats.wins / stats.gamesPlayed
    power += winRate * 150
    
    // === 평균 평점 (경기 퍼포먼스) ===
    if (stats.totalScore > 0) {
      const avgRating = stats.totalScore / stats.gamesPlayed
      power += (avgRating - 5) * 20
    }
    
    // === 경기당 특출난 퍼포먼스 보너스 ===
    if (goalsPerGame >= 1.0) {
      power += 100 // 골잡이 보너스
    } else if (goalsPerGame >= 0.5) {
      power += 50 // 준 골잡이
    }
    
    if (assistsPerGame >= 1.0) {
      power += 80 // 플레이메이커 보너스
    } else if (assistsPerGame >= 0.5) {
      power += 40
    }
    
    // === 신뢰도 보정 (경기 수에 따른 가중치) ===
    let reliabilityFactor = 1.0
    if (stats.gamesPlayed >= 20) {
      reliabilityFactor = 1.0
    } else if (stats.gamesPlayed >= 10) {
      reliabilityFactor = 0.95
    } else if (stats.gamesPlayed >= 5) {
      reliabilityFactor = 0.9
    } else {
      reliabilityFactor = 0.85
    }
    
    // 신뢰도 보정 적용 (기본 OVR 제외, 실적 부분만)
    const performanceBonus = power - (baseOVR * 10)
    power = (baseOVR * 10) + (performanceBonus * reliabilityFactor)
    
    // === 경험치 보너스 (적당히) ===
    power += Math.min(stats.gamesPlayed * 1.5, 30) // 최대 +30점
  } else {
    // 경기 데이터가 없으면 OVR만 사용 (약간 감점)
    power = baseOVR * 9.5 // 95% 반영
  }
  
  return Math.round(power)
}

/**
 * AI 파워 점수에 따른 그라데이션 클래스
 * @param {number} power - AI 파워 점수
 * @returns {string} Tailwind CSS 클래스
 */
export function aiPowerChipClass(power) {
  if (power >= 1300) return 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
  if (power >= 1100) return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
  if (power >= 900) return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
  if (power >= 700) return 'bg-gradient-to-r from-amber-500 to-amber-600 text-white'
  return 'bg-gradient-to-r from-stone-500 to-stone-600 text-white'
}
