import React from 'react'

export default function ProdDataWarning() {
  // localhost가 아니면 배너 없음 (프로덕션 배포)
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (!isLocalhost) {
    return null
  }
  
  // ?nomock 파라미터 확인 (Mock 비활성화 = Prod DB 모드)
  const urlParams = new URLSearchParams(window.location.search)
  const isProdMode = urlParams.has('nomock') || urlParams.has('mockDisabled')
  
  // Prod DB 모드일 때만 경고 배너 표시
  if (!isProdMode) {
    return null
  }
  
  return (
    <div className="fixed top-0 left-0 right-0 bg-red-600 text-white px-4 py-2 z-[9999] shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 text-xs sm:text-sm">
          <p className="font-bold">⚠️ 위험: Prod 데이터 수정 모드</p>
          <p className="opacity-90">localhost에서 실제 프로덕션 DB를 수정하고 있습니다!</p>
        </div>
      </div>
    </div>
  )
}
