// src/lib/visitorTracking.js
// 방문자 추적 유틸리티

// User Agent 파싱
export function parseUserAgent(ua) {
  if (!ua) return { device: 'Unknown', browser: 'Unknown', os: 'Unknown', phoneModel: null }

  // Device Type
  let device = 'Desktop'
  if (/mobile/i.test(ua)) device = 'Mobile'
  else if (/tablet|ipad/i.test(ua)) device = 'Tablet'

  // Browser (우선순위 중요: 구체적인 것부터 체크)
  let browser = 'Unknown'
  if (/edg/i.test(ua)) browser = 'Edge'
  else if (/opr|opera/i.test(ua)) browser = 'Opera'
  else if (/crios/i.test(ua)) browser = 'Chrome' // iOS Chrome
  else if (/fxios/i.test(ua)) browser = 'Firefox' // iOS Firefox
  else if (/chrome/i.test(ua)) browser = 'Chrome'
  else if (/firefox/i.test(ua)) browser = 'Firefox'
  else if (/safari/i.test(ua)) browser = 'Safari' // 마지막에 체크

  // OS
  let os = 'Unknown'
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/mac os/i.test(ua)) os = 'macOS'
  else if (/linux/i.test(ua)) os = 'Linux'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/ios|iphone|ipad/i.test(ua)) os = 'iOS'

  // Phone Model 감지
  let phoneModel = null
  
  if (device === 'Mobile' || device === 'Tablet') {
    // iPhone 모델
    if (/iphone/i.test(ua)) {
      const match = ua.match(/iPhone\s*(\d+[,_]\d+)?/i)
      if (match) {
        phoneModel = 'iPhone'
        // iPhone15,2 같은 식별자 추출
        if (match[1]) {
          phoneModel += ' (' + match[1].replace(/[,_]/g, ',') + ')'
        }
      } else {
        phoneModel = 'iPhone'
      }
    }
    // iPad 모델
    else if (/ipad/i.test(ua)) {
      const match = ua.match(/iPad\d+[,_]\d+/i)
      phoneModel = match ? match[0] : 'iPad'
    }
    // Samsung Galaxy
    else if (/SM-[A-Z0-9]+/i.test(ua)) {
      const match = ua.match(/SM-[A-Z0-9]+/i)
      phoneModel = 'Samsung ' + match[0]
    }
    // Google Pixel
    else if (/Pixel/i.test(ua)) {
      const match = ua.match(/Pixel\s*\d*\s*[a-zA-Z]*/i)
      phoneModel = match ? match[0].trim() : 'Pixel'
    }
    // Xiaomi
    else if (/Mi\s+[A-Z0-9]+|Redmi/i.test(ua)) {
      const match = ua.match(/(Mi\s+[A-Z0-9]+|Redmi\s*[A-Z0-9\s]*)/i)
      phoneModel = match ? 'Xiaomi ' + match[0].trim() : 'Xiaomi'
    }
    // Huawei
    else if (/Huawei|HUAWEI|HW-/i.test(ua)) {
      const match = ua.match(/(HW-[A-Z0-9]+|[A-Z]{3}-[A-Z0-9]+)/i)
      phoneModel = match ? 'Huawei ' + match[0] : 'Huawei'
    }
    // LG
    else if (/LG-[A-Z0-9]+/i.test(ua)) {
      const match = ua.match(/LG-[A-Z0-9]+/i)
      phoneModel = match ? match[0] : 'LG'
    }
    // OnePlus
    else if (/OnePlus/i.test(ua)) {
      const match = ua.match(/OnePlus\s*[A-Z0-9]+/i)
      phoneModel = match ? match[0] : 'OnePlus'
    }
    // Generic Android
    else if (/android/i.test(ua)) {
      // Build 정보에서 모델명 추출 시도
      const buildMatch = ua.match(/Build\/([A-Z0-9._-]+)/i)
      if (buildMatch) {
        phoneModel = 'Android Device (Build: ' + buildMatch[1] + ')'
      } else {
        phoneModel = 'Android Device'
      }
    }
  }

  return { device, browser, os, phoneModel }
}

// 고유 방문자 ID 생성/조회
export function getOrCreateVisitorId() {
  const key = 'sfm_visitor_id'
  
  try {
    let visitorId = localStorage.getItem(key)
    
    if (!visitorId) {
      // UUID v4 생성
      visitorId = 'visitor-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
      localStorage.setItem(key, visitorId)
    }
    
    return visitorId
  } catch (e) {
    // localStorage 실패 시 세션 기반 ID
    if (!window._tempVisitorId) {
      window._tempVisitorId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    }
    return window._tempVisitorId
  }
}

// IP 주소 조회 (외부 API 사용)
export async function getVisitorIP() {
  try {
    // 무료 IP API (일 제한 있음)
    const response = await fetch('https://api.ipify.org?format=json', {
      timeout: 3000
    })
    const data = await response.json()
    return data.ip || null
  } catch (e) {
    return null
  }
}

/**
 * 개발 환경인지 확인
 * @returns {boolean} 개발 환경이면 true
 */
export function isDevelopmentEnvironment() {
  // localhost, 127.0.0.1, .local 도메인 체크
  const hostname = window.location.hostname
  const isDev = hostname === 'localhost' || 
                hostname === '127.0.0.1' || 
                hostname.endsWith('.local') ||
                hostname.startsWith('192.168.') || // 로컬 네트워크
                hostname.startsWith('10.0.') ||    // 로컬 네트워크
                import.meta.env.DEV                // Vite 개발 모드
  
  return isDev
}

/**
 * 방문을 추적해야 하는지 확인
 * @returns {boolean} 추적해야 하면 true
 */
export function shouldTrackVisit() {
  // 개발 환경이면 추적하지 않음
  if (isDevelopmentEnvironment()) {
    return false
  }
  
  // sessionStorage에 이미 방문 기록이 있으면 추적하지 않음
  try {
    const alreadyVisited = window.sessionStorage.getItem('visited')
    if (alreadyVisited) {
      return false
    }
  } catch (e) {
    // sessionStorage 사용 불가 시 localStorage 확인
    try {
      const lastVisit = window.localStorage.getItem('lastVisit')
      const now = Date.now()
      // 30분 이내 재방문은 제외
      if (lastVisit && (now - parseInt(lastVisit)) < 30 * 60 * 1000) {
        return false
      }
    } catch (e2) {
      // 둘 다 안되면 추적 진행
    }
  }
  
  return true
}
