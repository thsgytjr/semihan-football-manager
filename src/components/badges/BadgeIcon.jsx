// src/components/badges/BadgeIcon.jsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import BadgeArt from './BadgeArt'

const tierThemes = {
  4: { label: 'Platinum', ring: ['#cfd2d6', '#eef2f7'], core: ['#f6f7f9', '#dfe3e8'] },
  3: { label: 'Gold', ring: ['#f6c944', '#e89e00'], core: ['#fff4cf', '#f9d76d'] },
  2: { label: 'Silver', ring: ['#b5bcc4', '#e1e5ea'], core: ['#f1f3f6', '#c9ced4'] },
  1: { label: 'Bronze', ring: ['#c0752e', '#e3883f'], core: ['#ffecd1', '#f7c981'] }
}

const fallbackTheme = tierThemes[1]

export default function BadgeIcon({ badge, size = 'md' }) {
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
  const normalizedTier = tier > 4 ? 4 : (tier < 1 ? 1 : tier)
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
  const nextTierLabelRaw = nextTier === 4 ? t('badges.tiers.platinum') : nextTier === 3 ? t('badges.tiers.gold') : nextTier === 2 ? t('badges.tiers.silver') : nextTier === 1 ? t('badges.tiers.bronze') : null

  return (
    <div
      className="relative flex flex-col gap-1 rounded-2xl bg-gradient-to-br from-white via-stone-50 to-stone-100 p-3 md:p-4 text-center shadow-[0_2px_6px_-1px_rgba(0,0,0,0.12)] ring-1 ring-stone-200/70 backdrop-blur-sm"
      data-badge-id={slug}
    >
      <div className="mx-auto flex items-center justify-center">
        <div className={`relative flex items-center justify-center rounded-full ${isLarge ? 'h-16 w-16 md:h-20 md:w-20' : 'h-12 w-12 md:h-16 md:w-16'}`}>
          {/* Outer ring with subtle glow */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(${theme.ring[0]}, ${theme.ring[1]}, ${theme.ring[0]})` }}
          />
          <div className="absolute inset-0 rounded-full ring-2 ring-white/30" />
          {/* Inner core */}
          <div className="absolute inset-[10%] md:inset-[12%] rounded-full overflow-hidden ring-1 ring-white/40 bg-[#111] flex items-center justify-center">
            <div className="absolute inset-0 opacity-40" style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 70%)'}} />
            <BadgeArt slug={slug} />
          </div>
          {/* Numeric chip */}
          {showNumeric && (
            <div className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center">
              <span className="rounded-full bg-white/80 backdrop-blur px-2 py-0.5 text-xs font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200/60">
                {numericValue}
              </span>
            </div>
          )}
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
    </div>
  )
}
