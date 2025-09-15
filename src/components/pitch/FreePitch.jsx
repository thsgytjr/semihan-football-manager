import React, { useEffect, useRef, useState } from "react"
import {
  DndContext,
  useDraggable,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import PitchLines from "../PitchLines"
import InitialAvatar from "../InitialAvatar"

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const pct = (v) => clamp(v, 0, 100)

export default function FreePitch({ players = [], placed = [], setPlaced, height = 560 }) {
  const wrapRef = useRef(null)
  const safePlaced = Array.isArray(placed) ? placed : []

  // ✅ 모바일 터치 안정화: TouchSensor + MouseSensor
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 8 } })
  )

  // ====== ✏️ 드로잉(펜/지우개) 레이어 ======
  const canvasRef = useRef(null)
  const [drawMode, setDrawMode] = useState(false)     // 그리기 모드 토글 (켜야만 드로잉, 끄면 드래그&드롭)
  const [tool, setTool] = useState("pen")             // "pen" | "eraser"
  const isDrawingRef = useRef(false)
  const lastPtRef = useRef({ x: 0, y: 0 })

  // 캔버스 사이즈를 컨테이너에 맞춤(고해상도 대응)
  useEffect(() => {
    if (!wrapRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = wrapRef.current.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext("2d")
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // 좌표계를 CSS 픽셀로 보정
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  function getCanvasXY(evt){
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = (evt.clientX ?? (evt.touches?.[0]?.clientX ?? 0)) - rect.left
    const y = (evt.clientY ?? (evt.touches?.[0]?.clientY ?? 0)) - rect.top
    return { x, y }
  }

  function handlePointerDown(e){
    if (!drawMode) return
    e.preventDefault()
    const pt = getCanvasXY(e)
    isDrawingRef.current = true
    lastPtRef.current = pt
  }

  function handlePointerMove(e){
    if (!drawMode || !isDrawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const curr = getCanvasXY(e)

    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    if (tool === "eraser"){
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
      ctx.lineWidth = 18
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = "#ff2d2d" // 빨간 펜
      ctx.lineWidth = 3.5
    }

    ctx.beginPath()
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y)
    ctx.lineTo(curr.x, curr.y)
    ctx.stroke()
    lastPtRef.current = curr
  }

  function handlePointerUp(e){
    if (!drawMode) return
    e.preventDefault()
    isDrawingRef.current = false
  }

  function clearCanvas(){
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  // ====== 드로잉 레이어 끝 ======

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

      // GK는 하단 존 제한 (있다면)
      if ((cur.role || "").toUpperCase() === "GK") {
        ny = clamp(ny, rect.height * 0.80, rect.height * 0.98)
      }

      const next = arr.slice()
      next[i] = { ...cur, x: pct((nx / rect.width) * 100), y: pct((ny / rect.height) * 100) }
      return next
    })
  }

  return (
    <div
      ref={wrapRef}
      className="relative rounded-xl overflow-hidden"
      style={{ height, background: "#0a7e2a", touchAction: "none" }} // ✅ 터치 스크롤 간섭 방지
    >
      <PitchLines />

      {/* 🔴 드로잉 캔버스 (drawMode 켜진 경우에만 포인터 이벤트 수신) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: drawMode ? "auto" : "none" }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />

      {/* 드래그 & 드롭 레이어 */}
      <DndContext sensors={sensors} onDragEnd={onEnd}>
        {safePlaced.map(p => <FieldDot key={p.id} data={p} />)}
        <DragOverlay />
      </DndContext>

      {/* 우상단 라벨 */}
      <div className="absolute right-2 top-2 rounded bg-black/40 text-white text-[11px] px-2 py-1">
        필드 자유 배치 · GK 하단 존
      </div>

      {/* ✏️ 드로잉 툴바 */}
      <div className="absolute right-2 top-10 flex items-center gap-1 z-10">
        <button
          onClick={() => setDrawMode(v => !v)}
          className={`rounded px-2 py-1 text-[11px] shadow ${drawMode ? "bg-rose-600 text-white" : "bg-white/80"} backdrop-blur`}
          title="그리기 모드 토글"
        >
          ✏️ 그리기
        </button>
        <button
          onClick={() => setTool("pen")}
          className={`rounded px-2 py-1 text-[11px] shadow ${tool==="pen" ? "bg-white font-semibold" : "bg-white/70"}`}
          title="펜"
        >
          펜
        </button>
        <button
          onClick={() => setTool("eraser")}
          className={`rounded px-2 py-1 text-[11px] shadow ${tool==="eraser" ? "bg-white font-semibold" : "bg-white/70"}`}
          title="지우개"
        >
          지우개
        </button>
        <button
          onClick={clearCanvas}
          className="rounded px-2 py-1 text-[11px] bg-white/80 shadow"
          title="모두 지우기"
        >
          클리어
        </button>
      </div>
    </div>
  )
}

function FieldDot({ data }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `pitch:${String(data.id)}` })
  const style = {
    transform: CSS.Translate.toString(transform),
    left: `calc(${data.x}% - 18px)`,
    top: `calc(${data.y}% - 18px)`,
    touchAction: "none",
  }
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute flex flex-col items-center ${isDragging ? "opacity-80" : ""}`}
      style={style}
      title={`${data.name} (${data.role})`}
    >
      <InitialAvatar id={data.id} name={data.name} size={36} />
      <div className="mt-1 text-center text-xs text-white">
        <div className="font-semibold">{data.name}</div>
        <div className="text-gray-300">{data.role}</div>
      </div>
    </div>
  )
}
