// src/components/pitch/FreePitch.jsx
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

export default function FreePitch({
  players = [],
  placed = [],
  setPlaced,
  height = 560,
}) {
  const wrapRef = useRef(null)
  const safePlaced = Array.isArray(placed) ? placed : []

  // 드래그 센서
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 8 } })
  )

  // ===== 드로잉(펜/지우개) 오버레이 =====
  const canvasRef = useRef(null)
  const [toolsOpen, setToolsOpen] = useState(false) // ✎ 버튼
  const [tool, setTool] = useState("pen")           // 'pen' | 'erase'
  const [lineWidth, setLineWidth] = useState(4)
  const [penColor, setPenColor] = useState("#111111")   // ✅ 펜 색상
  const [customColor, setCustomColor] = useState("#111111")
  const drawingRef = useRef(false)
  const lastPtRef = useRef({ x: 0, y: 0 })

  // ===== 전체화면 토글 =====
  const [isFS, setIsFS] = useState(false)       // Fullscreen API 상태
  const [forceFull, setForceFull] = useState(false) // API 실패 시 fixed 오버레이 폴백

  // 캔버스 크기 컨테이너에 맞추기(DPR 보정)
  useEffect(() => {
    const el = wrapRef.current
    const cvs = canvasRef.current
    if (!el || !cvs) return
    const resize = () => {
      const r = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      cvs.width = Math.max(1, Math.floor(r.width * dpr))
      cvs.height = Math.max(1, Math.floor(r.height * dpr))
      cvs.style.width = `${r.width}px`
      cvs.style.height = `${r.height}px`
      const ctx = cvs.getContext("2d")
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isFS, forceFull]) // 전체화면 전환 시도 후에도 리사이즈

  // Fullscreen API 이벤트
  useEffect(() => {
    const onChange = () => setIsFS(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const enterFullscreen = async () => {
    const el = wrapRef.current
    if (!el) return
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen()
        setForceFull(false) // API 사용 성공
      } else {
        throw new Error("Fullscreen API not available")
      }
    } catch {
      // 폴백: fixed overlay
      setForceFull(true)
    }
  }
  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen()
      }
    } finally {
      setForceFull(false)
    }
  }
  const toggleFullscreen = () => {
    if (isFS || forceFull) exitFullscreen()
    else enterFullscreen()
  }

  // 좌표 계산
  const getCanvasXY = (evt) => {
    const cvs = canvasRef.current
    const rect = cvs.getBoundingClientRect()
    const clientX = evt.touches?.[0]?.clientX ?? evt.clientX ?? 0
    const clientY = evt.touches?.[0]?.clientY ?? evt.clientY ?? 0
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  // 드로잉 핸들러
  const onDrawStart = (e) => {
    if (!toolsOpen) return
    e.preventDefault()
    drawingRef.current = true
    lastPtRef.current = getCanvasXY(e)
  }
  const onDrawMove = (e) => {
    if (!toolsOpen || !drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return
    const p = getCanvasXY(e)

    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = lineWidth               // ✅ 펜/지우개 동일 두께

    if (tool === "erase") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = penColor || "#111111"  // ✅ 선택한 펜 색상
    }

    ctx.beginPath()
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPtRef.current = p
  }
  const onDrawEnd = () => { drawingRef.current = false }
  const clearCanvas = () => {
    const cvs = canvasRef.current; if (!cvs) return
    const ctx = cvs.getContext("2d")
    ctx.clearRect(0, 0, cvs.width, cvs.height)
  }

  // 드래그 종료 → 좌표 업데이트 (GK 제약 제거: 전원 자유 배치)
  const onDragEnd = (e) => {
    const { active, delta } = e
    if (!active || !wrapRef.current) return
    const pid = String(active.id).replace(/^pitch:/, "")
    setPlaced(prev => {
      const arr = Array.isArray(prev) ? prev : []
      const i = arr.findIndex(p => String(p.id) === pid); if (i < 0) return arr
      const rect = wrapRef.current.getBoundingClientRect()
      const cur = arr[i]
      const curX = (cur.x / 100) * rect.width
      const curY = (cur.y / 100) * rect.height

      // 아바타 반지름(36px → 18px)
      const r = 18
      const nx = clamp(curX + delta.x, r, rect.width - r)
      const ny = clamp(curY + delta.y, r, rect.height - r)

      const next = arr.slice()
      next[i] = {
        ...cur,
        x: pct((nx / rect.width) * 100),
        y: pct((ny / rect.height) * 100),
      }
      return next
    })
  }

  // 프리셋 색상 팔레트
  const PRESET_COLORS = [
    "#111111", // Black-ish
    "#ffffff", // White
    "#ff3b30", // Red
    "#ff9500", // Orange
    "#ffcc00", // Yellow
    "#34c759", // Green
    "#007aff", // Blue
    "#5856d6", // Indigo
    "#af52de", // Purple
    "#ff2d55", // Pink
  ]

  const ColorSwatch = ({ value }) => (
    <button
      type="button"
      onClick={() => { setPenColor(value); setCustomColor(value) }}
      className="w-5 h-5 rounded-full border border-white/70 shadow"
      style={{ backgroundColor: value }}
      title={value}
      aria-label={`펜 색상 ${value}`}
    />
  )

  // ===== 렌더 =====
  const content = (
    <div
      ref={wrapRef}
      className="relative rounded-none md:rounded-xl overflow-hidden"
      style={{ height: forceFull || isFS ? "100vh" : height, background: "#0a7e2a" }}
    >
      {/* 필드 */}
      <PitchLines />

      {/* 드로잉 캔버스: 이벤트는 캔버스에만! 컨트롤과 충돌 방지 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          pointerEvents: toolsOpen ? "auto" : "none",
          touchAction: toolsOpen ? "none" : "auto", // 캔버스에서만 터치 제스처 차단
        }}
        onMouseDown={onDrawStart}
        onMouseMove={onDrawMove}
        onMouseUp={onDrawEnd}
        onMouseLeave={onDrawEnd}
        onTouchStart={onDrawStart}
        onTouchMove={onDrawMove}
        onTouchEnd={onDrawEnd}
      />

      {/* 드래그 레이어 */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {safePlaced.map(p => <FieldDot key={p.id} data={p} />)}
        <DragOverlay />
      </DndContext>

      {/* 우상단: 컨트롤 패널(반투명) + 토글 버튼 + 전체화면 */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2 z-10">
        {toolsOpen && (
          <div
            className="rounded-xl bg-black/40 text-white text-xs shadow-lg px-3 py-2 backdrop-blur"
            onMouseDown={(e)=>e.stopPropagation()}
            onTouchStart={(e)=>e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <button
                className={`rounded px-2 py-1 ${tool==='pen' ? 'bg-white/20' : ''}`}
                onClick={() => setTool('pen')}
                title="펜"
              >
                ✏️ 펜
              </button>
              <button
                className={`rounded px-2 py-1 ${tool==='erase' ? 'bg-white/20' : ''}`}
                onClick={() => setTool('erase')}
                title="지우개"
              >
                🩹 지우개
              </button>
              <button
                className="rounded px-2 py-1 hover:bg-white/10"
                onClick={clearCanvas}
                title="클리어"
              >
                🗑️ 클리어
              </button>
            </div>

            {/* 두께 */}
            <div className="flex items-center gap-2 mb-2">
              <span>두께</span>
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={lineWidth}
                onChange={(e)=>setLineWidth(Number(e.target.value))}
                onInput={(e)=>setLineWidth(Number(e.target.value))}
              />
              <span className="tabular-nums">{lineWidth}px</span>
            </div>

            {/* 색상 선택 */}
            <div className="flex items-center gap-2">
              <span>색상</span>
              <div className="flex items-center gap-1">
                {PRESET_COLORS.map(c => <ColorSwatch key={c} value={c} />)}
              </div>
              <label className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer">
                <span className="w-4 h-4 rounded-full border border-white/70 shadow" style={{ backgroundColor: customColor }} />
                <span>Custom</span>
                <input
                  type="color"
                  value={customColor}
                  onChange={(e)=>{ setCustomColor(e.target.value); setPenColor(e.target.value) }}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        )}

        {/* 툴 토글 */}
        <div className="flex gap-2">
          <button
            onClick={() => setToolsOpen(v => !v)}
            className="rounded-full bg-black/45 text-white w-10 h-10 grid place-items-center shadow-lg backdrop-blur hover:bg-black/55"
            title="그리기 도구"
            aria-pressed={toolsOpen}
          >
            {toolsOpen ? "−" : "✎"}
          </button>

          {/* 전체화면 토글 */}
          <button
            onClick={toggleFullscreen}
            className="rounded-full bg-black/45 text-white w-10 h-10 grid place-items-center shadow-lg backdrop-blur hover:bg-black/55"
            title="전체화면"
            aria-pressed={isFS || forceFull}
          >
            {isFS || forceFull ? "⤢" : "⛶"}
          </button>
        </div>
      </div>
    </div>
  )

  if (forceFull && !isFS) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black">
        {content}
      </div>
    )
  }
  return content
}

function FieldDot({ data }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pitch:${String(data.id)}`
  })
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
      title={`${data.name}${data.role ? ` (${data.role})` : ""}`}
    >
      <InitialAvatar id={data.id} name={data.name} size={36} />
      <div className="mt-1 text-center text-xs text-white">
        <div className="font-semibold">{data.name}</div>
        {data.role && <div className="text-gray-300">{data.role}</div>}
      </div>
    </div>
  )
}
