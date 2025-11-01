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
import { toStr, extractDateKey } from '../lib/matchUtils'
import { rankTone } from '../lib/rankingUtils'
import { 
  computeAttackRows, 
  sortComparator, 
  addRanks,
  computeDuoRows,
  computeDraftPlayerStatsRows,
  computeCaptainStatsRows,
  computeDraftAttackRows
} from '../lib/leaderboardComputations'

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
  onUpdateUpcomingMatch
}) {
  const [apDateKey, setApDateKey] = useState('all')
  const dateOptions = useMemo(() => {
    const set = new Set()
    for (const m of matches) {
      const k = extractDateKey(m)
      if (k) set.add(k)
    }
    return ['all', ...Array.from(set).sort().reverse()]
  }, [matches])

  const filteredMatches = useMemo(
    () => apDateKey === 'all' ? matches : matches.filter(m => extractDateKey(m) === apDateKey),
    [matches, apDateKey]
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

  // Seed a useful initial baseline for rank-change arrows on first visit (no buttons needed):
  // If viewing 전체(모든 매치) and no local baseline exists yet, we compare against the
  // standings BEFORE the most recent match-day (latest date key). This makes arrows
  // visible immediately in production without prior local storage state.
  const previousBaselineByMetric = useMemo(() => {
    try {
      // Collect date keys present in all matches
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

  // Previous baselines for other tables (draft and duo), seeded from matches excluding the latest date key
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
      />

      {/* 리더보드 */}
      <Card title="리더보드">
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
              rows={captainWinRows}
              showAll={showAll}
              onToggle={() => setShowAll(s => !s)}
              controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
              apDateKey={apDateKey}
              initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.draftCaptain || null) : null}
            />
          ) : draftTab === 'attack' ? (
            <DraftAttackTable
              rows={draftAttackRows}
              showAll={showAll}
              onToggle={() => setShowAll(s => !s)}
              controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
              apDateKey={apDateKey}
              initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.draftAttack || null) : null}
            />
          ) : (
            <DraftWinsTable
              rows={draftWinRows}
              showAll={showAll}
              onToggle={() => setShowAll(s => !s)}
              controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
              apDateKey={apDateKey}
              initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.draftPlayer || null) : null}
            />
          )
        ) : (
          apTab === 'duo' ? (
            <DuoTable
              rows={duoRows}
              showAll={showAll}
              onToggle={() => setShowAll(s => !s)}
              controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
              apDateKey={apDateKey}
              initialBaselineRanks={apDateKey === 'all' ? (previousBaselinesMisc.duo || null) : null}
            />
          ) : (
            <AttackPointsTable
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
            />
          )
        )}
      </Card>

      {/* 매치 히스토리 (OVR 표시 숨김) */}
      <Card title="매치 히스토리">
        <ErrorBoundary fallback={<div className="text-sm text-stone-500">목록을 불러오는 중 문제가 발생했어요.</div>}>
          <div className="saved-matches-no-ovr text-[13px] leading-tight">
            <SavedMatchesList
              matches={matches}
              players={players}
              isAdmin={isAdmin}
              onUpdateMatch={onUpdateMatch}
              hideOVR={true}
            />
          </div>
        </ErrorBoundary>

        <style>{`
          /* 모바일 친화: 가로 스크롤 탭의 스크롤바 감춤 */
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

          /* 1등 챔피언: 과한 테두리/이모지 없이 텍스트만 고급스러운 금빛 반짝임 */
          @keyframes gold-glint {
            0%, 100% {
              filter: brightness(1) contrast(1);
              text-shadow: 0 0 1px rgba(0,0,0,0.15), 0 0 6px rgba(255, 223, 128, 0.25);
            }
            50% {
              filter: brightness(1.08) contrast(1.05);
              text-shadow: 0 0 1px rgba(0,0,0,0.15), 0 0 12px rgba(255, 235, 170, 0.45);
            }
          }
          @keyframes gold-shift {
            0%, 100% { background-position: 50% 50%; }
            50% { background-position: 52% 48%; }
          }
          .champion-gold-text {
            display: inline-block;
            background-image: linear-gradient(135deg,
              #fff6d0 0%,
              #f1d28b 20%,
              #cfa645 40%,
              #fff2b8 60%,
              #d1a54b 75%,
              #fff7cf 90%,
              #c9992e 100%
            );
            background-size: 250% 250%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: gold-glint 1.8s ease-in-out infinite, gold-shift 3s ease-in-out infinite;
            filter: drop-shadow(0 0 0.6px rgba(0,0,0,0.25));
          }

          /* 셀 전체 금빛 반짝임 (텍스트 가리지 않도록 오버레이) */
          @keyframes gold-sweep {
            0%   { transform: translateX(-120%) skewX(-15deg); }
            100% { transform: translateX(220%)  skewX(-15deg); }
          }
          .champion-gold-cell {
            position: relative;
            overflow: hidden;
            box-shadow: inset 0 0 0 1px rgba(215, 160, 40, 0.12), inset 0 0 18px rgba(255, 220, 100, 0.10);
            isolation: isolate;
          }
          .champion-gold-cell::before {
            content: '';
            position: absolute;
            inset: 0;
            background:
              radial-gradient(150% 120% at 30% 20%, rgba(255, 235, 160, 0.20), rgba(255, 215, 120, 0.10) 35%, transparent 70%),
              linear-gradient(180deg, rgba(255, 240, 180, 0.12), rgba(255, 210, 110, 0.08) 40%, rgba(230, 170, 60, 0.06) 100%);
            mix-blend-mode: overlay;
            pointer-events: none;
            z-index: 0;
          }
          .champion-gold-cell::after {
            content: '';
            position: absolute;
            top: -20%;
            left: -30%;
            width: 40%;
            height: 140%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
            filter: blur(2px);
            transform: translateX(-120%) skewX(-15deg);
            animation: gold-sweep 2.4s ease-in-out infinite;
            opacity: 0.7;
            mix-blend-mode: screen;
            pointer-events: none;
            z-index: 1;
          }

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

function CaptainWinsTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null }) {
  const [baselineRanks, setBaselineRanks] = useState({})
  const baselineKey = 'draft_captain_points_v1'

  useEffect(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) {
        setBaselineRanks(JSON.parse(saved) || {})
      } else if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        setBaselineRanks(initialBaselineRanks)
      } else {
        setBaselineRanks({})
      }
    } catch { setBaselineRanks({}) }
  }, [apDateKey, initialBaselineRanks])

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
    { label: '순위', px: 1.5, align: 'center' },
    { label: '주장', px: 2 },
    { label: '승점', px: 1.5, align: 'center' },
    { label: 'Last 5', px: 2, align: 'center' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell id={r.id} name={r.name} isGuest={r.isGuest} tone={tone} />
      <StatCell value={r.points} tone={tone} align="center" />
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
    />
  )
}

/* ---------------- Draft 승리 테이블 ---------------- */
function DraftWinsTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null }) {
  const [baselineRanks, setBaselineRanks] = useState({})
  const baselineKey = 'draft_player_points_v1'

  useEffect(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) {
        setBaselineRanks(JSON.parse(saved) || {})
      } else if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        setBaselineRanks(initialBaselineRanks)
      } else {
        setBaselineRanks({})
      }
    } catch { setBaselineRanks({}) }
  }, [apDateKey, initialBaselineRanks])

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
    { label: '순위', px: 1.5, align: 'center' },
    { label: '선수', px: 2 },
    { label: '승점', px: 1.5, align: 'center' },
    { label: 'Last 5', px: 2, align: 'center' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell id={r.id} name={r.name} isGuest={r.isGuest} tone={tone} />
      <StatCell value={r.points} tone={tone} align="center" />
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
    />
  )
}

function DraftAttackTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null }) {
  const [baselineRanks, setBaselineRanks] = useState({})
  const baselineKey = 'draft_attack_pts_v1'

  useEffect(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) {
        setBaselineRanks(JSON.parse(saved) || {})
      } else if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        setBaselineRanks(initialBaselineRanks)
      } else {
        setBaselineRanks({})
      }
    } catch { setBaselineRanks({}) }
  }, [apDateKey, initialBaselineRanks])

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
    { label: '순위', px: 1.5, align: 'center' },
    { label: '선수', px: 2 },
    { label: 'GP', px: 1, align: 'center' },
    { label: 'G', px: 1, align: 'center' },
    { label: 'A', px: 1, align: 'center' },
    { label: 'Pts', px: 1, align: 'center' },
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <PlayerNameCell id={r.id} name={r.name} isGuest={r.isGuest} tone={tone} />
      <StatCell value={r.gp} tone={tone} align="center" />
      <StatCell value={r.g} tone={tone} align="center" />
      <StatCell value={r.a} tone={tone} align="center" />
      <StatCell value={r.pts} tone={tone} align="center" />
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
    />
  )
}

/* ----------------------- 컨트롤 (좌측 정렬) ---------------------- */
function ControlsLeft({ apDateKey, setApDateKey, dateOptions = [], showAll, setShowAll }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={apDateKey}
        onChange={(e) => setApDateKey(e.target.value)}
        className="rounded border border-stone-300 bg-white px-2.5 py-1.5 text-sm"
        title="토탈 또는 날짜별 보기"
      >
        {dateOptions.map(v => (
          <option key={v} value={v}>
            {v === 'all' ? '모든 매치' : v}
          </option>
        ))}
      </select>
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
            {ApOptions.map(o => {
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
            {DraftOptions.map(o => {
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
function AttackPointsTable({ rows, showAll, onToggle, controls, rankBy = 'pts', headHi, colHi, onRequestTab, apDateKey, initialBaselineRanks = null }) {
  const data = showAll ? rows : rows.slice(0, 5)

  // Baseline ranks for "모든 매치" only. We keep the first seen snapshot
  // and compare against it when ranks change after new matches are recorded.
  const [baselineRanks, setBaselineRanks] = useState({})
  const baselineKey = `ap_baselineRanks_${rankBy}_v1`

  // Load baseline on mount or when rankBy/initial seed changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) {
        setBaselineRanks(JSON.parse(saved) || {})
      } else if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        // Seed from previous match-day snapshot to make arrows visible immediately
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        setBaselineRanks(initialBaselineRanks)
      } else {
        setBaselineRanks({})
      }
    } catch {
      setBaselineRanks({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankBy, initialBaselineRanks, apDateKey])

  // Initialize baseline IF missing and viewing 전체(모든 매치)
  useEffect(() => {
    if (apDateKey !== 'all') return
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) return // Baseline already exists; keep it
      // Create a baseline from current rows (first visit) and do not show arrows this time
      const mapping = {}
      rows.forEach(r => { mapping[String(r.id || r.name)] = r.rank })
      if (Object.keys(mapping).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(mapping))
        setBaselineRanks(mapping)
      }
    } catch {}
  }, [apDateKey, rows, baselineKey])

  const deltaFor = (id, currentRank) => {
    // Only show rank changes for 전체 보기("모든 매치")
    if (apDateKey !== 'all') return null
    if (!baselineRanks || Object.keys(baselineRanks).length === 0) return null

    let prevRank = baselineRanks[String(id)]
    // If this player wasn't in the baseline (new entry), treat as coming from bottom+1
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
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full text-sm">
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

            {/* GP 헤더 클릭 -> Most Appearances(gp) 탭으로 */}
            <th className={`border-b px-2 py-1.5 text-center ${headHi('gp')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('gp')} className={headerBtnCls} title="Most Appearances 보기">
                GP
              </button>
            </th>

            {/* G 헤더 클릭 -> Top Scorer(g) 탭으로 */}
            <th className={`border-b px-2 py-1.5 text-center ${headHi('g')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('g')} className={headerBtnCls} title="Top Scorer 보기">
                G
              </button>
            </th>

            {/* A 헤더 클릭 -> Most Assists(a) 탭으로 */}
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

                <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
                  <div className={`flex items-center gap-2 min-w-0`}>
                    <div className="shrink-0">
                      <InitialAvatar 
                        id={r.id || r.name} 
                        name={r.name} 
                        size={20} 
                        badges={r.isGuest ? ['G'] : []}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className={`block font-medium truncate whitespace-nowrap`}>{r.name}</span>
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
function DuoTable({ rows, showAll, onToggle, controls, apDateKey, initialBaselineRanks = null }) {
  const [baselineRanks, setBaselineRanks] = useState({})
  const baselineKey = 'duo_count_v1'

  useEffect(() => {
    try {
      const saved = localStorage.getItem(baselineKey)
      if (saved) {
        setBaselineRanks(JSON.parse(saved) || {})
      } else if (apDateKey === 'all' && initialBaselineRanks && Object.keys(initialBaselineRanks).length > 0) {
        localStorage.setItem(baselineKey, JSON.stringify(initialBaselineRanks))
        setBaselineRanks(initialBaselineRanks)
      } else {
        setBaselineRanks({})
      }
    } catch { setBaselineRanks({}) }
  }, [apDateKey, initialBaselineRanks])

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
    { label: '순위', px: 1.5, align: 'center' },
    { label: '듀오 (Assist → Goal)', px: 2 },
    { label: '점수', px: 2, align: 'center' }
  ]

  const renderRow = (r, tone) => (
    <>
      <RankCell rank={r.rank} tone={tone} delta={deltaFor(r.id || r.name, r.rank)} />
      <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
        <div className="flex items-center gap-2">
          <InitialAvatar id={r.assistId} name={r.aName} size={20} badges={r.aIsGuest ? ['G'] : []} />
          <span className="font-medium">{r.aName}</span>
          <span className="mx-1 text-stone-400">→</span>
          <InitialAvatar id={r.goalId} name={r.gName} size={20} badges={r.gIsGuest ? ['G'] : []} />
          <span className="font-medium">{r.gName}</span>
        </div>
      </td>
      <StatCell value={r.count} tone={tone} align="center" />
    </>
  )

  return (
    <LeaderboardTable
      rows={rows}
      showAll={showAll}
      onToggle={onToggle}
      controls={controls}
      title="총 듀오"
      columns={columns}
      renderRow={renderRow}
    />
  )
}



/* ---------------------- Main Component --------------------- */
