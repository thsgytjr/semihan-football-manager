// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Card from '../components/Card'
import InitialAvatar from '../components/InitialAvatar'
import SavedMatchesList from '../components/SavedMatchesList'

/* --------------------------------------------------------
   MOBILE-FIRST LEADERBOARD (Compact Segmented Tabs)
   - Tabs collapse into scrollable chips on small screens
   - G/A/출전 헤더 클릭 시 해당 탭으로 전환
   - Most Appearances(gp) 탭 추가
   - 드롭다운(날짜) + 전체보기/접기 왼쪽 정렬
   - OVR 요소는 히스토리에서 숨김
--------------------------------------------------------- */

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
      out[pid] = { goals: Number(v?.goals || 0), assists: Number(v?.assists || 0), events: Array.isArray(v?.events) ? v.events.slice() : [] }
    }
    return out
  }
  if (Array.isArray(src)) {
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid)
      if (!pid) continue
      const type = (rec?.type || (rec?.goal ? 'goal' : rec?.assist ? 'assist' : '')).toString().toLowerCase()
      const date = rec?.dateISO || rec?.date || rec?.time || rec?.ts || null
      const isGoal = /goal/i.test(type)
      const isAssist = /assist/i.test(type)
      out[pid] = out[pid] || { goals: 0, assists: 0, events: [] }
      if (isGoal) {
        out[pid].goals = (out[pid].goals || 0) + Number(rec?.goals || 1)
        out[pid].events.push({ type: 'goal', date })
      } else if (isAssist) {
        out[pid].assists = (out[pid].assists || 0) + Number(rec?.assists || 1)
        out[pid].events.push({ type: 'assist', date })
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

/* --------------------- 듀오 유틸 --------------------- */
function parseLooseDate(s) {
  if (!s) return NaN
  if (typeof s === 'number') return Number.isFinite(s) ? s : NaN
  const inBracket = /\[([^\]]+)\]/.exec(String(s))
  const cand = inBracket ? inBracket[1] : String(s)
  const t = Date.parse(cand)
  return Number.isNaN(t) ? NaN : t
}
function inferTypeFromRaw(raw) {
  const s = (raw || '').toString()
  if (/goal/i.test(s)) return 'goal'
  if (/assist/i.test(s)) return 'assist'
  if (/[⚽️]/.test(s)) return 'goal'
  if (/[🤟]/.test(s)) return 'assist'
  return null
}
function extractTimelineEventsFromMatch(m) {
  const stats = extractStatsByPlayer(m)
  const out = []
  let seq = 0
  for (const [pid, rec] of Object.entries(stats)) {
    const arr = Array.isArray(rec?.events) ? rec.events : []
    for (const e of arr) {
      let type = e?.type
      if (!type) type = inferTypeFromRaw(e?.date)
      type = type === 'goals' ? 'goal' : (type === 'assists' ? 'assist' : type)
      if (type !== 'goal' && type !== 'assist') continue
      const ts = parseLooseDate(e?.date)
      out.push({ pid: toStr(pid), type, ts: Number.isNaN(ts) ? 0 : ts, rawIdx: seq++, raw: e })
    }
  }
  const extraText = m?.log || m?.events || m?.notes || ''
  if (typeof extraText === 'string' && extraText.trim()) {
    const lines = extraText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    for (const line of lines) {
      const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g)).map(mm => mm[1])
      if (bracketMatches.length >= 2) {
        const dateStr = bracketMatches[0]
        const name = bracketMatches[bracketMatches.length - 1]
        const between = line.replace(/\[([^\]]+)\]/g, '¤').split('¤')[1] || ''
        let type = null
        if (/\bgoal\b/i.test(between) || /[⚽️]/.test(line)) type = 'goal'
        else if (/\bassist\b/i.test(between) || /[👉☝👆]/.test(line)) type = 'assist'
        const ts = parseLooseDate(dateStr)
        if (type && name) {
          out.push({ pid: `__name__:${name}`, type, ts: Number.isNaN(ts) ? 0 : ts, rawIdx: seq++, raw: line })
        }
      }
    }
  }
  return out
}
function computeDuoRows(players = [], matches = []) {
  const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
  const nameToId = new Map(players.map(p => [toStr(p.name).trim().toLowerCase(), toStr(p.id)]))
  let evts = []
  for (const m of (matches || [])) {
    evts = evts.concat(extractTimelineEventsFromMatch(m))
  }
  evts.forEach(e => {
    if (e.pid?.startsWith('__name__:')) {
      const name = e.pid.slice('__name__:'.length).trim().toLowerCase()
      const pid = nameToId.get(name)
      if (pid) e.pid = pid
    }
  })
  evts = evts.filter(e => idToPlayer.has(toStr(e.pid)))
  const typePri = (t) => (t === 'goal' ? 0 : 1)
  evts.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts
    if (typePri(a.type) !== typePri(b.type)) return typePri(a.type) - typePri(b.type)
    return a.rawIdx - b.rawIdx
  })
  const unmatchedGoals = []
  const duoCount = new Map()
  for (const e of evts) {
    if (e.type === 'goal') {
      unmatchedGoals.push(e)
    } else if (e.type === 'assist') {
      while (unmatchedGoals.length > 0) {
        const g = unmatchedGoals.pop()
        if (toStr(g.pid) === toStr(e.pid)) continue
        const key = `${toStr(e.pid)}|${toStr(g.pid)}`
        duoCount.set(key, (duoCount.get(key) || 0) + 1)
        break
      }
    }
  }
  const rows = []
  for (const [key, cnt] of duoCount.entries()) {
    const [assistId, goalId] = key.split('|')
    const aP = idToPlayer.get(assistId)
    const gP = idToPlayer.get(goalId)
    if (!aP || !gP) continue
    rows.push({
      id: key,
      assistId,
      goalId,
      duoLabel: `${aP.name} → ${gP.name}`,
      aName: aP.name,
      gName: gP.name,
      count: cnt
    })
  }
  rows.sort((x, y) => (y.count - x.count) || x.duoLabel.localeCompare(y.duoLabel))
  let lastRank = 0
  let lastKey = null
  const ranked = rows.map((r, i) => {
    const keyVal = r.count
    const rank = (i === 0) ? 1 : (keyVal === lastKey ? lastRank : i + 1)
    lastRank = rank
    lastKey = keyVal
    return { ...r, rank }
  })
  return ranked
}

