import React, { useEffect, useMemo, useState } from "react"
import Card from "../components/Card"
import InitialAvatar from "../components/InitialAvatar"
import FreePitch from "../components/pitch/FreePitch"
import { assignToFormation, recommendFormation, countPositions } from "../lib/formation"
import { overall } from "../lib/players"

function GuestBadge(){
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">
      G
    </span>
  )
}

export default function FormationBoard({ players=[], isAdmin=false }){
  // 체크된 선수 ID들
  const [selectedIds, setSelectedIds] = useState([])
  // 현재 포메이션
  const [formation, setFormation] = useState("4-3-3")
  // 보드 위 배치
  const [placed, setPlaced] = useState([])
  // ✅ 리스트 오픈 상태 (필요할 때만 렌더)
  const [listOpen, setListOpen] = useState(false)
  const [query, setQuery] = useState("")

  // 파생: 선택된 선수 객체 배열
  const selectedPlayers = useMemo(
    () => players.filter(p => selectedIds.includes(p.id)),
    [players, selectedIds]
  )

  // 추천 포메이션
  const autoRecommended = useMemo(() => {
    return recommendFormation({
      count: selectedPlayers.length,
      mode: "11v11",
      positions: countPositions(selectedPlayers),
    })
  }, [selectedPlayers])

  // 체크박스 토글
  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const allSelected = selectedIds.length === players.length && players.length > 0
  const toggleAll = () => setSelectedIds(allSelected ? [] : players.map(p => p.id))

  // 선택 변경 시 배치 보존
  useEffect(() => {
    setPlaced(prev => {
      const byId = new Map(prev.map(p => [String(p.id), p]))
      const base = assignToFormation({
        players: selectedPlayers,
        formation: formation || "4-3-3",
      })
      return base.map(p => byId.get(String(p.id)) || p)
    })
  }, [selectedPlayers, formation])

  // 자동 배치
  const autoPlace = () => {
    setPlaced(assignToFormation({ players: selectedPlayers, formation }))
  }

  // 추천 포메이션 적용
  const useRecommended = () => {
    const next = autoRecommended || "4-3-3"
    setFormation(next)
    setPlaced(assignToFormation({ players: selectedPlayers, formation: next }))
  }

  // 초기화
  const clearBoard = () => {
    setSelectedIds([])
    setPlaced([])
  }

  const showOVR = isAdmin

  // ✅ 검색된 리스트 (리스트 열렸을 때만 계산)
  const filtered = useMemo(() => {
    if (!listOpen) return []
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter(p =>
      String(p.name||"").toLowerCase().includes(q) ||
      String(p.position||p.pos||"").toLowerCase().includes(q)
    )
  }, [listOpen, query, players])

  return (
    <div className="grid gap-4">
      {/* 상단 툴바 (포메이션/자동/추천/비우기) */}
      <Card
        title="포메이션 보드"
        right={
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            표기: <span className="inline-flex items-center gap-1"><GuestBadge /> 게스트</span>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="ml-auto flex items-center gap-2 text-sm">
            <label className="text-gray-600">포메이션</label>
            <select
              className="rounded border border-gray-300 bg-white px-2 py-1"
              value={formation}
              onChange={e => setFormation(e.target.value)}
            >
              <option value="4-3-3">4-3-3</option>
              <option value="4-4-2">4-4-2</option>
              <option value="3-5-2">3-5-2</option>
              <option value="3-3-2">9v9 · 3-3-2</option>
              <option value="3-2-3">9v9 · 3-2-3</option>
              <option value="2-3-1">7v7 · 2-3-1</option>
            </select>

            <button
              onClick={autoPlace}
              className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white"
            >
              자동 배치
            </button>
            <button
              onClick={useRecommended}
              className="rounded border border-emerald-600 text-emerald-700 bg-white px-3 py-1.5 text-sm"
              title={`추천: ${autoRecommended}`}
            >
              추천 포메이션 적용
            </button>
            <button
              onClick={clearBoard}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              비우기
            </button>
          </div>
        </div>

        {/* 필드 + 플로팅 버튼 */}
        <div className="relative">
          <FreePitch
            players={selectedPlayers}
            placed={placed}
            setPlaced={(nextOrUpdater) => {
              setPlaced(prev => {
                const resolved = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater
                return Array.isArray(resolved) ? resolved : prev
              })
            }}
            height={680}
          />

          {/* ✅ 필드 위 반투명 + 버튼 (리스트 열기) */}
          <button
            onClick={() => setListOpen(true)}
            className="absolute left-3 top-3 rounded-full bg-white/70 backdrop-blur px-3 py-2 text-xl leading-none shadow hover:bg-white"
            aria-label="선수 추가"
            title="선수 추가"
          >
            +
          </button>
        </div>
      </Card>

      {/* ✅ 하단 시트(모달): 선수 체크리스트 (필요할 때만 렌더) */}
      {listOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setListOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-xl max-h-[75vh] overflow-auto">
            <div className="p-3 border-b sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="선수/포지션 검색"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={toggleAll}
                  className="shrink-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {allSelected ? "모두 해제" : "모두 선택"}
                </button>
                <button
                  onClick={() => setListOpen(false)}
                  className="shrink-0 rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"
                >
                  완료
                </button>
              </div>
            </div>

            <div className="p-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {filtered.map(p => {
                const mem = String(p.membership || "").trim()
                const isMember = mem === "member" || mem.includes("정회원")
                const checked = selectedIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 rounded border px-3 py-2 cursor-pointer ${
                      checked ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                    onClick={() => toggle(p.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="mr-1"
                    />
                    <InitialAvatar id={p.id} name={p.name} size={24} />
                    <span className="text-sm flex-1 whitespace-normal break-words">
                      {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                    </span>
                    {!isMember && <GuestBadge />}
                    {showOVR && (p.position||p.pos)!=='GK' && (
                      <span className="text-xs text-gray-500 shrink-0">OVR {p.ovr ?? overall(p)}</span>
                    )}
                  </label>
                )
              })}
              {filtered.length === 0 && (
                <div className="text-center text-sm text-gray-500 py-6">검색 결과가 없습니다.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
