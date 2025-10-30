// src/components/FormationBoard.jsx
import React, { useMemo, useState } from 'react'
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  rectIntersection,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

/**
 * props:
 * - players: [{id,name,position,pos, ovr?}], 이 팀의 선수 배열
 * - formation: '4-3-3' 등
 * - height: number (필드 높이)
 * - onChange: (placed: Array<{id,x,y,role}>) => void  // 드래그 결과 전달(선택)
 *
 * 특징:
 * - 그리드 슬롯에 스냅
 * - GK는 항상 수비 최후방(골문 구역) 슬롯으로만 이동
 * - 아바타: 이니셜 아닌 "이름 전체" + 포지션 배지
 */

const TEMPLATES = {
  '4-3-3': [[92,[50]],[75,[12,35,65,88]],[55,[25,50,75]],[35,[20,50,80]]],
  '4-4-2': [[92,[50]],[75,[12,35,65,88]],[55,[15,40,60,85]],[35,[40,60]]],
  '3-5-2': [[92,[50]],[75,[30,50,70]],[55,[12,32,50,68,88]],[35,[45,55]]],
  '3-3-2': [[92,[50]],[75,[25,50,75]],[55,[30,50,70]],[35,[45,55]]],
  '3-2-3': [[92,[50]],[75,[25,50,75]],[55,[40,60]],[35,[20,50,80]]],
  '2-3-1': [[92,[50]],[72,[35,65]],[50,[25,50,75]],[30,[50]]],
}

function formationGrid(formation){ return TEMPLATES[formation] ?? TEMPLATES['4-3-3'] }

function splitByRole(players){
  const pick = r => players.filter(p => (p.position || p.pos) === r)
  return { GK: pick('GK'), DF: pick('DF'), MF: pick('MF'), FW: pick('FW') }
}

