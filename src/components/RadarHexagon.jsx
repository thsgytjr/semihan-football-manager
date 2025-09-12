import React from "react"
import { STAT_KEYS } from "../lib/constants"

function clampStat(n) { const v = Math.floor(Number(n) || 0); return Math.max(0, Math.min(100, v)) }

export default function RadarHexagon({ size = 260, stats = {}, gridLevels = 4 }) {
  const padding = 16, cx = size / 2, cy = size / 2, radius = (size / 2) - padding
  const angleFor = (i) => (-90 + (360 / STAT_KEYS.length) * i) * (Math.PI / 180)
  const pointAt = (ratio, i) => { const a = angleFor(i); return [cx + ratio * radius * Math.cos(a), cy + ratio * radius * Math.sin(a)] }

  const grids = Array.from({ length: gridLevels }, (_, lvl) => {
    const r = (lvl + 1) / gridLevels
    const pts = STAT_KEYS.map((_, i) => pointAt(r, i)).map(([x, y]) => `${x},${y}`).join(" ")
    return <polygon key={lvl} points={pts} fill="none" className="stroke-stone-300" />
  })
  const axes = STAT_KEYS.map((k, i) => { const [x, y] = pointAt(1, i); return <line key={k} x1={cx} y1={cy} x2={x} y2={y} className="stroke-stone-300" /> })

  const values = STAT_KEYS.map((k, i) => { const ratio = clampStat(stats?.[k]) / 100; return pointAt(ratio, i) })
  const valuePoints = values.map(([x, y]) => `${x},${y}`).join(" ")
  const labels = STAT_KEYS.map((k, i) => { const [x, y] = pointAt(1.12, i); return <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-stone-600 text-[10px]">{k}</text> })

  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Player Stats Radar">
      <g className="[&_*]:transition-all">{grids}{axes}<polygon points={valuePoints} className="fill-emerald-400/30 stroke-emerald-500" />{labels}</g>
    </svg>
  )
}
