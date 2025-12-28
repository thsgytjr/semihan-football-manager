// src/components/badges/BadgeIcon.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import BadgeArt from './BadgeArt'
import { optimizeImageUrl } from '../../utils/imageOptimization'
import useCachedImage from '../../hooks/useCachedImage'

const tierThemes = {
  5: { label: 'Diamond', ring: ['#00f0ff', '#7c4dff', '#ff4ddb', '#00f0ff'], core: ['#f4feff', '#fff2ff'] },
  4: { label: 'Platinum', ring: ['#d5f1ff', '#b7e3ff', '#e8d7ff', '#d5f1ff'], core: ['#f8fdff', '#eef3ff'] },
  3: { label: 'Gold', ring: ['#f6c944', '#e89e00'], core: ['#fff4cf', '#f9d76d'] },
  2: { label: 'Silver', ring: ['#b5bcc4', '#e1e5ea'], core: ['#f1f3f6', '#c9ced4'] },
  1: { label: 'Bronze', ring: ['#c0752e', '#e3883f'], core: ['#ffecd1', '#f7c981'] }
}

const fallbackTheme = tierThemes[1]

function BadgeIcon({ badge, size = 'md', onSelect }) {
  if (!badge) return null
  const { t } = useTranslation()
  
  // Intersection Observer로 뷰포트 체크
  const [isInView, setIsInView] = useState(false)
  const cardRef = useRef(null)
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // 뷰포트에 들어오면 애니메이션 활성화
        setIsInView(entry.isIntersecting)
      },
      { 
        threshold: 0.1, // 10%만 보여도 활성화
        rootMargin: '50px' // 뷰포트 50px 전에 미리 로드
      }
    )
    
    if (cardRef.current) {
      observer.observe(cardRef.current)
    }
    
    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current)
      }
    }
  }, [])
  
  const {
    name,
    description,
    numeric_value: numericValue,
    tier = 1,
    slug,
    awarded_at: awardedAt,
    category,
    rarity,
    show_value: showValue = true,
    next_tier: nextTier = null,
    next_threshold: nextThreshold = null,
    remaining_to_next: remainingToNext = null
  } = badge
  const normalizedTier = tier > 5 ? 5 : (tier < 1 ? 1 : tier)
  const theme = tierThemes[normalizedTier] || fallbackTheme
  const isLarge = size === 'lg'
  const badgeImageSrc = badge.image_url
    ? optimizeImageUrl(badge.image_url, {
        width: isLarge ? 320 : 220,
        height: isLarge ? 320 : 220,
        quality: 70
      })
    : null
  const cachedBadgeImageSrc = useCachedImage(badgeImageSrc)
  const formattedDate = (() => {
    if (!awardedAt) return null
    const ts = typeof awardedAt === 'number' ? awardedAt : Date.parse(awardedAt)
    if (!Number.isFinite(ts)) return null
    return new Date(ts).toLocaleDateString('ko-KR')
  })()
  const showNumeric = showValue !== false && numericValue != null
  const progressPct = (remainingToNext != null && nextThreshold && numericValue != null && remainingToNext > 0)
    ? Math.min(100, Math.max(0, Math.round((numericValue / nextThreshold) * 100)))
    : null
  const nextTierLabelRaw = nextTier === 5 ? t('badges.tiers.diamond') : nextTier === 4 ? t('badges.tiers.platinum') : nextTier === 3 ? t('badges.tiers.gold') : nextTier === 2 ? t('badges.tiers.silver') : nextTier === 1 ? t('badges.tiers.bronze') : null
  const ringStops = Array.isArray(theme.ring) ? theme.ring : [theme.ring]
  const ringGradient = ringStops.length > 2
    ? `conic-gradient(${ringStops.join(',')})`
    : `conic-gradient(${ringStops[0]}, ${ringStops[1] || ringStops[0]}, ${ringStops[0]})`

  const cardGlowShadow = normalizedTier === 5
    ? '0 0 22px rgba(0,240,255,0.45), 0 0 40px rgba(124,77,255,0.3)'
    : normalizedTier === 4
      ? '0 0 18px rgba(181,225,255,0.65), 0 0 42px rgba(219,207,255,0.45)'
      : null
  const cardAuraGradient = normalizedTier === 5
    ? 'radial-gradient(circle at 50% 50%, rgba(0,240,255,0.65), rgba(124,77,255,0.45), rgba(255,77,219,0.4), transparent 65%)'
    : normalizedTier === 4
      ? 'radial-gradient(circle at 50% 50%, rgba(213,241,255,0.65), rgba(183,206,255,0.45), transparent 70%)'
      : 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.6), rgba(210,220,230,0.45), transparent 70%)'

  const cardStyle = {
    ...(cardGlowShadow ? { boxShadow: cardGlowShadow } : {}),
    ...(normalizedTier >= 4 ? { overflow: 'hidden' } : {})
  }

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => onSelect?.(badge)}
      className="relative flex flex-col gap-1 rounded-2xl bg-gradient-to-br from-white via-stone-50 to-stone-100 p-3 md:p-4 text-center shadow-[0_2px_6px_-1px_rgba(0,0,0,0.12)] ring-1 ring-stone-200/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
      data-badge-id={slug}
      style={Object.keys(cardStyle).length ? cardStyle : undefined}
    >
      {/* 뷰포트에 있고 tier >= 4일 때만 애니메이션 렌더링 */}
      {isInView && normalizedTier >= 4 && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
          <div className="absolute inset-0" style={{background: cardAuraGradient, filter:'blur(6px)', opacity: 0.75}} />
          <div className="absolute inset-[2px] rounded-[1.1rem] border border-white/60 opacity-70" />
          <div className="absolute inset-0">
            <span className="absolute left-3 top-2 h-px w-10 bg-gradient-to-r from-transparent via-white to-transparent opacity-40 animate-twinkle"></span>
            <span className="absolute right-4 bottom-3 h-px w-8 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-twinkle" style={{ animationDelay: '0.7s' }}></span>
          </div>
          {normalizedTier === 5 && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              {/* Stadium floodlight pulse */}
              <div className="absolute inset-0" style={{
                background: 'radial-gradient(circle at 50% 50%, rgba(255,215,0,0.12), rgba(0,200,80,0.08), transparent 65%)',
                animation: 'stadiumPulse 3s ease-in-out infinite'
              }} />
              
              {/* Championship glow sweep */}
              <div className="absolute left-0 top-0 h-full w-1/3 -skew-x-12 animate-shimmer-glow" style={{background:'linear-gradient(90deg, rgba(255,215,0,0) 0%, rgba(255,215,0,0.95) 50%, rgba(255,215,0,0) 100%)', mixBlendMode:'screen'}} />
              
              {/* Goal net pattern waves */}
              {[0, 1, 2].map((i) => (
                <div
                  key={`net-${i}`}
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,215,0,0.15) 6px, rgba(255,215,0,0.15) 7px), repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(255,215,0,0.15) 6px, rgba(255,215,0,0.15) 7px)',
                    animation: `goalNetWave ${3 + i * 0.5}s ease-out infinite`,
                    animationDelay: `${i * 1}s`,
                    opacity: 0
                  }}
                />
              ))}
              
              {/* Stadium corner spotlights */}
              {[0, 1, 2, 3].map((corner) => {
                const positions = [
                  { top: '-5%', left: '-5%', background: 'radial-gradient(circle, rgba(255,215,0,0.5) 0%, rgba(255,255,255,0.3) 30%, transparent 60%)' },
                  { top: '-5%', right: '-5%', background: 'radial-gradient(circle, rgba(255,215,0,0.5) 0%, rgba(255,255,255,0.3) 30%, transparent 60%)' },
                  { bottom: '-5%', left: '-5%', background: 'radial-gradient(circle, rgba(0,200,80,0.4) 0%, rgba(255,215,0,0.2) 30%, transparent 60%)' },
                  { bottom: '-5%', right: '-5%', background: 'radial-gradient(circle, rgba(0,200,80,0.4) 0%, rgba(255,215,0,0.2) 30%, transparent 60%)' }
                ]
                return (
                  <div
                    key={`spotlight-${corner}`}
                    className="absolute"
                    style={{
                      ...positions[corner],
                      width: '35%',
                      height: '35%',
                      animation: `spotlightPulse ${2.5 + corner * 0.3}s ease-in-out infinite`,
                      animationDelay: `${corner * 0.5}s`,
                      filter: 'blur(10px)',
                      mixBlendMode: 'screen'
                    }}
                  />
                )
              })}
              
              {/* Golden football sparkles */}
              <div className="absolute inset-0">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={`sparkle-${i}`}
                    className="absolute"
                    style={{
                      width: i % 3 === 0 ? '6px' : '4px',
                      height: i % 3 === 0 ? '6px' : '4px',
                      left: `${15 + (i * 8)}%`,
                      top: `${10 + (i % 4) * 23}%`,
                      animation: `trophyStar ${1.3 + i * 0.2}s ease-in-out infinite`,
                      animationDelay: `${i * 0.15}s`,
                      filter: 'blur(0.5px)'
                    }}
                  >
                    {/* Trophy star shape */}
                    <svg width="100%" height="100%" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.8))' }}>
                      <path d="M12 2L15 9L22 10L17 15L18 22L12 18L6 22L7 15L2 10L9 9Z" fill="#FFD700" opacity="0.9" />
                    </svg>
                  </div>
                ))}
              </div>

              
              {/* Championship trophy rays */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={`ray-${i}`}
                  className="absolute"
                  style={{
                    width: '3px',
                    height: '45%',
                    left: `${20 + i * 20}%`,
                    top: i % 2 === 0 ? '-12%' : 'auto',
                    bottom: i % 2 === 1 ? '-12%' : 'auto',
                    background: 'linear-gradient(to bottom, rgba(255,215,0,0) 0%, rgba(255,215,0,0.9) 50%, rgba(255,215,0,0) 100%)',
                    animation: `trophyRay ${2.5 + i * 0.3}s ease-in-out infinite`,
                    animationDelay: `${i * 0.5}s`,
                    transform: `rotate(${-25 + i * 17}deg)`,
                    filter: 'blur(1.5px)',
                    boxShadow: '0 0 10px rgba(255,215,0,0.9), 0 0 20px rgba(255,255,255,0.5)',
                    opacity: 0,
                    mixBlendMode: 'screen'
                  }}
                />
              ))}
              
              {/* Championship gold border glow */}
              <div className="absolute inset-0 rounded-2xl" style={{
                background: 'linear-gradient(45deg, rgba(255,215,0,0.5), rgba(255,255,255,0.4), rgba(0,200,80,0.3), rgba(255,215,0,0.5))',
                backgroundSize: '200% 200%',
                animation: 'championGlow 4s ease-in-out infinite',
                mixBlendMode: 'screen',
                opacity: 0.7
              }} />
            </div>
          )}
          {normalizedTier === 4 && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              {/* Gentle platinum shimmer */}
              <div className="absolute left-0 top-0 h-full w-1/4 -skew-x-12 animate-shimmer-glow" style={{background:'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(200,230,255,0.6) 50%, rgba(255,255,255,0) 100%)', mixBlendMode:'screen', animationDuration: '4s'}} />
              
              {/* Subtle silver sparkles */}
              <div className="absolute inset-0">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={`plat-sparkle-${i}`}
                    className="absolute rounded-full"
                    style={{
                      width: '3px',
                      height: '3px',
                      background: 'radial-gradient(circle, rgba(255,255,255,0.9), rgba(200,230,255,0.6))',
                      left: `${20 + i * 15}%`,
                      top: `${15 + (i % 3) * 25}%`,
                      animation: `platinumSparkle ${2 + i * 0.3}s ease-in-out infinite`,
                      animationDelay: `${i * 0.4}s`,
                      boxShadow: '0 0 4px rgba(200,230,255,0.6)',
                      opacity: 0
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mx-auto flex items-center justify-center">
        <div className={`relative flex items-center justify-center rounded-full ${isLarge ? 'h-16 w-16 md:h-20 md:w-20' : 'h-12 w-12 md:h-16 md:w-16'}`}>
          {/* 뷰포트에 있고 tier >= 4일 때만 애니메이션 렌더링 */}
          {isInView && normalizedTier >= 4 && (
            <div className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
              {normalizedTier === 4 && (
                <>
                  <div className="absolute -inset-1 rounded-full" style={{background:'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9), rgba(213,241,255,0.5), rgba(183,206,255,0.4), transparent 70%)', mixBlendMode:'screen', opacity: 0.85}} />
                  <div className="absolute -inset-1 rounded-full animate-pulse opacity-55" style={{background:'conic-gradient(from 0deg, rgba(255,255,255,0.75), rgba(186,213,255,0.45), rgba(228,214,255,0.45), rgba(255,255,255,0.75))', filter:'blur(6px)', mixBlendMode:'overlay'}} />
                </>
              )}
              {normalizedTier === 5 && (
                <>
                  {/* Base radial glow */}
                  <div className="absolute inset-[2px] rounded-full" style={{background:'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9), rgba(0,240,255,0.55), rgba(124,77,255,0.45), rgba(255,77,219,0.4), transparent 70%)', mixBlendMode:'screen', opacity: 0.9}} />
                  
                  {/* Rotating prismatic halo */}
                  <div className="absolute inset-[6px] rounded-full animate-spin-slow" style={{background:'conic-gradient(from 0deg, rgba(255,255,255,0.75), rgba(0,240,255,0.45), rgba(124,77,255,0.45), rgba(255,77,219,0.5), rgba(255,255,255,0.75))', filter:'blur(4px)', mixBlendMode:'overlay'}} />
                  
                  {/* Counter-rotating outer ring (LoL style) */}
                  <div className="absolute -inset-[8px] rounded-full" style={{
                    background: 'conic-gradient(from 180deg, transparent 0%, rgba(0,240,255,0.4) 25%, transparent 50%, rgba(255,77,219,0.4) 75%, transparent 100%)',
                    animation: 'spin 6s linear infinite reverse',
                    filter: 'blur(6px)',
                    mixBlendMode: 'screen',
                    opacity: 0.6
                  }} />
                  
                  {/* Star sparkles */}
                  <div className="pointer-events-none absolute inset-[14%]" style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 45%), radial-gradient(circle at 70% 65%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle at 45% 80%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 30%)', mixBlendMode:'screen'}} />
                  
                  {/* Animated sparkle points */}
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute"
                      style={{
                        width: '2px',
                        height: '2px',
                        background: 'white',
                        boxShadow: '0 0 4px rgba(255,255,255,1), 0 0 8px rgba(0,240,255,0.8)',
                        left: ['20%', '80%', '50%', '50%'][i],
                        top: ['50%', '50%', '20%', '80%'][i],
                        animation: `starPulse ${1 + i * 0.3}s ease-in-out infinite`,
                        animationDelay: `${i * 0.25}s`,
                        borderRadius: '50%',
                        filter: 'blur(0.5px)'
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          )}
          <div className="relative h-full w-full flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: ringGradient }}
            />
            <div className="absolute inset-0 rounded-full ring-2 ring-white/30" />
            <div className="absolute inset-[10%] md:inset-[12%] rounded-full overflow-hidden ring-1 ring-white/40 bg-white flex items-center justify-center">
              <div className="absolute inset-0 opacity-40" style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 70%)'}} />
              {badge.image_url ? (
                cachedBadgeImageSrc ? (
                  <img
                    src={cachedBadgeImageSrc}
                    alt={name}
                    loading="lazy"
                    decoding="async"
                    width={isLarge ? 160 : 110}
                    height={isLarge ? 160 : 110}
                    className="w-[120%] h-[120%] object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-stone-100 to-stone-200 animate-pulse" aria-label="Loading badge" />
                )
              ) : (
                <BadgeArt slug={slug} />
              )}
            </div>
            {showNumeric && (
              <div className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center z-10">
                <span className="rounded-full bg-white/85 backdrop-blur px-2 py-0.5 text-xs font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200/60">
                  {numericValue}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[13px] md:text-sm font-semibold text-stone-900" title={t(`badges.definitions.${slug}.name`, { defaultValue: name })}>{t(`badges.definitions.${slug}.name`, { defaultValue: name })}</div>
      {category && (
        <div className="text-xs tracking-wide text-stone-400" title={t(`badges.categories.${category}`, { defaultValue: category })}>
          {t(`badges.categories.${category}`, { defaultValue: category })}
        </div>
      )}
      {description && (
        <p className="text-[11px] md:text-[12px] leading-tight text-stone-500" title={t(`badges.definitions.${slug}.description`, { value: numericValue, defaultValue: description })}>
          {t(`badges.definitions.${slug}.description`, { value: numericValue, defaultValue: description })}
        </p>
      )}
      {remainingToNext != null && nextTier != null && remainingToNext > 0 && (
        <div className="mt-1 space-y-1" title="다음 티어 진행도">
          <div className="flex items-center justify-between text-[10px] text-stone-500">
            <span>{t('badges.progress.nextTierLabel', { tier: nextTierLabelRaw })}</span>
            {progressPct != null && <span className="font-medium text-stone-600">{progressPct}%</span>}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 transition-all"
              style={{ width: `${progressPct || 0}%` }}
            />
          </div>
          <p className="text-[10px] text-emerald-700 font-medium">
            {t('badges.progress.needMore', { count: remainingToNext })}
          </p>
        </div>
      )}
      {nextTier == null && (
        <p className="text-[11px] text-stone-400" title={t('badges.maxTierAchieved')}>{t('badges.maxTierAchieved')}</p>
      )}
      {formattedDate && <p className="text-[11px] text-stone-400">{formattedDate} {t('badges.obtainedSuffix')}</p>}
    </button>
  )
}

// React.memo로 감싸서 불필요한 리렌더링 방지
export default React.memo(BadgeIcon, (prevProps, nextProps) => {
  // badge 객체의 주요 속성만 비교
  if (prevProps.badge?.id !== nextProps.badge?.id) return false
  if (prevProps.badge?.slug !== nextProps.badge?.slug) return false
  if (prevProps.badge?.tier !== nextProps.badge?.tier) return false
  if (prevProps.badge?.numeric_value !== nextProps.badge?.numeric_value) return false
  if (prevProps.size !== nextProps.size) return false
  if (prevProps.onSelect !== nextProps.onSelect) return false
  return true
})
