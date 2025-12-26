/**
 * 입력 검증 유틸리티
 * 사용자 입력의 유효성을 검사하고 에러를 방지합니다.
 */

/**
 * 문자열이 비어있지 않은지 검증
 */
export function validateRequired(value, fieldName = '필드') {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: `${fieldName}은(는) 필수입니다.` }
  }
  return { valid: true }
}

/**
 * 문자열 길이 검증
 */
export function validateLength(value, min = 0, max = Infinity, fieldName = '필드') {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName}은(는) 문자열이어야 합니다.` }
  }
  
  const length = value.trim().length
  
  if (length < min) {
    return { valid: false, error: `${fieldName}은(는) 최소 ${min}자 이상이어야 합니다.` }
  }
  
  if (length > max) {
    return { valid: false, error: `${fieldName}은(는) 최대 ${max}자 이하여야 합니다.` }
  }
  
  return { valid: true }
}

/**
 * 이메일 형식 검증
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  
  if (!email || !emailRegex.test(email)) {
    return { valid: false, error: '올바른 이메일 형식이 아닙니다.' }
  }
  
  return { valid: true }
}

/**
 * 전화번호 형식 검증 (한국)
 */
export function validatePhoneNumber(phone) {
  // 01X-XXXX-XXXX 또는 01XXXXXXXXX 형식
  const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/
  
  if (!phone || !phoneRegex.test(phone.replace(/\s/g, ''))) {
    return { valid: false, error: '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)' }
  }
  
  return { valid: true }
}

/**
 * 숫자 범위 검증
 */
export function validateNumber(value, min = -Infinity, max = Infinity, fieldName = '숫자') {
  const num = typeof value === 'string' ? parseFloat(value) : value
  
  if (isNaN(num)) {
    return { valid: false, error: `${fieldName}은(는) 유효한 숫자여야 합니다.` }
  }
  
  if (num < min) {
    return { valid: false, error: `${fieldName}은(는) ${min} 이상이어야 합니다.` }
  }
  
  if (num > max) {
    return { valid: false, error: `${fieldName}은(는) ${max} 이하여야 합니다.` }
  }
  
  return { valid: true }
}

/**
 * 정수 검증
 */
export function validateInteger(value, fieldName = '정수') {
  const num = typeof value === 'string' ? parseInt(value, 10) : value
  
  if (!Number.isInteger(num)) {
    return { valid: false, error: `${fieldName}은(는) 정수여야 합니다.` }
  }
  
  return { valid: true }
}

/**
 * 날짜 형식 검증
 */
export function validateDate(dateString, fieldName = '날짜') {
  if (!dateString) {
    return { valid: false, error: `${fieldName}을(를) 입력해주세요.` }
  }
  
  const date = new Date(dateString)
  
  if (isNaN(date.getTime())) {
    return { valid: false, error: `${fieldName} 형식이 올바르지 않습니다.` }
  }
  
  return { valid: true, value: date }
}

/**
 * 미래 날짜 검증
 */
export function validateFutureDate(dateString, fieldName = '날짜') {
  const dateValidation = validateDate(dateString, fieldName)
  
  if (!dateValidation.valid) {
    return dateValidation
  }
  
  const date = dateValidation.value
  const now = new Date()
  
  if (date < now) {
    return { valid: false, error: `${fieldName}은(는) 미래 날짜여야 합니다.` }
  }
  
  return { valid: true, value: date }
}

/**
 * 과거 날짜 검증
 */
export function validatePastDate(dateString, fieldName = '날짜') {
  const dateValidation = validateDate(dateString, fieldName)
  
  if (!dateValidation.valid) {
    return dateValidation
  }
  
  const date = dateValidation.value
  const now = new Date()
  
  if (date > now) {
    return { valid: false, error: `${fieldName}은(는) 과거 날짜여야 합니다.` }
  }
  
  return { valid: true, value: date }
}

/**
 * 배열 검증
 */
export function validateArray(value, minLength = 0, maxLength = Infinity, fieldName = '목록') {
  if (!Array.isArray(value)) {
    return { valid: false, error: `${fieldName}은(는) 배열이어야 합니다.` }
  }
  
  if (value.length < minLength) {
    return { valid: false, error: `${fieldName}은(는) 최소 ${minLength}개 항목이 필요합니다.` }
  }
  
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName}은(는) 최대 ${maxLength}개 항목까지 가능합니다.` }
  }
  
  return { valid: true }
}

