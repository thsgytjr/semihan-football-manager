import React, { useMemo, useState, useEffect, useCallback, useRef, useContext } from 'react'
import { createPortal } from 'react-dom'
import { X, Users, Activity, Calendar, Star, Target, Sparkles, Flame, Smile, Crown, Handshake, Gamepad2, Shield } from 'lucide-react'
import { extractStatsByPlayer, extractAttendeeIds, extractDateKey } from '../lib/matchUtils'
import InitialAvatar from './InitialAvatar'
import { optimizeImageUrl } from '../utils/imageOptimization'
import { useTranslation } from 'react-i18next'
import { TEAM_CONFIG } from '../lib/teamConfig'

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

const MAX_PINNED_STORIES = 3

const SUPPORTED_RECAP_LANGS = ['en', 'ko']
const LANGUAGE_FLAGS = {
  en: '🇺🇸',
  ko: '🇰🇷'
}

const INTERACTIVE_TOUCH_SELECTOR = 'button, a, input, select, textarea, [data-recap-interactive="true"], [role="button"]'

const R2_SHARED_MEDIA_BASE = `${(TEAM_CONFIG?.r2?.publicUrl || '').replace(/\/+$/, '')}/shared/season-recaps-media`
const RECAP_INTRO_VIDEO = `${R2_SHARED_MEDIA_BASE}/begin.mp4`
const RECAP_OUTRO_VIDEO = `${R2_SHARED_MEDIA_BASE}/ending.mp4`
const RECAP_STORY_VIDEO = `${R2_SHARED_MEDIA_BASE}/season-story.mp4`
const RECAP_ATTACK_VIDEO = `${R2_SHARED_MEDIA_BASE}/best-attack-point.mp4`
const RECAP_GOLDEN_BOOT_VIDEO = `${R2_SHARED_MEDIA_BASE}/golden-boot.mp4`
const RECAP_PLAYMAKER_VIDEO = `${R2_SHARED_MEDIA_BASE}/top-assist.mp4`
const RECAP_DEFENDER_VIDEO = `${R2_SHARED_MEDIA_BASE}/best-defender.mp4`
const RECAP_IRONMAN_VIDEO = `${R2_SHARED_MEDIA_BASE}/most-game-played.mp4`
const RECAP_MOM_VIDEO = `${R2_SHARED_MEDIA_BASE}/mom.mp4`
const RECAP_DUO_VIDEO = `${R2_SHARED_MEDIA_BASE}/duo.mp4`
const RECAP_DRAFT_PLAYER_VIDEO = `${R2_SHARED_MEDIA_BASE}/draft-player.mp4`
const RECAP_CAPTAIN_VIDEO = `${R2_SHARED_MEDIA_BASE}/best-captain.mp4`
const RECAP_VIDEO_SOURCES = [
  RECAP_INTRO_VIDEO,
  RECAP_STORY_VIDEO,
  RECAP_OUTRO_VIDEO,
  RECAP_ATTACK_VIDEO,
  RECAP_GOLDEN_BOOT_VIDEO,
  RECAP_PLAYMAKER_VIDEO,
  RECAP_DEFENDER_VIDEO,
  RECAP_IRONMAN_VIDEO,
  RECAP_MOM_VIDEO,
  RECAP_DUO_VIDEO,
  RECAP_DRAFT_PLAYER_VIDEO,
  RECAP_CAPTAIN_VIDEO
]

const prefetchVideo = (src) => {
  if (typeof window === 'undefined') return
  if (!src) return
  const video = document.createElement('video')
  video.preload = 'auto'
  video.src = src
  video.muted = true
  video.playsInline = true
  // Safari iOS는 load 호출이 필요할 수 있음
  try {
    video.load()
  } catch (_) {
    /* noop */
  }
}

const ensurePreloadLinks = () => {
  if (typeof document === 'undefined') return
  const head = document.head || document.getElementsByTagName('head')[0]
  if (!head) return
  RECAP_VIDEO_SOURCES.forEach((src) => {
    if (!src) return
    const existing = head.querySelector(`link[data-recap-preload="${src}"]`)
    if (existing) return
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'video'
    link.href = src
    link.crossOrigin = 'anonymous'
    link.setAttribute('data-recap-preload', src)
    head.appendChild(link)
  })
}

export const prefetchSeasonRecapVideos = () => {
  ensurePreloadLinks()
  RECAP_VIDEO_SOURCES.forEach(prefetchVideo)
}

const VideoBackground = ({ src, overlayClass = '' }) => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl md:rounded-[28px]">
    <video
      key={src}
      className="h-full w-full object-cover scale-[1.08]"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
    {overlayClass ? <div className={`absolute inset-0 ${overlayClass}`} aria-hidden="true" /> : null}
  </div>
)

const isInteractiveTouchTarget = (target) => {
  if (typeof window === 'undefined') return false
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest(INTERACTIVE_TOUCH_SELECTOR))
}

