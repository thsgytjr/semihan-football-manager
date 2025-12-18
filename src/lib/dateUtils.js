// src/lib/dateUtils.js
// 날짜/시간 관련 유틸리티 함수

/**
 * 로컬 datetime-local 값을 ISO 문자열로 변환 (타임존 정보 포함)
 * @param {string} localDateTimeString - YYYY-MM-DDTHH:mm 형식
 * @returns {string} ISO 8601 형식 (YYYY-MM-DDTHH:mm:ss+09:00)
 */
export function localDateTimeToISO(localDateTimeString) {
  if (!localDateTimeString) return null

  // 이미 초/타임존 정보가 있으면 그대로 사용
  if (localDateTimeString.includes('+') || localDateTimeString.includes('Z')) {
    return localDateTimeString
  }

  // 순수 로컬 문자열을 그대로 보존하되, TZ 오프셋을 환경에 의존하지 않도록 UTC(Z)로 표기
  // 예: "2025-12-18T19:00" -> "2025-12-18T19:00:00Z"
  const parts = localDateTimeString.split('T')
  if (parts.length !== 2) return null
  const [datePart, timePartRaw] = parts
  const timePart = timePartRaw.length === 5 ? `${timePartRaw}:00` : timePartRaw
  return `${datePart}T${timePart}Z`
}

/**
 * ISO 문자열을 로컬 datetime-local 값으로 변환
 * @param {string} isoString - ISO 8601 형식
 * @returns {string} YYYY-MM-DDTHH:mm 형식
 */
export function isoToLocalDateTime(isoString) {
  if (!isoString) return ''
  
  const date = new Date(isoString)
  
  // 유효하지 않은 날짜 체크
  if (isNaN(date.getTime())) return ''
  
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * 로컬 시간대에서 날짜/시간 표시를 위한 Date 객체 생성
 * @param {string} isoString - ISO 8601 형식
 * @returns {Date}
 */
export function parseLocalDate(isoString) {
  if (!isoString) return new Date()
  return new Date(isoString)
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
