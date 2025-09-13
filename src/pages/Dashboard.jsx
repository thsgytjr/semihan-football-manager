// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Card from '../components/Card'
import Stat from '../components/Stat'
import InitialAvatar from '../components/InitialAvatar'
import { hydrateMatch } from '../lib/match'
import SavedMatchesList from '../components/SavedMatchesList'
import { formatMatchLabel } from '../lib/matchLabel'

const toStr = (v) => (v === null || v === undefined) ? '' : String(v)
const isMember = (mem) => {
  const s = toStr(mem).trim().toLowerCase()
  return s === 'member' || s.includes('정회원')
}

// 참석자 파서 (여러 필드명 대응)
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

// 스탯 파서 (맵/배열 모두 지원)
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

export default function Dashboard({ totals, players = [], matches = [], isAdmin, onUpdateMatch }) {
  const [editingMatchId, setEditingMatchId] = useState(matches?.[0]?.id || null)

  useEffect(() => {
    if (!matches || matches.length === 0) { setEditingMatchId(null); return }
    const exists = matches.some(m => m.id === editingMatchId)
    if (!editingMatchId || !exists) setEditingMatchId(matches[0].id)
  }, [matches])

  // 공격포인트 집계
  const { totalsRows, debugInfo } = useMemo(() => {
    const index = new Map()
    const idToPlayer = new Map(players.map(p => [toStr(p.id), p]))
    let matchCountWithAttendees = 0
    let matchCountWithStats = 0

    for (const m of (matches || [])) {
      const attendedIds = new Set(extractAttendeeIds(m))
      if (attendedIds.size > 0) matchCountWithAttendees++
      const statsMap = extractStatsByPlayer(m)
      if (Object.keys(statsMap).length > 0) matchCountWithStats++

      // 출전(GP)
      for (const pid of attendedIds) {
        const p = idToPlayer.get(pid)
        if (!p) continue
        const row = index.get(pid) || {
          id: pid, name: p.name, pos: p.position || p.pos, membership: p.membership || '',
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
          id: pid, name: p.name, pos: p.position || p.pos, membership: p.membership || '',
          gp: 0, g: 0, a: 0
        }
        row.g += Number(rec?.goals || 0)
        row.a += Number(rec?.assists || 0)
        index.set(pid, row)
      }
    }
    const rows = [...index.values()]
      .filter(r => r.gp > 0)  // 출전이 0이면 제외
      .map(r => ({
        ...r,
        pts: r.g + r.a,
        isGuest: !isMember(r.membership)
      }))
      // 정렬: PTS desc, G desc, 이름 asc
      .sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name))

    const debug = {
      playersCount: players.length,
      matchesCount: matches.length,
      matchCountWithAttendees,
      matchCountWithStats,
      totalsRowsCount: rows.length,
      totalsPtsSum: rows.reduce((s, r) => s + r.pts, 0)
    }
    return { totalsRows: rows, debugInfo: debug }
  }, [players, matches])

  const editingMatch = useMemo(
    () => (matches || []).find(m => m.id === editingMatchId) || null,
    [matches, editingMatchId]
  )

  // 경기별 골/어시 드래프트 (Admin)
  const [draft, setDraft] = useState({})
  useEffect(() => {
    if (!editingMatch) { setDraft({}); return }
    const src = extractStatsByPlayer(editingMatch)
    const next = {}
    const ids = new Set(extractAttendeeIds(editingMatch))
    for (const p of players) {
      if (!ids.has(toStr(p.id))) continue
      const rec = src?.[toStr(p.id)] || {}
      next[p.id] = { goals: Number(rec.goals || 0), assists: Number(rec.assists || 0) }
    }
    setDraft(next)
  }, [editingMatchId, editingMatch, players])

  const setVal = (pid, key, v) =>
    setDraft(prev => ({ ...prev, [pid]: { ...prev[pid], [key]: Math.max(0, v || 0) } }))

  const saveStats = () => {
    if (!editingMatch) return
    onUpdateMatch?.(editingMatch.id, { stats: draft })
  }

  const totalPlayers = players.length
  const totalMatches = (matches || []).length
  const [showAllTotals, setShowAllTotals] = useState(false)

  return (
    <div className="grid gap-6">
      {/* 1) 요약 */}
      <Card title="요약">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="총 선수" value={`${totalPlayers}명`} />
          <Stat label="저장된 경기" value={`${totalMatches}회`} />
          <Stat label="공격포인트 합계(골+어시)" value={totalsRows.reduce((a,r)=>a+r.pts,0)} />
          <Stat label="기록 보유 선수 수" value={totalsRows.filter(r=>r.pts>0 || r.gp>0).length} />
        </div>
      </Card>

      {/* 2) 공격포인트 (Top 5 + 확장) */}
      <Card title={`공격포인트${showAllTotals ? '' : ' (Top 5)'}`}>
        <AttackPointsTable
          rows={totalsRows}
          showAll={showAllTotals}
          onToggle={() => setShowAllTotals(s=>!s)}
        />
      </Card>

      {/* 3) 매치 히스토리 */}
      <Card title="매치 히스토리">
        <SavedMatchesList
          matches={matches}
          players={players}
          isAdmin={isAdmin}
          onUpdateMatch={onUpdateMatch}
          showTeamOVRForAdmin={true}
        />
      </Card>

      {/* (Admin 전용) 경기별 골/어시 입력 */}
      {isAdmin && (
        <FocusComposer
          matches={matches}
          players={players}
          editingMatchId={editingMatchId}
          setEditingMatchId={setEditingMatchId}
          editingMatch={editingMatch}
          draft={draft}
          setDraft={setDraft}
          onSave={saveStats}
          setVal={setVal}
        />
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
   공격포인트 테이블
   - 동률 순위: 같은 PTS면 같은 순위, 다음 순위는 점프 (예: 1,2,2,4)
   - 모바일도 같은 테이블 뷰 (card 제거)
   - table-fixed + 좁은 컬럼 폭으로 모바일에서 넓어지지 않게
   - 1~3위: 행 전체 파스텔 배경 (금/은/동)
   - 순위 변동: ▲▼ + 변동 폭 (localStorage 비교)
────────────────────────────────────────────────────────── */
function AttackPointsTable({ rows, showAll, onToggle }) {
  // 1) 전 선수 목록 기준으로 "동률 순위"를 먼저 계산
  const rankedRows = useMemo(() => {
    const out = []
    let lastRank = 0
    let lastPts = null
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rank = (i === 0) ? 1 : (r.pts === lastPts ? lastRank : i + 1)
      out.push({ ...r, rank })
      lastRank = rank
      lastPts = r.pts
    }
    return out
  }, [rows])

  // 2) 표시 데이터 (Top 5면 자르되, 순위는 전역 순위 유지)
  const data = showAll ? rankedRows : rankedRows.slice(0, 5)

  // 순위 변동 비교 (기존 로직 유지: order 기반)
  const [prevOrder, setPrevOrder] = useState([])
  useEffect(() => {
    try {
      const s = localStorage.getItem('ap_prevOrder_v1')
      if (s) setPrevOrder(JSON.parse(s))
    } catch {}
  }, [])
  useEffect(() => {
    try {
      const current = rows.map(r => String(r.id || r.name))
      localStorage.setItem('ap_prevOrder_v1', JSON.stringify(current))
    } catch {}
  }, [rows])

  const deltaFor = (id, currentRank) => {
    const prevRank = (prevOrder.indexOf(String(id)) + 1) || null
    if (!prevRank) return null
    const diff = prevRank - currentRank
    if (diff === 0) return { diff: 0, dir: 'same' }
    return { diff, dir: diff > 0 ? 'up' : 'down' }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-stone-500">
        총 선수 {rows.length}명 · 총 PTS {rows.reduce((a, r) => a + (r.g + r.a), 0)}
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200">
        {/* 모바일에선 table-auto, md 이상에서만 table-fixed */}
        <table className="w-full text-sm md:table-fixed">
          {/* colgroup은 md 이상에서만 적용 (모바일에서 폭 강제 X) */}
          <colgroup className="hidden md:table-column-group">
            <col style={{ width: '56px' }} />  {/* 순위: 살짝 줄임 */}
            <col />                              {/* 선수: 가변 */}
            <col style={{ width: '60px' }} />   {/* 포지션 */}
            <col style={{ width: '48px' }} />   {/* 출전 */}
            <col style={{ width: '42px' }} />   {/* G */}
            <col style={{ width: '42px' }} />   {/* A */}
            <col style={{ width: '56px' }} />   {/* PTS */}
          </colgroup>

          <thead>
            <tr className="text-left text-[13px] text-stone-600">
              <th className="border-b px-2 py-1.5 md:px-3 md:py-2">순위</th>
              <th className="border-b px-2 py-1.5 md:px-3 md:py-2">선수</th>
              <th className="border-b px-2 py-1.5 md:px-3 md:py-2">포지션</th>
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
                  {/* 순위 */}
                  <td className={`border-b align-middle px-2 py-1.5 md:px-3 md:py-2 ${tone.cellBg}`}>
                    <div
                      className="grid items-center"
                      style={{ gridTemplateColumns: '20px 1fr 28px', columnGap: 6 }}
                    >
                      <div className="flex items-center justify-center">
                        <Medal rank={rank} />
                      </div>
                      <div className="text-center tabular-nums">{rank}</div>
                      <div className="text-right">
                        {delta && delta.diff !== 0 ? (
                          <span
                            className={`inline-block min-w-[24px] text-[11px] font-medium ${
                              delta.dir === 'up' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {delta.dir === 'up' ? '▲' : '▼'} {Math.abs(delta.diff)}
                          </span>
                        ) : (
                          <span className="inline-block min-w-[24px] text-[11px] text-transparent">0</span>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* 선수 (모바일 이름 찌그러짐 방지 핵심) */}
                  <td className={`border-b px-2 py-1.5 md:px-3 md:py-2 ${tone.cellBg}`}>
                    <div
                      className="grid items-center min-w-0"
                      style={{ gridTemplateColumns: 'auto 1fr auto', columnGap: 8 }}
                    >
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

                  <td className={`border-b px-2 py-1.5 text-stone-700 md:px-3 md:py-2 ${tone.cellBg}`}>{r.pos || '-'}</td>
                  <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.gp}</td>
                  <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.g}</td>
                  <td className={`border-b px-2 py-1.5 tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.a}</td>
                  <td className={`border-b px-2 py-1.5 font-semibold tabular-nums md:px-3 md:py-2 ${tone.cellBg}`}>{r.pts}</td>
                </tr>
              )
            })}
            {data.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-sm text-stone-500" colSpan={7}>
                  표시할 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onToggle}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          {showAll ? '접기' : '전체 보기'}
        </button>
      </div>
    </div>
  )
}

