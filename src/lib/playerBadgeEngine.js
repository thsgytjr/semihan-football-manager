// src/lib/playerBadgeEngine.js
// Create consistent badge data from recorded match history

import { toStr, extractStatsByPlayer, extractAttendeeIds } from './matchUtils'
import { computeDraftPlayerStatsRows, computeCaptainStatsRows } from './leaderboardComputations'
import { getAppSettings } from './appSettings'

const themeByCategory = {
  goals: { category: 'goals', icon: '⚽️', colors: ['#f97316', '#fb923c'] },
  assists: { category: 'assists', icon: '🎯', colors: ['#6366f1', '#a5b4fc'] },
  appearances: { category: 'appearances', icon: '🧱', colors: ['#0ea5e9', '#38bdf8'] },
  defense: { category: 'defense', icon: '🧤', colors: ['#34d399', '#10b981'] },
  special: { category: 'special', icon: '🚀', colors: ['#ec4899', '#f472b6'] },
  draft: { category: 'draft', icon: '🔀', colors: ['#8b5cf6', '#6366f1'] },
  mom: { category: 'mom', icon: '🏆', colors: ['#f59e0b', '#fbbf24'] }
}

const defaultFacts = (playerId) => ({
  playerId,
  goals: 0,
  assists: 0,
  points: 0,
  appearances: 0,
  cleanSheets: 0,
  hatTricks: 0,
  braces: 0,
  multiAssistMatches: 0,
  matchesWithGoal: 0,
  bestGoalsInMatch: 0,
  bestAssistsInMatch: 0,
  bestAppearanceStreak: 0,
  currentAppearanceStreak: 0,
  lastAppearanceIndex: null,
  lastContributionTs: null,
  momAwards: 0,
  minutes: 0,
  draftPlayerPoints: 0,
  draftCaptainPoints: 0,
  timeline: {}
})

const recordMilestone = (facts, key, value, ts) => {
  if (!facts) return
  if (!facts.timeline[key]) facts.timeline[key] = []
  const history = facts.timeline[key]
  if (history.length === 0 || history[history.length - 1].value !== value) {
    history.push({ value, ts })
  }
}

const toNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const getMatchTimestamp = (match) => {
  const candidates = [match?.dateISO, match?.date, match?.matchDate, match?.created_at, match?.updated_at]
  for (const cand of candidates) {
    if (!cand) continue
    const ts = Date.parse(cand)
    if (!Number.isNaN(ts)) return ts
  }
  if (Number.isFinite(match?.id)) return Number(match.id)
  return 0
}

