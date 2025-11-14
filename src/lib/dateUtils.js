// src/lib/dateUtils.js
// 날짜/시간 관련 유틸리티 함수

/**
 * 로컬 datetime-local 값을 ISO 문자열로 변환 (타임존 정보 포함)
 * @param {string} localDateTimeString - YYYY-MM-DDTHH:mm 형식
 * @returns {string} ISO 8601 형식 (YYYY-MM-DDTHH:mm:ss+09:00)
 */
export function localDateTimeToISO(localDateTimeString) {
  if (!localDateTimeString) return null
  
  // 이미 초와 타임존 정보가 있으면 그대로 반환
  if (localDateTimeString.includes('+') || localDateTimeString.includes('Z')) {
    return localDateTimeString
  }
  
  // YYYY-MM-DDTHH:mm 형식을 Date 객체로 변환 (로컬 시간으로 해석)
  const date = new Date(localDateTimeString)
  
  // 타임존 오프셋 계산 (분 단위)
  const offset = -date.getTimezoneOffset()
  const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')
  const offsetMinutes = (Math.abs(offset) % 60).toString().padStart(2, '0')
  const offsetSign = offset >= 0 ? '+' : '-'
  
  // ISO 형식으로 변환 (타임존 정보 포함)
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`
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