function Medal({ rank }) {
  if (rank === 1) return <span role="img" aria-label="gold" className="text-base">🥇</span>
  if (rank === 2) return <span role="img" aria-label="silver" className="text-base">🥈</span>
  if (rank === 3) return <span role="img" aria-label="bronze" className="text-base">🥉</span>
  return <span className="inline-block w-4 text-center text-stone-400">—</span>
}

function rankTone(rank){
  // 1~3위: 행 전체 동일 파스텔 배경
  if (rank === 1) return { rowBg: 'bg-yellow-50', cellBg: 'bg-yellow-50' }
  if (rank === 2) return { rowBg: 'bg-gray-50',   cellBg: 'bg-gray-50' }
  if (rank === 3) return { rowBg: 'bg-orange-100',  cellBg: 'bg-orange-100' }
  return { rowBg: '', cellBg: '' }
}

/* ──────────────────────────────────────────────────────────
   경기별 골/어시 입력 (Admin · Focus)
────────────────────────────────────────────────────────── */
function FocusComposer({ matches, players, editingMatchId, setEditingMatchId, editingMatch, draft, setDraft, onSave, setVal }){
  const [q, setQ] = useState('')
  const [teamIdx, setTeamIdx] = useState('all')
  const [panelIds, setPanelIds] = useState([])
  const [showSaved, setShowSaved] = useState(false)

  const teams = useMemo(() => {
    if (!editingMatch) return []
    const hydrated = hydrateMatch(editingMatch, players)
    return hydrated.teams || []
  }, [editingMatch, players])

  const roster = useMemo(() => {
    const ids = new Set(extractAttendeeIds(editingMatch || {}))
    let pool = players.filter(p => ids.has(toStr(p.id)))
    if (teamIdx !== 'all' && teams[teamIdx]) {
      const tset = new Set(teams[teamIdx].map(p => toStr(p.id)))
      pool = pool.filter(p => tset.has(toStr(p.id)))
    }
    const needle = q.trim().toLowerCase()
    if (needle) pool = pool.filter(p => (p.name||'').toLowerCase().includes(needle))
    return pool.sort((a,b)=>a.name.localeCompare(b.name))
  }, [players, editingMatch, teams, teamIdx, q])

  const save = () => { onSave(); setShowSaved(true); setTimeout(()=>setShowSaved(false), 1200) }

  return (
    <Card title="경기별 골/어시 기록 입력 (Admin · Focus)">
      {matches.length === 0 ? (
        <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={editingMatchId || ''}
                onChange={(e)=>{ setPanelIds([]); setQ(''); setTeamIdx('all'); setEditingMatchId(e.target.value) }}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {matches.map(m => {
                  const count = extractAttendeeIds(m).length
                  const label = formatMatchLabel(m, { withDate: true, withCount: true, count })
                  return (
                    <option key={m.id} value={m.id}>{label}</option>
                  )
                })}
              </select>
              <Pill active={teamIdx==='all'} onClick={()=>setTeamIdx('all')}>전체팀</Pill>
              {teams.map((_,i)=>(<Pill key={i} active={teamIdx===i} onClick={()=>setTeamIdx(i)}>팀 {i+1}</Pill>))}
            </div>
            <input
              value={q}
              onChange={e=>setQ(e.target.value)}
              placeholder="선수 검색 (이름)"
              className="w-full md:w-64 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="mb-2">
            <ul className="max-h-56 overflow-auto rounded border border-gray-200 bg-white">
              {roster.map(p => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-stone-50">
                  <div className="flex items-center gap-2">
                    <InitialAvatar id={p.id} name={p.name} size={20} />
                    <span className="text-sm">{p.name}</span>
                    <span className="text-xs text-gray-500">{p.position||p.pos||'-'}</span>
                  </div>
                  <button onClick={()=>setPanelIds(prev => prev.includes(p.id)? prev : [...prev, p.id])}
                          className="rounded bg-stone-900 px-2 py-1 text-xs text-white">패널에 추가</button>
                </li>
              ))}
              {roster.length===0 && (
                <li className="px-3 py-3 text-sm text-gray-500">일치하는 선수가 없습니다.</li>
              )}
            </ul>
          </div>

          <EditorPanel
            players={players}
            panelIds={panelIds}
            setPanelIds={setPanelIds}
            draft={draft}
            setVal={setVal}
            onSave={save}
          />

          {showSaved && <div className="mt-2 text-right text-xs text-emerald-700">✅ 저장되었습니다</div>}
        </>
      )}
    </Card>
  )
}

