export const TEMPLATES = {
    "4-3-3": [[92,[50]],[75,[12,35,65,88]],[55,[25,50,75]],[35,[20,50,80]]],
    "4-4-2": [[92,[50]],[75,[12,35,65,88]],[55,[15,40,60,85]],[35,[40,60]]],
    "3-5-2": [[92,[50]],[75,[30,50,70]],[55,[12,32,50,68,88]],[35,[45,55]]],
    "3-3-2": [[92,[50]],[75,[25,50,75]],[55,[30,50,70]],[35,[45,55]]],
    "3-2-3": [[92,[50]],[75,[25,50,75]],[55,[40,60]],[35,[20,50,80]]],
    "2-3-1": [[92,[50]],[72,[35,65]],[50,[25,50,75]],[30,[50]]],
  }
  export const gridOf = (f) => TEMPLATES[f] ?? TEMPLATES["4-3-3"]
  export const countPositions = (list) => list.reduce((a, p) => { const r = (p.position || p.pos) || "FW"; a[r] = (a[r] || 0) + 1; return a }, {})
  export const recommendFormation = ({ count, mode = "auto", positions = {} }) => {
    const large = mode === "11v11" || (mode === "auto" && count >= 18)
    const medium = mode === "9v9" || (mode === "auto" && count >= 14 && count < 18)
    if (large) { if ((positions.DF || 0) >= 4 && (positions.FW || 0) >= 3) return "4-3-3"; if ((positions.MF || 0) >= 4) return "4-4-2"; return "3-5-2" }
    if (medium) return (positions.FW || 0) >= 3 ? "3-2-3" : "3-3-2"
    return "2-3-1"
  }
  const POS_RANK = { GK: 0, DF: 1, MF: 2, FW: 3 }
  const getPosRank = (p) => POS_RANK[(p.position || p.pos) || "FW"] || 3
  
  export const assignToFormation = ({ players, formation }) => {
    const g = gridOf(formation) || []
    const slots = g.flatMap(([y, xs]) => xs.map((x) => ({ x, y })))
    const order = [...players].sort((a, b) => getPosRank(a) - getPosRank(b))
    const last = Array.isArray(g[0]) ? g[0] : [92, [50]]
    const lastY = Array.isArray(last) ? last[0] : 92
    const lastXs = Array.isArray(last) ? last[1] : [50]
    const gkSlots = (lastXs || [50]).map((x) => ({ x, y: (lastY != null ? lastY : 92) }))
    let field = 0, gkUsed = 0
    return order.map((p) => {
      const role = (p.position || p.pos) || "FW"
      if (role === "GK" && gkUsed < gkSlots.length) { const s = gkSlots[gkUsed++]; return { id: p.id, name: p.name, role, x: s.x, y: s.y } }
      const s = slots[field++] || slots[slots.length - 1] || { x: 50, y: 60 }
      return { id: p.id, name: p.name, role, x: s.x, y: s.y }
    })
  }
  