export function buildPlayerBadgeFactsMap(players = [], matches = []) {
  const map = new Map()
  const ensure = (pid) => {
    const key = toStr(pid)
    if (!key) return null
    if (!map.has(key)) {
      map.set(key, defaultFacts(key))
    }
    return map.get(key)
  }

  players.forEach((p) => {
    if (p?.id != null) ensure(p.id)
  })

  const sortedMatches = [...(matches || [])].sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b))

  sortedMatches.forEach((match, matchIndex) => {
    const statsMap = extractStatsByPlayer(match) || {}
    const participantSet = new Set()
    const attendeeIds = extractAttendeeIds(match) || []
    attendeeIds.forEach((raw) => {
      const pid = toStr(raw)
      if (pid) participantSet.add(pid)
    })
    Object.keys(statsMap).forEach((raw) => {
      const pid = toStr(raw)
      if (pid) participantSet.add(pid)
    })

    const matchTs = getMatchTimestamp(match)
    participantSet.forEach((pid) => {
      const facts = ensure(pid)
      if (!facts) return
      facts.appearances += 1
      if (facts.lastAppearanceIndex === matchIndex - 1) {
        facts.currentAppearanceStreak += 1
      } else {
        facts.currentAppearanceStreak = 1
      }
      facts.lastAppearanceIndex = matchIndex
      if (facts.currentAppearanceStreak > facts.bestAppearanceStreak) {
        facts.bestAppearanceStreak = facts.currentAppearanceStreak
        recordMilestone(facts, 'bestAppearanceStreak', facts.bestAppearanceStreak, matchTs)
      }
      recordMilestone(facts, 'appearances', facts.appearances, matchTs)
    })

    const statsMatchTs = matchTs
    Object.entries(statsMap).forEach(([rawPid, rec]) => {
      const pid = toStr(rawPid)
      const facts = ensure(pid)
      if (!facts) return
      const goals = toNumber(rec?.goals ?? rec?.goal)
      const assists = toNumber(rec?.assists ?? rec?.assist)
      const cleanSheet = toNumber(rec?.cleanSheet ?? rec?.clean_sheets)
      const mom = toNumber(rec?.momAwards ?? rec?.mom)
      const minutes = toNumber(rec?.minutes ?? rec?.mins)

      facts.goals += goals
      facts.assists += assists
      facts.points = facts.goals + facts.assists
      facts.cleanSheets += cleanSheet
      facts.momAwards += mom
      facts.minutes += minutes
      if (goals > 0) facts.matchesWithGoal += 1
      if (goals >= 2) facts.braces += 1
      if (goals >= 3) facts.hatTricks += 1
      if (assists >= 2) facts.multiAssistMatches += 1
      if (goals > facts.bestGoalsInMatch) facts.bestGoalsInMatch = goals
      if (assists > facts.bestAssistsInMatch) facts.bestAssistsInMatch = assists
      facts.lastContributionTs = statsMatchTs

      if (goals > 0) recordMilestone(facts, 'goals', facts.goals, statsMatchTs)
      if (assists > 0) recordMilestone(facts, 'assists', facts.assists, statsMatchTs)
      recordMilestone(facts, 'points', facts.points, statsMatchTs)
      if (cleanSheet > 0) recordMilestone(facts, 'cleanSheets', facts.cleanSheets, statsMatchTs)
      if (facts.matchesWithGoal > 0) recordMilestone(facts, 'matchesWithGoal', facts.matchesWithGoal, statsMatchTs)
      if (facts.braces > 0) recordMilestone(facts, 'braces', facts.braces, statsMatchTs)
      if (facts.hatTricks > 0) recordMilestone(facts, 'hatTricks', facts.hatTricks, statsMatchTs)
      if (facts.multiAssistMatches > 0) recordMilestone(facts, 'multiAssistMatches', facts.multiAssistMatches, statsMatchTs)
      if (facts.cleanSheets > 0) recordMilestone(facts, 'cleanSheets', facts.cleanSheets, statsMatchTs)
      if (facts.momAwards > 0) recordMilestone(facts, 'momAwards', facts.momAwards, statsMatchTs)
    })
  })

  // Draft / Captain 승점 계산 추가
  try {
    const draftRows = computeDraftPlayerStatsRows(players, matches) || []
    draftRows.forEach(r => {
      const facts = ensure(r.id)
      if (facts) facts.draftPlayerPoints = Number(r.points || 0)
    })
    const captainRows = computeCaptainStatsRows(players, matches) || []
    captainRows.forEach(r => {
      const facts = ensure(r.id)
      if (facts) facts.draftCaptainPoints = Number(r.points || 0)
    })
  } catch (e) {
    // 실패해도 무시
  }

  return map
}

const rarityByTier = {
  5: 'diamond',
  4: 'platinum',
  3: 'gold',
  2: 'silver',
  1: 'bronze'
}

const normalizeThresholdValue = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, num)
}

const readBadgeTierOverrides = () => {
  try {
    const settings = getAppSettings()
    return settings?.badgeTierOverrides || {}
  } catch (err) {
    return {}
  }
}

