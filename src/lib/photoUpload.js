// src/lib/photoUpload.js
import { supabase } from './supabaseClient'

const BUCKET_NAME = 'player-photos' // Supabase Storage 버킷 이름

/**
 * 선수 사진을 Supabase Storage에 업로드
 * @param {File} file - 업로드할 이미지 파일
 * @param {string} playerId - 선수 ID (파일명으로 사용)
 * @param {string} oldPhotoUrl - 기존 사진 URL (삭제용, 선택사항)
 * @returns {Promise<string>} - 업로드된 이미지의 Public URL
 */
export async function uploadPlayerPhoto(file, playerId, oldPhotoUrl = null) {
  if (!file) throw new Error('파일이 없습니다.')
  
  // 파일 크기 검증 (5MB = 5242880 bytes)
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB
  if (file.size > MAX_SIZE) {
    throw new Error('파일 크기는 5MB 이하여야 합니다.')
  }
  
  // 이미지 파일 타입 검증
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드 가능합니다.')
  }
  
  // 기존 파일 삭제 (있으면)
  if (oldPhotoUrl) {
    await deletePlayerPhoto(oldPhotoUrl)
  }
  
  // 파일 확장자 추출
  const fileExt = file.name.split('.').pop().toLowerCase()
  const fileName = `${playerId}.${fileExt}` // 고정된 파일명 (타임스탬프 제거)
  const filePath = `players/${fileName}`
  
  // Supabase Storage에 업로드
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true // 같은 이름이면 덮어쓰기
    })
  
  if (error) {
    console.error('Upload error:', error)
    throw new Error(`업로드 실패: ${error.message}`)
  }
  
  // Public URL 생성 (캐시 무효화를 위해 타임스탬프 추가)
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath)
  
  // 브라우저 캐시 방지를 위해 쿼리 파라미터 추가
  return `${publicUrl}?t=${Date.now()}`
}

/**
 * 선수 사진 삭제 (옵션)
 * @param {string} photoUrl - 삭제할 이미지 URL
 */
export async function deletePlayerPhoto(photoUrl) {
  if (!photoUrl || !photoUrl.includes(BUCKET_NAME)) return
  
  try {
    // URL에서 파일 경로 추출
    const urlParts = photoUrl.split(`${BUCKET_NAME}/`)
    if (urlParts.length < 2) return
    
    const filePath = urlParts[1]
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath])
    
    if (error) {
      console.error('Delete error:', error)
    }
  } catch (err) {
    console.error('Failed to delete photo:', err)
  }
}
