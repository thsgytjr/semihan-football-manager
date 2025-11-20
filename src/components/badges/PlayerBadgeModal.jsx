// src/components/badges/PlayerBadgeModal.jsx
import React, { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Award } from 'lucide-react'
import BadgeIcon from './BadgeIcon'
import { useTranslation } from 'react-i18next'

export default function PlayerBadgeModal({
  open,
  player,
  badges = [],
  loading = false,
  error = null,
  onClose
}) {
  const { t, i18n } = useTranslation()
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  const closeModal = useCallback(() => {
    onClose?.()
  }, [onClose])

  useEffect(() => {
    if (!open || !portalTarget) return undefined
    const previous = portalTarget.style.overflow
    portalTarget.style.overflow = 'hidden'
    return () => {
      portalTarget.style.overflow = previous
    }
  }, [open, portalTarget])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeModal()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, closeModal])

  if (!open || !player || !portalTarget) return null
  const sortedBadges = [...badges].sort((a, b) => {
    const aTs = a?.awarded_at ? Date.parse(a.awarded_at) : 0
    const bTs = b?.awarded_at ? Date.parse(b.awarded_at) : 0
    return bTs - aTs
  })
  const highPriority = sortedBadges.filter((badge) => badge.importance === 'high' || (badge.tier ?? 1) >= 3)
  const secondary = sortedBadges.filter((badge) => !highPriority.includes(badge))
  const featuredBadges = [...highPriority, ...secondary].slice(0, 12)
  const grouped = featuredBadges.reduce((acc, badge) => {
    const key = badge.category || 'misc'
    if (!acc[key]) acc[key] = []
    acc[key].push(badge)
    return acc
  }, {})
  const formatDateTime = (value) => {
    if (!value) return t('badges.dateUnknown')
    const ts = typeof value === 'number' ? value : Date.parse(value)
    if (!Number.isFinite(ts)) return t('badges.dateUnknown')
    return new Date(ts).toLocaleString('ko-KR')
  }

  const getCategoryLabel = (key) => {
    if (!key) return t('badges.categoryFallback')
    const translated = t(`badges.categories.${key}`)
    // i18next가 미번역 시 key 그대로 반환하는 경우 처리
    if (translated === `badges.categories.${key}`) {
      return key === 'misc' ? t('badges.categoryFallback') : key
    }
    return translated
  }

  // 티어별 뱃지 개수 집계 (전체 보유 배지 기준)
  const tierCounts = badges.reduce((acc, b) => {
    const t = Number(b.tier || 1)
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  const tierOrder = [4, 3, 2, 1]
  const tierMeta = {
    4: { key: 'platinum', color: 'bg-slate-300' },
    3: { key: 'gold', color: 'bg-amber-400' },
    2: { key: 'silver', color: 'bg-gray-300' },
    1: { key: 'bronze', color: 'bg-orange-400' }
  }

  const handleBackdrop = (event) => {
    if (event.target === event.currentTarget) {
      closeModal()
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 px-4 py-6" onClick={handleBackdrop}>
      <div className="relative w-full max-w-3xl rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); closeModal() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeModal() } }}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-stone-500 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          aria-label={t('badges.closeAria')}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex max-h-[85vh] flex-col gap-6 p-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
                {player.photoUrl ? (
                  <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl" aria-hidden>
                    <Award className="h-7 w-7 text-emerald-500" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-500">{t('badges.challengeTitle')}</p>
                <div className="flex items-center flex-wrap gap-3">
                  <h2 className="text-2xl font-bold text-stone-900">{player.name}</h2>
                  {tierOrder.filter(t => tierCounts[t]).length > 0 && (
                    <div className="flex items-center gap-1" aria-label="티어별 뱃지 개수">
                      {tierOrder.filter(tierKey => tierCounts[tierKey]).map(tierKey => {
                        const meta = tierMeta[tierKey]
                        const label = t(`badges.tiers.${meta.key}`)
                        return (
                          <div
                            key={tierKey}
                            className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600"
                            aria-label={`${label} ${tierCounts[tierKey]}`}
                          >
                            <span className={`h-3 w-3 rounded-full ${meta.color}`} aria-hidden></span>
                            <span>{label} {tierCounts[tierKey]}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {player.membership && (
                  <p className="text-sm text-stone-500">{player.membership}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2" />
          </header>

          <div className="flex-1 overflow-y-auto pr-1">
            {loading && (
              <div className="flex items-center justify-center py-10 text-stone-500">{t('badges.loading')}</div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {t('badges.error')}
              </div>
            )}

            {!loading && !error && badges.length === 0 && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                {t('badges.empty')}
              </div>
            )}

            {!loading && !error && badges.length > 0 && (
              <div className="flex flex-col gap-6">
                {Object.entries(grouped).map(([categoryKey, categoryBadges]) => {
                  const categoryLabel = getCategoryLabel(categoryKey)
                  return (
                    <section key={categoryKey} className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                        {categoryLabel}
                        <span className="text-xs font-normal text-stone-400">{t('badges.categoryCount', { count: categoryBadges.length })}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {categoryBadges.map((badge) => (
                          <BadgeIcon key={badge.id || `${badge.slug}-${badge.awarded_at}`} badge={badge} />
                        ))}
                      </div>
                    </section>
                  )
                })}

                {/* 타임라인 섹션 제거됨 */}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, portalTarget)
}
