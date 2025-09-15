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

// 날짜 키: YYYY-MM-DD
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

// 공격포인트 집계
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
    .sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name))
}

/* --------------------- 에러 바운더리 ---------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) { /* 필요시 로깅 */ }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <div className="text-sm text-stone-500">문제가 발생했어요.</div>
    }
    return this.props.children
  }
}

/* -------------------------- 메인 -------------------------- */
export default function Dashboard({ players = [], matches = [], isAdmin, onUpdateMatch }) {
  // 날짜 드롭다운: 'all' = 토탈
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
  const totalsRows = useMemo(() => computeAttackRows(players, filteredMatches), [players, filteredMatches])
  const [showAllTotals, setShowAllTotals] = useState(false)

  return (
    <div className="grid gap-6">
      {/* 공격포인트 */}
      <Card title="공격포인트">
        <AttackPointsTable
          rows={totalsRows}
          showAll={showAllTotals}
          onToggle={() => setShowAllTotals(s => !s)}
          /* 컨트롤 UI (토탈 드롭다운 + 전체 보기) */
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
                onClick={() => setShowAllTotals(s => !s)}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
                title={showAllTotals ? '접기' : '전체 보기'}
              >
                {showAllTotals ? '접기' : '전체 보기'}
              </button>
            </>
          }
        />
      </Card>

      {/* 매치 히스토리 (CSS로만 OVR 숨김) */}
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

        {/* 방어적 CSS: OVR 관련 셀렉터 숨김 (React 트리 무손상) */}
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

/* --------------- 공격포인트 테이블 컴포넌트 --------------- */
function AttackPointsTable({ rows, showAll, onToggle, controls }) {
  // 공동순위 계산
  const rankedAll = React.useMemo(() => {
    let lastRank = 0
    let lastPts = null
    return rows.map((r, i) => {
      const rank = (i === 0) ? 1 : (r.pts === lastPts ? lastRank : i + 1)
      lastRank = rank
      lastPts = r.pts
      return { ...r, rank }
    })
  }, [rows])

  const data = showAll ? rankedAll : rankedAll.slice(0, 5)

  // 이전 순위 저장(로컬)
  const [prevRanks, setPrevRanks] = useState({})
  useEffect(() => {
    try {
      const v2 = localStorage.getItem('ap_prevRanks_v2')
      if (v2) setPrevRanks(JSON.parse(v2) || {})
    } catch {}
  }, [])
  useEffect(() => {
    try {
      const mapping = {}
      rankedAll.forEach(r => { mapping[String(r.id || r.name)] = r.rank })
      localStorage.setItem('ap_prevRanks_v2', JSON.stringify(mapping))
    } catch {}
  }, [rankedAll])

  const deltaFor = (id, currentRank) => {
    const prevRank = prevRanks[String(id)]
    if (!prevRank) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }

  // 합계(같은 라인에 표시)
  const totalPlayers = rows.length
  const totalPts = rows.reduce((a, r) => a + (r.g + r.a), 0)

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

        {/* 헤더 1행: 왼쪽 합계, 오른쪽 컨트롤(같은 라인) */}
        <thead>
          <tr>
            <th colSpan={6} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-500">
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
            <th className="border-b px-2 py-1.5 md:px-3 md:py-2">G</th>
            <th className="border-b px-2 py-1.5 md:px-3 md:py-2">A</th>
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
                      <span className="ml-1 shrink-0 rounded-full bg-stone-900 text-white text-[10px] px-2 py-[2px]">
                        게스트
                      </span>
                    )}
                  </div>
                </td>

                <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.gp}</td>
                <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.g}</td>
                <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.a}</td>
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
