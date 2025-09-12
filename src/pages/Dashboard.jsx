import React, { useMemo, useState } from 'react'
import Card from '../components/Card'
import Stat from '../components/Stat'
import InitialAvatar from '../components/InitialAvatar'
import { overall } from '../lib/players'
import { hydrateMatch } from '../lib/match'

/**
 * 대시보드 역할
 * - 저장된 매치 열람 (+ 팀 테이블 읽기 전용 표시)
 * - (NEW) 각 경기 카드에 유튜브 링크 목록 표시
 * - 공격포인트(골/어시/경기수) 누적표
 * - (Admin 전용) 경기별 골/어시 입력/저장
 *
 * props:
 *  - totals, players, matches, isAdmin, onUpdateMatch
 */

export default function Dashboard({ totals, players, matches, isAdmin, onUpdateMatch }) {
  const [editingMatchId, setEditingMatchId] = useState(matches?.[0]?.id || null)

  // 참석자 집계 helper (snapshot 우선)
  const attendeesOf = (m) => {
    if (Array.isArray(m?.snapshot) && m.snapshot.length) return m.snapshot.flat()
    return Array.isArray(m?.attendeeIds) ? m.attendeeIds : []
  }

  // 누적 공격포인트 테이블
  const totalsTable = useMemo(() => {
    const index = new Map() // playerId -> { name, pos, gp, g, a }
    const idToPlayer = new Map(players.map(p => [String(p.id), p]))

    for (const m of (matches || [])) {
      const attended = new Set(attendeesOf(m).map(String))
      const stats = m?.stats || {} // { [playerId]: {goals, assists} }

      for (const pid of attended) {
        const p = idToPlayer.get(pid)
        if (!p) continue
        const row = index.get(pid) || { id: pid, name: p.name, pos: p.position || p.pos, gp: 0, g: 0, a: 0 }
        row.gp += 1
        index.set(pid, row)
      }
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
  const editingAttendees = useMemo(() => {
    const ids = editingMatch ? attendeesOf(editingMatch) : []
    const setIds = new Set(ids.map(String))
    return players.filter(p => setIds.has(String(p.id)))
  }, [editingMatch, players])

  // 편집 드래프트 (초깃값 = 기존 기록)
  const [draft, setDraft] = useState({})
  React.useEffect(() => {
    if (!editingMatch) { setDraft({}); return }
    const src = editingMatch.stats || {}
    const next = {}
    for (const p of editingAttendees) {
      const rec = src?.[p.id] || {}
      next[p.id] = { goals: Number(rec.goals || 0), assists: Number(rec.assists || 0) }
    }
    setDraft(next)
  }, [editingMatchId, editingMatch, editingAttendees.length])

  const saveStats = () => {
    if (!editingMatch) return
    onUpdateMatch?.(editingMatch.id, { stats: draft })
  }

  const totalPlayers = players.length
  const totalMatches = (matches || []).length

  return (
    <div className="grid gap-6">
      {/* 상단 KPI */}
      <Card title="요약">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="총 선수" value={`${totalPlayers}명`} />
          <Stat label="저장된 경기" value={`${totalMatches}회`} />
          <Stat label="공격포인트 합계(골+어시)" value={totalsTable.reduce((a,r)=>a+r.pts,0)} />
          <Stat label="기록 보유 선수 수" value={totalsTable.filter(r=>r.pts>0 || r.gp>0).length} />
        </div>
        <div className="mt-3 text-sm text-gray-600">
          * 대시보드는 누구나 열람 가능 · 매치플래너는 Admin 전용입니다.
        </div>
      </Card>

      {/* 저장된 매치 + 팀 테이블(읽기 전용) + 🎥유튜브 링크 표시 */}
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
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm">
                      <b>{(m.dateISO || '').replace('T',' ')}</b> · {m.mode} · {m.teamCount}팀 · 참석 {attendeesOf(m).length}명
                      {m.location?.name ? <> · 장소 {m.location.name}</> : null}
                    </div>
                    {/* 관리자: 이 경기 기록 입력/수정 바로가기 */}
                    {isAdmin && (
                      <button
                        onClick={()=>setEditingMatchId(m.id)}
                        className={`rounded px-2 py-1 text-xs border ${editingMatchId===m.id?'bg-stone-900 text-white':'bg-white text-stone-700 hover:bg-stone-100'}`}>
                        이 경기 기록 입력/수정
                      </button>
                    )}
                  </div>

                  {/* 팀 테이블 */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {teams.map((list, i) => {
                      const kit = kitForTeam(i)
                      const nonGK = list.filter(p => (p.position || p.pos) !== 'GK')
                      const sum = nonGK.reduce((a, p) => a + (p.ovr ?? overall(p)), 0)
                      const avg = nonGK.length ? Math.round(sum / nonGK.length) : 0
                      return (
                        <div key={i} className="space-y-2 rounded border border-gray-200">
                          <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${kit.headerClass}`}>
                            <div className="font-semibold">팀 {i + 1}</div>
                            {isAdmin
                              ? <div className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</div>
                              : <div className="opacity-80">{kit.label} · {list.length}명</div>}
                          </div>
                          <ul className="space-y-1 px-3 pb-3 text-sm">
                            {list.map(p => (
                              <li key={p.id} className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0">
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
                            {list.length === 0 && <li className="px-1 py-1 text-xs text-gray-400">팀원 없음</li>}
                          </ul>
                        </div>
                      )
                    })}
                  </div>

                  {/* 🎥 유튜브 링크 (읽기 전용 표시; 편집은 플래너에서) */}
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
              )
            })}
          </ul>
        )}
      </Card>

      {/* 공격포인트(누적) 테이블 */}
      <Card title="공격포인트(누적: 골/어시/경기수)">
        {totalsTable.length === 0 ? (
          <div className="text-sm text-gray-500">아직 집계할 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[720px] w-full text-sm">
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
                {totalsTable.map(r => (
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
        )}
      </Card>

      {/* (Admin 전용) 경기별 기록 입력 */}
      {isAdmin && (
        <Card title="경기별 골/어시 기록 입력 (Admin)">
          {matches.length === 0 ? (
            <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={editingMatchId || ""}
                  onChange={(e)=>setEditingMatchId(e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {matches.map(m => (
                    <option key={m.id} value={m.id}>
                      {(m.dateISO || '').replace('T',' ')} · 참석 {attendeesOf(m).length}명
                    </option>
                  ))}
                </select>
                <button
                  onClick={saveStats}
                  className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
                  저장
                </button>
              </div>

              {editingMatch ? (
                <div className="overflow-auto">
                  <table className="min-w-[680px] w-full text-sm">
                    <thead>
                      <tr className="bg-stone-100 text-stone-700">
                        <th className="px-3 py-2 text-left">선수</th>
                        <th className="px-3 py-2 text-left">포지션</th>
                        <th className="px-3 py-2 text-right">골</th>
                        <th className="px-3 py-2 text-right">어시스트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingAttendees.map(p => {
                        const rec = draft[p.id] || { goals: 0, assists: 0 }
                        return (
                          <tr key={p.id} className="border-t">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <InitialAvatar id={p.id} name={p.name} size={22} />
                                <span>{p.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2">{p.position || p.pos || '-'}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number" min={0}
                                value={rec.goals}
                                onChange={(e)=>setDraft(prev=>({ ...prev, [p.id]: { ...prev[p.id], goals: Number(e.target.value) } }))}
                                className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-right"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number" min={0}
                                value={rec.assists}
                                onChange={(e)=>setDraft(prev=>({ ...prev, [p.id]: { ...prev[p.id], assists: Number(e.target.value) } }))}
                                className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-right"
                              />
                            </td>
                          </tr>
                        )
                      })}
                      {editingAttendees.length === 0 && (
                        <tr><td className="px-3 py-4 text-sm text-gray-500" colSpan={4}>이 경기의 참석자가 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-gray-500">경기를 선택하세요.</div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
    매치플래너와 동일한 룩&필을 위한 유틸 (읽기 전용 변형)
   ────────────────────────────────────────────────────────── */

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
  ]; return a[i%a.length]
}
