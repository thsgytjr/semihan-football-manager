// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect } from 'react'
import { Tab } from '@headlessui/react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import SavedMatchesList from '../components/SavedMatchesList'
import LeaderboardTable, { RankCell, PlayerNameCell, StatCell, FormDotsCell } from '../components/LeaderboardTable'
import Medal from '../components/ranking/Medal'
import FormDots from '../components/ranking/FormDots'
import UpcomingMatchesWidget from '../components/UpcomingMatchesWidget'
import { toStr, extractDateKey, extractSeason } from '../lib/matchUtils'
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
  computeDraftAttackRows
} from '../lib/leaderboardComputations'
import { getMembershipBadge } from '../lib/membershipConfig'

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
  membershipSettings = []
}) {
  const customMemberships = membershipSettings.length > 0 ? membershipSettings : []
  
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
    return ['all', ...Array.from(set).sort().reverse()]
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

  // 탭 구조 개편: 1차(종합|draft), 2차(종합: pts/g/a/gp | draft: playerWins/captainWins/attack)
  const [primaryTab, setPrimaryTab] = useState('pts') // 'pts' | 'draft'
  const [apTab, setApTab] = useState('pts')           // 'pts' | 'g' | 'a' | 'gp'
  const [draftTab, setDraftTab] = useState('playerWins') // 'playerWins' | 'captainWins' | 'attack'
  const rankedRows = useMemo(() => addRanks(baseRows, apTab), [baseRows, apTab])
  const duoRows = useMemo(() => computeDuoRows(players, filteredMatches), [players, filteredMatches])

  const [showAll, setShowAll] = useState(false)
  const [highlightedMatchId, setHighlightedMatchId] = useState(null) // 하이라이트할 매치 ID

  // Seed baselines …
  const previousBaselineByMetric = useMemo(() => {
    try {
      const keys = Array.from(new Set((matches || []).map(m => extractDateKey(m)).filter(Boolean)))
      if (keys.length <= 1) return {}
      const sorted = [...keys].sort() // ascending
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
      const sorted = [...keys].sort()
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
      notify('⚠️ 매치 히스토리에서 해당하는 매치를 찾을 수 없습니다.', 'error', 3000)
    }
  }

  return (
    <div className="grid gap-4 sm:gap-6">
      {/* Upcoming Matches Widget */}
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

      {/* 리더보드 */}
      <Card 
        title="리더보드"
        right={
          <div className="flex items-center gap-2 min-w-[140px]">
            <Select
              value={leaderboardSeason}
              onChange={(val) => { setLeaderboardSeason(val); setApDateKey('all') }}
              options={seasonOptions.map(v => ({ value: v, label: v === 'all' ? '전체 시즌' : `${v}년` }))}
              className="w-[150px]"
            />
          </div>
        }
      >
        {/* 상단: 1차 탭 (종합 | Draft) + 2차 탭 (조건부) */}
        <PrimarySecondaryTabs
          primary={primaryTab}
          setPrimary={(val)=>{ setPrimaryTab(val); setShowAll(false) }}
          apTab={apTab}
          setApTab={(val)=>{ setApTab(val); setPrimaryTab('pts'); setShowAll(false) }}
          draftTab={draftTab}
          setDraftTab={(val)=>{ setDraftTab(val); setPrimaryTab('draft'); setShowAll(false) }}
        />

        {primaryTab === 'draft' ? (
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
            />
          )
        ) : (
          apTab === 'duo' ? (
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
          ) : (
            <AttackPointsTable
              key={`ap-${apDateKey}-${apTab}`}
              rows={rankedRows}
              showAll={showAll}
              onToggle={() => setShowAll(s => !s)}
              rankBy={apTab}
              headHi={headHi}
              colHi={colHi}
              onRequestTab={(id)=>{ setApTab(id); setPrimaryTab('pts'); setShowAll(false) }}
              controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
              apDateKey={apDateKey}
              initialBaselineRanks={apDateKey === 'all' ? (previousBaselineByMetric[apTab] || null) : null}
              customMemberships={customMemberships}
            />
          )
        )}
      </Card>

      {/* 매치 히스토리 (OVR 표시 숨김) */}
      <Card 
        title="매치 히스토리"
        right={
          <div className="flex items-center gap-2 min-w-[140px]">
            <Select
              value={historySeason}
              onChange={(val) => setHistorySeason(val)}
              options={seasonOptions.map(v => ({ value: v, label: v === 'all' ? '전체 시즌' : `${v}년` }))}
              className="w-[150px]"
            />
          </div>
        }
      >
        <ErrorBoundary fallback={<div className="text-sm text-stone-500">목록을 불러오는 중 문제가 발생했어요.</div>}>
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
  )
}

function CaptainWinsTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [] }) {
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
    { label: '순위', px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: '주장', px: 2, className: 'w-[110px] sm:w-[150px] md:w-[220px] lg:w-[280px] xl:w-[340px]' },
    { label: '승점', px: 1.5, align: 'center', className: 'w-[52px]' },
    { label: 'Last 5', px: 2, align: 'center', className: 'w-[120px]' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
  <PlayerNameCell id={r.id} name={r.name} membership={r.membership} tone={tone} photoUrl={r.photoUrl} customMemberships={customMemberships} />
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
      title="Draft 주장 승점"
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

function DraftWinsTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [] }) {
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
    { label: '순위', px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: '선수', px: 2, className: 'w-[110px] sm:w-[150px] md:w-[220px] lg:w-[280px] xl:w-[340px]' },
    { label: '승점', px: 1.5, align: 'center', className: 'w-[52px]' },
    { label: 'Last 5', px: 2, align: 'center', className: 'w-[120px]' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
  <PlayerNameCell id={r.id} name={r.name} membership={r.membership} tone={tone} photoUrl={r.photoUrl} customMemberships={customMemberships} />
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
      title="Draft 선수 승점"
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

function DraftAttackTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null, customMemberships = [] }) {
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
    { label: '순위', px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: '선수', px: 2, className: 'w-[110px] sm:w-[150px] md:w-[220px] lg:w-[280px] xl:w-[340px]' },
    { label: 'GP', px: 1, align: 'center', className: 'w-[45px]' },
    { label: 'G', px: 1, align: 'center', className: 'w-[40px]' },
    { label: 'A', px: 1, align: 'center', className: 'w-[40px]' },
    { label: 'Pts', px: 1, align: 'center', className: 'w-[45px]' },
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell id={r.id} name={r.name} membership={r.membership} tone={tone} photoUrl={r.photoUrl} customMemberships={customMemberships} />
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
      title="Draft 골/어시"
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

/* ----------------------- 컨트롤 (좌측 정렬) ---------------------- */
function ControlsLeft({ apDateKey, setApDateKey, dateOptions = [], showAll, setShowAll }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 날짜 선택 - 앱 커스텀 드롭다운 */}
      <div className="min-w-[140px]">
        <Select
          value={apDateKey}
          onChange={(val)=>setApDateKey(val)}
          options={dateOptions.map(v => ({ value: v, label: v === 'all' ? '📋 모든 날짜' : v }))}
          className="w-[160px]"
        />
      </div>
      <button
        onClick={() => setShowAll(s => !s)}
        className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
        title={showAll ? '접기' : '전체 보기'}
      >
        {showAll ? '접기' : '전체 보기'}
      </button>
    </div>
  )
}

