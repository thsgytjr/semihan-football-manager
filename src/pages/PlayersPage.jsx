// src/pages/PlayersPage.jsx
import React, { useMemo, useState, useEffect } from "react"
import { FaCheckCircle } from "react-icons/fa"
import { notify } from "../components/Toast"
import { overall } from "../lib/players"
import { STAT_KEYS } from "../lib/constants"

// ✅ 새로 분리된 공용 컴포넌트/유틸
import InitialAvatar from "../components/InitialAvatar"
import RadarHexagon from "../components/RadarHexagon"
import { ensureStatsObject, clampStat } from "../lib/stats"

// 라이트 전용 폼 클래스
const FIELD =
  "w-full bg-white text-stone-800 placeholder-stone-400 border border-stone-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
const DROPDOWN = FIELD + " appearance-none"

export default function PlayersPage({
  players,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onImport,
  onReset,
  positionLabel = "선호 포지션",
  dropdownClassName,
  badgeNote = "정회원은 자동으로 아래와 같은 배지가 부여됩니다:",
}) {
  const [draft, setDraft] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, id: null, name: "" })

  // 선택된 선수 변경 시 드래프트 동기화 (스탯 보정 포함)
  useEffect(() => {
    const target = players.find((p) => p.id === selectedId) || null
    setDraft(target ? { ...target, stats: ensureStatsObject(target.stats) } : null)
  }, [selectedId, players])

  const sorted = useMemo(
    () => [...players].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [players]
  )

  function ensureBadge(p) {
    const next = { ...p }
    next.badge = next.membership === "정회원" ? "badge" : ""
    return next
  }

  function isInvalidName(name) {
    const n = (name || "").trim()
    return n.length === 0 || n === "새 선수"
  }

  // 스탯 변경
  function setStat(key, value) {
    setDraft(prev => {
      if (!prev) return prev
      const next = { ...prev, stats: ensureStatsObject(prev.stats) }
      next.stats[key] = clampStat(value)
      return next
    })
  }

  function handleSave() {
    if (!draft) return
    if (isInvalidName(draft.name)) {
      notify("이름을 입력해 주세요.")
      return
    }
    if (!draft.membership || !draft.membership.trim()) {
      notify("멤버쉽을 선택해 주세요.")
      return
    }
    const normalized = { ...draft, stats: ensureStatsObject(draft.stats) }
    onUpdate(ensureBadge(normalized))
    notify("저장 완료")
  }

  function requestDelete(id, name) {
    setConfirm({ open: true, id, name: name || "" })
  }
  async function confirmDelete() {
    try {
      if (confirm.id) {
        await onDelete(confirm.id) // App 쪽에서 성공 토스트 처리
      }
    } catch (e) {
      notify("삭제에 실패했습니다. 다시 시도해 주세요.") // 실패시에만 알림
      console.error(e)
    } finally {
      setConfirm({ open: false, id: null, name: "" })
    }
  }
  function cancelDelete() {
    setConfirm({ open: false, id: null, name: "" })
  }

  return (
    <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ⭐ 선수 에디터 (최상단) */}
      <section className="lg:col-span-2">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">선수 편집</h3>
            <div className="flex items-center gap-2 text-xs text-stone-600">
              {badgeNote}
              <FaCheckCircle className="ml-2 inline-flex items-center gap-1 text-emerald-500 text-sm" />
            </div>
          </div>

          {!draft ? (
            <div className="text-sm text-stone-500">
              왼쪽에서 선수를 선택하거나 “새 선수”를 눌러 편집하세요.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {/* 1) 능력치 (최상단) + 6각형 레이더 */}
              <div className="rounded-md border border-stone-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-stone-700">능력치</div>
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    평균&nbsp;
                    <span className="font-semibold text-stone-700">
                      {Math.round(
                        STAT_KEYS.reduce((s, k) => s + (draft.stats?.[k] ?? 50), 0) / STAT_KEYS.length
                      )}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* 컨트롤 */}
                  <div className="order-2 md:order-1">
                    <div className="text-xs text-stone-500 mb-1">0–100 범위, 실시간 반영</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {STAT_KEYS.map((k) => (
                        <div key={k}>
                          <label className="mb-1 block text-xs text-stone-600">{k}</label>
                          <div className="flex items-center gap-2">
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

                  {/* 레이더 */}
                  <div className="order-1 md:order-2">
                    <RadarHexagon size={260} stats={draft.stats} />
                  </div>
                </div>
              </div>

              {/* 2) 기본 정보 */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2 flex items-center gap-3">
                  <InitialAvatar id={draft.id} name={draft.name} size={48} />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-stone-600">
                    이름<span className="text-rose-500"> *</span>
                  </label>
                  <input
                    className={FIELD}
                    value={draft.name || ""}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="예) 손흥민"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-stone-600">
                    멤버쉽<span className="text-rose-500"> *</span>
                  </label>
                  <select
                    className={dropdownClassName || DROPDOWN}
                    value={draft.membership || ""}
                    onChange={(e) => setDraft({ ...draft, membership: e.target.value })}
                  >
                    <option value="">멤버쉽 선택</option>
                    <option value="정회원">정회원</option>
                    <option value="게스트">게스트</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-stone-600">{positionLabel}</label>
                  <select
                    className={dropdownClassName || DROPDOWN}
                    value={draft.position || ""}
                    onChange={(e) => setDraft({ ...draft, position: e.target.value })}
                  >
                    <option value="">선택</option>
                    <option value="FW">FW</option>
                    <option value="MF">MF</option>
                    <option value="DF">DF</option>
                    <option value="GK">GK</option>
                  </select>
                </div>

                <div className="md:col-span-2 flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    className="rounded-md bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setDraft(null)}
                    className="rounded-md border border-stone-300 bg-white px-4 py-2 text-stone-700 hover:bg-stone-100"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 선수 목록 (편집 아래쪽) */}
      <section className="lg:col-span-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">선수 목록</h2>
          <div className="flex gap-2">
            <button
              onClick={onCreate}
              className="rounded-md bg-emerald-500 px-3 py-2 text-sm text-white hover:bg-emerald-600"
            >
              새 선수
            </button>
          </div>
        </div>

        <ul className="rounded-md border border-stone-200 bg-white divide-y divide-stone-200">
          {sorted.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${
                selectedId === p.id ? "bg-emerald-50" : ""
              }`}
              onClick={() => onSelect(p.id)}
            >
              <InitialAvatar id={p.id} name={p.name} size={36} />

              <div className="flex-1">
                <div className="font-medium text-stone-800 flex items-center gap-2">
                  {p.name || "이름없음"}
                  <span className="inline-flex items-center rounded bg-stone-800 px-2 py-0.5 text-[11px] text-white">
                    OVR&nbsp;{overall(p)}
                  </span>
                </div>
                <div className="text-xs text-stone-500">
                  {(p.membership || "미지정").trim()}
                  {p.membership === "정회원" && (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-500">
                      <FaCheckCircle className="text-sm" />
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  requestDelete(p.id, p.name)
                }}
                className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs hover:bg-stone-100"
              >
                삭제
              </button>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="px-3 py-6 text-sm text-stone-500">
              선수가 없습니다. “새 선수”를 눌러 추가하세요.
            </li>
          )}
        </ul>
      </section>

      {/* 삭제 확인 모달 */}
      {confirm.open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
            <div className="border-b border-stone-200 px-4 py-3">
              <h4 id="confirm-title" className="text-base font-semibold text-stone-800">
                선수 삭제 확인
              </h4>
            </div>
            <div className="px-4 py-4 text-sm text-stone-700">
              {confirm.name ? (
                <>정말로 <span className="font-semibold">{confirm.name}</span> 선수를 삭제하시겠어요?</>
              ) : (
                <>정말로 이 선수를 삭제하시겠어요?</>
              )}
              <div className="mt-1 text-xs text-stone-500">삭제하면 되돌릴 수 없습니다.</div>
            </div>
            <div className="flex justify-end gap-2 px-4 pb-4">
              <button
                onClick={cancelDelete}
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-md bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
