/**
 * 개발/프로덕션 환경에 따라 로그를 제어하는 유틸리티
 */

const isDev = () => {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' ||
     window.location.hostname.includes('localhost'))
  )
}

export const logger = {
  log: (...args) => {
    if (isDev()) console.log(...args)
  },
  warn: (...args) => {
    if (isDev()) console.warn(...args)
  },
  error: (...args) => {
    // 에러는 항상 출력
    console.error(...args)
  },
  info: (...args) => {
    if (isDev()) console.info(...args)
  }
}

export default logger
