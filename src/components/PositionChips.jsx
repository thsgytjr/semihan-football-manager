import React from 'react'
import { getPositionCategory } from '../lib/constants'

/**
 * 포지션 칩 컴포넌트 - 단일 또는 여러 포지션 표시
 * @param {string[]} positions - 포지션 배열 (예: ['CB', 'RB'])
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {number} maxDisplay - 최대 표시 개수 (나머지는 +N으로 표시)
 */
export default function PositionChips({ positions = [], size = 'md', maxDisplay = 3 }) {
  if (!positions || positions.length === 0) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] bg-stone-100 text-stone-500">
        -
      </span>
    )
  }

  const sizeClasses = {
    sm: 'px-1.5 py-[1px] text-[10px]',
    md: 'px-2 py-[2px] text-[11px]',
    lg: 'px-2.5 py-1 text-xs'
  }

  const getChipClass = (position) => {
    const category = getPositionCategory(position)
    const baseClass = `inline-flex items-center rounded-full font-medium ${sizeClasses[size]}`
    
    switch (category) {
      case 'GK':
        return `${baseClass} bg-amber-100 text-amber-800 border border-amber-200`
      case 'DF':
        return `${baseClass} bg-blue-100 text-blue-800 border border-blue-200`
      case 'MF':
        return `${baseClass} bg-emerald-100 text-emerald-800 border border-emerald-200`
      case 'FW':
        return `${baseClass} bg-purple-100 text-purple-800 border border-purple-200`
      default:
        return `${baseClass} bg-stone-100 text-stone-700 border border-stone-200`
    }
  }

  const displayPositions = positions.slice(0, maxDisplay)
  const remaining = positions.length - maxDisplay

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {displayPositions.map((pos, idx) => (
        <span key={`${pos}-${idx}`} className={getChipClass(pos)}>
          {pos}
        </span>
      ))}
      {remaining > 0 && (
        <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] bg-stone-100 text-stone-600 font-medium">
          +{remaining}
        </span>
      )}
    </div>
  )
}

/**
 * 단일 포지션 칩 (레거시 호환용)
 */
export function PosChip({ pos, size = 'md' }) {
  if (!pos) return null
  return <PositionChips positions={[pos]} size={size} maxDisplay={1} />
}
