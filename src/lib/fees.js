// src/lib/fees.js
// Centralized fee calculation utilities
// Formula: total = memberFee * (M+G) + surcharge * G
// guestFee = memberFee + surcharge; memberFee rounded to 0.5

export function calcFees({ total, memberCount, guestCount, guestSurcharge = 2 }) {
  total = Math.max(0, Number(total) || 0)
  const surcharge = Math.max(0, Number(guestSurcharge) || 0)
  const count = memberCount + guestCount
  if (total <= 0 || count === 0) {
    return { total, memberFee: 0, guestFee: 0, sum: 0, guestSurcharge: surcharge }
  }
  let memberFee = (total - surcharge * guestCount) / count
  memberFee = Math.round(memberFee * 2) / 2 // round to .5
  const guestFee = memberFee + surcharge
  const sum = memberFee * memberCount + guestFee * guestCount
  return { total, memberFee, guestFee, sum, guestSurcharge: surcharge }
}

// Convenience to compute from list of players
export function feesFromPlayers({ total, players, guestSurcharge = 2 }) {
  const memberCount = players.filter(p => isMember(p.membership)).length
  const guestCount = Math.max(0, players.length - memberCount)
  return calcFees({ total, memberCount, guestCount, guestSurcharge })
}

// Lightweight membership check reused across code
export function isMember(mem) {
  const s = String(mem || '').trim().toLowerCase()
  if (!s) return false
  // Korean labels / English both
  if (s.includes('정회원') || s.includes('member')) return true
  // treat associate as member? keep false for now
  return false
}
