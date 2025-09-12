import React, { useEffect, useRef } from "react"
import { DndContext, useDraggable, DragOverlay } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import PitchLines from "../PitchLines"
import InitialAvatar from "../InitialAvatar"
import { assignToFormation } from "../../lib/formation"

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const pct = (v) => clamp(v, 0, 100)

export default function FreePitch({ players = [], placed = [], setPlaced, height = 560 }) {
  const wrapRef = useRef(null)
  const safePlaced = Array.isArray(placed) ? placed : []

  useEffect(() => {
    const byId = new Map(safePlaced.map(p => [String(p.id), p]))
    const base = assignToFormation({ players, formation: "4-3-3" })
    const next = base.map(d => byId.get(String(d.id)) || d)
    setPlaced(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players])

  function onEnd(e) {
    const { active, delta } = e
    if (!active || !wrapRef.current) return
    const pid = String(active.id).replace(/^pitch:/, "")
    setPlaced(prev => {
      const arr = Array.isArray(prev) ? prev : []
      const i = arr.findIndex(p => String(p.id) === pid); if (i < 0) return arr
      const rect = wrapRef.current.getBoundingClientRect()
      const cur = arr[i], curX = (cur.x / 100) * rect.width, curY = (cur.y / 100) * rect.height
      let nx = clamp(curX + delta.x, 18, rect.width - 18)
      let ny = clamp(curY + delta.y, 18, rect.height - 18)
      if ((cur.role || "").toUpperCase() === "GK") ny = clamp(ny, rect.height * 0.80, rect.height * 0.98)
      const next = arr.slice()
      next[i] = { ...cur, x: pct((nx / rect.width) * 100), y: pct((ny / rect.height) * 100) }
      return next
    })
  }

  return (
    <div ref={wrapRef} className="relative rounded-xl overflow-hidden" style={{ height, background: "#0a7e2a" }}>
      <PitchLines />
      <DndContext onDragEnd={onEnd}>
        {safePlaced.map(p => <FieldDot key={p.id} data={p} />)}
        <DragOverlay />
      </DndContext>
      <div className="absolute right-2 top-2 rounded bg-black/40 text-white text-[11px] px-2 py-1">필드 자유 배치 · GK 하단 존</div>
    </div>
  )
}

function FieldDot({ data }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `pitch:${String(data.id)}` })
  const style = { transform: CSS.Translate.toString(transform), left: `calc(${data.x}% - 18px)`, top: `calc(${data.y}% - 18px)` }
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={`absolute flex flex-col items-center ${isDragging ? "opacity-80" : ""}`}
      style={style} title={`${data.name} (${data.role})`}>
      <InitialAvatar id={data.id} name={data.name} size={36} />
      <div className="mt-1 text-center text-xs text-white">
        <div className="font-semibold">{data.name}</div>
        <div className="text-gray-300">{data.role}</div>
      </div>
    </div>
  )
}
