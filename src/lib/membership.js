/**
 * 멤버십 관련 유틸리티 함수
 */

/**
 * 정회원인지 확인
 */
export function isMember(membership) {
  const s = String(membership || "").trim().toLowerCase()
  return s === "member" || s.includes("정회원")
}

/**
 * 준회원인지 확인
 */
export function isAssociate(membership) {
  const s = String(membership || "").trim().toLowerCase()
  return s === "associate" || s.includes("준회원")
}

/**
 * 게스트인지 확인
 */
export function isGuest(membership) {
  const s = String(membership || "").trim().toLowerCase()
  return s === "guest" || s.includes("게스트")
}

/**
 * 선수의 배지 배열 반환
 * @param {string} membership - 멤버십 타입
 * @param {boolean} isCaptain - 주장 여부 (선택)
 * @returns {string[]} - 배지 배열 (예: ['C'], ['G'], ['준'], [])
 */
export function getBadges(membership, isCaptain = false) {
  if (isCaptain) return ['C']
  if (isGuest(membership)) return ['G']
  if (isAssociate(membership)) return ['준']
  return []
}
