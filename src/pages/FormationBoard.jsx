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
  // 보드 위 배치 (배열: {id, name, pos, x, y, ...})
  const [placed, setPlaced] = useState([])

  // 파생: 선택된 선수 객체 배열
  const selectedPlayers = useMemo(
    () => players.filter(p => selectedIds.includes(p.id)),
    [players, selectedIds]
  )

  // 추천 포메이션 버튼에서 사용
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

  // 선택 변경 시, 기존 배치를 최대한 보존하면서 신규/삭제 반영
  useEffect(() => {
    setPlaced(prev => {
      const byId = new Map(prev.map(p => [String(p.id), p]))
      const base = assignToFormation({
        players: selectedPlayers,
        formation: formation || "4-3-3",
      })
      // 기존 좌표가 있으면 유지
      return base.map(p => byId.get(String(p.id)) || p)
    })
  }, [selectedPlayers, formation])

  // 자동 배치
  const autoPlace = () => {
    setPlaced(assignToFormation({ players: selectedPlayers, formation }))
  }

  // 추천 포메이션으로 변경 + 자동 배치
  const useRecommended = () => {
    const next = autoRecommended || "4-3-3"
    setFormation(next)
    setPlaced(assignToFormation({ players: selectedPlayers, formation: next }))
  }

  // 배치 초기화(보드 비우기)
  const clearBoard = () => {
    setSelectedIds([])
    setPlaced([])
  }

  const showOVR = isAdmin // Admin이면 OVR 표시

  return (
    <div className="grid gap-4">
      <Card
        title="선수 선택"
        right={
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            표기: <span className="inline-flex items-center gap-1"><GuestBadge /> 게스트</span>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={toggleAll}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {allSelected ? "모두 해제" : "모두 선택"}
          </button>

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

        {/* 선수 체크리스트 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {players.map(p => {
            const mem = String(p.membership || "").trim()
            const isMember = mem === "member" || mem.includes("정회원")
            const checked = selectedIds.includes(p.id)
            return (
              <label
                key={p.id}
                className={`flex items-center gap-2 rounded border px-3 py-2 cursor-pointer ${
                  checked ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(p.id)}
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
        </div>
      </Card>

      <Card title="포메이션 보드 (Beta)">
        <div className="mb-2 text-xs text-gray-500">
          드래그로 자유 배치 가능 · GK는 골키퍼 존(80~98%)만 이동 가능
        </div>
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
      </Card>
    </div>
  )
}