/**
 * 객체 필수 필드 검증
 */
export function validateObject(obj, requiredFields = []) {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: '유효한 객체가 아닙니다.' }
  }
  
  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined) {
      return { valid: false, error: `필수 필드 '${field}'이(가) 없습니다.` }
    }
  }
  
  return { valid: true }
}

/**
 * URL 형식 검증
 */
export function validateURL(url, fieldName = 'URL') {
  try {
    new URL(url)
    return { valid: true }
  } catch {
    return { valid: false, error: `${fieldName} 형식이 올바르지 않습니다.` }
  }
}

/**
 * 플레이어 데이터 검증
 */
export function validatePlayer(player) {
  // 필수 필드 검증
  const requiredValidation = validateObject(player, ['id', 'name'])
  if (!requiredValidation.valid) {
    return requiredValidation
  }
  
  // 이름 길이 검증
  const nameValidation = validateLength(player.name, 1, 50, '이름')
  if (!nameValidation.valid) {
    return nameValidation
  }
  
  // 전화번호 검증 (선택적)
  if (player.phone) {
    const phoneValidation = validatePhoneNumber(player.phone)
    if (!phoneValidation.valid) {
      return phoneValidation
    }
  }
  
  return { valid: true }
}

/**
 * 매치 데이터 검증
 */
export function validateMatch(match) {
  // 필수 필드 검증
  const requiredValidation = validateObject(match, ['id', 'teams'])
  if (!requiredValidation.valid) {
    return requiredValidation
  }
  
  // 팀 배열 검증
  const teamsValidation = validateArray(match.teams, 2, Infinity, '팀')
  if (!teamsValidation.valid) {
    return teamsValidation
  }
  
  // 각 팀에 선수가 있는지 검증
  for (let i = 0; i < match.teams.length; i++) {
    const teamValidation = validateArray(match.teams[i], 1, Infinity, `팀 ${i + 1}의 선수`)
    if (!teamValidation.valid) {
      return teamValidation
    }
  }
  
  // 날짜 검증 (선택적)
  if (match.dateISO) {
    const dateValidation = validateDate(match.dateISO, '경기 날짜')
    if (!dateValidation.valid) {
      return dateValidation
    }
  }
  
  return { valid: true }
}

/**
 * 점수 데이터 검증
 */
export function validateScore(score, fieldName = '점수') {
  const numberValidation = validateNumber(score, 0, 999, fieldName)
  if (!numberValidation.valid) {
    return numberValidation
  }
  
  const integerValidation = validateInteger(score, fieldName)
  if (!integerValidation.valid) {
    return integerValidation
  }
  
  return { valid: true }
}

/**
 * 여러 검증을 한번에 실행
 */
export function validateAll(validations) {
  for (const validation of validations) {
    if (!validation.valid) {
      return validation
    }
  }
  
  return { valid: true }
}

/**
 * 안전한 문자열 변환
 */
export function sanitizeString(value) {
  if (value === null || value === undefined) {
    return ''
  }
  
  return String(value).trim()
}

/**
 * 안전한 숫자 변환
 */
export function sanitizeNumber(value, defaultValue = 0) {
  const num = typeof value === 'string' ? parseFloat(value) : value
  
  if (isNaN(num)) {
    return defaultValue
  }
  
  return num
}

/**
 * 안전한 정수 변환
 */
export function sanitizeInteger(value, defaultValue = 0) {
  const num = typeof value === 'string' ? parseInt(value, 10) : value
  
  if (!Number.isInteger(num)) {
    return defaultValue
  }
  
  return num
}

/**
 * 안전한 배열 변환
 */
export function sanitizeArray(value, defaultValue = []) {
  if (!Array.isArray(value)) {
    return defaultValue
  }
  
  return value
}
