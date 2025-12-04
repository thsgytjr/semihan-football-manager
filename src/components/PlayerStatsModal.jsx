import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, BarChart3, Award } from 'lucide-react'
import InitialAvatar from './InitialAvatar'
import { getMembershipBadge } from '../lib/membershipConfig'

function ensurePortalTarget() {
  if (typeof document === 'undefined') return null
  let node = document.getElementById('modal-root')
  if (!node) {
    node = document.createElement('div')
    node.id = 'modal-root'
    document.body.appendChild(node)
  }
  return node
}

const StatBlock = ({ label, value, helper }) => {
  const display = value == null || value === '' ? '—' : value
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className="text-2xl font-semibold text-stone-900">{display}</p>
      {helper && <p className="text-[11px] text-stone-400">{helper}</p>}
    </div>
  )
}

const ResultPill = ({ value }) => {
  const tone = value === 'W'
    ? 'bg-emerald-100 text-emerald-700'
    : value === 'L'
      ? 'bg-rose-100 text-rose-600'
      : 'bg-stone-100 text-stone-600'
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  )
}

function hasDataSection(values = []) {
  return values.some((val) => Number.isFinite(val) || (typeof val === 'string' && val.trim() !== ''))
}

const toNumber = (value) => {
  if (value == null) return null
  const numeric = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const ChartBar = ({ label, valueLabel, percent, accent = 'bg-emerald-500' }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
      <span>{label}</span>
      <span className="tabular-nums text-stone-700">{valueLabel}</span>
    </div>
    <div className="h-2 rounded-full bg-stone-100">
      <div
        className={`h-full rounded-full transition-all duration-300 ${accent}`}
        style={{ width: `${Math.max(0, Math.min(100, percent || 0))}%` }}
      />
    </div>
  </div>
)

export default function PlayerStatsModal({
  open = false,
  player = null,
  stats = null,
  onClose,
  onShowBadges,
  customMemberships = []
}) {
  const { t } = useTranslation()
  const shouldRender = Boolean(open && player)
  const seasonOrder = useMemo(() => {
    if (Array.isArray(stats?.seasonOrder) && stats.seasonOrder.length > 0) {
      return stats.seasonOrder
    }
    return stats?.attack ? ['overall'] : []
  }, [stats])
  const seasonStatsMap = stats?.seasonStats || {}
  const preferredSeasonKey = useMemo(() => {
    if (!seasonOrder || seasonOrder.length === 0) return 'overall'
    const nonOverall = seasonOrder.find((key) => key && key !== 'overall')
    return nonOverall || seasonOrder[0] || 'overall'
  }, [seasonOrder])
  const [seasonKey, setSeasonKey] = useState(() => preferredSeasonKey)

  useEffect(() => {
    if (!seasonOrder.length) return
    setSeasonKey((prev) => (seasonOrder.includes(prev) ? prev : preferredSeasonKey))
  }, [seasonOrder, preferredSeasonKey])

  useEffect(() => {
    if (!shouldRender) return undefined
    const handler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shouldRender, onClose])

  const portalTarget = useMemo(() => (shouldRender ? ensurePortalTarget() : null), [shouldRender])
  const attack = stats?.attack || null
  const efficiency = stats?.efficiency || null
  const baseDraftRecord = stats?.draftRecord || null
  const baseDraftAttack = stats?.draftAttack || null
  const cards = stats?.cards || null
  const momAwards = Number(stats?.momAwards ?? 0)
  const contextLabel = stats?.filterDescription || ''
  const baseHighlights = stats?.highlights || null
  const overallHighlights = stats?.overallHighlights || null
  const competition = stats?.competition || null
  const funFactsEnabled = stats?.factsEnabled !== false
  const membershipBadge = player?.membership ? getMembershipBadge(player.membership, customMemberships) : null
  const baseTopPartners = stats?.chemistry?.topPartners || []
  const overallTopPartners = stats?.overallChemistry?.topPartners || []
  const seasonLookup = useMemo(() => {
    const next = { ...seasonStatsMap }
    const overallEntry = next.overall || {}
    const mergedOverall = {
      attack: overallEntry.attack || attack,
      efficiency: overallEntry.efficiency || efficiency,
      draftRecord: overallEntry.draftRecord || baseDraftRecord,
      draftAttack: overallEntry.draftAttack || baseDraftAttack,
    }
    if (mergedOverall.attack || mergedOverall.efficiency || mergedOverall.draftRecord || mergedOverall.draftAttack) {
      next.overall = mergedOverall
    } else if (next.overall) {
      delete next.overall
    }
    return next
  }, [seasonStatsMap, attack, efficiency, baseDraftRecord, baseDraftAttack])

  const fallbackSeasonKey = seasonOrder[0] || 'overall'
  const fallbackOverall = (attack || efficiency || baseDraftRecord || baseDraftAttack)
    ? { attack, efficiency, draftRecord: baseDraftRecord, draftAttack: baseDraftAttack }
    : null
  const activeSeasonEntry = seasonLookup[seasonKey] || seasonLookup[fallbackSeasonKey] || fallbackOverall
  const seasonAttack = activeSeasonEntry?.attack || attack
  const seasonEfficiency = activeSeasonEntry?.efficiency || efficiency
  const draftRecord = activeSeasonEntry?.draftRecord || baseDraftRecord
  const draftAttack = activeSeasonEntry?.draftAttack || baseDraftAttack

  // overall 시즌일 때는 전체 매치 기반 데이터 사용
  const highlights = seasonKey === 'overall' ? overallHighlights : baseHighlights
  const topPartners = seasonKey === 'overall' ? overallTopPartners : baseTopPartners

  const badgesPinned = Boolean(
    player?.challengeBadgesPinned ||
    player?.hasChallengeBadgePinned ||
    player?.badgesInline ||
    stats?.badgesInline
  )
  const hideBadgesButton = Boolean(player?.hideBadgesButton || player?.showBadgesButton === false || badgesPinned)
  const showBadgeCta = typeof onShowBadges === 'function' && !hideBadgesButton

  const formatSeasonLabel = (key) => {
    if (!key || key === 'unknown') return t('playerStatsModal.seasons.unknown')
    if (key === 'overall') return t('playerStatsModal.seasons.overall')
    return t('playerStatsModal.seasons.named', { season: key })
  }

  const summaryItems = useMemo(() => ([
    { label: t('playerStatsModal.labels.apps'), value: seasonAttack?.gp ?? null, helper: t('playerStatsModal.helpers.apps') },
    { label: t('playerStatsModal.labels.goals'), value: seasonAttack?.g ?? null, helper: t('playerStatsModal.helpers.goals') },
    { label: t('playerStatsModal.labels.assists'), value: seasonAttack?.a ?? null, helper: t('playerStatsModal.helpers.assists') },
    { label: t('playerStatsModal.labels.points'), value: seasonAttack?.pts ?? null, helper: t('playerStatsModal.helpers.points') },
    { label: t('playerStatsModal.labels.cleanSheets'), value: seasonAttack?.cs ?? null, helper: t('playerStatsModal.helpers.cleanSheets') },
    { label: t('playerStatsModal.labels.momAwards'), value: Number.isFinite(momAwards) ? momAwards : null, helper: t('playerStatsModal.helpers.momAwards') }
  ]), [seasonAttack, momAwards, t])

  const efficiencyItems = useMemo(() => ([
    { label: t('playerStatsModal.labels.gPerGame'), value: seasonEfficiency?.gPerGame ?? null, helper: t('playerStatsModal.helpers.gPerGame') },
    { label: t('playerStatsModal.labels.aPerGame'), value: seasonEfficiency?.aPerGame ?? null, helper: t('playerStatsModal.helpers.aPerGame') },
    { label: t('playerStatsModal.labels.ptsPerGame'), value: seasonEfficiency?.ptsPerGame ?? null, helper: t('playerStatsModal.helpers.ptsPerGame') }
  ]), [seasonEfficiency, t])

  const draftRecordItems = useMemo(() => ([
    { label: t('playerStatsModal.labels.wins'), value: draftRecord?.wins != null ? draftRecord.wins : null },
    { label: t('playerStatsModal.labels.draws'), value: draftRecord?.draws != null ? draftRecord.draws : null },
    { label: t('playerStatsModal.labels.losses'), value: draftRecord?.losses != null ? draftRecord.losses : null },
    { label: t('playerStatsModal.labels.winRate'), value: draftRecord?.winRate != null ? `${draftRecord.winRate}%` : null },
    { label: t('playerStatsModal.labels.draftPoints'), value: draftRecord?.points != null ? draftRecord.points : null }
  ]), [draftRecord, t])

  const draftAttackItems = useMemo(() => ([
    { label: t('playerStatsModal.labels.draftGames'), value: draftAttack?.gp != null ? draftAttack.gp : null },
    { label: t('playerStatsModal.labels.draftGoals'), value: draftAttack?.g != null ? draftAttack.g : null },
    { label: t('playerStatsModal.labels.draftAssists'), value: draftAttack?.a != null ? draftAttack.a : null },
    { label: t('playerStatsModal.labels.draftPts'), value: draftAttack?.pts != null ? draftAttack.pts : null },
    { label: t('playerStatsModal.labels.draftGoalsPer'), value: draftAttack?.gpg ?? null },
    { label: t('playerStatsModal.labels.draftPointsPer'), value: draftAttack?.apa ?? null }
  ]), [draftAttack, t])

  const disciplineItems = useMemo(() => ([
    { label: t('playerStatsModal.labels.yellow'), value: cards?.yellow != null ? cards.yellow : null },
    { label: t('playerStatsModal.labels.red'), value: cards?.red != null ? cards.red : null },
    { label: t('playerStatsModal.labels.black'), value: cards?.black != null ? cards.black : null }
  ]), [cards, t])

  const hasSummary = hasDataSection(summaryItems.map((item) => item.value))
  const hasEfficiency = hasDataSection(efficiencyItems.map((item) => item.value))
  const hasDraftRecord = hasDataSection(draftRecordItems.map((item) => item.value)) || (draftRecord?.last5?.length > 0)
  const hasDraftAttack = hasDataSection(draftAttackItems.map((item) => item.value))
  const hasDiscipline = hasDataSection(disciplineItems.map((item) => item.value))
  const noStats = !hasSummary && !hasDraftRecord && !hasDraftAttack && !hasEfficiency && !hasDiscipline

  const scoringBars = useMemo(() => {
    const entries = []
    const goals = toNumber(seasonAttack?.g)
    if (goals != null) entries.push({ label: t('playerStatsModal.labels.goals'), value: goals, accent: 'bg-emerald-500' })
    const assists = toNumber(seasonAttack?.a)
    if (assists != null) entries.push({ label: t('playerStatsModal.labels.assists'), value: assists, accent: 'bg-cyan-500' })
    const points = toNumber(seasonAttack?.pts)
    if (points != null) entries.push({ label: t('playerStatsModal.labels.points'), value: points, accent: 'bg-amber-500' })
    const cleanSheets = toNumber(seasonAttack?.cs)
    const gamesPlayed = toNumber(seasonAttack?.gp)
    if (cleanSheets != null) {
      entries.push({
        label: t('playerStatsModal.labels.cleanSheets'),
        value: cleanSheets,
        accent: 'bg-sky-500',
        ratio: gamesPlayed && gamesPlayed > 0 ? Math.min(100, (cleanSheets / gamesPlayed) * 100) : null,
      })
    }
    if (!entries.length) return []
    const maxVal = Math.max(...entries.map(e => e.value), 1)
    return entries.map(e => ({
      label: e.label,
      valueLabel: e.value.toLocaleString(),
      percent: e.ratio != null ? e.ratio : (e.value / maxVal) * 100,
      accent: e.accent,
    }))
  }, [seasonAttack, t])

  const efficiencyBars = useMemo(() => {
    const entries = []
    const winRateVal = toNumber(draftRecord?.winRate)
    if (winRateVal != null) entries.push({
      label: t('playerStatsModal.labels.winRate'),
      valueLabel: `${winRateVal}%`,
      percent: winRateVal,
      accent: 'bg-emerald-600',
    })
    const draftAttackPer = toNumber(draftAttack?.apa)
    if (draftAttackPer != null) entries.push({
      label: t('playerStatsModal.labels.draftPointsPer'),
      valueLabel: draftAttackPer.toFixed(2),
      percent: Math.min(100, draftAttackPer * 40),
      accent: 'bg-indigo-500',
    })
    const draftGoalsPer = toNumber(draftAttack?.gpg)
    if (draftGoalsPer != null) entries.push({
      label: t('playerStatsModal.labels.draftGoalsPer'),
      valueLabel: draftGoalsPer.toFixed(2),
      percent: Math.min(100, draftGoalsPer * 50),
      accent: 'bg-rose-500',
    })
    return entries
  }, [draftAttack, draftRecord, t])

  const showDraftRecordSection = hasDraftRecord || efficiencyBars.length > 0

  const funFacts = useMemo(() => {
    if (!funFactsEnabled) return []

    const factEntries = []
    let order = 0
    const pushFact = (text, priority) => {
      if (!text) return
      factEntries.push({ text, priority, order: order++ })
    }

    const cleanSheets = toNumber(attack?.cs)
    if (competition?.pointsDeadHeat?.name) {
      pushFact(t('playerStatsModal.facts.pointsDeadHeat', { name: competition.pointsDeadHeat.name }), 0)
    }
    if (competition?.appsDeadHeat?.name) {
      pushFact(t('playerStatsModal.facts.appsDeadHeat', { name: competition.appsDeadHeat.name }), 0)
    }

    const closeRaceFacts = [
      competition?.pointsChasing && t('playerStatsModal.facts.pointsChasing', { name: competition.pointsChasing.name || t('playerStatsModal.facts.rival'), diff: competition.pointsChasing.diff }),
      competition?.pointsDefending && t('playerStatsModal.facts.pointsDefending', { name: competition.pointsDefending.name || t('playerStatsModal.facts.rival'), diff: competition.pointsDefending.diff }),
      competition?.appsChasing && t('playerStatsModal.facts.appsChasing', { name: competition.appsChasing.name || t('playerStatsModal.facts.rival'), diff: competition.appsChasing.diff }),
      competition?.appsDefending && t('playerStatsModal.facts.appsDefending', { name: competition.appsDefending.name || t('playerStatsModal.facts.rival'), diff: competition.appsDefending.diff }),
    ]
    closeRaceFacts.forEach((fact) => pushFact(fact, 1))

    let milestonesUsed = 0
    const milestoneDefs = [
      ['firstGoal', 'playerStatsModal.facts.firstGoal'],
      ['firstAssist', 'playerStatsModal.facts.firstAssist'],
      ['firstAttackPoint', 'playerStatsModal.facts.firstAttackPoint'],
      ['firstCleanSheet', 'playerStatsModal.facts.firstCleanSheet'],
      ['firstMom', 'playerStatsModal.facts.firstMom'],
    ]
    milestoneDefs.forEach(([key, label]) => {
      const record = highlights?.[key]
      if (!record?.label) return
      if (key === 'firstCleanSheet' && !(cleanSheets > 0)) return
      if (milestonesUsed >= 2) return
      pushFact(t(label, { match: record.label }), 2)
      milestonesUsed += 1
    })

    if (cleanSheets != null && cleanSheets > 0) {
      pushFact(t('playerStatsModal.facts.cleanSheets', { count: cleanSheets }), 3)
    }
    if (momAwards > 0) {
      pushFact(t('playerStatsModal.facts.momAwards', { count: momAwards }), 3)
    }
    const cardTotal = (toNumber(cards?.yellow) || 0) + (toNumber(cards?.red) || 0) + (toNumber(cards?.black) || 0)
    if (cardTotal > 0) {
      pushFact(t('playerStatsModal.facts.cards', { yellow: cards?.yellow || 0, red: cards?.red || 0, black: cards?.black || 0 }), 3)
    }
    if (draftRecord?.winRate != null) {
      pushFact(t('playerStatsModal.facts.winRate', { rate: draftRecord.winRate }), 3)
    }
    if (topPartners.length > 0) {
      pushFact(t('playerStatsModal.facts.chemistry', { name: topPartners[0].name, count: topPartners[0].count }), 3)
    }

    const MAX_FACTS = 4
    return factEntries
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .slice(0, MAX_FACTS)
      .map((entry) => entry.text)
  }, [funFactsEnabled, attack?.cs, cards?.red, cards?.yellow, draftRecord?.winRate, momAwards, t, topPartners, highlights, competition])

  const modal = (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={t('playerStatsModal.title', { name: player?.name ?? 'Player' })}
      onClick={() => onClose?.()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-stone-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative flex flex-col gap-4 border-b border-stone-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="absolute right-4 top-4 inline-flex items-center justify-center rounded-full bg-white/90 p-2 text-stone-600 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-100 sm:hidden"
            aria-label={t('playerStatsModal.close')}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{t('playerStatsModal.subtitle')}</p>
              <h2 className="text-2xl font-bold text-stone-900 notranslate" translate="no">
                {t('playerStatsModal.title', { name: player?.name ?? 'Player' })}
              </h2>
              {contextLabel && seasonKey !== 'overall' && (
                <p className="text-sm text-stone-500">{t('playerStatsModal.filterContext', { context: contextLabel })}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showBadgeCta && (
              <button
                type="button"
                onClick={() => onShowBadges(player)}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"
              >
                <Award className="h-4 w-4" />
                {t('playerStatsModal.viewBadges')}
              </button>
            )}
            <button
              type="button"
              onClick={() => onClose?.()}
              className="hidden rounded-full bg-stone-200 p-2 text-stone-600 hover:bg-stone-300 sm:inline-flex"
              aria-label={t('playerStatsModal.close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <section className="flex flex-wrap items-center gap-4 rounded-3xl border border-stone-200 bg-white px-4 py-4 shadow-sm">
            <InitialAvatar
              id={player?.id}
              name={player?.name}
              photoUrl={player?.photoUrl}
              size={64}
              customMemberships={customMemberships}
              badges={membershipBadge ? [membershipBadge.badge] : []}
              badgeInfo={membershipBadge}
            />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-stone-400">{t('playerStatsModal.labels.player')}</p>
              <p className="text-lg font-semibold text-stone-900 notranslate" translate="no">{player?.name}</p>
              {player?.membership && (
                <p className="text-sm text-stone-500">{player.membership}</p>
              )}
            </div>
          </section>

          {noStats && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-sm text-stone-500">
              {t('playerStatsModal.empty')}
            </div>
          )}

          {!noStats && (hasSummary || scoringBars.length > 0 || efficiencyBars.length > 0) && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.seasonSnapshot')}</h3>
                {seasonOrder.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    {seasonOrder.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSeasonKey(key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${seasonKey === key ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
                      >
                        {formatSeasonLabel(key)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4 rounded-3xl border border-stone-200 bg-white/90 p-4 shadow-sm">
                {hasSummary && (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    {summaryItems.map((item) => (
                      <StatBlock key={item.label} label={item.label} value={item.value} helper={item.helper} />
                    ))}
                  </div>
                )}
                {hasEfficiency && (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {efficiencyItems.map((item) => (
                      <StatBlock key={item.label} label={item.label} value={item.value} helper={item.helper} />
                    ))}
                  </div>
                )}
                {scoringBars.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.visual')}</p>
                    <div className="space-y-2">
                      {scoringBars.map((bar) => (
                        <ChartBar key={bar.label} label={bar.label} valueLabel={bar.valueLabel} percent={bar.percent} accent={bar.accent} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {!noStats && topPartners.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.chemistry')}</h3>
              <div className="space-y-3 rounded-3xl border border-stone-200 bg-white p-4">
                {topPartners.map((partner, idx) => {
                  const partnerKey = partner?.id
                    ? `${partner.id}-${partner.role || 'role'}-${partner.count || 0}-${idx}`
                    : `partner-${idx}`
                  return (
                    <div key={partnerKey} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <InitialAvatar
                          id={partner.id}
                          name={partner.name}
                          size={36}
                          photoUrl={partner.photoUrl}
                          customMemberships={customMemberships}
                        />
                        <div>
                          <p className="font-semibold text-stone-800 notranslate" translate="no">{partner.name}</p>
                          <p className="text-xs text-stone-500">{t(`playerStatsModal.chemistryRole.${partner.role}`)}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                        {t('playerStatsModal.labels.duoCount', { count: partner.count })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {!noStats && showDraftRecordSection && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.draftRecord')}</h3>
                {hasDraftRecord && draftRecord?.last5?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-stone-500">
                    {t('playerStatsModal.labels.last5')}
                    {draftRecord.last5.slice(-5).map((val, idx) => (
                      <ResultPill key={`${val}-${idx}`} value={val} />
                    ))}
                  </div>
                )}
              </div>
              {hasDraftRecord && (
                <div className="grid gap-3 md:grid-cols-5">
                  {draftRecordItems.map((item) => (
                    <StatBlock key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              )}
              {efficiencyBars.length > 0 && (
                <div className="space-y-2 rounded-3xl border border-stone-200 bg-white/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.momentum')}</p>
                  <div className="space-y-2">
                    {efficiencyBars.map((bar) => (
                      <ChartBar key={bar.label} label={bar.label} valueLabel={bar.valueLabel} percent={bar.percent} accent={bar.accent} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {!noStats && hasDraftAttack && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.draftAttack')}</h3>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {draftAttackItems.map((item) => (
                  <StatBlock key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </section>
          )}

          {!noStats && funFacts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.facts')}</h3>
              <ul className="space-y-2">
                {funFacts.map((fact, idx) => (
                  <li key={`fact-${idx}`} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
                    {fact}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!noStats && hasDiscipline && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{t('playerStatsModal.sections.discipline')}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {disciplineItems.map((item) => (
                  <StatBlock key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )

  if (!shouldRender || !portalTarget) return null

  return createPortal(modal, portalTarget)
}
