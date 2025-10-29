// src/pages/PlayersPage.jsx
import React, { useMemo, useState, useEffect } from "react"
import { notify } from "../components/Toast"
import { overall } from "../lib/players"
import { STAT_KEYS } from "../lib/constants"
import InitialAvatar from "../components/InitialAvatar"
import RadarHexagon from "../components/RadarHexagon"
import { ensureStatsObject, clampStat } from "../lib/stats"

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
      notify("이름을 입력해 주세요.")
      return
    }
    if (posMissing) {
      notify("포지션을 선택해 주세요.")
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
  }

  // 실시간 OVR
  const liveOVR = overall(draft) ?? 0
  const isGuest = S(draft.membership).includes("게스트")

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4"
      onKeyDown={onKeyDown}
    >
      <div className="bg-white w-full md:max-w-4xl rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[100dvh] md:max-h-[90dvh] flex flex-col min-h-0">
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-stone-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <InitialAvatar id={draft.id} name={draft.name} size={36} badges={isGuest?['G']:[]} />
              <h3 className="font-semibold">선수 편집</h3>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-stone-500">
              <span className="inline-flex items-center rounded bg-stone-800 px-2 py-1 text-white">
                OVR&nbsp;{liveOVR}
              </span>
              {/* Guest is indicated on the avatar via badges */}
              <button className="ml-2 text-stone-500 hover:text-stone-800" onClick={onClose} aria-label="닫기">✕</button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 md:pb-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="order-2 md:order-1">
              <div className="mb-4">
                <RadarHexagon size={280} stats={draft.stats} />
              </div>
              <div className="grid grid-cols-1 gap-3">
                {STAT_KEYS.map((k) => (
                  <div key={k}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-stone-700">{k.toUpperCase()}</span>
                      <span className="tabular-nums text-stone-500">{draft.stats?.[k] ?? 50}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={draft.stats?.[k] ?? 50}
                        onChange={(e) => setStat(k, e.target.value)}
                        className="w-full"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.stats?.[k] ?? 50}
                        onChange={(e) => setStat(k, e.target.value)}
                        className="w-20 rounded border border-stone-300 bg-white px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-1 md:order-2 space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  이름<span className="text-rose-500"> *</span>
                </label>
                <input
                  className={FIELD}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="예) 손흥민"
                  autoFocus
                />
                {nameEmpty && (
                  <p className="mt-1 text-[11px] text-rose-600">*Required</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">멤버십</label>
                <select
                  className={DROPDOWN}
                  value={draft.membership}
                  onChange={(e) => setDraft({ ...draft, membership: e.target.value })}
                >
                  <option value="정회원">정회원</option>
                  <option value="게스트">게스트</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">포지션<span className="text-rose-500"> *</span></label>
                <select
                  className={DROPDOWN}
                  value={draft.position}
                  onChange={(e) => setDraft({ ...draft, position: e.target.value })}
                >
                  <option value="">선택</option>
                  <option value="GK">GK</option>
                  <option value="DF">DF</option>
                  <option value="MF">MF</option>
                  <option value="FW">FW</option>
                </select>
                 {posMissing && (
                   <p className="mt-1 text-[11px] text-rose-600">*Required</p>
                 )}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 px-4 pt-3 pb-3 border-t border-stone-200 bg-white min-h-[60px] pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-end gap-2">
            <button className="px-3 py-2 rounded-md border border-stone-300" onClick={onClose}>
              취소
            </button>
            <button
              className={`px-3 py-2 rounded-md text-white ${nameEmpty ? "bg-stone-300 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
              onClick={handleSave}
              disabled={nameEmpty||posMissing}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== 메인 페이지 =====
export default function PlayersPage({
  players = [],
  selectedId,
  onSelect = () => {},
  onCreate = () => {},
  onUpdate = () => {},
  onDelete = async () => {},
}) {
  const [confirm, setConfirm] = useState({ open: false, id: null, name: "" })
  const [editing, setEditing] = useState({ open: false, player: null })

  // ▼ 정렬 상태: 키 & 방향
  const [sortKey, setSortKey] = useState("name") // 'ovr' | 'pos' | 'name'
  const [sortDir, setSortDir] = useState("asc")  // 'asc' | 'desc'
  const POS_ORDER = ["GK","DF","MF","FW","OTHER",""] // 포지션 오름차순 기준

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

  const sorted = useMemo(() => {
    const arr = [...players]
    let cmp = cmpByNameAsc
    if (sortKey === "ovr") cmp = cmpByOvrAsc
    else if (sortKey === "pos") cmp = cmpByPosAsc
    arr.sort(applyDir(cmp))
    return arr
  }, [players, sortKey, sortDir])

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
    <div className="max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">선수 관리</h1>
        <div className="flex items-center gap-2">
          {/* ▼ 정렬 버튼들 (데스크톱) */}
          <div className="hidden sm:flex items-center gap-1 mr-2">
            <button
              className={`px-2 py-1.5 text-xs rounded border ${sortKey==='ovr' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-white hover:bg-stone-50'}`}
              onClick={()=>onSortClick('ovr')}
              title="OVR 정렬 (토글: 오름/내림)"
            >
              OVR {arrowFor('ovr')}
            </button>
            <button
              className={`px-2 py-1.5 text-xs rounded border ${sortKey==='pos' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-white hover:bg-stone-50'}`}
              onClick={()=>onSortClick('pos')}
              title="포지션 정렬 (토글: 오름/내림)"
            >
              포지션 {arrowFor('pos')}
            </button>
            <button
              className={`px-2 py-1.5 text-xs rounded border ${sortKey==='name' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-white hover:bg-stone-50'}`}
              onClick={()=>onSortClick('name')}
              title="이름 정렬 (토글: 오름/내림)"
            >
              이름 {arrowFor('name')}
            </button>
          </div>

          <button
            onClick={handleCreate}
            className="px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            새 선수
          </button>
        </div>
      </div>

      {/* 모바일 정렬 버튼 */}
      <div className="sm:hidden mb-3 flex items-center gap-1">
        <button
          className={`px-2 py-1.5 text-xs rounded border ${sortKey==='ovr' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-white'}`}
          onClick={()=>onSortClick('ovr')}
          title="OVR 정렬"
        >
          OVR {arrowFor('ovr')}
        </button>
        <button
          className={`px-2 py-1.5 text-xs rounded border ${sortKey==='pos' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-white'}`}
          onClick={()=>onSortClick('pos')}
          title="포지션 정렬"
        >
          포지션 {arrowFor('pos')}
        </button>
        <button
          className={`px-2 py-1.5 text-xs rounded border ${sortKey==='name' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-white'}`}
          onClick={()=>onSortClick('name')}
          title="이름 정렬"
        >
          이름 {arrowFor('name')}
        </button>
      </div>

      <div className="mb-2 text-xs text-stone-600 flex gap-3">
        <span>총 선수: <strong>{counts.total}</strong></span>
        <span>정회원: <strong>{counts.members}</strong></span>
        <span>게스트: <strong>{counts.guests}</strong></span>
      </div>

      <ul className="rounded-md border border-stone-200 bg-white divide-y divide-stone-200">
        {sorted.map((p) => {
          const mem = S(p.membership).trim()
          const guest = !isMember(mem)
          const pos = posOf(p)
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 px-3 py-2 ${selectedId === p.id ? "bg-emerald-50" : ""}`}
              onClick={() => onSelect(p.id)}
            >
              <InitialAvatar id={p.id} name={p.name} size={36} badges={guest?['G']:[]} />

              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 flex items-center gap-2">
                  <span className="truncate">{p.name || "이름없음"}</span>
                  {pos && <PosChip pos={pos} />}
                  {/* Guest is indicated on the avatar via badges */}
                  <span className="inline-flex items-center rounded bg-stone-800 px-2 py-0.5 text-[11px] text-white">
                    OVR&nbsp;{overall(p)}
                  </span>
                </div>
                <div className="text-xs text-stone-500">{mem || "미지정"}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="text-xs px-2 py-1 rounded-md border border-stone-300 hover:bg-stone-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(p)
                  }}
                >
                  편집
                </button>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-stone-300 hover:bg-stone-50"
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