function EditorPanel({ players, panelIds, setPanelIds, draft, setVal, onSave }){
  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <div className="font-semibold">편집 패널 · {panelIds.length}명</div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setPanelIds([])} className="rounded border px-2 py-1">모두 제거</button>
          <button onClick={onSave} className="rounded bg-emerald-600 px-3 py-1 text-white">저장</button>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {panelIds.map(pid => {
          const p = players.find(pp => toStr(pp.id)===toStr(pid))
          const rec = draft[pid] || { goals:0, assists:0 }
          if (!p) return null
          return (
            <li key={pid} className="flex items-center gap-3 px-3 py-2">
              <InitialAvatar id={p.id} name={p.name} size={22} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {p.name} <span className="ml-1 text-xs text-gray-500">{p.position||p.pos||'-'}</span>
                </div>
              </div>

              <MiniCounter
                label="G"
                value={rec.goals}
                onDec={()=>setVal(p.id,'goals',Math.max(0,(rec.goals||0)-1))}
                onInc={()=>setVal(p.id,'goals',(rec.goals||0)+1)}
              />
              <MiniCounter
                label="A"
                value={rec.assists}
                onDec={()=>setVal(p.id,'assists',Math.max(0,(rec.assists||0)-1))}
                onInc={()=>setVal(p.id,'assists',(rec.assists||0)+1)}
              />

              <button onClick={()=>setPanelIds(prev=>prev.filter(id=>id!==pid))}
                      className="ml-1 rounded border px-2 py-1 text-xs">
                제거
              </button>
            </li>
          )
        })}
        {panelIds.length===0 && (
          <li className="px-3 py-6 text-center text-sm text-gray-500">
            아직 선택된 선수가 없습니다. 위에서 검색 후 "패널에 추가"를 눌러주세요.
          </li>
        )}
      </ul>
    </div>
  )
}

function Pill({ children, active, onClick }){
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${active? 'border-stone-900 bg-stone-900 text-white':'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}>
      {children}
    </button>
  )
}

function MiniCounter({ label, value, onDec, onInc }){
  return (
    <div className="flex items-center gap-1">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-800 text-[10px] font-bold text-white">{label}</span>
      <button onClick={onDec} aria-label={`${label} 감소`}>-</button>
      <span style={{ width: 24, textAlign: 'center' }} className="tabular-nums">{value}</span>
      <button onClick={onInc} aria-label={`${label} 증가`}>+</button>
    </div>
  )
}
