// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import SavedMatchesList from '../components/SavedMatchesList'

/* -------------------------- 유틸 -------------------------- */
const toStr = (v) => (v === null || v === undefined) ? '' : String(v)
const isMember = (mem) => {
  const s = toStr(mem).trim().toLowerCase()
  return s === 'member' || s.includes('정회원')
}

// 날짜 키: MM/DD/YYYY
function extractDateKey(m) {
  const cand = m?.dateISO ?? m?.dateIso ?? m?.dateiso ?? m?.date ?? m?.dateStr ?? null
  if (!cand) return null
  let d
  if (typeof cand === 'number') d = new Date(cand)
  else d = new Date(String(cand))
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${y}`
}

// 참석자 파서
function extractAttendeeIds(m) {
  const candidates = [m?.snapshot, m?.attendeeIds, m?.attendees, m?.participants, m?.roster].filter(Boolean)
  let raw = []
  for (const c of candidates) { if (Array.isArray(c)) { raw = c; break } }
  if (!Array.isArray(raw)) raw = []
  return raw.flat().map((x) => {
    if (typeof x === 'object' && x !== null) {
      const cand = x.id ?? x.playerId ?? x.user_id ?? x.userId ?? x.pid ?? x.uid
      return toStr(cand)
    }
    return toStr(x)
  }).filter(Boolean)
}

// 스탯 파서
function extractStatsByPlayer(m) {
  const src = m?.stats ?? m?.records ?? m?.playerStats ?? m?.ga ?? m?.scoreboard ?? null
  const out = {}
  if (!src) return out
  if (!Array.isArray(src) && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const pid = toStr(k)
      if (!pid) continue
      out[pid] = { goals: Number(v?.goals || 0), assists: Number(v?.assists || 0) }
    }
    return out
  }
  if (Array.isArray(src)) {
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid)
      if (!pid) continue
      out[pid] = {
        goals: (out[pid]?.goals || 0) + Number(rec?.goals || 0),
        assists: (out[pid]?.assists || 0) + Number(rec?.assists || 0)
      }
    }
  }
  return out
}

// 공격포인트 집계(개인 누적)
function computeAttackRows(players = [], matches = []) {
  const index = new Map()
  const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
  for (const m of (matches || [])) {
    const attendedIds = new Set(extractAttendeeIds(m))
    const statsMap = extractStatsByPlayer(m)
    // 출전
    for (const pid of attendedIds) {
      const p = idToPlayer.get(pid)
      if (!p) continue
      const row = index.get(pid) || {
        id: pid, name: p.name, membership: p.membership || '',
        gp: 0, g: 0, a: 0
      }
      row.gp += 1
      index.set(pid, row)
    }
    // 골/어시
    for (const [pid, rec] of Object.entries(statsMap)) {
      const p = idToPlayer.get(pid)
      if (!p) continue
      const row = index.get(pid) || {
        id: pid, name: p.name, membership: p.membership || '',
        gp: 0, g: 0, a: 0
      }
      row.g += Number(rec?.goals || 0)
      row.a += Number(rec?.assists || 0)
      index.set(pid, row)
    }
  }
  return [...index.values()]
    .filter(r => r.gp > 0)
    .map(r => ({ ...r, pts: r.g + r.a, isGuest: !isMember(r.membership) }))
}

/* --------------------- 정렬/순위 유틸 --------------------- */
function sortComparator(rankBy) {
  if (rankBy === 'g') {
    return (a, b) => (b.g - a.g) || (b.a - a.a) || a.name.localeCompare(b.name)
  }
  if (rankBy === 'a') {
    return (a, b) => (b.a - a.a) || (b.g - a.g) || a.name.localeCompare(b.name)
  }
  return (a, b) => (b.pts - a.pts) || (b.g - a.g) || a.name.localeCompare(b.name)
}
function addRanks(rows, rankBy) {
  const sorted = [...rows].sort(sortComparator(rankBy))
  let lastRank = 0
  let lastKey = null
  return sorted.map((r, i) => {
    const keyVal = rankBy === 'g' ? r.g : (rankBy === 'a' ? r.a : r.pts)
    const rank = (i === 0) ? 1 : (keyVal === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = keyVal
    return { ...r, rank }
  })
}

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
export default function Dashboard({ players = [], matches = [], isAdmin, onUpdateMatch }) {
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

  // 탭: 종합(pts) / Top Scorer(g) / Most Assists(a)
  const [tab, setTab] = useState('pts')
  const rankedRows = useMemo(() => addRanks(baseRows, tab), [baseRows, tab])

  const [showAll, setShowAll] = useState(false)

  // 골/어시 동일 하이라이트 색 (메달 색과 비충돌)
  const colHi = (col) => {
    if (tab === 'g' && col === 'g') return 'bg-indigo-50/80 font-semibold'
    if (tab === 'a' && col === 'a') return 'bg-indigo-50/80 font-semibold'
    return ''
  }
  const headHi = (col) => {
    if (tab === 'g' && col === 'g') return 'bg-indigo-100/70 text-stone-900'
    if (tab === 'a' && col === 'a') return 'bg-indigo-100/70 text-stone-900'
    return ''
  }

  return (
    <div className="grid gap-6">
      {/* 리더보드 */}
      <Card title="리더보드">
        <LeaderboardTabs tab={tab} onChange={setTab} />

        <AttackPointsTable
          rows={rankedRows}
          showAll={showAll}
          onToggle={() => setShowAll(s => !s)}
          rankBy={tab}
          headHi={headHi}
          colHi={colHi}
          controls={
            <>
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
            </>
          }
        />
      </Card>

      {/* 매치 히스토리 (OVR 표시 숨김 가능) */}
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

/* ----------------------- 탭 컴포넌트 ---------------------- */
function LeaderboardTabs({ tab, onChange }) {
  const TabBtn = ({ id, label, sub }) => {
    const active = tab === id
    return (
      <button
        onClick={() => onChange(id)}
        aria-pressed={active}
        className={`w-full sm:w-auto rounded-xl px-3.5 py-2 text-sm font-medium border transition
          flex flex-col items-center justify-center text-center
          focus:outline-none focus:ring-2 focus:ring-stone-400/60
          ${active
            ? 'bg-stone-900 text-white border-stone-900'
            : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
          }`}
      >
        <span className="leading-tight">{label}</span>
        {sub && <span className={`text-[11px] ${active ? 'text-stone-200' : 'text-stone-500'}`}>{sub}</span>}
      </button>
    )
  }

  return (
    <div className="mb-3 flex flex-col sm:flex-row gap-2 w-full">
      <TabBtn id="pts" label="종합" sub="공격포인트 (G+A)" />
      <TabBtn id="g" label="Top Scorer" sub="골 순위" />
      <TabBtn id="a" label="Most Assists" sub="어시스트 순위" />
    </div>
  )
}

/* --------------- 공격포인트 테이블 컴포넌트 --------------- */
function AttackPointsTable({ rows, showAll, onToggle, controls, rankBy = 'pts', headHi, colHi }) {
  const data = showAll ? rows : rows.slice(0, 5)

  const [prevRanks, setPrevRanks] = useState({})
  useEffect(() => {
    try {
      const v2 = localStorage.getItem(`ap_prevRanks_${rankBy}_v1`)
      if (v2) setPrevRanks(JSON.parse(v2) || {})
    } catch {}
  }, [rankBy])
  useEffect(() => {
    try {
      const mapping = {}
      rows.forEach(r => { mapping[String(r.id || r.name)] = r.rank })
      localStorage.setItem(`ap_prevRanks_${rankBy}_v1`, JSON.stringify(mapping))
    } catch {}
  }, [rows, rankBy])

  const deltaFor = (id, currentRank) => {
    const prevRank = prevRanks[String(id)]
    if (!prevRank) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }

  const totalPlayers = rows.length

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full text-sm md:table-fixed">
        <colgroup className="hidden md:table-column-group">
          <col style={{ width: '48px' }} />
          <col />
          <col style={{ width: '56px' }} />
          <col style={{ width: '42px' }} />
          <col style={{ width: '42px' }} />
          <col style={{ width: '56px' }} />
        </colgroup>

        <thead>
          <tr>
            <th colSpan={6} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-600">
                  <span className="font-semibold mr-1"></span>
                  총 선수 {totalPlayers}명
                </div>
                <div className="flex items-center gap-2">
                  {controls}
                </div>
              </div>
            </th>
          </tr>
          <tr className="text-left text-[13px] text-stone-600">
            <th className="border-b px-1.5 py-1.5 md:px-3 md:py-2">순위</th>
            <th className="border-b px-2 py-1.5 md:px-3 md:py-2">선수</th>
            <th className="border-b px-2 py-1.5 md:px-3 md:py-2">출전</th>
            <th className={`border-b px-2 py-1.5 md:px-3 md:py-2 ${headHi('g')}`}>G</th>
            <th className={`border-b px-2 py-1.5 md:px-3 md:py-2 ${headHi('a')}`}>A</th>
            <th className="border-b px-2 py-1.5 md:px-3 md:py-2">PTS</th>
          </tr>
        </thead>

        <tbody>
          {data.map((r, idx) => {
            const rank = r.rank
            const tone = rankTone(rank)
            const delta = deltaFor(r.id || r.name, rank)
            return (
              <tr key={r.id || `${r.name}-${idx}`} className={`${tone.rowBg}`}>
                <td className={`border-b align-middle px-1.5 py-1.5 md:px-3 md:py-2 ${tone.cellBg}`}>
                  <div className="grid items-center" style={{ gridTemplateColumns: '16px 1fr 22px', columnGap: 4 }}>
                    <div className="flex items-center justify-center">
                      <Medal rank={rank} />
                    </div>
                    <div className="text-center tabular-nums">{rank}</div>
                    <div className="text-right hidden sm:block">
                      {delta && delta.diff !== 0 ? (
                        <span
                          className={`inline-block min-w-[20px] text-[11px] font-medium ${
                            delta.dir === 'up' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {delta.dir === 'up' ? '▲' : '▼'} {Math.abs(delta.diff)}
                        </span>
                      ) : (
                        <span className="inline-block min-w-[20px] text-[11px] text-transparent">0</span>
                      )}
                    </div>
                  </div>
                </td>

                <td className={`border-b px-2 py-1.5 md:px-3 md:py-2 ${tone.cellBg}`}>
                  <div className="grid items-center min-w-0" style={{ gridTemplateColumns: 'auto 1fr auto', columnGap: 6 }}>
                    <div className="shrink-0">
                      <InitialAvatar id={r.id || r.name} name={r.name} size={20} />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-medium truncate whitespace-nowrap">{r.name}</span>
                    </div>
                    {r.isGuest && (
                      <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">
                        G
                      </span>
                    )}
                  </div>
                </td>

                <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.gp}</td>
                <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg} ${colHi('g')}`}>{r.g}</td>
                <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg} ${colHi('a')}`}>{r.a}</td>
                <td className={`border-b px-2 py-1.5 font-semibold tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.pts}</td>
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

/* ---------------------- 보조 컴포넌트 --------------------- */
function Medal({ rank }) {
  if (rank === 1) return <span role="img" aria-label="gold" className="text-base">🥇</span>
  if (rank === 2) return <span role="img" aria-label="silver" className="text-base">🥈</span>
  if (rank === 3) return <span role="img" aria-label="bronze" className="text-base">🥉</span>
  return <span className="inline-block w-4 text-center text-stone-400">—</span>
}
function rankTone(rank){
  if (rank === 1) return { rowBg: 'bg-yellow-50', cellBg: 'bg-yellow-50' }
  if (rank === 2) return { rowBg: 'bg-gray-50',   cellBg: 'bg-gray-50' }
  if (rank === 3) return { rowBg: 'bg-orange-100',  cellBg: 'bg-orange-100' }
  return { rowBg: '', cellBg: '' }
}
