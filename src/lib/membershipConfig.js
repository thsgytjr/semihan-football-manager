/**
 * 멤버십 설정 관리
 * 팀별 커스터마이징 가능한 멤버십 타입
 */

// 기본 멤버십 설정 (삭제 가능)
export const DEFAULT_MEMBERSHIPS = [
  {
    id: 'member',
    name: '정회원',
    badge: null, // 배지 없음
    color: 'emerald',
    deletable: true,
  },
  {
    id: 'associate',
    name: '준회원',
    badge: '준',
    badgeColor: 'amber', // 노란색
    color: 'amber',
    deletable: true,
  },
  {
    id: 'guest',
    name: '게스트',
    badge: 'G',
    badgeColor: 'rose', // 빨간색
    color: 'stone',
    deletable: true,
  },
]

// 배지 색상 옵션
export const BADGE_COLORS = [
  { value: 'red', label: '빨강', bg: 'rgb(254, 226, 226)', border: 'rgb(248, 180, 180)', text: 'rgb(153, 27, 27)' },
  { value: 'orange', label: '주황', bg: 'rgb(254, 237, 220)', border: 'rgb(253, 186, 140)', text: 'rgb(154, 52, 18)' },
  { value: 'amber', label: '노랑', bg: 'rgb(254, 243, 199)', border: 'rgb(253, 224, 71)', text: 'rgb(146, 64, 14)' },
  { value: 'emerald', label: '초록', bg: 'rgb(209, 250, 229)', border: 'rgb(110, 231, 183)', text: 'rgb(6, 95, 70)' },
  { value: 'blue', label: '파랑', bg: 'rgb(219, 234, 254)', border: 'rgb(147, 197, 253)', text: 'rgb(30, 64, 175)' },
  { value: 'purple', label: '보라', bg: 'rgb(237, 233, 254)', border: 'rgb(196, 181, 253)', text: 'rgb(91, 33, 182)' },
  { value: 'pink', label: '분홍', bg: 'rgb(252, 231, 243)', border: 'rgb(249, 168, 212)', text: 'rgb(157, 23, 77)' },
  { value: 'rose', label: '로즈', bg: 'rgb(251, 229, 230)', border: 'rgb(244, 201, 204)', text: 'rgb(136, 19, 55)' },
  { value: 'stone', label: '회색', bg: 'rgb(245, 245, 244)', border: 'rgb(214, 211, 209)', text: 'rgb(68, 64, 60)' },
]

// 배지 색상 가져오기
export function getBadgeColorStyle(colorValue) {
  const color = BADGE_COLORS.find(c => c.value === colorValue)
  if (!color) return BADGE_COLORS[0]
  return color
}

// 멤버십으로 배지 정보 가져오기
export function getMembershipBadge(membership, customMemberships = []) {
  if (!membership) return null
  
  const mem = String(membership).trim().toLowerCase()
  
  // 커스텀 멤버십에서 찾기
  for (const custom of customMemberships) {
    const customName = String(custom.name || '').trim().toLowerCase()
    const customId = String(custom.id || '').trim().toLowerCase()
    
    if (mem === customId || mem.includes(customName)) {
      if (!custom.badge) return null
      const colorStyle = getBadgeColorStyle(custom.badgeColor || 'stone')
      return {
        badge: custom.badge,
        colorStyle: colorStyle,
        membership: custom
      }
    }
  }
  
  // 기본 멤버십에서 찾기 (하위 호환성)
  for (const def of DEFAULT_MEMBERSHIPS) {
    const defName = String(def.name).trim().toLowerCase()
    const defId = String(def.id).trim().toLowerCase()
    
    if (mem === defId || mem.includes(defName)) {
      if (!def.badge) return null
      const colorStyle = getBadgeColorStyle(def.badgeColor || 'stone')
      return {
        badge: def.badge,
        colorStyle: colorStyle,
        membership: def
      }
    }
  }
  
  return null
}

// 멤버십 유효성 검사
export function validateMembership(membership) {
  const errors = []
  
  if (!membership.name || !membership.name.trim()) {
    errors.push('멤버십 이름을 입력해주세요')
  }
  
  if (membership.badge && membership.badge.length > 1) {
    errors.push('배지는 한 글자만 입력 가능합니다')
  }
  
  if (!membership.id || !membership.id.trim()) {
    errors.push('멤버십 ID가 필요합니다')
  }
  
  return errors
}

// 안전한 멤버십 삭제 체크 (선수 데이터 확인)
export function canDeleteMembership(membershipId, players) {
  const usedCount = players.filter(p => {
    const mem = String(p.membership || '').trim().toLowerCase()
    const id = String(membershipId).trim().toLowerCase()
    return mem === id || mem.includes(id)
  }).length
  
  return { canDelete: usedCount === 0, usedCount }
}
