// src/lib/avatarGenerator.js
// DiceBear 랜덤 아바타 생성기

/**
 * 선수 ID를 기반으로 일관된 아바타 URL 생성
 * @param {string|number} playerId - 선수 ID
 * @param {string} playerName - 선수 이름 (추가 시드로 사용)
 * @returns {string} DiceBear API URL
 */
export function generatePlayerAvatar(playerId, playerName = '') {
  // ID와 이름을 조합하여 시드 생성
  const seed = `${playerId || ''}-${playerName || ''}`.trim()
  
  // DiceBear의 open-peeps 스타일 사용 (손으로 그린 듯한 캐릭터)
  return `https://api.dicebear.com/7.x/open-peeps/svg?seed=${encodeURIComponent(seed)}`
}

/**
 * 랜덤 아바타 URL 생성 (매번 다른 아바타)
 * @returns {string} DiceBear API URL with random seed
 */
export function generateRandomAvatar() {
  const randomSeed = `random-${Date.now()}-${Math.random()}`
  return `https://api.dicebear.com/7.x/open-peeps/svg?seed=${encodeURIComponent(randomSeed)}`
}

/**
 * photoUrl이 없는 경우 자동으로 아바타 생성
 * @param {object} player - 선수 객체
 * @returns {string|null} 아바타 URL 또는 null
 */
export function getPlayerPhotoOrAvatar(player) {
  if (!player) return null
  
  // photoUrl이 있으면 그대로 사용
  if (player.photoUrl && !player.photoUrl.startsWith('RANDOM:')) {
    return player.photoUrl
  }
  
  // photoUrl이 없거나 RANDOM:이면 아바타 생성
  return generatePlayerAvatar(player.id, player.name)
}

/**
 * URL이 DiceBear 아바타인지 확인
 */
export function isDicebearAvatar(url) {
  return url && url.includes('api.dicebear.com')
}
