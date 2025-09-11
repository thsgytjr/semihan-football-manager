// src/components/VerifiedBadge.jsx
import React from 'react'

/**
 * membership: 'member' | 'guest'
 * 모든 정회원 -> badge 아이콘, 게스트 -> null
 */
export default function VerifiedBadge({ membership = 'guest', size = 16, className = '' }) {
  if (membership !== 'member') return null
  const title = '정회원 인증: 회비 납부 및 고정 멤버'

  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      className={`inline-block align-[-2px] ${className}`} role="img" aria-label={title}
      title={title}
    >
      <defs>
        <linearGradient id="badgeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F58529"/>
          <stop offset="50%" stopColor="#DD2A7B"/>
          <stop offset="100%" stopColor="#8134AF"/>
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#badgeGrad)"/>
      <path d="M17 9l-6.5 6L7 11.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
