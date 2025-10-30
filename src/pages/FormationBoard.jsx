import React, { useEffect, useMemo, useState } from "react"
import Card from "../components/Card"
import InitialAvatar from "../components/InitialAvatar"
import FreePitch from "../components/pitch/FreePitch"

/**
 * 새 기능 요약
 * - + 버튼 → 하단 시트(모달)
 * - 모달에 "팀 불러오기" 패널 (fetchMatchTeams prop 제공 시 표시)
 * - 매치 선택 → 팀 버튼 클릭하면 해당 팀 선수들이 자동 선택되어 보드에 배치
 *
 * 요구 prop:
 *   fetchMatchTeams?: () => Promise<Array<{
 *     id: string, label?: string,
 *     teams: Array<{ name: string, playerIds: (string|number)[] }>
 *   }>>
 */

function GuestBadge(){
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">
      G
    </span>
  )
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const pct = (v) => clamp(v, 0, 100)

// 새로 선택된 선수는 하단(약 y=90%)에 간단 배치
function appendNewlySelected(basePlaced, selectedPlayers){
  const byId = new Map(basePlaced.map(p => [String(p.id), p]))
  const next = [...basePlaced]
  const newOnes = selectedPlayers.filter(p => !byId.has(String(p.id)))
  const totalNew = newOnes.length

  newOnes.forEach((p, i) => {
    const x = 50 + ((i - (totalNew - 1)/2) * 8) // 8% 간격
    const y = 90
    next.push({
      id: p.id,
      name: p.name,
      role: p.position || p.pos || "",
      x: pct(x),
      y: pct(y),
      membership: p.membership, // 멤버십 정보 포함
    })
  })

  const selIdSet = new Set(selectedPlayers.map(p => String(p.id)))
  return next.filter(p => selIdSet.has(String(p.id)))
}