export default function FormationBoard({ players=[], formation='4-3-3', height=520, onChange }){
  // 초기 자동 배치: GK 1명 → 최후방 중앙, 나머지는 순서대로
  const { GK, DF, MF, FW } = useMemo(()=> splitByRole(players), [players])
  const grid = useMemo(()=> formationGrid(formation), [formation])

  // 슬롯 목록
  const slots = useMemo(()=> grid.flatMap(([y,xs]) => xs.map(x => ({x,y}))), [grid])
  const gkSlots = useMemo(()=> {
    const [lastRow] = grid // y 가장 큰 값(우리 그려놓은 템플릿은 배열 역순=하단부터)
    // GK 구역: 최후방 열(템플릿 첫줄)을 GK 슬롯으로 지정
    return lastRow ? lastRow[1].map(x => ({ x, y: lastRow[0] })) : [{x:50,y:92}]
  }, [grid])

  const autoPlaced = useMemo(()=>{
    const ordered = [...GK, ...DF, ...MF, ...FW, ...players.filter(p=>!['GK','DF','MF','FW'].includes(p.position||p.pos))]
    const placed = []
    let gkUsed = 0
    for (let i=0;i<ordered.length;i++){
      const p = ordered[i]
      if ((p.position||p.pos) === 'GK' && gkUsed < gkSlots.length){
        placed.push({ 
          id:p.id, 
          name:p.name, 
          role:'GK', 
          x:gkSlots[gkUsed].x, 
          y:gkSlots[gkUsed].y,
          membership: p.membership // 멤버십 정보 포함
        })
        gkUsed++
      } else {
        const idx = Math.min(placed.length, slots.length-1)
        const s = slots[idx] || slots[slots.length-1]
        const role = (p.position||p.pos) || 'FW'
        placed.push({ 
          id:p.id, 
          name:p.name, 
          role, 
          x:s.x, 
          y:s.y,
          membership: p.membership // 멤버십 정보 포함
        })
      }
    }
    return placed
  }, [players, gkSlots, slots])

  const [placed, setPlaced] = useState(autoPlaced)
  const [dragId, setDragId] = useState(null)

  // autoPlaced가 변경될 때 placed 상태도 업데이트
  React.useEffect(() => {
    setPlaced(autoPlaced)
  }, [autoPlaced])

  function commit(next){
    setPlaced(next)
    onChange?.(next)
  }

  function handleDragEnd(event){
    const { active, over } = event
    if (!over) { setDragId(null); return }
    const idx = placed.findIndex(p => String(p.id) === String(active.id))
    if (idx < 0) { setDragId(null); return }

    // 드롭 좌표 계산 (over.id = slot-<i>)
    const overIdx = Number(String(over.id).split('-')[1] ?? -1)
    if (overIdx < 0) { setDragId(null); return }

    const target = slots[overIdx] || slots[slots.length-1]
    const cur = placed[idx]

    // GK는 GK 슬롯만 허용
    if (cur.role === 'GK') {
      // 가장 가까운 GK 슬롯으로 스냅
      const nearest = nearestSlot(target, gkSlots)
      const next = placed.slice()
      next[idx] = { ...cur, x: nearest.x, y: nearest.y } // 모든 기존 속성 유지
      commit(next)
    } else {
      const next = placed.slice()
      next[idx] = { ...cur, x: target.x, y: target.y } // 모든 기존 속성 유지
      commit(next)
    }
    setDragId(null)
  }

  return (
    <div className="relative rounded-xl overflow-hidden border-2 border-white/20" style={{ height, background:'linear-gradient(135deg, #0a7e2a 0%, #0d5a1f 100%)' }}>
      <PitchLines />
      
      {/* 포메이션 타이틀 */}
      <div className="absolute top-2 right-2 bg-black/60 text-white px-3 py-2 rounded-lg">
        <div className="text-lg font-bold">{formation}</div>
        <div className="text-xs opacity-75">포메이션</div>
      </div>
      
      {/* 슬롯 드롭존 */}
      <DndContext onDragStart={(e)=>setDragId(e.active.id)} onDragEnd={handleDragEnd} collisionDetection={rectIntersection}>
        <div className="absolute inset-0">
          {/* 포메이션 라인 표시 (선수들 뒤에) */}
          <FormationLines formation={formation} />
          
          {slots.map((s, i) => <DropSlot key={i} id={`slot-${i}`} x={s.x} y={s.y} />)}
          
          {/* GK 슬롯 시각 강조선 - 더 명확하게 */}
          {gkSlots.map((s, i) => (
            <div key={`gk-hint-${i}`} className="absolute rounded-full border-3 border-red-400/60 bg-red-500/10"
                 style={{ left:`calc(${s.x}% - 26px)`, top:`calc(${s.y}% - 26px)`, width:52, height:52 }}>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-red-400 font-bold text-xs">
                GK
              </div>
            </div>
          ))}
          
          {placed.map(p => <DraggableAvatar key={p.id} data={p} />)}
        </div>
        <DragOverlay>
          {dragId ? (
            <div className="px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold shadow-xl border-2 border-blue-400">
              <div className="text-sm">{placed.find(a=>String(a.id)===String(dragId))?.name}</div>
              <div className="text-xs opacity-75">드래그해서 이동</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <Legend />
    </div>
  )
}

function nearestSlot(target, list){
  let best = list[0], bd = 1e9
  for (const s of list){
    const d = (s.x-target.x)**2 + (s.y-target.y)**2
    if (d < bd){ bd = d; best = s }
  }
  return best
}

function DropSlot({ id, x, y }){
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`absolute rounded-full transition-all duration-200 ${
        isOver 
          ? 'bg-yellow-400/70 border-2 border-yellow-300 scale-125 shadow-lg' 
          : 'bg-white/25 border border-white/40 hover:bg-white/40 hover:scale-110'
      }`}
      style={{ left:`calc(${x}% - 14px)`, top:`calc(${y}% - 14px)`, width:28, height:28 }}
    >
      {/* 중앙 도트 */}
      <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
        isOver ? 'bg-yellow-600' : 'bg-white/60'
      }`}></div>
    </div>
  )
}

function DraggableAvatar({ data }){
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(data.id) })
  const style = {
    transform: CSS.Translate.toString(transform),
    left: `calc(${data.x}% - 18px)`,
    top: `calc(${data.y}% - 18px)`,
  }
  const badge = data.role || 'FW'
  const positionColor = getPositionColor(badge)
  
  // 멤버십 상태 확인 (게스트 여부)
  const mem = String(data.membership || "").trim()
  const isMember = mem === "member" || mem.includes("정회원")
  const isGuest = !isMember
  
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute flex flex-col items-center cursor-grab active:cursor-grabbing transition-all duration-200 ${isDragging ? 'opacity-80 scale-110 z-10' : 'hover:scale-105'}`}
      style={style}
    >
      {/* 드래그 힌트 */}
      {!isDragging && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-white/80 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse"></div>
        </div>
      )}
      
      <div className="rounded-full text-white font-bold shadow-lg border-2 border-white/50 flex items-center justify-center transition-all relative"
           style={{ width:40, height:40, background: positionColor }}>
        {data.name?.slice(0,2)?.toUpperCase()}
        
        {/* 게스트 뱃지 */}
        {isGuest && (
          <div className="absolute -top-1 -left-1 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold border border-white">
            G
          </div>
        )}
      </div>
      
      <div className="mt-1 px-2 py-1 rounded-md text-[11px] font-medium leading-none bg-white/95 text-gray-800 shadow-sm">
        {data.name}
      </div>
      
      <div className={`mt-1 px-2 py-1 rounded-md text-[10px] font-bold leading-none text-white shadow-sm ${getPositionBadgeClass(badge)}`}>
        {badge}
      </div>
    </div>
  )
}

