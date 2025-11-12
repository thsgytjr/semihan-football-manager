// src/components/charts/SimplePieChart.jsx
import React from 'react'

/**
 * 간단한 도넛 차트 컴포넌트
 * @param {Array} data - [{label: string, value: number, color: string}]
 */
export default function SimplePieChart({ data = [], size = 200 }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-center text-gray-400 text-sm">데이터 없음</div>
      </div>
    )
  }

  let currentAngle = -90 // Start from top
  const radius = size / 2
  const innerRadius = radius * 0.6 // 도넛 모양
  const centerX = size / 2
  const centerY = size / 2

  const segments = data.map((item) => {
    const percentage = (item.value / total) * 100
    const angle = (item.value / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    // SVG path 생성
    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180

    const x1 = centerX + radius * Math.cos(startRad)
    const y1 = centerY + radius * Math.sin(startRad)
    const x2 = centerX + radius * Math.cos(endRad)
    const y2 = centerY + radius * Math.sin(endRad)

    const x3 = centerX + innerRadius * Math.cos(endRad)
    const y3 = centerY + innerRadius * Math.sin(endRad)
    const x4 = centerX + innerRadius * Math.cos(startRad)
    const y4 = centerY + innerRadius * Math.sin(startRad)

    const largeArc = angle > 180 ? 1 : 0

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z'
    ].join(' ')

    return {
      ...item,
      percentage,
      pathData
    }
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} className="transform transition-transform hover:scale-105">
        {segments.map((segment, idx) => (
          <g key={idx}>
            <path
              d={segment.pathData}
              fill={segment.color || '#3B82F6'}
              className="transition-opacity hover:opacity-80 cursor-pointer"
            />
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 justify-center">
        {segments.map((segment, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-xs text-gray-700">
              {segment.label} ({segment.percentage.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