/* ----------------------- 모바일 탭 컴포넌트 ---------------------- */
function PrimarySecondaryTabs({ primary, setPrimary, apTab, setApTab, draftTab, setDraftTab }) {
  const primaryIndex = primary === 'draft' ? 1 : 0
  const onPrimaryChange = (idx) => setPrimary && setPrimary(idx === 1 ? 'draft' : 'pts')

  const ApOptions = [
    { id: 'pts', label: '종합' },
    { id: 'g', label: '득점' },
    { id: 'a', label: '어시' },
    { id: 'gp', label: '출전' },
    { id: 'duo', label: '듀오' },
  ]
  const DraftOptions = [
    { id: 'playerWins', label: '선수승점' },
    { id: 'captainWins', label: '주장승점' },
    { id: 'attack', label: '골/어시' },
  ]

  return (
    <div className="mb-2 space-y-2">
      {/* Primary tabs */}
      <Tab.Group selectedIndex={primaryIndex} onChange={onPrimaryChange}>
        <Tab.List className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
          {[
            { id: 'pts', label: '종합' },
            { id: 'draft', label: 'Draft' },
          ].map((t, i) => (
            <Tab key={t.id} className={({ selected }) =>
              `px-3 py-1.5 text-[13px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${selected ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-50'}`
            }>
              {t.label}
            </Tab>
          ))}
        </Tab.List>
      </Tab.Group>

      {/* Secondary controls: mobile select + desktop segmented */}
      {primary === 'pts' ? (
        <div className="overflow-x-auto no-scrollbar">
          <div className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
            {[
              { id: 'pts', label: '종합' },
              { id: 'g', label: '득점' },
              { id: 'a', label: '어시' },
              { id: 'gp', label: '출전' },
              { id: 'duo', label: '듀오' },
            ].map(o => {
              const active = apTab === o.id
              return (
                <button
                  key={o.id}
                  onClick={()=>setApTab && setApTab(o.id)}
                  className={`px-3 py-1.5 text-[13px] rounded-full ${active ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-50'}`}
                  aria-pressed={active}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <div className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
            {[
              { id: 'playerWins', label: '선수승점' },
              { id: 'captainWins', label: '주장승점' },
              { id: 'attack', label: '골/어시' },
            ].map(o => {
              const active = draftTab === o.id
              return (
                <button
                  key={o.id}
                  onClick={()=>setDraftTab && setDraftTab(o.id)}
                  className={`px-3 py-1.5 text-[13px] rounded-full ${active ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-50'}`}
                  aria-pressed={active}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------- 공격포인트 테이블 --------------- */
function AttackPointsTable({ rows, showAll, onToggle, controls, rankBy = 'pts', headHi, colHi, onRequestTab, apDateKey, initialBaselineRanks = null, customMemberships = [] }) {
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

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 scrollbar-hide">
      <table className="w-full text-sm" style={{ minWidth: '100%' }}>
        <thead>
          <tr>
            <th colSpan={6} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-600">총 선수 <span className="font-semibold">{totalPlayers}</span>명</div>
                <div className="ml-auto">{controls}</div>
              </div>
            </th>
          </tr>
          <tr className="text-[13px] text-stone-600">
            <th className="border-b px-1.5 py-1.5 text-center">순위</th>
            <th className="border-b px-2 py-1.5 text-left">선수</th>

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

                {/* 이름 셀: 고정폭 + 가로 스크롤 */}
                <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
                  <div className="flex items-center gap-1.5 min-w-0 w-[88px] sm:w-[140px] lg:w-auto lg:max-w-[250px]">
                    <div className="flex-shrink-0">
                      <InitialAvatar 
                        id={r.id || r.name} 
                        name={r.name} 
                        size={32} 
                        badges={getBadgesWithCustom(r.membership, customMemberships)}
                        photoUrl={r.photoUrl}
                        customMemberships={customMemberships}
                        badgeInfo={getMembershipBadge(r.membership, customMemberships)}
                      />
                    </div>
                    <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
                      <span className="font-medium text-sm whitespace-nowrap" title={r.name}>
                        {r.name}
                      </span>
                    </div>
                  </div>
                </td>

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
    { label: '순위', px: 1.5, align: 'center', className: 'w-[60px]' },
    { label: '듀오 (Assist → Goal)', px: 2 },
    { label: '회수', px: 1.5, align: 'center', className: 'w-[50px]' }
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
      title="총 듀오"
      columns={columns}
      renderRow={renderRow}
      membershipSettings={customMemberships}
    />
  )
}

/* ---------------------- Main Component --------------------- */
