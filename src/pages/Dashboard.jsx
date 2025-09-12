import React, { useMemo, useState, useEffect } from 'react'
import Card from '../components/Card'
import Stat from '../components/Stat'
import InitialAvatar from '../components/InitialAvatar'
import { overall } from '../lib/players'
import { hydrateMatch } from '../lib/match'

/**
 * 대시보드 (모바일 우선)
 * - 순서: 매치 요약 → 공격포인트 → 매치 히스토리
 * - 공격포인트는 Top 5만 기본 노출, [전체 보기]로 확장
 * - (Admin) FocusComposer: 검색/필터로 선택한 선수만 편집
 */
export default function Dashboard({ totals, players, matches, isAdmin, onUpdateMatch }) {
  const [editingMatchId, setEditingMatchId] = useState(matches?.[0]?.id || null)

  // 참석자 집계 helper (snapshot 우선)
  const attendeesOf = (m) => {
    if (Array.isArray(m?.snapshot) && m.snapshot.length) return m.snapshot.flat()
    return Array.isArray(m?.attendeeIds) ? m.attendeeIds : []
  }

  // 누적 공격포인트 (모든 매치 기반)
  const totalsTable = useMemo(() => {
    const index = new Map() // playerId -> { id, name, pos, gp, g, a }
    const idToPlayer = new Map(players.map(p => [String(p.id), p]))

    for (const m of (matches || [])) {
      const attended = new Set(attendeesOf(m).map(String))
      const stats = m?.stats || {} // { [pid]: {goals, assists} }

      // 경기수
      for (const pid of attended) {
        const p = idToPlayer.get(pid)
        if (!p) continue
        const row = index.get(pid) || { id: pid, name: p.name, pos: p.position || p.pos, gp: 0, g: 0, a: 0 }
        row.gp += 1
        index.set(pid, row)
      }
      // 골/어시
      for (const [pid, rec] of Object.entries(stats)) {
        const p = idToPlayer.get(String(pid))
        if (!p) continue
        const row = index.get(String(pid)) || { id: String(pid), name: p.name, pos: p.position || p.pos, gp: 0, g: 0, a: 0 }
        row.g += Number(rec?.goals || 0)
        row.a += Number(rec?.assists || 0)
        index.set(String(pid), row)
      }
    }

    const rows = [...index.values()].map(r => ({ ...r, pts: r.g + r.a }))
    rows.sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name))
    return rows
  }, [players, matches])

  // 편집 대상 매치 & 참석자
  const editingMatch = useMemo(() => matches.find(m => m.id === editingMatchId) || null, [matches, editingMatchId])

  // 편집 드래프트 (초깃값 = 기존 기록)
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
              <button
                onClick={()=>setShowAllTotals(v=>!v)}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-stone-50">
                {showAllTotals ? '접기' : `전체 보기 (${totalsTable.length})`}
              </button>
            </div>
            {(() => { const rows = showAllTotals ? totalsTable : totalsTable.slice(0,5); return (
              <>
                {/* 모바일 카드 리스트 */}
                <ul className="grid gap-2 md:hidden">
                  {rows.map(r => (
                    <li key={r.id} className="rounded border border-gray-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <InitialAvatar id={r.id} name={r.name} size={24} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.name}</div>
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
                  ))}
                </ul>

                {/* 데스크톱 테이블 */}
                <div className="hidden md:block">
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <TableScrollHint />
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-stone-100 text-stone-700">
                          <th className="px-3 py-2 text-left">선수</th>
                          <th className="px-3 py-2 text-left">포지션</th>
                          <th className="px-3 py-2 text-right">경기수</th>
                          <th className="px-3 py-2 text-right">골</th>
                          <th className="px-3 py-2 text-right">어시스트</th>
                          <th className="px-3 py-2 text-right">공격포인트</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className="border-t">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <InitialAvatar id={r.id} name={r.name} size={22} />
                                <span>{r.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2">{r.pos || '-'}</td>
                            <td className="px-3 py-2 text-right">{r.gp}</td>
                            <td className="px-3 py-2 text-right">{r.g}</td>
                            <td className="px-3 py-2 text-right">{r.a}</td>
                            <td className="px-3 py-2 text-right font-semibold">{r.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )})()}
          </>
        )}
      </Card>

      {/* 3) 매치 히스토리 */}
      <Card title="매치 히스토리">
        {totalMatches === 0 ? (
          <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div>
        ) : (
          <ul className="space-y-3">
            {matches.map((m) => {
              const hydrated = hydrateMatch(m, players) // snapshot 우선 복원
              const teams = hydrated.teams || []
              return (
                <li key={m.id} className="rounded border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <b>{(m.dateISO || '').replace('T',' ')}</b> · {m.mode} · {m.teamCount}팀 · 참석 {attendeesOf(m).length}명
                      {m.location?.name ? <> · 장소 {m.location.name}</> : null}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={()=>setEditingMatchId(m.id)}
                        className={`rounded px-2 py-1 text-xs border ${editingMatchId===m.id?'bg-stone-900 text-white':'bg-white text-stone-700 hover:bg-stone-100'}`}>
                        이 경기 기록 입력/수정
                      </button>
                    )}
                  </div>

                  {/* 팀 멤버 카드 (항상 2열 · 모바일도 side-by-side) */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {teams.map((list, i) => {
                      const kit = kitForTeam(i)
                      const nonGK = list.filter(p => (p.position || p.pos) !== 'GK')
                      const sum = nonGK.reduce((a, p) => a + (p.ovr ?? overall(p)), 0)
                      const avg = nonGK.length ? Math.round(sum / nonGK.length) : 0
                      return (
                        <div key={i} className="overflow-hidden rounded border border-gray-200">
                          <div className={`flex items-center justify-between px-3 py-2 text-xs ${kit.headerClass}`}>
                            <div className="font-semibold">팀 {i + 1}</div>
                            {isAdmin
                              ? <div className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</div>
                              : <div className="opacity-80">{kit.label} · {list.length}명</div>}
                          </div>
                          <ul className="divide-y divide-gray-100">
                            {list.map(p => (
                              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <span className="flex items-center gap-2 min-w-0 flex-1">
                                  <InitialAvatar id={p.id} name={p.name} size={22} />
                                  <span className="truncate">
                                    {p.name} {(p.position || p.pos) === 'GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                                  </span>
                                </span>
                                {isAdmin && (p.position || p.pos) !== 'GK' && (
                                  <span className="text-gray-500 shrink-0">OVR {p.ovr ?? overall(p)}</span>
                                )}
                              </li>
                            ))}
                            {list.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">팀원 없음</li>}
                          </ul>
                        </div>
                      )
                    })}
                  </div>

                  {/* 🎥 유튜브 링크 */}
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-600">🎥 유튜브 링크</div>
                    {(m.videos && m.videos.length > 0) ? (
                      <ul className="flex flex-wrap gap-2">
                        {m.videos.map((url, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="max-w-[240px] truncate rounded border border-gray-300 bg-white px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                              title={url}
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500">등록된 링크가 없습니다. (플래너에서 추가 가능)</div>
                    )}
                  </div>
                </li>
              )})}
          </ul>
        )}
      </Card>

      {/* (Admin 전용) FocusComposer: 선택한 선수만 편집 */}
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
        />
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
   FocusComposer: 검색/필터 → 선택한 선수만 에디트 패널에 표시
   ────────────────────────────────────────────────────────── */
function FocusComposer({ matches, attendeesOf, players, editingMatchId, setEditingMatchId, editingMatch, draft, setDraft, onSave }){
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

  const setVal = (pid, key, v) => setDraft(prev => ({ ...prev, [pid]: { ...prev[pid], [key]: Math.max(0, v) } }))
  const inc = (pid, key, d=1) => setVal(pid, key, (draft[pid]?.[key]||0)+d)

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
                  <li key={pid} className="flex items-center gap-2 px-3 py-2">
                    <InitialAvatar id={p.id} name={p.name} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {p.name} <span className="ml-1 text-xs text-gray-500">{p.position||p.pos||'-'}</span>
                      </div>
                    </div>
                    <MiniCounter label="G" value={rec.goals} onDec={()=>inc(pid,'goals',-1)} onInc={()=>inc(pid,'goals',+1)} />
                    <MiniCounter label="A" value={rec.assists} onDec={()=>inc(pid,'assists',-1)} onInc={()=>inc(pid,'assists',+1)} />
                    <button onClick={()=>removeFromPanel(pid)} className="ml-1 rounded border px-2 py-1 text-xs">제거</button>
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
      <button onClick={onDec} className="h-6 w-6 rounded-full border">−</button>
      <span className="w-6 text-center text-sm tabular-nums">{value}</span>
      <button onClick={onInc} className="h-6 w-6 rounded-full border bg-stone-900 text-white">＋</button>
    </div>
  )
}

/* 보조 컴포넌트 */
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

/* 매치플래너와 동일한 룩&필을 위한 유틸 */
function kitForTeam(i){
  const a=[
    {label:'화이트',headerClass:'bg-white text-stone-800 border-b border-stone-300'},
    {label:'블랙',headerClass:'bg-stone-900 text-white border-b border-stone-900'},
    {label:'블루',headerClass:'bg-blue-600 text-white border-b border-blue-700'},
    {label:'레드',headerClass:'bg-red-600 text-white border-b border-red-700'},
    {label:'그린',headerClass:'bg-emerald-600 text-white border-b border-emerald-700'},
    {label:'퍼플',headerClass:'bg-violet-600 text-white border-b border-violet-700'},
    {label:'오렌지',headerClass:'bg-orange-500 text-white border-b border-orange-600'},
    {label:'티얼',headerClass:'bg-teal-600 text-white border-b border-teal-700'},
    {label:'핑크',headerClass:'bg-pink-600 text-white border-b border-pink-700'},
    {label:'옐로',headerClass:'bg-yellow-400 text-stone-900 border-b border-yellow-500'},
  ]
  return a[i%a.length]
}
