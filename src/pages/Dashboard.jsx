// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Tab } from '@headlessui/react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import SavedMatchesList from '../components/SavedMatchesList'
import LeaderboardTable, { RankCell, PlayerNameCell, StatCell, FormDotsCell } from '../components/LeaderboardTable'
import Medal from '../components/ranking/Medal'
import FormDots from '../components/ranking/FormDots'
import UpcomingMatchesWidget from '../components/UpcomingMatchesWidget'
import MoMNoticeWidget from '../components/MoMNoticeWidget'
import { MoMPopup } from '../components/MoMPopup'
import { MoMLeaderboard } from '../components/MoMLeaderboard'
import { MoMAwardDetailModal } from '../components/MoMAwardDetailModal'
import PlayerBadgeModal from '../components/badges/PlayerBadgeModal'
import PlayerStatsModal from '../components/PlayerStatsModal'
import { Award } from 'lucide-react'
import { useMoMPrompt } from '../hooks/useMoMPrompt'
import { useMoMAwardsSummary } from '../hooks/useMoMAwardsSummary'
import { toStr, extractDateKey, extractSeason, extractStatsByPlayer } from '../lib/matchUtils'
import { getCountdownParts } from '../lib/momUtils'
import { rankTone } from '../lib/rankingUtils'
import { notify } from '../components/Toast'
import { logger } from '../lib/logger'
import Select from '../components/Select'
import { 
  computeAttackRows, 
  sortComparator, 
  addRanks,
  computeDuoRows,
  computeDraftPlayerStatsRows,
  computeCaptainStatsRows,
  computeDraftAttackRows,
  computeCardsRows
} from '../lib/leaderboardComputations'
import { getMembershipBadge } from '../lib/membershipConfig'
import MobileCategoryCarousel from '../components/MobileCategoryCarousel'
import { buildPlayerBadgeFactsMap, generateBadgesFromFacts } from '../lib/playerBadgeEngine'
import { fetchPlayerBadges } from '../services/badgeService'
import SeasonRecap from '../components/SeasonRecap'

// 멤버십 helper 함수
const S = (v) => v == null ? '' : String(v)
const isAssociate = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === 'associate' || s.includes('준회원')
}
const isGuest = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === 'guest' || s.includes('게스트')
}

// 커스텀 멤버십 기반 배지 가져오기
const getBadgesWithCustom = (membership, customMemberships = []) => {
  const badgeInfo = getMembershipBadge(membership, customMemberships)
  return badgeInfo ? [badgeInfo.badge] : []
}

const dateKeyToTimestamp = (key) => {
  if (typeof key !== 'string') return Number.NaN
  const parts = key.split('/')
  if (parts.length !== 3) return Number.NaN
  const [mm, dd, yyyy] = parts
  const month = Number(mm)
  const day = Number(dd)
  const year = Number(yyyy)
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return Number.NaN
  if (month < 1 || month > 12 || day < 1 || day > 31) return Number.NaN
  const ts = Date.UTC(year, month - 1, day)
  return Number.isNaN(ts) ? Number.NaN : ts
}

const compareDateKeysAsc = (a, b) => {
  const ta = dateKeyToTimestamp(a)
  const tb = dateKeyToTimestamp(b)
  const taNaN = Number.isNaN(ta)
  const tbNaN = Number.isNaN(tb)
  if (taNaN && tbNaN) return 0
  if (taNaN) return 1
  if (tbNaN) return -1
  return ta - tb
}

const compareDateKeysDesc = (a, b) => compareDateKeysAsc(b, a)

const getMatchTimestamp = (match) => {
  if (!match) return null
  const candidates = [
    match.momVoteAnchor,
    match.draft?.momVoteAnchor,
    match.dateISO,
    match.date,
    match.matchDate,
    match.created_at,
    match.createdAt,
  ]
  for (const value of candidates) {
    if (!value) continue
    const ts = Date.parse(value)
    if (!Number.isNaN(ts)) {
      return ts
    }
  }
  return null
}

const toLabelString = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    for (const entry of value) {
      const label = toLabelString(entry)
      if (label) return label
    }
    return ''
  }
  if (typeof value === 'object') {
    return toLabelString(
      value.label ??
      value.name ??
      value.title ??
      value.text ??
      value.value ??
      value.opponent ??
      value.location ??
      value.description ??
      ''
    )
  }
  return ''
}

const buildPlayerRowMap = (rows = []) => {
  const map = new Map()
  rows.forEach((row) => {
    if (!row || row.id == null) return
    map.set(toStr(row.id), row)
  })
  return map
}

/* --------------------------------------------------------
   MOBILE-FIRST LEADERBOARD (Compact Segmented Tabs)
   - Tabs collapse into scrollable chips on small screens
   - G/A/GP 헤더 클릭 시 해당 탭으로 전환
   - Most Appearances(gp) 탭 추가
   - 드롭다운(날짜) + 전체보기/접기 왼쪽 정렬
   - OVR 요소는 히스토리에서 숨김
--------------------------------------------------------- */

