// src/pages/PlayersPage.jsx
import React, { useMemo, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { notify } from "../components/Toast"
import { overall, isUnknownPlayer } from "../lib/players"
import { 
  STAT_KEYS, 
  PLAYER_ORIGINS, 
  getOriginLabel, 
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

function OriginChip({ origin }) {
  if (!origin || origin === "none") return null
  const label = getOriginLabel(origin)
  const cls = origin === "pro"
    ? "bg-purple-100 text-purple-800 border border-purple-200"
    : origin === "amateur"
    ? "bg-blue-100 text-blue-800 border border-blue-200"
    : origin === "college"
    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
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
  if (power >= 1300) return 'bg-gradient-to-r from-purple-400 to-pink-400'
  if (power >= 1100) return 'bg-gradient-to-r from-emerald-400 to-emerald-500'
  if (power >= 900) return 'bg-gradient-to-r from-blue-400 to-blue-500'
  if (power >= 700) return 'bg-gradient-to-r from-amber-400 to-amber-500'
  return 'bg-gradient-to-r from-stone-400 to-stone-500'
}

// ===== 편집 모달 =====
function EditPlayerModal({ open, player, onClose, onSave, tagPresets = [], onAddTagPreset, isAdmin }) {
  const [draft, setDraft] = useState(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('blue')

  useEffect(() => {
    if (open && player !== undefined) {
      // 레거시 position을 positions 배열로 마이그레이션
      const migratedPositions = migratePositionToPositions(player)
      
      setDraft({
        ...player,
        id: player?.id || `new-${Date.now()}`,
        name: player?.name || "",
        positions: migratedPositions,
        membership: isMember(player.membership) ? "정회원" : "게스트",
        origin: player.origin || "none",
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
  const posMissing = isNew && (!draft?.positions || draft.positions.length === 0)

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
      
      console.log('🔍 업로드 정보:', {
        playerName,
        playerId,
        originalPhotoUrl,
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(2) + 'KB'
      })
      
      const publicUrl = await uploadPlayerPhoto(file, playerId, playerName, originalPhotoUrl)
      
      console.log('✅ 업로드 완료:', publicUrl)
      
      // 강제 리렌더링을 위해 해시 추가
      setDraft(prev => ({...prev, photoUrl: `${publicUrl}#${Date.now()}`}))
      
      notify('✅ 사진이 업로드되었습니다.', 'success', 2000)
    } catch(err) {
      console.error('❌ 업로드 에러:', err)
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
        console.error('Failed to delete old photo:', err)
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
    
    console.log('🔍 사진 비교:', {
      oldPhotoUrl,
      cleanOldPhotoUrl,
      newPhotoUrl: draft.photoUrl,
      cleanNewPhotoUrl,
      isSame: cleanOldPhotoUrl === cleanNewPhotoUrl
    })
    
    if (cleanOldPhotoUrl && cleanOldPhotoUrl !== cleanNewPhotoUrl) {
      // 이전 사진이 업로드된 사진(player-photos 버킷)이고, RANDOM이 아닌 경우
      if (!cleanOldPhotoUrl.startsWith('RANDOM:') && cleanOldPhotoUrl.includes('player-photos')) {
        console.log('🗑️ 이전 사진 삭제 시작 (다른 파일):', cleanOldPhotoUrl)
        try {
          await deletePlayerPhoto(cleanOldPhotoUrl)
          console.log('✅ 이전 사진 삭제 완료')
        } catch (error) {
          console.error('❌ 삭제 실패:', error)
        }
      }
    } else {
      console.log('⏭️ 같은 사진 - 삭제 안함')
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
    
    console.log('💾 저장할 데이터:', {
      id: payload.id,
      name: payload.name,
      photoUrl: payload.photoUrl,
      finalPhotoUrl,
      draftPhotoUrl: draft.photoUrl
    })
    
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
  const isGuest = S(draft.membership).includes("게스트")

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
                badges={isGuest?['G']:[]} 
                photoUrl={draft.photoUrl} 
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
                        badges={isGuest ? ['G'] : []} 
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
                                : 'bg-stone-500 text-white shadow-lg scale-105'
                              : 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-300'
                          }`}
                        >
                          {mem}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">선수 출신</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PLAYER_ORIGINS.map(origin => {
                        const isSelected = draft.origin === origin.value
                        let selectedClass = 'bg-white border-2 border-stone-200 text-stone-600 hover:border-stone-300'
                        
                        if (isSelected) {
                          if (origin.value === 'pro') {
                            selectedClass = 'bg-purple-500 text-white shadow-lg scale-105'
                          } else if (origin.value === 'amateur') {
                            selectedClass = 'bg-blue-500 text-white shadow-lg scale-105'
                          } else if (origin.value === 'college') {
                            selectedClass = 'bg-emerald-500 text-white shadow-lg scale-105'
                          } else {
                            selectedClass = 'bg-stone-500 text-white shadow-lg scale-105'
                          }
                        }
                        
                        return (
                          <button
                            key={origin.value}
                            type="button"
                            onClick={() => setDraft({ ...draft, origin: origin.value })}
                            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${selectedClass}`}
                          >
                            {origin.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-2">선수 상태</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {PLAYER_STATUS.map(status => {
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
                          {draft.tags.map((tag, idx) => (
                            <div
                              key={idx}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getTagColorClass(tag.color)}`}
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
                          ))}
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
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    // 이미 선택된 태그면 제거
                                    const newTags = draft.tags.filter(t => !(t.name === preset.name && t.color === preset.color))
                                    setDraft({ ...draft, tags: newTags })
                                  } else {
                                    // 새로 추가
                                    setDraft({ ...draft, tags: [...(draft.tags || []), preset] })
                                  }
                                }}
                                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  isSelected 
                                    ? `${getTagColorClass(preset.color)} ring-2 ring-blue-400 shadow-sm` 
                                    : `${getTagColorClass(preset.color)} opacity-60 hover:opacity-100`
                                }`}
                              >
                                {preset.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* 새 태그 추가 (프리셋으로 저장) */}
                    {isAdmin && (
                      <div className="space-y-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
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
                              }
                            }}
                          />
                          <select
                            value={newTagColor}
                            onChange={(e) => setNewTagColor(e.target.value)}
                            className="rounded-lg border-2 border-stone-300 px-3 py-2 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          >
                            {TAG_COLORS.map(color => (
                              <option key={color.value} value={color.value}>
                                {color.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (newTagName.trim()) {
                                const newPreset = { name: newTagName.trim(), color: newTagColor }
                                onAddTagPreset(newPreset)
                                setNewTagName('')
                              }
                            }}
                            disabled={!newTagName.trim()}
                            className="rounded-lg bg-stone-600 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            프리셋 저장
                          </button>
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
  onDeleteTagPreset = () => {},
  isAdmin = false,
}) {
  const [confirm, setConfirm] = useState({ open: false, id: null, name: "" })
  const [editing, setEditing] = useState({ open: false, player: null })
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('playersViewMode') || 'list') // 'card' | 'list'
  const [membershipFilter, setMembershipFilter] = useState('all') // 'all' | 'member' | 'guest'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'injured' | etc.
  const [selectedTags, setSelectedTags] = useState([]) // 선택된 태그들

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
    const arr = [...players]
    let cmp = cmpByNameAsc
    if (sortKey === "ovr") cmp = cmpByOvrAsc
    else if (sortKey === "pos") cmp = cmpByPosAsc
    else if (sortKey === "ai") cmp = cmpByAIAsc
    else if (sortKey === "status") cmp = cmpByStatusAsc
    arr.sort(applyDir(cmp))
    return arr
  }, [players, sortKey, sortDir])

  // 멤버십, 상태, 태그 필터 적용
  const filtered = useMemo(() => {
    let result = sorted
    
    // 멤버십 필터
    if (membershipFilter === 'member') {
      result = result.filter(p => isMember(p.membership))
    } else if (membershipFilter === 'guest') {
      result = result.filter(p => !isMember(p.membership))
    }
    
    // 상태 필터
    if (statusFilter !== 'all') {
      result = result.filter(p => (p.status || 'active') === statusFilter)
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
  }, [sorted, membershipFilter, statusFilter, selectedTags])

  const counts = useMemo(() => {
    const total = players.length
    const members = players.filter((p) => isMember(p.membership)).length
    const guests = total - members
    return { total, members, guests }
  }, [players])

  // 모든 선수의 태그 수집
  const allTags = useMemo(() => {
    const tagSet = new Set()
    players.forEach(p => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach(tag => tagSet.add(tag.name))
      }
    })
    return Array.from(tagSet).sort()
  }, [players])

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
            className={`rounded-lg p-4 border-2 transition-all hover:shadow-md ${membershipFilter === 'guest' ? 'shadow-md border-rose-200' : 'border-stone-200'}`}
            style={{
              background: 'linear-gradient(to bottom right, rgb(254, 242, 242), rgb(254, 226, 226))',
            }}
          >
            <div className="text-xs font-medium mb-1" style={{ color: 'rgb(136, 19, 55)' }}>게스트</div>
            <div className="text-2xl font-bold" style={{ color: 'rgb(136, 19, 55)' }}>{counts.guests}</div>
          </button>
        </div>

        {/* G 뱃지 설명 */}
        <div className="mb-4 flex items-center gap-2 text-xs text-stone-600">
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
          <span>게스트 선수</span>
        </div>

        {/* 상태 & 태그 필터 */}
        <div className="mb-4 space-y-3">
          {/* 상태 필터 */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-2">상태 필터</label>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  statusFilter === 'all'
                    ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                    : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                전체
              </button>
              {PLAYER_STATUS.map(status => {
                const isActive = statusFilter === status.value
                let buttonClass = 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                
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
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${buttonClass}`}
                  >
                    {status.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 태그 필터 */}
          {allTags.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-2">
                태그 필터 
                {selectedTags.length > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-blue-600">
                    ({selectedTags.length}개 선택됨)
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-all"
                  >
                    초기화
                  </button>
                )}
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
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
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

        {/* 정렬 & 뷰 모드 토글 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-stone-600 mr-1">정렬:</span>
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
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${sortKey==='status' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
              onClick={()=>onSortClick('status')}
              title="상태 정렬 (토글: 오름/내림)"
            >
              상태 {arrowFor('status')}
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
          // positions 배열에 GK가 포함되어 있는지 확인
          const isGK = p.positions?.includes('GK') || pos === 'GK'
          
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
                  badges={guest?['G']:[]} 
                  photoUrl={p.photoUrl} 
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
                        'bg-stone-100 text-stone-800 border border-stone-200'
                      }`}>
                        {getPlayerStatusLabel(p.status)}
                      </span>
                    )}
                  </div>
                  
                  {/* 태그 표시 */}
                  {p.tags && p.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {p.tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium border ${getTagColorClass(tag.color)}`}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {p.tags.length > 3 && (
                        <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
                          +{p.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* OVR 표시 - GK가 아닐 때만 (값에 따라 색상 표시) */}
              {!isGK && (
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
              )}
              {isGK && (
                <div className="mb-3 rounded-lg p-3 text-center bg-amber-100 border border-amber-200">
                  <div className="text-xs text-amber-700 mb-1">Position</div>
                  <div className="text-3xl font-bold text-amber-900">GK</div>
                  <div className="text-[10px] text-amber-600 mt-1">Goalkeeper</div>
                </div>
              )}

              {/* AI Overall 점수 */}
              <div className={`mb-3 rounded-lg p-3 text-center bg-gradient-to-br ${aiPowerChipClass(calculateAIPower(p, matches)).replace('text-white', '').replace('shadow-sm', '').split(' ').filter(c => c.startsWith('from-') || c.startsWith('to-')).join(' ')} text-white shadow-md`}>
                <div className="text-xs mb-1 text-white/80">AI Overall</div>
                <div className="text-2xl font-bold text-white">
                  {calculateAIPower(p, matches)}
                </div>
                <div className="mt-2">
                  <div className="w-full bg-white/30 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full ${aiPowerMeterColor(calculateAIPower(p, matches))} transition-all duration-300 rounded-full`}
                      style={{ width: `${((calculateAIPower(p, matches) - 50) / 50) * 100}%` }}
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
      {viewMode === 'list' && (
        <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-200 shadow-sm">
          {filtered.map((p) => {
            const mem = S(p.membership).trim()
            const guest = !isMember(mem)
            const pos = posOf(p)
            // positions 배열에 GK가 포함되어 있는지 확인
            const isGK = p.positions?.includes('GK') || pos === 'GK'
            const ovr = overall(p)
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
                  badges={guest?['G']:[]} 
                  photoUrl={p.photoUrl} 
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
                        'bg-stone-100 text-stone-800 border border-stone-200'
                      }`}>
                        {getPlayerStatusLabel(p.status)}
                      </span>
                    )}
                    
                    {/* 태그 표시 */}
                    {p.tags && p.tags.length > 0 && (
                      <>
                        {p.tags.slice(0, 2).map((tag, idx) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium border ${getTagColorClass(tag.color)}`}
                          >
                            {tag.name}
                          </span>
                        ))}
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
                  {!isGK && (
                    <>
                      <span className={`inline-flex items-center rounded px-3 py-1 text-sm font-bold ${ovr === 30 ? 'bg-stone-300 text-stone-700' : ovrChipClass(ovr)}`}>
                        {ovr === 30 ? '?' : ovr}
                      </span>
                      <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold shadow-sm ${aiPowerChipClass(calculateAIPower(p, matches))}`} title="AI Overall (50-100)">
                        AI {calculateAIPower(p, matches)}
                      </span>
                    </>
                  )}
                  {isGK && (
                    <>
                      <span className="inline-flex items-center rounded px-3 py-1 text-sm font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        GK
                      </span>
                      <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold shadow-sm ${aiPowerChipClass(calculateAIPower(p, matches))}`} title="AI Overall (50-100)">
                        AI {calculateAIPower(p, matches)}
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
        isAdmin={isAdmin}
      />
    </div>
  )
}
