// src/components/ranking/FormDots.jsx
import React from 'react'

/**
 * Display last 5 match results as colored dots with W/L/D labels
 */
export default function FormDots({ form = [] }) {
  // Ensure we always show 5 icons: left padded with empties if needed
  const tail = (form || []).slice(-5)
  const display = Array(5 - tail.length).fill(null).concat(tail)
  
  const clsFor = (v) => v === 'W' ? 'bg-emerald-600' : v === 'L' ? 'bg-rose-600' : v === 'D' ? 'bg-stone-400' : 'bg-stone-200'
  const labelFor = (v) => v === 'W' ? 'Win' : v === 'L' ? 'Loss' : v === 'D' ? 'Draw' : 'No match'
  const textFor = (v) => v === 'W' || v === 'L' || v === 'D' ? v : ''
  
  return (
    <div className="flex items-center justify-center gap-1">
      {display.map((v, i) => (
        <span
          key={i}
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] leading-none font-bold text-white ${clsFor(v)}`}
          title={labelFor(v)}
          aria-label={labelFor(v)}
        >
          {textFor(v)}
        </span>
      ))}
    </div>
  )
}
