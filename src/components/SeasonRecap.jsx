import React, { useMemo, useState, useEffect, useCallback, useRef, useContext } from 'react'
import { createPortal } from 'react-dom'
import { X, Users, Activity, Calendar, Star, Target, Sparkles, Flame, Smile, Crown, Handshake, Gamepad2, Shield } from 'lucide-react'
import { extractStatsByPlayer, extractAttendeeIds, extractDateKey } from '../lib/matchUtils'
import InitialAvatar from './InitialAvatar'
import { useTranslation } from 'react-i18next'

const ActiveSlideContext = React.createContext('season-recap-initial')

const STORY_CONFIGS = [
  {
    id: 'fiesta',
    icon: Sparkles,
    iconClass: 'text-amber-300'
  },
  {
    id: 'hat-trick',
    icon: Flame,
    iconClass: 'text-rose-300'
  },
  {
    id: 'rookies',
    icon: Smile,
    iconClass: 'text-emerald-300'
  },
  {
    id: 'energy',
    icon: Users,
    iconClass: 'text-sky-300'
  }
]

const SUPPORTED_RECAP_LANGS = ['en', 'ko']
const LANGUAGE_FLAGS = {
  en: '🇺🇸',
  ko: '🇰🇷'
}

const INTERACTIVE_TOUCH_SELECTOR = 'button, a, input, select, textarea, [data-recap-interactive="true"], [role="button"]'

const isInteractiveTouchTarget = (target) => {
  if (typeof window === 'undefined') return false
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest(INTERACTIVE_TOUCH_SELECTOR))
}

const hasRealPhoto = (photoUrl) => {
  if (typeof photoUrl !== 'string') return false
  const trimmed = photoUrl.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:image')) return true
  if (trimmed.startsWith('blob:')) return true
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true
  return false
}

const photoVerificationCache = new Map()
const photoVerificationInflight = new Map()

const verifyPhotoAsset = (url) => {
  if (typeof url !== 'string') return Promise.resolve(false)
  const trimmed = url.trim()
  if (!trimmed) return Promise.resolve(false)
  if (photoVerificationCache.has(trimmed)) {
    return Promise.resolve(photoVerificationCache.get(trimmed))
  }
  if (photoVerificationInflight.has(trimmed)) {
    return photoVerificationInflight.get(trimmed)
  }
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    photoVerificationCache.set(trimmed, true)
    return Promise.resolve(true)
  }
  const promise = new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const settle = (result) => {
      if (settled) return
      settled = true
      photoVerificationCache.set(trimmed, result)
      photoVerificationInflight.delete(trimmed)
      resolve(result)
    }
    const timeout = window.setTimeout(() => settle(false), 8000)
    img.onload = () => {
      window.clearTimeout(timeout)
      settle(true)
    }
    img.onerror = () => {
      window.clearTimeout(timeout)
      settle(false)
    }
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.src = trimmed
  })
  photoVerificationInflight.set(trimmed, promise)
  return promise
}

