import React from "react"
import captainIcon from "../assets/Captain.PNG"
import { getMembershipBadge } from "../lib/membershipConfig"
import { optimizeImageUrl } from "../utils/imageOptimization"
import useCachedImage from "../hooks/useCachedImage"

/**
 * InitialAvatar
 * - Renders a colored circular avatar with the initial OR photo
 * - If photoUrl is provided, displays the image instead
 * - Optional small corner badges (e.g., ['C','G']) overlayed on the avatar
 * - customMemberships: 커스텀 멤버십 설정 배열 (배지 색상 커스터마이징)
 * - badgeInfo: 미리 계산된 배지 정보 객체 (선택적, 성능 최적화용)
 */
function InitialAvatar({ id, name, size = 24, badges = [], photoUrl = null, customMemberships = [], badgeInfo = null }) {
  // 한글, 영문 모두 첫 글자 추출 (toUpperCase는 영문에만 적용)
  const firstChar = (name || "?").trim().charAt(0) || "?"
  const initial = /[a-zA-Z]/.test(firstChar) ? firstChar.toUpperCase() : firstChar
  
  // photoUrl이 RANDOM:으로 시작하면 랜덤 색상 모드
  const isRandomColor = photoUrl && String(photoUrl).startsWith('RANDOM:')
  let actualPhotoUrl = isRandomColor ? null : photoUrl

  if (actualPhotoUrl) {
    // 리스트/테이블에서 과도한 픽셀 전송 방지: 렌더 크기 기반 썸네일 요청
    const targetSize = Math.min(128, Math.max(40, size * 2))
    actualPhotoUrl = optimizeImageUrl(actualPhotoUrl, { width: targetSize, height: targetSize, quality: 65, format: 'webp' })
  }

  const cachedPhotoSrc = useCachedImage(actualPhotoUrl)
  
  // 브라우저 캐싱 활용 (타임스탬프 제거)
  // actualPhotoUrl은 그대로 사용
  
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
    
    // 먼저 전달받은 badgeInfo 사용 (성능 최적화)
    let customBadge = badgeInfo
    
    // badgeInfo가 없으면 직접 검색 (폴백)
    if (!customBadge && customMemberships.length > 0) {
      customBadge = getMembershipBadge(String(label), customMemberships)
    }
    
    // 하드코딩 폴백 (커스텀 설정이 없을 때)
    const isGuest = String(label).toUpperCase() === 'G'
    const isAssociate = String(label).toUpperCase() === '준'
    
    let badgeStyle = {}
    let bgCls = 'bg-white border-stone-300 text-stone-800'
    let title = String(label)
    
    if (customBadge && customBadge.colorStyle) {
      // 커스텀 멤버십 스타일 적용
      badgeStyle = {
        backgroundColor: customBadge.colorStyle.bg,
        borderColor: customBadge.colorStyle.border,
        color: customBadge.colorStyle.text
      }
      bgCls = 'border'
      title = customBadge.membership?.name || String(label)
    } else if (isGuest) {
      // 기본 게스트 스타일
      badgeStyle = { 
        backgroundColor: 'rgb(251, 229, 230)', 
        borderColor: 'rgb(244, 201, 204)',
        color: 'rgb(136, 19, 55)'
      }
      bgCls = 'border'
      title = '게스트'
    } else if (isAssociate) {
      // 기본 준회원 스타일
      badgeStyle = {
        backgroundColor: 'rgb(254, 243, 199)',
        borderColor: 'rgb(253, 224, 71)',
        color: 'rgb(146, 64, 14)'
      }
      bgCls = 'border'
      title = '준회원'
    }
    
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
          ...badgeStyle
        }}
      >
        {String(label).toUpperCase()}
      </span>
    )
  }

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {cachedPhotoSrc ? (
        // 사진이 있으면 이미지 표시 (흰색 배경 + 테두리)
        <div className="h-full w-full rounded-full bg-white border-2 border-gray-200 shadow-sm overflow-hidden">
          <img 
            src={cachedPhotoSrc}
            alt={name || 'Player'} 
            width={Math.max(1, Math.round(size))}
            height={Math.max(1, Math.round(size))}
            decoding="async"
            className="h-full w-full object-cover"
            loading="lazy" // 지연 로딩: 뷰포트에 들어올 때만 로드
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
          display: cachedPhotoSrc ? 'none' : 'flex', // 사진이 있으면 숨김
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
  if (JSON.stringify(prevProps.customMemberships) !== JSON.stringify(nextProps.customMemberships)) return false
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
