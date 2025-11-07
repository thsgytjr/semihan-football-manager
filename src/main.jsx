import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// MSW 초기화 (개발 환경에서만)
async function enableMocking() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  
  // 환경 변수로 Mock 비활성화 가능 (URL 파라미터: ?mockDisabled=true)
  const urlParams = new URLSearchParams(window.location.search)
  const mockDisabledParam = urlParams.has('mockDisabled') || urlParams.has('nomock')
  
  console.log('🔍 MSW 초기화 시작...')
  console.log('   Hostname:', window.location.hostname)
  console.log('   isLocalhost:', isLocalhost)
  console.log('   mockDisabled (URL param):', mockDisabledParam)
  
  if (!isLocalhost || mockDisabledParam) {
    console.log('⚠️ Mock API 비활성화 (Production 모드 또는 URL 파라미터)')
    return // production/preview에서는 실제 Supabase 사용
  }

  try {
    console.log('📦 MSW 모듈 로드 중...')
    const { worker } = await import('./mocks/browser')
    console.log('✅ MSW 모듈 로드 완료')
    
    console.log('🚀 Service Worker 시작 중...')
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: false // 디버그를 위해 true에서 false로 변경
    })
    console.log('✅ Mock Service Worker 활성화됨 (localhost)')
    console.log('✨ 모든 API 요청이 Mock 데이터로 처리됩니다!')
    console.log('💡 팁: ?nomock 파라미터로 실제 DB 테스트 가능')
  } catch (error) {
    console.error('❌ MSW 초기화 실패:', error)
    console.error('   에러 스택:', error.stack)
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
      console.warn('Semihan 데이터 로드 실패:', error)
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