export default function SeasonRecap({ matches, players, onClose, seasonName, leaders = {} }) {
  const { t, i18n } = useTranslation()
  const [activeSlide, setActiveSlide] = useState(0)
  const [storyExpanded, setStoryExpanded] = useState(false)
  const [storyActiveIndex, setStoryActiveIndex] = useState(0)
  const [pinnedStoryIds, setPinnedStoryIds] = useState([])
  const [verifiedPulsePlayers, setVerifiedPulsePlayers] = useState([])
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const touchStartRef = useRef({ x: 0, y: 0, active: false })
  const skipNextClickRef = useRef(false)

  const storyEntries = useMemo(
    () => STORY_CONFIGS.map((entry) => ({ ...entry, title: t(`seasonRecap.stories.${entry.id}.title`) })),
    [t]
  )
  const resolvedSeasonName = seasonName || t('seasonRecap.intro.defaultSeason')

  const languageOptions = useMemo(
    () =>
      SUPPORTED_RECAP_LANGS.map((code) => ({
        code,
        label: t(`seasonRecap.language.options.${code}.short`, { defaultValue: code.toUpperCase() }),
        description: t(`seasonRecap.language.options.${code}.label`, { defaultValue: code.toUpperCase() })
      })),
    [t]
  )

  const activeLanguage = useMemo(() => {
    const current = i18n.language || 'en'
    return current.split('-')[0]
  }, [i18n.language])

  const stats = useMemo(() => {
    if (!matches || matches.length === 0) return null

    let totalGoals = 0
    let totalAssists = 0
    const playerStats = {}
    const playerAppearances = {}
    const hatTrickCounts = {}
    const uniqueScorers = new Set()
    const uniqueAssisters = new Set()
    const playerMap = {}
    players.forEach((p) => {
      if (!p || p.id == null) return
      playerMap[p.id] = p
    })

    const describeMatch = (match) =>
      match?.title ?? match?.name ?? match?.matchTitle ?? match?.note ?? extractDateKey(match) ?? null

    const getPlayer = (pid) => playerMap[pid] || { name: 'Unknown', id: pid }

    let goalFiesta = { goals: 0, label: null }

    matches.forEach((match) => {
      const attendees = extractAttendeeIds(match)
      attendees.forEach((pid) => {
        if (!pid) return
        playerAppearances[pid] = (playerAppearances[pid] || 0) + 1
      })

      const matchStats = extractStatsByPlayer(match)
      let matchGoals = 0
      Object.entries(matchStats).forEach(([pid, stat]) => {
        if (!playerStats[pid]) playerStats[pid] = { goals: 0, assists: 0, cleanSheets: 0 }
        const goals = Number(stat?.goals || 0)
        const assists = Number(stat?.assists || 0)
        const cleanSheets = Number(stat?.cleanSheet ?? stat?.cs ?? 0)
        playerStats[pid].goals += goals
        playerStats[pid].assists += assists
        playerStats[pid].cleanSheets += cleanSheets

        totalGoals += goals
        totalAssists += assists
        matchGoals += goals

        if (goals > 0) uniqueScorers.add(pid)
        if (assists > 0) uniqueAssisters.add(pid)
        if (goals >= 3) {
          hatTrickCounts[pid] = (hatTrickCounts[pid] || 0) + 1
        }
      })

      if (matchGoals > goalFiesta.goals) {
        goalFiesta = {
          goals: matchGoals,
          label: describeMatch(match),
          date: extractDateKey(match)
        }
      }
    })

    const buildTopList = (accessor) => {
      const entries = Object.entries(playerStats)
      if (entries.length === 0) return []
      let maxVal = -Infinity
      entries.forEach(([, stat]) => {
        const val = accessor(stat)
        if (val > maxVal) maxVal = val
      })
      if (!Number.isFinite(maxVal)) maxVal = 0
      return entries
        .filter(([, stat]) => accessor(stat) === maxVal)
        .map(([pid, stat]) => ({ ...getPlayer(pid), value: accessor(stat) }))
    }

    const buildAppearanceList = () => {
      const entries = Object.entries(playerAppearances)
      if (entries.length === 0) return []
      let maxVal = -Infinity
      entries.forEach(([, count]) => {
        if (count > maxVal) maxVal = count
      })
      if (!Number.isFinite(maxVal)) maxVal = 0
      return entries
        .filter(([, count]) => count === maxVal)
        .map(([pid, count]) => ({ ...getPlayer(pid), value: count }))
    }

    const ensureList = (list, placeholderId) => {
      if (list.length > 0) return list
      return [{ id: placeholderId, name: '—', value: 0 }]
    }

    const topScorers = ensureList(buildTopList((stat) => stat.goals), 'scorer-none')
    const topAssisters = ensureList(buildTopList((stat) => stat.assists), 'assist-none')
    const ironMen = ensureList(buildAppearanceList(), 'apps-none')
    const cleanSheetMasters = ensureList(buildTopList((stat) => stat.cleanSheets || 0), 'cs-none')

    const hatTrickClub = Object.entries(hatTrickCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([pid, count]) => ({ ...getPlayer(pid), count }))

    const rookies = Object.entries(playerAppearances)
      .filter(([, count]) => count === 1)
      .map(([pid]) => getPlayer(pid))

    return {
      totalMatches: matches.length,
      totalGoals,
      totalAssists,
      activePlayers: Object.keys(playerAppearances).length,
      topScorers,
      topAssisters,
      ironMen,
      avgGoalsPerMatch: matches.length ? Number((totalGoals / matches.length).toFixed(1)) : 0,
      hatTrickClub,
      rookies,
      goalFiesta,
      totalGoalContributors: uniqueScorers.size,
      totalAssistContributors: uniqueAssisters.size,
      cleanSheetMasters
    }
  }, [matches, players])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
    if (typeof document !== 'undefined') {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [])

  if (!stats) return null

  const {
    mom: momLeaders = [],
    duo: duoLeaders = [],
    draftPlayer: draftPlayerLeaders = [],
    draftCaptain: draftCaptainLeaders = []
  } = leaders || {}

  const safePrimary = (list) => (Array.isArray(list) && list.length > 0 ? list[0] : { id: 'na', name: '—', value: 0 })

  const primaryScorer = safePrimary(stats.topScorers)
  const primaryAssister = safePrimary(stats.topAssisters)
  const primaryIron = safePrimary(stats.ironMen)
  const primaryKeeper = safePrimary(stats.cleanSheetMasters)

  const formatListWithMore = useCallback((list, formatter = (item) => item.name, limit = 3) => {
    if (!Array.isArray(list) || list.length === 0) return ''
    const displayed = list.slice(0, limit).map(formatter)
    const remaining = list.length - displayed.length
    return remaining > 0
      ? `${displayed.join(', ')} ${t('seasonRecap.common.plusMore', { count: remaining })}`
      : displayed.join(', ')
  }, [t])

  const handleLanguageChange = useCallback((code) => {
    if (!code) return
    const normalized = code.split('-')[0]
    if (!normalized || normalized === activeLanguage) {
      setLanguageMenuOpen(false)
      return
    }
    if (!SUPPORTED_RECAP_LANGS.includes(normalized)) {
      setLanguageMenuOpen(false)
      return
    }
    setLanguageMenuOpen(false)
    void i18n.changeLanguage(normalized)
  }, [i18n, activeLanguage])

  const hatTrickTotal = stats.hatTrickClub.reduce((sum, p) => sum + p.count, 0)
  const topHatTrickNames = formatListWithMore(stats.hatTrickClub, (p) => `${p.name}${p.count > 1 ? ` (${p.count})` : ''}`)

  const renderMetricValue = (value, { decimals = 0, mode = 'animated', className = '' } = {}) => {
    const numericValue = Number(value) || 0
    if (mode === 'static') {
      const formatted = decimals > 0 ? numericValue.toFixed(decimals) : numericValue.toLocaleString()
      return <span className={className}>{formatted}</span>
    }
    return <AnimatedNumber value={numericValue} decimals={decimals} className={className} />
  }

  const renderStoryBody = (entryId, mode = 'animated') => {
    const fiestaMatchLabel = stats.goalFiesta.label || t('seasonRecap.common.matchFallback')
    const hatTrickPlayers = topHatTrickNames || t('seasonRecap.common.multiPlayers')
    const rookieNames = formatListWithMore(stats.rookies) || t('seasonRecap.stories.rookies.namesFallback')

    switch (entryId) {
      case 'fiesta':
        return stats.goalFiesta.goals > 0 ? (
          <>
            {t('seasonRecap.stories.fiesta.mainPrefix', { match: fiestaMatchLabel })}
            {renderMetricValue(stats.goalFiesta.goals, { mode, className: 'font-semibold text-white' })}
            {t('seasonRecap.stories.fiesta.mainSuffix')}
          </>
        ) : (
          <>{t('seasonRecap.stories.fiesta.alt')}</>
        )
      case 'hat-trick':
        return hatTrickTotal > 0 ? (
          <>
            {renderMetricValue(hatTrickTotal, { mode, className: 'font-semibold text-white' })}
            {t('seasonRecap.stories.hat-trick.mainSuffix', { players: hatTrickPlayers })}
          </>
        ) : (
          <>{t('seasonRecap.stories.hat-trick.alt')}</>
        )
      case 'rookies':
        return stats.rookies.length > 0 ? (
          <>
            {renderMetricValue(stats.rookies.length, { mode, className: 'font-semibold text-white' })}
            {t('seasonRecap.stories.rookies.mainSuffix', { names: rookieNames })}
          </>
        ) : (
          <>{t('seasonRecap.stories.rookies.alt')}</>
        )
      case 'energy':
        return (
          <>
            {t('seasonRecap.stories.energy.goalPrefix')}
            {renderMetricValue(stats.totalGoalContributors, { mode, className: 'font-semibold text-white' })}
            {t('seasonRecap.stories.energy.goalSuffix')}
            {t('seasonRecap.stories.energy.assistPrefix')}
            {renderMetricValue(stats.totalAssistContributors, { mode, className: 'font-semibold text-white' })}
            {t('seasonRecap.stories.energy.assistSuffix')}
            {t('seasonRecap.stories.energy.avgPrefix')}
            {renderMetricValue(stats.avgGoalsPerMatch, { mode, decimals: 1, className: 'font-semibold text-white' })}
            {t('seasonRecap.stories.energy.avgSuffix')}
          </>
        )
      default:
        return null
    }
  }

  const championSections = [
    {
      id: 'mom',
      title: t('seasonRecap.champions.sections.mom.title'),
      subtitle: t('seasonRecap.champions.sections.mom.subtitle'),
      icon: Crown,
      colorClass: 'text-amber-300',
      entries: momLeaders,
      unit: t('seasonRecap.metrics.awards'),
      valueKey: 'value'
    },
    {
      id: 'duo',
      title: t('seasonRecap.champions.sections.duo.title'),
      subtitle: t('seasonRecap.champions.sections.duo.subtitle'),
      icon: Handshake,
      colorClass: 'text-rose-200',
      entries: duoLeaders,
      unit: t('seasonRecap.metrics.goals'),
      type: 'duo',
      valueKey: 'count'
    },
    {
      id: 'draftPlayer',
      title: t('seasonRecap.champions.sections.draftPlayer.title'),
      subtitle: t('seasonRecap.champions.sections.draftPlayer.subtitle'),
      icon: Gamepad2,
      colorClass: 'text-sky-200',
      entries: draftPlayerLeaders,
      unit: t('seasonRecap.metrics.points'),
      valueKey: 'value'
    },
    {
      id: 'draftCaptain',
      title: t('seasonRecap.champions.sections.draftCaptain.title'),
      subtitle: t('seasonRecap.champions.sections.draftCaptain.subtitle'),
      icon: Shield,
      colorClass: 'text-emerald-200',
      entries: draftCaptainLeaders,
      unit: t('seasonRecap.metrics.points'),
      valueKey: 'value'
    }
  ]
  const selectTopEntries = (entries = [], key = 'value') => {
    if (!Array.isArray(entries) || entries.length === 0) return []
    let maxVal = Number.NEGATIVE_INFINITY
    entries.forEach((entry) => {
      const val = Number(entry?.[key] ?? 0)
      if (val > maxVal) maxVal = val
    })
    if (!Number.isFinite(maxVal)) maxVal = 0
    if (maxVal <= 0) return []
    const winners = entries.filter((entry) => Number(entry?.[key] ?? 0) === maxVal)
    return winners.length > 0 ? winners : entries.slice(0, 1)
  }
  const championDisplays = championSections
    .map((section) => ({
      ...section,
      winners: selectTopEntries(section.entries, section.valueKey || (section.type === 'duo' ? 'count' : 'value'))
    }))
    .filter((section) => section.winners.length > 0)
  const championChunks = []
  for (let i = 0; i < championDisplays.length; i += 2) {
    championChunks.push(championDisplays.slice(i, i + 2))
  }
  const championSlides = championChunks.map((chunk, idx) => ({
    id: `champions-${idx + 1}`,
    bg: idx % 2 === 0
      ? 'bg-gradient-to-tr from-slate-900 via-indigo-950 to-black'
      : 'bg-gradient-to-br from-indigo-950 via-purple-900 to-black',
    content: (
      <div className="relative h-full w-full">
        <div className="absolute inset-0 champion-aurora" aria-hidden="true" />
        <div className="absolute inset-0 champion-grid" aria-hidden="true" />
        <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
          <p className="text-[11px] uppercase tracking-[0.4em] text-white/60 mb-2">{t('seasonRecap.champions.label')}</p>
          <h2 className="text-2xl font-bold text-white mb-4">{t('seasonRecap.champions.slideTitle', { index: idx + 1 })}</h2>
          <div className="w-full max-w-sm space-y-3 text-left">
            {chunk.map((section) => (
              <div key={section.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="flex items-center gap-3">
                  <section.icon className={`h-6 w-6 ${section.colorClass}`} />
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/60">{section.subtitle}</p>
                    <p className="text-sm font-semibold text-white">{section.title}</p>
                  </div>
                </div>
                {(() => {
                  const visibleWinners = section.winners.slice(0, 2)
                  const remaining = Math.max(section.winners.length - visibleWinners.length, 0)
                  return (
                    <>
                      {section.type === 'duo'
                        ? visibleWinners.map((entry) => (
                            <div key={entry.id} className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex -space-x-3">
                                    <InitialAvatar
                                      id={entry.assist?.id}
                                      name={entry.assist?.name || t('seasonRecap.common.unknown')}
                                      photoUrl={entry.assist?.photoUrl}
                                      size={36}
                                      className="border-2 border-white/40 bg-black"
                                    />
                                    <InitialAvatar
                                      id={entry.scorer?.id}
                                      name={entry.scorer?.name || t('seasonRecap.common.unknown')}
                                      photoUrl={entry.scorer?.photoUrl}
                                      size={36}
                                      className="border-2 border-white/40 bg-black"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold">{entry.assist?.name || t('seasonRecap.common.unknown')}</p>
                                    <p className="text-[11px] text-white/60">{t('seasonRecap.champions.duoTo', { name: entry.scorer?.name || t('seasonRecap.common.unknown') })}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <AnimatedNumber value={entry.count} className="text-xl font-bold" />
                                  <p className="text-[10px] uppercase text-white/60">{section.unit}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        : visibleWinners.map((entry) => (
                            <div key={entry.id} className="mt-3 flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-sm text-white">
                              <div className="flex items-center gap-3">
                                <InitialAvatar
                                  id={entry.id}
                                  name={entry.name || t('seasonRecap.common.unknown')}
                                  photoUrl={entry.photoUrl}
                                  size={42}
                                  className="border-2 border-white/40 bg-black"
                                />
                                <div>
                                  <p className="font-semibold">{entry.name || t('seasonRecap.common.unknown')}</p>
                                  <p className="text-[11px] uppercase text-white/60">{section.unit}</p>
                                </div>
                              </div>
                              <AnimatedNumber value={entry.value} className="text-xl font-bold" />
                            </div>
                          ))}
                      {remaining > 0 && (
                        <p className="mt-3 rounded-2xl border border-dashed border-white/10 px-3 py-2 text-[11px] text-white/70">
                          {t('seasonRecap.champions.tieNote', { count: remaining })}
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }))

  const storyCount = storyEntries.length || 1
  const activeStory = storyEntries[storyActiveIndex % storyCount] || storyEntries[0]
  const activeStoryId = activeStory?.id || null
  const ActiveStoryIcon = activeStory?.icon || Sparkles
  const previousStoryIdRef = useRef(activeStoryId)
  useEffect(() => {
    const prevId = previousStoryIdRef.current
    if (prevId && prevId !== activeStoryId) {
      setPinnedStoryIds((prev) => (prev.includes(prevId) ? prev : [...prev, prevId]))
    }
    previousStoryIdRef.current = activeStoryId
  }, [activeStoryId])
  const pinnedStories = pinnedStoryIds
    .map((id) => storyEntries.find((entry) => entry.id === id))
    .filter(Boolean)
  const finaleStats = [
    { id: 'matches', label: t('seasonRecap.finale.stats.matches'), value: stats.totalMatches },
    { id: 'players', label: t('seasonRecap.finale.stats.players'), value: stats.activePlayers },
    { id: 'goals', label: t('seasonRecap.finale.stats.goals'), value: stats.totalGoals },
    { id: 'assists', label: t('seasonRecap.finale.stats.assists'), value: stats.totalAssists }
  ]

  const renderTieList = (players, metricKey) => {
    if (!Array.isArray(players) || players.length <= 1) return null
    const metricLabel = t(`seasonRecap.metrics.${metricKey}`)
    return (
      <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] text-white/80">
        {players.map((p) => (
          <span
            key={`${metricKey}-${p.id}`}
            className="rounded-full border border-white/30 px-2.5 py-0.5 backdrop-blur"
          >
            {(p.name || t('seasonRecap.common.unknown'))} · <AnimatedNumber value={p.value} className="font-semibold text-white" /> {metricLabel}
          </span>
        ))}
      </div>
    )
  }

  const portalTarget = typeof document !== 'undefined' ? document.body : null

  const seasonYear = useMemo(() => {
    const nameYearMatch = typeof seasonName === 'string' ? seasonName.match(/\b(20\d{2})\b/) : null
    if (nameYearMatch) return Number(nameYearMatch[1])

    const matchYears = (matches || [])
      .map((match) => {
        const explicitYear = Number(match?.seasonYear ?? match?.year)
        if (Number.isFinite(explicitYear)) return explicitYear

        const rawDate =
          match?.matchDate ||
          match?.date ||
          match?.startDate ||
          match?.kickoffAt ||
          match?.startTime ||
          match?.createdAt

        if (!rawDate) return null
        const parsedDate = rawDate instanceof Date ? rawDate : new Date(rawDate)
        const parsedYear = parsedDate.getFullYear()
        return Number.isFinite(parsedYear) ? parsedYear : null
      })
      .filter((year) => Number.isFinite(year))

    if (matchYears.length > 0) {
      return matchYears.reduce((max, year) => Math.max(max, year), matchYears[0])
    }

    return new Date().getFullYear()
  }, [seasonName, matches])

  const nextSeasonLabel = useMemo(() => String((seasonYear || new Date().getFullYear()) + 1), [seasonYear])

  const pulseBackgroundPlayers = useMemo(() => {
    if (!Array.isArray(matches) || !Array.isArray(players)) return []
    const seen = new Set()
    matches.forEach((match) => {
      const attendees = extractAttendeeIds(match) || []
      attendees.forEach((pid) => {
        if (pid) seen.add(pid)
      })
    })
    return players.filter((player) => hasRealPhoto(player?.photoUrl) && seen.has(player.id))
  }, [matches, players])

  useEffect(() => {
    let cancelled = false
    if (!pulseBackgroundPlayers || pulseBackgroundPlayers.length === 0) {
      setVerifiedPulsePlayers([])
      return undefined
    }
    const verifyAll = async () => {
      try {
        const results = await Promise.all(
          pulseBackgroundPlayers.map(async (player) => {
            const ok = await verifyPhotoAsset(player.photoUrl)
            return ok ? player : null
          })
        )
        if (!cancelled) {
          setVerifiedPulsePlayers(results.filter(Boolean))
        }
      } catch (err) {
        if (!cancelled) {
          setVerifiedPulsePlayers([])
        }
      }
    }
    verifyAll()
    return () => {
      cancelled = true
    }
  }, [pulseBackgroundPlayers])

  const pulseBackgroundTiles = useMemo(() => {
    if (!verifiedPulsePlayers || verifiedPulsePlayers.length === 0) return []
    const tiles = [...verifiedPulsePlayers, ...verifiedPulsePlayers]
    while (tiles.length < 24) {
      tiles.push(...verifiedPulsePlayers)
      if (tiles.length > 64) break
    }
    return tiles
  }, [verifiedPulsePlayers])

  const pulseScrollDuration = useMemo(() => {
    if (!pulseBackgroundTiles || pulseBackgroundTiles.length === 0) return 0
    return Math.max(18, pulseBackgroundTiles.length * 0.8)
  }, [pulseBackgroundTiles])

  const overviewCards = [
    {
      id: 'consistency',
      icon: Calendar,
      colorClass: 'text-yellow-300',
      title: t('seasonRecap.overview.cards.consistency.title'),
      body: t('seasonRecap.overview.cards.consistency.body')
    },
    {
      id: 'care',
      icon: Users,
      colorClass: 'text-blue-300',
      title: t('seasonRecap.overview.cards.care.title'),
      body: t('seasonRecap.overview.cards.care.body')
    },
    {
      id: 'passion',
      icon: Activity,
      colorClass: 'text-green-300',
      title: t('seasonRecap.overview.cards.passion.title'),
      body: t('seasonRecap.overview.cards.passion.body')
    }
  ]

  const slides = [
    {
      id: 'intro',
      bg: 'bg-gradient-to-br from-purple-900 via-indigo-900 to-black',
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center p-4 animate-fade-in-up">
          <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-3">
            {resolvedSeasonName}
            <br />
            {t('seasonRecap.intro.titleSuffix')}
          </h1>
          <p className="text-base text-indigo-200 mb-4">{t('seasonRecap.intro.tagline')}</p>
          <div className="text-5xl mb-4 animate-bounce">⚽️</div>
          <p className="text-xs text-white/50 uppercase tracking-widest">{t('seasonRecap.common.tapHint')}</p>
        </div>
      )
    },
    {
      id: 'overview',
      bg: 'bg-gradient-to-bl from-pink-900 via-rose-900 to-black',
      content: (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
          {pulseBackgroundTiles.length > 0 && (
            <div className="absolute inset-0 pointer-events-none px-6">
              <div
                className="grid w-full grid-cols-[repeat(auto-fit,minmax(52px,1fr))] justify-items-center gap-4 opacity-30"
                style={{
                  animation: pulseScrollDuration
                    ? `pulse-grid-scroll ${pulseScrollDuration}s linear infinite`
                    : undefined
                }}
              >
                {pulseBackgroundTiles.map((player, idx) => (
                  <div
                    key={`${player.id ?? 'pulse'}-${idx}`}
                    className="rounded-full border border-white/10 bg-black/30 p-1 shadow-lg shadow-black/40"
                    style={{ animation: `pulse-grid-rise 1.4s ease-out ${idx * 0.04}s both` }}
                  >
                    <InitialAvatar
                      id={player.id}
                      name={player.name}
                      photoUrl={player.photoUrl}
                      size={52}
                      className="border border-white/10"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/85 pointer-events-none" aria-hidden="true" />
          <div className="relative z-10 mx-4 flex h-auto flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/35 p-5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <p className="text-[11px] uppercase tracking-[0.4em] text-white/60">{t('seasonRecap.overview.label')}</p>
            <h2 className="text-2xl font-bold text-white mt-2 mb-4">{t('seasonRecap.overview.title')}</h2>
            <p className="text-sm text-white/70 max-w-xs">
              {t('seasonRecap.overview.description')}
            </p>
            <div className="mt-6 w-full max-w-xs space-y-3 text-left">
              {overviewCards.map((card) => (
                <div key={card.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-3 text-white">
                    <card.icon className={`h-5 w-5 ${card.colorClass}`} />
                    <div>
                      <p className="text-[11px] text-white/60">{card.title}</p>
                      <p className="text-sm">{card.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'top-scorer',
      bg: 'bg-gradient-to-tr from-yellow-900 via-orange-900 to-black',
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="golden-boot-rings" />
            <div className="golden-boot-sparkles" />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <GoldenBootIcon className="w-14 h-14 text-yellow-300 mb-2 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]" />
            <h2 className="text-lg font-bold text-orange-200">{t('seasonRecap.slides.goldenBoot.title')}</h2>
            <h3 className="text-sm text-white/60 mb-3">{t('seasonRecap.slides.goldenBoot.subtitle')}</h3>

            <div className="relative mb-3">
              <div className="absolute -inset-2 bg-yellow-500/20 rounded-full blur-lg" />
              <InitialAvatar
                id={primaryScorer.id}
                name={primaryScorer.name || t('seasonRecap.common.unknown')}
                photoUrl={primaryScorer.photoUrl}
                size={80}
                className="border-2 border-yellow-400 shadow-xl"
              />
            </div>

            <h1 className="text-2xl font-black text-white mb-2">{primaryScorer.name || t('seasonRecap.common.unknown')}</h1>
            <div className="bg-yellow-500/20 px-4 py-1.5 rounded-full border border-yellow-500/50">
              <AnimatedNumber value={primaryScorer.value} className="text-xl font-bold text-yellow-400" />
              <span className="text-xs text-yellow-200 ml-1.5 uppercase">{t('seasonRecap.metrics.goals')}</span>
            </div>
            {renderTieList(stats.topScorers, 'goals')}
          </div>
        </div>
      )
    },
    {
      id: 'top-assister',
      bg: 'bg-gradient-to-br from-blue-900 via-cyan-900 to-black',
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="playmaker-orbit" />
            <div className="playmaker-dots" />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <Target className="w-12 h-12 text-cyan-400 mb-2 animate-spin-slow" />
            <h2 className="text-lg font-bold text-cyan-200">{t('seasonRecap.slides.playmaker.title')}</h2>
            <h3 className="text-sm text-white/60 mb-3">{t('seasonRecap.slides.playmaker.subtitle')}</h3>

            <div className="relative mb-3">
              <div className="absolute -inset-2 bg-cyan-500/20 rounded-full blur-lg" />
              <InitialAvatar
                id={primaryAssister.id}
                name={primaryAssister.name || t('seasonRecap.common.unknown')}
                photoUrl={primaryAssister.photoUrl}
                size={80}
                className="border-2 border-cyan-400 shadow-xl"
              />
            </div>

            <h1 className="text-2xl font-black text-white mb-2">{primaryAssister.name || t('seasonRecap.common.unknown')}</h1>
            <div className="bg-cyan-500/20 px-4 py-1.5 rounded-full border border-cyan-500/50">
              <AnimatedNumber value={primaryAssister.value} className="text-xl font-bold text-cyan-400" />
              <span className="text-xs text-cyan-200 ml-1.5 uppercase">{t('seasonRecap.metrics.assists')}</span>
            </div>
            {renderTieList(stats.topAssisters, 'assists')}
          </div>
        </div>
      )
    },
    {
      id: 'iron-man',
      bg: 'bg-gradient-to-tl from-emerald-900 via-green-900 to-black',
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="ironman-grid" />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <Star className="w-12 h-12 text-emerald-400 mb-2" />
            <h2 className="text-lg font-bold text-emerald-200">{t('seasonRecap.slides.ironman.title')}</h2>
            <h3 className="text-sm text-white/60 mb-3">{t('seasonRecap.slides.ironman.subtitle')}</h3>

            <div className="relative mb-3">
              <div className="absolute -inset-2 bg-emerald-500/20 rounded-full blur-lg" />
              <InitialAvatar
                id={primaryIron.id}
                name={primaryIron.name || t('seasonRecap.common.unknown')}
                photoUrl={primaryIron.photoUrl}
                size={80}
                className="border-2 border-emerald-400 shadow-xl"
              />
            </div>

            <h1 className="text-2xl font-black text-white mb-2">{primaryIron.name || t('seasonRecap.common.unknown')}</h1>
            <div className="bg-emerald-500/20 px-4 py-1.5 rounded-full border border-emerald-500/50">
              <AnimatedNumber value={primaryIron.value} className="text-xl font-bold text-emerald-400" />
              <span className="text-xs text-emerald-200 ml-1.5 uppercase">{t('seasonRecap.metrics.matches')}</span>
            </div>
            {renderTieList(stats.ironMen, 'matches')}
          </div>
        </div>
      )
    },
    {
      id: 'clean-sheet',
      bg: 'bg-gradient-to-br from-slate-900 via-slate-950 to-black',
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="clean-sheet-lines" />
            <div className="clean-sheet-shields" />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <Shield className="w-12 h-12 text-blue-200 mb-2" />
            <h2 className="text-lg font-bold text-blue-100">{t('seasonRecap.slides.wallKeepers.title')}</h2>
            <h3 className="text-sm text-white/60 mb-3">{t('seasonRecap.slides.wallKeepers.subtitle')}</h3>

            <div className="relative mb-3">
              <div className="absolute -inset-2 bg-blue-400/20 rounded-full blur-lg" />
              <InitialAvatar
                id={primaryKeeper.id}
                name={primaryKeeper.name || t('seasonRecap.common.unknown')}
                photoUrl={primaryKeeper.photoUrl}
                size={80}
                className="border-2 border-blue-200 shadow-xl"
              />
            </div>

            <h1 className="text-2xl font-black text-white mb-2">{primaryKeeper.name || t('seasonRecap.common.unknown')}</h1>
            <div className="bg-blue-400/20 px-4 py-1.5 rounded-full border border-blue-300/50">
              <AnimatedNumber value={primaryKeeper.value} className="text-xl font-bold text-blue-100" />
              <span className="text-xs text-blue-100/80 ml-1.5 uppercase">{t('seasonRecap.metrics.cleanSheets')}</span>
            </div>
            {renderTieList(stats.cleanSheetMasters, 'cleanSheets')}
          </div>
        </div>
      )
    },
    ...championSlides,
    {
      id: 'stories',
      bg: 'bg-gradient-to-b from-slate-900 via-slate-950 to-black',
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
          <div className="stories-wave" aria-hidden="true" />
          <div className="stories-particles" aria-hidden="true" />
          <div className="relative z-10 w-full max-w-xs mx-auto">
            <h2 className="text-2xl font-bold text-white mb-4">{t('seasonRecap.stories.heading')}</h2>
            {storyExpanded ? (
              <div className="w-full space-y-3 text-left text-sm text-white/80">
                {storyEntries.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <entry.icon className={`mt-0.5 h-5 w-5 ${entry.iconClass}`} />
                    <div>
                      <p className="text-[11px] text-white/60">{entry.title}</p>
                      <p className="text-sm text-white">{renderStoryBody(entry.id, 'animated')}</p>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setStoryExpanded(false)
                    setStoryActiveIndex(0)
                    setPinnedStoryIds([])
                    previousStoryIdRef.current = storyEntries[0]?.id || null
                  }}
                  className="mt-4 w-full rounded-full border border-white/20 py-2 text-xs font-semibold tracking-wide text-white/80"
                >
                  {t('seasonRecap.stories.compactButton')}
                </button>
              </div>
            ) : (
              <div className="w-full space-y-3 text-left text-sm text-white/80">
                <div className="space-y-2">
                  {pinnedStories.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 opacity-80 transition-all duration-500 ease-out"
                      style={{ animation: `story-stack-slide 0.45s ease ${idx * 0.04}s both` }}
                    >
                      <entry.icon className={`mt-0.5 h-4 w-4 ${entry.iconClass}`} />
                      <div>
                        <p className="text-[11px] text-white/60">{entry.title}</p>
                        <p className="text-xs text-white">{renderStoryBody(entry.id, 'static')}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  key={activeStory.id}
                  className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg"
                >
                  <ActiveStoryIcon className={`mt-0.5 h-5 w-5 ${activeStory.iconClass}`} />
                  <div>
                    <p className="text-[11px] text-white/70">{activeStory.title}</p>
                    <p className="text-sm text-white">{renderStoryBody(activeStory.id, 'animated')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'outro',
      bg: 'bg-gradient-to-br from-slate-900 via-slate-950 to-black',
      content: (
        <div className="relative h-full w-full">
          <div className="absolute inset-0 champion-aurora" aria-hidden="true" />
          <div className="absolute inset-0 champion-grid" aria-hidden="true" />
          <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-[11px] uppercase tracking-[0.4em] text-white/60 mb-2">{t('seasonRecap.finale.label')}</p>
            <h1 className="text-2xl font-bold text-white mb-6">{t('seasonRecap.finale.title')}</h1>
            <div className="w-full max-w-sm space-y-4 text-left">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {finaleStats.map((stat) => (
                    <div key={stat.id} className="text-left">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">{stat.label}</p>
                      <AnimatedNumber value={stat.value} className="text-2xl font-bold text-white" />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/70 leading-relaxed text-center">
                  {t('seasonRecap.finale.description', { season: nextSeasonLabel })
                    .split('\n')
                    .map((line, idx, arr) => (
                      <span key={idx}>
                        {line}
                        {idx < arr.length - 1 && <br />}
                      </span>
                    ))}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                {t('seasonRecap.finale.cta')}
              </button>
            </div>
          </div>
        </div>
      )
    }
  ]

  const slideCount = slides.length
  const currentSlideId = slides[activeSlide]?.id
  const isStorySlideActive = currentSlideId === 'stories'
  useEffect(() => {
    if (!isStorySlideActive) {
      setStoryExpanded(false)
      setStoryActiveIndex(0)
      setPinnedStoryIds([])
      previousStoryIdRef.current = storyEntries[0]?.id || null
    }
  }, [isStorySlideActive])
  useEffect(() => {
    if (!isStorySlideActive || storyExpanded) return
    if (storyEntries.length <= 1) return
    if (pinnedStoryIds.length >= storyEntries.length - 1) return
    const timer = setInterval(() => {
      setStoryActiveIndex((prev) => (prev + 1) % storyEntries.length)
    }, 3200)
    return () => clearInterval(timer)
  }, [isStorySlideActive, storyExpanded, pinnedStoryIds.length])

  const handleNext = useCallback(() => {
    setActiveSlide((prev) => {
      if (prev < slideCount - 1) return prev + 1
      onClose()
      return prev
    })
  }, [slideCount, onClose])

  const handlePrev = useCallback(() => {
    setActiveSlide((prev) => (prev > 0 ? prev - 1 : prev))
  }, [])

  const handleContainerClick = useCallback((event) => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false
      return
    }
    if (languageMenuOpen) {
      setLanguageMenuOpen(false)
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const relativeX = event.clientX - rect.left
    const threshold = rect.width / 3
    if (relativeX <= threshold) {
      handlePrev()
    } else {
      handleNext()
    }
  }, [handleNext, handlePrev, languageMenuOpen])

  useEffect(() => {
    if (isStorySlideActive && storyExpanded) return
    const timer = setTimeout(() => {
      handleNext()
    }, 5000)
    return () => clearTimeout(timer)
  }, [activeSlide, handleNext, isStorySlideActive, storyExpanded])

  const handleTouchStart = useCallback((event) => {
    if (event.touches.length !== 1) {
      touchStartRef.current.active = false
      return
    }
    if (isInteractiveTouchTarget(event.target)) {
      touchStartRef.current.active = false
      return
    }
    const touch = event.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      active: true
    }
  }, [])

  const handleTouchEnd = useCallback((event) => {
    if (!touchStartRef.current.active) return
    const touch = event.changedTouches[0]
    touchStartRef.current.active = false
    if (!touch) return

    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const absDeltaX = Math.abs(deltaX)
    const absDeltaY = Math.abs(deltaY)
    const isSwipe = absDeltaX > 30 && absDeltaX > absDeltaY
    const isTap = absDeltaX < 18 && absDeltaY < 18
    if (!isSwipe && !isTap) return

    skipNextClickRef.current = true
    event.preventDefault()

    if (isSwipe) {
      if (deltaX < 0) {
        handleNext()
      } else {
        handlePrev()
      }
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const relativeX = touch.clientX - rect.left
    const threshold = rect.width / 3
    if (relativeX <= threshold) {
      handlePrev()
    } else {
      handleNext()
    }
  }, [handleNext, handlePrev])

  const handleTouchCancel = useCallback(() => {
    touchStartRef.current.active = false
  }, [])

  const activeSlideContextValue = `${currentSlideId || 'slide'}-${activeSlide}`

  if (!portalTarget) return null

  return createPortal(
    <ActiveSlideContext.Provider value={activeSlideContextValue}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
        <div 
          className={`w-full h-full max-h-[100dvh] md:max-w-sm md:max-h-[600px] md:rounded-3xl overflow-hidden relative shadow-2xl transition-colors duration-700 ease-in-out ${slides[activeSlide].bg}`}
          onClick={handleContainerClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex gap-1 z-20">
          {slides.map((_, idx) => (
            <div key={idx} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-white transition-all duration-300 ${
                  idx < activeSlide ? 'w-full' : 
                  idx === activeSlide ? 'w-full animate-progress' : 'w-0'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Language Toggle */}
        <div className="absolute top-14 left-4 z-30">
          <div className="relative">
            <button
              type="button"
              aria-label={t('seasonRecap.language.label')}
              className="h-9 w-9 rounded-full border border-white/25 bg-black/35 text-xl flex items-center justify-center shadow-md shadow-black/40 text-white"
              onClick={(e) => {
                e.stopPropagation()
                setLanguageMenuOpen((prev) => !prev)
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {LANGUAGE_FLAGS[activeLanguage] || '🌐'}
            </button>
            {languageMenuOpen && (
              <div
                className="absolute left-0 mt-2 w-32 rounded-2xl border border-white/15 bg-black/85 p-2 text-left shadow-xl backdrop-blur"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <p className="text-[9px] uppercase tracking-[0.28em] text-white/45 mb-1">
                  {t('seasonRecap.language.label')}
                </p>
                <div className="space-y-1">
                  {languageOptions.map((option) => {
                    const isActive = option.code === activeLanguage
                    return (
                      <button
                        key={option.code}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                          isActive ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLanguageChange(option.code)
                        }}
                      >
                        <span className="text-base">{LANGUAGE_FLAGS[option.code] || '🌐'}</span>
                        <span>{option.description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Close Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-6 right-4 z-20 text-white/50 hover:text-white p-2"
        >
          <X size={24} />
        </button>

          {/* Content */}
          <div className="h-full w-full">
            {slides[activeSlide].content}
          </div>

        </div>
        
        <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes story-stack-slide {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-grid-rise {
          from { opacity: 0; transform: translateY(32px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse-grid-scroll {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        .golden-boot-rings {
          position: absolute;
          inset: -30%;
          background: conic-gradient(from 90deg, rgba(255,215,128,0.2), rgba(255,165,0,0.6), rgba(255,215,128,0.2));
          filter: blur(32px);
          opacity: 0.4;
          animation: golden-rings-spin 18s linear infinite;
        }
        .golden-boot-sparkles {
          position: absolute;
          inset: -10%;
          background-image: radial-gradient(rgba(255,255,255,0.6) 1px, transparent 0);
          background-size: 140px 140px;
          opacity: 0.25;
          animation: golden-sparkle-float 9s linear infinite;
        }
        @keyframes golden-rings-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes golden-sparkle-float {
          from { transform: translateY(0); }
          to { transform: translateY(-60px); }
        }
        .playmaker-orbit {
          position: absolute;
          inset: -12%;
          border: 1.5px dashed rgba(255,255,255,0.25);
          border-radius: 50%;
          animation: playmaker-orbit-spin 14s linear infinite;
          opacity: 0.5;
        }
        .playmaker-dots {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle at 10px 10px, rgba(34,211,238,0.35) 2px, transparent 0);
          background-size: 80px 80px;
          opacity: 0.4;
          animation: playmaker-dots-drift 11s ease-in-out infinite;
        }
        @keyframes playmaker-orbit-spin {
          from { transform: rotate(0deg) scale(1); }
          to { transform: rotate(360deg) scale(1.05); }
        }
        @keyframes playmaker-dots-drift {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(20px, -15px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        .ironman-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(16,185,129,0.2) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16,185,129,0.2) 1px, transparent 1px);
          background-size: 60px 60px;
          opacity: 0.25;
          animation: ironman-grid-pan 8s linear infinite;
        }
        @keyframes ironman-grid-pan {
          from { transform: translate3d(0,0,0); }
          to { transform: translate3d(-60px, 60px, 0); }
        }
        .clean-sheet-shields {
          position: absolute;
          inset: -25%;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(59,130,246,0.25) 8%, transparent 50%),
            radial-gradient(circle at 70% 60%, rgba(191,219,254,0.2) 10%, transparent 55%),
            radial-gradient(circle at 40% 80%, rgba(147,197,253,0.3) 7%, transparent 50%);
          filter: blur(10px);
          opacity: 0.35;
          animation: clean-sheet-float 12s ease-in-out infinite;
        }
        @keyframes clean-sheet-float {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-18px) scale(1.05); }
          100% { transform: translateY(0) scale(1); }
        }
        .clean-sheet-lines {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(191,219,254,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(191,219,254,0.1) 1px, transparent 1px);
          background-size: 90px 90px;
          opacity: 0.25;
          animation: clean-sheet-lines-move 10s linear infinite;
        }
        @keyframes clean-sheet-lines-move {
          from { transform: translate3d(0,0,0); }
          to { transform: translate3d(-90px, 45px, 0); }
        }
        .champion-aurora {
          background: radial-gradient(circle at 20% 20%, rgba(236,72,153,0.35), transparent 55%),
            radial-gradient(circle at 80% 30%, rgba(59,130,246,0.35), transparent 60%),
            radial-gradient(circle at 50% 80%, rgba(14,165,233,0.2), transparent 65%);
          filter: blur(60px);
          opacity: 0.5;
          animation: champion-aurora-shift 14s ease-in-out infinite;
        }
        .champion-grid {
          background-image:
            linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 70px 70px;
          opacity: 0.15;
          animation: champion-grid-pan 12s linear infinite;
        }
        @keyframes champion-aurora-shift {
          0% { transform: scale(1) translate3d(0,0,0); }
          50% { transform: scale(1.1) translate3d(20px,-20px,0); }
          100% { transform: scale(1) translate3d(0,0,0); }
        }
        @keyframes champion-grid-pan {
          from { transform: translate3d(0,0,0); }
          to { transform: translate3d(-70px, 70px, 0); }
        }
        .stories-wave {
          position: absolute;
          inset: -30% 0 auto;
          height: 70%;
          background: radial-gradient(circle at 50% 50%, rgba(125,211,252,0.08), transparent 70%);
          filter: blur(40px);
          animation: stories-wave-rise 10s ease-in-out infinite;
        }
        .stories-particles {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.25) 2px, transparent 0);
          background-size: 120px 120px;
          opacity: 0.2;
          animation: stories-particles-float 9s linear infinite;
        }
        @keyframes stories-wave-rise {
          0% { transform: translateY(10px); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(10px); }
        }
        @keyframes stories-particles-float {
          from { transform: translate3d(0,0,0); }
          to { transform: translate3d(0,-40px,0); }
        }
      `}</style>
      </div>
    </ActiveSlideContext.Provider>,
    portalTarget
  );
}

const sanitizeCountValue = (raw) => {
  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) return 0
  return numeric < 0 ? 0 : numeric
}

function useCountUp(targetValue = 0, duration = 1400, resetSignal = null) {
  const [display, setDisplay] = useState(0)
  const previousValueRef = useRef(0)

  useEffect(() => {
    previousValueRef.current = 0
    setDisplay(0)
  }, [resetSignal])

  useEffect(() => {
    const target = sanitizeCountValue(targetValue)
    const startValue = sanitizeCountValue(previousValueRef.current)
    const delta = target - startValue
    let latestValue = startValue
    let raf

    if (duration <= 0 || Math.abs(delta) < 0.0001) {
      latestValue = target
      setDisplay(latestValue)
      previousValueRef.current = latestValue
      return undefined
    }

    const start = typeof performance !== 'undefined' ? performance.now() : Date.now()

    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const nextValue = startValue + delta * progress
      latestValue = sanitizeCountValue(nextValue)
      setDisplay(latestValue)
      if (progress < 1) {
        raf = requestAnimationFrame(animate)
      } else {
        previousValueRef.current = latestValue
      }
    }

    raf = requestAnimationFrame(animate)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      previousValueRef.current = latestValue
    }
  }, [targetValue, duration, resetSignal])

  return display
}

function AnimatedNumber({ value = 0, decimals = 0, className = '' }) {
  const activeSlideKey = useContext(ActiveSlideContext)
  const animated = sanitizeCountValue(useCountUp(value, 1400, activeSlideKey))
  const formatted = decimals > 0
    ? animated.toFixed(decimals)
    : Math.round(animated).toLocaleString()
  return <span className={className}>{formatted}</span>
}

function GoldenBootIcon({ className = '' }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="trophy-glow" x1="14" y1="10" x2="50" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF7D0" />
          <stop offset="40%" stopColor="#FCD34D" />
          <stop offset="100%" stopColor="#EA8A1F" />
        </linearGradient>
      </defs>
      <path
        d="M18 12h28v4.5c0 6.8-3.3 13.2-8.8 17l-1.7 1.2v6.3h-9v-6.3l-1.7-1.2c-5.5-3.8-8.8-10.2-8.8-17Z"
        fill="url(#trophy-glow)"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M14 12v3.8c0 5.5 3.1 10.6 7.9 13.1l2.8 1.4"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M50 12v3.8c0 5.5-3.1 10.6-7.9 13.1l-2.8 1.4"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M24 40h16v4.8c0 3.2-2.6 5.8-5.8 5.8h-4.4c-3.2 0-5.8-2.6-5.8-5.8Z"
        fill="url(#trophy-glow)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.2"
      />
      <path
        d="M21 52h22v8H21Z"
        fill="url(#trophy-glow)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M18 60h28"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