/* --------------------- 에러 바운더리 ---------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) {}
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <div className="text-sm text-stone-500">문제가 발생했어요.</div>
    }
    return this.props.children
  }
}

/* -------------------------- 메인 -------------------------- */
export default function Dashboard({ 
  players = [], 
  matches = [], 
  isAdmin, 
  onUpdateMatch,
  upcomingMatches = [],
  onSaveUpcomingMatch,
  onDeleteUpcomingMatch,
  onUpdateUpcomingMatch,
  membershipSettings = [],
  momFeatureEnabled = true,
  leaderboardToggles = {},
  badgesEnabled = true,
  playerStatsEnabled: playerStatsEnabledProp,
  playerFactsEnabled: legacyPlayerFactsEnabled,
  seasonRecapEnabled = true,
  seasonRecapReady = true,
}) {
  const playerStatsEnabled = playerStatsEnabledProp ?? (legacyPlayerFactsEnabled ?? true)
  const playerFactsEnabled = playerStatsEnabled // legacy alias for any stale references
  const { t } = useTranslation()
  const customMemberships = membershipSettings.length > 0 ? membershipSettings : []
  const isMoMEnabled = useMemo(() => {
    if (momFeatureEnabled === undefined) return true
    if (typeof momFeatureEnabled === 'string') {
      const normalized = momFeatureEnabled.trim().toLowerCase()
      if (['false', '0', 'off', 'disabled', 'no', 'n'].includes(normalized)) return false
      if (['true', '1', 'on', 'enabled', 'yes', 'y'].includes(normalized)) return true
      return normalized !== 'false'
    }
    if (typeof momFeatureEnabled === 'number') {
      return momFeatureEnabled !== 0
    }
    return Boolean(momFeatureEnabled)
  }, [momFeatureEnabled])
  
  // 시즌 필터 상태 (리더보드/히스토리 분리)
  const [leaderboardSeason, setLeaderboardSeason] = useState('all')
  const [historySeason, setHistorySeason] = useState('all')
  
  // Season Recap 모달 상태
  const [showSeasonRecap, setShowSeasonRecap] = useState(() => seasonRecapEnabled && seasonRecapReady) // 기능 토글 반영
  
  // seasonRecapEnabled/Ready 상태 변화 시 모달 표시 여부 업데이트
  useEffect(() => {
    if (seasonRecapReady) {
      setShowSeasonRecap(seasonRecapEnabled)
    } else {
      setShowSeasonRecap(false)
    }
  }, [seasonRecapEnabled, seasonRecapReady])
  
  // 시즌 옵션 생성 (년도별)
  const seasonOptions = useMemo(() => {
    const seasons = new Set()
    for (const m of matches) {
      const season = extractSeason(m)
      if (season) seasons.add(season)
    }
    return ['all', ...Array.from(seasons).sort().reverse()]
  }, [matches])

  const leaderboardDefaultSeason = useMemo(() => {
    const firstSeason = seasonOptions.find((option) => option !== 'all')
    return firstSeason || 'all'
  }, [seasonOptions])
  
  // 시즌별 필터링 (리더보드용)
  const leaderboardSeasonFilteredMatches = useMemo(() => {
    if (leaderboardSeason === 'all') return matches
    return matches.filter(m => extractSeason(m) === leaderboardSeason)
  }, [matches, leaderboardSeason])
  const seasonRecapMatches = useMemo(() => {
    if (leaderboardSeasonFilteredMatches.length === 0 && matches.length > 0) {
      return matches
    }
    return leaderboardSeasonFilteredMatches
  }, [leaderboardSeasonFilteredMatches, matches])

  // 시즌별 필터링 (히스토리용)
  const historySeasonFilteredMatches = useMemo(() => {
    if (historySeason === 'all') return matches
    return matches.filter(m => extractSeason(m) === historySeason)
  }, [matches, historySeason])
  
  const [apDateKey, setApDateKey] = useState('all')
  const dateOptions = useMemo(() => {
    const set = new Set()
    for (const m of leaderboardSeasonFilteredMatches) {
      const k = extractDateKey(m)
      if (k) set.add(k)
    }
    const sortedKeys = Array.from(set).sort(compareDateKeysDesc)
    return ['all', ...sortedKeys]
  }, [leaderboardSeasonFilteredMatches])

  const filteredMatches = useMemo(
    () => apDateKey === 'all' ? leaderboardSeasonFilteredMatches : leaderboardSeasonFilteredMatches.filter(m => extractDateKey(m) === apDateKey),
    [leaderboardSeasonFilteredMatches, apDateKey]
  )

  const filteredMatchIdSet = useMemo(() => {
    const set = new Set()
    filteredMatches.forEach((m) => {
      if (m?.id != null) set.add(toStr(m.id))
    })
    return set
  }, [filteredMatches])

  const statsFilterDescription = useMemo(() => {
    if (apDateKey === 'all') {
      return t('playerStatsModal.filters.allMatches')
    }
    return t('playerStatsModal.filters.byDate', { date: apDateKey })
  }, [apDateKey, t])

  const baseRows = useMemo(() => computeAttackRows(players, filteredMatches), [players, filteredMatches])

  // 전체 매치 기반 데이터 (overall 시즌용)
  const allMatchesBaseRows = useMemo(() => computeAttackRows(players, matches), [players, matches])
  const allMatchesDraftWinRows = useMemo(() => computeDraftPlayerStatsRows(players, matches), [players, matches])
  const allMatchesDraftAttackRows = useMemo(() => computeDraftAttackRows(players, matches), [players, matches])
  const allMatchesCardsRows = useMemo(() => computeCardsRows(players, matches), [players, matches])

  const allMatchesAttackRowMap = useMemo(() => buildPlayerRowMap(allMatchesBaseRows), [allMatchesBaseRows])
  const allMatchesDraftRecordMap = useMemo(() => buildPlayerRowMap(allMatchesDraftWinRows), [allMatchesDraftWinRows])
  const allMatchesDraftAttackRowMap = useMemo(() => buildPlayerRowMap(allMatchesDraftAttackRows), [allMatchesDraftAttackRows])
  const allMatchesCardsRowMap = useMemo(() => buildPlayerRowMap(allMatchesCardsRows), [allMatchesCardsRows])

  // Draft 전용: 선수/주장 승리 집계
  const draftWinRows = useMemo(() => computeDraftPlayerStatsRows(players, filteredMatches), [players, filteredMatches])
  const captainWinRows = useMemo(() => computeCaptainStatsRows(players, filteredMatches), [players, filteredMatches])
  const draftAttackRows = useMemo(() => computeDraftAttackRows(players, filteredMatches), [players, filteredMatches])
  const seasonRecapDuoRows = useMemo(() => computeDuoRows(players, seasonRecapMatches), [players, seasonRecapMatches])
  const seasonRecapDraftPlayerRows = useMemo(() => computeDraftPlayerStatsRows(players, seasonRecapMatches), [players, seasonRecapMatches])
  const seasonRecapCaptainRows = useMemo(() => computeCaptainStatsRows(players, seasonRecapMatches), [players, seasonRecapMatches])

  const mom = useMoMPrompt({ matches, players })
  const momAwards = useMoMAwardsSummary(matches, { limit: null })

  // 탭 구조 개편: 1차(종합|draft), 2차(종합: pts/g/a/gp | draft: playerWins/captainWins/attack)
  const [primaryTab, setPrimaryTab] = useState('pts') // 'pts' | 'draft' | 'mom'
  const [apTab, setApTab] = useState('pts')           // 'pts' | 'g' | 'a' | 'gp' | 'cs' | 'duo' | 'cards'
  const [draftTab, setDraftTab] = useState('playerWins') // 'playerWins' | 'captainWins' | 'attack'
  const rankedRows = useMemo(() => addRanks(baseRows, apTab), [baseRows, apTab])
  const duoRows = useMemo(() => computeDuoRows(players, filteredMatches), [players, filteredMatches])
  const allMatchesDuoRows = useMemo(() => computeDuoRows(players, matches), [players, matches])
  const csRows = useMemo(() => addRanks(baseRows, 'cs'), [baseRows])
  const cardsRows = useMemo(() => computeCardsRows(players, filteredMatches), [players, filteredMatches])
  const attackRowMap = useMemo(() => buildPlayerRowMap(baseRows), [baseRows])
  const draftRecordMap = useMemo(() => buildPlayerRowMap(draftWinRows), [draftWinRows])
  const draftAttackRowMap = useMemo(() => buildPlayerRowMap(draftAttackRows), [draftAttackRows])
  const cardsRowMap = useMemo(() => buildPlayerRowMap(cardsRows), [cardsRows])
  const attackCompetitionMap = useMemo(() => {
    const map = new Map()
    if (!playerStatsEnabled || !rankedRows || rankedRows.length === 0) return map

    const closePointDiff = 2
    const closeAppsDiff = 1

    rankedRows.forEach((row, index) => {
      if (!row || row.id == null) return
      const key = toStr(row.id)
      const ahead = rankedRows[index - 1]
      const behind = rankedRows[index + 1]
      const entry = {}
      const currPts = Number(row?.pts ?? 0)
      const currApps = Number(row?.gp ?? 0)

      const evaluateNeighbor = (neighbor, direction) => {
        if (!neighbor || neighbor.id == null) return
        const neighborPts = Number(neighbor.pts ?? 0)
        const neighborApps = Number(neighbor.gp ?? 0)

        if (Number.isFinite(currPts) && Number.isFinite(neighborPts)) {
          if (neighborPts === currPts) {
            if (!entry.pointsDeadHeat) {
              entry.pointsDeadHeat = { name: neighbor.name, playerId: neighbor.id }
            }
          } else {
            const diff = direction === 'ahead' ? neighborPts - currPts : currPts - neighborPts
            if (diff > 0 && diff <= closePointDiff) {
              const keyName = direction === 'ahead' ? 'pointsChasing' : 'pointsDefending'
              entry[keyName] = { playerId: neighbor.id, name: neighbor.name, diff }
            }
          }
        }

        if (Number.isFinite(currApps) && Number.isFinite(neighborApps)) {
          if (neighborApps === currApps) {
            if (!entry.appsDeadHeat) {
              entry.appsDeadHeat = { name: neighbor.name, playerId: neighbor.id }
            }
          } else {
            const diff = direction === 'ahead' ? neighborApps - currApps : currApps - neighborApps
            if (diff > 0 && diff <= closeAppsDiff) {
              const keyName = direction === 'ahead' ? 'appsChasing' : 'appsDefending'
              entry[keyName] = { playerId: neighbor.id, name: neighbor.name, diff }
            }
          }
        }
      }

      evaluateNeighbor(ahead, 'ahead')
      evaluateNeighbor(behind, 'behind')

      if (Object.keys(entry).length > 0) {
        map.set(key, entry)
      }
    })

    return map
  }, [playerStatsEnabled, rankedRows])

  // 리더보드 카테고리 토글 반영
  const isEnabled = useCallback((key) => {
    const v = leaderboardToggles?.[key]
    return v === undefined ? true : !!v
  }, [leaderboardToggles])
  
  // 리더보드 카드 전체 표시 여부
  const leaderboardVisible = useMemo(() => {
    const v = leaderboardToggles?.visible
    return v === undefined ? true : !!v
  }, [leaderboardToggles])

  const [badgeModalPlayer, setBadgeModalPlayer] = useState(null)
  const [badgeModalState, setBadgeModalState] = useState({ badges: [], loading: false, error: null, source: null })
  const [statsModalPlayer, setStatsModalPlayer] = useState(null)
  const [momDetailPlayer, setMoMDetailPlayer] = useState(null)
  const statsModalTipShownRef = useRef(false)
  const leaderboardSeasonUserSetRef = useRef(false)
  const historySeasonUserSetRef = useRef(false)

  useEffect(() => {
    if (leaderboardSeasonUserSetRef.current) return
    if (!leaderboardDefaultSeason || leaderboardDefaultSeason === leaderboardSeason) return
    setLeaderboardSeason(leaderboardDefaultSeason)
    setApDateKey('all')
  }, [leaderboardDefaultSeason, leaderboardSeason])

  useEffect(() => {
    if (historySeasonUserSetRef.current) return
    if (!leaderboardDefaultSeason || historySeason === leaderboardDefaultSeason) return
    setHistorySeason(leaderboardDefaultSeason)
  }, [leaderboardDefaultSeason, historySeason])

  useEffect(() => {
    if (!playerStatsEnabled && statsModalPlayer) {
      setStatsModalPlayer(null)
    }
  }, [playerStatsEnabled, statsModalPlayer])

  

  const handleOpenMoMDetails = useCallback((player) => {
    if (!player) {
      notify('선수 정보가 없어 MOM 기록을 볼 수 없어요.', 'warning')
      return
    }
    const playerId = player.id ?? player.playerId ?? player.player_id
    if (playerId == null) {
      notify('선수 ID가 없어 MOM 기록을 볼 수 없어요.', 'warning')
      return
    }
    const modalPlayer = {
      id: playerId,
      name: player.name || player.fullName || '선수',
      photoUrl: player.photoUrl || player.avatarUrl || null,
      membership: player.membership,
    }
    setMoMDetailPlayer(modalPlayer)
  }, [])

  const closeMoMDetail = useCallback(() => {
    setMoMDetailPlayer(null)
  }, [])

  const apOptions = useMemo(() => {
    const base = [
      { id: 'pts', label: t('leaderboard.attackPoints') },
      { id: 'g', label: t('leaderboard.goals') },
      { id: 'a', label: t('leaderboard.assists') },
      { id: 'gp', label: t('leaderboard.appearances') },
      { id: 'cs', label: t('leaderboard.cleanSheets') },
      { id: 'duo', label: t('leaderboard.chemistry') },
      { id: 'cards', label: t('leaderboard.cards') },
    ]
    return base.filter(o => isEnabled(o.id))
  }, [leaderboardToggles, isEnabled, t])

  // 비활성화된 탭을 보고 있다면, 첫 번째 활성 탭으로 이동
  useEffect(() => {
    if (!apOptions.find(o => o.id === apTab)) {
      const next = apOptions[0]?.id || 'pts'
      setApTab(next)
    }
  }, [apOptions])

  const [showAll, setShowAll] = useState(false)
  const [highlightedMatchId, setHighlightedMatchId] = useState(null) // 하이라이트할 매치 ID
  const [showMoM, setShowMoM] = useState(false)
  const [manualMoMOpen, setManualMoMOpen] = useState(false)
  const [dismissedMoMMatchId, setDismissedMoMMatchId] = useState(null)

  useEffect(() => {
    if (!isMoMEnabled && primaryTab === 'mom') {
      setPrimaryTab('pts')
    }
  }, [isMoMEnabled, primaryTab])

  const playerLookup = useMemo(() => {
    const map = new Map()
    players.forEach(p => {
      if (p?.id != null) {
        map.set(toStr(p.id), p)
      }
    })
    return map
  }, [players])
  // Spotify-style recap needs its own champion feeds so precompute them once here
  const seasonRecapLeaders = useMemo(() => {
    const base = {
      mom: [],
      duo: (seasonRecapDuoRows || []).map((row) => ({
        id: row.id,
        count: row.count,
        assist: {
          id: row.assistId,
          name: row.aName,
          membership: row.aMembership,
          photoUrl: row.aPhotoUrl,
        },
        scorer: {
          id: row.goalId,
          name: row.gName,
          membership: row.gMembership,
          photoUrl: row.gPhotoUrl,
        },
      })),
      draftPlayer: (seasonRecapDraftPlayerRows || []).map((row) => ({
        id: row.id,
        name: row.name,
        value: row.points ?? row.value ?? 0,
        photoUrl: row.photoUrl || null,
      })),
      draftCaptain: (seasonRecapCaptainRows || []).map((row) => ({
        id: row.id,
        name: row.name,
        value: row.points,
        photoUrl: row.photoUrl || null,
      })),
    }
    if (!seasonRecapMatches || seasonRecapMatches.length === 0) {
      return base
    }
    const matchIdSet = new Set()
    seasonRecapMatches.forEach((match) => {
      if (match?.id != null) {
        matchIdSet.add(toStr(match.id))
      }
    })
    if (matchIdSet.size === 0) {
      return base
    }

    const momCounts = new Map()
    Object.entries(momAwards?.winnersByMatch || {}).forEach(([matchIdRaw, summary]) => {
      const matchId = toStr(matchIdRaw)
      if (!matchId || !matchIdSet.has(matchId)) return
      const winners = Array.isArray(summary?.winners) ? summary.winners : []
      winners.forEach((pidRaw) => {
        const pid = toStr(pidRaw)
        if (!pid) return
        momCounts.set(pid, (momCounts.get(pid) || 0) + 1)
      })
    })

    const mom = Array.from(momCounts.entries())
      .map(([pid, value]) => {
        const player = playerLookup.get(pid)
        if (player) {
          return { id: pid, name: player.name || '—', value, photoUrl: player.photoUrl || null }
        }
        const fallback = players.find((p) => toStr(p.id) === pid)
        return { id: pid, name: fallback?.name || '—', value, photoUrl: fallback?.photoUrl || null }
      })
      .sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name))

    return { ...base, mom }
  }, [
    momAwards.winnersByMatch,
    playerLookup,
    players,
    seasonRecapCaptainRows,
    seasonRecapDraftPlayerRows,
    seasonRecapDuoRows,
    seasonRecapMatches,
  ])

  const playerNameLookup = useMemo(() => {
    const map = new Map()
    players.forEach((p) => {
      const name = (p?.name || '').trim().toLowerCase()
      if (name) {
        map.set(name, p)
      }
    })
    return map
  }, [players])

  const chemistryMap = useMemo(() => {
    const map = new Map()
    if (!duoRows || duoRows.length === 0) return map

    const addPartner = (sourceId, partnerId, meta) => {
      if (!sourceId || !partnerId) return
      const key = toStr(sourceId)
      const list = map.get(key) || []
      list.push(meta)
      map.set(key, list)
    }

    duoRows.forEach((row) => {
      const assistKey = toStr(row.assistId)
      const goalKey = toStr(row.goalId)
      const goalPlayer = playerLookup.get(goalKey)
      const assistPlayer = playerLookup.get(assistKey)

      addPartner(assistKey, goalKey, {
        id: goalKey,
        name: goalPlayer?.name || row.gName,
        membership: goalPlayer?.membership || row.gMembership,
        photoUrl: goalPlayer?.photoUrl || row.gPhotoUrl,
        count: row.count,
        role: 'assist',
      })

      addPartner(goalKey, assistKey, {
        id: assistKey,
        name: assistPlayer?.name || row.aName,
        membership: assistPlayer?.membership || row.aMembership,
        photoUrl: assistPlayer?.photoUrl || row.aPhotoUrl,
        count: row.count,
        role: 'goal',
      })
    })

    map.forEach((partners, key) => {
      const sorted = [...partners].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      map.set(key, sorted.slice(0, 3))
    })

    return map
  }, [duoRows, playerLookup])

  const allMatchesChemistryMap = useMemo(() => {
    const map = new Map()
    if (!allMatchesDuoRows || allMatchesDuoRows.length === 0) return map

    const addPartner = (sourceId, partnerId, meta) => {
      if (!sourceId || !partnerId) return
      const key = toStr(sourceId)
      const list = map.get(key) || []
      list.push(meta)
      map.set(key, list)
    }

    allMatchesDuoRows.forEach((row) => {
      const assistKey = toStr(row.assistId)
      const goalKey = toStr(row.goalId)
      const goalPlayer = playerLookup.get(goalKey)
      const assistPlayer = playerLookup.get(assistKey)

      addPartner(assistKey, goalKey, {
        id: goalKey,
        name: goalPlayer?.name || row.gName,
        membership: goalPlayer?.membership || row.gMembership,
        photoUrl: goalPlayer?.photoUrl || row.gPhotoUrl,
        count: row.count,
        role: 'assist',
      })

      addPartner(goalKey, assistKey, {
        id: assistKey,
        name: assistPlayer?.name || row.aName,
        membership: assistPlayer?.membership || row.aMembership,
        photoUrl: assistPlayer?.photoUrl || row.aPhotoUrl,
        count: row.count,
        role: 'goal',
      })
    })

    map.forEach((partners, key) => {
      const sorted = [...partners].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      map.set(key, sorted.slice(0, 3))
    })

    return map
  }, [allMatchesDuoRows, playerLookup])

  const openPlayerStatsModal = useCallback((player) => {
    if (!playerStatsEnabled) {
      notify('선수 기록 모달 기능이 비활성화되어 있습니다.', 'info')
      return
    }
    if (!player) {
      notify('선수 정보가 없어 스탯을 볼 수 없어요.', 'warning')
      return
    }
    let playerId = player.id ?? player.playerId ?? player.player_id ?? null
    let canonical = playerId ? playerLookup.get(toStr(playerId)) : null
    if (!playerId && player?.name) {
      const fallback = playerNameLookup.get(player.name.trim().toLowerCase())
      if (fallback) {
        playerId = fallback.id ?? fallback.playerId ?? fallback.player_id ?? null
        canonical = fallback
      }
    }
    if (!playerId) {
      notify('선수 ID가 없어 스탯을 볼 수 없어요.', 'warning')
      return
    }
    if (!canonical) {
      canonical = playerLookup.get(toStr(playerId)) || canonical
    }
    const modalPlayer = {
      id: playerId,
      name: canonical?.name || player.name || player.fullName || '선수',
      membership: canonical?.membership ?? player.membership,
      photoUrl: canonical?.photoUrl ?? player.photoUrl ?? player.avatarUrl ?? null,
    }
    if (!statsModalTipShownRef.current) {
      let tipMessage = '선수를 누르면 스탯을 볼 수 있어요.'
      if (badgesEnabled) {
        tipMessage = '선수를 누르면 스탯과 챌린지 뱃지를 볼 수 있어요.'
      }
      notify(tipMessage, 'info')
      statsModalTipShownRef.current = true
    }
    setStatsModalPlayer(modalPlayer)
  }, [playerLookup, playerNameLookup, playerStatsEnabled, badgesEnabled, statsModalTipShownRef])

  const closeStatsModal = useCallback(() => {
    setStatsModalPlayer(null)
  }, [])

  const matchLookup = useMemo(() => {
    const map = new Map()
    matches.forEach(match => {
      if (match?.id != null) {
        map.set(toStr(match.id), match)
      }
    })
    return map
  }, [matches])

  const playerHighlights = useMemo(() => {
    const map = new Map()
    if (!playerStatsEnabled || !filteredMatches || filteredMatches.length === 0) return map

    const ordered = filteredMatches
      .map(match => ({ match, ts: getMatchTimestamp(match) || 0 }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))

    const formatMatchLabel = (match, ts) => {
      const dateLabel = extractDateKey(match) || (Number.isFinite(ts) && ts > 0 ? new Date(ts).toLocaleDateString() : null)
      const opponentLabel = (
        [
          match?.title,
          match?.matchTitle,
          match?.opponent,
          match?.opponentName,
          match?.opponent_label,
          match?.location,
        ]
          .map(toLabelString)
          .find(Boolean)
      )
      return [dateLabel, opponentLabel].filter(Boolean).join(' · ') || dateLabel || 'Match'
    }

    const ensureEntry = (pid) => {
      if (!map.has(pid)) map.set(pid, {})
      return map.get(pid)
    }

    ordered.forEach(({ match, ts }) => {
      const statsMap = extractStatsByPlayer(match) || {}
      const matchLabel = formatMatchLabel(match, ts)
      Object.entries(statsMap).forEach(([pidRaw, rec]) => {
        const pid = toStr(pidRaw)
        if (!pid) return
        const entry = ensureEntry(pid)
        if (Number(rec?.goals || 0) > 0 && !entry.firstGoal) {
          entry.firstGoal = { label: matchLabel, ts }
        }
        if (Number(rec?.assists || 0) > 0 && !entry.firstAssist) {
          entry.firstAssist = { label: matchLabel, ts }
        }
        if (Number(rec?.cleanSheet || 0) > 0 && !entry.firstCleanSheet) {
          entry.firstCleanSheet = { label: matchLabel, ts }
        }
        if (Number(rec?.goals || 0) + Number(rec?.assists || 0) > 0 && !entry.firstAttackPoint) {
          entry.firstAttackPoint = { label: matchLabel, ts }
        }
      })
    })

    const winnersByMatch = momAwards?.winnersByMatch || {}
    Object.entries(winnersByMatch).forEach(([matchId, summary]) => {
      const key = toStr(matchId)
      if (!filteredMatchIdSet.has(key)) return
      const match = matchLookup.get(key)
      const ts = getMatchTimestamp(match) || 0
      const label = formatMatchLabel(match, ts)
      const winners = Array.isArray(summary?.winners) ? summary.winners : []
      winners.forEach((pidRaw) => {
        const pid = toStr(pidRaw)
        if (!pid) return
        const entry = ensureEntry(pid)
        if (!entry.firstMom) {
          entry.firstMom = { label, ts }
        }
      })
    })

    return map
  }, [playerStatsEnabled, filteredMatches, filteredMatchIdSet, momAwards?.winnersByMatch, matchLookup])

  const allMatchesPlayerHighlights = useMemo(() => {
    const map = new Map()
    if (!playerStatsEnabled || !matches || matches.length === 0) return map

    const ordered = matches
      .map(match => ({ match, ts: getMatchTimestamp(match) || 0 }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))

    const formatMatchLabel = (match, ts) => {
      const dateLabel = extractDateKey(match) || (Number.isFinite(ts) && ts > 0 ? new Date(ts).toLocaleDateString() : null)
      const opponentLabel = (
        [
          match?.title,
          match?.matchTitle,
          match?.opponent,
          match?.opponentName,
          match?.opponent_label,
          match?.location,
        ]
          .map(toLabelString)
          .find(Boolean)
      )
      return [dateLabel, opponentLabel].filter(Boolean).join(' · ') || dateLabel || 'Match'
    }

    const ensureEntry = (pid) => {
      if (!map.has(pid)) map.set(pid, {})
      return map.get(pid)
    }

    ordered.forEach(({ match, ts }) => {
      const statsMap = extractStatsByPlayer(match) || {}
      const matchLabel = formatMatchLabel(match, ts)
      Object.entries(statsMap).forEach(([pidRaw, rec]) => {
        const pid = toStr(pidRaw)
        if (!pid) return
        const entry = ensureEntry(pid)
        if (Number(rec?.goals || 0) > 0 && !entry.firstGoal) {
          entry.firstGoal = { label: matchLabel, ts }
        }
        if (Number(rec?.assists || 0) > 0 && !entry.firstAssist) {
          entry.firstAssist = { label: matchLabel, ts }
        }
        if (Number(rec?.cleanSheet || 0) > 0 && !entry.firstCleanSheet) {
          entry.firstCleanSheet = { label: matchLabel, ts }
        }
        if (Number(rec?.goals || 0) + Number(rec?.assists || 0) > 0 && !entry.firstAttackPoint) {
          entry.firstAttackPoint = { label: matchLabel, ts }
        }
      })
    })

    const winnersByMatch = momAwards?.winnersByMatch || {}
    Object.entries(winnersByMatch).forEach(([matchId, summary]) => {
      const key = toStr(matchId)
      const match = matchLookup.get(key)
      const ts = getMatchTimestamp(match) || 0
      const label = formatMatchLabel(match, ts)
      const winners = Array.isArray(summary?.winners) ? summary.winners : []
      winners.forEach((pidRaw) => {
        const pid = toStr(pidRaw)
        if (!pid) return
        const entry = ensureEntry(pid)
        if (!entry.firstMom) {
          entry.firstMom = { label, ts }
        }
      })
    })

    return map
  }, [playerStatsEnabled, matches, momAwards?.winnersByMatch, matchLookup])

  const matchesBySeason = useMemo(() => {
    const map = new Map()
    matches.forEach((match) => {
      const season = extractSeason(match) || 'unknown'
      if (!map.has(season)) {
        map.set(season, [])
      }
      map.get(season).push(match)
    })
    return map
  }, [matches])
  const momWinnersByMatch = momAwards?.winnersByMatch || {}

  const computeSeasonBadgeFallback = useCallback((playerId) => {
    if (!playerId) return []
    const normalizedId = toStr(playerId)
    const results = []

    matchesBySeason.forEach((seasonMatches, seasonKey) => {
      if (!Array.isArray(seasonMatches) || seasonMatches.length === 0) return

      const seasonMomTimeline = {}
      const seasonMomCounts = {}

      Object.entries(momWinnersByMatch).forEach(([matchId, summary]) => {
        const match = matchLookup.get(matchId)
        if (!match) return
        const matchSeason = extractSeason(match) || 'unknown'
        if (matchSeason !== seasonKey) return
        seasonMomTimeline[matchId] = summary
        const winners = Array.isArray(summary?.winners) ? summary.winners : []
        winners.forEach((pidRaw) => {
          const pid = toStr(pidRaw)
          if (!pid) return
          seasonMomCounts[pid] = (seasonMomCounts[pid] || 0) + 1
        })
      })

      const factsMap = buildPlayerBadgeFactsMap(players, seasonMatches, {
        momAwardCounts: Object.keys(seasonMomCounts).length ? seasonMomCounts : null,
        momAwardTimeline: Object.keys(seasonMomTimeline).length ? seasonMomTimeline : null,
      })
      const facts = factsMap.get(normalizedId)
      if (!facts) return
      const computed = generateBadgesFromFacts(facts).map((badge) => ({
        ...badge,
        seasonKey: seasonKey === 'unknown' ? 'legacy' : seasonKey,
      }))
      results.push(...computed)
    })

    return results.sort((a, b) => {
      const aTs = a?.awarded_at ? Date.parse(a.awarded_at) : 0
      const bTs = b?.awarded_at ? Date.parse(b.awarded_at) : 0
      return bTs - aTs
    })
  }, [matchesBySeason, momWinnersByMatch, matchLookup, players])

  const openBadgeModal = useCallback((player) => {
    const attemptedId = player?.id ?? player?.playerId ?? player?.player_id ?? null
    if (!playerStatsEnabled) {
      logger.warn('[Dashboard] Badge modal blocked because player stats feature is disabled', { playerId: attemptedId })
      notify('선수 기록 모달을 켜야 챌린지 뱃지를 볼 수 있어요.', 'info')
      return
    }
    if (!badgesEnabled) {
      notify('챌린지 뱃지 기능이 비활성화되어 있습니다.', 'info')
      return
    }
    if (!player) {
      notify('선수 정보가 없어 뱃지를 볼 수 없어요.', 'warning')
      return
    }
    const playerId = player.id || player.playerId || player.player_id
    if (!playerId) {
      notify('선수 ID가 없어 뱃지를 볼 수 없어요.', 'warning')
      return
    }
    const modalPlayer = {
      id: playerId,
      name: player.name || player.fullName || '선수',
      photoUrl: player.photoUrl || player.avatarUrl || null,
      membership: player.membership,
    }
    setBadgeModalPlayer(modalPlayer)
    setBadgeModalState({ badges: [], loading: true, error: null, source: null })
    const loadBadges = async () => {
      let remoteError = null
      try {
        const { data, error } = await fetchPlayerBadges(playerId)
        if (error) {
          remoteError = error
          throw error
        }
        if (Array.isArray(data) && data.length > 0) {
          setBadgeModalState({ badges: data, loading: false, error: null, source: 'remote' })
          return
        }
      } catch (err) {
        remoteError = remoteError || err
        logger.warn('[Dashboard] Failed to fetch remote badges, falling back to computed results', {
          playerId,
          error: err?.message || err,
        })
      }

      const computed = computeSeasonBadgeFallback(playerId)
      setBadgeModalState({
        badges: computed,
        loading: false,
        error: computed.length === 0 && remoteError ? (remoteError.message || 'BADGE_FETCH_FAILED') : null,
        source: computed.length > 0 ? 'computed' : null,
      })
    }

    loadBadges()
  }, [badgesEnabled, playerStatsEnabled, computeSeasonBadgeFallback])

  useEffect(() => {
    if ((!badgesEnabled || !playerStatsEnabled) && badgeModalPlayer) {
      setBadgeModalPlayer(null)
      setBadgeModalState({ badges: [], loading: false, error: null, source: null })
    }
  }, [badgesEnabled, badgeModalPlayer, playerStatsEnabled])

  const refreshBadgeModal = useCallback(() => {
    if (!badgeModalPlayer) return
    openBadgeModal(badgeModalPlayer)
  }, [badgeModalPlayer, openBadgeModal])

  const closeBadgeModal = useCallback(() => {
    setBadgeModalPlayer(null)
    setBadgeModalState({ badges: [], loading: false, error: null, source: null })
  }, [])

  const attackRowsBySeason = useMemo(() => {
    const out = new Map()
    matchesBySeason.forEach((seasonMatches, seasonKey) => {
      if (!Array.isArray(seasonMatches) || seasonMatches.length === 0) return
      const rows = computeAttackRows(players, seasonMatches)
      out.set(seasonKey, buildPlayerRowMap(rows))
    })
    return out
  }, [players, matchesBySeason])

  const draftRecordRowsBySeason = useMemo(() => {
    const out = new Map()
    matchesBySeason.forEach((seasonMatches, seasonKey) => {
      if (!Array.isArray(seasonMatches) || seasonMatches.length === 0) return
      const rows = computeDraftPlayerStatsRows(players, seasonMatches)
      if (!rows || rows.length === 0) return
      out.set(seasonKey, buildPlayerRowMap(rows))
    })
    return out
  }, [players, matchesBySeason])

  const draftAttackRowsBySeason = useMemo(() => {
    const out = new Map()
    matchesBySeason.forEach((seasonMatches, seasonKey) => {
      if (!Array.isArray(seasonMatches) || seasonMatches.length === 0) return
      const rows = computeDraftAttackRows(players, seasonMatches)
      if (!rows || rows.length === 0) return
      out.set(seasonKey, buildPlayerRowMap(rows))
    })
    return out
  }, [players, matchesBySeason])

  const momDetailDataByPlayer = useMemo(() => {
    const map = new Map()
    const winnersByMatch = momAwards?.winnersByMatch || {}
    const entries = Object.entries(winnersByMatch)
    if (!entries.length) return map

    const dateFormatter = (typeof Intl !== 'undefined' && Intl.DateTimeFormat)
      ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })
      : null
    const formatDate = (ts) => {
      if (!Number.isFinite(ts)) return null
      try {
        return dateFormatter ? dateFormatter.format(new Date(ts)) : new Date(ts).toLocaleDateString()
      } catch {
        return null
      }
    }

    const orderedEntries = entries
      .map(([matchId, summary]) => {
        const match = matchLookup.get(matchId) || null
        const rawTs = getMatchTimestamp(match)
        return {
          matchId,
          summary,
          match,
          ts: Number.isFinite(rawTs) ? rawTs : 0,
          hadTimestamp: Number.isFinite(rawTs),
        }
      })
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))

    orderedEntries.forEach(({ matchId, summary, match, ts, hadTimestamp }, orderIndex) => {
      if (summary?.manualResolutionRequired) {
        return
      }
      const dateLabel = hadTimestamp && ts > 0 ? formatDate(ts) : null
      const opponentLabel = (
        [
          match?.title,
          match?.matchTitle,
          match?.opponent,
          match?.opponentName,
          match?.opponent_label,
          match?.meta?.opponent,
          match?.meta?.opponentName,
          match?.location,
        ]
          .map(toLabelString)
          .find(Boolean)
      ) || t('mom.detail.opponentUnknown')
      const baseParts = [dateLabel, opponentLabel].filter(Boolean)
      const baseLabel = baseParts.length > 0 ? baseParts.join(' · ') : t('mom.detail.matchFallback')

      const winners = Array.isArray(summary?.winners) ? summary.winners : []
      const tallyEntries = summary?.tally ? Object.entries(summary.tally) : []

      winners.forEach((winnerId) => {
        const pid = toStr(winnerId)
        if (!pid) return
        const playerVotes = Number(summary?.tally?.[pid] || 0)
        const opponents = tallyEntries
          .filter(([otherId]) => otherId !== pid)
          .map(([otherId, votes]) => ({
            playerId: otherId,
            name: playerLookup.get(otherId)?.name || `Player ${otherId}`,
            membership: playerLookup.get(otherId)?.membership,
            photoUrl: playerLookup.get(otherId)?.photoUrl || playerLookup.get(otherId)?.avatarUrl || null,
            votes: Number(votes) || 0,
            diff: Math.max(0, playerVotes - Number(votes || 0)),
          }))
          .sort((a, b) => b.votes - a.votes)

        const topVotes = opponents[0]?.votes ?? 0
        const hasOpponents = opponents.length > 0
        const detail = {
          matchId,
          matchLabel: baseLabel,
          totalVotes: Number(summary?.total || 0),
          playerVotes,
          diff: hasOpponents ? Math.max(0, playerVotes - topVotes) : playerVotes,
          tie: hasOpponents && playerVotes === topVotes,
          hasOpponents,
          opponents,
          override: Boolean(summary?.override),
          matchTs: ts,
          fallbackOrder: orderIndex,
          tieBreakCategory: summary?.tieBreakCategory || null,
        }
        if (!map.has(pid)) map.set(pid, [])
        map.get(pid).push(detail)
      })
    })

    map.forEach(list => list.sort((a, b) => (b.matchTs || 0) - (a.matchTs || 0) || (a.fallbackOrder ?? 0) - (b.fallbackOrder ?? 0)))
    return map
  }, [momAwards.winnersByMatch, matchLookup, playerLookup, t])

  const selectedMoMAwards = useMemo(() => {
    if (!momDetailPlayer) return []
    const pid = toStr(momDetailPlayer.id)
    if (!pid) return []
    return momDetailDataByPlayer.get(pid) || []
  }, [momDetailPlayer, momDetailDataByPlayer])

  const playerStatsData = useMemo(() => {
    if (!statsModalPlayer || !playerStatsEnabled) return null
    const key = toStr(statsModalPlayer.id)
    
    // 필터링된 매치 기반 데이터 (현재 뷰)
    const attackRow = attackRowMap.get(key) || null
    const draftRow = draftRecordMap.get(key) || null
    const draftAttackRow = draftAttackRowMap.get(key) || null
    const cardsRow = cardsRowMap.get(key) || null
    
    // 전체 매치 기반 데이터 (overall 시즌용)
    const overallAttackRow = allMatchesAttackRowMap.get(key) || null
    const overallDraftRow = allMatchesDraftRecordMap.get(key) || null
    const overallDraftAttackRow = allMatchesDraftAttackRowMap.get(key) || null
    const overallCardsRow = allMatchesCardsRowMap.get(key) || null
    
    const chemistryPartners = chemistryMap.get(key) || []
    const allMatchesChemistryPartners = allMatchesChemistryMap.get(key) || []
    const highlights = playerHighlights.get(key) || null
    const allMatchesHighlights = allMatchesPlayerHighlights.get(key) || null
    const competition = attackCompetitionMap.get(key) || null
    const momCount = Number(momAwards?.countsByPlayer?.[key] ?? 0)

    const formatAvg = (numerator, denominator) => {
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
      const value = numerator / denominator
      if (!Number.isFinite(value)) return null
      const rounded = Math.round(value * 100) / 100
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
    }

    const summarizeAttackRow = (row) => row ? {
      gp: row.gp,
      g: row.g,
      a: row.a,
      pts: row.pts,
      cs: row.cs,
    } : null
    const summarizeEfficiency = (row) => row ? {
      gPerGame: formatAvg(row.g, row.gp),
      aPerGame: formatAvg(row.a, row.gp),
      ptsPerGame: formatAvg(row.pts, row.gp),
    } : null
    const summarizeDraftRecord = (row) => row ? {
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      winRate: row.winRate,
      points: row.points,
      last5: row.last5,
    } : null
    const summarizeDraftAttack = (row) => row ? {
      gp: row.gp,
      g: row.g,
      a: row.a,
      pts: row.pts,
      gpg: row.gpg,
      apa: row.apa,
    } : null

    const seasonStats = {}
    const seasonOrder = []
    
    // overall 시즌: 전체 매치 기반 데이터 사용
    const overallAttack = summarizeAttackRow(overallAttackRow)
    const overallEfficiency = summarizeEfficiency(overallAttackRow)
    const overallDraftRecord = summarizeDraftRecord(overallDraftRow)
    const overallDraftAttack = summarizeDraftAttack(overallDraftAttackRow)
    if (overallAttack || overallEfficiency || overallDraftRecord || overallDraftAttack) {
      seasonStats.overall = {
        attack: overallAttack,
        efficiency: overallEfficiency,
        draftRecord: overallDraftRecord,
        draftAttack: overallDraftAttack,
      }
    }
    
    // 현재 필터링된 데이터 (메인 뷰)
    const baseAttack = summarizeAttackRow(attackRow)
    const baseEfficiency = summarizeEfficiency(attackRow)
    const baseDraftRecord = summarizeDraftRecord(draftRow)
    const baseDraftAttack = summarizeDraftAttack(draftAttackRow)

    const seasonKeySet = new Set()
    attackRowsBySeason.forEach((_, seasonKey) => {
      if (seasonKey && seasonKey !== 'unknown') seasonKeySet.add(seasonKey)
    })
    draftRecordRowsBySeason.forEach((_, seasonKey) => {
      if (seasonKey && seasonKey !== 'unknown') seasonKeySet.add(seasonKey)
    })
    draftAttackRowsBySeason.forEach((_, seasonKey) => {
      if (seasonKey && seasonKey !== 'unknown') seasonKeySet.add(seasonKey)
    })
    const sortedSeasonKeys = Array.from(seasonKeySet)
      .sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true, sensitivity: 'base' }))
    const hasUnknownSeason = attackRowsBySeason.has('unknown') || draftRecordRowsBySeason.has('unknown') || draftAttackRowsBySeason.has('unknown')
    const orderedSeasonKeys = hasUnknownSeason ? [...sortedSeasonKeys, 'unknown'] : sortedSeasonKeys
    orderedSeasonKeys.forEach((seasonKey) => {
      const seasonRow = attackRowsBySeason.get(seasonKey)?.get(key)
      const seasonDraftRecordRow = draftRecordRowsBySeason.get(seasonKey)?.get(key)
      const seasonDraftAttackRow = draftAttackRowsBySeason.get(seasonKey)?.get(key)
      if (!seasonRow && !seasonDraftRecordRow && !seasonDraftAttackRow) return
      seasonStats[seasonKey] = {
        attack: summarizeAttackRow(seasonRow),
        efficiency: summarizeEfficiency(seasonRow),
        draftRecord: summarizeDraftRecord(seasonDraftRecordRow),
        draftAttack: summarizeDraftAttack(seasonDraftAttackRow),
      }
      seasonOrder.push(seasonKey)
    })

    return {
      attack: baseAttack,
      efficiency: baseEfficiency,
      draftRecord: baseDraftRecord,
      draftAttack: baseDraftAttack,
      cards: cardsRow ? {
        yellow: cardsRow.y || 0,
        red: cardsRow.r || 0,
        black: cardsRow.b || 0,
      } : null,
      momAwards: momCount,
      chemistry: chemistryPartners.length > 0 ? { topPartners: chemistryPartners } : null,
      highlights,
      competition,
      factsEnabled: playerFactsEnabled,
      filterDescription: statsFilterDescription,
      seasonStats,
      seasonOrder,
      // overall 시즌용 전체 매치 기반 데이터
      overallChemistry: allMatchesChemistryPartners.length > 0 ? { topPartners: allMatchesChemistryPartners } : null,
      overallHighlights: allMatchesHighlights,
    }
  }, [statsModalPlayer, attackRowMap, draftRecordMap, draftAttackRowMap, cardsRowMap, allMatchesAttackRowMap, allMatchesDraftRecordMap, allMatchesDraftAttackRowMap, allMatchesCardsRowMap, chemistryMap, allMatchesChemistryMap, playerHighlights, allMatchesPlayerHighlights, attackCompetitionMap, momAwards?.countsByPlayer, statsFilterDescription, playerStatsEnabled, attackRowsBySeason, draftRecordRowsBySeason, draftAttackRowsBySeason])

  const momLeaders = useMemo(() => {
    const entries = Object.entries(mom.tally || {})
    return entries
      .map(([pid, votes]) => {
        const player = playerLookup.get(pid) || mom.roster?.find(p => toStr(p.id) === pid)
        return {
          playerId: pid,
          votes,
          name: player?.name || `Player ${pid}`,
          photoUrl: player?.photoUrl || null,
        }
      })
      .sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes
        return a.name.localeCompare(b.name)
      })
  }, [mom.tally, playerLookup, mom.roster])

  const momNoticeVisible = Boolean(
    isMoMEnabled &&
    mom.latestMatch &&
    mom.windowMeta &&
    mom.phase === 'vote' &&
    mom.voteStatusReady &&
    mom.hasRecordedStats
  )

  const momNotice = useMemo(() => {
    if (!momNoticeVisible || !mom.latestMatch || !mom.windowMeta?.voteEnd) return null
    const countdown = getCountdownParts(mom.windowMeta.voteEnd, mom.nowTs)
    const matchLabel = new Date(mom.latestMatch.dateISO).toLocaleString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
    const alreadyVoted = Boolean(mom.alreadyVoted)
    const canVote = mom.phase === 'vote' && mom.voteStatusReady && !alreadyVoted
    return {
      visible: true,
      matchLabel,
      countdownLabel: countdown?.label ?? '마감',
      urgent: countdown?.diffMs != null && countdown.diffMs <= 5 * 60 * 1000,
      totalVotes: mom.totalVotes,
      leaders: momLeaders.slice(0, 3),
      deadlineTs: mom.windowMeta.voteEnd,
      alreadyVoted,
      canVote,
      matchId: mom.latestMatch.id,
    }
  }, [momNoticeVisible, mom.latestMatch, mom.windowMeta, mom.nowTs, mom.totalVotes, momLeaders, mom.alreadyVoted, mom.phase, mom.voteStatusReady])

  useEffect(() => {
    if (!isMoMEnabled) {
      setShowMoM(false)
      return
    }
    if (manualMoMOpen) return
    if (!mom.latestMatch || !mom.hasRecordedStats) {
      setShowMoM(false)
      return
    }
    const shouldShowVote = mom.phase === 'vote'
      && mom.voteStatusReady
      && !mom.alreadyVoted
      && mom.hasRecordedStats
      && mom.latestMatch.id !== dismissedMoMMatchId
    setShowMoM(shouldShowVote)
  }, [isMoMEnabled, mom.phase, mom.voteStatusReady, mom.alreadyVoted, mom.latestMatch?.id, dismissedMoMMatchId, manualMoMOpen, mom.hasRecordedStats])

  useEffect(() => {
    setManualMoMOpen(false)
  }, [mom.latestMatch?.id])

  const handleCloseMoM = () => {
    if (!manualMoMOpen && mom.latestMatch?.id) {
      setDismissedMoMMatchId(mom.latestMatch.id)
    }
    setManualMoMOpen(false)
    setShowMoM(false)
  }

  const handleOpenMoMFromNotice = () => {
    if (!mom.latestMatch || !mom.hasRecordedStats) return
    if (mom.alreadyVoted && mom.phase === 'vote') {
      notify('이미 투표를 완료했습니다. 리더보드에서 결과를 확인하세요.', 'info')
      return
    }
    setManualMoMOpen(true)
    setShowMoM(true)
  }

  const handleMoMNoticeAlreadyVoted = () => {
    notify('이미 투표를 완료했습니다. 리더보드에서 결과를 확인하세요.', 'info')
  }

  // Seed baselines …
  const previousBaselineByMetric = useMemo(() => {
    try {
  const keys = Array.from(new Set((matches || []).map(m => extractDateKey(m)).filter(Boolean)))
      if (keys.length <= 1) return {}
  const sorted = [...keys].sort(compareDateKeysAsc)
      const latest = sorted[sorted.length - 1]
      const prevMatches = (matches || []).filter(m => extractDateKey(m) !== latest)
      if (prevMatches.length === 0) return {}

      const prevRows = computeAttackRows(players, prevMatches)
      const toMap = (metric) => {
        const ranked = addRanks(prevRows, metric)
        const mp = {}
        ranked.forEach(r => { mp[String(r.id || r.name)] = r.rank })
        return mp
      }

      return {
        pts: toMap('pts'),
        g: toMap('g'),
        a: toMap('a'),
        gp: toMap('gp')
      }
    } catch {
      return {}
    }
  }, [players, matches])

  const previousBaselinesMisc = useMemo(() => {
    try {
  const keys = Array.from(new Set((matches || []).map(m => extractDateKey(m)).filter(Boolean)))
      if (keys.length <= 1) return {}
  const sorted = [...keys].sort(compareDateKeysAsc)
      const latest = sorted[sorted.length - 1]
      const prevMatches = (matches || []).filter(m => extractDateKey(m) !== latest)
      if (prevMatches.length === 0) return {}

      const draftPlayerPrev = computeDraftPlayerStatsRows(players, prevMatches)
      const draftCaptainPrev = computeCaptainStatsRows(players, prevMatches)
      const draftAttackPrev = computeDraftAttackRows(players, prevMatches)
      const duoPrev = computeDuoRows(players, prevMatches)

      const toMap = (rows) => {
        const mp = {}
        rows.forEach(r => { mp[String(r.id || r.name)] = r.rank })
        return mp
      }

      return {
        draftPlayer: toMap(draftPlayerPrev),
        draftCaptain: toMap(draftCaptainPrev),
        draftAttack: toMap(draftAttackPrev),
        duo: toMap(duoPrev)
      }
    } catch {
      return {}
    }
  }, [players, matches])

  const colHi = (col) => {
    if (apTab === 'g' && col === 'g') return 'bg-indigo-50/80 font-semibold'
    if (apTab === 'a' && col === 'a') return 'bg-indigo-50/80 font-semibold'
    if (apTab === 'gp' && col === 'gp') return 'bg-indigo-50/80 font-semibold'
    return ''
  }
  const headHi = (col) => {
    if (apTab === 'g' && col === 'g') return 'bg-indigo-100/70 text-stone-900'
    if (apTab === 'a' && col === 'a') return 'bg-indigo-100/70 text-stone-900'
    if (apTab === 'gp' && col === 'gp') return 'bg-indigo-100/70 text-stone-900'
    return ''
  }

  // 팀 보기 버튼 클릭 시 …
  const handleShowTeams = (upcomingMatch) => {
    if (!upcomingMatch?.dateISO) return
    const upcomingAttendeeCount = (upcomingMatch.attendeeIds?.length || upcomingMatch.participantIds?.length || 0)
    const upcomingDate = upcomingMatch.dateISO.slice(0, 10)
    let matchingMatch = matches.find(m => {
      if (!m?.dateISO) return false
      const historicalDate = m.dateISO.slice(0, 10)
      const historicalAttendeeCount = m.snapshot ? m.snapshot.flat().length : 0
      return historicalDate === upcomingDate && Math.abs(historicalAttendeeCount - upcomingAttendeeCount) === 0
    })
    if (!matchingMatch) {
      matchingMatch = matches.find(m => {
        if (!m?.dateISO) return false
        const historicalDate = m.dateISO.slice(0, 10)
        const historicalAttendeeCount = m.snapshot ? m.snapshot.flat().length : 0
        return historicalDate === upcomingDate && Math.abs(historicalAttendeeCount - upcomingAttendeeCount) <= 1
      })
    }
    if (!matchingMatch) {
      matchingMatch = matches.find(m => {
        if (!m?.dateISO) return false
        const historicalDate = m.dateISO.slice(0, 10)
        return historicalDate === upcomingDate
      })
    }
    if (matchingMatch) {
      setHighlightedMatchId(matchingMatch.id)
      setTimeout(() => setHighlightedMatchId(null), 5000)
    } else {
      notify(t('error.matchNotFound'), 'error', 3000)
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:gap-6">
        {isMoMEnabled && showMoM && mom.latestMatch && (
          <MoMPopup
            match={mom.latestMatch}
            roster={mom.roster}
            recommended={mom.recommended}
            totalVotes={mom.totalVotes}
            windowMeta={mom.windowMeta}
            alreadyVoted={mom.alreadyVoted}
            nowTs={mom.nowTs}
            submitting={mom.submitting}
            onClose={handleCloseMoM}
            onSubmit={mom.submitVote}
            error={mom.error}
          />
        )}

        {showSeasonRecap && (
          <SeasonRecap
            matches={seasonRecapMatches}
            players={players}
            seasonName={leaderboardSeason !== 'all' ? leaderboardSeason : leaderboardDefaultSeason}
            leaders={seasonRecapLeaders}
            onClose={() => setShowSeasonRecap(false)}
          />
        )}

        {isMoMEnabled && (
          <MoMNoticeWidget
            notice={momNotice}
            onOpenMoM={handleOpenMoMFromNotice}
            onAlreadyVoted={handleMoMNoticeAlreadyVoted}
          />
        )}

        <UpcomingMatchesWidget
          upcomingMatches={upcomingMatches}
          players={players}
          matches={matches}
          isAdmin={isAdmin}
          onSave={onSaveUpcomingMatch}
          onDeleteUpcomingMatch={onDeleteUpcomingMatch}
          onUpdateUpcomingMatch={onUpdateUpcomingMatch}
          onShowTeams={handleShowTeams}
        />

        {leaderboardVisible && (
          <Card 
            title={
              <div className="flex items-center gap-2">
                <span>{t('leaderboard.title')}</span>
                <div className="w-[120px]">
                  <Select
                    value={leaderboardSeason}
                    onChange={(val) => {
                      leaderboardSeasonUserSetRef.current = true
                      setLeaderboardSeason(val)
                      setApDateKey('all')
                    }}
                    options={seasonOptions.map(v => ({ value: v, label: v === 'all' ? t('leaderboard.allTime') : `${v}년` }))}
                    size="sm"
                  />
                </div>
              </div>
            }
          >
            <PrimarySecondaryTabs
              primary={primaryTab}
              setPrimary={(val)=>{ setPrimaryTab(val); setShowAll(false) }}
              apTab={apTab}
              setApTab={(val)=>{ setApTab(val); setPrimaryTab('pts'); setShowAll(false) }}
              draftTab={draftTab}
              setDraftTab={(val)=>{ setDraftTab(val); setPrimaryTab('draft'); setShowAll(false) }}
              momEnabled={isMoMEnabled}
              apOptions={apOptions}
            />

            {!isMoMEnabled && (
              <div className="mb-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
                MOM 기능이 꺼져 있어 투표와 리더보드가 숨겨진 상태입니다. 앱 설정에서 다시 활성화하면 기존 기록을 포함한 모든 데이터가 즉시 복구됩니다.
              </div>
            )}

            {primaryTab === 'mom' ? (
              isMoMEnabled ? (
                <MoMLeaderboard
                  countsByPlayer={momAwards.countsByPlayer}
                  players={players}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  customMemberships={customMemberships}
                  onPlayerSelect={handleOpenMoMDetails}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
                  MOM 기능이 비활성화되어 있어 리더보드를 표시할 수 없습니다. 앱 설정에서 다시 활성화하면 기존 데이터가 그대로 복원됩니다.
                </div>
              )
            ) : primaryTab === 'draft' ? (
              draftTab === 'captainWins' ? (
                <CaptainWinsTable
                  key={`captain-${apDateKey}`}
                  rows={captainWinRows}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
                  apDateKey={apDateKey}
                  initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.draftCaptain || null) : null}
                  customMemberships={customMemberships}
                  onPlayerSelect={openPlayerStatsModal}
                />
              ) : draftTab === 'attack' ? (
                <DraftAttackTable
                  key={`draftAttack-${apDateKey}`}
                  rows={draftAttackRows}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
                  apDateKey={apDateKey}
                  initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.draftAttack || null) : null}
                  customMemberships={customMemberships}
                  onPlayerSelect={openPlayerStatsModal}
                />
              ) : (
                <DraftWinsTable
                  key={`draftWins-${apDateKey}`}
                  rows={draftWinRows}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
                  apDateKey={apDateKey}
                  initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.draftPlayer || null) : null}
                  customMemberships={customMemberships}
                  onPlayerSelect={openPlayerStatsModal}
                />
              )
            ) : (
              apTab === 'cs' ? (
                <CleanSheetTable
                  key={`cs-${apDateKey}`}
                  rows={csRows}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
                  apDateKey={apDateKey}
                  onPlayerSelect={openPlayerStatsModal}
                />
              ) : apTab === 'duo' ? (
                <DuoTable
                  key={`duo-${apDateKey}`}
                  rows={duoRows}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
                  apDateKey={apDateKey}
                  initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.duo || null) : null}
                  customMemberships={customMemberships}
                />
              ) : apTab === 'cards' ? (
                <CardsTable
                  key={`cards-${apDateKey}`}
                  rows={cardsRows}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
                  apDateKey={apDateKey}
                  customMemberships={customMemberships}
                  onPlayerSelect={openPlayerStatsModal}
                />
              ) : (
                <AttackPointsTable
                  key={`ap-${apDateKey}-${apTab}`}
                  rows={rankedRows}
                  showAll={showAll}
                  onToggle={() => setShowAll(s => !s)}
                  rankBy={apTab}
                  headHi={headHi}
                  colHi={colHi}
                  onRequestTab={(id)=>{
                    if (isEnabled(id)) { setApTab(id); setPrimaryTab('pts'); setShowAll(false) }
                    else { notify('이 카테고리는 설정에서 숨겨졌습니다.', 'info') }
                  }}
                  controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
                  apDateKey={apDateKey}
                  initialBaselineRanks={apDateKey === 'all' ? (previousBaselineByMetric[apTab] || null) : null}
                  customMemberships={customMemberships}
                  onPlayerSelect={openPlayerStatsModal}
                />
              )
            )}
            {playerStatsEnabled && primaryTab !== 'mom' && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700" data-testid="badges-hint">
                <Award className="h-4 w-4 flex-shrink-0" />
                <span>{badgesEnabled ? t('badges.clickHint') : t('badges.clickHintStatsOnly')}</span>
              </div>
            )}
          </Card>
        )}

        <Card 
          title={
            <div className="flex items-center gap-2">
              <span>{t('matchHistory.title')}</span>
              <div className="w-[120px]">
                <Select
                  value={historySeason}
                  onChange={(val) => {
                    historySeasonUserSetRef.current = true
                    setHistorySeason(val)
                  }}
                  options={seasonOptions.map(v => ({ value: v, label: v === 'all' ? t('leaderboard.allTime') : `${v}년` }))}
                  size="sm"
                />
              </div>
            </div>
          }
        >
          <ErrorBoundary fallback={<div className="text-sm text-stone-500">{t('leaderboard.errorOccurred')}</div>}>
            <div className="saved-matches-no-ovr text-[13px] leading-tight">
              <SavedMatchesList
                matches={historySeasonFilteredMatches}
                players={players}
                isAdmin={isAdmin}
                onUpdateMatch={onUpdateMatch}
                hideOVR={true}
                highlightedMatchId={highlightedMatchId}
                customMemberships={customMemberships}
              />
            </div>
          </ErrorBoundary>

          <style>{`
            /* 모바일 친화: 가로 스크롤 탭의 스크롤바 감춤 */
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

            /* 1등 챔피언: ... (생략: 기존 스타일 유지) */

            /* SavedMatchesList 내 OVR 관련 요소 모두 숨김 */
            .saved-matches-no-ovr [data-ovr],
            .saved-matches-no-ovr .ovr,
            .saved-matches-no-ovr .ovr-badge,
            .saved-matches-no-ovr .ovr-chip,
            .saved-matches-no-ovr .stat-ovr,
            .saved-matches-no-ovr .text-ovr,
            .saved-matches-no-ovr [class*="OVR"],
            .saved-matches-no-ovr [class*="ovr"] {
              display: none !important;
            }
          `}</style>
        </Card>
      </div>

      {playerStatsEnabled && (
        <PlayerStatsModal
          open={Boolean(statsModalPlayer)}
          player={statsModalPlayer}
          stats={playerStatsData}
          onClose={closeStatsModal}
          onShowBadges={badgesEnabled ? openBadgeModal : undefined}
          customMemberships={customMemberships}
        />
      )}

      <MoMAwardDetailModal
        open={Boolean(momDetailPlayer)}
        player={momDetailPlayer}
        awards={selectedMoMAwards}
        onClose={closeMoMDetail}
        customMemberships={customMemberships}
      />

      {badgesEnabled && (
        <PlayerBadgeModal
          open={Boolean(badgeModalPlayer)}
          player={badgeModalPlayer}
          badges={badgeModalState.badges}
          loading={badgeModalState.loading}
          error={badgeModalState.error}
          onClose={closeBadgeModal}
          onRefresh={refreshBadgeModal}
        />
      )}
    </>
  )
}

function CaptainWinsTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [], onPlayerSelect }) {
  const { t } = useTranslation()
  const baselineKey = 'draft_captain_points_v1'
  const [baselineRanks] = useState(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) return JSON.parse(saved) || {}
      if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        return initialBaselineRanks
      }
      return {}
    } catch { return {} }
  })

  const deltaFor = (id, currentRank) => {
    if (apDateKey !== 'all') return null
    if (!baselineRanks || Object.keys(baselineRanks).length === 0) return null
    let prevRank = baselineRanks[String(id)]
    if (prevRank == null) {
      const maxPrev = Math.max(...Object.values(baselineRanks))
      if (Number.isFinite(maxPrev)) prevRank = maxPrev + 1
    }
    if (prevRank == null) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }
  const columns = [
    { label: t('leaderboard.rank'), px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: t('leaderboard.captainLabel'), px: 2, className: 'w-[110px] sm:w-[150px] md:w-[220px] lg:w-[280px] xl:w-[340px]' },
    { label: t('leaderboard.pointsLabel'), px: 1.5, align: 'center', className: 'w-[52px]' },
    { label: 'Last 5', px: 2, align: 'center', className: 'w-[120px]' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell
        id={r.id}
        name={r.name}
        membership={r.membership}
        tone={tone}
        photoUrl={r.photoUrl}
        customMemberships={customMemberships}
        onSelect={onPlayerSelect ? () => onPlayerSelect(r) : undefined}
      />
      <StatCell value={r.points} tone={tone} align="center" width={45} />
      <FormDotsCell form={r.last5} tone={tone} />
    </>
  )

  return (
    <LeaderboardTable
      rows={rows}
      showAll={showAll}
      onToggle={onToggle}
      controls={controls}
      title={t('leaderboard.draftCaptainPoints')}
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

function DraftWinsTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [], onPlayerSelect }) {
  const { t } = useTranslation()
  const baselineKey = 'draft_player_points_v1'
  const [baselineRanks] = useState(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) return JSON.parse(saved) || {}
      if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        return initialBaselineRanks
      }
      return {}
    } catch { return {} }
  })

  const deltaFor = (id, currentRank) => {
    if (apDateKey !== 'all') return null
    if (!baselineRanks || Object.keys(baselineRanks).length === 0) return null
    let prevRank = baselineRanks[String(id)]
    if (prevRank == null) {
      const maxPrev = Math.max(...Object.values(baselineRanks))
      if (Number.isFinite(maxPrev)) prevRank = maxPrev + 1
    }
    if (prevRank == null) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }
  const columns = [
    { label: t('leaderboard.rank'), px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: t('leaderboard.player'), px: 2, className: 'w-[110px] sm:w-[150px] md:w-[220px] lg:w-[280px] xl:w-[340px]' },
    { label: t('leaderboard.pointsLabel'), px: 1.5, align: 'center', className: 'w-[52px]' },
    { label: 'Last 5', px: 2, align: 'center', className: 'w-[120px]' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell
        id={r.id}
        name={r.name}
        membership={r.membership}
        tone={tone}
        photoUrl={r.photoUrl}
        customMemberships={customMemberships}
        onSelect={onPlayerSelect ? () => onPlayerSelect(r) : undefined}
      />
      <StatCell value={r.points} tone={tone} align="center" width={45} />
      <FormDotsCell form={r.last5} tone={tone} />
    </>
  )

  return (
    <LeaderboardTable
      rows={rows}
      showAll={showAll}
      onToggle={onToggle}
      controls={controls}
      title={t('leaderboard.draftPlayerPoints')}
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

function DraftAttackTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [], onPlayerSelect }) {
  const { t } = useTranslation()
  const baselineKey = 'draft_attack_pts_v1'
  const [baselineRanks] = useState(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) return JSON.parse(saved) || {}
      if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        return initialBaselineRanks
      }
      return {}
    } catch { return {} }
  })

  const deltaFor = (id, currentRank) => {
    if (apDateKey !== 'all') return null
    if (!baselineRanks || Object.keys(baselineRanks).length === 0) return null
    let prevRank = baselineRanks[String(id)]
    if (prevRank == null) {
      const maxPrev = Math.max(...Object.values(baselineRanks))
      if (Number.isFinite(maxPrev)) prevRank = maxPrev + 1
    }
    if (prevRank == null) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }
  const columns = [
    { label: t('leaderboard.rank'), px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: t('leaderboard.player'), px: 2, className: 'w-[110px] sm:w-[150px] md:w-[220px] lg:w-[280px] xl:w-[340px]' },
    { label: 'GP', px: 1, align: 'center', className: 'w-[45px]' },
    { label: 'G', px: 1, align: 'center', className: 'w-[40px]' },
    { label: 'A', px: 1, align: 'center', className: 'w-[40px]' },
    { label: 'Pts', px: 1, align: 'center', className: 'w-[45px]' },
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell
        id={r.id}
        name={r.name}
        membership={r.membership}
        tone={tone}
        photoUrl={r.photoUrl}
        customMemberships={customMemberships}
        onSelect={onPlayerSelect ? () => onPlayerSelect(r) : undefined}
      />
      <StatCell value={r.gp} tone={tone} align="center" width={40} />
      <StatCell value={r.g} tone={tone} align="center" width={35} />
      <StatCell value={r.a} tone={tone} align="center" width={35} />
      <StatCell value={r.pts} tone={tone} align="center" width={45} />
    </>
  )

  return (
    <LeaderboardTable
      rows={rows}
      showAll={showAll}
      onToggle={onToggle}
      controls={controls}
      title={t('leaderboard.draftAttack')}
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

/* ----------------------- 컨트롤 (좌측 정렬) ---------------------- */
function ControlsLeft({ apDateKey, setApDateKey, dateOptions = [], showAll, setShowAll }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 날짜 선택 - 앱 커스텀 드롭다운 */}
      <div className="min-w-[140px]">
        <Select
          value={apDateKey}
          onChange={(val)=>setApDateKey(val)}
          options={dateOptions.map(v => ({ value: v, label: v === 'all' ? t('matchHistory.allDates') : v }))}
          className="w-[160px]"
        />
      </div>
      <button
        onClick={() => setShowAll(s => !s)}
        className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
        title={showAll ? t('leaderboard.collapse') : t('leaderboard.viewAll')}
      >
        {showAll ? t('leaderboard.collapse') : t('leaderboard.viewAll')}
      </button>
    </div>
  )
}

