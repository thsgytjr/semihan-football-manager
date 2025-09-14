// src/components/SavedMatchesList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import InitialAvatar from "./InitialAvatar"
import { overall } from "../lib/players"
import { hydrateMatch } from "../lib/match"
import { formatMatchLabel } from "../lib/matchLabel"

// ─────────────────────────────────────────────
// 뱃지/스타일 유틸
function GuestBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">
      G
    </span>
  )
}

function kitForTeam(i) {
  const a = [
    { label: "화이트", headerClass: "bg-white text-stone-800 border-b border-stone-300" },
    { label: "블랙", headerClass: "bg-stone-900 text-white border-b border-stone-900" },
    { label: "블루", headerClass: "bg-blue-600 text-white border-b border-blue-700" },
    { label: "레드", headerClass: "bg-red-600 text-white border-b border-red-700" },
    { label: "그린", headerClass: "bg-emerald-600 text-white border-b border-emerald-700" },
    { label: "퍼플", headerClass: "bg-violet-600 text-white border-b border-violet-700" },
    { label: "오렌지", headerClass: "bg-orange-500 text-white border-b border-orange-600" },
    { label: "티얼", headerClass: "bg-teal-600 text-white border-b border-teal-700" },
    { label: "핑크", headerClass: "bg-pink-600 text-white border-b border-pink-700" },
    { label: "옐로", headerClass: "bg-yellow-400 text-stone-900 border-b border-yellow-500" },
  ]
  return a[i % a.length]
}

// ─────────────────────────────────────────────
// 스냅샷/출석 도우미
const toStr = (v) => (v === null || v === undefined) ? "" : String(v)
const isMember = (mem) => {
  const s = toStr(mem).trim().toLowerCase()
  return s === "member" || s.includes("정회원")
}

function normalizeSnapshot(match, teams) {
  const snap = Array.isArray(match?.snapshot) ? match.snapshot : null
  if (snap && Array.isArray(snap) && snap.length === teams.length) {
    return snap.map((arr) => Array.isArray(arr) ? arr.slice() : [])
  }
  // 스냅샷 없거나 팀 수 불일치: 화면의 teams로부터 생성
  return teams.map((list) => list.map((p) => p.id))
}

function notInMatchPlayers(players, snapshot2D) {
  const inside = new Set(snapshot2D.flat().map(String))
  return players.filter((p) => !inside.has(String(p.id)))
}

// 저장본에 fees가 없을 때(구버전 등) 멤버/게스트 단가 추정
function deriveFeesFromSnapshot(m, players) {
  if (m?.fees) return m.fees
  const preset = m?.location?.preset
  const baseCost =
    preset === "indoor-soccer-zone" ? 230 :
    preset === "coppell-west"       ? 300 : 0
  if (!baseCost) return { total: 0, memberFee: 0, guestFee: 0, premium: 1.2, _estimated: true }

  const ids = Array.isArray(m?.snapshot) && m.snapshot.length
    ? m.snapshot.flat()
    : (Array.isArray(m?.attendeeIds) ? m.attendeeIds : [])
  const byId = new Map(players.map(p => [String(p.id), p]))
  const attendees = ids.map(id => byId.get(String(id))).filter(Boolean)
  const memberCount = attendees.filter(p => isMember(p.membership)).length
  const guestCount  = attendees.length - memberCount
  const x = baseCost / (memberCount + guestCount || 1)
  const memberFee = Math.round(x || 0)
  const guestFee = memberFee + 2 // 게스트는 멤버 +$2
  return { 
    total: baseCost, 
    memberFee, 
    guestFee, 
    premium: null,
    _estimated: true 
  }
}

