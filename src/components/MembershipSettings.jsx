// src/components/MembershipSettings.jsx
import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog'
import { DEFAULT_MEMBERSHIPS, BADGE_COLORS, getBadgeColorStyle, validateMembership, canDeleteMembership } from '../lib/membershipConfig'
import { addMembershipSetting, updateMembershipSetting, deleteMembershipSetting } from '../services/membership.service'
import { notify } from './Toast'

export default function MembershipSettings({ 
  customMemberships = [], 
  onSave, 
  onClose,
  players = []
}) {
  const [memberships, setMemberships] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [useCustomColor, setUseCustomColor] = useState(false)
  const [confirmState, setConfirmState] = useState({ open: false, target: null })
  const [locallyModified, setLocallyModified] = useState(false) // 로컬 수정 플래그

  useEffect(() => {
    // 로컬에서 수정한 경우 외부 업데이트 무시 (한 번만)
    if (locallyModified) {
      setLocallyModified(false)
      return
    }
    
    // 커스텀이 있으면 그것을 사용, 없으면 기본값 사용
    if (customMemberships.length > 0) {
      setMemberships(customMemberships)
    } else {
      setMemberships(DEFAULT_MEMBERSHIPS)
    }
  }, [customMemberships, locallyModified])

  const startAdd = () => {
    setEditingId('new')
    setUseCustomColor(false)
    setDraft({
      id: `custom-${Date.now()}`,
      name: '',
      badge: '',
      badgeColor: 'stone', // 기본은 프리셋
      color: 'stone',
      deletable: true,
    })
  }

  const startEdit = (membership) => {
    setEditingId(membership.id)
    // hex 색상이면 커스텀 모드
    setUseCustomColor(membership.badgeColor?.startsWith('#'))
    setDraft({ ...membership })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
    setUseCustomColor(false)
  }

  const saveEdit = async () => {
    const errors = validateMembership(draft)
    if (errors.length > 0) {
      notify(errors[0], 'error')
      return
    }

    try {
      if (editingId === 'new') {
        // 새 멤버십 추가 - DB에 저장
        const newMembership = {
          name: draft.name,
          badge: draft.badge || null,
          badge_color: draft.badgeColor,
          deletable: true,
          sort_order: memberships.length
        }
        const saved = await addMembershipSetting(newMembership)
        
        // DB에서 반환된 ID를 사용하되, UI 데이터는 draft에서 가져오기
        const newMembershipWithId = {
          id: saved.id,
          name: draft.name,
          badge: draft.badge || null,
          badgeColor: draft.badgeColor,
          deletable: true,
          sortOrder: saved.sortOrder || memberships.length
        }
        
        const updatedMemberships = [...memberships, newMembershipWithId]
        setMemberships(updatedMemberships)
        setLocallyModified(true) // 로컬 수정 플래그 설정
        // 부모 컴포넌트 업데이트 (즉시 반영)
        onSave(updatedMemberships)
        notify('새 멤버십이 추가되었습니다', 'success')
      } else {
        // 기존 멤버십 수정 - DB 업데이트
        const updates = {
          name: draft.name,
          badge: draft.badge || null,
          badge_color: draft.badgeColor
        }
        await updateMembershipSetting(editingId, updates)
        const updatedMemberships = memberships.map(m => m.id === editingId ? draft : m)
        setMemberships(updatedMemberships)
        setLocallyModified(true) // 로컬 수정 플래그 설정
        // 부모 컴포넌트 업데이트 (즉시 반영)
        onSave(updatedMemberships)
        notify('멤버십이 수정되었습니다', 'success')
      }

      cancelEdit()
    } catch (err) {
      notify('멤버십 저장에 실패했습니다: ' + err.message, 'error')
    }
  }

  const deleteMembership = async (membership) => {
    const { canDelete, usedCount } = canDeleteMembership(membership.id, players)
    
    if (!canDelete) {
      notify(`${usedCount}명의 선수가 이 멤버십을 사용 중입니다. 먼저 선수들의 멤버십을 변경해주세요.`, 'error')
      return
    }
    // Open confirm dialog; handle in onConfirm below
    setConfirmState({ open: true, target: membership })
  }

  const handleSave = () => {
    // 실시간 구독으로 자동 업데이트되므로 onSave는 제거
    notify('멤버십 설정이 저장되었습니다', 'success')
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-stone-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-stone-900">멤버십 설정</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-stone-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-stone-600 mt-1">
            팀에 맞는 멤버십 타입을 커스터마이징하세요
          </p>
        </div>

  {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {memberships.map(membership => (
              <div
                key={membership.id}
                className="border-2 border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors"
              >
                {editingId === membership.id ? (
                  // 수정 모드
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">멤버십 이름</label>
                      <input
                        type="text"
                        value={draft.name}
                        onChange={e => setDraft({ ...draft, name: e.target.value })}
                        className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                        placeholder="예: 정회원, 게스트, 트레이너"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          배지 텍스트 (선택, 1글자)
                        </label>
                        <input
                          type="text"
                          value={draft.badge || ''}
                          onChange={e => setDraft({ ...draft, badge: e.target.value.slice(0, 1) })}
                          className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                          placeholder="예: G, 준, T"
                          maxLength={1}
                        />
                        <p className="text-xs text-stone-500 mt-1">비워두면 배지 없음</p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-semibold text-stone-700">배지 색상</label>
                          <button
                            type="button"
                            onClick={() => {
                              setUseCustomColor(!useCustomColor)
                              if (!useCustomColor) {
                                setDraft({ ...draft, badgeColor: '#78716c' })
                              } else {
                                setDraft({ ...draft, badgeColor: 'stone' })
                              }
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                              useCustomColor 
                                ? 'bg-purple-100 text-purple-700 font-semibold'
                                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                            }`}
                          >
                            {useCustomColor ? '✓ 커스텀' : '커스텀'}
                          </button>
                        </div>
                        
                        {useCustomColor ? (
                          <>
                            <input
                              type="color"
                              value={draft.badgeColor?.startsWith('#') ? draft.badgeColor : '#78716c'}
                              onChange={e => setDraft({ ...draft, badgeColor: e.target.value })}
                              className="w-full h-10 border border-stone-300 rounded-md cursor-pointer"
                            />
                            <p className="text-xs text-stone-500 mt-1">{draft.badgeColor || '#78716c'}</p>
                          </>
                        ) : (
                          <>
                            <select
                              value={draft.badgeColor?.startsWith('#') ? 'stone' : (draft.badgeColor || 'stone')}
                              onChange={e => setDraft({ ...draft, badgeColor: e.target.value })}
                              className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                            >
                              {BADGE_COLORS.map(color => (
                                <option key={color.value} value={color.value}>
                                  {color.label}
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-stone-500 mt-1 invisible">placeholder</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 배지 미리보기 */}
                    {draft.badge && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-600">미리보기:</span>
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border"
                          style={{
                            backgroundColor: draft.badgeColor?.startsWith('#') 
                              ? `${draft.badgeColor}33` // hex + 20% opacity
                              : getBadgeColorStyle(draft.badgeColor).bg,
                            borderColor: draft.badgeColor?.startsWith('#')
                              ? draft.badgeColor
                              : getBadgeColorStyle(draft.badgeColor).border,
                            color: draft.badgeColor?.startsWith('#')
                              ? ((parseInt(draft.badgeColor.substr(1, 2), 16) * 299 + 
                                  parseInt(draft.badgeColor.substr(3, 2), 16) * 587 + 
                                  parseInt(draft.badgeColor.substr(5, 2), 16) * 114) / 1000 > 128 
                                  ? '#000' : '#fff')
                              : getBadgeColorStyle(draft.badgeColor).text,
                          }}
                        >
                          {draft.badge}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={saveEdit}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors"
                      >
                        저장
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg text-sm font-semibold hover:bg-stone-300 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  // 보기 모드
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {membership.badge ? (
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border"
                          style={{
                            backgroundColor: getBadgeColorStyle(membership.badgeColor).bg,
                            borderColor: getBadgeColorStyle(membership.badgeColor).border,
                            color: getBadgeColorStyle(membership.badgeColor).text,
                          }}
                        >
                          {membership.badge}
                        </span>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center">
                          <span className="text-xs text-stone-400">-</span>
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-stone-900">{membership.name}</div>
                        <div className="text-xs text-stone-500">
                          {membership.badge ? `배지: ${membership.badge}` : '배지 없음'}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(membership)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
                      >
                        수정
                      </button>
                      {membership.deletable && (
                        <button
                          onClick={() => deleteMembership(membership)}
                          className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-200 transition-colors"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 새 멤버십 추가 폼 */}
            {editingId === 'new' && draft && (
              <div className="border-2 border-emerald-300 bg-emerald-50 rounded-lg p-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">멤버십 이름</label>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={e => setDraft({ ...draft, name: e.target.value })}
                      className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                      placeholder="예: 정회원, 게스트, 트레이너"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        배지 텍스트 (선택, 1글자)
                      </label>
                      <input
                        type="text"
                        value={draft.badge || ''}
                        onChange={e => setDraft({ ...draft, badge: e.target.value.slice(0, 1) })}
                        className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                        placeholder="예: G, 준, T"
                        maxLength={1}
                      />
                      <p className="text-xs text-stone-500 mt-1">비워두면 배지 없음</p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-stone-700">배지 색상</label>
                        <button
                          type="button"
                          onClick={() => {
                            setUseCustomColor(!useCustomColor)
                            if (!useCustomColor) {
                              setDraft({ ...draft, badgeColor: '#78716c' })
                            } else {
                              setDraft({ ...draft, badgeColor: 'stone' })
                            }
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                            useCustomColor 
                              ? 'bg-purple-100 text-purple-700 font-semibold'
                              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {useCustomColor ? '✓ 커스텀' : '커스텀'}
                        </button>
                      </div>
                      
                      {useCustomColor ? (
                        <>
                          <input
                            type="color"
                            value={draft.badgeColor?.startsWith('#') ? draft.badgeColor : '#78716c'}
                            onChange={e => setDraft({ ...draft, badgeColor: e.target.value })}
                            className="w-full h-10 border border-stone-300 rounded-md cursor-pointer"
                          />
                          <p className="text-xs text-stone-500 mt-1">{draft.badgeColor || '#78716c'}</p>
                        </>
                      ) : (
                        <>
                          <select
                            value={draft.badgeColor?.startsWith('#') ? 'stone' : (draft.badgeColor || 'stone')}
                            onChange={e => setDraft({ ...draft, badgeColor: e.target.value })}
                            className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                          >
                            {BADGE_COLORS.map(color => (
                              <option key={color.value} value={color.value}>
                                {color.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-stone-500 mt-1 invisible">placeholder</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 배지 미리보기 */}
                  {draft.badge && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-600">미리보기:</span>
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border"
                        style={{
                          backgroundColor: draft.badgeColor?.startsWith('#') 
                            ? `${draft.badgeColor}33` // hex + 20% opacity
                            : getBadgeColorStyle(draft.badgeColor).bg,
                          borderColor: draft.badgeColor?.startsWith('#')
                            ? draft.badgeColor
                            : getBadgeColorStyle(draft.badgeColor).border,
                          color: draft.badgeColor?.startsWith('#')
                            ? ((parseInt(draft.badgeColor.substr(1, 2), 16) * 299 + 
                                parseInt(draft.badgeColor.substr(3, 2), 16) * 587 + 
                                parseInt(draft.badgeColor.substr(5, 2), 16) * 114) / 1000 > 128 
                                ? '#000' : '#fff')
                            : getBadgeColorStyle(draft.badgeColor).text,
                        }}
                      >
                        {draft.badge}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={saveEdit}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors"
                    >
                      추가
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg text-sm font-semibold hover:bg-stone-300 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 새 멤버십 추가 버튼 */}
            {editingId !== 'new' && (
              <button
                onClick={startAdd}
                className="w-full border-2 border-dashed border-stone-300 rounded-lg p-4 text-stone-600 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="font-semibold">새 멤버십 추가</span>
              </button>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-stone-200 text-stone-700 rounded-lg font-semibold hover:bg-stone-300 transition-colors"
          >
            닫기
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
          >
            적용
          </button>
        </div>

        {/* Confirm dialog for membership deletion */}
        <ConfirmDialog
          open={confirmState.open}
          title="멤버십 삭제"
          message={`"${confirmState.target?.name || ''}" 멤버십을 삭제하시겠습니까?`}
          confirmLabel="삭제하기"
          cancelLabel="취소"
          tone="danger"
          onCancel={() => setConfirmState({ open: false, target: null })}
          onConfirm={async () => {
            const membership = confirmState.target
            if (!membership) { setConfirmState({ open: false, target: null }); return }
            try {
              await deleteMembershipSetting(membership.id)
              const updatedMemberships = memberships.filter(m => m.id !== membership.id)
              setMemberships(updatedMemberships)
              setLocallyModified(true) // 로컬 수정 플래그 설정
              // 부모 컴포넌트 업데이트 (즉시 반영)
              onSave(updatedMemberships)
              notify('멤버십이 삭제되었습니다', 'success')
            } catch (err) {
              notify('멤버십 삭제에 실패했습니다: ' + err.message, 'error')
            } finally {
              setConfirmState({ open: false, target: null })
            }
          }}
        />
      </div>
    </div>,
    document.body
  )
}