const resolveTieredRuleTiers = (rule, overrides = {}) => {
  const overrideEntry = overrides?.[rule.slug]?.tiers || {}
  return (rule.tiers || []).map((tierDef) => {
    const overrideValue = normalizeThresholdValue(overrideEntry[tierDef.tier])
    return {
      ...tierDef,
      min: overrideValue ?? tierDef.min
    }
  })
}

const resolveSingleRuleThresholds = (rule, overrides = {}) => {
  const base = {}
  Object.entries(rule.thresholds || {}).forEach(([tier, threshold]) => {
    const tierNum = Number(tier)
    const normalized = normalizeThresholdValue(threshold)
    if (!Number.isFinite(tierNum) || normalized == null) return
    base[tierNum] = normalized
  })
  const overrideEntry = overrides?.[rule.slug]?.tiers || {}
  Object.entries(overrideEntry).forEach(([tier, threshold]) => {
    const tierNum = Number(tier)
    const normalized = normalizeThresholdValue(threshold)
    if (!Number.isFinite(tierNum) || normalized == null) return
    base[tierNum] = normalized
  })
  return base
}

const resolveAwardTimestamp = (facts, valueKey, threshold, fallbackTs = null) => {
  if (!facts) return fallbackTs
  const timeline = facts.timeline[valueKey]
  if (!timeline || timeline.length === 0) return fallbackTs
  const found = timeline.find(entry => entry.value >= threshold)
  return found?.ts ?? fallbackTs
}

const tieredRules = [
  {
    slug: 'total-goals',
    categoryKey: 'goals',
    name: '골 머신',
    description: (facts) => `누적 ${facts.goals}골 기록`,
    importance: 'high',
    valueKey: 'goals',
    tiers: [
      { tier: 1, min: 5 },
      { tier: 2, min: 10 },
      { tier: 3, min: 18 },
      { tier: 4, min: 26 },
      { tier: 5, min: 40 }
    ],
    value: (facts) => facts.goals
  },
  {
    slug: 'total-assists',
    categoryKey: 'assists',
    name: '도움 장인',
    description: (facts) => `누적 ${facts.assists}도움`,
    importance: 'high',
    valueKey: 'assists',
    tiers: [
      { tier: 1, min: 4 },
      { tier: 2, min: 8 },
      { tier: 3, min: 14 },
      { tier: 4, min: 20 },
      { tier: 5, min: 30 }
    ],
    value: (facts) => facts.assists
  },
  {
    slug: 'point-collector',
    categoryKey: 'special',
    name: '포인트 헌터',
    description: (facts) => `G+A ${facts.points}포인트`,
     importance: 'high',
     valueKey: 'points',
    tiers: [
      { tier: 1, min: 12 },
      { tier: 2, min: 20 },
      { tier: 3, min: 30 },
      { tier: 4, min: 40 },
      { tier: 5, min: 65 }
    ],
    value: (facts) => facts.points
  },
  {
    slug: 'appearance-ironman',
    categoryKey: 'appearances',
    name: '아이언맨',
    description: (facts) => `${facts.appearances}경기 출전`,
    importance: 'core',
    valueKey: 'appearances',
    tiers: [
      { tier: 1, min: 6 },
      { tier: 2, min: 12 },
      { tier: 3, min: 20 },
      { tier: 4, min: 30 },
      { tier: 5, min: 50 }
    ],
    value: (facts) => facts.appearances
  },
  {
    slug: 'clean-sheet-guardian',
    categoryKey: 'defense',
    name: '클린시트 가디언',
    description: (facts) => `무실점 ${facts.cleanSheets}경기`,
    importance: 'core',
    valueKey: 'cleanSheets',
    tiers: [
      { tier: 1, min: 2 },
      { tier: 2, min: 5 },
      { tier: 3, min: 9 },
      { tier: 4, min: 14 },
      { tier: 5, min: 22 }
    ],
    value: (facts) => facts.cleanSheets
  },
  {
    slug: 'draft-player-points',
    categoryKey: 'draft',
    name: '드래프트 선수 승점',
    description: (facts) => `Draft 선수 승점 ${facts.draftPlayerPoints}`,
    importance: 'high',
    valueKey: 'draftPlayerPoints',
    tiers: [
      { tier: 1, min: 5 },
      { tier: 2, min: 12 },
      { tier: 3, min: 20 },
      { tier: 4, min: 30 },
      { tier: 5, min: 55 }
    ],
    value: (facts) => facts.draftPlayerPoints
  },
  {
    slug: 'draft-captain-points',
    categoryKey: 'draft',
    name: '드래프트 주장 승점',
    description: (facts) => `Draft 주장 승점 ${facts.draftCaptainPoints}`,
    importance: 'high',
    valueKey: 'draftCaptainPoints',
    tiers: [
      { tier: 1, min: 5 },
      { tier: 2, min: 12 },
      { tier: 3, min: 20 },
      { tier: 4, min: 30 },
      { tier: 5, min: 55 }
    ],
    value: (facts) => facts.draftCaptainPoints
  },
  {
    slug: 'mom-awards',
    categoryKey: 'mom',
    name: 'MOM 수상 기록',
    description: (facts) => `MOM ${facts.momAwards}회 수상`,
    importance: 'high',
    valueKey: 'momAwards',
    tiers: [
      { tier: 1, min: 1 },
      { tier: 2, min: 3 },
      { tier: 3, min: 6 },
      { tier: 4, min: 10 },
      { tier: 5, min: 18 }
    ],
    value: (facts) => facts.momAwards
  }
]

