// src/lib/photoUpload.js
import { supabase } from './supabaseClient'

const BUCKET_NAME = 'player-photos' // Supabase Storage 버킷 이름
const MAX_RETRIES = 3 // 최대 재시도 횟수
const RETRY_DELAY = 1000 // 재시도 간격 (ms)

/**
 * 딜레이 함수
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * HEIC/HEIF/PNG 이미지를 JPEG로 변환
 */
async function convertToJPEG(file) {
  return new Promise((resolve, reject) => {
    console.log(`🔄 ${file.type || file.name} 변환 시작...`)
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          // 최대 크기 설정 (1200px)
          const MAX_WIDTH = 1200
          const MAX_HEIGHT = 1200
          let width = img.width
          let height = img.height
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round(height * MAX_WIDTH / width)
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round(width * MAX_HEIGHT / height)
              height = MAX_HEIGHT
            }
          }
          
          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)
          
          // JPEG로 변환 (품질 0.85)
          canvas.toBlob((blob) => {
            if (blob) {
              const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              })
              console.log(`✅ 변환 완료: ${(blob.size / 1024).toFixed(2)}KB`)
              resolve(newFile)
            } else {
              reject(new Error('이미지 변환 실패: Blob 생성 실패'))
            }
          }, 'image/jpeg', 0.85)
        } catch (err) {
          reject(new Error(`이미지 변환 실패: ${err.message}`))
        }
      }
      
      img.onerror = () => reject(new Error('이미지 로드 실패: 손상되었거나 지원하지 않는 형식입니다'))
      img.src = e.target.result
    }
    
    reader.onerror = () => reject(new Error('파일 읽기 실패: 파일에 접근할 수 없습니다'))
    reader.readAsDataURL(file)
  })
}

/**
 * 재시도 로직이 포함된 업로드 함수
 */
async function uploadWithRetry(filePath, file, options, retries = 0) {
  try {
    console.log(`📤 업로드 시도 (${retries + 1}/${MAX_RETRIES + 1})`)
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, options)
    
    if (error) {
      // 특정 에러는 재시도하지 않음
      if (error.message?.includes('Bucket not found')) {
        throw new Error('Storage 버킷을 찾을 수 없습니다. Supabase 설정을 확인해주세요.')
      }
      if (error.message?.includes('policy')) {
        throw new Error('업로드 권한이 없습니다. Storage Policy를 확인해주세요.')
      }
      if (error.message?.includes('payload')) {
        throw new Error('파일이 너무 큽니다. 5MB 이하의 이미지를 사용해주세요.')
      }
      
      // 재시도 가능한 에러 (네트워크 등)
      if (retries < MAX_RETRIES) {
        console.warn(`⚠️ 업로드 실패, ${RETRY_DELAY}ms 후 재시도...`, error.message)
        await delay(RETRY_DELAY)
        return uploadWithRetry(filePath, file, options, retries + 1)
      }
      
      throw new Error(`업로드 실패 (${MAX_RETRIES + 1}회 시도): ${error.message}`)
    }
    
    console.log('✅ 업로드 성공')
    return data
  } catch (err) {
    if (retries < MAX_RETRIES && !err.message.includes('Bucket') && !err.message.includes('권한') && !err.message.includes('너무 큽니다')) {
      console.warn(`⚠️ 예외 발생, ${RETRY_DELAY}ms 후 재시도...`, err.message)
      await delay(RETRY_DELAY)
      return uploadWithRetry(filePath, file, options, retries + 1)
    }
    throw err
  }
}

/**
 * 선수 사진을 Supabase Storage에 업로드
 * @param {File} file - 업로드할 이미지 파일
 * @param {string} playerId - 선수 ID
 * @param {string} playerName - 선수 이름 (파일명으로 사용)
 * @param {string} oldPhotoUrl - 기존 사진 URL (삭제용, 선택사항)
 * @returns {Promise<string>} - 업로드된 이미지의 Public URL
 */
