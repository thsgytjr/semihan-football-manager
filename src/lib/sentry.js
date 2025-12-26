import * as Sentry from '@sentry/react'

// Sentry 초기화 (프로덕션 환경에서만 활성화)
export function initSentry() {
  // 개발 환경에서는 Sentry 비활성화
  if (import.meta.env.DEV) {
    console.log('🔧 개발 모드: Sentry 비활성화')
    return
  }

  // Sentry DSN이 설정된 경우에만 초기화
  const sentryDSN = import.meta.env.VITE_SENTRY_DSN
  
  if (!sentryDSN) {
    console.warn('⚠️ Sentry DSN이 설정되지 않았습니다. 에러 모니터링이 비활성화됩니다.')
    return
  }

  Sentry.init({
    dsn: sentryDSN,
    
    // 앱 버전 추적
    release: `semihan-football-manager@${import.meta.env.VITE_APP_VERSION || '7.4.4'}`,
    
    // 환경 설정
    environment: import.meta.env.MODE || 'production',
    
    // 성능 모니터링
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // 에러 발생 시에만 세션 리플레이 기록
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    
    // 성능 샘플링 비율 (10% 트랜잭션만 추적)
    tracesSampleRate: 0.1,
    
    // 에러 리플레이 샘플링 비율
    replaysSessionSampleRate: 0.1, // 일반 세션의 10%만 기록
    replaysOnErrorSampleRate: 1.0, // 에러 발생 시 100% 기록
    
    // 민감한 정보 필터링
    beforeSend(event) {
      // PII(개인식별정보) 제거
      if (event.user) {
        delete event.user.email
        delete event.user.ip_address
      }
      
      // 로컬 환경 에러는 보내지 않음
      if (event.request?.url?.includes('localhost')) {
        return null
      }
      
      return event
    },
    
    // 무시할 에러들
    ignoreErrors: [
      // React DevTools 경고
      'Download the React DevTools',
      // 네트워크 에러 (사용자 인터넷 문제)
      'Network request failed',
      'NetworkError',
      'Failed to fetch',
      // 브라우저 확장 프로그램 에러
      'Extension context invalidated',
      // 알려진 무해한 에러들
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
    ],
  })

  console.log('✅ Sentry 초기화 완료')
}

// 수동으로 에러 로깅
export function logError(error, context = {}) {
  if (import.meta.env.DEV) {
    console.error('🐛 에러 발생:', error, context)
    return
  }
  
  Sentry.captureException(error, {
    tags: context.tags,
    extra: context.extra,
    level: context.level || 'error',
  })
}

// 커스텀 메시지 로깅
export function logMessage(message, level = 'info', context = {}) {
  if (import.meta.env.DEV) {
    console.log(`📝 [${level}] ${message}`, context)
    return
  }
  
  Sentry.captureMessage(message, {
    level,
    tags: context.tags,
    extra: context.extra,
  })
}

// 사용자 정보 설정 (익명화)
export function setUser(user) {
  if (!user) {
    Sentry.setUser(null)
    return
  }
  
  // 개인정보 제외하고 익명화된 정보만 전송
  Sentry.setUser({
    id: user.id ? `user_${user.id.slice(0, 8)}` : 'anonymous',
    // 이메일, 이름 등은 제외
  })
}

// 컨텍스트 정보 추가
export function addBreadcrumb(message, category, data = {}) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  })
}
