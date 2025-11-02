// src/pages/PlayersPage.jsx
import React, { useMemo, useState, useEffect } from "react"
import { notify } from "../components/Toast"
import { overall, isUnknownPlayer } from "../lib/players"
import { STAT_KEYS } from "../lib/constants"
import InitialAvatar from "../components/InitialAvatar"
import RadarHexagon from "../components/RadarHexagon"
import { ensureStatsObject, clampStat } from "../lib/stats"
import { calculateAIPower, aiPowerChipClass } from "../lib/aiPower"

const S = (v) => (v == null ? "" : String(v))
const posOf = (p) => (S(p.position || p.pos).toUpperCase() || "")
const isMember = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === "member" || s.includes("정회원")
}

function PosChip({ pos }) {
  if (!pos) return null
  const isGK = pos === "GK"
  const cls = isGK
    ? "bg-amber-100 text-amber-800"
    : pos === "DF"
    ? "bg-blue-100 text-blue-800"
    : pos === "MF"
    ? "bg-emerald-100 text-emerald-800"
    : pos === "FW"
    ? "bg-purple-100 text-purple-800"
    : "bg-stone-100 text-stone-700"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] ${cls}`}>
      {pos}
    </span>
  )
}

const FIELD =
  "w-full bg-white text-stone-800 placeholder-stone-400 border border-stone-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
const DROPDOWN = FIELD + " appearance-none"

// OVR 색상 헬퍼 (페이지 공용)
const ovrGradientClass = (ovr) => {
  if (ovr >= 80) return 'from-emerald-500 to-emerald-600'
  if (ovr >= 70) return 'from-blue-500 to-blue-600'
  if (ovr >= 60) return 'from-amber-500 to-amber-600'
  return 'from-stone-500 to-stone-700'
}

const ovrChipClass = (ovr) => {
  if (ovr >= 80) return 'bg-emerald-600 text-white'
  if (ovr >= 70) return 'bg-blue-600 text-white'
  if (ovr >= 60) return 'bg-amber-500 text-white'
  return 'bg-stone-800 text-white'
}

// ===== 편집 모달 =====
function EditPlayerModal({ open, player, onClose, onSave }) {
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    if (open && player) {
      setDraft({
        ...player,
        name: S(player.name),
        position: S(player.position || player.pos).toUpperCase(),
        membership: isMember(player.membership) ? "정회원" : "게스트",
        stats: ensureStatsObject(player.stats),
      })
    } else {
      setDraft(null)
    }
  }, [open, player])

  const nameEmpty = !S(draft?.name).trim()
  const isNew = !player?.id
  const posMissing = isNew && !S(draft?.position).trim()

  if (!open || !draft) return null

  const setStat = (k, v) =>
    setDraft((prev) => {
      const next = { ...prev, stats: ensureStatsObject(prev.stats) }
      next.stats[k] = clampStat(Number(v))
      return next
    })

  const handleSave = () => {
    if (nameEmpty) {
      notify("이름을 입력해 주세요.", "error")
      return
    }
    if (posMissing) {
      notify("포지션을 선택해 주세요.", "error")
      return
    }
    const payload = {
      ...player,
      ...draft,
      name: S(draft.name).trim(),
      position: S(draft.position).toUpperCase(),
      membership: draft.membership,
      stats: ensureStatsObject(draft.stats),
    }
    onSave(payload)
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!nameEmpty && !posMissing) handleSave()
    }
    if (e.key === "Escape") {
      onClose()
    }
  }

  // 실시간 OVR
  const liveOVR = overall(draft) ?? 0
  const isGuest = S(draft.membership).includes("게스트")

  // OVR에 따른 색상
  const getOVRColor = (ovr) => {
    if (ovr >= 80) return 'from-emerald-500 to-emerald-600'
    if (ovr >= 70) return 'from-blue-500 to-blue-600'
    if (ovr >= 60) return 'from-amber-500 to-amber-600'
    return 'from-stone-500 to-stone-600'
  }

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-fadeIn"
      onKeyDown={onKeyDown}
      onClick={onClose}
    >
      <div 
        className="bg-white w-full md:max-w-5xl rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[95dvh] md:max-h-[90dvh] flex flex-col min-h-0 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="relative px-6 py-5 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-stone-100">
          <button 
            className="absolute right-4 top-4 p-2 rounded-full hover:bg-stone-200 transition-colors text-stone-500 hover:text-stone-700" 
            onClick={onClose} 
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <div className="flex items-center gap-4 pr-12">
            <div className="relative">
              <InitialAvatar id={draft.id} name={draft.name} size={56} badges={isGuest?['G']:[]} />
              {liveOVR >= 75 && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center text-xs">
                  ⭐
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-stone-900 mb-1">
                {isNew ? '새 선수 추가' : '선수 정보 수정'}
              </h3>
              <p className="text-sm text-stone-500">
                {draft.name || '이름을 입력하세요'} {draft.position && `· ${draft.position}`}
              </p>
            </div>
            <div className={`hidden md:flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${getOVRColor(liveOVR)} text-white shadow-lg`}>
              <div className="text-center">
                <div className="text-xs font-medium opacity-90">OVR</div>
                <div className="text-3xl font-black">{liveOVR}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* 왼쪽: 기본 정보 */}
            <div className="space-y-5">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
                <h4 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  기본 정보
                </h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">
                      선수 이름<span className="text-rose-500 ml-1">*</span>
                    </label>
                    <input
                      className={`w-full bg-white border-2 rounded-xl px-4 py-3 text-sm font-medium transition-all outline-none ${nameEmpty ? 'border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-100' : 'border-blue-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'}`}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="예) 손흥민"
                      autoFocus
                    />
                    {nameEmpty && (
                      <p className="mt-2 text-xs text-rose-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        이름을 입력해주세요
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">포지션<span className="text-rose-500 ml-1">*</span></label>
                    <div className="grid grid-cols-4 gap-2">
                      {['GK', 'DF', 'MF', 'FW'].map(pos => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setDraft({ ...draft, position: pos })}
                          className={`py-3 px-2 rounded-xl text-sm font-bold transition-all ${
                            draft.position === pos
                              ? pos === 'GK' ? 'bg-amber-500 text-white shadow-lg scale-105'
                                : pos === 'DF' ? 'bg-blue-500 text-white shadow-lg scale-105'
                                : pos === 'MF' ? 'bg-emerald-500 text-white shadow-lg scale-105'
                                : 'bg-purple-500 text-white shadow-lg scale-105'
                              : 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-300'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                    {posMissing && (
                      <p className="mt-2 text-xs text-rose-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        포지션을 선택해주세요
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">멤버십</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['정회원', '게스트'].map(mem => (
                        <button
                          key={mem}
                          type="button"
                          onClick={() => setDraft({ ...draft, membership: mem })}
                          className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                            draft.membership === mem
                              ? mem === '정회원' 
                                ? 'bg-emerald-500 text-white shadow-lg scale-105'
                                : 'bg-amber-500 text-white shadow-lg scale-105'
                              : 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-300'
                          }`}
                        >
                          {mem === '정회원' ? '👤 정회원' : '👋 게스트'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* 오른쪽: 능력치 */}
            <div className="space-y-5">
              {/* 모바일용 고정 OVR 헤더 */}
              <div className="md:hidden sticky top-0 z-10 -mx-6 px-6 py-3 bg-white border-b border-stone-200 backdrop-blur-sm bg-white/95">
                <div className={`flex items-center justify-center py-4 rounded-2xl bg-gradient-to-br ${getOVRColor(liveOVR)} text-white shadow-lg`}>
                  <div className="text-center">
                    <div className="text-xs font-medium opacity-90 mb-1">Overall Rating</div>
                    <div className="text-4xl font-black">{liveOVR}</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100">
                <h4 className="text-sm font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  능력치 조정
                </h4>
                
                <div className="mb-5 hidden md:block">
                  <RadarHexagon size={240} stats={draft.stats} />
                </div>

                <div className="space-y-4">
                  {STAT_KEYS.map((k) => {
                    const val = draft.stats?.[k] ?? 50
                    return (
                      <div key={k} className="bg-white rounded-xl p-3 border border-emerald-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-emerald-900 uppercase">{k}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={val}
                            onChange={(e) => setStat(k, e.target.value)}
                            className="w-16 text-right rounded-lg border-2 border-emerald-200 bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                          />
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={val}
                          onChange={(e) => setStat(k, e.target.value)}
                          className="w-full h-2 rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, rgb(16 185 129) 0%, rgb(16 185 129) ${val}%, rgb(229 231 235) ${val}%, rgb(229 231 235) 100%)`
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 액션 버튼 */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-stone-200 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <button 
              className="px-6 py-3 rounded-xl border-2 border-stone-300 font-semibold text-stone-700 hover:bg-stone-50 transition-all"
              onClick={onClose}
            >
              취소
            </button>
            <button
              className={`flex-1 px-6 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${
                nameEmpty || posMissing
                  ? "bg-stone-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-95"
              }`}
              onClick={handleSave}
              disabled={nameEmpty || posMissing}
            >
              {isNew ? '선수 추가하기' : '변경사항 저장'}
            </button>
          </div>
          <p className="text-xs text-center text-stone-400 mt-2">
            💡 Tip: ⌘+Enter (또는 Ctrl+Enter)로 빠르게 저장 | ESC로 닫기
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgb(16 185 129);
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          transition: all 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 8px rgba(16, 185, 129, 0.4);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgb(16 185 129);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          transition: all 0.15s ease;
        }
        input[type="range"]::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 3px 8px rgba(16, 185, 129, 0.4);
        }
      `}</style>
    </div>
  )
}

// ===== 메인 페이지 =====
export default function PlayersPage({
  players = [],
  matches = [],
  selectedId,
  onSelect = () => {},
  onCreate = () => {},
  onUpdate = () => {},
  onDelete = async () => {},
}) {
  const [confirm, setConfirm] = useState({ open: false, id: null, name: "" })
  const [editing, setEditing] = useState({ open: false, player: null })
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('playersViewMode') || 'list') // 'card' | 'list'
  const [membershipFilter, setMembershipFilter] = useState('all') // 'all' | 'member' | 'guest'

  // ▼ 정렬 상태: 키 & 방향
  const [sortKey, setSortKey] = useState("name") // 'ovr' | 'pos' | 'name' | 'ai'
  const [sortDir, setSortDir] = useState("asc")  // 'asc' | 'desc'
  const POS_ORDER = ["GK","DF","MF","FW","OTHER",""] // 포지션 오름차순 기준

  // 뷰 모드 변경 시 localStorage에 저장
  const toggleViewMode = (mode) => {
    setViewMode(mode)
    localStorage.setItem('playersViewMode', mode)
  }

  // 정렬 버튼 클릭 핸들러
  const onSortClick = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  // 비교 함수 (오름차/내림차 방향 적용 유틸)
  const applyDir = (cmp) => (sortDir === "asc" ? cmp : (a, b) => -cmp(a, b))

  const cmpByNameAsc = (a,b)=> S(a.name).localeCompare(S(b.name))

  const cmpByPosAsc = (a,b)=>{
    const pa = posOf(a) || ""
    const pb = posOf(b) || ""
    const ra = POS_ORDER.indexOf(pa)
    const rb = POS_ORDER.indexOf(pb)
    if (ra !== rb) return ra - rb
    return S(a.name).localeCompare(S(b.name))
  }

  const cmpByOvrAsc = (a,b)=>{
    const oa = overall(a) || 0
    const ob = overall(b) || 0
    if (oa !== ob) return oa - ob
    // 동점이면 포지션→이름
    const posCmp = cmpByPosAsc(a,b)
    if (posCmp !== 0) return posCmp
    return S(a.name).localeCompare(S(b.name))
  }

  const cmpByAIAsc = (a,b)=>{
    const aa = calculateAIPower(a, matches)
    const ab = calculateAIPower(b, matches)
    if (aa !== ab) return aa - ab
    // 동점이면 OVR→포지션→이름
    const ovrCmp = cmpByOvrAsc(a,b)
    if (ovrCmp !== 0) return ovrCmp
    return S(a.name).localeCompare(S(b.name))
  }

  const sorted = useMemo(() => {
    const arr = [...players]
    let cmp = cmpByNameAsc
    if (sortKey === "ovr") cmp = cmpByOvrAsc
    else if (sortKey === "pos") cmp = cmpByPosAsc
    else if (sortKey === "ai") cmp = cmpByAIAsc
    arr.sort(applyDir(cmp))
    return arr
  }, [players, sortKey, sortDir])

  // 멤버십 필터 적용
  const filtered = useMemo(() => {
    if (membershipFilter === 'all') return sorted
    if (membershipFilter === 'member') return sorted.filter(p => isMember(p.membership))
    if (membershipFilter === 'guest') return sorted.filter(p => !isMember(p.membership))
    return sorted
  }, [sorted, membershipFilter])

  const counts = useMemo(() => {
    const total = players.length
    const members = players.filter((p) => isMember(p.membership)).length
    const guests = total - members
    return { total, members, guests }
  }, [players])

  // 새 선수 추가
  const handleCreate = () => {
    setEditing({
      open: true,
      player: {
        id: null,
        name: "",
        membership: "정회원",
        position: "",
        stats: ensureStatsObject({}),
      },
    })
    notify("새 선수 추가 폼을 열었어요.")
  }

  const requestDelete = (id, name) => setConfirm({ open: true, id, name: name || "" })
  const confirmDelete = async () => {
    try {
      if (confirm.id) await onDelete(confirm.id)
      notify("삭제 완료")
    } catch {
      notify("삭제에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setConfirm({ open: false, id: null, name: "" })
    }
  }
  const cancelDelete = () => setConfirm({ open: false, id: null, name: "" })

  const openEdit = (p) => setEditing({ open: true, player: p })
  const closeEdit = () => setEditing({ open: false, player: null })

  const saveEdit = async (patch) => {
    try {
      if (patch.id) {
        await onUpdate(patch)
        notify("선수 정보가 저장되었어요.")
      } else {
        await onCreate(patch)
        notify("새 선수가 추가되었어요.")
      }
      closeEdit()
    } catch {
      notify("저장에 실패했습니다. 다시 시도해 주세요.")
    }
  }

  // 현재 활성 버튼에만 화살표 표시
  const arrowFor = (key) => sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* 상단 헤더 & 통계 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">선수 관리</h1>
            <p className="text-sm text-stone-500 mt-1">팀 선수들을 관리하고 능력치를 편집하세요</p>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-md sm:rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-medium hover:bg-emerald-700 shadow-sm transition-colors"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="sm:hidden">추가</span>
            <span className="hidden sm:inline">새 선수 추가</span>
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <button
            onClick={() => setMembershipFilter('all')}
            className={`bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border-2 transition-all hover:shadow-md ${membershipFilter === 'all' ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}
          >
            <div className="text-xs font-medium text-blue-700 mb-1">전체 선수</div>
            <div className="text-2xl font-bold text-blue-900">{counts.total}</div>
          </button>
          <button
            onClick={() => setMembershipFilter('member')}
            className={`bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border-2 transition-all hover:shadow-md ${membershipFilter === 'member' ? 'border-emerald-500 shadow-md' : 'border-emerald-200'}`}
          >
            <div className="text-xs font-medium text-emerald-700 mb-1">정회원</div>
            <div className="text-2xl font-bold text-emerald-900">{counts.members}</div>
          </button>
          <button
            onClick={() => setMembershipFilter('guest')}
            className={`bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border-2 transition-all hover:shadow-md ${membershipFilter === 'guest' ? 'border-amber-500 shadow-md' : 'border-amber-200'}`}
          >
            <div className="text-xs font-medium text-amber-700 mb-1">게스트</div>
            <div className="text-2xl font-bold text-amber-900">{counts.guests}</div>
          </button>
        </div>

        {/* 정렬 & 뷰 모드 토글 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-stone-600 mr-1">정렬:</span>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${sortKey==='ovr' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
              onClick={()=>onSortClick('ovr')}
              title="OVR 정렬 (토글: 오름/내림)"
            >
              OVR {arrowFor('ovr')}
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${sortKey==='ai' ? 'border-purple-500 bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-sm' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
              onClick={()=>onSortClick('ai')}
              title="AI 파워 정렬 (토글: 오름/내림)"
            >
              ✨ AI {arrowFor('ai')}
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${sortKey==='pos' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
              onClick={()=>onSortClick('pos')}
              title="포지션 정렬 (토글: 오름/내림)"
            >
              포지션 {arrowFor('pos')}
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${sortKey==='name' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
              onClick={()=>onSortClick('name')}
              title="이름 정렬 (토글: 오름/내림)"
            >
              이름 {arrowFor('name')}
            </button>
          </div>

          {/* 뷰 모드 토글 */}
          <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
            <button
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'card' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
              onClick={() => toggleViewMode('card')}
              title="카드 뷰"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
              onClick={() => toggleViewMode('list')}
              title="리스트 뷰"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 카드 뷰 */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const mem = S(p.membership).trim()
          const guest = !isMember(mem)
          const pos = posOf(p)
          const ovr = overall(p)
          const isGK = pos === 'GK'
          
          return (
            <div
              key={p.id}
              className={`bg-white rounded-xl border-2 p-4 transition-all hover:shadow-lg cursor-pointer ${selectedId === p.id ? "border-emerald-500 shadow-md" : "border-stone-200 hover:border-emerald-300"}`}
              onClick={() => onSelect(p.id)}
            >
              <div className="flex items-start gap-3 mb-3">
                <InitialAvatar id={p.id} name={p.name} size={48} badges={guest?['G']:[]} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base text-stone-900 truncate mb-1">
                    {p.name || "이름없음"}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {pos && <PosChip pos={pos} />}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${guest ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {mem || "미지정"}
                    </span>
                  </div>
                </div>
              </div>

              {/* OVR 표시 - GK가 아닐 때만 (값에 따라 색상 표시) */}
              {!isGK && (
                <div className={`mb-3 rounded-lg p-3 text-center ${
                  ovr === 50
                    ? 'bg-stone-300 text-stone-700'
                    : `bg-gradient-to-br ${ovrGradientClass(ovr)} text-white`
                }`}>
                  <div className={`text-xs mb-1 ${ovr === 50 ? 'text-stone-600' : 'text-white/80'}`}>Overall Rating</div>
                  <div className={`text-3xl font-bold ${ovr === 50 ? 'text-stone-700' : 'text-white'}`}>
                    {ovr === 50 ? '?' : ovr}
                  </div>
                  {ovr === 50 && (
                    <div className="text-[10px] text-stone-600 mt-1">Unknown</div>
                  )}
                </div>
              )}
              {isGK && (
                <div className="mb-3 rounded-lg p-3 text-center bg-amber-100 border border-amber-200">
                  <div className="text-xs text-amber-700 mb-1">Position</div>
                  <div className="text-3xl font-bold text-amber-900">GK</div>
                  <div className="text-[10px] text-amber-600 mt-1">Goalkeeper</div>
                </div>
              )}

              {/* AI 파워 점수 */}
              <div className={`mb-3 rounded-lg p-3 text-center bg-gradient-to-br ${aiPowerChipClass(calculateAIPower(p, matches)).replace('text-white', '').replace('shadow-sm', '').split(' ').filter(c => c.startsWith('from-') || c.startsWith('to-')).join(' ')} text-white shadow-md`}>
                <div className="text-xs mb-1 text-white/80">✨ AI Power Score</div>
                <div className="text-2xl font-bold text-white">
                  {calculateAIPower(p, matches)}
                </div>
                <div className="text-[10px] text-white/70 mt-1">Auto-calculation</div>
              </div>

              {/* 액션 버튼 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(p)
                  }}
                >
                  ✏️ 편집
                </button>
                <button
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    requestDelete(p.id, p.name)
                  }}
                >
                  🗑️ 삭제
                </button>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* 리스트 뷰 */}
      {viewMode === 'list' && (
        <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-200 shadow-sm">
          {filtered.map((p) => {
            const mem = S(p.membership).trim()
            const guest = !isMember(mem)
            const pos = posOf(p)
            const isGK = pos === 'GK'
            const ovr = overall(p)
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors ${selectedId === p.id ? "bg-emerald-50" : ""}`}
                onClick={() => onSelect(p.id)}
              >
                <InitialAvatar id={p.id} name={p.name} size={40} badges={guest?['G']:[]} />

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-stone-800 flex items-center gap-2 flex-wrap">
                    <span className="truncate">{p.name || "이름없음"}</span>
                    {pos && <PosChip pos={pos} />}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${guest ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {mem || "미지정"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!isGK && (
                    <>
                      <span className={`inline-flex items-center rounded px-3 py-1 text-sm font-bold ${ovr === 50 ? 'bg-stone-300 text-stone-700' : ovrChipClass(ovr)}`}>
                        {ovr === 50 ? '?' : ovr}
                      </span>
                      <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold shadow-sm ${aiPowerChipClass(calculateAIPower(p, matches))}`} title="AI 파워 점수">
                        ✨ {calculateAIPower(p, matches)}
                      </span>
                    </>
                  )}
                  {isGK && (
                    <>
                      <span className="inline-flex items-center rounded px-3 py-1 text-sm font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        GK
                      </span>
                      <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold shadow-sm ${aiPowerChipClass(calculateAIPower(p, matches))}`} title="AI 파워 점수">
                        ✨ {calculateAIPower(p, matches)}
                      </span>
                    </>
                  )}
                  <button
                    className="text-xs px-3 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50 font-medium transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEdit(p)
                    }}
                  >
                    편집
                  </button>
                  <button
                    className="text-xs px-3 py-1.5 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 font-medium transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      requestDelete(p.id, p.name)
                    }}
                  >
                    삭제
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {sorted.length === 0 && (
        <div className="text-center py-12 text-stone-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-sm">등록된 선수가 없습니다</p>
          <p className="text-xs mt-1">새 선수를 추가해보세요</p>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {confirm.open && (
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-4 w-full max-w-sm">
            <h3 className="font-semibold mb-2">정말 삭제할까요?</h3>
            <p className="text-sm text-stone-600 mb-4">
              {confirm.name ? (<><b>{confirm.name}</b> 선수를 삭제합니다.</>) : ("선수 레코드를 삭제합니다.")}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={cancelDelete} className="px-3 py-2 rounded-md border border-stone-300 text-stone-700">취소</button>
              <button onClick={confirmDelete} className="px-3 py-2 rounded-md bg-rose-600 text-white hover:bg-rose-700">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 편집 모달 */}
      <EditPlayerModal
        open={editing.open}
        player={editing.player}
        onClose={closeEdit}
        onSave={saveEdit}
      />
    </div>
  )
}
