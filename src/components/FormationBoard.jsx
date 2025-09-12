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
        placed.push({ id:p.id, name:p.name, role:'GK', x:gkSlots[gkUsed].x, y:gkSlots[gkUsed].y })
        gkUsed++
      } else {
        const idx = Math.min(placed.length, slots.length-1)
        const s = slots[idx] || slots[slots.length-1]
        const role = (p.position||p.pos) || 'FW'
        placed.push({ id:p.id, name:p.name, role, x:s.x, y:s.y })
      }
    }
    return placed
  }, [players, gkSlots, slots])

  const [placed, setPlaced] = useState(autoPlaced)
  const [dragId, setDragId] = useState(null)

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
      next[idx] = { ...cur, x: nearest.x, y: nearest.y }
      commit(next)
    } else {
      const next = placed.slice()
      next[idx] = { ...cur, x: target.x, y: target.y }
      commit(next)
    }
    setDragId(null)
  }

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ height, background:'#0a7e2a' }}>
      <PitchLines />
      {/* 슬롯 드롭존 */}
      <DndContext onDragStart={(e)=>setDragId(e.active.id)} onDragEnd={handleDragEnd} collisionDetection={rectIntersection}>
        <div className="absolute inset-0">
          {slots.map((s, i) => <DropSlot key={i} id={`slot-${i}`} x={s.x} y={s.y} />)}
          {/* GK 슬롯 시각 강조선 */}
          {gkSlots.map((s, i) => (
            <div key={`gk-hint-${i}`} className="absolute rounded-full border-2 border-white/40"
                 style={{ left:`calc(${s.x}% - 22px)`, top:`calc(${s.y}% - 22px)`, width:44, height:44 }} />
          ))}
          {placed.map(p => <DraggableAvatar key={p.id} data={p} />)}
        </div>
        <DragOverlay>
          {dragId ? (
            <div className="px-2 py-1 rounded bg-black/70 text-white text-xs shadow-lg">
              {placed.find(a=>String(a.id)===String(dragId))?.name}
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
      className={`absolute rounded-full ${isOver ? 'bg-white/50' : 'bg-white/18'}`}
      style={{ left:`calc(${x}% - 12px)`, top:`calc(${y}% - 12px)`, width:24, height:24 }}
    />
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
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute flex flex-col items-center ${isDragging ? 'opacity-80' : ''}`}
      style={style}
    >
      <div className="rounded-full text-white font-semibold shadow-sm flex items-center justify-center"
           style={{ width:36, height:36, background: colorFromId(data.id) }}>
        {data.name?.slice(0,2)?.toUpperCase()}
      </div>
      <div className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] leading-none bg-black/65 text-white">
        {data.name}
      </div>
      <div className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] leading-none bg-white/80 text-black">
        {badge}
      </div>
    </div>
  )
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
    <div className="absolute right-2 top-2 rounded bg-black/40 text-white text-[11px] px-2 py-1">
      드래그로 위치 변경 · GK는 골문 구역에 고정
    </div>
  )
}

function colorFromId(id=''){
  let hash = 0
  for (let i=0;i<String(id).length;i++) hash = String(id).charCodeAt(i) + ((hash<<5)-hash)
  const h = Math.abs(hash % 360)
  return `hsl(${h} 70% 45%)`
}