/* ----------------------- 모바일 탭 컴포넌트 ---------------------- */
function PrimarySecondaryTabs({ primary, setPrimary, apTab, setApTab, draftTab, setDraftTab, momEnabled = true, apOptions }) {
  const { t } = useTranslation()
  const primaryOptions = useMemo(() => {
    const base = [
      { id: 'pts', label: t('leaderboard.totalPoints') },
      { id: 'draft', label: t('leaderboard.draft') },
      { id: 'mom', label: 'MOM' },
    ]
    if (momEnabled) return base
    return base.filter(opt => opt.id !== 'mom')
  }, [momEnabled, t])
  const primaryIndex = Math.max(primaryOptions.findIndex(opt => opt.id === primary), 0)
  const onPrimaryChange = (idx) => {
    const next = primaryOptions[idx]?.id || 'pts'
    setPrimary && setPrimary(next)
  }

  const ApOptions = apOptions && Array.isArray(apOptions) && apOptions.length > 0 ? apOptions : [
    { id: 'pts', label: '종합' },
    { id: 'g', label: '득점' },
    { id: 'a', label: '어시' },
    { id: 'gp', label: '출전' },
    { id: 'cs', label: '클린시트' },
    { id: 'duo', label: '듀오' },
    { id: 'cards', label: '카드' },
  ]
  const DraftOptions = [
    { id: 'playerWins', label: t('leaderboard.wins') },
    { id: 'captainWins', label: t('leaderboard.captain') },
    { id: 'attack', label: `${t('leaderboard.goals')}/${t('leaderboard.assists')}` },
  ]

  return (
    <div className="mb-2 space-y-2">
      {/* Primary tabs */}
      <Tab.Group selectedIndex={primaryIndex} onChange={onPrimaryChange}>
        <Tab.List className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
          {primaryOptions.map(t => (
            <Tab key={t.id} className={({ selected }) =>
              `px-3 py-1.5 text-[13px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${selected ? 'bg-emerald-500 text-white' : 'text-stone-700 hover:bg-stone-50'}`
            }>
              {t.label}
            </Tab>
          ))}
        </Tab.List>
      </Tab.Group>

      {/* Secondary controls: 모바일은 1줄 슬라이드, 데스크톱은 기존 세그먼트 */}
      {primary === 'pts' ? (
        <>
          {/* 모바일: 캐러셀 */}
          <div className="sm:hidden">
            <MobileCategoryCarousel
              options={ApOptions}
              activeId={apTab}
              onSelect={(id)=>setApTab && setApTab(id)}
            />
          </div>
          {/* 데스크톱: 기존 세그먼트 */}
          <div className="hidden sm:block overflow-x-auto no-scrollbar">
            <div className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
              {ApOptions.map(o => {
                const active = apTab === o.id
                return (
                  <button
                    key={o.id}
                    onClick={()=>setApTab && setApTab(o.id)}
                    className={`px-3 py-1.5 text-[13px] rounded-full ${active ? 'bg-emerald-500 text-white' : 'text-stone-700 hover:bg-stone-50'}`}
                    aria-pressed={active}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      ) : primary === 'draft' ? (
        <>
          {/* 모바일: 캐러셀 */}
          <div className="sm:hidden">
            <MobileCategoryCarousel
              options={[
                { id: 'playerWins', label: t('leaderboard.playerWins') },
                { id: 'captainWins', label: t('leaderboard.captainWins') },
                { id: 'attack', label: t('leaderboard.attackLabel') },
              ]}
              activeId={draftTab}
              onSelect={(id)=>setDraftTab && setDraftTab(id)}
            />
          </div>
          {/* 데스크톱: 기존 세그먼트 */}
          <div className="hidden sm:block overflow-x-auto no-scrollbar">
            <div className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
              {[
                { id: 'playerWins', label: t('leaderboard.playerWins') },
                { id: 'captainWins', label: t('leaderboard.captainWins') },
                { id: 'attack', label: t('leaderboard.attackLabel') },
              ].map(o => {
                const active = draftTab === o.id
                return (
                  <button
                    key={o.id}
                    onClick={()=>setDraftTab && setDraftTab(o.id)}
                    className={`px-3 py-1.5 text-[13px] rounded-full ${active ? 'bg-emerald-500 text-white' : 'text-stone-700 hover:bg-stone-50'}`}
                    aria-pressed={active}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

/* --------------- 공격포인트 테이블 --------------- */
function AttackPointsTable({ rows, showAll, onToggle, controls, rankBy = 'pts', headHi, colHi, onRequestTab, apDateKey, initialBaselineRanks = null, customMemberships = [], onPlayerSelect }) {
  const data = showAll ? rows : rows.slice(0, 5)

  // Baseline ranks for "모든 매치" only. …
  const [baselineRanks, setBaselineRanks] = useState(() => {
    try {
      const saved = localStorage.getItem(`ap_baselineRanks_${rankBy}_v1`)
      if (saved) return JSON.parse(saved) || {}
      if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(`ap_baselineRanks_${rankBy}_v1`, JSON.stringify(initialBaselineRanks))
        return initialBaselineRanks
      }
      return {}
    } catch {
      return {}
    }
  })
  const baselineKey = `ap_baselineRanks_${rankBy}_v1`

  useEffect(() => {
    if (apDateKey !== 'all') return
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) return
      const mapping = {}
      rows.forEach(r => { mapping[String(r.id || r.name)] = r.rank })
      if (Object.keys(mapping).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(mapping))
        setBaselineRanks(mapping)
      }
    } catch {}
  }, [apDateKey, rows, baselineKey])

  const deltaFor = (id, currentRank) => {
    if (apDateKey !== 'all') return null
    if (!baselineRanks || Object.keys(baselineRanks).length === 0) return null
    let prevRank = baselineRanks[String(id)]
    if (prevRank == null) {
      const maxPrev = Math.max(...Object.values(baselineRanks))
      if (Number.isFinite(maxPrev)) prevRank = maxPrev + 1
    }
    if (prevRank == null) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }

  const totalPlayers = rows.length
  const headerBtnCls = "inline-flex items-center gap-1 hover:underline cursor-pointer select-none"
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 scrollbar-hide">
      <table className="w-full text-sm" style={{ minWidth: '100%' }}>
        <thead>
          <tr>
            <th colSpan={7} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-600">{t('leaderboard.totalPlayers')} <span className="font-semibold">{totalPlayers}</span>{t('leaderboard.playersCount')}</div>
                <div className="ml-auto">{controls}</div>
              </div>
            </th>
          </tr>
          <tr className="text-[13px] text-stone-600">
            <th className="border-b px-1.5 py-1.5 text-center">{t('leaderboard.rank')}</th>
            <th className="border-b px-2 py-1.5 text-left">{t('leaderboard.player')}</th>

            <th className={`border-b px-2 py-1.5 text-center ${headHi('gp')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('gp')} className={headerBtnCls} title="Most Appearances 보기">
                GP
              </button>
            </th>
            <th className={`border-b px-2 py-1.5 text-center ${headHi('g')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('g')} className={headerBtnCls} title="Top Scorer 보기">
                G
              </button>
            </th>
            <th className={`border-b px-2 py-1.5 text-center ${headHi('a')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('a')} className={headerBtnCls} title="Most Assists 보기">
                A
              </button>
            </th>

            <th className="border-b px-2 py-1.5 text-center" scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('pts')} className={headerBtnCls} title="종합(공격포인트) 보기">
                PTS
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {data.map((r, idx) => {
            const rank = r.rank
            const tone = rankTone(rank)
            const delta = deltaFor(r.id || r.name, rank)
            return (
              <tr key={r.id || `${r.name}-${idx}`} className={`${tone.rowBg}`}>
                <td className={`border-b align-middle px-1.5 py-1.5 ${tone.cellBg}`}>
                  <div className="grid items-center" style={{ gridTemplateColumns: '16px 1fr 22px', columnGap: 4 }}>
                    <div className="flex items-center justify-center">
                      <Medal rank={rank} />
                    </div>
                    <div className="text-center tabular-nums">{rank}</div>
                    <div className="text-right">
                      {delta && delta.diff !== 0 ? (
                        <span className={`inline-block min-w-[20px] text-[11px] font-medium ${delta.dir === 'up' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {delta.dir === 'up' ? '▲' : '▼'} {Math.abs(delta.diff)}
                        </span>
                      ) : (
                        <span className="inline-block min-w-[20px] text-[11px] text-transparent">0</span>
                      )}
                    </div>
                  </div>
                </td>

                <PlayerNameCell
                  id={r.id || r.name}
                  name={r.name}
                  membership={r.membership}
                  tone={tone}
                  photoUrl={r.photoUrl}
                  customMemberships={customMemberships}
                  onSelect={onPlayerSelect ? () => onPlayerSelect({ ...r, id: r.id || r.name }) : undefined}
                />

                <td className={`border-b px-2 py-1.5 text-center tabular-nums ${tone.cellBg} ${colHi('gp')}`}>{r.gp}</td>
                <td className={`border-b px-2 py-1.5 text-center tabular-nums ${tone.cellBg} ${colHi('g')}`}>{r.g}</td>
                <td className={`border-b px-2 py-1.5 text-center tabular-nums ${tone.cellBg} ${colHi('a')}`}>{r.a}</td>
                <td className={`border-b px-2 py-1.5 text-center font-semibold tabular-nums ${tone.cellBg}`}>{r.pts}</td>
              </tr>
            )
          })}
          {data.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-sm text-stone-500" colSpan={6}>
                표시할 기록이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------- 듀오 테이블 --------------------- */
function DuoTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [] }) {
  const { t } = useTranslation()
  const baselineKey = 'duo_count_v1'
  const [baselineRanks] = useState(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) return JSON.parse(saved) || {}
      if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        return initialBaselineRanks
      }
      return {}
    } catch { return {} }
  })

  const deltaFor = (id, currentRank) => {
    if (apDateKey !== 'all') return null
    if (!baselineRanks || Object.keys(baselineRanks).length === 0) return null
    let prevRank = baselineRanks[String(id)]
    if (prevRank == null) {
      const maxPrev = Math.max(...Object.values(baselineRanks))
      if (Number.isFinite(maxPrev)) prevRank = maxPrev + 1
    }
    if (prevRank == null) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }
  const columns = [
    { label: t('leaderboard.rank'), px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: t('leaderboard.duoPair'), px: 2 },
    { label: t('leaderboard.count'), px: 1.5, align: 'center', className: 'w-[50px]' }
  ]

  const renderRow = (r, tone) => {
    const aBadges = getBadgesWithCustom(r.aMembership, customMemberships)
    const aBadgeInfo = getMembershipBadge(r.aMembership, customMemberships)
    const gBadges = getBadgesWithCustom(r.gMembership, customMemberships)
    const gBadgeInfo = getMembershipBadge(r.gMembership, customMemberships)

    return (
      <>
        <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
        <td className={`border-b px-1.5 py-1.5 ${tone.cellBg}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <div className="shrink-0">
                <InitialAvatar 
                  id={r.assistId} 
                  name={r.aName} 
                  size={24} 
                  badges={aBadges} 
                  photoUrl={r.aPhotoUrl} 
                  customMemberships={customMemberships}
                  badgeInfo={aBadgeInfo}
                />
              </div>
              <div className="min-w-0">
                <span
                  className="
                    block font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis
                    w-[3.6em]
                    sm:w-[5.5em]
                    md:w-[10em]
                    lg:w-[14em]
                    xl:w-auto xl:max-w-none xl:overflow-visible
                  "
                  title={r.aName}
                >
                  {r.aName}
                </span>
              </div>
            </div>
            <span className="text-stone-400 flex-shrink-0 text-xs">→</span>
            <div className="flex items-center gap-1 min-w-0">
              <div className="shrink-0">
                <InitialAvatar 
                  id={r.goalId} 
                  name={r.gName} 
                  size={24} 
                  badges={gBadges} 
                  photoUrl={r.gPhotoUrl} 
                  customMemberships={customMemberships}
                  badgeInfo={gBadgeInfo}
                />
              </div>
              <div className="min-w-0">
                <span
                  className="
                    block font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis
                    w-[3.6em]
                    sm:w-[5.5em]
                    md:w-[10em]
                    lg:w-[14em]
                    xl:w-auto xl:max-w-none xl:overflow-visible
                  "
                  title={r.gName}
                >
                  {r.gName}
                </span>
              </div>
            </div>
          </div>
        </td>
        <StatCell value={r.count} tone={tone} align="center" width={45} />
      </>
    )
  }

  return (
    <LeaderboardTable
      rows={rows}
      showAll={showAll}
      onToggle={onToggle}
      controls={controls}
      title={t('leaderboard.totalDuo')}
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

/* ---------------------- Main Component --------------------- */

/* ---------------------- 클린시트 카드 --------------------- */
function CleanSheetTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [], onPlayerSelect }) {
  const { t } = useTranslation()
  const baselineKey = 'cs_count_v1'
  const [baselineRanks] = useState(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) return JSON.parse(saved) || {}
      if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        return initialBaselineRanks
      }
      return {}
    } catch { return {} }
  })

  const deltaFor = (id, currentRank) => {
    if (apDateKey !== 'all') return null
    if (!baselineRanks || Object.keys(baselineRanks).length === 0) return null
    let prevRank = baselineRanks[String(id)]
    if (prevRank == null) {
      const maxPrev = Math.max(...Object.values(baselineRanks))
      if (Number.isFinite(maxPrev)) prevRank = maxPrev + 1
    }
    if (prevRank == null) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }

  const columns = [
    { label: t('leaderboard.rank'), px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: t('leaderboard.player'), px: 2 },
    { label: 'CS', px: 1.5, align: 'center', className: 'w-[50px]' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell
        id={r.id}
        name={r.name}
        membership={r.membership}
        tone={tone}
        photoUrl={r.photoUrl}
        customMemberships={customMemberships}
        onSelect={onPlayerSelect ? () => onPlayerSelect(r) : undefined}
      />
      <StatCell value={r.cs || 0} tone={tone} align="center" width={50} />
    </>
  )

  return (
    <LeaderboardTable
      rows={rows}
      showAll={showAll}
      onToggle={onToggle}
      controls={controls}
      title={t('leaderboard.cleanSheetTitle')}
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

/* ---------------------- Main Component --------------------- */

function CardsTable({ rows, showAll, onToggle, controls, apDateKey, customMemberships = [], onPlayerSelect }) {
  const { t } = useTranslation()
  const data = showAll ? rows : rows.slice(0, 5)
  const columns = [
    { label: t('leaderboard.rank'), px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: t('leaderboard.player'), px: 2 },
    {
      label: (
        <CardColumnHeader
          label={t('playerStatsModal.labels.yellow')}
          colorClass="bg-yellow-300"
          borderClass="border-yellow-500"
        />
      ),
      px: 1.5,
      align: 'center',
      className: 'w-[50px]'
    },
    {
      label: (
        <CardColumnHeader
          label={t('playerStatsModal.labels.red')}
          colorClass="bg-red-500"
          borderClass="border-red-700"
        />
      ),
      px: 1.5,
      align: 'center',
      className: 'w-[50px]'
    },
    {
      label: (
        <CardColumnHeader
          label={t('playerStatsModal.labels.black')}
          colorClass="bg-stone-900"
          borderClass="border-stone-950"
        />
      ),
      px: 1.5,
      align: 'center',
      className: 'w-[50px]'
    },
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} />
      <PlayerNameCell
        id={r.id}
        name={r.name}
        membership={r.membership}
        tone={tone}
        photoUrl={r.photoUrl}
        customMemberships={customMemberships}
        onSelect={onPlayerSelect ? () => onPlayerSelect(r) : undefined}
      />
      <StatCell value={r.y || 0} tone={tone} align="center" width={50} />
      <StatCell value={r.r || 0} tone={tone} align="center" width={50} />
      <StatCell value={r.b || 0} tone={tone} align="center" width={50} />
    </>
  )

  return (
    <LeaderboardTable
      rows={data}
      showAll={showAll}
      onToggle={onToggle}
      controls={controls}
      title={t('leaderboard.cardsTitle')}
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

function CardColumnHeader({ label, colorClass, borderClass }) {
  return (
    <div className="flex items-center justify-center" title={label} aria-label={label}>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-3.5 rounded-[3px] border shadow-sm ${colorClass} ${borderClass}`}
      />
    </div>
  )
}
