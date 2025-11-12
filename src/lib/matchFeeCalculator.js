// src/lib/matchFeeCalculator.js
// 매치 구장비 계산 로직 통합

import { isMember } from './fees'
import { getAccountingOverrides } from './appSettings'

/**
 * 매치의 멤버/게스트 구장비를 계산
 * @param {Object} match - 매치 객체
 * @param {Array} players - 전체 선수 배열
 * @returns {Object} { memberFee, guestFee, participantIds }
 */
export function calculateMatchFees(match, players = []) {
  const participantIds = match.attendeeIds || match.participantIds || 
    (Array.isArray(match.snapshot) ? match.snapshot.flat() : []) || []
  
  // 앱 회계 설정 override 로드
  const overrides = getAccountingOverrides()
  const overrideMemberFee = overrides.memberFeeOverride
  const overrideGuestSurcharge = overrides.guestSurchargeOverride
  const overrideVenueTotal = overrides.venueTotalOverride

  let memberFee = typeof match.fees?.memberFee === 'number' ? match.fees.memberFee : 0
  let guestSurcharge = typeof match.fees?.guestSurcharge === 'number' ? match.fees.guestSurcharge : 2
  let guestFee = typeof match.fees?.guestFee === 'number' 
    ? match.fees.guestFee 
    : (memberFee ? memberFee + guestSurcharge : 0)

  // Fallback: fees가 비었는데 totalCost만 있으면 다시 계산
  if ((!memberFee || !guestFee) && typeof match.totalCost === 'number' && participantIds.length > 0) {
    const members = participantIds
      .map(id => players.find(p => p.id === id))
      .filter(Boolean)
      .filter(p => isMember(p.membership)).length
    const guests = participantIds.length - members
    const surcharge = guestSurcharge
    const count = members + guests
    
    if (count > 0) {
      let calcMember = (match.totalCost - surcharge * guests) / count
      calcMember = Math.round(calcMember * 2) / 2
      memberFee = calcMember
      guestFee = calcMember + surcharge
    }
  }

  // Override 적용 (우선순위: venueTotalOverride > memberFeeOverride / guestSurchargeOverride)
  if (overrideVenueTotal && participantIds.length > 0) {
    // venueTotalOverride 기준 재계산 (게스트 할증 우선 overrideGuestSurcharge 사용)
    const members = participantIds
      .map(id => players.find(p => p.id === id))
      .filter(Boolean)
      .filter(p => isMember(p.membership)).length
    const guests = participantIds.length - members
    const surcharge = overrideGuestSurcharge != null ? overrideGuestSurcharge : guestSurcharge
    const count = members + guests
    if (count > 0) {
      let calcMember = (overrideVenueTotal - surcharge * guests) / count
      calcMember = Math.round(calcMember * 2) / 2
      memberFee = calcMember
      guestFee = calcMember + surcharge
    }
  } else {
    // venueTotalOverride 없으면 개별 override 적용
    if (overrideMemberFee != null) {
      memberFee = overrideMemberFee
      // guestFee도 재계산 (guest surcharge override 반영)
      const surcharge = overrideGuestSurcharge != null ? overrideGuestSurcharge : guestSurcharge
      guestFee = memberFee + surcharge
    } else if (overrideGuestSurcharge != null && memberFee) {
      guestFee = memberFee + overrideGuestSurcharge
    }
  }

  return { memberFee, guestFee, participantIds }
}

/**
 * 특정 선수의 구장비 계산
 * @param {Object} match - 매치 객체
 * @param {Object} player - 선수 객체
 * @param {Array} allPlayers - 전체 선수 배열 (fallback 계산용)
 * @returns {number} 해당 선수의 구장비
 */
export function calculatePlayerMatchFee(match, player, allPlayers = []) {
  const { memberFee, guestFee } = calculateMatchFees(match, allPlayers)
  return isMember(player?.membership) ? memberFee : guestFee
}
