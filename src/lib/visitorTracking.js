// src/lib/visitorTracking.js
// 방문자 추적 유틸리티

// iPhone 모델 매핑 (식별자 -> 모델명)
const IPHONE_MODELS = {
  // iPhone 15 series (2023)
  'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone16,1': 'iPhone 15 Pro',
  'iPhone15,5': 'iPhone 15 Plus',
  'iPhone15,4': 'iPhone 15',
  
  // iPhone 14 series (2022)
  'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone15,2': 'iPhone 14 Pro',
  'iPhone14,8': 'iPhone 14 Plus',
  'iPhone14,7': 'iPhone 14',
  
  // iPhone 13 series (2021)
  'iPhone14,3': 'iPhone 13 Pro Max',
  'iPhone14,2': 'iPhone 13 Pro',
  'iPhone14,5': 'iPhone 13',
  'iPhone14,4': 'iPhone 13 mini',
  
  // iPhone 12 series (2020)
  'iPhone13,4': 'iPhone 12 Pro Max',
  'iPhone13,3': 'iPhone 12 Pro',
  'iPhone13,2': 'iPhone 12',
  'iPhone13,1': 'iPhone 12 mini',
  
  // iPhone 11 series (2019)
  'iPhone12,5': 'iPhone 11 Pro Max',
  'iPhone12,3': 'iPhone 11 Pro',
  'iPhone12,1': 'iPhone 11',
  
  // iPhone XS/XR series (2018)
  'iPhone11,8': 'iPhone XR',
  'iPhone11,6': 'iPhone XS Max',
  'iPhone11,4': 'iPhone XS Max',
  'iPhone11,2': 'iPhone XS',
  
  // iPhone X/8 series (2017)
  'iPhone10,6': 'iPhone X',
  'iPhone10,3': 'iPhone X',
  'iPhone10,5': 'iPhone 8 Plus',
  'iPhone10,4': 'iPhone 8',
  'iPhone10,2': 'iPhone 8 Plus',
  'iPhone10,1': 'iPhone 8',
  
  // iPhone SE
  'iPhone14,6': 'iPhone SE (3rd gen)',
  'iPhone12,8': 'iPhone SE (2nd gen)',
  'iPhone8,4': 'iPhone SE (1st gen)',
}

// iPhone 화면 해상도로 모델 추정 (대략적)
const IPHONE_SCREEN_MODELS = {
  // iPhone 16 Pro Max, 15 Pro Max
  '440x956': 'iPhone Pro Max (16/15)',
  // iPhone 16 Pro, 15 Pro Max (older)
  '430x932': 'iPhone Pro Max (15/14/13/12)',
  // iPhone 15 Plus, 14 Plus
  '428x926': 'iPhone Plus (15/14)',
  // iPhone 16 Pro, 15 Pro, 14 Pro
  '393x852': 'iPhone Pro (16/15/14)',
  // iPhone 16, 15, 14, 13, 12
  '390x844': 'iPhone (16/15/14/13/12)',
  // iPhone 13 mini, 12 mini, X/XS/11 Pro
  '375x812': 'iPhone mini (13/12) or X/XS/11 Pro',
  // iPhone 11 Pro Max, XS Max
  '414x896': 'iPhone 11 Pro Max or XS Max',
  // iPhone SE (2nd/3rd gen), 8, 7, 6s
  '375x667': 'iPhone SE or 8/7/6s',
  // iPhone 8 Plus, 7 Plus, 6s Plus
  '414x736': 'iPhone 8/7/6s Plus',
}

// Samsung 모델 매핑 (SM-코드 -> 모델명)
const SAMSUNG_MODELS = {
  // Galaxy S24 series (2024)
  'SM-S928': 'Galaxy S24 Ultra',
  'SM-S926': 'Galaxy S24+',
  'SM-S921': 'Galaxy S24',
  
  // Galaxy S23 series (2023)
  'SM-S918': 'Galaxy S23 Ultra',
  'SM-S916': 'Galaxy S23+',
  'SM-S911': 'Galaxy S23',
  
  // Galaxy S22 series (2022)
  'SM-S908': 'Galaxy S22 Ultra',
  'SM-S906': 'Galaxy S22+',
  'SM-S901': 'Galaxy S22',
  
  // Galaxy S21 series (2021)
  'SM-G998': 'Galaxy S21 Ultra',
  'SM-G996': 'Galaxy S21+',
  'SM-G991': 'Galaxy S21',
  
  // Galaxy S20 series (2020)
  'SM-G988': 'Galaxy S20 Ultra',
  'SM-G986': 'Galaxy S20+',
  'SM-G981': 'Galaxy S20',
  
  // Galaxy Z Fold series
  'SM-F946': 'Galaxy Z Fold 5',
  'SM-F936': 'Galaxy Z Fold 4',
  'SM-F926': 'Galaxy Z Fold 3',
  'SM-F916': 'Galaxy Z Fold 2',
  
  // Galaxy Z Flip series
  'SM-F731': 'Galaxy Z Flip 5',
  'SM-F721': 'Galaxy Z Flip 4',
  'SM-F711': 'Galaxy Z Flip 3',
  'SM-F700': 'Galaxy Z Flip',
  
  // Galaxy A series
  'SM-A546': 'Galaxy A54',
  'SM-A536': 'Galaxy A53',
  'SM-A526': 'Galaxy A52',
  'SM-A515': 'Galaxy A51',
  'SM-A346': 'Galaxy A34',
  'SM-A336': 'Galaxy A33',
  'SM-A326': 'Galaxy A32',
  'SM-A146': 'Galaxy A14',
  'SM-A136': 'Galaxy A13',
  'SM-A125': 'Galaxy A12',
}

