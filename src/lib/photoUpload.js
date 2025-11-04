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
        await delay(RETRY_DELAY)
        return uploadWithRetry(filePath, file, options, retries + 1)
      }
      
      throw new Error(`업로드 실패 (${MAX_RETRIES + 1}회 시도): ${error.message}`)
    }
    
    return data
  } catch (err) {
    if (retries < MAX_RETRIES && !err.message.includes('Bucket') && !err.message.includes('권한') && !err.message.includes('너무 큽니다')) {
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
        throw new Error(`이미지 변환 실패: ${conversionError.message}`)
      }
    }
    
    // 5. 기존 파일 삭제 (같은 선수의 이전 사진만 삭제)
    // 먼저 새 파일명 생성
    const sanitizedName = (playerName || 'player')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
      .slice(0, 20)
    
    const fileExtension = uploadFile.type === 'image/png' ? 'png' : 'jpg'
    const fileName = sanitizedName 
      ? `${sanitizedName}_${playerId}.${fileExtension}` 
      : `${playerId}.${fileExtension}`
    const filePath = `players/${fileName}`
    
    console.log('📝 업로드 파일 정보:', {
      fileName,
      filePath,
      playerId,
      sanitizedName
    })
    
    // oldPhotoUrl이 있고, 새 파일과 다른 경우만 삭제 (같은 선수의 이전 사진)
    if (oldPhotoUrl && oldPhotoUrl.includes('player-photos')) {
      try {
        const cleanOldUrl = oldPhotoUrl.split('?')[0].split('#')[0]
        const oldFileName = cleanOldUrl.split('/').pop()
        
        // playerId를 포함하는지 확인 (언더스코어 있거나 UUID만 있는 경우 모두 체크)
        const isSamePlayer = oldFileName && (
          oldFileName.includes(`_${playerId}.`) || // name_uuid.ext 형식
          oldFileName === `${playerId}.${fileExtension}` || // uuid.ext 형식
          oldFileName === `${playerId}.png` || // 다른 확장자
          oldFileName === `${playerId}.jpg`
        )
        
        console.log('🗑️ 삭제 체크:', {
          oldPhotoUrl,
          cleanOldUrl,
          oldFileName,
          newFileName: fileName,
          playerId,
          fileExtension,
          checks: {
            hasUnderscore: oldFileName.includes(`_${playerId}.`),
            exactMatch: oldFileName === `${playerId}.${fileExtension}`,
            isPng: oldFileName === `${playerId}.png`,
            isJpg: oldFileName === `${playerId}.jpg`,
          },
          isSamePlayer,
          willDelete: isSamePlayer && oldFileName !== fileName
        })
        
        // 같은 선수이고, 다른 파일명인 경우만 삭제
        if (isSamePlayer && oldFileName !== fileName) {
          console.log('🚨 삭제 실행:', oldPhotoUrl)
          await deletePlayerPhoto(oldPhotoUrl)
          console.log('✅ 이전 사진 삭제 완료')
        } else if (!isSamePlayer) {
          console.log('⏭️ 다른 선수의 사진 - 삭제 안함')
        } else {
          console.log('⏭️ 같은 파일명 - upsert로 덮어쓰기')
        }
      } catch (deleteError) {
        console.error('⚠️ 삭제 실패:', deleteError)
      }
    } else if (oldPhotoUrl) {
      console.log('⏭️ player-photos 버킷이 아님:', oldPhotoUrl)
    }
    
    // 6. 업로드 (재시도 포함)
    console.log('📤 업로드 시작:', filePath)
    
    const uploadResult = await uploadWithRetry(filePath, uploadFile, {
      contentType: uploadFile.type === 'image/png' ? 'image/png' : 'image/jpeg',
      cacheControl: '3600',
      upsert: true // 같은 playerId는 덮어쓰기
    })
    
    console.log('✅ 업로드 성공:', uploadResult)
    
    // 7. 업로드 확인 (파일이 실제로 존재하는지 체크)
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list('players', {
        search: fileName
      })
    
    console.log('🔍 업로드 확인:', {
      fileName,
      filesFound: files?.length || 0,
      files: files?.map(f => f.name),
      listError
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
    
    return finalUrl
    
  } catch (error) {
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
    return
  }
  
  try {
    // URL에서 쿼리 파라미터 제거 (?t=... 등)
    const cleanUrl = photoUrl.split('?')[0]
    
    // URL에서 파일 경로 추출
    const urlParts = cleanUrl.split(`${BUCKET_NAME}/`)
    if (urlParts.length < 2) {
      return
    }
    
    const filePath = urlParts[1]
    
    console.log('🗑️ 파일 삭제 시작:', {
      photoUrl,
      cleanUrl,
      filePath,
      bucket: BUCKET_NAME
    })
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath])
    
    if (error) {
      console.error('❌ 삭제 에러:', error)
      throw error
    }
    
    console.log('✅ 파일 삭제 완료:', filePath)
  } catch (err) {
    console.error('❌ deletePlayerPhoto 실패:', err)
    throw err
  }
}
