// src/lib/dateUtils.js
// 날짜/시간 관련 유틸리티 함수

/**
 * 로컬 datetime-local 값을 ISO 문자열로 변환 (로컬 타임존 오프셋 포함)
 * @param {string} localDateTimeString - YYYY-MM-DDTHH:mm 형식
 * @returns {string} ISO 8601 형식 with local timezone offset
 */
export function localDateTimeToISO(localDateTimeString) {
  if (!localDateTimeString) return null

  // 이미 초/타임존 정보가 있으면 그대로 사용
  if (localDateTimeString.includes('+') || localDateTimeString.includes('Z')) {
    return localDateTimeString
  }

  // 로컬 시간 문자열을 Date 객체로 파싱 (로컬 시간대 기준)
  const parts = localDateTimeString.split('T')
  if (parts.length !== 2) return null
  const [datePart, timePart] = parts
  
  // Date 생성자에 문자열을 넘기면 타임존 해석 문제가 있으므로, 
  // 연/월/일/시/분을 직접 파싱하여 로컬 시간대 기준 Date 객체 생성
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
  
  // Date 객체의 toISOString()은 UTC로 변환하므로 사용하지 않고,
  // 로컬 타임존 오프셋을 직접 계산하여 ISO 8601 형식으로 변환
  const tzOffsetMinutes = localDate.getTimezoneOffset()
  const tzOffsetHours = Math.abs(Math.floor(tzOffsetMinutes / 60))
  const tzOffsetMins = Math.abs(tzOffsetMinutes % 60)
  const tzSign = tzOffsetMinutes <= 0 ? '+' : '-'
  const tzString = `${tzSign}${String(tzOffsetHours).padStart(2, '0')}:${String(tzOffsetMins).padStart(2, '0')}`
  
  return `${datePart}T${timePart.length === 5 ? timePart + ':00' : timePart}${tzString}`
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
