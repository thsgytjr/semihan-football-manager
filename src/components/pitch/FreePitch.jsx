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

const S=(v)=>v==null?"":String(v)
const isMember=(m)=>{const s=S(m).trim().toLowerCase();return s==='member'||s.includes('정회원')}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const pct = (v) => clamp(v, 0, 100)

export default function FreePitch({
  players = [],
  placed = [],
  setPlaced,
  height = 560,
  modalOpen = false,
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
  const [toolMinimized, setToolMinimized] = useState(false) // 툴 패널 최소화 상태
  const [toolPosition, setToolPosition] = useState('left') // 'left' | 'right' 툴 패널 위치
  const [footballs, setFootballs] = useState([]) // 축구공 위치들 [{id, x, y}]


  // ===== 전체화면 토글 =====
  const [isFS, setIsFS] = useState(false)       // Fullscreen API 상태
  const [forceFull, setForceFull] = useState(false) // API 실패 시 fixed 오버레이 폴백

  // 캔버스 크기 컨테이너에 맞추기(DPR 보정) - 개선된 버전
  useEffect(() => {
    const el = wrapRef.current
    const cvs = canvasRef.current
    if (!el || !cvs) return
    
    const resize = () => {
      // 컨테이너 크기 정확하게 측정
      const rect = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      
      // 캔버스 실제 크기 설정 (DPR 적용)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      
      cvs.width = width
      cvs.height = height
      
      // CSS 크기 설정
      cvs.style.width = `${rect.width}px`
      cvs.style.height = `${rect.height}px`
      
      // 컨텍스트 스케일 설정
      const ctx = cvs.getContext("2d")
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      
      // 캔버스 렌더링 품질 개선
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
    }
    
    // 초기 설정
    resize()
    
    // 크기 변경 감지
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    
    // 윈도우 리사이즈도 감지
    window.addEventListener('resize', resize)
    
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
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

  // 좌표 계산 - 더 정확한 버전
  const getCanvasXY = (evt) => {
    const cvs = canvasRef.current
    if (!cvs) return { x: 0, y: 0 }
    
    const rect = cvs.getBoundingClientRect()
    
    // 터치 이벤트와 마우스 이벤트 모두 지원
    let clientX, clientY
    if (evt.touches && evt.touches.length > 0) {
      clientX = evt.touches[0].clientX
      clientY = evt.touches[0].clientY
    } else {
      clientX = evt.clientX || 0
      clientY = evt.clientY || 0
    }
    
    // 캔버스 내 상대 좌표 계산
    const x = clientX - rect.left
    const y = clientY - rect.top
    
    // 캔버스 범위 내로 제한
    const boundedX = Math.max(0, Math.min(rect.width, x))
    const boundedY = Math.max(0, Math.min(rect.height, y))
    
    return { x: boundedX, y: boundedY }
  }

  // 드로잉 핸들러 - 연속적이고 부드러운 그리기
  const onDrawStart = (e) => {
    if (!toolsOpen || tool === 'football') return
    e.preventDefault()
    e.stopPropagation()
    
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    
    drawingRef.current = true
    if (tool !== 'football') {
      setToolMinimized(true) // 그리기 시작하면 툴 패널 최소화 (축구공 모드 제외)
    }
    
    const pos = getCanvasXY(e)
    
    // 마우스 위치에 따라 툴 패널 위치 조정
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      if (pos.x < rect.width * 0.3) {
        setToolPosition('right') // 왼쪽에서 그리기 시작하면 패널을 오른쪽으로
      } else if (pos.x > rect.width * 0.7) {
        setToolPosition('left') // 오른쪽에서 그리기 시작하면 패널을 왼쪽으로
      }
    }
    lastPtRef.current = pos
    
    // 그리기 설정
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = lineWidth
    
    if (tool === "erase") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = penColor || "#111111"
    }
    
    // 시작점 그리기 (점 찍기)
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    
    // 새로운 패스 시작
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }
  
  const onDrawMove = (e) => {
    if (!toolsOpen || !drawingRef.current || tool === 'football') return
    e.preventDefault()
    e.stopPropagation()
    
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    
    const currentPos = getCanvasXY(e)
    
    // 연속적인 선 그리기 설정
    ctx.lineCap = "round"
    ctx.lineJoin = "round" 
    ctx.lineWidth = lineWidth

    if (tool === "erase") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = penColor || "#111111"
    }

    // 현재 위치까지 직선 그리기 (연속성 보장)
    ctx.lineTo(currentPos.x, currentPos.y)
    ctx.stroke()
    
    // 다음 선분을 위해 시작점 이동
    ctx.beginPath()
    ctx.moveTo(currentPos.x, currentPos.y)
    
    lastPtRef.current = currentPos
  }
  
  const onDrawEnd = (e) => { 
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    drawingRef.current = false
    // 그리기 끝나면 잠시 후 툴 패널 복원
    setTimeout(() => setToolMinimized(false), 500)
  }
  const clearCanvas = () => {
    const cvs = canvasRef.current; if (!cvs) return
    const ctx = cvs.getContext("2d")
    ctx.clearRect(0, 0, cvs.width, cvs.height)
  }



  // 축구공 제거
  const removeFootball = (id) => {
    setFootballs(prev => prev.filter(f => f.id !== id))
  }

  // 모든 축구공 제거
  const clearFootballs = () => {
    setFootballs([])
  }

  // 축구공 추가/제거 토글
  const toggleFootball = () => {
    if (footballs.length > 0) {
      // 축구공이 있으면 모두 제거
      setFootballs([])
    } else {
      // 축구공이 없으면 중앙에 하나 추가 (% 단위로)
      const newFootball = {
        id: Date.now(),
        x: 50, // 50% = 중앙
        y: 50, // 50% = 중앙
      }
      setFootballs([newFootball])
    }
  }

  // 축구공 이동
  const moveFootball = (footballId, newX, newY) => {
    setFootballs(prev => prev.map(football => 
      football.id === footballId 
        ? { ...football, x: newX, y: newY }
        : football
    ))
  }

  // 드래그 종료 → 좌표 업데이트 (선수와 축구공 모두 처리)
  const onDragEnd = (e) => {
    const { active, delta } = e
    if (!active || !wrapRef.current) return
    
    const activeId = String(active.id)
    const rect = wrapRef.current.getBoundingClientRect()
    
    // 축구공 드래그 처리
    if (activeId.startsWith('football:')) {
      const footballId = activeId.replace(/^football:/, "")
      const football = footballs.find(f => String(f.id) === footballId)
      if (!football) return
      
      const curX = (football.x / 100) * rect.width
      const curY = (football.y / 100) * rect.height
      
      // 축구공 반지름(15px)
      const r = 15
      const nx = clamp(curX + delta.x, r, rect.width - r)
      const ny = clamp(curY + delta.y, r, rect.height - r)
      
      moveFootball(
        football.id,
        pct((nx / rect.width) * 100),
        pct((ny / rect.height) * 100)
      )
      return
    }
    
    // 선수 드래그 처리 (기존 로직)
    if (activeId.startsWith('pitch:')) {
      const pid = activeId.replace(/^pitch:/, "")
      setPlaced(prev => {
        const arr = Array.isArray(prev) ? prev : []
        const i = arr.findIndex(p => String(p.id) === pid); if (i < 0) return arr
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

      {/* 드로잉 캔버스: 전체 영역 그리기 가능 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          pointerEvents: toolsOpen ? "auto" : "none",
          touchAction: toolsOpen ? "none" : "auto",
          zIndex: toolsOpen ? 15 : 1, // 그리기 모드일 때 모달보다는 아래, 다른 요소보다는 위
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
        {footballs.map(football => (
          <Football 
            key={football.id} 
            data={football} 
            onRemove={removeFootball}
            onMove={moveFootball}
          />
        ))}
        <DragOverlay />
      </DndContext>

      {/* 그리기 도구 패널 - 그리기 중에는 최소화, 위치 동적 조정 */}
      <div className={`absolute top-3 flex flex-col gap-2 transition-all duration-300 ${
        modalOpen ? 'z-0' : 'z-50'
      } ${toolPosition === 'left' ? 'left-3' : 'right-3'}`}>        
        {toolsOpen && !toolMinimized && (
          <div
            className="rounded-xl bg-black/80 backdrop-blur text-white shadow-xl p-3 max-w-[260px] transition-all duration-300"
            onMouseDown={(e)=>e.stopPropagation()}
            onTouchStart={(e)=>e.stopPropagation()}
          >
            {/* 컴팩트한 도구 선택 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-1">
                <button
                  className={`w-8 h-8 rounded text-sm transition-all ${
                    tool==='pen' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-white/20 text-white/80 hover:bg-white/30'
                  }`}
                  onClick={() => setTool('pen')}
                  title="펜"
                >
                  ✏️
                </button>
                <button
                  className={`w-8 h-8 rounded text-sm transition-all ${
                    tool==='erase' 
                      ? 'bg-red-500 text-white' 
                      : 'bg-white/20 text-white/80 hover:bg-white/30'
                  }`}
                  onClick={() => setTool('erase')}
                  title="지우개"
                >
                  🧹
                </button>

                <div className="w-px h-6 bg-white/20 mx-1"></div>
                <button
                  className="w-8 h-8 rounded text-sm bg-white/20 text-white/80 hover:bg-red-500 hover:text-white transition-all"
                  onClick={() => {clearCanvas(); clearFootballs();}}
                  title="모두 지우기"
                >
                  🗑️
                </button>
              </div>
              <span className="text-xs text-white/60 px-2 py-1 bg-white/10 rounded">
                {tool === 'pen' ? `펜 ${lineWidth}px` : tool === 'erase' ? `지우개 ${lineWidth}px` : '이동 모드'}
              </span>
            </div>

            {/* 펜/지우개 전용 설정 */}
            {(tool === 'pen' || tool === 'erase') && (
              <>
                {/* 간단한 펜 두께 */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-white/80">두께:</span>
                  <div className="flex gap-1">
                    {[2, 4, 8, 16].map(size => (
                      <button
                        key={size}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                          lineWidth === size 
                            ? 'bg-white text-black' 
                            : 'bg-white/20 hover:bg-white/30'
                        }`}
                        onClick={() => setLineWidth(size)}
                      >
                        <div 
                          className={`rounded-full ${lineWidth === size ? 'bg-black' : 'bg-white'}`}
                          style={{ width: Math.min(size/2, 4), height: Math.min(size/2, 4) }}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-white/60">{lineWidth}px</span>
                </div>

                {/* 컴팩트한 색상 팔레트 (펜 전용) */}
                {tool === 'pen' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/80">색상:</span>
                    <div className="flex gap-1">
                      {PRESET_COLORS.slice(0, 6).map(color => (
                        <button
                          key={color}
                          className={`w-5 h-5 rounded border transition-all ${
                            penColor === color ? 'border-white border-2' : 'border-white/30'
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => { setPenColor(color); setCustomColor(color) }}
                        />
                      ))}
                      <label className="w-5 h-5 rounded border border-white/30 cursor-pointer">
                        <div 
                          className="w-full h-full rounded" 
                          style={{ backgroundColor: customColor }} 
                        />
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
              </>
            )}


          </div>
        )}
        
        {/* 최소화된 상태의 인디케이터 */}
        {toolsOpen && toolMinimized && (
          <div 
            className="w-12 h-6 bg-black/60 backdrop-blur rounded-full flex items-center justify-center text-white/80 text-xs cursor-pointer hover:bg-black/80 transition-all"
            onClick={() => setToolMinimized(false)}
            title="그리기 도구 열기"
          >
            🎨
          </div>
        )}
      </div>

      {/* 우상단: 미니멀한 컨트롤 - 툴 패널 위치 고려 */}
      <div className={`absolute top-3 transition-all duration-300 ${
        modalOpen ? 'z-0' : 'z-40'
      } ${toolPosition === 'right' && toolsOpen ? 'right-3 top-20' : 'right-3'}`}>
        {!toolsOpen && (
          <div className="flex gap-2">
            <button
              onClick={() => {setToolsOpen(true); setToolMinimized(false);}}
              className="w-8 h-8 rounded bg-black/50 backdrop-blur text-white/80 hover:text-white hover:bg-black/70 transition-all text-sm"
              title="그리기 도구"
            >
              🎨
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded bg-black/50 backdrop-blur text-white/80 hover:text-white hover:bg-black/70 transition-all text-sm"
              title="전체화면"
            >
              {isFS || forceFull ? "⤢" : "⛶"}
            </button>
            <button
              onClick={toggleFootball}
              className={`w-8 h-8 rounded backdrop-blur transition-all text-sm ${
                footballs.length > 0 
                  ? 'bg-green-500/80 text-white hover:bg-green-600' 
                  : 'bg-black/50 text-white/80 hover:text-white hover:bg-black/70'
              }`}
              title={footballs.length > 0 ? "축구공 제거" : "축구공 추가"}
            >
              ⚽
            </button>
          </div>
        )}
        {toolsOpen && (
          <div className="flex gap-1">
            <button
              onClick={() => setToolMinimized(!toolMinimized)}
              className="w-8 h-8 rounded bg-blue-500/80 backdrop-blur text-white hover:bg-blue-600 transition-all text-sm"
              title={toolMinimized ? "도구 패널 복원" : "도구 패널 최소화"}
            >
              {toolMinimized ? "📤" : "📥"}
            </button>
            <button
              onClick={() => {setToolsOpen(false); setToolMinimized(false);}}
              className="w-8 h-8 rounded bg-red-500/80 backdrop-blur text-white hover:bg-red-600 transition-all text-sm"
              title="그리기 닫기"
            >
              ✕
            </button>
          </div>
        )}
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
      <InitialAvatar id={data.id} name={data.name} size={36} badges={!isMember(data?.membership)?['G']:[]} />
      <div className="mt-1 text-center text-xs text-white">
        <div className="font-semibold">{data.name}</div>
        {data.role && <div className="text-gray-300">{data.role}</div>}
      </div>
    </div>
  )
}

function Football({ data, onRemove, onMove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `football:${String(data.id)}`
  })
  
  const style = {
    transform: CSS.Translate.toString(transform),
    left: `calc(${data.x}% - 15px)`,
    top: `calc(${data.y}% - 15px)`,
    width: '30px',
    height: '30px',
    touchAction: "none",
    transition: isDragging ? 'none' : 'all 0.2s ease-out', // 드래그 중이 아닐 때만 부드러운 전환
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-all duration-200 ${isDragging ? "opacity-80 z-50 scale-110" : ""}`}
      style={style}
      title="드래그로 이동"
    >
      <div className="text-2xl drop-shadow-lg filter">⚽</div>
    </div>
  )
}
