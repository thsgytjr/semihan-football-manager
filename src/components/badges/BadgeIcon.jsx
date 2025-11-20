// src/components/badges/BadgeIcon.jsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import BadgeArt from './BadgeArt'

const tierThemes = {
  5: { label: 'Diamond', ring: ['#00f0ff', '#7c4dff', '#ff4ddb', '#00f0ff'], core: ['#f4feff', '#fff2ff'] },
  4: { label: 'Platinum', ring: ['#d5f1ff', '#b7e3ff', '#e8d7ff', '#d5f1ff'], core: ['#f8fdff', '#eef3ff'] },
  3: { label: 'Gold', ring: ['#f6c944', '#e89e00'], core: ['#fff4cf', '#f9d76d'] },
  2: { label: 'Silver', ring: ['#b5bcc4', '#e1e5ea'], core: ['#f1f3f6', '#c9ced4'] },
  1: { label: 'Bronze', ring: ['#c0752e', '#e3883f'], core: ['#ffecd1', '#f7c981'] }
}

const fallbackTheme = tierThemes[1]

export default function BadgeIcon({ badge, size = 'md', onSelect }) {
  if (!badge) return null
  const { t } = useTranslation()
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
    ? '0 0 30px rgba(0,240,255,0.75), 0 0 70px rgba(124,77,255,0.55), 0 0 120px rgba(255,77,219,0.5)'
    : normalizedTier === 4
      ? '0 0 18px rgba(181,225,255,0.65), 0 0 42px rgba(219,207,255,0.45)'
      : null
  const cardAuraGradient = normalizedTier === 5
    ? 'radial-gradient(circle at 50% 50%, rgba(0,240,255,0.75), rgba(124,77,255,0.6), rgba(255,77,219,0.55), transparent 70%)'
    : normalizedTier === 4
      ? 'radial-gradient(circle at 50% 50%, rgba(213,241,255,0.65), rgba(183,206,255,0.45), transparent 70%)'
      : 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.6), rgba(210,220,230,0.45), transparent 70%)'

  return (
    <button
      type="button"
      onClick={() => onSelect?.(badge)}
      className="relative flex flex-col gap-1 rounded-2xl bg-gradient-to-br from-white via-stone-50 to-stone-100 p-3 md:p-4 text-center shadow-[0_2px_6px_-1px_rgba(0,0,0,0.12)] ring-1 ring-stone-200/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
      data-badge-id={slug}
      style={cardGlowShadow ? { boxShadow: cardGlowShadow } : undefined}
    >
      {normalizedTier >= 4 && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
          <div className="absolute inset-0" style={{background: cardAuraGradient, filter:'blur(14px)', opacity: normalizedTier === 5 ? 0.85 : 0.6}} />
          <div className="absolute inset-[2px] rounded-[1.1rem] border border-white/60 opacity-70" />
          <div className="absolute inset-0">
            <span className="absolute left-3 top-2 h-px w-10 bg-gradient-to-r from-transparent via-white to-transparent opacity-40 animate-twinkle"></span>
            <span className="absolute right-4 bottom-3 h-px w-8 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-twinkle" style={{ animationDelay: '0.7s' }}></span>
          </div>
          {normalizedTier === 5 && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1/3 -skew-x-12 animate-shimmer-glow" style={{background:'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 100%)', mixBlendMode:'screen'}} />
            </div>
          )}
        </div>
      )}
      <div className="mx-auto flex items-center justify-center">
        <div className={`relative flex items-center justify-center rounded-full ${isLarge ? 'h-16 w-16 md:h-20 md:w-20' : 'h-12 w-12 md:h-16 md:w-16'}`}>
          {normalizedTier >= 4 && (
            <div className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
              {normalizedTier === 4 && (
                <>
                  <div className="absolute -inset-1 rounded-full" style={{background:'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9), rgba(213,241,255,0.5), rgba(183,206,255,0.4), transparent 70%)', mixBlendMode:'screen', opacity: 0.85}} />
                  <div className="absolute -inset-1 rounded-full animate-pulse opacity-55" style={{background:'conic-gradient(from 0deg, rgba(255,255,255,0.75), rgba(186,213,255,0.45), rgba(228,214,255,0.45), rgba(255,255,255,0.75))', filter:'blur(6px)', mixBlendMode:'overlay'}} />
                </>
              )}
              {normalizedTier === 5 && (
                <>
                  <div className="absolute -inset-1.25 rounded-full" style={{background:'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95), rgba(0,240,255,0.6), rgba(124,77,255,0.55), rgba(255,77,219,0.5), transparent 75%)', mixBlendMode:'screen', opacity: 0.9}} />
                  <div className="absolute -inset-1.75 rounded-full animate-spin-slow" style={{background:'conic-gradient(from 0deg, rgba(255,255,255,0.85), rgba(0,240,255,0.55), rgba(124,77,255,0.5), rgba(255,77,219,0.55), rgba(255,255,255,0.85))', filter:'blur(7px)', mixBlendMode:'overlay'}} />
                  <div className="pointer-events-none absolute inset-0" style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 40%), radial-gradient(circle at 70% 65%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle at 45% 80%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 30%)', mixBlendMode:'screen'}} />
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
            <div className="absolute inset-[10%] md:inset-[12%] rounded-full overflow-hidden ring-1 ring-white/40 bg-[#111] flex items-center justify-center">
              <div className="absolute inset-0 opacity-40" style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 70%)'}} />
              <BadgeArt slug={slug} />
            </div>
            {showNumeric && (
              <div className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center">
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
