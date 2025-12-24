// src/lib/dateUtils.js
// 날짜/시간 관련 유틸리티 함수 - UTC 표준화

/**
 * 로컬 datetime-local 값을 UTC ISO 문자열로 변환
 * @param {string} localDateTimeString - YYYY-MM-DDTHH:mm 형식 (로컬 시간)
 * @returns {string} ISO 8601 UTC 형식 (YYYY-MM-DDTHH:mm:ssZ)
 */
export function localDateTimeToUTC(localDateTimeString) {
  if (!localDateTimeString) return null

  // 이미 UTC(Z) 또는 타임존 정보가 있으면 그대로 반환
  if (localDateTimeString.includes('Z') || localDateTimeString.includes('+') || localDateTimeString.includes('-', 10)) {
    return new Date(localDateTimeString).toISOString()
  }

  // 로컬 시간 문자열을 Date 객체로 파싱 (로컬 시간대 기준)
  const parts = localDateTimeString.split('T')
  if (parts.length !== 2) return null
  const [datePart, timePart] = parts
  
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  
  // 로컬 시간대 기준 Date 객체 생성
  const localDate = new Date(year, month - 1, day, hours, minutes || 0, 0, 0)
  
  // UTC로 변환 (toISOString은 UTC를 반환)
  return localDate.toISOString()
}

/**
 * UTC ISO 문자열을 로컬 datetime-local 값으로 변환
 * @param {string} utcIsoString - ISO 8601 UTC 형식
 * @returns {string} YYYY-MM-DDTHH:mm 형식 (로컬 시간)
 */
export function utcToLocalDateTime(utcIsoString) {
  if (!utcIsoString) return ''
  
  const date = new Date(utcIsoString)
  
  // 유효하지 않은 날짜 체크
  if (isNaN(date.getTime())) return ''
  
  // 로컬 시간으로 변환
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * 현재 시간을 로컬 datetime-local 형식으로 반환
 * @returns {string} YYYY-MM-DDTHH:mm 형식
 */
export function getCurrentLocalDateTime() {
  const now = new Date()
  
  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * UTC ISO 문자열을 로케일에 맞는 형식으로 표시
 * @param {string} utcIsoString - ISO 8601 UTC 형식
 * @param {string} locale - 로케일 (예: 'ko-KR', 'en-US')
 * @param {object} options - Intl.DateTimeFormat 옵션
 * @returns {string} 포맷된 날짜/시간 문자열
 */
export function formatUTCToLocal(utcIsoString, locale = 'ko-KR', options = {}) {
  if (!utcIsoString) return ''
  
  const date = new Date(utcIsoString)
  if (isNaN(date.getTime())) return ''
  
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options
  }
  
  return date.toLocaleString(locale, defaultOptions)
}

/**
 * 두 UTC 시간을 비교 (ms 단위)
 * @param {string} utcIsoString1 
 * @param {string} utcIsoString2 
 * @returns {number} diff in milliseconds (date1 - date2)
 */
export function compareUTC(utcIsoString1, utcIsoString2) {
  const date1 = new Date(utcIsoString1)
  const date2 = new Date(utcIsoString2)
  return date1.getTime() - date2.getTime()
}

// 하위 호환성을 위한 alias (기존 코드가 사용할 수 있도록)
export const localDateTimeToISO = localDateTimeToUTC
export const isoToLocalDateTime = utcToLocalDateTime
export const parseLocalDate = (isoString) => new Date(isoString || Date.now())
