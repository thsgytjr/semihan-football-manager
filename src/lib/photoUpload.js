// src/lib/photoUpload.js
import { logger } from './logger'
import { TEAM_CONFIG } from './teamConfig'

const MAX_RETRIES = 3
const RETRY_DELAY = 1000
const SIGN_ENDPOINT = TEAM_CONFIG.r2.signUrl
const PUBLIC_BASE = TEAM_CONFIG.r2.publicUrl
const TEAM_PATH = TEAM_CONFIG.r2.teamPath

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function convertToJPEG(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          const MAX_W = 1200
          const MAX_H = 1200
          let { width, height } = img
          if (width > height && width > MAX_W) {
            height = Math.round(height * MAX_W / width)
            width = MAX_W
          } else if (height >= width && height > MAX_H) {
            width = Math.round(width * MAX_H / height)
            height = MAX_H
          }
          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('이미지 변환 실패: Blob 생성 실패'))
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now()
            }))
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

async function getSignedUrl(key, contentType, action) {
  if (!SIGN_ENDPOINT) throw new Error('R2 사전 서명 엔드포인트(VITE_R2_SIGN_URL)가 설정되지 않았습니다.')
  const res = await fetch(SIGN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType, action })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`R2 서명 요청 실패 (${res.status}): ${text}`)
  }
  return res.json()
}

async function putWithRetry(url, file, contentType, retries = 0) {
  try {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(`R2 업로드 실패 (${r.status}): ${t}`)
    }
    return true
  } catch (err) {
    if (retries < MAX_RETRIES) {
      await delay(RETRY_DELAY)
      return putWithRetry(url, file, contentType, retries + 1)
    }
    throw err
  }
}

export async function uploadPlayerPhoto(file, playerId, playerName = null, oldPhotoUrl = null) {
  if (!file) throw new Error('파일이 선택되지 않았습니다.')
  const MAX_SIZE = 5 * 1024 * 1024
  if (file.size > MAX_SIZE) throw new Error(`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(2)}MB). 5MB 이하 이미지를 사용해주세요.`)
  if (!file.type.startsWith('image/')) throw new Error(`이미지 파일만 업로드 가능합니다. (현재 타입: ${file.type || '알 수 없음'})`)

  let uploadFile = file
  const needsConversion =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  if (needsConversion) uploadFile = await convertToJPEG(file)

  const sanitizedName = (playerName || 'player').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20)
  const fileExtension = uploadFile.type === 'image/png' ? 'png' : 'jpg'
  const fileName = sanitizedName ? `${sanitizedName}_${playerId}.${fileExtension}` : `${playerId}.${fileExtension}`
  const filePath = `${TEAM_PATH}/players/${fileName}`

  if (oldPhotoUrl && oldPhotoUrl.includes(TEAM_PATH)) {
    try {
      const cleanOldUrl = oldPhotoUrl.split('?')[0].split('#')[0]
      const oldFileName = cleanOldUrl.split('/').pop()
      const isSamePlayer = oldFileName && (
        oldFileName.includes(`_${playerId}.`) ||
        oldFileName === `${playerId}.${fileExtension}` ||
        oldFileName === `${playerId}.png` ||
        oldFileName === `${playerId}.jpg`
      )
      if (isSamePlayer && oldFileName !== fileName) await deletePlayerPhoto(cleanOldUrl)
    } catch (err) {
      logger.error('⚠️ 이전 사진 삭제 실패:', err)
    }
  }

  const { uploadUrl, publicUrl } = await getSignedUrl(filePath, uploadFile.type, 'put')
  await putWithRetry(uploadUrl, uploadFile, uploadFile.type)
  return publicUrl || `${PUBLIC_BASE}/${TEAM_PATH}/${filePath}`
}

export async function deletePlayerPhoto(photoUrl) {
  if (!photoUrl) return
  try {
    const cleanUrl = photoUrl.split('?')[0].split('#')[0]
    const filePath = cleanUrl.split(`${TEAM_PATH}/`)[1]
    if (!filePath) return
    const { deleteUrl } = await getSignedUrl(filePath, 'application/octet-stream', 'delete')
    if (!deleteUrl) return
    await fetch(deleteUrl, { method: 'DELETE' })
  } catch (err) {
    logger.error('❌ deletePlayerPhoto 실패:', err)
  }
}
