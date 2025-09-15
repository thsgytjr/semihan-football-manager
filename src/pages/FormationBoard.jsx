import React, { useEffect, useMemo, useState } from "react"
import Card from "../components/Card"
import InitialAvatar from "../components/InitialAvatar"
import FreePitch from "../components/pitch/FreePitch"

function GuestBadge(){
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">
      G
    </span>
  )
}

// 선택된 선수 중 새로 추가되는 선수는 하단(약 y=90%)에 좌우로 간단 배치
function appendNewlySelected(basePlaced, selectedPlayers){
  const byId = new Map(basePlaced.map(p => [String(p.id), p]))
  const next = [...basePlaced]
  let newIdx = 0
  const newOnes = selectedPlayers.filter(p => !byId.has(String(p.id)))
  const totalNew = newOnes.length

  newOnes.forEach((p, i) => {
    // 하단에 균등 간격 배치 (포메이션과 무관, 화면 진입용 기본 위치)
    const x = 50 + ((i - (totalNew - 1)/2) * 8) // 8% 간격
    const y = 90
    next.push({
      id: p.id,
      name: p.name,
      role: p.position || p.pos || "",
      x: pct(x),
      y: pct(y),
    })
    newIdx++
  })

  // 선택 해제된 선수는 제거
  const selIdSet = new Set(selectedPlayers.map(p => String(p.id)))
  return next.filter(p => selIdSet.has(String(p.id)))
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const pct = (v) => clamp(v, 0, 100)

export default function FormationBoard({ players = [], isAdmin = false }){
  const [selectedIds, setSelectedIds] = useState([])
  const [placed, setPlaced] = useState([])
  const [listOpen, setListOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selectedPlayers = useMemo(
    () => players.filter(p => selectedIds.includes(p.id)),
    [players, selectedIds]
  )

  // 선택 변경 시: 기존 배치 유지 + 새로 선택된 선수만 하단에 간단 배치
  useEffect(() => {
    setPlaced(prev => appendNewlySelected(Array.isArray(prev) ? prev : [], selectedPlayers))
  }, [selectedPlayers])

  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const allSelected = selectedIds.length === players.length && players.length > 0
  const toggleAll = () => setSelectedIds(allSelected ? [] : players.map(p => p.id))

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
      <Card
        title="포메이션 보드"
        right={
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            표기: <span className="inline-flex items-center gap-1"><GuestBadge /> 게스트</span>
          </div>
        }
      >
        {/* 포메이션/자동배치/추천 버튼 전부 제거됨 */}

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

          {/* 필드 위 반투명 + 버튼 (리스트 열기) */}
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

      {/* 하단 시트(모달): 선수 체크리스트 */}
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
