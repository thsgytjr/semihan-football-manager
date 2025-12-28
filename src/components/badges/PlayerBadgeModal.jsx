// src/components/badges/PlayerBadgeModal.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Award } from 'lucide-react'
import BadgeIcon from './BadgeIcon'
import BadgeTierDetail from './BadgeTierDetail'
import { useTranslation } from 'react-i18next'
import { optimizeImageUrl } from '../../utils/imageOptimization'
import useCachedImage from '../../hooks/useCachedImage'

const LEGACY_SEASON_KEY = 'legacy'

function parseMetadataSeason(metadata) {
  if (!metadata) return null
  if (typeof metadata === 'object') {
    return metadata.season ?? metadata.seasonKey ?? metadata.year ?? null
  }
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata)
      return parseMetadataSeason(parsed)
    } catch {
      return null
    }
  }
  return null
}

function deriveBadgeSeasonKey(badge) {
  if (!badge) return LEGACY_SEASON_KEY
  const fromMetadata = parseMetadataSeason(badge.metadata)
  const directSeason = badge.season ?? badge.seasonKey ?? badge.season_key ?? null
  const preferred = directSeason ?? fromMetadata
  if (preferred != null) {
    const str = String(preferred).trim()
    if (str) return str
  }
  const awarded = badge.awarded_at ?? badge.awardedAt ?? null
  if (awarded != null) {
    const ts = typeof awarded === 'number' ? awarded : Date.parse(awarded)
    if (Number.isFinite(ts)) {
      const year = new Date(ts).getFullYear()
      if (Number.isFinite(year)) return String(year)
    }
  }
  return LEGACY_SEASON_KEY
}