const singleRules = [
  {
    slug: 'first-goal',
    categoryKey: 'goals',
    name: '첫 골 신고식',
    description: '공식 경기 첫 득점 기록',
    valueKey: 'goals',
    value: (facts) => facts.goals,
    importance: 'core',
    thresholds: { 1: 1 },
    showValue: false
  },
  {
    slug: 'hat-trick-hero',
    categoryKey: 'special',
    name: '해트트릭 히어로',
    description: (facts) => `해트트릭 ${facts.hatTricks}회`,
    value: (facts) => facts.hatTricks,
    valueKey: 'hatTricks',
    importance: 'high',
    thresholds: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 7 }
  },
  {
    slug: 'multi-goal-collector',
    categoryKey: 'special',
    name: '멀티골 콜렉터',
    description: (facts) => `2골 이상 경기 ${facts.braces}회`,
    value: (facts) => facts.braces,
    valueKey: 'braces',
    thresholds: { 1: 2, 2: 3, 3: 5, 4: 7, 5: 10 }
  },
  {
    slug: 'playmaker-night',
    categoryKey: 'assists',
    name: '플레이메이커 나이트',
    description: (facts) => `경기당 2도움 이상 ${facts.multiAssistMatches}회`,
    value: (facts) => facts.multiAssistMatches,
    valueKey: 'multiAssistMatches',
    thresholds: { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 }
  },
  {
    slug: 'consistent-scorer',
    categoryKey: 'goals',
    name: '꾸준한 스나이퍼',
    description: (facts) => `득점한 경기 ${facts.matchesWithGoal}회`,
    value: (facts) => facts.matchesWithGoal,
    valueKey: 'matchesWithGoal',
    thresholds: { 1: 6, 2: 8, 3: 12, 4: 15, 5: 24 }
  },
  {
    slug: 'attendance-streak',
    categoryKey: 'appearances',
    name: '출석체크 달인',
    description: (facts) => `연속 ${facts.bestAppearanceStreak}경기 출전`,
    value: (facts) => facts.bestAppearanceStreak,
    valueKey: 'bestAppearanceStreak',
    importance: 'core',
    thresholds: { 1: 4, 2: 7, 3: 10, 4: 14, 5: 24 }
  }
]