/* --------------------- 정렬/순위 유틸 --------------------- */
function sortComparator(rankBy) {
  if (rankBy === 'g') {
    return (a, b) => (b.g - a.g) || (b.a - a.a) || a.name.localeCompare(b.name)
  }
  if (rankBy === 'a') {
    return (a, b) => (b.a - a.a) || (b.g - a.g) || a.name.localeCompare(b.name)
  }
  if (rankBy === 'gp') {
    return (a, b) => (b.gp - a.gp) || (b.g - a.g) || (b.a - a.a) || a.name.localeCompare(b.name)
  }
  return (a, b) => (b.pts - a.pts) || (b.g - a.g) || a.name.localeCompare(b.name)
}
function addRanks(rows, rankBy) {
  const sorted = [...rows].sort(sortComparator(rankBy))
  let lastRank = 0
  let lastKey = null
  return sorted.map((r, i) => {
    const keyVal =
      rankBy === 'g' ? r.g :
      rankBy === 'a' ? r.a :
      rankBy === 'gp' ? r.gp :
      r.pts
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

  // Draft 전용: 선수별 승 수 집계 (드래프트 매치만)
  const draftWinRows = useMemo(() => computeDraftWinsRows(players, filteredMatches), [players, filteredMatches])

  // 탭: 종합(pts) / Top Scorer(g) / Most Assists(a) / Most Appearances(gp) / 환상의 듀오(duo) / Draft(draft)
  const [tab, setTab] = useState('pts')
  const rankedRows = useMemo(() => addRanks(baseRows, tab), [baseRows, tab])

  // 듀오 rows
  const duoRows = useMemo(() => computeDuoRows(players, filteredMatches), [players, filteredMatches])

  const [showAll, setShowAll] = useState(false)

  const colHi = (col) => {
    if (tab === 'g' && col === 'g') return 'bg-indigo-50/80 font-semibold'
    if (tab === 'a' && col === 'a') return 'bg-indigo-50/80 font-semibold'
    if (tab === 'gp' && col === 'gp') return 'bg-indigo-50/80 font-semibold'
    return ''
  }
  const headHi = (col) => {
    if (tab === 'g' && col === 'g') return 'bg-indigo-100/70 text-stone-900'
    if (tab === 'a' && col === 'a') return 'bg-indigo-100/70 text-stone-900'
    if (tab === 'gp' && col === 'gp') return 'bg-indigo-100/70 text-stone-900'
    return ''
  }

  return (
    <div className="grid gap-4 sm:gap-6">
      {/* 리더보드 */}
      <Card title="리더보드">
        {/* 모바일-우선: 콤팩트 세그먼트 탭 (가로 스크롤 + 자동 줄바꿈) */}
        <LeaderboardTabsMobile tab={tab} onChange={(id)=>{ setTab(id); setShowAll(false) }} />

        {tab === 'duo' ? (
          <DuoTable
            rows={duoRows}
            showAll={showAll}
            onToggle={() => setShowAll(s => !s)}
            controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
          />
        ) : tab === 'draft' ? (
          <DraftWinsTable
            rows={draftWinRows}
            showAll={showAll}
            onToggle={() => setShowAll(s => !s)}
            controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
          />
        ) : (
          <AttackPointsTable
            rows={rankedRows}
            showAll={showAll}
            onToggle={() => setShowAll(s => !s)}
            rankBy={tab}
            headHi={headHi}
            colHi={colHi}
            onRequestTab={(id)=>{ setTab(id); setShowAll(false) }}
            controls={<ControlsLeft apDateKey={apDateKey} setApDateKey={setApDateKey} dateOptions={dateOptions} showAll={showAll} setShowAll={setShowAll} />}
          />
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

/* ------------------- Draft 승리 집계 유틸 ------------------- */
function coerceQuarterScores(m) {
  if (!m) return null
  if (m?.draft && Array.isArray(m.draft.quarterScores)) return m.draft.quarterScores
  if (Array.isArray(m.quarterScores) && m.quarterScores.length) {
    if (Array.isArray(m.quarterScores[0])) return m.quarterScores
    if (m.quarterScores[0] && Array.isArray(m.quarterScores[0].teamScores)) return m.quarterScores.map(t => t.teamScores)
  }
  if (Array.isArray(m.scores) && Array.isArray(m.snapshot) && m.scores.length === m.snapshot.length) {
    return m.snapshot.map((_, i) => [m.scores[i]])
  }
  return null
}

function isDraftMatch(m){
  return (m?.selectionMode === 'draft') || !!m?.draft || !!m?.draftMode || Array.isArray(m?.captains) || Array.isArray(m?.captainIds)
}

function winnerIndexFromQuarterScores(qs){
  if (!Array.isArray(qs) || qs.length < 2) return -1
  const teamLen = qs.length
  const maxQ = Math.max(0, ...qs.map(a => Array.isArray(a) ? a.length : 0))
  const wins = Array.from({length: teamLen}, () => 0)
  const totals = qs.map(arr => (Array.isArray(arr) ? arr.reduce((a,b)=>a+Number(b||0),0) : 0))
  for (let qi=0; qi<maxQ; qi++){
    const scores = qs.map(arr => Array.isArray(arr) ? Number(arr[qi] || 0) : 0)
    const mx = Math.max(...scores)
    const winners = scores.map((v,i)=>v===mx?i:-1).filter(i=>i>=0)
    if (winners.length === 1) wins[winners[0]] += 1
  }
  const maxWins = Math.max(...wins)
  const tied = wins.map((w,i)=>w===maxWins?i:-1).filter(i=>i>=0)
  if (tied.length === 1) return tied[0]
  // tie-breaker by total goals
  const maxTotal = Math.max(...tied.map(i=>totals[i]))
  const final = tied.filter(i=>totals[i]===maxTotal)
  return final.length === 1 ? final[0] : -1
}

function computeDraftWinsRows(players=[], matches=[]) {
  const idToPlayer = new Map(players.map(p=>[toStr(p.id), p]))
  const rows = new Map()
  for (const m of matches) {
    if (!isDraftMatch(m)) continue
    const qs = coerceQuarterScores(m)
    const winnerIdx = winnerIndexFromQuarterScores(qs)
    if (winnerIdx < 0) continue
    const snap = Array.isArray(m?.snapshot) ? m.snapshot : null
    if (!snap || !Array.isArray(snap[winnerIdx])) continue
    for (const pidRaw of snap[winnerIdx]){
      const pid = toStr(pidRaw?.id ?? pidRaw)
      if (!pid) continue
      const p = idToPlayer.get(pid)
      const cur = rows.get(pid) || { id: pid, name: p?.name || pid, wins: 0 }
      cur.wins += 1
      rows.set(pid, cur)
    }
  }
  const out = Array.from(rows.values()).sort((a,b)=> (b.wins - a.wins) || a.name.localeCompare(b.name))
  // add rank
  let lastRank=0, lastKey=null
  return out.map((r,i)=>{
    const key=r.wins
    const rank = (i===0)?1:(key===lastKey?lastRank:i+1)
    lastRank=rank; lastKey=key
    return { ...r, rank }
  })
}

/* ---------------- Draft 승리 테이블 ---------------- */
function DraftWinsTable({ rows, showAll, onToggle, controls }){
  const data = showAll ? rows : rows.slice(0,5)
  const totalPlayers = rows.length
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th colSpan={3} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-600">Draft 승리 선수 <span className="font-semibold">{totalPlayers}</span>명</div>
                <div className="ml-auto">{controls}</div>
              </div>
            </th>
          </tr>
          <tr className="text-left text-[13px] text-stone-600">
            <th className="border-b px-1.5 py-1.5">순위</th>
            <th className="border-b px-2 py-1.5">선수</th>
            <th className="border-b px-2 py-1.5">Wins</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, idx) => {
            const tone = rankTone(r.rank)
            return (
              <tr key={r.id || idx} className={`${tone.rowBg}`}>
                <td className={`border-b align-middle px-1.5 py-1.5 ${tone.cellBg}`}>
                  <div className="flex items-center gap-2">
                    <Medal rank={r.rank} />
                    <span className="tabular-nums">{r.rank}</span>
                  </div>
                </td>
                <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
                  <div className="flex items-center gap-2">
                    <InitialAvatar id={r.id} name={r.name} size={20} />
                    <span className="font-medium truncate">{r.name}</span>
                  </div>
                </td>
                <td className={`border-b px-2 py-1.5 font-semibold tabular-nums ${tone.cellBg}`}>{r.wins}</td>
              </tr>
            )
          })}
          {data.length===0 && (
            <tr>
              <td className="px-3 py-4 text-sm text-stone-500" colSpan={3}>표시할 기록이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-end p-2">
        <button
          onClick={() => onToggle && onToggle()}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
        >{showAll ? '접기' : '전체 보기'}</button>
      </div>
    </div>
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
function LeaderboardTabsMobile({ tab, onChange }) {
  const tabs = [
    { id: 'pts', label: '종합', short: '종합', icon: '🏆' },
    { id: 'g',   label: 'Top Scorer', short: '득점', icon: '⚽️' },
    { id: 'a',   label: 'Most Assists', short: '어시', icon: '🎯' },
    { id: 'gp',  label: 'Most Appearances', short: '출전', icon: '👟' },
    { id: 'duo', label: '환상의 듀오', short: '듀오', icon: '🤝' },
    { id: 'draft', label: 'Draft 리더보드', short: 'Draft', icon: '👑' },
  ]

  return (
    <div className="mb-2">
      {/* 상단: 현재 탭 요약 (모바일에서 높이 절약) */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-stone-700 font-medium">
          {tabs.find(t => t.id === tab)?.label}
        </div>
      </div>

      {/* 하단: 스크롤 가능한 칩 버튼들 */}
      <div className="relative">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-2 px-2">
          {tabs.map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                aria-pressed={active}
                className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] border transition
                  ${active ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'}`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                <span className="leading-none">{t.short}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* --------------- 공격포인트 테이블 --------------- */
function AttackPointsTable({ rows, showAll, onToggle, controls, rankBy = 'pts', headHi, colHi, onRequestTab }) {
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
          <tr className="text-left text-[13px] text-stone-600">
            <th className="border-b px-1.5 py-1.5">순위</th>
            <th className="border-b px-2 py-1.5">선수</th>

            {/* 출전 헤더 클릭 -> Most Appearances(gp) 탭으로 */}
            <th className={`border-b px-2 py-1.5 ${headHi('gp')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('gp')} className={headerBtnCls} title="Most Appearances 보기">
                출전
              </button>
            </th>

            {/* G 헤더 클릭 -> Top Scorer(g) 탭으로 */}
            <th className={`border-b px-2 py-1.5 ${headHi('g')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('g')} className={headerBtnCls} title="Top Scorer 보기">
                G
              </button>
            </th>

            {/* A 헤더 클릭 -> Most Assists(a) 탭으로 */}
            <th className={`border-b px-2 py-1.5 ${headHi('a')}`} scope="col">
              <button type="button" onClick={() => onRequestTab && onRequestTab('a')} className={headerBtnCls} title="Most Assists 보기">
                A
              </button>
            </th>

            <th className="border-b px-2 py-1.5" scope="col">
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
                    <div className="text-right hidden sm:block">
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

                <td className={`border-b px-2 py-1.5 tabular-nums ${tone.cellBg} ${colHi('gp')}`}>{r.gp}</td>
                <td className={`border-b px-2 py-1.5 tabular-nums ${tone.cellBg} ${colHi('g')}`}>{r.g}</td>
                <td className={`border-b px-2 py-1.5 tabular-nums ${tone.cellBg} ${colHi('a')}`}>{r.a}</td>
                <td className={`border-b px-2 py-1.5 font-semibold tabular-nums ${tone.cellBg}`}>{r.pts}</td>
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
function DuoTable({ rows, showAll, onToggle, controls }) {
  const data = showAll ? rows : rows.slice(0, 5)
  const totalDuos = rows.length

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th colSpan={3} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-600">총 듀오 <span className="font-semibold">{totalDuos}</span>쌍</div>
                <div className="ml-auto">{controls}</div>
              </div>
            </th>
          </tr>
          <tr className="text-left text-[13px] text-stone-600">
            <th className="border-b px-1.5 py-1.5">순위</th>
            <th className="border-b px-2 py-1.5">듀오 (Assist → Goal)</th>
            <th className="border-b px-2 py-1.5">점수</th>
          </tr>
        </thead>

        <tbody>
          {data.map((r, idx) => {
            const tone = rankTone(r.rank)
            return (
              <tr key={r.id || idx} className={`${tone.rowBg}`}>
                <td className={`border-b align-middle px-1.5 py-1.5 ${tone.cellBg}`}>
                  <div className="flex items-center gap-2">
                    <Medal rank={r.rank} />
                    <span className="tabular-nums">{r.rank}</span>
                  </div>
                </td>
                <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
                  <div className="flex items-center gap-2">
                    <InitialAvatar id={r.assistId} name={r.aName} size={20} />
                    <span className="font-medium">{r.aName}</span>
                    <span className="mx-1 text-stone-400">→</span>
                    <InitialAvatar id={r.goalId} name={r.gName} size={20} />
                    <span className="font-medium">{r.gName}</span>
                  </div>
                </td>
                <td className={`border-b px-2 py-1.5 font-semibold tabular-nums ${tone.cellBg}`}>{r.count}</td>
              </tr>
            )
          })}
          {data.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-sm text-stone-500" colSpan={3}>
                표시할 듀오가 없습니다.
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
