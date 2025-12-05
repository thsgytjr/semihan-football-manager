// src/pages/PlayersPage.jsx
import React, { useMemo, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { notify } from "../components/Toast"
import { overall, isUnknownPlayer, isSystemAccount, SYSTEM_ACCOUNT_STATUS } from "../lib/players"
import { logger } from "../lib/logger"
import { 
  STAT_KEYS, 
  PLAYER_ORIGINS, 
  PLAYER_GRADES,
  getOriginLabel, 
  migrateOriginToGrade,
  DETAILED_POSITIONS,
  ALL_DETAILED_POSITIONS,
  getPositionCategory,
  getPrimaryCategory,
  migratePositionToPositions,
  PLAYER_STATUS,
  getPlayerStatusLabel,
  getPlayerStatusColor,
  TAG_COLORS,
  getTagColorClass
} from "../lib/constants"
import InitialAvatar from "../components/InitialAvatar"
import RadarHexagon from "../components/RadarHexagon"
import { ensureStatsObject, clampStat } from "../lib/stats"
import { calculateAIPower, aiPowerChipClass } from "../lib/aiPower"
import { uploadPlayerPhoto, deletePlayerPhoto } from "../lib/photoUpload"
import { randomAvatarDataUrl } from "../utils/avatar"
import PositionChips from "../components/PositionChips"
import MembershipSettings from "../components/MembershipSettings"
import { DEFAULT_MEMBERSHIPS, getMembershipBadge } from "../lib/membershipConfig"
import ConfirmDialog from "../components/ConfirmDialog"

const VISIBLE_PLAYER_STATUS = PLAYER_STATUS.filter(status => status.value !== SYSTEM_ACCOUNT_STATUS)

const S = (v) => (v == null ? "" : String(v))
const posOf = (p) => {
  // 새로운 positions 배열 사용
  if (p.positions && Array.isArray(p.positions) && p.positions.length > 0) {
    return p.positions[0] // 첫 번째 포지션 반환
  }
  // 레거시 position 필드
  return S(p.position || p.pos).toUpperCase() || ""
}
const isMember = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === "member" || s.includes("정회원")
}
const isAssociate = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === "associate" || s.includes("준회원")
}
const isGuest = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === "guest" || s.includes("게스트")
}

const buildSystemAccountStats = () => {
  const stats = {}
  STAT_KEYS.forEach(key => {
    stats[key] = 30
  })
  return stats
}

