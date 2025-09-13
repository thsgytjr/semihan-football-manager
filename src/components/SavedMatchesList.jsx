import React, { useState } from "react"
import InitialAvatar from "../components/InitialAvatar"
import { overall } from "../lib/players"
import { hydrateMatch } from "../lib/match"

// ── 내부 유틸 ─────────────────────────────────────────────
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

function attendeesCount(m) {
  if (Array.isArray(m?.snapshot) && m.snapshot.length) return m.snapshot.flat().length
  if (Array.isArray(m?.attendeeIds)) return m.attendeeIds.length
  return 0
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
  const isMember = (v)=> String(v??"").trim()==="member" || String(v??"").includes("정회원")
  const memberCount = attendees.filter(p => isMember(p.membership)).length
  const guestCount  = attendees.length - memberCount
  const PREMIUM = 1.2
  const x = baseCost / (memberCount + PREMIUM * guestCount || 1)
  return { total: baseCost, memberFee: Math.round(x||0), guestFee: Math.round(PREMIUM*(x||0)), premium: PREMIUM, _estimated: true }
}

// 유튜브 링크 입력 미니 컴포넌트
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

// ── 공용 리스트 컴포넌트 ────────────────────────────────
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
      {matches.map((m) => {
        const hydrated = hydrateMatch(m, players)
        const teams = hydrated.teams || []
        const fees = deriveFeesFromSnapshot(m, players)
        const count = attendeesCount(m)

        const addVideo = (url) => onUpdateMatch?.(m.id, { videos: [ ...(m.videos||[]), url ] })
        const removeVideo = (idx) => {
          const next = (m.videos||[]).filter((_, i)=> i!==idx)
          onUpdateMatch?.(m.id, { videos: next })
        }

        return (
          <li key={m.id} className="rounded border border-gray-200 bg-white p-3">
            {/* 헤더 */}
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm">
                <b>{(m.dateISO || "").replace("T"," ")}</b> · {m.mode} · {m.teamCount}팀 · 참석 {count}명
                {m.location?.name ? <> · 장소 {m.location.name}</> : null}
              </div>
              <div className="flex items-center gap-3">
                {/* ✅ 게스트 표기 레전드 */}
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

            {/* 💰 요금 줄 */}
            <div className="mb-2 text-xs text-gray-800">
              💰 총액 ${fees?.total ?? 0}
              {typeof fees?.memberFee==="number" && typeof fees?.guestFee==="number" && (
                <> · 멤버 ${fees.memberFee}/인 · 게스트 ${fees.guestFee}/인 <span className="opacity-70">(게스트 +{Math.round(((fees?.premium??1.2)-1)*100)}%){fees?._estimated && " · 추정"}</span></>
              )}
            </div>

            {/* 팀 카드 */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {teams.map((list, i) => {
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
                      {list.map(p => {
                        const mem = String(p.membership||"").trim()
                        const member = mem==="member" || mem.includes("정회원")
                        return (
                          <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                            <span className="flex items-center gap-2 min-w-0 flex-1">
                              <InitialAvatar id={p.id} name={p.name} size={22}/>
                              <span className="truncate">
                                {p.name} {(p.position||p.pos)==="GK" && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                              </span>
                              {!member && <GuestBadge/>} {/* ✅ 선수 옆에도 게스트 배지 */}
                            </span>
                            {isAdmin && showTeamOVRForAdmin && !hideOVR && (p.position||p.pos)!=="GK" && (
                              <span className="text-gray-500 shrink-0">OVR {p.ovr??overall(p)}</span>
                            )}
                          </li>
                        )
                      })}
                      {list.length===0 && <li className="px-3 py-2 text-xs text-gray-400">팀원 없음</li>}
                    </ul>
                  </div>
                )
              })}
            </div>

            {/* 🎥 유튜브 링크 */}
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
      })}
    </ul>
  )
}
