// src/components/NewSeasonBanner.jsx
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, X, Calendar, Database } from 'lucide-react'

/**
 * NewSeasonBanner - 시즌 리캡 종료 후 새로운 시즌 시작을 알리는 배너
 * 
 * @param {string} currentSeason - 현재 시즌 (년도)
 * @param {boolean} seasonRecapEnabled - 시즌 리캡이 활성화되어 있는지
 * @param {boolean} hasSeenRecap - 유저가 시즌 리캡을 봤는지 여부
 */
export default function NewSeasonBanner({ currentSeason, seasonRecapEnabled, hasSeenRecap, onVisibilityChange }) {
  const { t } = useTranslation()
  
  // 다음 시즌 계산 (현재 시즌 + 1년)
  const nextSeason = (() => {
    if (!currentSeason || currentSeason === 'all') return new Date().getFullYear() + 1
    const year = parseInt(currentSeason, 10)
    return isNaN(year) ? new Date().getFullYear() + 1 : year + 1
  })()
  
  const storageKey = `newSeasonBanner_dismissed_${currentSeason}`
  
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    // 시즌이 변경되면 배너 다시 표시
    setIsDismissed(false)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }, [currentSeason, storageKey])

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      localStorage.setItem(storageKey, 'true')
    } catch {
      // ignore
    }
  }

  const handleHideForToday = () => {
    setIsDismissed(true)
    try {
      const today = new Date().toDateString()
      localStorage.setItem('newSeasonBanner_hideUntil', today)
    } catch {
      // ignore
    }
  }

  // Check if banner should be hidden for today
  const isHiddenForToday = (() => {
    try {
      const hideUntil = localStorage.getItem('newSeasonBanner_hideUntil')
      if (hideUntil) {
        const today = new Date().toDateString()
        if (hideUntil === today) {
          return true
        } else {
          // Clear expired hide setting
          localStorage.removeItem('newSeasonBanner_hideUntil')
        }
      }
    } catch {
      // ignore
    }
    return false
  })()

  const isVisible = seasonRecapEnabled && hasSeenRecap && !isDismissed && !isHiddenForToday

  useEffect(() => {
    onVisibilityChange?.(isVisible)
  }, [isVisible, onVisibilityChange])

  // 시즌 리캡이 꺼져있거나, 리캡을 아직 안봤거나, 이미 닫혔거나, 오늘 하루 숨김이면 표시 안함
  if (!isVisible) {
    return null
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-6 shadow-xl">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40" />
      
      {/* Close button - top right */}
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
        aria-label={t('common.close')}
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative">
        {/* Icon */}
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {t('newSeasonBanner.title', { season: nextSeason })}
            </h2>
            <p className="text-sm text-white/90">
              {t('newSeasonBanner.subtitle')}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <p className="text-base text-white/95">
            {t('newSeasonBanner.description')}
          </p>

          {/* Info cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2">
                <Database className="h-5 w-5 text-white/90" />
                <h3 className="font-semibold text-white">
                  {t('newSeasonBanner.dataRetained.title')}
                </h3>
              </div>
              <p className="text-sm text-white/80">
                {t('newSeasonBanner.dataRetained.description')}
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-white/90" />
                <h3 className="font-semibold text-white">
                  {t('newSeasonBanner.accessPrevious.title')}
                </h3>
              </div>
              <p className="text-sm text-white/80">
                {t('newSeasonBanner.accessPrevious.description')}
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-4 rounded-xl bg-white/20 p-4 backdrop-blur-sm">
            <p className="text-center text-lg font-semibold text-white">
              {t('newSeasonBanner.cta')}
            </p>
          </div>

          {/* Hide for Today Button */}
          <div className="mt-3 flex justify-center">
            <button
              onClick={handleHideForToday}
              className="rounded-full bg-white/20 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/30 hover:text-white"
            >
              {t('newSeasonBanner.hideForToday')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
