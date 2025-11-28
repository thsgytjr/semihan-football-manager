// src/components/badges/BadgeTierDetail.jsx
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { getBadgeThresholds } from '../../lib/playerBadgeEngine'
import BadgeImageViewer from './BadgeImageViewer'
import { optimizeImageUrl } from '../../utils/imageOptimization'
import useCachedImage from '../../hooks/useCachedImage'

export default function BadgeTierDetail({ badge, onClose }) {
  const { t } = useTranslation()
  if (!badge) return null
  const { slug, numeric_value: value, tier: currentTier = 1 } = badge
  const thresholds = getBadgeThresholds(slug)
  
    // Get badge description from translations
    const badgeName = t(`badges.definitions.${slug}.name`, { defaultValue: badge.name })
    const badgeDescription = t(`badges.definitions.${slug}.description`, { defaultValue: '', value: value || 0 })

    const [viewerOpen, setViewerOpen] = useState(false)
    const previewImageSrc = badge.image_url
      ? optimizeImageUrl(badge.image_url, { width: 256, height: 256, quality: 70 })
      : null
    const viewerImageSrc = badge.image_url
      ? optimizeImageUrl(badge.image_url, { width: 1024, quality: 85, resize: 'contain' })
      : null
    const cachedPreviewSrc = useCachedImage(previewImageSrc)
    const cachedViewerSrc = useCachedImage(viewerImageSrc)
  
  const tierName = (tNum) => {
    switch (tNum) {
      case 5: return t('badges.tiers.diamond')
      case 4: return t('badges.tiers.platinum')
      case 3: return t('badges.tiers.gold')
      case 2: return t('badges.tiers.silver')
      case 1: return t('badges.tiers.bronze')
      default: return `T${tNum}`
    }
  }
  const nextRow = thresholds.find(th => th.tier === currentTier + 1)
  const remainingToNext = nextRow ? Math.max(0, nextRow.threshold - (value || 0)) : null

  return (
    <div 
      className="absolute inset-0 z-[1400] flex items-center justify-center bg-black/70 p-4"
      style={{ touchAction: 'manipulation' }}
    >
      <div 
        className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl ring-1 ring-stone-200"
        style={{ touchAction: 'pan-y' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-stone-500 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          aria-label={t('badges.detail.close')}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-32 h-32 rounded-2xl overflow-hidden ring-2 ring-stone-200 bg-white flex items-center justify-center">
              {cachedPreviewSrc ? (
                <button
                  type="button"
                  aria-label={`Open ${badgeName} image`}
                  onClick={() => setViewerOpen(true)}
                  className="w-full h-full p-0 m-0"
                  style={{ background: 'transparent', border: 'none' }}
                >
                  <img
                    src={cachedPreviewSrc}
                    alt={badge.name}
                    loading="lazy"
                    decoding="async"
                    width={128}
                    height={128}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="text-xs text-stone-400 animate-pulse">Loading...</div>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <h3 className="text-lg font-bold text-stone-900">
                {badgeName}
              </h3>
              {badgeDescription && (
                <p className="text-sm text-stone-600">
                  {badgeDescription}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-600">
                <tr>
                  <th className="px-3 py-2 text-left w-20">{t('badges.detail.currentValue')}</th>
                  <th className="px-3 py-2 text-left">{t('badges.detail.threshold')}</th>
                  <th className="px-3 py-2 text-left">{t('badges.detail.status')}</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.sort((a,b)=>a.tier-b.tier).map(row => {
                  const achieved = (value || 0) >= row.threshold && currentTier >= row.tier
                  const rowRemaining = achieved ? 0 : Math.max(0, row.threshold - (value || 0))
                  const isCurrent = currentTier === row.tier
                  return (
                    <tr key={row.tier} className={isCurrent ? 'bg-emerald-50/70' : ''}>
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">
                            {tierName(row.tier)}
                          </span>
                          {isCurrent && <span className="text-[11px] text-emerald-600 font-semibold">{t('badges.detail.currentValue')}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-stone-700">{row.threshold}</td>
                      <td className="px-3 py-2">
                        {achieved ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{t('badges.detail.achieved')}</span>
                        ) : (
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">
                            {rowRemaining > 0 ? t('badges.detail.remaining', { count: rowRemaining }) : t('badges.detail.locked')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {remainingToNext != null && remainingToNext > 0 && (
            <div className="text-xs text-emerald-700 font-medium">
              {t('badges.detail.progressToNext', { count: remainingToNext, tier: tierName(currentTier + 1) })}
            </div>
          )}
        </div>
      </div>
      {viewerOpen && cachedViewerSrc && (
        <BadgeImageViewer src={cachedViewerSrc} alt={badgeName} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  )
}
