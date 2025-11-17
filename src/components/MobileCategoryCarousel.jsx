import React, { useRef, useState, useEffect } from 'react'

/**
 * MobileCategoryCarousel
 * - 모바일 전용: 1줄 가로 스크롤로 모든 카테고리를 보여줍니다.
 * - 연속된 바 형태로 선택된 항목만 하이라이트됩니다.
 * - 데스크톱에서는 사용하지 말고, 상위에서 sm:hidden 등으로 제어하세요.
 */
export default function MobileCategoryCarousel({
  options = [], // [{ id, label }]
  activeId,
  onSelect,
  className = ''
}) {
  const containerRef = useRef(null)
  const [showLeftIndicator, setShowLeftIndicator] = useState(false)
  const [showRightIndicator, setShowRightIndicator] = useState(false)

  // 스크롤 위치에 따라 인디케이터 표시 여부 결정
  const updateIndicators = () => {
    const el = containerRef.current
    if (!el) return
    
    const { scrollLeft, scrollWidth, clientWidth } = el
    setShowLeftIndicator(scrollLeft > 10)
    setShowRightIndicator(scrollLeft < scrollWidth - clientWidth - 10)
  }

  useEffect(() => {
    updateIndicators()
    window.addEventListener('resize', updateIndicators)
    return () => window.removeEventListener('resize', updateIndicators)
  }, [options])

  // 활성 탭이 보이도록 스크롤
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    
    const activeButton = el.querySelector('[data-active="true"]')
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [activeId])

  return (
    <div className={`relative ${className}`}>
      {/* 왼쪽 페이드 인디케이터 */}
      {showLeftIndicator && (
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent pointer-events-none z-10" />
      )}

      {/* 오른쪽 페이드 인디케이터 */}
      {showRightIndicator && (
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent pointer-events-none z-10" />
      )}

      {/* 1줄 가로 스크롤 - 연속된 바 형태 */}
      <div
        ref={containerRef}
        className="flex items-center gap-0 overflow-x-auto no-scrollbar scroll-smooth border border-stone-300 rounded-full bg-white p-1 shadow-sm"
        onScroll={updateIndicators}
      >
        {options.map((o, idx) => {
          const active = activeId === o.id
          return (
            <button
              key={o.id}
              onClick={() => onSelect?.(o.id)}
              data-active={active}
              className={`shrink-0 px-4 py-1.5 text-[13px] font-medium transition-all whitespace-nowrap rounded-full ${
                active
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
