import React from "react"
import PitchLines from "../PitchLines"
import InitialAvatar from "../InitialAvatar"

export default function MiniPitch({
  placed = [],
  height = 150,
  onEdit,
  formation,
  mode,
}) {
  const nodes = Array.isArray(placed) ? placed : []
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-2 py-1 text-xs text-gray-600">
        <span>추천 {mode} · {formation}</span>
        <button
          onClick={onEdit}
          className="rounded bg-stone-900 px-2 py-1 text-[11px] font-medium text-white"
        >
          풀스크린/편집
        </button>
      </div>

      <div className="relative overflow-hidden rounded-md" style={{ height }}>
        <div className="absolute inset-0" style={{ background: "#0a7e2a" }} />
        <PitchLines />
        {nodes.map(p => (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={`${p.name}${p.role ? ` (${p.role})` : ""}`}
          >
            <InitialAvatar id={p.id} name={p.name} size={20} badges={(() => { const s=String(p?.membership||'').trim().toLowerCase(); return (s==='member'||s.includes('정회원'))?[]:['G'] })()} />
          </div>
        ))}
      </div>
    </div>
  )
}