const buildBadge = (rule, theme, overrides = {}) => {
  const tier = overrides.tier ?? 1
  const rarity = rarityByTier[tier] || rarityByTier[1]
  const importance = overrides.importance || rule.importance || (tier >= 3 ? 'high' : 'normal')
  const showValue = overrides.showValue ?? rule.showValue ?? true
  const numericValue = showValue ? overrides.numericValue ?? null : null
  const nextTier = overrides.nextTier ?? null
  const nextThreshold = overrides.nextThreshold ?? null
  const remainingToNext = overrides.remainingToNext ?? null
  return {
    id: `local-${rule.slug}-${overrides.playerId || 'player'}-${tier}`,
    slug: rule.slug,
    name: typeof rule.name === 'function' ? rule.name(overrides.facts, tier) : rule.name,
    description: typeof rule.description === 'function' ? rule.description(overrides.facts, tier) : rule.description,
    category: theme.category,
    icon: theme.icon,
    color_primary: theme.colors[0],
    color_secondary: theme.colors[1],
    tier,
    numeric_value: numericValue,
    awarded_at: overrides.awardedAt ?? null,
    rarity,
    importance,
    value_key: overrides.valueKey || rule.valueKey || null,
    show_value: showValue,
    next_tier: nextTier,
    next_threshold: nextThreshold,
    remaining_to_next: remainingToNext
  }
}

function applyTieredRule(rule, facts, overridesMap) {
  if (!facts || !rule) return null
  const theme = themeByCategory[rule.categoryKey] || themeByCategory.special
  const resolvedTiers = resolveTieredRuleTiers(rule, overridesMap)
  if (!resolvedTiers?.length) return null
  const currentValue = typeof rule.value === 'function' ? rule.value(facts) : 0
  const available = resolvedTiers
    .filter((tierDef) => typeof tierDef?.min === 'number' && currentValue >= tierDef.min)
    .sort((a, b) => a.min - b.min)
  if (!available.length) return null
  const highest = available[available.length - 1]
  const orderedByTier = [...resolvedTiers].sort((a, b) => a.tier - b.tier)
  const highestIndex = orderedByTier.findIndex((t) => t.tier === highest.tier)
  const nextTierMeta = highestIndex >= 0 && highestIndex < orderedByTier.length - 1
    ? orderedByTier[highestIndex + 1]
    : null
  const awardTs = resolveAwardTimestamp(facts, rule.valueKey, highest.min, facts?.lastContributionTs)
  const remainingToNext = nextTierMeta ? Math.max(0, nextTierMeta.min - currentValue) : null
  return buildBadge(rule, theme, {
    playerId: facts?.playerId,
    facts,
    tier: highest.tier,
    numericValue: currentValue,
    awardedAt: awardTs,
    valueKey: rule.valueKey,
    nextTier: nextTierMeta ? nextTierMeta.tier : null,
    nextThreshold: nextTierMeta ? nextTierMeta.min : null,
    remainingToNext
  })
}