function getPositionColor(position) {
  switch(position) {
    case 'GK': return '#ef4444' // red-500
    case 'DF': return '#3b82f6' // blue-500  
    case 'MF': return '#22c55e' // green-500
    case 'FW': return '#f97316' // orange-500
    default: return '#6b7280' // gray-500
  }
}

function getPositionBadgeClass(position) {
  switch(position) {
    case 'GK': return 'bg-red-500'
    case 'DF': return 'bg-blue-500'  
    case 'MF': return 'bg-green-500'
    case 'FW': return 'bg-orange-500'
    default: return 'bg-gray-500'
  }
}

function PitchLines(){
  return (
    <>
      <div className="absolute inset-2 border-2 border-white/80 rounded-md" />
      <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-white/70" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/80 rounded-full" style={{width:90,height:90}} />
      {/* 상단/하단 페널티 에어리어 */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 w-[60%] h-24 border-2 border-white/80 rounded-sm" />
      <div className="absolute left-1/2 -translate-x-1/2 top-[74px] w-28 h-12 border-2 border-white/80 rounded-sm" />
      <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-[60%] h-24 border-2 border-white/80 rounded-sm" />
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[74px] w-28 h-12 border-2 border-white/80 rounded-sm" />
    </>
  )
}

function Legend(){
  return (
    <div className="absolute left-2 top-2 space-y-2">
      {/* 사용법 가이드 */}
      <div className="rounded-lg bg-black/70 text-white text-xs px-3 py-2 space-y-1">
        <div className="font-semibold text-green-300">🏈 포메이션 가이드</div>
        <div>• 선수를 드래그해서 원하는 위치로 이동</div>
        <div>• 골키퍼는 골문 근처에만 배치 가능</div>
        <div>• 흰색 원: 추천 포지션</div>
      </div>
      
      {/* 포지션별 색상 가이드 */}
      <div className="rounded-lg bg-white/90 text-gray-800 text-xs px-3 py-2">
        <div className="font-semibold mb-1">포지션 색상</div>
        <div className="flex flex-wrap gap-1">
          <span className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>GK</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>DF</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>MF</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span>FW</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function FormationLines({ formation }){
  const grid = formationGrid(formation)
  return (
    <>
      {grid.map(([y, xs], rowIndex) => (
        <div key={rowIndex} className="absolute left-0 right-0 border-t border-dashed border-white/30"
             style={{ top: `${y}%` }}>
          <div className="absolute -top-3 left-2 text-white/60 text-xs bg-black/40 px-1 rounded">
            {getLineLabel(rowIndex, grid.length)}
          </div>
        </div>
      ))}
    </>
  )
}

function getLineLabel(index, total) {
  if (index === 0) return '골키퍼'
  if (index === total - 1) return '공격수'
  if (index === 1) return '수비수'
  return '미드필더'
}

function colorFromId(id=''){
  let hash = 0
  for (let i=0;i<String(id).length;i++) hash = String(id).charCodeAt(i) + ((hash<<5)-hash)
  const h = Math.abs(hash % 360)
  return `hsl(${h} 70% 45%)`
}
