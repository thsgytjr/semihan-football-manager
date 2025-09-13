// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Card from '../components/Card'
import Stat from '../components/Stat'
import InitialAvatar from '../components/InitialAvatar'
import { overall } from '../lib/players'
import { hydrateMatch } from '../lib/match'
import SavedMatchesList from '../components/SavedMatchesList'   // ✅ 공용 리스트 사용

export default function Dashboard({ totals, players, matches, isAdmin, onUpdateMatch }) {
  const [editingMatchId, setEditingMatchId] = useState(matches?.[0]?.id || null)
  useEffect(() => {
    if (!matches || matches.length === 0) { setEditingMatchId(null); return }
    const exists = matches.some(m => m.id === editingMatchId)
    if (!editingMatchId || !exists) setEditingMatchId(matches[0].id)
  }, [matches])

  const attendeesOf = (m) => {
    if (Array.isArray(m?.snapshot) && m.snapshot.length) return m.snapshot.flat()
    return Array.isArray(m?.attendeeIds) ? m.attendeeIds : []
  }

  // ✅ membership 포함 공격포인트 rows
  const totalsTable = useMemo(() => {
    const index = new Map()
    const idToPlayer = new Map(players.map(p => [String(p.id), p]))
    const isMember = (mem) => {
      const s = String(mem || '').trim()
      return s === 'member' || s.includes('정회원')
    }

    for (const m of (matches || [])) {
      const attended = new Set(attendeesOf(m).map(String))
      const stats = m?.stats || {}

      for (const pid of attended) {
        const p = idToPlayer.get(pid)
        if (!p) continue
        const row = index.get(pid) || {
          id: pid,
          name: p.name,
          pos: p.position || p.pos,
          membership: p.membership || '',
          gp: 0, g: 0, a: 0
        }
        row.gp += 1
        index.set(pid, row)
      }
      for (const [pid, rec] of Object.entries(stats)) {
        const p = idToPlayer.get(String(pid))
        if (!p) continue
        const row = index.get(String(pid)) || {
          id: String(pid),
          name: p.name,
          pos: p.position || p.pos,
          membership: p.membership || '',
          gp: 0, g: 0, a: 0
        }
        row.g += Number(rec?.goals || 0)
        row.a += Number(rec?.assists || 0)
        index.set(String(pid), row)
      }
    }

    const rows = [...index.values()].map(r => ({
      ...r,
      pts: r.g + r.a,
      isGuest: !isMember(r.membership)
    }))
    rows.sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name))
    return rows
  }, [players, matches])

  const editingMatch = useMemo(
    () => (matches || []).find(m => m.id === editingMatchId) || null,
    [matches, editingMatchId]
  )

  const [draft, setDraft] = useState({})
  useEffect(() => {
    if (!editingMatch) { setDraft({}); return }
    const src = editingMatch.stats || {}
    const next = {}
    const ids = new Set(attendeesOf(editingMatch).map(String))
    for (const p of players) {
      if (!ids.has(String(p.id))) continue
      const rec = src?.[p.id] || {}
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
      {/* 1) 매치 요약 */}
      <Card title="요약">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="총 선수" value={`${totalPlayers}명`} />
          <Stat label="저장된 경기" value={`${totalMatches}회`} />
          <Stat label="공격포인트 합계(골+어시)" value={totalsTable.reduce((a,r)=>a+r.pts,0)} />
          <Stat label="기록 보유 선수 수" value={totalsTable.filter(r=>r.pts>0 || r.gp>0).length} />
        </div>
        <div className="mt-3 text-xs md:text-sm text-gray-600">
          * 대시보드는 누구나 열람 가능 · 매치플래너는 Admin 전용입니다.
        </div>
      </Card>

      {/* 2) 공격포인트 (Top 5 + 확장) */}
      <Card title={`공격포인트${showAllTotals ? '' : ' (Top 5)'}`}>
        {totalsTable.length === 0 ? (
          <div className="text-sm text-gray-500">아직 집계할 데이터가 없습니다.</div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs text-gray-600">골+어시 합계 기준 내림차순</div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-[11px] text-gray-500">
                  표기: <span className="inline-flex items-center gap-1"><GuestBadge /> 게스트</span>
                </div>
                <button
                  onClick={()=>setShowAllTotals(v=>!v)}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-stone-50">
                  {showAllTotals ? '접기' : `전체 보기 (${totalsTable.length})`}
                </button>
              </div>
            </div>

            {(() => {
              const rows = showAllTotals ? totalsTable : totalsTable.slice(0,5)

              return (
                <>
                  {/* 모바일 카드 리스트 */}
                  <ul className="grid gap-2 md:hidden">
                    {rows.map((r, idx) => {
                      const top = rankInfo(idx)
                      return (
                        <li
                          key={r.id}
                          className={`relative rounded border border-gray-200 bg-white p-3 ${top.cardClass}`}
                        >
                          {top.emoji && (
                            <div className={`absolute -left-2 -top-2 rounded-full px-2 py-0.5 text-xs ${top.badgeClass}`}>
                              {top.emoji}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <InitialAvatar id={r.id} name={r.name} size={24} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium flex items-center gap-2">
                                {r.name}
                                {!r.isGuest ? null : <GuestBadge />}
                              </div>
                              <div className="text-xs text-gray-500">{r.pos || '-'} · 경기 {r.gp}</div>
                            </div>
                            <Badge label="PTS" value={r.pts} />
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <Chip>골 {r.g}</Chip>
                            <Chip>어시 {r.a}</Chip>
                            <Chip className="ml-auto">경기 {r.gp}</Chip>
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  {/* 데스크톱 테이블 */}
                  <div className="hidden md:block">
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <TableScrollHint />
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-stone-100 text-stone-700">
                            <th className="px-3 py-2 text-left">순위</th>
                            <th className="px-3 py-2 text-left">선수</th>
                            <th className="px-3 py-2 text-left">포지션</th>
                            <th className="px-3 py-2 text-right">경기수</th>
                            <th className="px-3 py-2 text-right">골</th>
                            <th className="px-3 py-2 text-right">어시스트</th>
                            <th className="px-3 py-2 text-right">공격포인트</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, idx) => {
                            const top = rankInfo(idx)
                            return (
                              <tr key={r.id} className={`border-t ${top.rowClass}`}>
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center gap-1">
                                    {top.emoji ? top.emoji : idx + 1}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <InitialAvatar id={r.id} name={r.name} size={22} />
                                    <span className="flex items-center gap-2">
                                      {r.name}
                                      {!r.isGuest ? null : <GuestBadge />}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">{r.pos || '-'}</td>
                                <td className="px-3 py-2 text-right">{r.gp}</td>
                                <td className="px-3 py-2 text-right">{r.g}</td>
                                <td className="px-3 py-2 text-right">{r.a}</td>
                                <td className="px-3 py-2 text-right font-semibold">{r.pts}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )
            })()}
          </>
        )}
      </Card>

      {/* 3) 매치 히스토리 → 공용 컴포넌트로 교체 */}
      <Card title="매치 히스토리">
        <SavedMatchesList
          matches={matches}
          players={players}
          isAdmin={isAdmin}
          onUpdateMatch={onUpdateMatch}
          showTeamOVRForAdmin={true}
        />
      </Card>

      {/* (Admin 전용) FocusComposer */}
      {isAdmin && (
        <FocusComposer
          matches={matches}
          attendeesOf={attendeesOf}
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
   FocusComposer 이하 기존 부품들 그대로 유지
   ────────────────────────────────────────────────────────── */
function FocusComposer({ matches, attendeesOf, players, editingMatchId, setEditingMatchId, editingMatch, draft, setDraft, onSave, setVal }){
  const [q, setQ] = useState('')
  const [teamIdx, setTeamIdx] = useState('all')
  const [pos, setPos] = useState('all')
  const [panelIds, setPanelIds] = useState([])
  const [showSaved, setShowSaved] = useState(false)

  const teams = useMemo(() => {
    if (!editingMatch) return []
    const hydrated = hydrateMatch(editingMatch, players)
    return hydrated.teams || []
  }, [editingMatch, players])

  const roster = useMemo(() => {
    const ids = new Set((editingMatch ? attendeesOf(editingMatch) : []).map(String))
    let pool = players.filter(p => ids.has(String(p.id)))
    if (teamIdx !== 'all' && teams[teamIdx]) {
      const tset = new Set(teams[teamIdx].map(p => String(p.id)))
      pool = pool.filter(p => tset.has(String(p.id)))
    }
    if (pos !== 'all') pool = pool.filter(p => (p.position||p.pos) === pos)
    const needle = q.trim().toLowerCase()
    if (needle) pool = pool.filter(p => (p.name||'').toLowerCase().includes(needle))
    return pool.sort((a,b)=>a.name.localeCompare(b.name))
  }, [players, editingMatch, teams, teamIdx, pos, q])

  const addToPanel = (pid) => setPanelIds(prev => prev.includes(pid) ? prev : [...prev, pid])
  const removeFromPanel = (pid) => setPanelIds(prev => prev.filter(id => id!==pid))

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
                onChange={(e)=>{ setPanelIds([]); setQ(''); setTeamIdx('all'); setPos('all'); setEditingMatchId(e.target.value) }}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {matches.map(m => (
                  <option key={m.id} value={m.id}>
                    {(m.dateISO || '').replace('T',' ')} · 참석 {attendeesOf(m).length}명
                  </option>
                ))}
              </select>
              <Pill active={teamIdx==='all'} onClick={()=>setTeamIdx('all')}>전체팀</Pill>
              {teams.map((_,i)=>(<Pill key={i} active={teamIdx===i} onClick={()=>setTeamIdx(i)}>팀 {i+1}</Pill>))}
              {['all','FW','MF','DF','GK'].map(k=> (
                <Pill key={k} active={pos===k} onClick={()=>setPos(k)}>{k==='all'? '전체 포지션': k}</Pill>
              ))}
            </div>
            <input
              value={q}
              onChange={e=>setQ(e.target.value)}
              placeholder="선수 검색 (이름)"
              className="w-full md:w-64 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="mb-2">
            {q || teamIdx!=='all' || pos!=='all' ? (
              <ul className="max-h-56 overflow-auto rounded border border-gray-200 bg-white">
                {roster.slice(0, 20).map(p => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-stone-50">
                    <div className="flex items-center gap-2">
                      <InitialAvatar id={p.id} name={p.name} size={20} />
                      <span className="text-sm">{p.name}</span>
                      <span className="text-xs text-gray-500">{p.position||p.pos||'-'}</span>
                    </div>
                    <button onClick={()=>addToPanel(p.id)} className="rounded bg-stone-900 px-2 py-1 text-xs text-white">패널에 추가</button>
                  </li>
                ))}
                {roster.length===0 && (
                  <li className="px-3 py-3 text-sm text-gray-500">일치하는 선수가 없습니다.</li>
                )}
              </ul>
            ) : (
              <div className="text-xs text-gray-500">필터/검색으로 선수를 선택하세요. (처음 화면은 비워 정보 과부하를 줄였습니다)</div>
            )}
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
              <div className="font-semibold">편집 패널 · {panelIds.length}명</div>
              <div className="flex items-center gap-2">
                <button onClick={()=>setPanelIds([])} className="rounded border px-2 py-1">모두 제거</button>
                <button onClick={save} className="rounded bg-emerald-600 px-3 py-1 text-white">저장</button>
              </div>
            </div>
            <ul className="divide-y divide-gray-100">
              {panelIds.map(pid => {
                const p = players.find(pp => String(pp.id)===String(pid))
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
                  아직 선택된 선수가 없습니다. 위에서 검색/필터 후 "패널에 추가"를 눌러주세요.
                </li>
              )}
            </ul>
          </div>

          {showSaved && <div className="mt-2 text-right text-xs text-emerald-700">✅ 저장되었습니다</div>}
        </>
      )}
    </Card>
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

function Badge({ label, value }){
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      <span className="opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  )
}

function Chip({ children, className = '' }){
  return (
    <span className={`inline-block rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 ${className}`}>{children}</span>
  )
}

function TableScrollHint(){
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-16 bg-gradient-to-l from-white to-transparent md:hidden" />
      <div className="pointer-events-none absolute -top-8 right-0 md:hidden">
        <span className="rounded bg-stone-800 px-2 py-1 text-[10px] font-medium text-white opacity-80">좌우로 스와이프</span>
      </div>
    </div>
  )
}

function rankInfo(idx){
  if (idx === 0) return {
    emoji: '🥇',
    rowClass: 'bg-amber-50',
    cardClass: 'ring-1 ring-amber-200',
    badgeClass: 'bg-amber-500 text-white shadow-sm'
  }
  if (idx === 1) return {
    emoji: '🥈',
    rowClass: 'bg-slate-50',
    cardClass: 'ring-1 ring-slate-200',
    badgeClass: 'bg-slate-500 text-white shadow-sm'
  }
  if (idx === 2) return {
    emoji: '🥉',
    rowClass: 'bg-orange-50',
    cardClass: 'ring-1 ring-orange-200',
    badgeClass: 'bg-orange-500 text-white shadow-sm'
  }
  return { emoji: '', rowClass: '', cardClass: '', badgeClass: '' }
}

/* 게스트 배지 (공격포인트 표기에 사용) */
function GuestBadge(){
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">G</span>
  )
}
