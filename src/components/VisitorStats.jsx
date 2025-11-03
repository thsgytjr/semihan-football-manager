// src/components/VisitorStats.jsx
import React, { useState, useEffect, useMemo } from 'react'
import { getVisitStats } from '../services/storage.service'

export default function VisitorStats({ visits }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const data = await getVisitStats()
      setLogs(data || [])
    } catch (e) {
      console.error('Failed to load visit stats:', e)
    } finally {
      setLoading(false)
    }
  }

  // 통계 계산
  const stats = useMemo(() => {
    if (!logs.length) return null

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 고유 방문자
    const uniqueVisitors = new Set(logs.map(l => l.visitor_id)).size

    // 기간별 방문
    const todayVisits = logs.filter(l => new Date(l.visited_at) >= today).length
    const weekVisits = logs.filter(l => new Date(l.visited_at) >= weekAgo).length
    const monthVisits = logs.filter(l => new Date(l.visited_at) >= monthAgo).length

    // 재방문 분석
    const visitorCounts = {}
    logs.forEach(l => {
      visitorCounts[l.visitor_id] = (visitorCounts[l.visitor_id] || 0) + 1
    })
    const newVisitors = Object.values(visitorCounts).filter(c => c === 1).length
    const returningVisitors = uniqueVisitors - newVisitors

    // 기기 타입
    const deviceCounts = {}
    logs.forEach(l => {
      const device = l.device_type || 'Unknown'
      deviceCounts[device] = (deviceCounts[device] || 0) + 1
    })

    // 브라우저
    const browserCounts = {}
    logs.forEach(l => {
      const browser = l.browser || 'Unknown'
      browserCounts[browser] = (browserCounts[browser] || 0) + 1
    })

    // OS
    const osCounts = {}
    logs.forEach(l => {
      const os = l.os || 'Unknown'
      osCounts[os] = (osCounts[os] || 0) + 1
    })

    // 시간대별 분석 (0-23시)
    const hourCounts = Array(24).fill(0)
    logs.forEach(l => {
      const hour = new Date(l.visited_at).getHours()
      hourCounts[hour]++
    })
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts))

    return {
      uniqueVisitors,
      todayVisits,
      weekVisits,
      monthVisits,
      newVisitors,
      returningVisitors,
      deviceCounts,
      browserCounts,
      osCounts,
      peakHour,
      hourCounts
    }
  }, [logs])

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-stone-500">
        통계 로딩 중...
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-4 text-center text-sm text-stone-500">
        아직 방문 기록이 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 기본 통계 */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon="👥"
          label="고유 방문자"
          value={stats.uniqueVisitors.toLocaleString()}
          subtitle="중복 제외"
        />
        <StatCard
          icon="🔢"
          label="총 방문"
          value={visits?.toLocaleString() || 0}
          subtitle="재방문 포함"
        />
      </div>

      {/* 기간별 통계 */}
      <div className="rounded-lg border border-stone-200 p-3 bg-white">
        <div className="text-xs font-semibold text-stone-700 mb-2">📅 기간별 통계</div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-600">오늘</span>
            <span className="font-semibold text-stone-900">{stats.todayVisits}명</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-600">최근 7일</span>
            <span className="font-semibold text-stone-900">{stats.weekVisits}명</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-600">최근 30일</span>
            <span className="font-semibold text-stone-900">{stats.monthVisits}명</span>
          </div>
        </div>
      </div>

      {/* 재방문률 */}
      <div className="rounded-lg border border-stone-200 p-3 bg-white">
        <div className="text-xs font-semibold text-stone-700 mb-2">🔁 재방문 분석</div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all"
                style={{ width: `${(stats.newVisitors / stats.uniqueVisitors * 100) || 0}%` }}
              />
            </div>
            <span className="text-xs text-stone-600 w-16 text-right">{stats.newVisitors}명</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${(stats.returningVisitors / stats.uniqueVisitors * 100) || 0}%` }}
              />
            </div>
            <span className="text-xs text-stone-600 w-16 text-right">{stats.returningVisitors}명</span>
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-stone-600">신규</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-stone-600">재방문</span>
          </div>
        </div>
      </div>

      {/* 인기 시간대 */}
      <div className="rounded-lg border border-stone-200 p-3 bg-white">
        <div className="text-xs font-semibold text-stone-700 mb-2">🔥 가장 활발한 시간</div>
        <div className="text-2xl font-bold text-emerald-600">
          {stats.peakHour}시 - {stats.peakHour + 1}시
        </div>
        <div className="text-xs text-stone-500 mt-1">
          {stats.hourCounts[stats.peakHour]}회 방문
        </div>
      </div>

      {/* 기기 타입 */}
      <div className="rounded-lg border border-stone-200 p-3 bg-white">
        <div className="text-xs font-semibold text-stone-700 mb-2">💻 기기 종류</div>
        <div className="space-y-2">
          {Object.entries(stats.deviceCounts)
            .sort(([,a], [,b]) => b - a)
            .map(([device, count]) => (
              <div key={device} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{device}</span>
                <span className="font-semibold text-stone-900">{count}회</span>
              </div>
            ))}
        </div>
      </div>

      {/* 브라우저 */}
      <div className="rounded-lg border border-stone-200 p-3 bg-white">
        <div className="text-xs font-semibold text-stone-700 mb-2">🌐 브라우저</div>
        <div className="space-y-2">
          {Object.entries(stats.browserCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([browser, count]) => (
              <div key={browser} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{browser}</span>
                <span className="font-semibold text-stone-900">{count}회</span>
              </div>
            ))}
        </div>
      </div>

      {/* OS */}
      <div className="rounded-lg border border-stone-200 p-3 bg-white">
        <div className="text-xs font-semibold text-stone-700 mb-2">📱 운영체제</div>
        <div className="space-y-2">
          {Object.entries(stats.osCounts)
            .sort(([,a], [,b]) => b - a)
            .map(([os, count]) => (
              <div key={os} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{os}</span>
                <span className="font-semibold text-stone-900">{count}회</span>
              </div>
            ))}
        </div>
      </div>

      {/* 최근 방문 기록 */}
      <div className="rounded-lg border border-stone-200 p-3 bg-white">
        <div className="text-xs font-semibold text-stone-700 mb-2">📋 최근 방문 기록</div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {logs.slice(0, 20).map((log, idx) => {
            const date = new Date(log.visited_at)
            const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
            
            return (
              <div key={log.id || idx} className="flex items-center justify-between text-xs border-b border-stone-100 last:border-0 py-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-stone-500">{timeStr}</span>
                  <span className="text-stone-400">·</span>
                  <span className="text-stone-600 truncate">{log.device_type || 'Unknown'}</span>
                  <span className="text-stone-400">·</span>
                  <span className="text-stone-600 truncate">{log.browser || 'Unknown'}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, subtitle }) {
  return (
    <div className="rounded-lg border border-stone-200 p-3 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium text-stone-600">{label}</span>
      </div>
      <div className="text-2xl font-bold text-stone-900">{value}</div>
      {subtitle && <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>}
    </div>
  )
}
