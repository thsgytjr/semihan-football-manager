// src/lib/deviceFingerprint.js
// 디바이스 고유 식별을 위한 fingerprint 생성

/**
 * 브라우저/디바이스 고유 정보를 조합해서 fingerprint 생성
 * 같은 와이파이를 쓰는 여러 디바이스를 구분하기 위함
 * 
 * @returns {Promise<string>} 디바이스 fingerprint (해시값)
 */
export async function getDeviceFingerprint() {
  try {
    const components = []
    
    // 1. User Agent
    components.push(navigator.userAgent || 'unknown')
    
    // 2. 화면 해상도
    components.push(`${screen.width}x${screen.height}`)
    components.push(`${screen.colorDepth}bit`)
    
    // 3. 타임존
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    
    // 4. 언어 설정
    components.push(navigator.language || 'en')
    
    // 5. 플랫폼
    components.push(navigator.platform || 'unknown')
    
    // 6. 하드웨어 동시성 (CPU 코어 수)
    components.push(`cores:${navigator.hardwareConcurrency || 0}`)
    
    // 7. Touch 지원 여부
    components.push(`touch:${navigator.maxTouchPoints || 0}`)
    
    // 8. Canvas fingerprint (선택적, 성능 이슈 있을 수 있음)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.textBaseline = 'top'
        ctx.font = '14px Arial'
        ctx.fillStyle = '#f60'
        ctx.fillRect(0, 0, 62, 20)
        ctx.fillStyle = '#069'
        ctx.fillText('Goalify', 2, 2)
        components.push(canvas.toDataURL().slice(-50)) // 마지막 50자만
      }
    } catch (e) {
      // Canvas 접근 불가 시 무시
    }
    
    // 9. LocalStorage 사용 가능 여부
    try {
      const test = '__test__'
      localStorage.setItem(test, test)
      localStorage.removeItem(test)
      components.push('ls:yes')
    } catch (e) {
      components.push('ls:no')
    }
    
    // 10. SessionStorage 사용 가능 여부
    try {
      const test = '__test__'
      sessionStorage.setItem(test, test)
      sessionStorage.removeItem(test)
      components.push('ss:yes')
    } catch (e) {
      components.push('ss:no')
    }
    
    // 11. WebGL Fingerprint (GPU 정보)
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          components.push(`gpu:${vendor}|${renderer}`)
        } else {
          components.push('gpu:unknown')
        }
      }
    } catch (e) {
      components.push('gpu:error')
    }
    
    // 모든 컴포넌트를 조합해서 문자열로 만들기
    const fingerprintString = components.join('|')
    
    // SHA-256 해시 생성 (브라우저 Web Crypto API 사용)
    if (window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(fingerprintString)
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      return hashHex
    }
    
    // Web Crypto API를 사용할 수 없으면 간단한 해시
    let hash = 0
    for (let i = 0; i < fingerprintString.length; i++) {
      const char = fingerprintString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16)
    
  } catch (error) {
    console.warn('Failed to generate device fingerprint:', error)
    // 실패 시 임시 ID 반환
    return 'fallback-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
  }
}

/**
 * 기존 visitor ID 생성 함수 개선
 * Private 창에서도 동일한 기기면 같은 ID 반환 (fingerprint 기반)
 * localStorage 캐싱은 성능 최적화용으로만 사용
 * 
 * @returns {Promise<string>} Visitor ID
 */
export async function getOrCreateEnhancedVisitorId() {
  const key = 'sfm_visitor_id_v3'
  
  try {
    // localStorage 캐싱 확인 (성능 최적화)
    let cachedId = null
    try {
      cachedId = localStorage.getItem(key)
    } catch (e) {
      // Private 모드에서는 localStorage 접근 불가, 무시
    }
    
    // Fingerprint 생성 (Private 창에서도 동일)
    const fingerprint = await getDeviceFingerprint()
    
    // fingerprint만 사용 (timestamp, random 제거)
    const visitorId = `v3-${fingerprint}`
    
    // 캐싱 시도 (실패해도 무시)
    try {
      if (!cachedId || cachedId !== visitorId) {
        localStorage.setItem(key, visitorId)
      }
    } catch (e) {
      // Private 모드 무시
    }
    
    return visitorId
  } catch (e) {
    console.warn('Failed to create visitor ID:', e)
    // Fingerprint 실패 시에만 fallback
    return 'fallback-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
  }
}

/**
 * 디바이스 정보 조회 (디버깅/로깅용)
 * 
 * @returns {Object} 디바이스 정보
 */
export function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent || 'unknown',
    screen: `${screen.width}x${screen.height} @ ${screen.colorDepth}bit`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    language: navigator.language || 'en',
    platform: navigator.platform || 'unknown',
    cores: navigator.hardwareConcurrency || 0,
    touchPoints: navigator.maxTouchPoints || 0,
    localStorage: (() => {
      try {
        const test = '__test__'
        localStorage.setItem(test, test)
        localStorage.removeItem(test)
        return true
      } catch (e) {
        return false
      }
    })(),
  }
}