export default function PlayerBadgeModal({
  open,
  player,
  badges = [],
  loading = false,
  error = null,
  onClose
}) {
  const { t } = useTranslation()
  const portalTarget = useMemo(
    () => (typeof document !== 'undefined' && document.body) ? document.body : null,
    []
  )
  const optimizedPlayerAvatarSrc = player?.photoUrl
    ? optimizeImageUrl(player.photoUrl, { width: 120, height: 120, quality: 70 })
    : null
  const cachedPlayerAvatarSrc = useCachedImage(optimizedPlayerAvatarSrc)
  
  const closeModal = useCallback(() => {
    // 스크롤 먼저 복원
    if (portalTarget) {
      portalTarget.style.overflow = ''
    }
    onClose?.()
  }, [onClose, portalTarget])

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
        // 로딩 중에는 ESC 키 무시
        if (!loading) {
          closeModal()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, closeModal, loading])

  // Hook 먼저 선언 후 렌더 조건 평가 (Hook 순서 문제 예방)
  const [viewMode, setViewMode] = useState('tiers') // categories | all | highTier | tiers
  const [selectedBadge, setSelectedBadge] = useState(null)
  const [seasonFilter, setSeasonFilter] = useState(null)
  
  // 뱃지 선택 핸들러 - 로딩 중이면 무시
  const handleBadgeSelect = useCallback((badge) => {
    if (loading) return
    setSelectedBadge(badge)
  }, [loading])
  
  // useMemo로 비싼 계산 캐싱
  const normalizedBadges = useMemo(() => {
    if (!Array.isArray(badges)) return []
    return badges.map((badge) => ({ ...badge, seasonKey: deriveBadgeSeasonKey(badge) }))
  }, [badges])
  const seasonOrder = useMemo(() => {
    const keys = new Set()
    normalizedBadges.forEach((badge) => {
      keys.add(badge.seasonKey || LEGACY_SEASON_KEY)
    })
    const values = Array.from(keys)
    const numeric = values.filter((key) => /^\d{4}$/.test(key)).sort((a, b) => Number(b) - Number(a))
    const others = values.filter((key) => !/^\d{4}$/.test(key)).sort((a, b) => a.localeCompare(b))
    return [...numeric, ...others]
  }, [normalizedBadges])
  useEffect(() => {
    if (seasonOrder.length === 0) {
      setSeasonFilter(null)
      return
    }
    setSeasonFilter((prev) => (prev && seasonOrder.includes(prev)) ? prev : seasonOrder[0])
  }, [seasonOrder])
  const filteredBadges = useMemo(
    () => (seasonFilter ? normalizedBadges.filter((badge) => badge.seasonKey === seasonFilter) : normalizedBadges),
    [normalizedBadges, seasonFilter]
  )
  const hasAnyBadges = normalizedBadges.length > 0
  const sortedBadges = useMemo(() => {
    return [...filteredBadges].sort((a, b) => {
      const aTs = a?.awarded_at ? Date.parse(a.awarded_at) : 0
      const bTs = b?.awarded_at ? Date.parse(b.awarded_at) : 0
      return bTs - aTs
    })
  }, [filteredBadges])
  const highPriority = sortedBadges.filter((badge) => (badge.tier ?? 1) >= 3 || badge.importance === 'high')
  let displayBadges = []
  switch (viewMode) {
    case 'all':
      displayBadges = [...sortedBadges]
      break
    case 'highTier':
      displayBadges = [...highPriority].sort((a,b) => (b.tier||0)-(a.tier||0))
      break
    case 'tiers':
      displayBadges = [...sortedBadges]
      break
    case 'categories':
    default:
      const secondary = sortedBadges.filter((b) => !highPriority.includes(b))
      displayBadges = [...highPriority, ...secondary].slice(0, 12)
      break
  }
  const grouped = viewMode === 'categories' ? displayBadges.reduce((acc, badge) => {
    const key = badge.category || 'misc'
    if (!acc[key]) acc[key] = []
    acc[key].push(badge)
    return acc
  }, {}) : null
  const tierGrouped = viewMode === 'tiers' ? displayBadges.reduce((acc, badge) => {
    const t = Number(badge.tier || 1)
    if (!acc[t]) acc[t] = []
    acc[t].push(badge)
    return acc
  }, {}) : null
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

  // 티어별 뱃지 개수 집계 (선택된 시즌 기준)
  const tierCounts = filteredBadges.reduce((acc, b) => {
    const t = Number(b.tier || 1)
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  const formatSeasonLabel = useCallback((key) => {
    if (!key || key === LEGACY_SEASON_KEY) {
      return t('badges.season.legacy', { defaultValue: '레거시' })
    }
    if (key === 'unknown') {
      return t('badges.season.unknown', { defaultValue: '시즌 미상' })
    }
    if (/^\d{4}$/.test(key)) {
      return t('badges.season.named', { season: key, defaultValue: `${key} 시즌` })
    }
    return t('badges.season.generic', { season: key, defaultValue: key })
  }, [t])
  
  // 모달 렌더링 조건 엄격히 체크
  if (!open) return null
  if (!player) return null
  if (!portalTarget) return null
  
  const shouldRender = true
  const tierOrder = [5, 4, 3, 2, 1]
  const tierMeta = {
    5: { key: 'diamond', swatch: 'linear-gradient(135deg,#8df0ff,#d3c7ff)' },
    4: { key: 'platinum', swatch: 'linear-gradient(135deg,#8ef1ff,#c1a8ff)' },
    3: { key: 'gold', swatch: 'linear-gradient(135deg,#fcd34d,#f97316)' },
    2: { key: 'silver', swatch: 'linear-gradient(135deg,#d1d5db,#9ca3af)' },
    1: { key: 'bronze', swatch: 'linear-gradient(135deg,#d97706,#b45309)' }
  }

  const handleBackdrop = (event) => {
    if (loading) return // 로딩 중에는 백드롭 클릭 무시
    if (event.target === event.currentTarget) {
      closeModal()
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 px-4 py-6" onClick={handleBackdrop}>
      <div 
        className={`relative w-full max-w-3xl rounded-3xl bg-white shadow-2xl ${loading ? 'pointer-events-none select-none' : ''}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={loading}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (!loading) closeModal() }}
          onKeyDown={(e) => { if (!loading && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); closeModal() } }}
          className={`absolute right-4 top-4 z-10 rounded-full p-2 focus:outline-none ${
            loading 
              ? 'cursor-not-allowed text-stone-300 bg-stone-50 pointer-events-auto' 
              : 'text-stone-500 hover:bg-stone-100 focus:ring-2 focus:ring-emerald-400'
          }`}
          aria-label={t('badges.closeAria')}
          aria-disabled={loading}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex max-h-[85vh] flex-col gap-6 p-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center">
                  {cachedPlayerAvatarSrc ? (
                    <img
                      src={cachedPlayerAvatarSrc}
                      alt={player.name}
                      loading="lazy"
                      decoding="async"
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                    />
                  ) : player?.photoUrl ? (
                    <div className="w-full h-full bg-emerald-100 animate-pulse" aria-label="Loading avatar" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl" aria-hidden>
                      <Award className="h-7 w-7 text-emerald-500" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-500">{t('badges.challengeTitle')}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-stone-900">{player.name}</h2>
                    {tierOrder.filter(t => tierCounts[t]).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 max-w-full overflow-hidden" aria-label="티어별 뱃지 개수">
                        {tierOrder.filter(tierKey => tierCounts[tierKey]).map(tierKey => {
                          const meta = tierMeta[tierKey]
                          const label = t(`badges.tiers.${meta.key}`)
                          return (
                            <div
                              key={tierKey}
                              className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 whitespace-nowrap"
                              aria-label={`${label} ${tierCounts[tierKey]}`}
                            >
                              <span className="h-3 w-3 rounded-full" style={{ background: meta?.swatch || '#d4d4d8' }} aria-hidden></span>
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
                  {seasonOrder.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {seasonOrder.map((seasonKey) => (
                        <button
                          key={seasonKey}
                          type="button"
                          disabled={loading}
                          onClick={() => !loading && setSeasonFilter(seasonKey)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            loading
                              ? 'cursor-not-allowed opacity-50'
                              : seasonFilter === seasonKey 
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                                : 'border-stone-200 text-stone-500 hover:border-stone-300'
                          }`}
                        >
                          {formatSeasonLabel(seasonKey)}
                        </button>
                      ))}
                    </div>
                  )}
                  {seasonOrder.length > 0 && seasonFilter && (
                    <p className="text-[11px] text-stone-400">
                      {t('badges.season.activeHint', { season: formatSeasonLabel(seasonFilter), defaultValue: `${formatSeasonLabel(seasonFilter)} 시즌 기록만 보여줘요.` })}
                    </p>
                  )}
                  {hasAnyBadges && (
                    <p className="text-[11px] text-stone-400">
                      {t('badges.season.lockedHint', { defaultValue: '시즌별 기준이 바뀌어도 그 시즌에 획득한 뱃지는 그대로 남습니다.' })}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:items-end w-full sm:w-auto">
              <div className="flex flex-wrap gap-2">
                {['categories','all','highTier','tiers'].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    disabled={loading}
                    onClick={() => !loading && setViewMode(mode)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      loading
                        ? 'cursor-not-allowed opacity-50'
                        : viewMode === mode 
                          ? 'bg-emerald-500 text-white shadow' 
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {t(`badges.view.${mode}`)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-400 space-y-1">
                <span className="block">
                  {viewMode === 'categories' && t('badges.categoryFallback')}
                  {viewMode === 'all' && t('badges.group.allHeader')}
                  {viewMode === 'highTier' && t('badges.group.highTierHeader')}
                  {viewMode === 'tiers' && t('badges.group.allHeader')}
                </span>
                <span className="block text-emerald-600">
                  {seasonFilter
                    ? t('badges.season.scope', { season: formatSeasonLabel(seasonFilter), defaultValue: `${formatSeasonLabel(seasonFilter)} 시즌 기준` })
                    : t('badges.season.scopeAll', { defaultValue: '시즌 정보 없음' })}
                </span>
              </p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto pr-1 relative">
            {/* 로딩 오버레이 */}
            {loading && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500"></div>
                  <p className="text-sm font-medium text-stone-600">{t('badges.loading')}</p>
                </div>
              </div>
            )}
            
            {loading && (
              <div className="flex items-center justify-center py-10 text-stone-500">{t('badges.loading')}</div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {t('badges.error')}
              </div>
            )}

            {!loading && !error && !hasAnyBadges && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                {t('badges.empty')}
              </div>
            )}

            {!loading && !error && hasAnyBadges && filteredBadges.length === 0 && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                {t('badges.emptySeason', { season: seasonFilter ? formatSeasonLabel(seasonFilter) : '', defaultValue: seasonFilter ? `${formatSeasonLabel(seasonFilter)} 시즌에 획득한 뱃지가 없어요.` : '선택한 시즌의 뱃지가 없어요.' })}
              </div>
            )}

            {!loading && !error && filteredBadges.length > 0 && (
              <div className="flex flex-col gap-6">
                {viewMode === 'categories' && grouped && Object.entries(grouped).map(([categoryKey, categoryBadges]) => {
                  const categoryLabel = getCategoryLabel(categoryKey)
                  return (
                    <section key={categoryKey} className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                        {categoryLabel}
                        <span className="text-xs font-normal text-stone-400">{t('badges.categoryCount', { count: categoryBadges.length })}</span>
                      </div>
                      <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))'}}>
                        {categoryBadges.map((badge) => (
                          <BadgeIcon
                            key={badge.id || `${badge.slug}-${badge.awarded_at}`}
                            badge={badge}
                            onSelect={handleBadgeSelect}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
                {viewMode === 'all' && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      {t('badges.group.allHeader')}
                      <span className="text-xs font-normal text-stone-400">{displayBadges.length}</span>
                    </div>
                    <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))'}}>
                      {displayBadges.map((badge) => (
                        <BadgeIcon
                          key={badge.id || `${badge.slug}-${badge.awarded_at}`}
                          badge={badge}
                          onSelect={handleBadgeSelect}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {viewMode === 'highTier' && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      {t('badges.group.highTierHeader')}
                      <span className="text-xs font-normal text-stone-400">{displayBadges.length}</span>
                    </div>
                    <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))'}}>
                      {displayBadges.map((badge) => (
                        <BadgeIcon
                          key={badge.id || `${badge.slug}-${badge.awarded_at}`}
                          badge={badge}
                          onSelect={handleBadgeSelect}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {viewMode === 'tiers' && tierGrouped && Object.keys(tierGrouped).sort((a,b)=>Number(b)-Number(a)).map(tierKey => (
                  <section key={tierKey} className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tierMeta[tierKey]?.swatch || '#34d399' }}></span>
                      {t('badges.group.tierLabel',{tier:t(`badges.tiers.${tierMeta[tierKey]?.key}`)})}
                      <span className="text-xs font-normal text-stone-400">{tierGrouped[tierKey].length}</span>
                    </div>
                    <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))'}}>
                      {tierGrouped[tierKey].map(badge => (
                        <BadgeIcon
                          key={badge.id || `${badge.slug}-${badge.awarded_at}`}
                          badge={badge}
                          onSelect={handleBadgeSelect}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
          {selectedBadge && (
            <BadgeTierDetail
              badge={selectedBadge}
              onClose={() => setSelectedBadge(null)}
            />
          )}
        </div>
      </div>
    </div>
  )

  // portalTarget이 없으면 안전하게 return
  if (!portalTarget) return null

  try {
    return createPortal(modal, portalTarget)
  } catch (error) {
    console.error('[PlayerBadgeModal] Portal error:', error)
    return null
  }
}