export default function FormationBoard({
  players = [],
  isAdmin = false,
  fetchMatchTeams,      // ⬅️ 추가: 팀/매치 로더 (옵션)
}){
  const [selectedIds, setSelectedIds] = useState([])
  const [placed, setPlaced] = useState([])
  const [listOpen, setListOpen] = useState(false)
  const [query, setQuery] = useState("")

  // 팀 불러오기 패널 상태
  const [teamsPanelOpen, setTeamsPanelOpen] = useState(false)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [matches, setMatches] = useState([])    // [{id,label,teams:[{name,playerIds}]}]
  const [activeMatchId, setActiveMatchId] = useState("")

  const selectedPlayers = useMemo(
    () => players.filter(p => selectedIds.includes(p.id)),
    [players, selectedIds]
  )

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

  // 팀 불러오기: 매치 목록 로드
  const openTeamsPanel = async () => {
    if (!fetchMatchTeams) return
    setTeamsPanelOpen((prev) => {
      const next = !prev
      if (next && matches.length === 0 && !loadingTeams) {
        void loadMatches()
      }
      return next
    })
  }

  const loadMatches = async () => {
    if (!fetchMatchTeams) return
    setLoadingTeams(true)
    setLoadError("")
    try {
      const data = await fetchMatchTeams()
      const norm = Array.isArray(data) ? data : []
      setMatches(norm)
      if (norm.length > 0){
        setActiveMatchId(String(norm[0].id))
      }
    } catch (err) {
      console.error(err)
      setLoadError("매치 목록을 불러오지 못했습니다.")
    } finally {
      setLoadingTeams(false)
    }
  }

  const activeMatch = useMemo(
    () => matches.find(m => String(m.id) === String(activeMatchId)),
    [matches, activeMatchId]
  )

  const importTeamToBoard = (teamPlayerIds = []) => {
    const idSet = new Set(teamPlayerIds.map(String))
    const validIds = players.filter(p => idSet.has(String(p.id))).map(p => p.id)
    setSelectedIds(validIds)
    // 모달은 닫지 않음(사용자가 세부 조정 후 완료로 닫도록)
  }

  return (
    <div className="grid gap-4">
      <Card
        title="포메이션 보드(Beta)"
        right={
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            표기: <span className="inline-flex items-center gap-1"><GuestBadge /> 게스트</span>
          </div>
        }
      >
        {/* 필드 + 플로팅 + 버튼 */}
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
            modalOpen={listOpen}
          />

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

      {/* 하단 모달 - z-index 낮춤 */}
      {listOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-10"
            onClick={() => setListOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white shadow-xl max-h-[80vh] overflow-auto">
            <div className="p-3 border-b sticky top-0 bg-white z-30 shadow-md">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="선수/포지션 검색"
                    className="w-[240px] rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={toggleAll}
                    className="shrink-0 rounded border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  >
                    {allSelected ? "모두 해제" : "모두 선택"}
                  </button>

                  {/* 팀 불러오기 토글 (fetchMatchTeams가 있을 때만) */}
                  {typeof fetchMatchTeams === "function" && (
                    <button
                      onClick={openTeamsPanel}
                      className={`shrink-0 rounded px-3 py-2 text-sm font-semibold border transition-all ${
                        teamsPanelOpen 
                          ? "bg-amber-100 border-amber-300 text-amber-800" 
                          : "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800"
                      }`}
                      title="매치 히스토리에서 팀을 선택하여 불러오기"
                    >
                      팀 불러오기
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setListOpen(false)}
                    className="shrink-0 rounded bg-emerald-500 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-600 transition-all focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    완료
                  </button>
                </div>
              </div>

              {/* 팀 불러오기 패널 */}
              {teamsPanelOpen && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  {loadingTeams && (
                    <div className="text-sm text-gray-600">매치 목록을 불러오는 중…</div>
                  )}
                  {!!loadError && (
                    <div className="text-sm text-rose-600">{loadError}</div>
                  )}
                  {!loadingTeams && !loadError && (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-xs text-gray-500">매치 선택</label>
                        <select
                          value={activeMatchId}
                          onChange={(e) => setActiveMatchId(e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm w-full sm:w-[260px] bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {matches.map(m => (
                            <option key={m.id} value={String(m.id)} className="bg-white text-gray-900">
                              {m.label || m.id}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={loadMatches}
                          className="rounded border border-gray-300 bg-white text-gray-900 px-2 py-1 text-xs hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
                          title="목록 새로고침"
                        >
                          새로고침
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {activeMatch?.teams?.length ? (
                          activeMatch.teams.map((t, idx) => (
                            <button
                              key={idx}
                              onClick={() => importTeamToBoard(t.playerIds || [])}
                              className="rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-100 transition-all"
                              title="이 팀의 선수 전원을 포메이션 보드에 올리기"
                            >
                              {t.name || `Team ${idx+1}`} 불러오기
                            </button>
                          ))
                        ) : (
                          <div className="text-xs text-gray-500">선택된 매치에 팀 정보가 없습니다.</div>
                        )}
                      </div>

                      <p className="mt-2 text-[11px] text-gray-500">
                        팀을 누르면 해당 팀의 선수들이 자동 선택됩니다. 필요 시 검색/체크로 조정 후 <strong>완료</strong>를 눌러 닫아주세요.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 선수 체크리스트 */}
            <div className="p-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {filtered.map(p => {
                const mem = String(p.membership || "").trim()
                const isMember = mem === "member" || mem.includes("정회원")
                const checked = selectedIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 rounded border px-3 py-2 cursor-pointer transition-all ${
                      checked 
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800 shadow-sm" 
                        : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:shadow-sm"
                    }`}
                    onClick={() => toggle(p.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="mr-1 w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <InitialAvatar id={p.id} name={p.name} size={24} badges={(() => { const mem=String(p.membership||"").trim(); const isMember = mem === "member" || mem.includes("정회원"); return isMember?[]:["G"]; })()} />
                    <span className="text-sm flex-1 whitespace-normal break-words">
                      {p.name} {(p.position||p.pos)==='GK' && <em className="ml-1 text-xs text-gray-400">(GK)</em>}
                    </span>
                    {/* Guest shown on avatar via badges */}
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
