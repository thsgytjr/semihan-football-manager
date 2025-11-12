// src/components/charts/SimpleBarChart.jsx
import React from 'react'

/**
 * 간단한 수평 바 차트 컴포넌트
 * @param {Array} data - [{label: string, value: number, color: string}]
 */
export default function SimpleBarChart({ data = [], maxValue = null }) {
  const max = maxValue || Math.max(...data.map(d => d.value), 1)
  
  return (
    <div className="space-y-3">
      {data.map((item, idx) => {
        const percentage = (item.value / max) * 100
        return (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{item.label}</span>
              <span className="font-semibold text-gray-900">${item.value.toFixed(2)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: item.color || '#3B82F6'
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
