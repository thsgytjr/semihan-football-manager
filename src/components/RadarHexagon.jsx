import React from "react"
import { STAT_KEYS } from "../lib/constants"

function clampStat(n) { const v = Math.floor(Number(n) || 0); return Math.max(0, Math.min(100, v)) }

export default function RadarHexagon({ size = 260, stats = {}, gridLevels = 5 }) {
  const padding = 32, cx = size / 2, cy = size / 2, radius = (size / 2) - padding
  const angleFor = (i) => (-90 + (360 / STAT_KEYS.length) * i) * (Math.PI / 180)
  const pointAt = (ratio, i) => { const a = angleFor(i); return [cx + ratio * radius * Math.cos(a), cy + ratio * radius * Math.sin(a)] }

  const grids = Array.from({ length: gridLevels }, (_, lvl) => {
    const r = (lvl + 1) / gridLevels
    const pts = STAT_KEYS.map((_, i) => pointAt(r, i)).map(([x, y]) => `${x},${y}`).join(" ")
    const opacity = 1 - (lvl * 0.15)
    return <polygon key={lvl} points={pts} fill="none" stroke={`rgba(148, 163, 184, ${opacity})`} strokeWidth={lvl === gridLevels - 1 ? "2" : "1"} strokeDasharray={lvl % 2 === 0 ? "none" : "2,2"} />
  })
  
  const axes = STAT_KEYS.map((k, i) => { 
    const [x, y] = pointAt(1, i)
    return <line key={k} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1.5" /> 
  })

  const values = STAT_KEYS.map((k, i) => { const ratio = clampStat(stats?.[k]) / 100; return pointAt(ratio, i) })
  const valuePoints = values.map(([x, y]) => `${x},${y}`).join(" ")
  
  const labels = STAT_KEYS.map((k, i) => { 
    const [x, y] = pointAt(1.18, i)
    const statValue = clampStat(stats?.[k])
    return (
      <g key={k}>
        <text x={x} y={y - 7} textAnchor="middle" dominantBaseline="middle" className="fill-slate-700 text-[11px] font-semibold">{k}</text>
        <text x={x} y={y + 7} textAnchor="middle" dominantBaseline="middle" className="fill-slate-500 text-[10px]">{statValue}</text>
      </g>
    )
  })

  const valueCircles = values.map(([x, y], i) => (
    <circle key={i} cx={x} cy={y} r="4" className="fill-white stroke-emerald-500" strokeWidth="2" filter="url(#shadow)" />
  ))

  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Player Stats Radar" className="drop-shadow-md">
      <defs>
        <linearGradient id="statGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="rgb(5, 150, 105)" stopOpacity="0.3" />
        </linearGradient>
        <filter id="shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.3"/>
        </filter>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g className="[&_*]:transition-all [&_*]:duration-300">
        {grids}
        {axes}
        <polygon 
          points={valuePoints} 
          fill="url(#statGradient)" 
          stroke="rgb(16, 185, 129)" 
          strokeWidth="2.5" 
          strokeLinejoin="round"
          filter="url(#glow)"
        />
        {valueCircles}
        {labels}
      </g>
    </svg>
  )
}
