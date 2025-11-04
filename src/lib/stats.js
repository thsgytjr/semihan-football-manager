import { STAT_KEYS } from "./constants"

export function clampStat(n) {
  const v = Math.floor(Number(n) || 0)
  return Math.max(0, Math.min(100, v))
}
export function ensureStatsObject(stats) {
  const out = { ...(stats || {}) }
  for (const k of STAT_KEYS) {
    const v = Number.isFinite(out[k]) ? Number(out[k]) : 30
    out[k] = clampStat(v)
  }
  return out
}
