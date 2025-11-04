import React from "react"
import captainIcon from "../assets/Captain.PNG"

/**
 * InitialAvatar
 * - Renders a colored circular avatar with the initial OR photo
 * - If photoUrl is provided, displays the image instead
 * - Optional small corner badges (e.g., ['C','G']) overlayed on the avatar
 */
function InitialAvatar({ id, name, size = 24, badges = [], photoUrl = null }) {
  // 한글, 영문 모두 첫 글자 추출 (toUpperCase는 영문에만 적용)
  const firstChar = (name || "?").trim().charAt(0) || "?"
  const initial = /[a-zA-Z]/.test(firstChar) ? firstChar.toUpperCase() : firstChar
  
  // photoUrl이 RANDOM:으로 시작하면 랜덤 색상 모드
  const isRandomColor = photoUrl && String(photoUrl).startsWith('RANDOM:')
  let actualPhotoUrl = isRandomColor ? null : photoUrl
  
  // actualPhotoUrl이 있고 이미 쿼리 파라미터나 해시가 없으면 타임스탬프 추가 (캐시 방지)
  if (actualPhotoUrl && !actualPhotoUrl.includes('?') && !actualPhotoUrl.includes('#')) {
    actualPhotoUrl = `${actualPhotoUrl}?v=${Date.now()}`
  }
  
  // 색상 seed 생성
  let colorSeed
  if (isRandomColor) {
    // 랜덤 모드: photoUrl의 랜덤 값을 seed로 사용
    colorSeed = String(photoUrl)
  } else {
    // 일반 모드: name + id 조합
    colorSeed = (name || "") + (id ? String(id) : "")
  }
  const color = "#" + stringToColor(colorSeed || "seed")

  const badgeSize = Math.max(10, Math.round(size * 0.45))
  const badgeFont = Math.max(8, Math.round(badgeSize * 0.55))
  const badgeGap = Math.max(2, Math.round(badgeSize * 0.2))

  const renderBadge = (label, idx) => {
    const isCaptain = String(label).toUpperCase() === 'C'
    const isGuest = String(label).toUpperCase() === 'G'
    
    // 주장 뱃지: Captain.PNG 이미지 사용
    if (isCaptain) {
      const right = idx * (badgeSize - badgeGap)
      return (
        <span
          key={`${label}-${idx}`}
          title="주장"
          className="absolute bottom-0 inline-flex items-center justify-center select-none"
          style={{
            width: badgeSize,
            height: badgeSize,
            right,
            transform: 'translate(25%, 25%)',
          }}
        >
          <img src={captainIcon} alt="주장" className="w-full h-full object-contain" />
        </span>
      )
    }
    
    // 게스트 뱃지: RGB(251, 229, 230) 배경, RGB(136, 19, 55) 텍스트
    const badgeStyle = isGuest 
      ? { 
          backgroundColor: 'rgb(251, 229, 230)', 
          borderColor: 'rgb(244, 201, 204)',
          color: 'rgb(136, 19, 55)'
        }
      : {}
    
    const bgCls = isGuest 
      ? 'border' // 스타일로 색상 지정
      : 'bg-white border-stone-300 text-stone-800'
    
    const title = isGuest ? '게스트' : String(label)
    // Offset badges from right to left
    const right = idx * (badgeSize - badgeGap)
    return (
      <span
        key={`${label}-${idx}`}
        title={title}
        className={`absolute bottom-0 rounded-full shadow-sm ${bgCls} inline-flex items-center justify-center select-none`}
        style={{
          width: badgeSize,
          height: badgeSize,
          right,
          transform: 'translate(25%, 25%)',
          fontSize: badgeFont,
          lineHeight: 1,
          ...(isGuest ? badgeStyle : {})
        }}
      >
        {String(label).toUpperCase()}
      </span>
    )
  }

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {actualPhotoUrl ? (
        // 사진이 있으면 이미지 표시 (흰색 배경 + 테두리)
        <div className="h-full w-full rounded-full bg-white border-2 border-gray-200 shadow-sm overflow-hidden">
          <img 
            src={actualPhotoUrl}
            alt={name || 'Player'} 
            className="h-full w-full object-cover"
            key={actualPhotoUrl} // URL이 변경되면 이미지 엘리먼트를 새로 생성
            loading="eager" // 즉시 로드
            onError={(e) => {
              // 이미지 로드 실패 시 폴백
              e.target.style.display = 'none'
              const parent = e.target.parentElement
              if (parent) {
                parent.style.display = 'none'
                const fallback = parent.nextSibling
                if (fallback) fallback.style.display = 'flex'
              }
            }}
          />
        </div>
      ) : null}
      {/* 폴백: 이니셜 아바타 */}
      <div
        className="flex h-full w-full items-center justify-center rounded-full text-white font-semibold select-none"
        style={{ 
          fontSize: Math.max(10, size * 0.5), 
          background: `linear-gradient(135deg, ${color} 0%, ${adjustBrightness(color, 20)} 100%)`,
          display: actualPhotoUrl ? 'none' : 'flex', // 사진이 있으면 숨김
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}
      >
        {initial}
      </div>
      {/* badges overlay: render from right to left */}
      {Array.isArray(badges) && badges.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-0 right-0 flex items-center">
            {badges.slice(0, 3).map((b, i) => renderBadge(b, i))}
          </div>
        </div>
      )}
    </div>
  )
}

// React.memo로 감싸서 photoUrl이 변경될 때만 리렌더링
export default React.memo(InitialAvatar, (prevProps, nextProps) => {
  // photoUrl이 변경되면 항상 리렌더링
  if (prevProps.photoUrl !== nextProps.photoUrl) return false
  // 다른 props도 체크
  if (prevProps.id !== nextProps.id) return false
  if (prevProps.name !== nextProps.name) return false
  if (prevProps.size !== nextProps.size) return false
  if (JSON.stringify(prevProps.badges) !== JSON.stringify(nextProps.badges)) return false
  // 모든 props가 같으면 리렌더링 스킵
  return true
})

// 색상 밝기 조절 함수 (그라데이션용)
function adjustBrightness(hexColor, percent) {
  // #RRGGBB를 RGB로 변환
  const num = parseInt(hexColor.replace('#', ''), 16)
  let r = (num >> 16) + Math.round(2.55 * percent)
  let g = ((num >> 8) & 0x00FF) + Math.round(2.55 * percent)
  let b = (num & 0x0000FF) + Math.round(2.55 * percent)
  
  // 0-255 범위로 제한
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function stringToColor(str) {
  // 더 강력한 해시 함수로 다양한 색상 생성
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32bit integer
  }
  
  // 세련된 그라데이션 색상 팔레트 (16개)
  const colorPalette = [
    '#667eea', // 보라-블루
    '#764ba2', // 딥 퍼플
    '#f093fb', // 핑크
    '#4facfe', // 밝은 블루
    '#00f2fe', // 시안
    '#43e97b', // 민트 그린
    '#38f9d7', // 터쿼이즈
    '#fa709a', // 코랄 핑크
    '#fee140', // 골드 옐로우
    '#ffa751', // 오렌지
    '#f857a6', // 마젠타
    '#ff6a88', // 로즈
    '#c471f5', // 라벤더
    '#fa8bff', // 라이트 핑크
    '#2af598', // 에메랄드
    '#009efd', // 오션 블루
  ]
  
  // 해시를 사용하여 팔레트에서 색상 선택
  const index = Math.abs(hash) % colorPalette.length
  return colorPalette[index].replace('#', '')
}
