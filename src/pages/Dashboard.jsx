// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect, useCallback } from 'react'
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
import { Award } from 'lucide-react'
import { useMoMPrompt } from '../hooks/useMoMPrompt'
import { useMoMAwardsSummary } from '../hooks/useMoMAwardsSummary'
import { toStr, extractDateKey, extractSeason } from '../lib/matchUtils'
import { getCountdownParts } from '../lib/momUtils'
import { rankTone } from '../lib/rankingUtils'
import { notify } from '../components/Toast'
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
}) {
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
  
  // 시즌 옵션 생성 (년도별)
  const seasonOptions = useMemo(() => {
    const seasons = new Set()
    for (const m of matches) {
      const season = extractSeason(m)
      if (season) seasons.add(season)
    }
    return ['all', ...Array.from(seasons).sort().reverse()]
  }, [matches])
  
  // 시즌별 필터링 (리더보드용)
  const leaderboardSeasonFilteredMatches = useMemo(() => {
    if (leaderboardSeason === 'all') return matches
    return matches.filter(m => extractSeason(m) === leaderboardSeason)
  }, [matches, leaderboardSeason])

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

  const baseRows = useMemo(() => computeAttackRows(players, filteredMatches), [players, filteredMatches])

  // Draft 전용: 선수/주장 승리 집계
  const draftWinRows = useMemo(() => computeDraftPlayerStatsRows(players, filteredMatches), [players, filteredMatches])
  const captainWinRows = useMemo(() => computeCaptainStatsRows(players, filteredMatches), [players, filteredMatches])
  const draftAttackRows = useMemo(() => computeDraftAttackRows(players, filteredMatches), [players, filteredMatches])

  const mom = useMoMPrompt({ matches, players })
  const momAwards = useMoMAwardsSummary(matches, { limit: null })

  // 탭 구조 개편: 1차(종합|draft), 2차(종합: pts/g/a/gp | draft: playerWins/captainWins/attack)
  const [primaryTab, setPrimaryTab] = useState('pts') // 'pts' | 'draft' | 'mom'
  const [apTab, setApTab] = useState('pts')           // 'pts' | 'g' | 'a' | 'gp' | 'cs' | 'duo' | 'cards'
  const [draftTab, setDraftTab] = useState('playerWins') // 'playerWins' | 'captainWins' | 'attack'
  const rankedRows = useMemo(() => addRanks(baseRows, apTab), [baseRows, apTab])
  const duoRows = useMemo(() => computeDuoRows(players, filteredMatches), [players, filteredMatches])
  const csRows = useMemo(() => addRanks(baseRows, 'cs'), [baseRows])
  const cardsRows = useMemo(() => computeCardsRows(players, filteredMatches), [players, filteredMatches])
  const badgeFactsByPlayer = useMemo(
    () => buildPlayerBadgeFactsMap(players, matches, {
      momAwardCounts: momAwards.countsByPlayer,
      momAwardTimeline: momAwards.winnersByMatch,
    }),
    [players, matches, momAwards.countsByPlayer, momAwards.winnersByMatch]
  )

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
  const [badgeModalState, setBadgeModalState] = useState({ badges: [], loading: false, error: null })
  const [momDetailPlayer, setMoMDetailPlayer] = useState(null)

  const openBadgeModal = useCallback((player) => {
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
    setBadgeModalState({ badges: [], loading: true, error: null })
    const key = toStr(playerId)
    const facts = badgeFactsByPlayer.get(key)
    const computed = generateBadgesFromFacts(facts)
    setBadgeModalState({ badges: computed, loading: false, error: null })
  }, [badgeFactsByPlayer, badgesEnabled])

  // 뱃지 기능이 비활성화되면 열린 모달 닫기
  useEffect(() => {
    if (!badgesEnabled && badgeModalPlayer) {
      setBadgeModalPlayer(null)
      setBadgeModalState({ badges: [], loading: false, error: null })
    }
  }, [badgesEnabled, badgeModalPlayer])

  const refreshBadgeModal = useCallback(() => {
    if (!badgeModalPlayer) return
    openBadgeModal(badgeModalPlayer)
  }, [badgeModalPlayer, openBadgeModal])

  const closeBadgeModal = useCallback(() => {
    setBadgeModalPlayer(null)
    setBadgeModalState({ badges: [], loading: false, error: null })
  }, [])

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

  const matchLookup = useMemo(() => {
    const map = new Map()
    matches.forEach(match => {
      if (match?.id != null) {
        map.set(toStr(match.id), match)
      }
    })
    return map
  }, [matches])

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
                    onChange={(val) => { setLeaderboardSeason(val); setApDateKey('all') }}
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
                  onPlayerSelect={badgesEnabled ? openBadgeModal : undefined}
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
                  onPlayerSelect={badgesEnabled ? openBadgeModal : undefined}
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
                  onPlayerSelect={badgesEnabled ? openBadgeModal : undefined}
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
                  onPlayerSelect={badgesEnabled ? openBadgeModal : undefined}
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
                  onPlayerSelect={badgesEnabled ? openBadgeModal : undefined}
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
                  onPlayerSelect={badgesEnabled ? openBadgeModal : undefined}
                />
              )
            )}
            {badgesEnabled && primaryTab !== 'mom' && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700" data-testid="badges-hint">
                <Award className="h-4 w-4 flex-shrink-0" />
                <span>{t('badges.clickHint')}</span>
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
                  onChange={(val) => setHistorySeason(val)}
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
    { label: 'YC', px: 1.5, align: 'center', className: 'w-[50px]' },
    { label: 'RC', px: 1.5, align: 'center', className: 'w-[50px]' },
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