function OriginChip({ origin }) {
  if (!origin || origin === "none") return null
  const label = getOriginLabel(origin)
  const cls = origin === "pro"
    ? "bg-purple-100 text-purple-800 border border-purple-200"
    : origin === "semi-pro"
    ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
    : origin === "amateur"
    ? "bg-blue-100 text-blue-800 border border-blue-200"
    : origin === "college" // 레거시 지원
    ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
    : "bg-stone-100 text-stone-800 border border-stone-200"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium ${cls}`}>
      {label}
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

// OVR 파워미터 색상 (진행 바용)
const ovrMeterColor = (ovr) => {
  if (ovr >= 80) return 'bg-emerald-400'
  if (ovr >= 70) return 'bg-blue-400'
  if (ovr >= 60) return 'bg-amber-400'
  return 'bg-stone-400'
}

// AI 파워 파워미터 색상 (진행 바용)
const aiPowerMeterColor = (power) => {
  if (power >= 95) return 'bg-gradient-to-r from-purple-400 to-pink-400'
  if (power >= 90) return 'bg-gradient-to-r from-purple-500 to-purple-600'
  if (power >= 85) return 'bg-gradient-to-r from-emerald-400 to-emerald-500'
  if (power >= 80) return 'bg-gradient-to-r from-blue-400 to-blue-500'
  if (power >= 70) return 'bg-gradient-to-r from-amber-400 to-amber-500'
  return 'bg-gradient-to-r from-stone-400 to-stone-500'
}

// ===== 편집 모달 =====
function EditPlayerModal({ open, player, onClose, onSave, tagPresets = [], onAddTagPreset, onUpdateTagPreset, onDeleteTagPreset, customMemberships = [], isAdmin, systemAccountExists = true, onEnsureSystemAccount = null }) {
  const [draft, setDraft] = useState(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('blue')
  const [editingTagIndex, setEditingTagIndex] = useState(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('blue')
  const [confirmTagDelete, setConfirmTagDelete] = useState({ open: false, index: null, name: '' })
  const [creatingSystemAccount, setCreatingSystemAccount] = useState(false)

  useEffect(() => {
    if (open && player !== undefined) {
      // 레거시 position을 positions 배열로 마이그레이션
      const migratedPositions = migratePositionToPositions(player)
      
      // 멤버십 정규화: 커스텀 멤버십 먼저 확인, 없으면 기본 멤버십으로 변환
      let normalizedMembership = "정회원" // 기본값
      if (player.membership) {
        const mem = S(player.membership).trim()
        
        // 1. 커스텀 멤버십인지 확인 (이름으로 찾기)
        const customMatch = customMemberships.find(cm => cm.name === mem)
        if (customMatch) {
          // 커스텀 멤버십이면 그대로 사용
          normalizedMembership = mem
        } else {
          // 2. 기본 멤버십으로 정규화
          if (isAssociate(mem)) {
            normalizedMembership = "준회원"
          } else if (isGuest(mem)) {
            normalizedMembership = "게스트"
          } else if (isMember(mem)) {
            normalizedMembership = "정회원"
          } else {
            // 3. 어디에도 해당하지 않으면 그대로 사용 (커스텀일 가능성)
            normalizedMembership = mem
          }
        }
      }
      
      // 선수 등급 마이그레이션: 기존 college → semi-pro, none → regular
      const migratedOrigin = player.origin ? migrateOriginToGrade(player.origin) : "regular"
      
      setDraft({
        ...player,
        id: player?.id || `new-${Date.now()}`,
        name: player?.name || "",
        positions: migratedPositions,
        membership: normalizedMembership,
        origin: migratedOrigin,
        status: player.status || "active", // 상태 기본값
        tags: player.tags || [], // 태그 배열
        stats: ensureStatsObject(player.stats),
        photoUrl: player.photoUrl || null,
      })
      setShowUrlInput(false)
      setUrlInput('')
      
      // 모달 열릴 때 body 스크롤 완전히 잠금
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
      
      return () => {
        // 모달 닫힐 때 원래 위치로 복원
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    } else {
      setDraft(null)
    }
  }, [open, player])

  const nameEmpty = !S(draft?.name).trim()
  const isNew = !player?.id
  const isSystemDraft = (draft?.status || 'active') === SYSTEM_ACCOUNT_STATUS
  const posMissing = isNew && !isSystemDraft && (!draft?.positions || draft.positions.length === 0)

  if (!open || !draft) return null

  // 사진 업로드 함수
  const onPickPhoto = async (file) => {
    if(!file) return
    setUploading(true)
    try{
      const playerName = draft.name?.trim() || 'unnamed'
      const playerId = draft.id || 'temp'
      // 원래 선수의 photoUrl을 전달 (draft가 아닌 player에서)
      const originalPhotoUrl = player?.photoUrl
      
      const publicUrl = await uploadPlayerPhoto(file, playerId, playerName, originalPhotoUrl)
      
      // 강제 리렌더링을 위해 해시 추가
      setDraft(prev => ({...prev, photoUrl: `${publicUrl}#${Date.now()}`}))
      
      notify('✅ 사진이 업로드되었습니다.', 'success', 2000)
    } catch(err) {
      logger.error('❌ 업로드 에러:', err)
      notify(`❌ ${err.message || '사진 업로드에 실패했습니다.'}`, 'error', 5000)
    } finally {
      setUploading(false)
    }
  }
  
  const applyUrlInput = () => {
    if(!urlInput.trim()){
      notify('URL을 입력해주세요.', 'error')
      return
    }
    setDraft(prev => ({...prev, photoUrl: urlInput.trim()}))
    setUrlInput('')
    setShowUrlInput(false)
    notify('사진 URL이 적용되었습니다.')
  }
  
  const resetToRandom = async () => {
    // 기존 업로드된 사진이 있으면 버킷에서 삭제
    if(draft.photoUrl && !draft.photoUrl.startsWith('RANDOM:') && draft.photoUrl.includes('player-photos')){
      try {
        await deletePlayerPhoto(draft.photoUrl)
      } catch(err) {
        logger.error('Failed to delete old photo:', err)
      }
    }
    
    // 랜덤 버튼 클릭 시 RANDOM: prefix와 랜덤 값으로 매번 다른 색상 생성
    const randomSeed = 'RANDOM:' + Date.now() + Math.random()
    setDraft(prev => ({...prev, photoUrl: randomSeed}))
    notify('랜덤 아바타가 적용되었습니다.')
  }

  const setStat = (k, v) =>
    setDraft((prev) => {
      const next = { ...prev, stats: ensureStatsObject(prev.stats) }
      next.stats[k] = clampStat(Number(v))
      return next
    })

  const handleSave = async () => {
    if (nameEmpty) {
      notify("이름을 입력해 주세요.", "error")
      return
    }
    if (posMissing) {
      notify("포지션을 선택해 주세요.", "error")
      return
    }
    
    // 이전 사진이 있었는데 변경된 경우 삭제
    const oldPhotoUrl = player?.photoUrl
    // URL에서 해시 프래그먼트와 쿼리 파라미터 모두 제거
    const cleanNewPhotoUrl = draft.photoUrl ? draft.photoUrl.split('?')[0].split('#')[0] : null
    const cleanOldPhotoUrl = oldPhotoUrl ? oldPhotoUrl.split('?')[0].split('#')[0] : null
    
    if (cleanOldPhotoUrl && cleanOldPhotoUrl !== cleanNewPhotoUrl) {
      // 이전 사진이 업로드된 사진(player-photos 버킷)이고, RANDOM이 아닌 경우
      if (!cleanOldPhotoUrl.startsWith('RANDOM:') && cleanOldPhotoUrl.includes('player-photos')) {
        try {
          await deletePlayerPhoto(cleanOldPhotoUrl)
        } catch (error) {
          logger.error('❌ 삭제 실패:', error)
        }
      }
    }
    
    // 최종 저장할 URL (쿼리 파라미터 포함, 해시만 제거)
    const finalPhotoUrl = draft.photoUrl ? draft.photoUrl.split('#')[0] : null
    
    const payload = {
      ...player,
      ...draft,
      name: S(draft.name).trim(),
      positions: draft.positions || [], // 새로운 positions 배열
      position: undefined, // 레거시 필드 제거
      membership: draft.membership,
      origin: draft.origin || "none",
      status: draft.status || "active", // 상태
      tags: draft.tags || [], // 태그
      stats: ensureStatsObject(draft.stats),
      photoUrl: finalPhotoUrl, // 해시 제거, 쿼리 파라미터 유지
    }

    if ((payload.status || 'active') === SYSTEM_ACCOUNT_STATUS) {
      payload.positions = []
      payload.stats = buildSystemAccountStats()
    }
    
    // 새 선수일 경우 ID 제거 (Supabase가 자동 생성)
    if (!player?.id || String(player.id).startsWith('new-')) {
      delete payload.id
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
  const mem = S(draft.membership).trim()
  
  // 커스텀 배지 정보 가져오기
  const badgeInfo = getMembershipBadge(mem, customMemberships)
  const badges = badgeInfo ? [badgeInfo.badge] : []

  // OVR에 따른 색상
  const getOVRColor = (ovr) => {
    if (ovr >= 80) return 'from-emerald-500 to-emerald-600'
    if (ovr >= 70) return 'from-blue-500 to-blue-600'
    if (ovr >= 60) return 'from-amber-500 to-amber-600'
    return 'from-stone-500 to-stone-600'
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm animate-fadeIn flex items-center justify-center p-0 md:p-4"
      onKeyDown={onKeyDown}
      onClick={onClose}
    >
      <div 
        className="bg-white w-full md:max-w-5xl md:rounded-2xl shadow-2xl flex flex-col min-h-0 max-h-[95dvh] md:max-h-[90dvh] animate-slideUp"
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
              <InitialAvatar 
                key={draft.photoUrl || 'no-photo'} 
                id={draft.id} 
                name={draft.name} 
                size={56} 
                badges={badges}
                photoUrl={draft.photoUrl}
                customMemberships={customMemberships}
                badgeInfo={badgeInfo}
              />
              {liveOVR >= 75 && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center text-[10px] font-bold text-amber-900">
                  ★
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-stone-900 mb-1">
                {isNew ? '새 선수 추가' : '선수 정보 수정'}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-stone-500">{draft.name || '이름을 입력하세요'}</span>
                {draft.positions && draft.positions.length > 0 && (
                  <>
                    <span className="text-stone-300">·</span>
                    <PositionChips positions={draft.positions} size="sm" maxDisplay={3} />
                  </>
                )}
              </div>
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
          {isNew && !systemAccountExists && (
            <div className="mb-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-stone-700">
                회계 장부 전용 시스템 계정이 아직 없습니다. 아래 버튼을 눌러 자동으로 생성하면 모든 화면에서 숨겨지고 회계에서만 사용됩니다.
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!onEnsureSystemAccount) return
                  setCreatingSystemAccount(true)
                  try {
                    await onEnsureSystemAccount()
                    onClose()
                  } catch (err) {
                    notify('시스템 계정 생성에 실패했습니다. 다시 시도해주세요.', 'error')
                  } finally {
                    setCreatingSystemAccount(false)
                  }
                }}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${creatingSystemAccount ? 'bg-stone-300 text-stone-500 cursor-not-allowed' : 'bg-stone-900 text-white hover:bg-stone-800'}`}
                disabled={creatingSystemAccount}
              >
                {creatingSystemAccount ? '생성 중...' : '시스템 계정 자동 생성'}
              </button>
            </div>
          )}
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
                  {/* 사진 업로드 섹션 */}
                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">선수 사진</label>
                    <div className="flex items-center gap-3 mb-3">
                      <InitialAvatar 
                        key={draft.photoUrl || 'no-photo'}
                        id={draft.id} 
                        name={draft.name} 
                        size={64} 
                        photoUrl={draft.photoUrl}
                        badges={badges}
                        customMemberships={customMemberships}
                        badgeInfo={badgeInfo}
                      />
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className={`cursor-pointer rounded-lg border-2 bg-white px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-2 ${uploading ? 'opacity-50 cursor-not-allowed border-stone-300 text-stone-500' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}>
                            {uploading && (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                              </svg>
                            )}
                            {uploading ? '업로드 중...' : '업로드'}
                            <input hidden type="file" accept="image/*" onChange={(e)=> onPickPhoto(e.target.files?.[0] || null)} disabled={uploading} />
                          </label>
                          <button 
                            type="button"
                            className="text-xs font-medium text-blue-700 rounded-lg border-2 border-blue-200 bg-white px-3 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                            onClick={()=>setShowUrlInput(!showUrlInput)}
                            disabled={uploading}
                          >
                            URL
                          </button>
                          <button 
                            type="button"
                            className="text-xs font-medium text-blue-700 rounded-lg border-2 border-blue-200 bg-white px-3 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                            onClick={resetToRandom}
                            disabled={uploading}
                          >
                            랜덤
                          </button>
                        </div>
                        
                        {/* URL 입력 필드 */}
                        {showUrlInput && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={urlInput}
                              onChange={(e)=>setUrlInput(e.target.value)}
                              placeholder="https://...supabase.co/storage/..."
                              className="flex-1 rounded-lg border-2 border-blue-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                              onKeyDown={(e)=>e.key==='Enter' && applyUrlInput()}
                            />
                            <button 
                              type="button"
                              className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
                              onClick={applyUrlInput}
                            >
                              적용
                            </button>
                            <button 
                              type="button"
                              className="text-xs text-blue-600 hover:text-blue-800"
                              onClick={()=>{setShowUrlInput(false); setUrlInput('')}}
                            >
                              취소
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

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
                    <label className="block text-xs font-semibold text-blue-900 mb-2">
                      선호 포지션<span className="text-rose-500 ml-1">*</span>
                      <span className="ml-2 text-[10px] font-normal text-blue-600">(여러 개 선택 가능)</span>
                    </label>
                    
                    {/* 선택된 포지션 표시 */}
                    {draft.positions && draft.positions.length > 0 && (
                      <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-[10px] font-semibold text-blue-700 mb-2">선택된 포지션</div>
                        <PositionChips positions={draft.positions} size="md" maxDisplay={10} />
                      </div>
                    )}
                    
                    {/* 카테고리별 상세 포지션 선택 */}
                    <div className="space-y-3">
                      {Object.entries(DETAILED_POSITIONS).map(([category, positions]) => (
                        <div key={category}>
                          <div className={`text-[10px] font-bold mb-2 ${
                            category === 'GK' ? 'text-amber-700' :
                            category === 'DF' ? 'text-blue-700' :
                            category === 'MF' ? 'text-emerald-700' :
                            'text-purple-700'
                          }`}>
                            {category === 'GK' ? '골키퍼' :
                             category === 'DF' ? '수비수' :
                             category === 'MF' ? '미드필더' :
                             '공격수'}
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {positions.map(pos => {
                              const isSelected = draft.positions?.includes(pos.value)
                              return (
                                <button
                                  key={pos.value}
                                  type="button"
                                  onClick={() => {
                                    const currentPositions = draft.positions || []
                                    const newPositions = isSelected
                                      ? currentPositions.filter(p => p !== pos.value)
                                      : [...currentPositions, pos.value]
                                    setDraft({ ...draft, positions: newPositions })
                                  }}
                                  className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                                    isSelected
                                      ? category === 'GK' ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300'
                                        : category === 'DF' ? 'bg-blue-500 text-white shadow-md ring-2 ring-blue-300'
                                        : category === 'MF' ? 'bg-emerald-500 text-white shadow-md ring-2 ring-emerald-300'
                                        : 'bg-purple-500 text-white shadow-md ring-2 ring-purple-300'
                                      : 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-400 hover:shadow-sm'
                                  }`}
                                  title={pos.fullLabel}
                                >
                                  {pos.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                      
                      {/* 레거시 포지션 (상세 포지션을 모를 때만 사용) */}
                      <div className="mt-4 pt-4 border-t border-stone-200">
                        <div className="text-[10px] font-bold mb-2 text-stone-500">
                          정확한 포지션을 모를 때 (일반)
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { value: 'GK', label: 'GK', color: 'amber' },
                            { value: 'DF', label: 'DF', color: 'blue' },
                            { value: 'MF', label: 'MF', color: 'emerald' },
                            { value: 'FW', label: 'FW', color: 'purple' }
                          ].map(pos => {
                            const isSelected = draft.positions?.includes(pos.value)
                            return (
                              <button
                                key={pos.value}
                                type="button"
                                onClick={() => {
                                  const currentPositions = draft.positions || []
                                  const newPositions = isSelected
                                    ? currentPositions.filter(p => p !== pos.value)
                                    : [...currentPositions, pos.value]
                                  setDraft({ ...draft, positions: newPositions })
                                }}
                                className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                  isSelected
                                    ? pos.color === 'amber' ? 'bg-amber-400 text-white shadow-sm ring-2 ring-amber-200'
                                      : pos.color === 'blue' ? 'bg-blue-400 text-white shadow-sm ring-2 ring-blue-200'
                                      : pos.color === 'emerald' ? 'bg-emerald-400 text-white shadow-sm ring-2 ring-emerald-200'
                                      : 'bg-purple-400 text-white shadow-sm ring-2 ring-purple-200'
                                    : 'bg-stone-50 border-2 border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-100'
                                }`}
                              >
                                {pos.label}
                              </button>
                            )
                          })}
                        </div>
                        <div className="text-[10px] text-stone-500 mt-2">
                          예: 수비수인데 정확히 어떤 포지션인지 모를 때 "DF" 선택
                        </div>
                      </div>
                    </div>
                    
                    {posMissing && (
                      <p className="mt-3 text-xs text-rose-600 flex items-center gap-1 bg-rose-50 p-2 rounded-lg">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        최소 1개 이상의 포지션을 선택해주세요
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">멤버십</label>
                    <div className="grid grid-cols-3 gap-2">
                      {customMemberships.map(membership => {
                        const isSelected = draft.membership === membership.name
                        const badgeInfo = getMembershipBadge(membership.name, customMemberships)
                        
                        // 선택된 상태 스타일
                        let selectedClass = 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-300'
                        let buttonStyle = {}
                        
                        if (isSelected && badgeInfo && badgeInfo.colorStyle) {
                          selectedClass = `text-white shadow-lg scale-105`
                          buttonStyle = {
                            backgroundColor: badgeInfo.colorStyle.bg,
                            color: badgeInfo.colorStyle.text
                          }
                        } else if (isSelected) {
                          selectedClass = 'bg-emerald-500 text-white shadow-lg scale-105'
                        }
                        
                        return (
                          <button
                            key={membership.id}
                            type="button"
                            onClick={() => setDraft({ ...draft, membership: membership.name })}
                            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all relative ${selectedClass}`}
                            style={buttonStyle}
                          >
                            {membership.name}
                            {badgeInfo && badgeInfo.colorStyle && (
                              <span 
                                className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border-2"
                                style={{ 
                                  backgroundColor: badgeInfo.colorStyle.bg,
                                  borderColor: badgeInfo.colorStyle.border,
                                  color: badgeInfo.colorStyle.text
                                }}
                              >
                                {badgeInfo.badge}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">선수 등급</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PLAYER_ORIGINS.map(grade => {
                        const isSelected = draft.origin === grade.value
                        let selectedClass = 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-300'
                        
                        if (isSelected) {
                          if (grade.value === 'pro') {
                            selectedClass = 'bg-purple-500 text-white shadow-lg scale-105'
                          } else if (grade.value === 'semi-pro') {
                            selectedClass = 'bg-indigo-500 text-white shadow-lg scale-105'
                          } else if (grade.value === 'amateur') {
                            selectedClass = 'bg-blue-500 text-white shadow-lg scale-105'
                          } else {
                            selectedClass = 'bg-stone-500 text-white shadow-lg scale-105'
                          }
                        }
                        
                        return (
                          <button
                            key={grade.value}
                            type="button"
                            onClick={() => setDraft({ ...draft, origin: grade.value })}
                            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${selectedClass}`}
                          >
                            {grade.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">선수 상태</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {VISIBLE_PLAYER_STATUS.map(status => {
                        const isSelected = draft.status === status.value
                        let selectedClass = 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-300'
                        
                        if (isSelected) {
                          if (status.color === 'emerald') {
                            selectedClass = 'bg-emerald-500 text-white shadow-lg scale-105'
                          } else if (status.color === 'red') {
                            selectedClass = 'bg-red-500 text-white shadow-lg scale-105'
                          } else if (status.color === 'blue') {
                            selectedClass = 'bg-blue-500 text-white shadow-lg scale-105'
                          } else if (status.color === 'amber') {
                            selectedClass = 'bg-amber-500 text-white shadow-lg scale-105'
                          } else if (status.color === 'slate') {
                            selectedClass = 'bg-slate-500 text-white shadow-lg scale-105'
                          } else {
                            selectedClass = 'bg-stone-500 text-white shadow-lg scale-105'
                          }
                        }
                        
                        return (
                          <button
                            key={status.value}
                            type="button"
                            onClick={() => setDraft({ ...draft, status: status.value })}
                            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${selectedClass}`}
                          >
                            {status.label}
                          </button>
                        )
                      })}
                    </div>
                    {isSystemDraft && (
                      <p className="text-[11px] text-stone-600 mt-2">
                        시스템 계정은 매치 플래너, 회비·리뉴얼 목록 등 사용자 화면에서 자동으로 숨겨집니다.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">
                      커스텀 태그
                      <span className="ml-2 text-[10px] font-normal text-blue-600">(선수 분류 및 정리용)</span>
                    </label>
                    
                    {/* 현재 선택된 태그 표시 */}
                    {draft.tags && draft.tags.length > 0 && (
                      <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-[10px] font-semibold text-blue-700 mb-2">선택된 태그</div>
                        <div className="flex flex-wrap gap-2">
                          {draft.tags.map((tag, idx) => {
                            const isCustomColor = tag.color && tag.color.startsWith('#')
                            return (
                              <div
                                key={idx}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                  isCustomColor ? 'border-stone-300' : getTagColorClass(tag.color)
                                }`}
                                style={isCustomColor ? {
                                  backgroundColor: tag.color + '20',
                                  color: tag.color,
                                  borderColor: tag.color
                                } : {}}
                              >
                                <span>{tag.name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newTags = draft.tags.filter((_, i) => i !== idx)
                                    setDraft({ ...draft, tags: newTags })
                                  }}
                                  className="hover:opacity-70 transition-opacity"
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* 프리셋 태그 선택 */}
                    {tagPresets && tagPresets.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] font-semibold text-stone-700 mb-2">프리셋 태그 (클릭하여 추가)</div>
                        <div className="flex flex-wrap gap-2">
                          {tagPresets.map((preset, idx) => {
                            const isSelected = draft.tags?.some(t => t.name === preset.name && t.color === preset.color)
                            const isEditing = editingTagIndex === idx
                            
                            if (isEditing && isAdmin) {
                              return (
                                <div key={idx} className="flex flex-col gap-2 bg-blue-50 border-2 border-blue-300 rounded-lg p-3">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editTagName}
                                      onChange={(e) => setEditTagName(e.target.value)}
                                      placeholder="태그 이름"
                                      className="flex-1 rounded border-2 border-blue-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && editTagName.trim()) {
                                          e.preventDefault()
                                          onUpdateTagPreset(idx, { name: editTagName.trim(), color: editTagColor })
                                          setEditingTagIndex(null)
                                        } else if (e.key === 'Escape') {
                                          setEditingTagIndex(null)
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (editTagName.trim()) {
                                          onUpdateTagPreset(idx, { name: editTagName.trim(), color: editTagColor })
                                          setEditingTagIndex(null)
                                        }
                                      }}
                                      className="p-1 hover:bg-blue-100 rounded transition-colors"
                                      title="저장"
                                    >
                                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingTagIndex(null)}
                                      className="p-1 hover:bg-blue-100 rounded transition-colors"
                                      title="취소"
                                    >
                                      <svg className="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  {/* 색상 팔레트 */}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {TAG_COLORS.map(color => (
                                      <button
                                        key={color.value}
                                        type="button"
                                        onClick={() => setEditTagColor(color.value)}
                                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${getTagColorClass(color.value)} ${
                                          editTagColor === color.value ? 'ring-2 ring-blue-500 scale-110 shadow-sm' : ''
                                        }`}
                                        title={color.label}
                                      ></button>
                                    ))}
                                    {/* 커스텀 색상 */}
                                    <div className="relative">
                                      <input
                                        type="color"
                                        value={editTagColor.startsWith('#') ? editTagColor : '#3b82f6'}
                                        onChange={(e) => setEditTagColor(e.target.value)}
                                        className="w-6 h-6 rounded border-2 border-stone-300 cursor-pointer"
                                        title="커스텀 색상"
                                      />
                                      {editTagColor.startsWith('#') && (
                                        <div 
                                          className="absolute inset-0 rounded border-2 border-stone-300 pointer-events-none"
                                          style={{ backgroundColor: editTagColor }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            }
                            
                            return (
                              <div key={idx} className="relative group">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      const newTags = draft.tags.filter(t => !(t.name === preset.name && t.color === preset.color))
                                      setDraft({ ...draft, tags: newTags })
                                    } else {
                                      setDraft({ ...draft, tags: [...(draft.tags || []), preset] })
                                    }
                                  }}
                                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    preset.color && preset.color.startsWith('#')
                                      ? 'border-stone-300'
                                      : isSelected 
                                        ? `${getTagColorClass(preset.color)} ring-2 ring-blue-400 shadow-sm` 
                                        : `${getTagColorClass(preset.color)} opacity-60 hover:opacity-100`
                                  }`}
                                  style={preset.color && preset.color.startsWith('#') ? {
                                    backgroundColor: isSelected ? preset.color + '40' : preset.color + '20',
                                    color: preset.color,
                                    borderColor: preset.color,
                                    opacity: isSelected ? 1 : 0.6
                                  } : {}}
                                >
                                  {preset.name}
                                </button>
                                {isAdmin && (
                                  <div className="absolute -top-2 -right-2 hidden group-hover:flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingTagIndex(idx)
                                        setEditTagName(preset.name)
                                        setEditTagColor(preset.color)
                                      }}
                                      className="p-1 bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-lg transition-colors"
                                      title="편집"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setConfirmTagDelete({ open: true, index: idx, name: preset.name })
                                      }}
                                      className="p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 shadow-lg transition-colors"
                                      title="삭제"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* 새 태그 추가 (프리셋으로 저장) */}
                    {isAdmin && (
                      <div className="space-y-3 p-3 bg-stone-50 rounded-lg border border-stone-200">
                        <div className="text-[10px] font-semibold text-stone-700 mb-2">새 태그 프리셋 만들기</div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder="태그 이름 (예: Old Boys)"
                            className="flex-1 rounded-lg border-2 border-stone-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newTagName.trim()) {
                                e.preventDefault()
                                const newPreset = { name: newTagName.trim(), color: newTagColor }
                                onAddTagPreset(newPreset)
                                setNewTagName('')
                                setNewTagColor('blue')
                              }
                            }}
                          />
                          
                          <button
                            type="button"
                            onClick={() => {
                              if (newTagName.trim()) {
                                const newPreset = { name: newTagName.trim(), color: newTagColor }
                                onAddTagPreset(newPreset)
                                setNewTagName('')
                                setNewTagColor('blue')
                              }
                            }}
                            disabled={!newTagName.trim()}
                            className="rounded-lg bg-stone-600 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            프리셋 저장
                          </button>
                        </div>
                        
                        {/* 색상 팔레트 */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-semibold text-stone-700">색상 선택:</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {TAG_COLORS.map(color => (
                              <button
                                key={color.value}
                                type="button"
                                onClick={() => setNewTagColor(color.value)}
                                className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 ${getTagColorClass(color.value)} ${
                                  newTagColor === color.value ? 'ring-2 ring-blue-500 scale-110 shadow-md' : 'hover:shadow-sm'
                                }`}
                                title={color.label}
                              ></button>
                            ))}
                            {/* 커스텀 색상 선택 */}
                            <div className="relative">
                              <input
                                type="color"
                                value={newTagColor.startsWith('#') ? newTagColor : '#3b82f6'}
                                onChange={(e) => setNewTagColor(e.target.value)}
                                className="w-8 h-8 rounded-lg border-2 border-stone-300 cursor-pointer overflow-hidden"
                                style={{
                                  WebkitAppearance: 'none',
                                  appearance: 'none',
                                  backgroundColor: 'transparent'
                                }}
                                title="커스텀 색상 선택"
                              />
                              <div 
                                className="absolute inset-0 rounded-lg border-2 border-stone-300 pointer-events-none flex items-center justify-center"
                                style={{
                                  backgroundColor: newTagColor.startsWith('#') ? newTagColor : 'transparent'
                                }}
                              >
                                {newTagColor.startsWith('#') && (
                                  <svg className="w-4 h-4 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-[10px] text-stone-500">
                          프리셋으로 저장하면 모든 선수 편집 시 빠르게 선택할 수 있습니다
                        </div>
                      </div>
                    )}
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
            Tip: ⌘+Enter (또는 Ctrl+Enter)로 빠르게 저장 | ESC로 닫기
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
      
      {/* 업로드 로딩 오버레이 */}
      {uploading && (
        <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-sm flex items-center justify-center rounded-2xl">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm mx-4">
            <svg className="w-16 h-16 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            <div className="text-center">
              <div className="text-lg font-bold text-stone-900 mb-1">사진 업로드 중...</div>
              <div className="text-sm text-stone-500">잠시만 기다려주세요</div>
            </div>
          </div>
        </div>
      )}
      
      {/* ConfirmDialog for tag preset deletion */}
      <ConfirmDialog
        open={confirmTagDelete.open}
        title="태그 삭제"
        message={`"${confirmTagDelete.name}" 태그를 삭제하시겠습니까?`}
        confirmLabel="삭제하기"
        cancelLabel="취소"
        tone="danger"
        onCancel={() => setConfirmTagDelete({ open: false, index: null, name: '' })}
        onConfirm={() => {
          if (confirmTagDelete.index != null) onDeleteTagPreset(confirmTagDelete.index)
          setConfirmTagDelete({ open: false, index: null, name: '' })
        }}
      />
    </div>
  )

  return createPortal(modalContent, document.body)
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
  tagPresets = [],
  onAddTagPreset = () => {},
  onUpdateTagPreset = () => {},
  onDeleteTagPreset = () => {},
  membershipSettings = [],
  onSaveMembershipSettings = () => {},
  isAdmin = false,
  systemAccount = null,
  onEnsureSystemAccount = null,
}) {
  const [confirm, setConfirm] = useState({ open: false, id: null, name: "" })
  const [editing, setEditing] = useState({ open: false, player: null })
  const [showMembershipSettings, setShowMembershipSettings] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('playersViewMode') || 'list') // 'card' | 'list'
  const [membershipFilter, setMembershipFilter] = useState('all') // 'all' | 'member' | 'associate' | 'guest'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'injured' | etc.
  const [positionFilter, setPositionFilter] = useState('all') // 'all' | 'GK' | 'DF' | 'MF' | 'FW'
  const [selectedTags, setSelectedTags] = useState([]) // 선택된 태그들
  const [searchQuery, setSearchQuery] = useState('') // 검색어
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false) // 고급 필터 표시 여부
  const systemAccountExists = Boolean(systemAccount)
  const rosterPlayers = useMemo(() => players.filter(p => !p.isSystemAccount), [players])

  const resetFilters = () => {
    setMembershipFilter('all')
    setStatusFilter('all')
    setPositionFilter('all')
    setSelectedTags([])
    setSearchQuery('')
  }
  
  // 활성화된 필터 개수 계산
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (statusFilter !== 'all') count++
    if (positionFilter !== 'all') count++
    if (selectedTags.length > 0) count++
    return count
  }, [statusFilter, positionFilter, selectedTags])

  // 커스텀 멤버십 (없으면 기본값)
  const customMemberships = membershipSettings.length > 0 ? membershipSettings : DEFAULT_MEMBERSHIPS

  // 멤버십이 삭제되었을 때 필터 초기화
  useEffect(() => {
    // 'all', 'member', 'associate', 'guest'는 기본 필터이므로 항상 유효
    if (['all', 'member', 'associate', 'guest'].includes(membershipFilter)) {
      return
    }
    
    // 현재 필터가 커스텀 멤버십 이름인 경우
    const exists = customMemberships.some(cm => cm.name === membershipFilter)
    if (!exists) {
      // 삭제된 멤버십으로 필터링 중이면 'all'로 초기화
      setMembershipFilter('all')
    }
  }, [customMemberships, membershipFilter])

  // players가 업데이트되면 editing.player도 업데이트 (태그 프리셋 변경 등)
  useEffect(() => {
    if (editing.open && editing.player) {
      const updatedPlayer = players.find(p => p.id === editing.player.id)
      if (updatedPlayer) {
        setEditing({ open: true, player: updatedPlayer })
      }
    }
  }, [players])

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
    // 새로운 positions 배열 사용
    const categoryA = getPrimaryCategory(a.positions) || "OTHER"
    const categoryB = getPrimaryCategory(b.positions) || "OTHER"
    const ra = POS_ORDER.indexOf(categoryA)
    const rb = POS_ORDER.indexOf(categoryB)
    if (ra !== rb) return ra - rb
    // 같은 카테고리면 첫 번째 상세 포지션으로 비교
    const posA = (a.positions && a.positions[0]) || ""
    const posB = (b.positions && b.positions[0]) || ""
    if (posA !== posB) return posA.localeCompare(posB)
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

  const cmpByStatusAsc = (a,b)=>{
    // 상태 우선순위: active > recovering > suspended > inactive > nocontact
    const STATUS_ORDER = ['active', 'recovering', 'suspended', 'inactive', 'nocontact']
    const statusA = a.status || 'active'
    const statusB = b.status || 'active'
    const ra = STATUS_ORDER.indexOf(statusA)
    const rb = STATUS_ORDER.indexOf(statusB)
    if (ra !== rb) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb)
    return S(a.name).localeCompare(S(b.name))
  }

  const sorted = useMemo(() => {
    const arr = [...rosterPlayers]
    let cmp = cmpByNameAsc
    if (sortKey === "ovr") cmp = cmpByOvrAsc
    else if (sortKey === "pos") cmp = cmpByPosAsc
    else if (sortKey === "ai") cmp = cmpByAIAsc
    else if (sortKey === "status") cmp = cmpByStatusAsc
    arr.sort(applyDir(cmp))
    return arr
  }, [rosterPlayers, sortKey, sortDir])

  // 멤버십, 상태, 포지션, 태그, 검색어 필터 적용
  const filtered = useMemo(() => {
    let result = sorted
    
    // 검색어 필터 (이름으로 검색)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      result = result.filter(p => 
        (p.name || '').toLowerCase().includes(query)
      )
    }
    
    // 멤버십 필터
    if (membershipFilter === 'member') {
      result = result.filter(p => isMember(p.membership))
    } else if (membershipFilter === 'associate') {
      result = result.filter(p => isAssociate(p.membership))
    } else if (membershipFilter === 'guest') {
      result = result.filter(p => isGuest(p.membership))
    } else if (membershipFilter !== 'all') {
      // 커스텀 멤버십 필터 (이름으로 정확히 매칭)
      result = result.filter(p => p.membership === membershipFilter)
    }
    
    // 상태 필터
    if (statusFilter !== 'all') {
      result = result.filter(p => (p.status || 'active') === statusFilter)
    }
    
    // 포지션 필터
    if (positionFilter !== 'all') {
      result = result.filter(p => {
        if (!p.positions || p.positions.length === 0) return false
        // 선택된 카테고리에 해당하는 포지션이 하나라도 있으면 포함
        return p.positions.some(pos => {
          if (positionFilter === 'GK') return pos === 'GK'
          if (positionFilter === 'DF') return ['RB', 'RWB', 'CB', 'LB', 'LWB'].includes(pos)
          if (positionFilter === 'MF') return ['CDM', 'CM', 'CAM', 'RM', 'LM'].includes(pos)
          if (positionFilter === 'FW') return ['RW', 'ST', 'CF', 'LW'].includes(pos)
          return false
        })
      })
    }
    
    // 태그 필터 (선택된 태그가 모두 포함된 선수만)
    if (selectedTags.length > 0) {
      result = result.filter(p => {
        if (!p.tags || p.tags.length === 0) return false
        return selectedTags.every(selectedTag => 
          p.tags.some(tag => tag.name === selectedTag)
        )
      })
    }
    
    return result
  }, [sorted, searchQuery, membershipFilter, statusFilter, positionFilter, selectedTags])

  const counts = useMemo(() => {
    const total = rosterPlayers.length
    const members = rosterPlayers.filter((p) => isMember(p.membership)).length
    const associates = rosterPlayers.filter((p) => isAssociate(p.membership)).length
    const guests = rosterPlayers.filter((p) => isGuest(p.membership)).length
    
    // 커스텀 멤버십별 카운트 계산
    const customCounts = {}
    customMemberships.forEach(cm => {
      customCounts[cm.name] = rosterPlayers.filter(p => p.membership === cm.name).length
    })
    
    return { total, members, associates, guests, custom: customCounts }
  }, [rosterPlayers, customMemberships])

  // 모든 선수의 태그 수집
  const allTags = useMemo(() => {
    const tagSet = new Set()
    rosterPlayers.forEach(p => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach(tag => tagSet.add(tag.name))
      }
    })
    return Array.from(tagSet).sort()
  }, [rosterPlayers])

  // 새 선수 추가
  const handleCreate = () => {
    setEditing({
      open: true,
      player: {
        id: null,
        name: "",
        membership: "정회원",
        positions: [], // 새로운 positions 배열
        origin: "none",
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
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowMembershipSettings(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 shadow-sm transition-colors"
                title="멤버십 설정"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span className="hidden sm:inline">멤버십 설정</span>
              </button>
            )}
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
        </div>

        {/* 멤버십 필터 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* 전체 버튼 */}
          <button
            onClick={() => setMembershipFilter('all')}
            className={`bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border-2 transition-all hover:shadow-md ${membershipFilter === 'all' ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}
          >
            <div className="text-xs font-medium text-blue-700 mb-1">전체</div>
            <div className="text-2xl font-bold text-blue-900">{counts.total}</div>
          </button>
          
          {/* 기본 멤버십: 정회원 - 커스텀 멤버십에 없으면 표시 */}
          {!customMemberships.some(cm => cm.name === '정회원') && (
            <button
              onClick={() => setMembershipFilter('member')}
              className={`bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border-2 transition-all hover:shadow-md ${membershipFilter === 'member' ? 'border-emerald-500 shadow-md' : 'border-emerald-200'}`}
            >
              <div className="text-xs font-medium text-emerald-700 mb-1">정회원</div>
              <div className="text-2xl font-bold text-emerald-900">{counts.members}</div>
            </button>
          )}
          
          {/* 기본 멤버십: 게스트 - 커스텀 멤버십에 없으면 표시 */}
          {!customMemberships.some(cm => cm.name === '게스트') && (
            <button
              onClick={() => setMembershipFilter('guest')}
              className={`rounded-lg p-4 border-2 transition-all hover:shadow-md ${membershipFilter === 'guest' ? 'shadow-md border-rose-200' : 'border-stone-200'}`}
              style={{
                background: 'linear-gradient(to bottom right, rgb(254, 242, 242), rgb(254, 226, 226))',
              }}
            >
              <div className="text-xs font-medium mb-1" style={{ color: 'rgb(136, 19, 55)' }}>게스트</div>
              <div className="text-2xl font-bold" style={{ color: 'rgb(136, 19, 55)' }}>{counts.guests}</div>
            </button>
          )}
          
          {/* 커스텀 멤버십 필터 버튼 동적 생성 */}
          {customMemberships.map(cm => {
            const badgeInfo = getMembershipBadge(cm.name, customMemberships)
            const isActive = membershipFilter === cm.name
            
            // 커스텀 멤버십의 카운트 계산
            let count = counts.custom[cm.name] || 0
            
            // 기본 멤버십 이름과 같으면 기본 카운트 사용
            if (cm.name === '정회원') {
              count = counts.members
            } else if (cm.name === '게스트') {
              count = counts.guests
            }
            
            // 배지 색상을 버튼 색상으로 매칭
            const colorMap = {
              red: { from: 'rgb(254, 242, 242)', to: 'rgb(254, 226, 226)', text: 'rgb(185, 28, 28)', border: isActive ? 'rgb(239, 68, 68)' : 'rgb(254, 202, 202)' },
              orange: { from: 'rgb(255, 247, 237)', to: 'rgb(254, 237, 220)', text: 'rgb(154, 52, 18)', border: isActive ? 'rgb(251, 146, 60)' : 'rgb(253, 186, 140)' },
              yellow: { from: 'rgb(254, 252, 232)', to: 'rgb(254, 249, 195)', text: 'rgb(113, 63, 18)', border: isActive ? 'rgb(250, 204, 21)' : 'rgb(253, 224, 71)' },
              emerald: { from: 'rgb(236, 253, 245)', to: 'rgb(209, 250, 229)', text: 'rgb(5, 150, 105)', border: isActive ? 'rgb(16, 185, 129)' : 'rgb(110, 231, 183)' },
              blue: { from: 'rgb(239, 246, 255)', to: 'rgb(219, 234, 254)', text: 'rgb(30, 58, 138)', border: isActive ? 'rgb(59, 130, 246)' : 'rgb(147, 197, 253)' },
              purple: { from: 'rgb(250, 245, 255)', to: 'rgb(237, 233, 254)', text: 'rgb(88, 28, 135)', border: isActive ? 'rgb(147, 51, 234)' : 'rgb(216, 180, 254)' },
              pink: { from: 'rgb(253, 242, 248)', to: 'rgb(252, 231, 243)', text: 'rgb(157, 23, 77)', border: isActive ? 'rgb(236, 72, 153)' : 'rgb(249, 168, 212)' },
              cyan: { from: 'rgb(236, 254, 255)', to: 'rgb(207, 250, 254)', text: 'rgb(14, 116, 144)', border: isActive ? 'rgb(34, 211, 238)' : 'rgb(165, 243, 252)' },
              stone: { from: 'rgb(250, 250, 249)', to: 'rgb(245, 245, 244)', text: 'rgb(68, 64, 60)', border: isActive ? 'rgb(120, 113, 108)' : 'rgb(214, 211, 209)' }
            }
            
            const colors = colorMap[cm.badgeColor] || colorMap.stone
            
            return (
              <button
                key={cm.id}
                onClick={() => setMembershipFilter(cm.name)}
                className={`rounded-lg p-4 border-2 transition-all hover:shadow-md ${isActive ? 'shadow-md' : ''}`}
                style={{
                  background: `linear-gradient(to bottom right, ${colors.from}, ${colors.to})`,
                  borderColor: colors.border
                }}
              >
                <div className="text-xs font-medium mb-1" style={{ color: colors.text }}>
                  {cm.name}
                </div>
                <div className="text-2xl font-bold" style={{ color: colors.text }}>
                  {count}
                </div>
              </button>
            )
          })}
        </div>

        {/* 배지 설명 */}
        <div className="mb-4 flex items-center gap-4 text-xs text-stone-600 flex-wrap">
          {/* 기본 멤버십: 게스트 - 커스텀 멤버십에 없으면 표시 */}
          {!customMemberships.some(cm => cm.name === '게스트') && (
            <div className="flex items-center gap-2">
              <span 
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold border"
                style={{ 
                  backgroundColor: 'rgb(251, 229, 230)',
                  borderColor: 'rgb(244, 201, 204)',
                  color: 'rgb(136, 19, 55)'
                }}
              >
                G
              </span>
              <span>게스트</span>
            </div>
          )}
          
          {/* 커스텀 멤버십 배지 설명 */}
          {customMemberships.map(cm => {
            const badgeInfo = getMembershipBadge(cm.name, customMemberships)
            if (!badgeInfo || !badgeInfo.colorStyle) return null
            
            return (
              <div key={cm.id} className="flex items-center gap-2">
                <span 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold border"
                  style={{ 
                    backgroundColor: badgeInfo.colorStyle.bg,
                    borderColor: badgeInfo.colorStyle.border,
                    color: badgeInfo.colorStyle.text
                  }}
                >
                  {badgeInfo.badge}
                </span>
                <span>{cm.name}</span>
              </div>
            )
          })}
        </div>

        {/* 검색 & 필터 통합 바 */}
        <div className="mb-6 space-y-3">
          {/* 검색창 & 고급 필터 토글 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="선수 이름으로 검색..."
                className="w-full pl-11 pr-10 py-3.5 text-sm border-2 border-stone-300 rounded-xl bg-white text-stone-900 placeholder-stone-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all outline-none shadow-sm"
              />
              <svg 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-stone-100 transition-colors"
                  title="검색어 지우기"
                >
                  <svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* 고급 필터 토글 버튼 */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-2 px-4 py-3.5 rounded-xl text-sm font-medium transition-all shadow-sm ${
                showAdvancedFilters
                  ? 'bg-emerald-500 text-white border-2 border-emerald-500'
                  : activeFiltersCount > 0
                  ? 'bg-blue-500 text-white border-2 border-blue-500'
                  : 'bg-white text-stone-700 border-2 border-stone-300 hover:border-stone-400'
              }`}
              title={showAdvancedFilters ? '필터 숨기기' : '고급 필터 표시'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="hidden sm:inline">필터</span>
              {activeFiltersCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-blue-600 text-xs font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* 고급 필터 패널 (접이식) */}
          {showAdvancedFilters && (
            <div className="bg-gradient-to-br from-stone-50 to-stone-100 rounded-xl border-2 border-stone-200 p-5 space-y-4 animate-slideDown">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  고급 필터
                </h3>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={() => {
                      setStatusFilter('all')
                      setPositionFilter('all')
                      setSelectedTags([])
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    필터 초기화
                  </button>
                )}
              </div>

              {/* 상태 필터 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">상태</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                      statusFilter === 'all'
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    전체
                  </button>
                  {VISIBLE_PLAYER_STATUS.map(status => {
                    const isActive = statusFilter === status.value
                    let buttonClass = 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                    
                    if (isActive) {
                      if (status.color === 'emerald') {
                        buttonClass = 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                      } else if (status.color === 'red') {
                        buttonClass = 'border-red-500 bg-red-500 text-white shadow-sm'
                      } else if (status.color === 'blue') {
                        buttonClass = 'border-blue-500 bg-blue-500 text-white shadow-sm'
                      } else if (status.color === 'amber') {
                        buttonClass = 'border-amber-500 bg-amber-500 text-white shadow-sm'
                      } else if (status.color === 'slate') {
                        buttonClass = 'border-slate-500 bg-slate-500 text-white shadow-sm'
                      } else {
                        buttonClass = 'border-stone-500 bg-stone-500 text-white shadow-sm'
                      }
                    }
                    
                    return (
                      <button
                        key={status.value}
                        onClick={() => setStatusFilter(status.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${buttonClass}`}
                      >
                        {status.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 포지션 필터 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">포지션</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setPositionFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                      positionFilter === 'all'
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    전체
                  </button>
                  <button
                    onClick={() => setPositionFilter('GK')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                      positionFilter === 'GK'
                        ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    GK
                  </button>
                  <button
                    onClick={() => setPositionFilter('DF')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                      positionFilter === 'DF'
                        ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    DF
                  </button>
                  <button
                    onClick={() => setPositionFilter('MF')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                      positionFilter === 'MF'
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    MF
                  </button>
                  <button
                    onClick={() => setPositionFilter('FW')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                      positionFilter === 'FW'
                        ? 'border-purple-500 bg-purple-500 text-white shadow-sm'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    FW
                  </button>
                </div>
              </div>

              {/* 태그 필터 */}
              {allTags.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-2">
                    태그
                    {selectedTags.length > 0 && (
                      <span className="ml-2 text-[10px] font-normal text-blue-600">
                        ({selectedTags.length}개 선택됨)
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {allTags.map(tagName => {
                      const isSelected = selectedTags.includes(tagName)
                      return (
                        <button
                          key={tagName}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTags(selectedTags.filter(t => t !== tagName))
                            } else {
                              setSelectedTags([...selectedTags, tagName])
                            }
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                              : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                          }`}
                        >
                          {tagName}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 검색 결과 요약 */}
          {(searchQuery || activeFiltersCount > 0) && (
            <div className="flex items-center gap-2 text-xs text-stone-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
              <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="flex-1">
                {searchQuery && (
                  <span className="font-medium text-blue-900">"{searchQuery}"</span>
                )}
                {searchQuery && activeFiltersCount > 0 && <span> 및 </span>}
                {activeFiltersCount > 0 && (
                  <span className="font-medium text-blue-900">{activeFiltersCount}개 필터</span>
                )}
                {' '}검색 결과: <span className="font-bold text-blue-900">{filtered.length}명</span>
              </span>
              <button
                onClick={resetFilters}
                className="text-blue-600 hover:text-blue-700 font-medium hover:underline whitespace-nowrap"
              >
                전체 보기
              </button>
            </div>
          )}
        </div>

        {/* 정렬 & 뷰 모드 토글 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 필터링된 선수 수 표시 */}
            <div className="text-sm font-semibold text-stone-700">
              선수 목록 
              <span className="ml-2 text-emerald-600">
                {filtered.length}명
              </span>
              {filtered.length !== rosterPlayers.length && (
                <span className="ml-1 text-xs text-stone-500">
                  (전체 {rosterPlayers.length}명)
                </span>
              )}
            </div>
            
            <div className="h-5 w-px bg-stone-300"></div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-stone-600">정렬:</span>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${sortKey==='ovr' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
                onClick={()=>onSortClick('ovr')}
                title="Overall 정렬 (토글: 오름/내림)"
              >
                Overall {arrowFor('ovr')}
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${sortKey==='ai' ? 'border-purple-500 bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-sm' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
                onClick={()=>onSortClick('ai')}
                title="AI Overall 정렬 (토글: 오름/내림)"
              >
                AI Overall {arrowFor('ai')}
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
      {viewMode === 'card' && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const mem = S(p.membership).trim()
          const badgeInfo = getMembershipBadge(mem, customMemberships)
          const badges = badgeInfo ? [badgeInfo.badge] : []
          const pos = posOf(p)
          const ovr = overall(p)
          const aiOverall = calculateAIPower(p, matches)
          const aiProgress = Math.max(0, Math.min(100, ((aiOverall - 50) / 50) * 100))
          
          return (
            <div
              key={p.id}
              className={`bg-white rounded-xl border-2 p-4 transition-all hover:shadow-lg cursor-pointer ${selectedId === p.id ? "border-emerald-500 shadow-md" : "border-stone-200 hover:border-emerald-300"}`}
              onClick={() => onSelect(p.id)}
            >
              <div className="flex items-start gap-3 mb-3">
                <InitialAvatar 
                  id={p.id} 
                  name={p.name} 
                  size={48} 
                  badges={badges} 
                  photoUrl={p.photoUrl}
                  customMemberships={customMemberships}
                  badgeInfo={badgeInfo}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base text-stone-900 truncate mb-1">
                    {p.name || "이름없음"}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PositionChips positions={p.positions || []} size="sm" maxDisplay={3} />
                    <OriginChip origin={p.origin} />
                    
                    {/* 상태 표시 */}
                    {p.status && p.status !== 'active' && (
                      <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium ${
                        p.status === 'recovering' ? 'bg-red-100 text-red-800 border border-red-200' :
                        p.status === 'inactive' ? 'bg-stone-100 text-stone-800 border border-stone-200' :
                        p.status === 'nocontact' ? 'bg-slate-100 text-slate-800 border border-slate-200' :
                        p.status === 'suspended' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        p.status === SYSTEM_ACCOUNT_STATUS ? 'bg-stone-900 text-white border border-stone-900' :
                        'bg-stone-100 text-stone-800 border border-stone-200'
                      }`}>
                        {getPlayerStatusLabel(p.status)}
                      </span>
                    )}
                  </div>
                  
                  {/* 태그 표시 */}
                  {p.tags && p.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {p.tags.slice(0, 3).map((tag, idx) => {
                        const isCustomColor = tag.color && tag.color.startsWith('#')
                        return (
                          <span
                            key={idx}
                            className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium border ${
                              isCustomColor ? '' : getTagColorClass(tag.color)
                            }`}
                            style={isCustomColor ? {
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                              borderColor: tag.color
                            } : {}}
                          >
                            {tag.name}
                          </span>
                        )
                      })}
                      {p.tags.length > 3 && (
                        <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
                          +{p.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* OVR 표시 - 모든 선수에 표시 (GK 포함) */}
              <div className={`mb-3 rounded-lg p-3 text-center ${
                ovr === 30
                  ? 'bg-stone-300 text-stone-700'
                  : `bg-gradient-to-br ${ovrGradientClass(ovr)} text-white`
              }`}>
                <div className={`text-xs mb-1 ${ovr === 30 ? 'text-stone-600' : 'text-white/80'}`}>Overall Rating</div>
                <div className={`text-3xl font-bold ${ovr === 30 ? 'text-stone-700' : 'text-white'}`}>
                  {ovr === 30 ? '?' : ovr}
                </div>
                {ovr === 30 ? (
                  <div className="text-[10px] text-stone-600 mt-1">Unknown</div>
                ) : (
                  <div className="mt-2">
                    <div className="w-full bg-white/30 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-full ${ovrMeterColor(ovr)} transition-all duration-300 rounded-full`}
                        style={{ width: `${ovr}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Overall 점수 */}
              <div className={`mb-3 rounded-lg p-3 text-center bg-gradient-to-br ${aiPowerChipClass(aiOverall).replace('text-white', '').replace('shadow-sm', '').split(' ').filter(c => c.startsWith('from-') || c.startsWith('to-')).join(' ')} text-white shadow-md`}>
                <div className="text-xs mb-1 text-white/80">AI Overall</div>
                <div className="text-2xl font-bold text-white">
                  {aiOverall}
                </div>
                <div className="mt-2">
                  <div className="w-full bg-white/30 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full ${aiPowerMeterColor(aiOverall)} transition-all duration-300 rounded-full`}
                      style={{ width: `${aiProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-white/70 mt-1">50-100 Scale</div>
                </div>
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
                  편집
                </button>
                <button
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    requestDelete(p.id, p.name)
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* 리스트 뷰 */}
      {viewMode === 'list' && filtered.length > 0 && (
        <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-200 shadow-sm">
          {filtered.map((p) => {
            const mem = S(p.membership).trim()
            const badgeInfo = getMembershipBadge(mem, customMemberships)
            const badges = badgeInfo ? [badgeInfo.badge] : []
            const pos = posOf(p)
            const ovr = overall(p)
            const aiOverall = calculateAIPower(p, matches)
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors ${selectedId === p.id ? "bg-emerald-50" : ""}`}
                onClick={() => onSelect(p.id)}
              >
                <InitialAvatar 
                  id={p.id} 
                  name={p.name} 
                  size={40} 
                  badges={badges} 
                  photoUrl={p.photoUrl}
                  customMemberships={customMemberships}
                  badgeInfo={badgeInfo}
                />

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-stone-800 flex items-center gap-2 flex-wrap">
                    <span className="truncate">{p.name || "이름없음"}</span>
                    <PositionChips positions={p.positions || []} size="sm" maxDisplay={2} />
                    <OriginChip origin={p.origin} />
                    
                    {/* 상태 표시 */}
                    {p.status && p.status !== 'active' && (
                      <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium ${
                        p.status === 'recovering' ? 'bg-red-100 text-red-800 border border-red-200' :
                        p.status === 'inactive' ? 'bg-stone-100 text-stone-800 border border-stone-200' :
                        p.status === 'nocontact' ? 'bg-slate-100 text-slate-800 border border-slate-200' :
                        p.status === 'suspended' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        p.status === SYSTEM_ACCOUNT_STATUS ? 'bg-stone-900 text-white border border-stone-900' :
                        'bg-stone-100 text-stone-800 border border-stone-200'
                      }`}>
                        {getPlayerStatusLabel(p.status)}
                      </span>
                    )}
                    
                    {/* 태그 표시 */}
                    {p.tags && p.tags.length > 0 && (
                      <>
                        {p.tags.slice(0, 2).map((tag, idx) => {
                          const isCustomColor = tag.color && tag.color.startsWith('#')
                          return (
                            <span
                              key={idx}
                              className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium border ${
                                isCustomColor ? '' : getTagColorClass(tag.color)
                              }`}
                              style={isCustomColor ? {
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                                borderColor: tag.color
                              } : {}}
                            >
                              {tag.name}
                            </span>
                          )
                        })}
                        {p.tags.length > 2 && (
                          <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
                            +{p.tags.length - 2}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded px-3 py-1 text-sm font-bold ${ovr === 30 ? 'bg-stone-300 text-stone-700' : ovrChipClass(ovr)}`}>
                    {ovr === 30 ? '?' : ovr}
                  </span>
                  <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold shadow-sm ${aiPowerChipClass(aiOverall)}`} title="AI Overall (50-100)">
                    AI {aiOverall}
                  </span>
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

      {rosterPlayers.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 mt-4 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50">
          <svg className="w-12 h-12 mx-auto mb-3 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l2.5 1.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-semibold text-stone-700">선택한 조건에 맞는 선수가 없습니다.</p>
          <p className="text-xs text-stone-500 mt-1">필터를 조정하거나 초기화해 주세요.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            필터 초기화
          </button>
        </div>
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
      {confirm.open && createPortal(
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={cancelDelete}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-stone-900">선수 삭제</h3>
                <p className="text-sm text-stone-500">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <p className="text-sm text-stone-700 mb-6 bg-stone-50 p-3 rounded-lg">
              {confirm.name ? (
                <>
                  <span className="font-semibold text-stone-900">{confirm.name}</span> 선수를 삭제하시겠습니까?
                </>
              ) : (
                "선수를 삭제하시겠습니까?"
              )}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={cancelDelete} 
                className="px-4 py-2.5 rounded-lg border-2 border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
              >
                취소
              </button>
              <button 
                onClick={confirmDelete} 
                className="px-4 py-2.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors shadow-sm"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 편집 모달 */}
      <EditPlayerModal
        open={editing.open}
        player={editing.player}
        onClose={closeEdit}
        onSave={saveEdit}
        tagPresets={tagPresets}
        onAddTagPreset={onAddTagPreset}
        onUpdateTagPreset={onUpdateTagPreset}
        onDeleteTagPreset={onDeleteTagPreset}
        customMemberships={customMemberships}
        isAdmin={isAdmin}
        systemAccountExists={systemAccountExists}
        onEnsureSystemAccount={onEnsureSystemAccount}
      />

      {/* 멤버십 설정 모달 */}
      {showMembershipSettings && (
        <MembershipSettings
          customMemberships={customMemberships}
          onSave={(newMemberships) => {
            onSaveMembershipSettings(newMemberships)
            setShowMembershipSettings(false)
          }}
          onClose={() => setShowMembershipSettings(false)}
          players={players}
        />
      )}
      
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.2s ease-out;
        }
      `}</style>
    </div>
  )
}