// ─────────────────────────────────────────────
// 유튜브 링크 입력
function VideoAdder({ onAdd }){
  const [val, setVal] = useState("")
  return (
    <div className="flex items-center gap-2">
      <input
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..."
        value={val}
        onChange={e=>setVal(e.target.value)}
      />
      <button
        className="whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        onClick={()=>{ const u=val.trim(); if(!u) return; onAdd(u); setVal("") }}
      >추가</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// 빠른 출석 편집 바 (드래프트 전용) - 커스텀 드롭다운(아바타+이름)
function QuickAttendanceEditor({ players, snapshot, onDraftChange }) {
  const [teamIdx, setTeamIdx] = useState(0)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1) // highlighted index
  const wrapRef = useRef(null)
  const listRef = useRef(null)

  const candidates = useMemo(() => notInMatchPlayers(players, snapshot), [players, snapshot])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let base = candidates
    if (q) base = candidates.filter(p => (p.name || "").toLowerCase().includes(q))
    // 키워드 일치도 가볍게 정렬(앞부분 일치 우선)
    return base
      .slice(0)
      .sort((a,b)=>{
        const an=(a.name||"").toLowerCase(), bn=(b.name||"").toLowerCase()
        const as = an.indexOf(q), bs = bn.indexOf(q)
        const aw = as<0?999:as, bw = bs<0?999:bs
        return aw - bw || an.localeCompare(bn)
      })
      .slice(0, 40) // 너무 길지 않게 40개 제한
  }, [candidates, query])

  useEffect(()=>{
    // 외부 클릭 닫기
    const onDoc = (e)=>{
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return ()=>document.removeEventListener("mousedown", onDoc)
  }, [])

  useEffect(()=>{
    // 하이라이트 가시성 보장
    if (listRef.current && hi>=0) {
      const el = listRef.current.querySelector(`[data-idx="${hi}"]`)
      if (el) {
        const { offsetTop, offsetHeight } = el
        const { scrollTop, clientHeight } = listRef.current
        if (offsetTop < scrollTop) listRef.current.scrollTop = offsetTop
        else if (offsetTop + offsetHeight > scrollTop + clientHeight) {
          listRef.current.scrollTop = offsetTop - clientHeight + offsetHeight
        }
      }
    }
  }, [hi])

  const addPlayer = (pLike) => {
    const player = typeof pLike==="string"
      ? filtered.find(pp => (pp.name||"").toLowerCase() === pLike.trim().toLowerCase())
      : pLike
    if (!player) return
    const pid = player.id
    const next = snapshot.map((arr, idx) =>
      idx === teamIdx
        ? (arr.some(id => String(id)===String(pid)) ? arr : [...arr, pid])
        : arr
    )
    onDraftChange(next)
    setQuery("")
    setHi(-1)
    setOpen(false)
  }

  const onKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return }
    if (!open) return
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h+1, filtered.length-1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h-1, 0)) }
    else if (e.key === "Enter") {
      e.preventDefault()
      if (hi>=0 && hi<filtered.length) addPlayer(filtered[hi])
      else addPlayer(query)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2" ref={wrapRef}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-600">빠른 출석 편집</label>
        <select
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          value={teamIdx}
          onChange={(e) => setTeamIdx(Number(e.target.value))}
        >
          {snapshot.map((_, i) => (<option key={i} value={i}>팀 {i+1}</option>))}
        </select>

        <div className="relative min-w-[220px] flex-1">
          <input
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            placeholder="이름 검색 후 추가 (Enter)"
            value={query}
            onChange={(e)=>{ setQuery(e.target.value); setOpen(true); setHi(-1) }}
            onFocus={()=>setOpen(true)}
            onKeyDown={onKey}
          />
          {open && filtered.length>0 && (
            <div
              ref={listRef}
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
              role="listbox"
              aria-label="가용 선수 목록"
            >
              {filtered.map((p, idx)=>(
                <button
                  key={p.id}
                  type="button"
                  data-idx={idx}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 ${idx===hi ? "bg-gray-100" : ""}`}
                  onMouseEnter={()=>setHi(idx)}
                  onMouseDown={(e)=>e.preventDefault()}
                  onClick={()=>addPlayer(p)}
                >
                  <InitialAvatar id={p.id} name={p.name} size={22} />
                  <span className="truncate">{p.name}</span>
                  {(p.position||p.pos)==="GK" && <span className="ml-auto text-[11px] text-gray-400">GK</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs"
          onClick={()=>addPlayer(query)}
        >추가</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 매치 카드 (선수 추가/제외는 초안 → 저장/취소로 확정)
function MatchCard({
  m,
  players,
  isAdmin,
  enableLoadToPlanner,
  onLoadToPlanner,
  onDeleteMatch,
  onUpdateMatch,
  showTeamOVRForAdmin,
  hideOVR
}) {
  // 초기 팀/스냅샷 구성
  const hydrated = useMemo(() => hydrateMatch(m, players), [m, players])
  const initialSnap = useMemo(
    () => normalizeSnapshot(m, hydrated.teams || []),
    [m, hydrated.teams]
  )

  const [draftSnap, setDraftSnap] = useState(initialSnap)
  const [dirty, setDirty] = useState(false)

  // id→player 매핑
  const byId = useMemo(() => new Map(players.map(p => [String(p.id), p])), [players])

  // 초안 팀(플레이어 객체 배열) 구성
  const draftTeams = useMemo(
    () => draftSnap.map(ids => ids.map(id => byId.get(String(id))).filter(Boolean)),
    [draftSnap, byId]
  )

  // 라벨/인원/요금 (초안 기준으로 미리보기)
  const draftCount = useMemo(() => draftSnap.flat().length, [draftSnap])
  const label = useMemo(
    () => formatMatchLabel({ ...m, snapshot: draftSnap }, { withDate: true, withCount: true, count: draftCount }),
    [m, draftSnap, draftCount]
  )
  const fees = useMemo(
    () => deriveFeesFromSnapshot({ ...m, snapshot: draftSnap }, players),
    [m, draftSnap, players]
  )

  // 비디오 링크는 기존 동작(즉시 반영) 유지
  const addVideo = (url) => onUpdateMatch?.(m.id, { videos: [ ...(m.videos||[]), url ] })
  const removeVideo = (idx) => {
    const next = (m.videos||[]).filter((_, i)=> i!==idx)
    onUpdateMatch?.(m.id, { videos: next })
  }

  // 초안 변경 헬퍼
  const setSnapAndDirty = (next) => {
    setDraftSnap(next)
    setDirty(true)
  }
  const resetDraft = () => {
    setDraftSnap(initialSnap)
    setDirty(false)
  }
  const saveDraft = () => {
    const attendeeIds = draftSnap.flat()
    onUpdateMatch?.(m.id, { snapshot: draftSnap, attendeeIds })
    setDirty(false)
  }

  return (
    <li className="rounded border border-gray-200 bg-white p-3">
      {/* 헤더 */}
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm">
          <b>{label}</b> · {m.mode} · {m.teamCount}팀
          {m.location?.name ? <> · 장소 {m.location.name}</> : null}
          {dirty && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 border border-amber-200">수정됨(저장 필요)</span>}
        </div>
        <div className="flex items-center gap-3">
          {/* 게스트 표기 레전드 */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500">
            표기: <GuestBadge /> 게스트
          </div>
          {enableLoadToPlanner && (
            <button
              className="text-xs rounded border border-gray-300 bg-white px-2 py-1"
              onClick={()=>onLoadToPlanner?.(m)}
            >
              팀배정에 로드
            </button>
          )}
          {isAdmin && onDeleteMatch && (
            <button
              className="text-xs text-red-600"
              onClick={()=>{
                const ok = window.confirm("정말 삭제하시겠어요?\n삭제 시 대시보드의 공격포인트/기록 집계에 영향을 줄 수 있습니다.")
                if (ok) onDeleteMatch(m.id)
              }}
            >
              삭제
            </button>
          )}
        </div>
      </div>

      {/* 💰 금액 줄 (초안 기준 미리보기) */}
      <div className="mb-2 text-xs text-gray-800">
        💰 총액 ${fees?.total ?? 0}
        {typeof fees?.memberFee==="number" && typeof fees?.guestFee==="number" && (
          <> · 멤버 ${fees.memberFee}/인 · 게스트 ${fees.guestFee}/인 <span className="opacity-70">(게스트 +$2){fees?._estimated && " · 추정"}</span></>
        )}
      </div>

      {/* 팀 카드 (선수 개별 제외는 초안만 수정) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {draftTeams.map((list, i) => {
          const kit = kitForTeam(i)
          const nonGK = list.filter(p => (p.position||p.pos) !== "GK")
          const sum = nonGK.reduce((a,p)=> a+(p.ovr??overall(p)), 0)
          const avg = nonGK.length ? Math.round(sum / nonGK.length) : 0

          return (
            <div key={i} className="space-y-1 overflow-hidden rounded border border-gray-200">
              <div className={`flex items-center justify-between px-3 py-1.5 text-xs ${kit.headerClass}`}>
                <div className="font-semibold">팀 {i+1}</div>
                {isAdmin && showTeamOVRForAdmin && !hideOVR
                  ? <div className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</div>
                  : <div className="opacity-80">{kit.label} · {list.length}명</div>}
              </div>

              <ul className="divide-y divide-gray-100">
                {list.map((p) => {
                  const member = isMember(p.membership)
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span className="flex items-center gap-2 min-w-0 flex-1">
                        <InitialAvatar id={p.id} name={p.name} size={22} />
                        <span className="truncate">
                          {p.name} {(p.position||p.pos)==="GK" && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                        </span>
                        {!member && <GuestBadge />}
                      </span>

                      <span className="flex items-center gap-2 shrink-0">
                        {isAdmin && showTeamOVRForAdmin && !hideOVR && (p.position||p.pos)!=="GK" && (
                          <span className="text-gray-500">OVR {p.ovr??overall(p)}</span>
                        )}
                        {/* 선수 개별 제외 → 초안만 수정 */}
                        {isAdmin && (
                          <button
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                            title="이 팀에서 제외 (저장 전 초안)"
                            onClick={()=>{
                              const next = draftSnap.map((arr, idx) =>
                                idx === i ? arr.filter(id => String(id)!==String(p.id)) : arr
                              )
                              setSnapAndDirty(next)
                            }}
                          >제외</button>
                        )}
                      </span>
                    </li>
                  )
                })}
                {list.length===0 && <li className="px-3 py-2 text-xs text-gray-400">팀원 없음</li>}
              </ul>
            </div>
          )
        })}
      </div>

      {/* 빠른 출석 편집 바 (초안만 수정) */}
      {isAdmin && (
        <QuickAttendanceEditor
          players={players}
          snapshot={draftSnap}
          onDraftChange={setSnapAndDirty}
        />
      )}

      {/* 저장/취소 바 */}
      {isAdmin && dirty && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
            onClick={resetDraft}
            title="변경사항 취소"
          >취소</button>
          <button
            className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700"
            onClick={saveDraft}
            title="변경사항 저장"
          >저장</button>
        </div>
      )}

      {/* 🎥 유튜브 링크 (즉시 반영 유지) */}
      <div className="mt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600">🎥 유튜브 링크</div>
        {(m.videos && m.videos.length>0) ? (
          <ul className="flex flex-wrap gap-2">
            {m.videos.map((url, idx)=>(
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
                {isAdmin && onUpdateMatch && (
                  <button className="text-[11px] text-red-600" onClick={()=>removeVideo(idx)} title="삭제">삭제</button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-gray-500">등록된 링크가 없습니다.</div>
        )}
        {isAdmin && onUpdateMatch && (
          <VideoAdder onAdd={addVideo}/>
        )}
      </div>
    </li>
  )
}

// ─────────────────────────────────────────────
// 메인 리스트
export default function SavedMatchesList({
  matches = [],
  players = [],
  isAdmin = false,
  enableLoadToPlanner = false,
  onLoadToPlanner,          // (match)=>void
  onDeleteMatch,            // (matchId)=>void
  onUpdateMatch,            // (matchId, patch)=>void
  showTeamOVRForAdmin = true,
  hideOVR = false,
}) {
  if (!matches?.length) {
    return <div className="text-sm text-gray-500">저장된 매치가 없습니다.</div>
  }

  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <MatchCard
          key={m.id}
          m={m}
          players={players}
          isAdmin={isAdmin}
          enableLoadToPlanner={enableLoadToPlanner}
          onLoadToPlanner={onLoadToPlanner}
          onDeleteMatch={onDeleteMatch}
          onUpdateMatch={onUpdateMatch}
          showTeamOVRForAdmin={showTeamOVRForAdmin}
          hideOVR={hideOVR}
        />
      ))}
    </ul>
  )
}
