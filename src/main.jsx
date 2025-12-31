import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n/config' // Initialize i18n
import { logger } from './lib/logger'

// MSW 초기화 (개발 환경에서만)
async function enableMocking() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  
  // 환경 변수로 Mock 비활성화 가능 (URL 파라미터: ?mockDisabled=true)
  const urlParams = new URLSearchParams(window.location.search)
  const mockDisabledParam = urlParams.has('mockDisabled') || urlParams.has('nomock')
  
  if (!isLocalhost || mockDisabledParam) {
    return // production/preview에서는 실제 Supabase 사용
  }

  try {
    const { worker } = await import('./mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: {
        url: '/mockServiceWorker.js'
      }
    })
    console.log('✅ MSW 활성화 (localhost)')
  } catch (error) {
    logger.error('❌ MSW 초기화 실패:', error)
    logger.error('   에러 스택:', error.stack)
  }
}

async function startApp() {
  // 1️⃣ Mock 환경이면 Semihan 데이터 먼저 로드
  const urlParams = new URLSearchParams(window.location.search)
  const mockDisabledParam = urlParams.has('mockDisabled') || urlParams.has('nomock')
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const isMockMode = isLocalhost && !mockDisabledParam
  
  if (isMockMode) {
    try {
      const { loadSemihanDataToMock } = await import('./mocks/data')
      await loadSemihanDataToMock()
    } catch (error) {
      logger.warn('Semihan 데이터 로드 실패:', error)
    }
  }
  
  // 2️⃣ MSW 초기화
  await enableMocking()
  
  // 3️⃣ 앱 렌더링
  const { MockModeProvider } = await import('./context/MockModeContext')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <MockModeProvider isMockMode={isMockMode}>
        <App />
      </MockModeProvider>
    </React.StrictMode>,
  )
}

startApp()