export async function uploadPlayerPhoto(file, playerId, playerName = null, oldPhotoUrl = null) {
  try {
    // 1. 파일 검증
    if (!file) {
      throw new Error('파일이 선택되지 않았습니다.')
    }
    
    console.log(`📸 업로드 시작: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`)
    
    // 2. 파일 크기 검증 (5MB)
    const MAX_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      throw new Error(`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(2)}MB). 5MB 이하의 이미지를 사용해주세요.`)
    }
    
    // 3. 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      throw new Error(`이미지 파일만 업로드 가능합니다. (현재 타입: ${file.type || '알 수 없음'})`)
    }
    
    // 4. HEIC만 변환 (PNG는 투명 배경 유지 위해 그대로 사용)
    let uploadFile = file
    const needsConversion = 
      file.type === 'image/heic' || 
      file.type === 'image/heif' ||
      file.name.toLowerCase().endsWith('.heic') || 
      file.name.toLowerCase().endsWith('.heif')
    
    if (needsConversion) {
      try {
        uploadFile = await convertToJPEG(file)
      } catch (conversionError) {
        console.error('❌ 변환 실패:', conversionError)
        throw new Error(`이미지 변환 실패: ${conversionError.message}`)
      }
    }
    
    // 5. 기존 파일 삭제 (실패해도 계속 진행)
    if (oldPhotoUrl) {
      try {
        await deletePlayerPhoto(oldPhotoUrl)
        console.log('🗑️ 기존 사진 삭제 완료')
      } catch (deleteError) {
        console.warn('⚠️ 기존 사진 삭제 실패 (무시):', deleteError)
      }
    }
    
    // 6. 파일명 및 경로 생성 (선수 이름 사용, 특수문자 제거)
    const sanitizedName = (playerName || playerId)
      .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '') // 특수문자 제거
      .replace(/\s+/g, '_') // 공백을 언더스코어로
      .trim()
    
    const fileExtension = uploadFile.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${sanitizedName}_${playerId}.${fileExtension}`
    const filePath = `players/${fileName}`
    
    // 7. 업로드 (재시도 포함)
    await uploadWithRetry(filePath, uploadFile, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true
    })
    
    // 8. Public URL 생성
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)
    
    if (!publicUrl) {
      throw new Error('Public URL 생성 실패')
    }
    
    // 9. 캐시 방지용 타임스탬프 추가
    const finalUrl = `${publicUrl}?t=${Date.now()}`
    console.log('🎉 업로드 완료:', finalUrl)
    
    return finalUrl
    
  } catch (error) {
    // 상세한 에러 로깅
    console.error('❌ 업로드 실패:', {
      message: error.message,
      file: file?.name,
      size: file?.size,
      type: file?.type
    })
    
    // 사용자 친화적인 에러 메시지
    throw error
  }
}

/**
 * 선수 사진 삭제 (옵션)
 * @param {string} photoUrl - 삭제할 이미지 URL
 */
export async function deletePlayerPhoto(photoUrl) {
  if (!photoUrl || !photoUrl.includes(BUCKET_NAME)) {
    console.log('⏭️ 삭제 스킵: 유효하지 않은 URL')
    return
  }
  
  try {
    // URL에서 쿼리 파라미터 제거 (?t=... 등)
    const cleanUrl = photoUrl.split('?')[0]
    
    // URL에서 파일 경로 추출
    const urlParts = cleanUrl.split(`${BUCKET_NAME}/`)
    if (urlParts.length < 2) {
      console.warn('⚠️ 파일 경로 추출 실패:', photoUrl)
      return
    }
    
    const filePath = urlParts[1]
    console.log('🗑️ Storage 삭제 시도:', filePath)
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath])
    
    if (error) {
      console.error('❌ Storage 삭제 에러:', error)
      throw error
    }
    
    console.log('✅ Storage 삭제 성공:', filePath)
  } catch (err) {
    console.error('❌ 사진 삭제 실패:', err)
    throw err
  }
}