function applySingleRule(rule, facts, overridesMap) {
  if (!rule || !facts) return null
  const theme = themeByCategory[rule.categoryKey] || themeByCategory.special
  const currentValue = typeof rule.value === 'function' ? rule.value(facts) : null
  if (!Number.isFinite(currentValue)) return null
  if (rule.predicate && !rule.predicate(facts)) return null
  const thresholdsMap = resolveSingleRuleThresholds(rule, overridesMap)
  const thresholdRows = Object.entries(thresholdsMap)
    .map(([tier, threshold]) => ({ tier: Number(tier), threshold: Number(threshold) }))
    .filter((row) => Number.isFinite(row.tier) && Number.isFinite(row.threshold))
    .sort((a, b) => a.tier - b.tier)

  let resolvedTier = null
  let resolvedThreshold = null
  if (thresholdRows.length > 0) {
    const achieved = thresholdRows.filter((row) => currentValue >= row.threshold)
    if (!achieved.length) return null
    const highest = achieved[achieved.length - 1]
    resolvedTier = highest.tier
    resolvedThreshold = highest.threshold
  } else {
    resolvedTier = typeof rule.tier === 'function' ? rule.tier(facts) : (rule.tier ?? 1)
    resolvedThreshold = typeof rule.threshold === 'number' ? rule.threshold : currentValue
    if (!rule.predicate && (currentValue ?? 0) < resolvedThreshold) return null
  }

  const nextRow = thresholdRows.find((row) => row.tier === resolvedTier + 1)
  const remainingToNext = nextRow ? Math.max(0, nextRow.threshold - currentValue) : null
  const awardedTs = resolveAwardTimestamp(facts, rule.valueKey, resolvedThreshold, facts?.lastContributionTs)

  return buildBadge(rule, theme, {
    playerId: facts?.playerId,
    facts,
    tier: resolvedTier,
    numericValue: currentValue,
    awardedAt: awardedTs,
    valueKey: rule.valueKey,
    nextTier: nextRow ? nextRow.tier : null,
    nextThreshold: nextRow ? nextRow.threshold : null,
    remainingToNext
  })
}

export function generateBadgesFromFacts(facts) {
  if (!facts) return []
  const overrides = readBadgeTierOverrides()
  const badges = []
  tieredRules.forEach((rule) => {
    const badge = applyTieredRule(rule, facts, overrides)
    if (badge) badges.push(badge)
  })
  singleRules.forEach((rule) => {
    const badge = applySingleRule(rule, facts, overrides)
    if (badge) badges.push(badge)
  })
  return badges
}

export function computeBadgesForPlayer(playerId, players = [], matches = []) {
  const map = buildPlayerBadgeFactsMap(players, matches)
  const key = toStr(playerId)
  return generateBadgesFromFacts(map.get(key))
}

export function getBadgeThresholds(slug) {
  const overrides = readBadgeTierOverrides()
  const tierRule = tieredRules.find((r) => r.slug === slug)
  if (tierRule) {
    return resolveTieredRuleTiers(tierRule, overrides)
      .map((t) => ({ tier: t.tier, threshold: t.min }))
      .sort((a, b) => a.tier - b.tier)
  }
  const singleRule = singleRules.find((r) => r.slug === slug)
  if (singleRule) {
    const thresholds = resolveSingleRuleThresholds(singleRule, overrides)
    const entries = Object.entries(thresholds)
      .map(([tier, threshold]) => ({ tier: Number(tier), threshold }))
      .filter((row) => Number.isFinite(row.tier) && Number.isFinite(row.threshold))
      .sort((a, b) => a.tier - b.tier)
    if (entries.length) return entries
    if (typeof singleRule.threshold === 'number') {
      const tierVal = typeof singleRule.tier === 'function' ? 1 : (singleRule.tier || 1)
      return [{ tier: tierVal, threshold: singleRule.threshold }]
    }
  }
  return []
}

export function getBadgeTierRuleCatalog() {
  const tiered = tieredRules.map((rule) => ({
    slug: rule.slug,
    name: typeof rule.name === 'string' ? rule.name : rule.slug,
    categoryKey: rule.categoryKey,
    type: 'tiered',
    tiers: (rule.tiers || []).map((tier) => ({ tier: tier.tier, min: tier.min }))
  }))
  const single = singleRules
    .filter((rule) => rule.thresholds && Object.keys(rule.thresholds).length > 0)
    .map((rule) => ({
      slug: rule.slug,
      name: typeof rule.name === 'string' ? rule.name : rule.slug,
      categoryKey: rule.categoryKey,
      type: 'single',
      tiers: Object.entries(rule.thresholds).map(([tier, threshold]) => ({ tier: Number(tier), min: threshold }))
    }))
  return [...tiered, ...single].map((entry) => ({
    ...entry,
    tiers: entry.tiers.sort((a, b) => a.tier - b.tier)
  }))
}
