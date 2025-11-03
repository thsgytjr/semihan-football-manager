// src/pages/AnalyticsPage.jsx
import React from 'react'
import Card from '../components/Card'
import VisitorStats from '../components/VisitorStats'

export default function AnalyticsPage({ visits, isAdmin }) {
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🔒</div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">관리자 전용</h3>
            <p className="text-stone-600">이 페이지는 관리자만 접근할 수 있습니다.</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">📊 방문자 분석</h2>
          <p className="text-sm text-stone-600 mt-1">앱 방문 통계 및 사용자 행동 분석</p>
        </div>
      </div>

      {/* 총 방문자 요약 카드 */}
      <Card>
        <div className="flex items-center justify-between py-4 px-5 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-2xl">
              👀
            </div>
            <div>
              <div className="text-sm font-medium text-stone-600">총 방문자</div>
              <div className="text-3xl font-bold text-blue-700">
                {visits?.toLocaleString() || 0}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-stone-500">앱 전체 누적</div>
            <div className="text-xs text-stone-500">방문 수</div>
          </div>
        </div>
      </Card>

      {/* 상세 통계 */}
      <Card>
        <div className="px-6 py-4 border-b border-stone-200">
          <h3 className="text-lg font-semibold text-stone-900">상세 통계</h3>
          <p className="text-sm text-stone-600 mt-1">방문자 행동 패턴 및 기기 정보</p>
        </div>
        <div className="p-6">
          <VisitorStats visits={visits} />
        </div>
      </Card>

      {/* 안내 */}
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex gap-3 p-4">
          <div className="text-2xl">💡</div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-blue-900 mb-1">통계 정보</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• 개발 모드(localhost)에서는 방문이 카운팅되지 않습니다</li>
              <li>• 동일 세션 내 재방문은 1회로 카운팅됩니다</li>
              <li>• 고유 방문자는 브라우저 기반으로 구분됩니다</li>
              <li>• 모든 데이터는 실시간으로 업데이트됩니다</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