const hasRealPhoto = (photoUrl) => {
  if (typeof photoUrl !== 'string') return false
  const trimmed = photoUrl.trim()
  if (!trimmed) return false
  if (trimmed.length < 10) return false // Too short to be a valid URL

  // Filter out generated initials/placeholder avatar services
  const placeholderMatches = /(ui-avatars|dicebear|placeholder|identicon|initials|default-avatar|avatar-default|no[-_]?photo|noimage|noface|gravatar)/i
  if (placeholderMatches.test(trimmed)) return false

  if (trimmed.startsWith('data:image')) return true
  if (trimmed.startsWith('blob:')) return true
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true
  return false
}

const isInitialOnlyName = (name) => {
  if (typeof name !== 'string') return true
  const trimmed = name.trim()
  if (!trimmed) return true
  // Single character of any script (e.g., "A", "이")
  if (trimmed.length === 1) return true
  // Pure Latin initials up to 3 chars, optional dots or parentheses: "A", "AB", "A.B", "(KJ)"
  if (/^\(?[A-Z]{1,3}\)?$/.test(trimmed)) return true
  if (/^[A-Z](?:\.[A-Z])+$/.test(trimmed)) return true
  if (/^\(?[A-Z]{1,3}[.)]$/.test(trimmed)) return true
  // Parenthesized single Hangul initial like "(이)"
  if (/^\([가-힣]\)$/.test(trimmed)) return true
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
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    photoVerificationCache.set(trimmed, true)
    return Promise.resolve(true)
  }

  // Use optimized URL to match InitialAvatar behavior (size=52 -> target~104)
  const optimizedUrl = optimizeImageUrl(trimmed, { width: 104, height: 104, quality: 65, format: 'webp' })

  const promise = fetch(optimizedUrl, { method: 'GET', mode: 'cors', cache: 'default' })
    .then(async (res) => {
      if (!res.ok) return false
      const blob = await res.blob()
      // Filter out small images (likely tracking pixels or broken placeholders)
      if (blob.size < 1000) return false 
      // Filter out text/html responses (sometimes 404 pages return 200 OK with HTML)
      if (blob.type.includes('text') || blob.type.includes('html')) return false
      return true
    })
    .catch(() => false)
    .then((result) => {
      photoVerificationCache.set(trimmed, result)
      photoVerificationInflight.delete(trimmed)
      return result
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
    const attackLeaderList = buildTopList((stat) => (stat.goals || 0) + (stat.assists || 0))
    const attackLeaders = (attackLeaderList.length > 0
      ? attackLeaderList
      : [{ id: 'attack-none', name: '—', value: 0 }]
    ).map((entry) => {
      const base = playerStats[entry.id] || { goals: 0, assists: 0 }
      return {
        ...entry,
        goals: base.goals || 0,
        assists: base.assists || 0
      }
    })

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
      cleanSheetMasters,
      attackLeaders
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

  // Filter momLeaders to only include players with max awards (handle ties)
  const topMomLeaders = (() => {
    if (!Array.isArray(momLeaders) || momLeaders.length === 0) return []
    const maxAwards = Math.max(...momLeaders.map(p => p.value || 0))
    return momLeaders.filter(p => p.value === maxAwards)
  })()

  // Filter duo leaders to only include top duos
  const topDuoLeaders = (() => {
    if (!Array.isArray(duoLeaders) || duoLeaders.length === 0) return []
    const maxCount = Math.max(...duoLeaders.map(d => d.count || 0))
    return duoLeaders.filter(d => d.count === maxCount)
  })()

  // Filter draft player leaders to only include top players
  const topDraftPlayerLeaders = (() => {
    if (!Array.isArray(draftPlayerLeaders) || draftPlayerLeaders.length === 0) return []
    const maxValue = Math.max(...draftPlayerLeaders.map(p => p.value || 0))
    return draftPlayerLeaders.filter(p => p.value === maxValue)
  })()

  // Filter draft captain leaders to only include top captains
  const topDraftCaptainLeaders = (() => {
    if (!Array.isArray(draftCaptainLeaders) || draftCaptainLeaders.length === 0) return []
    const maxValue = Math.max(...draftCaptainLeaders.map(p => p.value || 0))
    return draftCaptainLeaders.filter(p => p.value === maxValue)
  })()

  const primaryScorer = safePrimary(stats.topScorers)
  const primaryAssister = safePrimary(stats.topAssisters)
  const primaryIron = safePrimary(stats.ironMen)
  const primaryKeeper = safePrimary(stats.cleanSheetMasters)
  const primaryAttackLeader = safePrimary(stats.attackLeaders || [])

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

  useEffect(() => {
    prefetchSeasonRecapVideos()
  }, [])

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
      id: 'duo',
      group: 'total',
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
      group: 'draft',
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
      group: 'draft',
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

  const normalizePlayerId = (id) => {
    if (id === undefined || id === null) return null
    const str = String(id).trim()
    return str ? str : null
  }

  const championShowcaseTracker = new Set()
  const seedShowcasedPlayers = (...playersToSeed) => {
    playersToSeed.forEach((player) => {
      const normalized = normalizePlayerId(player?.id ?? player)
      if (normalized) {
        championShowcaseTracker.add(normalized)
      }
    })
  }
  seedShowcasedPlayers(primaryAttackLeader, primaryScorer, primaryAssister, primaryIron, primaryKeeper)

  const getChampionEntryPlayerIds = (section, entry) => {
    if (section.type === 'duo') {
      return [normalizePlayerId(entry.assist?.id), normalizePlayerId(entry.scorer?.id)].filter(Boolean)
    }
    return [normalizePlayerId(entry.id)].filter(Boolean)
  }

  const championDisplayEntries = championDisplays.map((section) => {
    const entries = section.winners || []
    if (entries.length === 0) {
      return { ...section, visibleWinners: [], tieRemainder: 0 }
    }
    const unseen = []
    const alreadyShown = []
    entries.forEach((entry) => {
      const ids = getChampionEntryPlayerIds(section, entry)
      const hasAppeared = ids.some((id) => championShowcaseTracker.has(id))
      const bucket = hasAppeared ? alreadyShown : unseen
      bucket.push({ entry, ids })
    })
    const prioritized = [...unseen, ...alreadyShown]
    const selected = prioritized.slice(0, 2)
    selected.forEach(({ ids }) => ids.forEach((id) => championShowcaseTracker.add(id)))
    return {
      ...section,
      visibleWinners: selected.map((item) => item.entry),
      tieRemainder: Math.max(entries.length - selected.length, 0)
    }
  })
  const championGroupOrder = ['total', 'draft']
  const championGroupMap = championDisplayEntries.reduce((acc, section) => {
    const groupKey = section.group || 'total'
    if (!acc[groupKey]) acc[groupKey] = []
    acc[groupKey].push(section)
    return acc
  }, {})

  const championSlides = []
  championGroupOrder.forEach((groupKey) => {
    const sections = championGroupMap[groupKey]
    if (!sections || sections.length === 0) return
    const slideIndex = championSlides.length
    const bgClass = slideIndex % 2 === 0
      ? 'bg-gradient-to-tr from-slate-900 via-indigo-950 to-black'
      : 'bg-gradient-to-br from-indigo-950 via-purple-900 to-black'
    championSlides.push({
      id: `champions-${groupKey}`,
      bg: bgClass,
      content: (
        <div className="relative h-full w-full">
          <div className="absolute inset-0 champion-aurora" aria-hidden="true" />
          <div className="absolute inset-0 champion-grid" aria-hidden="true" />
          <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-[11px] uppercase tracking-[0.4em] text-white/60 mb-2">{t('seasonRecap.champions.label')}</p>
            <h2 className="text-2xl font-bold text-white mb-4">
              {t('seasonRecap.champions.groupSlideTitle', {
                group: t(`seasonRecap.champions.groupLabels.${groupKey}`, { defaultValue: groupKey })
              })}
            </h2>
            <div
              className={`w-full text-left ${sections.length > 1
                ? 'max-w-2xl grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4'
                : 'max-w-sm space-y-3'
              }`}
            >
              {sections.map((section) => (
                <div key={section.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <section.icon className={`h-6 w-6 ${section.colorClass}`} />
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/60">{section.subtitle}</p>
                      <p className="text-sm font-semibold text-white">{section.title}</p>
                    </div>
                  </div>
                  {(() => {
                    const visibleWinners = section.visibleWinners || []
                    const remaining = Math.max(section.tieRemainder || 0, 0)
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
    })
  })

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
    .slice(-MAX_PINNED_STORIES)
    .map((id) => storyEntries.find((entry) => entry.id === id))
    .filter(Boolean)
  const finaleStats = [
    { id: 'matches', label: t('seasonRecap.finale.stats.matches'), value: stats.totalMatches },
    { id: 'players', label: t('seasonRecap.finale.stats.players'), value: stats.activePlayers },
    { id: 'goals', label: t('seasonRecap.finale.stats.goals'), value: stats.totalGoals },
    { id: 'assists', label: t('seasonRecap.finale.stats.assists'), value: stats.totalAssists }
  ]

  const renderTieHero = (players, metricKey, { showAttackGA = false } = {}) => {
    if (!Array.isArray(players) || players.length <= 1) return null
    const count = players.length
    const compact = count >= 3
    // 화면 넘침 방지를 위해 선수 수에 따라 강하게 축소
    const avatarSize = count >= 28
      ? 22
      : count >= 24
      ? 24
      : count >= 20
      ? 26
      : count >= 16
      ? 30
      : count >= 12
      ? 34
      : count >= 9
      ? 40
      : count >= 6
      ? 48
      : 60
    const minCardWidth = Math.max(avatarSize + 12, 40)
    const gapSize = count >= 24 ? '0.28rem' : count >= 16 ? '0.38rem' : count >= 10 ? '0.48rem' : '0.6rem'
    const cardPadding = count >= 20 ? '3px 3px 5px' : count >= 12 ? '4px 4px 6px' : '8px'
    const columns = Math.min(4, Math.max(1, count))
    return (
      <div className="w-full max-w-6xl mx-auto mb-5 px-1">
        <div
          className="grid justify-center"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(${minCardWidth}px, 1fr))`, gap: gapSize }}
        >
          {players.map((p) => (
            <div
              key={`${metricKey}-${p.id}`}
              className="flex flex-col items-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur"
              style={{ padding: cardPadding, minWidth: `${minCardWidth}px` }}
            >
              <InitialAvatar
                id={p.id}
                name={p.name || t('seasonRecap.common.unknown')}
                photoUrl={p.photoUrl}
                size={avatarSize}
                className="border border-white/30"
              />
              <p className={`mt-2 ${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-center leading-tight break-words line-clamp-2`}>
                {p.name || t('seasonRecap.common.unknown')}
              </p>
              {showAttackGA && (
                <p className="mt-0.5 text-[11px] text-white/75">
                  G {p.goals ?? 0} / A {p.assists ?? 0}
                </p>
              )}
            </div>
          ))}
        </div>
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
    return players.filter(
      (player) =>
        Boolean(player?.photoUrl) &&
        hasRealPhoto(player?.photoUrl) &&
        !isInitialOnlyName(player?.name) &&
        seen.has(player.id)
    )
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
    
    // Duplicate the array multiple times for seamless infinite scroll
    // This ensures smooth looping without visible cuts
    const repetitions = Math.max(3, Math.ceil(60 / verifiedPulsePlayers.length))
    let tiles = []
    for (let i = 0; i < repetitions; i++) {
      tiles = [...tiles, ...verifiedPulsePlayers]
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
      body: t('seasonRecap.overview.cards.care.body', { season: resolvedSeasonName })
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
      bg: 'bg-black',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_INTRO_VIDEO}
            overlayClass="bg-gradient-to-br from-black/70 via-black/60 to-black/85"
          />
          <div className="relative flex flex-col items-center justify-center h-full text-center p-4 animate-fade-in-up">
            <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-3">
              {resolvedSeasonName}
              <br />
              {t('seasonRecap.intro.titleSuffix')}
            </h1>
            <p className="text-base text-indigo-100 drop-shadow mb-4">{t('seasonRecap.intro.tagline')}</p>
            <div className="text-5xl mb-4 animate-bounce drop-shadow">⚽️</div>
            <p className="text-xs text-white/70 uppercase tracking-widest">{t('seasonRecap.common.tapHint')}</p>
          </div>
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
              {t('seasonRecap.overview.description', { season: resolvedSeasonName })}
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
      id: 'attack-leader',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_ATTACK_VIDEO}
            overlayClass=""
          />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="attack-flare" />
            <div className="attack-orbit" />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="mb-3 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-[11px] uppercase tracking-[0.35em] text-white/70">
              {t('seasonRecap.slides.attackLeader.title')}
            </div>
            <Flame className="h-14 w-14 text-amber-200 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)] mb-2" />
            {renderTieHero(stats.attackLeaders, 'attackPoints', { rowThreshold: 3, showAttackGA: true })}
            {(!Array.isArray(stats.attackLeaders) || stats.attackLeaders.length <= 1) && (
              <>
                <div className="relative mb-3">
                  <div className="absolute -inset-1 bg-amber-400/20 rounded-full blur-xl" />
                  <InitialAvatar
                    id={primaryAttackLeader.id}
                    name={primaryAttackLeader.name || t('seasonRecap.common.unknown')}
                    photoUrl={primaryAttackLeader.photoUrl}
                    size={96}
                    className="border-2 border-white/40 shadow-[0_12px_30px_rgba(0,0,0,0.45)]"
                  />
                </div>
                <h2 className="text-3xl font-black text-white mb-1">
                  {primaryAttackLeader.name || t('seasonRecap.common.unknown')}
                </h2>
                <p className="text-[12px] text-white/75 mb-2">
                  G {primaryAttackLeader.goals ?? 0} / A {primaryAttackLeader.assists ?? 0}
                </p>
                <p className="text-sm text-white/70 max-w-xs mb-4">
                  {t('seasonRecap.slides.attackLeader.subtitle')}
                </p>
              </>
            )}
            <div className="rounded-3xl border border-white/20 bg-white/10 px-5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
              <AnimatedNumber value={primaryAttackLeader.value} className="text-4xl font-black text-amber-200" />
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/70 mt-1">
                {t('seasonRecap.metrics.attackPoints')}
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'top-scorer',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_GOLDEN_BOOT_VIDEO}
            overlayClass=""
          />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="golden-boot-rings" />
            <div className="golden-boot-sparkles" />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <GoldenBootIcon className="w-14 h-14 text-yellow-300 mb-2 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)] mx-auto" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.goldenBoot.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.goldenBoot.subtitle')}</h3>
            </div>

            {renderTieHero(stats.topScorers, 'goals')}
            {(!Array.isArray(stats.topScorers) || stats.topScorers.length <= 1) && (
              <>
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

                <h1 className="text-2xl font-black text-white mb-2 bg-black/60 px-4 py-2 rounded-xl">{primaryScorer.name || t('seasonRecap.common.unknown')}</h1>
              </>
            )}
            <div className="bg-yellow-600 px-4 py-1.5 rounded-full border border-yellow-400">
              <AnimatedNumber value={primaryScorer.value} className="text-xl font-bold text-white" />
              <span className="text-xs text-white/90 ml-1.5 uppercase">{t('seasonRecap.metrics.goals')}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'top-assister',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_PLAYMAKER_VIDEO}
            overlayClass=""
          />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="playmaker-orbit" />
            <div className="playmaker-dots" />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <Target className="w-12 h-12 text-cyan-400 mb-2 animate-spin-slow mx-auto" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.playmaker.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.playmaker.subtitle')}</h3>
            </div>

            {renderTieHero(stats.topAssisters, 'assists')}
            {(!Array.isArray(stats.topAssisters) || stats.topAssisters.length <= 1) && (
              <>
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

                <h1 className="text-2xl font-black text-white mb-2 bg-black/60 px-4 py-2 rounded-xl">{primaryAssister.name || t('seasonRecap.common.unknown')}</h1>
              </>
            )}
            <div className="bg-cyan-600 px-4 py-1.5 rounded-full border border-cyan-300">
              <AnimatedNumber value={primaryAssister.value} className="text-xl font-bold text-white" />
              <span className="text-xs text-white/90 ml-1.5 uppercase">{t('seasonRecap.metrics.assists')}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'iron-man',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_IRONMAN_VIDEO}
            overlayClass=""
          />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="ironman-grid" />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <Star className="w-12 h-12 text-emerald-400 mb-2 mx-auto" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.ironman.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.ironman.subtitle')}</h3>
            </div>

            {renderTieHero(stats.ironMen, 'matches')}
            {(!Array.isArray(stats.ironMen) || stats.ironMen.length <= 1) && (
              <>
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

                <h1 className="text-2xl font-black text-white mb-2 bg-black/60 px-4 py-2 rounded-xl">{primaryIron.name || t('seasonRecap.common.unknown')}</h1>
              </>
            )}
            <div className="bg-emerald-600 px-4 py-1.5 rounded-full border border-emerald-300">
              <AnimatedNumber value={primaryIron.value} className="text-xl font-bold text-white" />
              <span className="text-xs text-white/90 ml-1.5 uppercase">{t('seasonRecap.metrics.matches')}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'clean-sheet',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_DEFENDER_VIDEO}
            overlayClass=""
          />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="clean-sheet-lines" />
            <div className="clean-sheet-shields" />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <Shield className="w-12 h-12 text-white mb-2 mx-auto" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.wallKeepers.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.wallKeepers.subtitle')}</h3>
            </div>

            {renderTieHero(stats.cleanSheetMasters, 'cleanSheets')}
            {(!Array.isArray(stats.cleanSheetMasters) || stats.cleanSheetMasters.length <= 1) && (
              <>
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

                <h1 className="text-2xl font-black text-white mb-2 bg-black/60 px-4 py-2 rounded-xl">{primaryKeeper.name || t('seasonRecap.common.unknown')}</h1>
              </>
            )}
            <div className="bg-white px-4 py-1.5 rounded-full border border-gray-200">
              <AnimatedNumber value={primaryKeeper.value} className="text-xl font-bold text-black" />
              <span className="text-xs text-black/80 ml-1.5 uppercase">{t('seasonRecap.metrics.cleanSheets')}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'mom-award',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_MOM_VIDEO}
            overlayClass=""
          />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="mom-glow" />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <Crown className="w-14 h-14 text-amber-300 mb-2 mx-auto drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.mom.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.mom.subtitle')}</h3>
            </div>

            {renderTieHero(topMomLeaders, 'awards')}
            {(!Array.isArray(topMomLeaders) || topMomLeaders.length <= 1) && (
              <>
                <div className="relative mb-3">
                  <div className="absolute -inset-2 bg-amber-400/20 rounded-full blur-xl" />
                  <InitialAvatar
                    id={safePrimary(topMomLeaders).id}
                    name={safePrimary(topMomLeaders).name || t('seasonRecap.common.unknown')}
                    photoUrl={safePrimary(topMomLeaders).photoUrl}
                    size={80}
                    className="border-2 border-amber-300 shadow-xl"
                  />
                </div>

                <h1 className="text-2xl font-black text-white mb-2 bg-black/60 px-4 py-2 rounded-xl">{safePrimary(topMomLeaders).name || t('seasonRecap.common.unknown')}</h1>
              </>
            )}
            <div className="bg-amber-500 px-4 py-1.5 rounded-full border border-amber-300">
              <AnimatedNumber value={safePrimary(topMomLeaders).value} className="text-xl font-bold text-white" />
              <span className="text-xs text-white/90 ml-1.5 uppercase">{t('seasonRecap.metrics.awards')}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'duo-award',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_DUO_VIDEO}
            overlayClass=""
          />
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <Handshake className="w-14 h-14 text-rose-300 mb-2 mx-auto drop-shadow-[0_0_15px_rgba(253,164,175,0.5)]" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.duo.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.duo.subtitle')}</h3>
            </div>

            {topDuoLeaders.length > 1 ? (
              <div className="w-full max-w-md space-y-3">
                {topDuoLeaders.map((duo) => (
                  <div key={duo.id} className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/20">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-3">
                          <InitialAvatar
                            id={duo.assist?.id}
                            name={duo.assist?.name || t('seasonRecap.common.unknown')}
                            photoUrl={duo.assist?.photoUrl}
                            size={48}
                            className="ring-2 ring-rose-300 shadow-xl"
                          />
                          <InitialAvatar
                            id={duo.scorer?.id}
                            name={duo.scorer?.name || t('seasonRecap.common.unknown')}
                            photoUrl={duo.scorer?.photoUrl}
                            size={48}
                            className="ring-2 ring-rose-300 shadow-xl"
                          />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-white">{duo.assist?.name || t('seasonRecap.common.unknown')}</p>
                          <p className="text-xs text-white/60">{t('seasonRecap.champions.duoTo', { name: duo.scorer?.name || t('seasonRecap.common.unknown') })}</p>
                        </div>
                      </div>
                      <div className="bg-rose-500 px-3 py-1.5 rounded-full border border-rose-300">
                        <AnimatedNumber value={duo.count || 0} className="text-lg font-bold text-white" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex -space-x-4 mb-4">
                  <div className="relative">
                    <div className="absolute -inset-2 bg-rose-400/20 rounded-full blur-xl" />
                    <InitialAvatar
                      id={topDuoLeaders[0]?.assist?.id}
                      name={topDuoLeaders[0]?.assist?.name || t('seasonRecap.common.unknown')}
                      photoUrl={topDuoLeaders[0]?.assist?.photoUrl}
                      size={80}
                      className="border-2 border-rose-300 shadow-xl relative"
                    />
                  </div>
                  <div className="relative">
                    <div className="absolute -inset-2 bg-rose-400/20 rounded-full blur-xl" />
                    <InitialAvatar
                      id={topDuoLeaders[0]?.scorer?.id}
                      name={topDuoLeaders[0]?.scorer?.name || t('seasonRecap.common.unknown')}
                      photoUrl={topDuoLeaders[0]?.scorer?.photoUrl}
                      size={80}
                      className="border-2 border-rose-300 shadow-xl relative"
                    />
                  </div>
                </div>
                <div className="bg-black/60 px-4 py-2 rounded-xl mb-2">
                  <h1 className="text-xl font-black text-white">
                    {topDuoLeaders[0]?.assist?.name || t('seasonRecap.common.unknown')} {t('seasonRecap.champions.duoTo', { name: topDuoLeaders[0]?.scorer?.name || t('seasonRecap.common.unknown') })}
                  </h1>
                </div>
                <div className="bg-rose-500 px-4 py-1.5 rounded-full border border-rose-300">
                  <AnimatedNumber value={topDuoLeaders[0]?.count || 0} className="text-xl font-bold text-white" />
                  <span className="text-xs text-white/90 ml-1.5 uppercase">{t('seasonRecap.metrics.goals')}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'draft-player-award',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_DRAFT_PLAYER_VIDEO}
            overlayClass=""
          />
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <Gamepad2 className="w-14 h-14 text-sky-300 mb-2 mx-auto drop-shadow-[0_0_15px_rgba(125,211,252,0.5)]" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.draftPlayer.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.draftPlayer.subtitle')}</h3>
            </div>

            {renderTieHero(topDraftPlayerLeaders, 'value')}
            {(!Array.isArray(topDraftPlayerLeaders) || topDraftPlayerLeaders.length <= 1) && (
              <>
                <div className="relative mb-3">
                  <div className="absolute -inset-2 bg-sky-400/20 rounded-full blur-xl" />
                  <InitialAvatar
                    id={safePrimary(topDraftPlayerLeaders).id}
                    name={safePrimary(topDraftPlayerLeaders).name || t('seasonRecap.common.unknown')}
                    photoUrl={safePrimary(topDraftPlayerLeaders).photoUrl}
                    size={80}
                    className="border-2 border-sky-300 shadow-xl"
                  />
                </div>
                <h1 className="text-2xl font-black text-white mb-2 bg-black/60 px-4 py-2 rounded-xl">{safePrimary(topDraftPlayerLeaders).name || t('seasonRecap.common.unknown')}</h1>
              </>
            )}
            <div className="bg-sky-500 px-4 py-1.5 rounded-full border border-sky-300">
              <AnimatedNumber value={safePrimary(topDraftPlayerLeaders).value} className="text-xl font-bold text-white" />
              <span className="text-xs text-white/90 ml-1.5 uppercase">{t('seasonRecap.metrics.points')}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'captain-award',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_CAPTAIN_VIDEO}
            overlayClass=""
          />
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-black/60 px-6 py-3 rounded-xl mb-3">
              <Shield className="w-14 h-14 text-emerald-300 mb-2 mx-auto drop-shadow-[0_0_15px_rgba(110,231,183,0.5)]" />
              <h2 className="text-lg font-bold text-white">{t('seasonRecap.slides.captain.title')}</h2>
              <h3 className="text-sm text-white/80">{t('seasonRecap.slides.captain.subtitle')}</h3>
            </div>

            {renderTieHero(topDraftCaptainLeaders, 'value')}
            {(!Array.isArray(topDraftCaptainLeaders) || topDraftCaptainLeaders.length <= 1) && (
              <>
                <div className="relative mb-3">
                  <div className="absolute -inset-2 bg-emerald-400/20 rounded-full blur-xl" />
                  <InitialAvatar
                    id={safePrimary(topDraftCaptainLeaders).id}
                    name={safePrimary(topDraftCaptainLeaders).name || t('seasonRecap.common.unknown')}
                    photoUrl={safePrimary(topDraftCaptainLeaders).photoUrl}
                    size={80}
                    className="border-2 border-emerald-300 shadow-xl"
                  />
                </div>
                <h1 className="text-2xl font-black text-white mb-2 bg-black/60 px-4 py-2 rounded-xl">{safePrimary(topDraftCaptainLeaders).name || t('seasonRecap.common.unknown')}</h1>
              </>
            )}
            <div className="bg-emerald-500 px-4 py-1.5 rounded-full border border-emerald-300">
              <AnimatedNumber value={safePrimary(topDraftCaptainLeaders).value} className="text-xl font-bold text-white" />
              <span className="text-xs text-white/90 ml-1.5 uppercase">{t('seasonRecap.metrics.points')}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'stories',
      content: (
        <div className="relative h-full w-full overflow-hidden">
          <VideoBackground
            src={RECAP_STORY_VIDEO}
            overlayClass=""
          />
          <div className="stories-wave" aria-hidden="true" />
          <div className="stories-particles" aria-hidden="true" />
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center p-4">
            <div className="w-full max-w-xs mx-auto">
              <h2 className="text-2xl font-bold text-white mb-4">{t('seasonRecap.stories.heading')}</h2>
              {storyExpanded ? (
                <div className="w-full space-y-3 text-left text-sm text-white/80">
                  {storyEntries.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/60 p-3">
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
                        className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/60 p-3 opacity-80 transition-all duration-500 ease-out"
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
                    className="flex items-start gap-3 rounded-2xl border border-white/20 bg-black/60 p-4 shadow-lg"
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
        </div>
      )
    },
    {
      id: 'outro',
      content: (
        <div className={`relative h-full w-full overflow-hidden ${verifiedPulsePlayers.length >= 10 ? 'bg-gradient-to-br from-amber-50 via-white to-amber-100' : ''}`}>
          {verifiedPulsePlayers.length < 10 ? (
            <VideoBackground
              src={RECAP_OUTRO_VIDEO}
              overlayClass=""
            />
          ) : (
            <>
              {/* Player Avatars Pulse Background */}
              {pulseBackgroundTiles.length > 0 && (
                <div className="absolute inset-0 pointer-events-none px-6">
                  <div
                    className="grid w-full grid-cols-[repeat(auto-fit,minmax(52px,1fr))] justify-items-center gap-4 opacity-55"
                    style={{
                      animation: pulseScrollDuration
                        ? `pulse-grid-scroll ${pulseScrollDuration}s linear infinite`
                        : undefined
                    }}
                  >
                    {pulseBackgroundTiles.map((player, idx) => (
                      <div
                        key={`${player.id ?? 'pulse'}-${idx}`}
                        className="relative rounded-full transition-transform duration-1000"
                        style={{
                          animation: `pulse-grid-rise 1.4s ease-out ${idx * 0.04}s both`,
                          transform: `scale(${0.9 + (idx % 3) * 0.1})` // Slight size variation
                        }}
                      >
                        {/* Soft glow behind avatar */}
                        <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-md" />
                        <InitialAvatar
                          id={player.id}
                          name={player.name}
                          photoUrl={player.photoUrl}
                          size={52}
                          className="ring-1 ring-white/20 shadow-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Color wash & subtle grain for depth */}
              <div
                className="absolute inset-0 opacity-70 mix-blend-multiply animate-[spin_48s_linear_infinite]"
                style={{
                  background:
                    'radial-gradient(circle at 20% 25%, rgba(251,191,36,0.35), transparent 40%),' +
                    'radial-gradient(circle at 80% 30%, rgba(59,130,246,0.22), transparent 38%),' +
                    'radial-gradient(circle at 60% 75%, rgba(34,197,94,0.25), transparent 42%)'
                }}
                aria-hidden="true"
              />
              <div
                className="absolute inset-0 opacity-25 mix-blend-soft-light"
                style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.08) 1px, transparent 0)', backgroundSize: '10px 10px' }}
                aria-hidden="true"
              />
            </>
          )}
          <div className="absolute inset-0 champion-aurora" aria-hidden="true" />
          <div className="absolute inset-0 champion-grid" aria-hidden="true" />
          <div className="relative flex flex-col items-center justify-center h-full text-center p-4 z-10">
            <p className="text-[11px] uppercase tracking-[0.4em] text-black/70 mb-2">{t('seasonRecap.finale.label')}</p>
            <h1 className="text-2xl font-bold text-black mb-6 drop-shadow">{t('seasonRecap.finale.title')}</h1>
            <div className="w-full max-w-sm space-y-4 text-left">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <div className="grid grid-cols-2 gap-4 mb-4 text-center">
                  {finaleStats.map((stat) => (
                    <div key={stat.id} className="flex flex-col items-center justify-center">
                      <p className="text-[11px] uppercase tracking-wide text-black/70">{stat.label}</p>
                      <AnimatedNumber value={stat.value} className="text-2xl font-bold text-black drop-shadow" />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-black/80 leading-relaxed text-center">
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
                className="w-full rounded-2xl border border-white/15 bg-white/15 px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/25"
              >
                {t('seasonRecap.finale.cta')}
              </button>
            </div>
          </div>
        </div>
      )
    }
  ]

  // Filter out slides with no award winners
  const filteredSlides = slides.filter(slide => {
    const slideId = slide.id
    
    // Always keep these slides
    if (['intro', 'overview', 'stories', 'outro'].includes(slideId)) {
      return true
    }
    
    // Check if award slides have winners
    if (slideId === 'attack-leader') {
      return stats.attackLeaders && stats.attackLeaders.length > 0 && stats.attackLeaders[0].id !== 'attack-none'
    }
    if (slideId === 'golden-boot') {
      return stats.topScorers && stats.topScorers.length > 0 && stats.topScorers[0].id !== 'scorer-none'
    }
    if (slideId === 'top-assister') {
      return stats.topAssisters && stats.topAssisters.length > 0 && stats.topAssisters[0].id !== 'assist-none'
    }
    if (slideId === 'iron-man') {
      return stats.ironMen && stats.ironMen.length > 0 && stats.ironMen[0].id !== 'apps-none'
    }
    if (slideId === 'clean-sheet') {
      return stats.cleanSheetMasters && stats.cleanSheetMasters.length > 0 && stats.cleanSheetMasters[0].id !== 'cs-none'
    }
    if (slideId === 'mom-award') {
      return topMomLeaders && topMomLeaders.length > 0 && topMomLeaders[0].id !== 'na'
    }
    if (slideId === 'duo-award') {
      return topDuoLeaders && topDuoLeaders.length > 0
    }
    if (slideId === 'draft-player-award') {
      return topDraftPlayerLeaders && topDraftPlayerLeaders.length > 0 && topDraftPlayerLeaders[0].id !== 'na'
    }
    if (slideId === 'captain-award') {
      return topDraftCaptainLeaders && topDraftCaptainLeaders.length > 0 && topDraftCaptainLeaders[0].id !== 'na'
    }
    
    return true
  })

  const slideCount = filteredSlides.length
  const currentSlideId = filteredSlides[activeSlide]?.id
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
          className={`w-full h-full max-h-[100dvh] md:max-w-sm md:max-h-[600px] md:rounded-3xl overflow-hidden relative shadow-2xl transition-colors duration-700 ease-in-out ${filteredSlides[activeSlide].bg}`}
          onClick={handleContainerClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex gap-1 z-20">
          {filteredSlides.map((_, idx) => (
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

        {/* Close Button - Top Right */}
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-6 right-4 z-20 text-white/50 hover:text-white p-2"
          aria-label={t('common.close')}
        >
          <X size={24} />
        </button>

        {/* Hide for Today Button - Bottom Center */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation()
              try {
                const today = new Date().toDateString()
                localStorage.setItem('seasonRecap_hideUntil', today)
              } catch {
                // ignore
              }
              onClose()
            }}
            className="rounded-full bg-black/50 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-md transition hover:bg-black/70 hover:text-white shadow-lg"
            aria-label={t('seasonRecap.hideForToday')}
          >
            {t('seasonRecap.hideForToday')}
          </button>
        </div>

          {/* Content */}
          <div className="h-full w-full">
            {filteredSlides[activeSlide].content}
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
        .attack-flare {
          position: absolute;
          inset: -20%;
          background: radial-gradient(circle at 30% 30%, rgba(251,191,36,0.35), transparent 55%),
            radial-gradient(circle at 70% 60%, rgba(248,113,113,0.3), transparent 65%);
          filter: blur(50px);
          opacity: 0.7;
          animation: attack-flare-pulse 10s ease-in-out infinite;
        }
        .attack-orbit {
          position: absolute;
          inset: 10%;
          border: 1px dashed rgba(255,255,255,0.25);
          border-radius: 36% 48% 52% 44% / 40% 46% 54% 50%;
          animation: attack-orbit-spin 14s linear infinite;
          opacity: 0.4;
        }
        @keyframes attack-flare-pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.8; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        @keyframes attack-orbit-spin {
          from { transform: rotate(0deg) scale(1); }
          to { transform: rotate(360deg) scale(1.05); }
        }
        .draft-spark {
          position: absolute;
          inset: -25% 10% auto;
          height: 70%;
          background: radial-gradient(circle at 40% 40%, rgba(59,130,246,0.35), transparent 55%),
            radial-gradient(circle at 70% 70%, rgba(99,102,241,0.25), transparent 65%);
          filter: blur(50px);
          opacity: 0.6;
          animation: draft-spark-float 12s ease-in-out infinite;
        }
        .draft-grid {
          position: absolute;
          inset: 0;
          background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 80px 80px;
          opacity: 0.15;
          animation: draft-grid-pan 16s linear infinite;
        }
        @keyframes draft-spark-float {
          0% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-20px); opacity: 0.7; }
          100% { transform: translateY(0); opacity: 0.4; }
        }
        @keyframes draft-grid-pan {
          from { transform: translate3d(0,0,0); }
          to { transform: translate3d(-80px, 80px, 0); }
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
