// src/lib/avatarGenerator.js
// DiceBear 랜덤 아바타 생성기

const openPeepsHeadOptions = [
  'afro','bangs','bangs2','bantuKnots','bear','bun','bun2','buns','cornrows','cornrows2','dreads1','dreads2','flatTop','flatTopLong','grayBun','grayMedium','grayShort','hatBeanie','hatHip','hijab','long','longAfro','longBangs','longCurly','medium1','medium2','medium3','mediumBangs','mediumBangs2','mediumBangs3','mediumStraight','mohawk','mohawk2','noHair1','noHair2','noHair3','pomp','shaved1','shaved2','shaved3','short1','short2','short3','short4','short5','twists','twists2'
]

function hashStringToInt(str){
  let hash=0
  for(let i=0;i<str.length;i++){
    hash=(hash<<5)-hash+str.charCodeAt(i)
    hash|=0
  }
  return Math.abs(hash)
}

function pickHead(seed){
  const safeSeed = seed || 'open-peeps'
  const idx = hashStringToInt(safeSeed) % openPeepsHeadOptions.length
  return openPeepsHeadOptions[idx]
}

function buildOpenPeepsUrl(seed){
  const encodedSeed = encodeURIComponent(seed)
  const head = pickHead(seed)
  return `https://api.dicebear.com/7.x/open-peeps/svg?seed=${encodedSeed}&head=${head}`
}

export function sanitizeOpenPeepsUrl(url, fallbackSeed){
  if(!url || !url.includes('/open-peeps/')) return url
  try{
    const u = new URL(url)
    u.searchParams.delete('mask')
    u.searchParams.delete('maskProbability')

    const currentHeads = u.searchParams.getAll('head')
    const hasValidHead = currentHeads.length>0 && currentHeads.every(h=>openPeepsHeadOptions.includes(h))
    if(!hasValidHead){
      u.searchParams.delete('head')
      const seedParam = u.searchParams.get('seed') || fallbackSeed || ''
      u.searchParams.append('head', pickHead(seedParam))
    }

    return u.toString()
  }catch{
    return url
  }
}

/**
 * 선수 ID를 기반으로 일관된 아바타 URL 생성
 * @param {string|number} playerId - 선수 ID
 * @param {string} playerName - 선수 이름 (추가 시드로 사용)
 * @returns {string} DiceBear API URL
 */
export function generatePlayerAvatar(playerId, playerName = '') {
  // ID와 이름을 조합하여 시드 생성
  const seed = `${playerId || ''}-${playerName || ''}`.trim()
  
  return buildOpenPeepsUrl(seed)
}

/**
 * 랜덤 아바타 URL 생성 (매번 다른 아바타)
 * @returns {string} DiceBear API URL with random seed
 */
export function generateRandomAvatar() {
  const randomSeed = `random-${Date.now()}-${Math.random()}`
  return buildOpenPeepsUrl(randomSeed)
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
    return sanitizeOpenPeepsUrl(player.photoUrl, `${player.id}-${player.name||''}`)
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
