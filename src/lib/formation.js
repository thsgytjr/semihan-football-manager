// src/lib/formation.js
export function recommendFormation({ count, mode = '11v11', positions }) {
    if (mode === '11v11') {
      if ((positions?.DF ?? 0) >= 4 && (positions?.FW ?? 0) >= 3) return '4-3-3'
      if ((positions?.MF ?? 0) >= 4) return '4-4-2'
      return '3-5-2'
    }
    if (mode === '9v9') return (positions?.FW ?? 0) >= 3 ? '3-2-3' : '3-3-2'
    return '2-3-1' // 7v7
  }
  
  const TEMPLATES = {
    '4-3-3': [[92,[50]],[75,[12,35,65,88]],[55,[25,50,75]],[35,[20,50,80]]],
    '4-4-2': [[92,[50]],[75,[12,35,65,88]],[55,[15,40,60,85]],[35,[40,60]]],
    '3-5-2': [[92,[50]],[75,[30,50,70]],[55,[12,32,50,68,88]],[35,[45,55]]],
    '3-3-2': [[92,[50]],[75,[25,50,75]],[55,[30,50,70]],[35,[45,55]]],
    '3-2-3': [[92,[50]],[75,[25,50,75]],[55,[40,60]],[35,[20,50,80]]],
    '2-3-1': [[92,[50]],[72,[35,65]],[50,[25,50,75]],[30,[50]]],
  }
  
  export function formationGrid(formation){ return TEMPLATES[formation] ?? TEMPLATES['4-3-3'] }
  
  export function assignToFormation({ players, formation }) {
    const gk = players.filter(p => (p.position||p.pos)==='GK')
    const df = players.filter(p => (p.position||p.pos)==='DF')
    const mf = players.filter(p => (p.position||p.pos)==='MF')
    const fw = players.filter(p => (p.position||p.pos)==='FW')
    const rest = players.filter(p => !['GK','DF','MF','FW'].includes(p.position||p.pos))
    const order = [...gk, ...df, ...mf, ...fw, ...rest]
  
    const grid = formationGrid(formation)
    const slots = grid.flatMap(([y,xs]) => xs.map(x => ({x,y})))
  
    const placed = []
    for (let i=0; i<Math.min(slots.length, order.length); i++){
      placed.push({ ...order[i], _slot: slots[i] })
    }
    const bench = order.slice(slots.length).map(p => ({ ...p, _slot: { x: 90, y: 96, bench: true } }))
    return [...placed, ...bench]
  }
  
  export function countPositions(players){
    const c = { GK:0, DF:0, MF:0, FW:0 }
    for (const p of players) {
      const pos = p.position || p.pos
      if (c[pos]!=null) c[pos]++
    }
    return c
  }
  