// User Agent 파싱
export function parseUserAgent(ua, screenWidth = null, screenHeight = null) {
  if (!ua) return { device: 'Unknown', browser: 'Unknown', os: 'Unknown', phoneModel: null }

  // OS 먼저 파악 (더 정확함)
  let os = 'Unknown'
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/mac os/i.test(ua)) os = 'macOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/ios|iphone|ipad/i.test(ua)) os = 'iOS'
  else if (/linux/i.test(ua) && !/android/i.test(ua)) os = 'Linux' // Android는 Linux 기반이지만 Android로 분류
  else if (/chromeos|cros/i.test(ua)) os = 'ChromeOS'

  // Device Type (OS와 User Agent 패턴 조합으로 판정)
  let device = 'Desktop'
  
  if (/mobile/i.test(ua)) {
    device = 'Mobile'
  } else if (/tablet|ipad/i.test(ua)) {
    device = 'Tablet'
  } else if (os === 'Android') {
    // Android OS인데 mobile 패턴이 없으면 → Android 태블릿
    device = 'Tablet'
  } else if (os === 'iOS') {
    // iOS 기기는 항상 mobile이거나 tablet
    if (/ipad/i.test(ua)) {
      device = 'Tablet'
    } else {
      device = 'Mobile'
    }
  }

  // Browser (우선순위 중요: 구체적인 것부터 체크)
  let browser = 'Unknown'
  if (/edg/i.test(ua)) browser = 'Edge'
  else if (/opr|opera/i.test(ua)) browser = 'Opera'
  else if (/crios/i.test(ua)) browser = 'Chrome' // iOS Chrome
  else if (/fxios/i.test(ua)) browser = 'Firefox' // iOS Firefox
  else if (/chrome/i.test(ua)) browser = 'Chrome'
  else if (/firefox/i.test(ua)) browser = 'Firefox'
  else if (/safari/i.test(ua)) browser = 'Safari' // 마지막에 체크

  // Phone Model 감지
  let phoneModel = null
  
  if (device === 'Mobile' || device === 'Tablet') {
    // iPhone 모델
    if (/iphone/i.test(ua)) {
      // iPhone15,2 형식의 식별자 추출 시도 (구형 iOS)
      const match = ua.match(/iPhone(\d+[,_]\d+)/i)
      if (match) {
        const identifier = 'iPhone' + match[1].replace(/_/g, ',')
        phoneModel = IPHONE_MODELS[identifier] || identifier
      } else if (screenWidth && screenHeight) {
        // 최신 iOS는 식별자가 없으므로 화면 해상도로 추정
        const screenKey = `${screenWidth}x${screenHeight}`
        phoneModel = IPHONE_SCREEN_MODELS[screenKey] || `iPhone`
      } else {
        phoneModel = 'iPhone'
      }
      // iOS 버전 제거 - 모델만 유지하도록 정규화
      phoneModel = phoneModel.replace(/\s*iOS\s*[\d.]+/, '')
    }
    // iPad 모델
    else if (/ipad/i.test(ua)) {
      const match = ua.match(/iPad\d+[,_]\d+/i)
      phoneModel = match ? match[0].replace(/_/g, ',') : 'iPad'
    }
    // Samsung Galaxy
    else if (/SM-[A-Z0-9]+/i.test(ua)) {
      const match = ua.match(/SM-([A-Z])(\d{3})/i)
      if (match) {
        const code = 'SM-' + match[1] + match[2]
        phoneModel = SAMSUNG_MODELS[code] || ('Samsung ' + match[0])
      } else {
        const fullMatch = ua.match(/SM-[A-Z0-9]+/i)
        phoneModel = 'Samsung ' + fullMatch[0]
      }
    }
    // Google Pixel
    else if (/Pixel/i.test(ua)) {
      const match = ua.match(/Pixel\s*(\d+\s*[a-zA-Z]*)/i)
      phoneModel = match ? ('Pixel ' + match[1].trim()) : 'Pixel'
    }
    // Xiaomi
    else if (/Mi\s+[A-Z0-9]+|Redmi/i.test(ua)) {
      const match = ua.match(/(Mi\s+[A-Z0-9]+|Redmi\s*[A-Z0-9\s]*)/i)
      phoneModel = match ? match[0].trim() : 'Xiaomi'
    }
    // Huawei
    else if (/Huawei|HUAWEI|HW-/i.test(ua)) {
      const match = ua.match(/(HW-[A-Z0-9]+|[A-Z]{3}-[A-Z0-9]+)/i)
      phoneModel = match ? ('Huawei ' + match[0]) : 'Huawei'
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
      const buildMatch = ua.match(/;\s*([^;)]+)\s+Build\//i)
      if (buildMatch) {
        const model = buildMatch[1].trim()
        // 너무 긴 모델명은 잘라내기
        phoneModel = model.length > 30 ? ('Android (' + model.substring(0, 27) + '...)') : model
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
 * 프리뷰/테스트 모드인지 확인
 * @returns {boolean} 프리뷰 모드면 true
 */
export function isPreviewMode() {
  try {
    const url = new URL(window.location.href)
    
    // URL 파라미터 체크: ?preview=true, ?admin=true, ?dev=true 등
    const hasPreviewParam = url.searchParams.has('preview') ||
                           url.searchParams.has('admin') ||
                           url.searchParams.has('dev') ||
                           url.searchParams.has('notrack') ||
                           url.searchParams.has('test')
    
    if (hasPreviewParam) {
      return true
    }
    
    // 경로 체크: /dev, /preview, /admin-preview 등
    const pathname = url.pathname.toLowerCase()
    if (pathname.startsWith('/dev') || 
        pathname.startsWith('/preview') ||
        pathname.startsWith('/admin-preview')) {
      return true
    }
    
    // localStorage에 저장된 프리뷰 모드 체크 (한번 설정하면 계속 유지)
    const previewMode = localStorage.getItem('sfm_preview_mode')
    if (previewMode === 'true') {
      return true
    }
    
    return false
  } catch (e) {
    return false
  }
}

/**
 * 방문을 추적해야 하는지 확인
 * @returns {boolean} 추적해야 하면 true
 */
export function shouldTrackVisit() {
  // 봇/모니터링 트래픽은 카운트하지 않음
  try {
    const uaRaw = navigator?.userAgent || ''
    const ua = uaRaw.toLowerCase()
    const botLike = /bot|crawl|spider|headless|lighthouse|pagespeed|uptime|pingdom|statuscake|datadog|newrelic|synthetic|monitor|vercel|preview/i
    if (botLike.test(ua)) {
      return false
    }
    
    // Headless Chrome/자동화 도구 감지
    if (navigator.webdriver || window.chrome?.webdriver) {
      return false
    }
    
    // AWS/클라우드 봇 패턴 감지 (Linux + Chrome + Desktop)
    const platform = navigator?.platform?.toLowerCase() || ''
    const isLinux = platform.includes('linux') || ua.includes('linux')
    const hasChrome = ua.includes('chrome') && !ua.includes('edg') && !ua.includes('opr')
    const isMobile = /mobile|android|iphone|ipad/i.test(ua)
    
    // Linux + Chrome + Desktop (모바일 아님) = AWS/Vercel 모니터링 봇
    if (isLinux && hasChrome && !isMobile) {
      // 추가 체크: navigator.languages 없거나 비정상적이면 봇
      const langs = navigator?.languages || []
      if (langs.length === 0) {
        console.log('🤖 봇 감지: Linux+Chrome (언어 설정 없음)')
        return false
      }
      
      // 추가 체크: screen 정보가 비정상적이면 봇
      const screenValid = window.screen?.width > 0 && window.screen?.height > 0
      if (!screenValid) {
        console.log('🤖 봇 감지: Linux+Chrome (화면 정보 없음)')
        return false
      }
      
      // 위 체크를 통과해도 Linux+Chrome+Desktop은 의심스러우므로 필터링
      console.log('🤖 봇 감지: Linux+Chrome+Desktop (AWS/모니터링 서비스)')
      return false
    }
    
    // 프리렌더 시점도 건너뜀
    if (document?.visibilityState === 'prerender') {
      return false
    }
  } catch (e) {
    // UA 파싱 실패 시 나머지 체크 진행
  }

  // 방문자 분석을 보는 개발자(analytics admin)라면 카운트하지 않음
  try {
    const analyticsAdmin = window.localStorage.getItem('isAnalyticsAdmin') === '1'
    if (analyticsAdmin) return false
  } catch (e) {
    // localStorage 접근 불가 시에도 나머지 체크 진행
  }

  // 개발 환경이면 추적하지 않음
  if (isDevelopmentEnvironment()) {
    return false
  }
  
  // 프리뷰/테스트 모드면 추적하지 않음
  if (isPreviewMode()) {
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
