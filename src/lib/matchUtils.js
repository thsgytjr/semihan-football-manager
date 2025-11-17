// src/lib/matchUtils.js
// Shared utilities for match data parsing and extraction

/**
 * Convert value to string safely
 */
export const toStr = (v) => (v === null || v === undefined) ? '' : String(v)

/**
 * Check if member status is valid
 */
export function isMember(mem) {
  const s = toStr(mem).trim().toLowerCase()
  return s === 'member' || s.includes('정회원')
}

/**
 * Extract date key in MM/DD/YYYY format from match object
 */
export function extractDateKey(m) {
  const cand = m?.dateISO ?? m?.dateIso ?? m?.dateiso ?? m?.date ?? m?.dateStr ?? null
  if (!cand) return null
  let d
  if (typeof cand === 'number') d = new Date(cand)
  else d = new Date(String(cand))
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${y}`
}

/**
 * Extract season (year) from match object
 * Returns YYYY format (e.g., "2025")
 */
export function extractSeason(m) {
  const cand = m?.dateISO ?? m?.dateIso ?? m?.dateiso ?? m?.date ?? m?.dateStr ?? null
  if (!cand) return null
  let d
  if (typeof cand === 'number') d = new Date(cand)
  else d = new Date(String(cand))
  if (Number.isNaN(d.getTime())) return null
  return String(d.getFullYear())
}

/**
 * Extract attendee/participant IDs from match object
 */
export function extractAttendeeIds(m) {
  const candidates = [m?.snapshot, m?.attendeeIds, m?.attendees, m?.participants, m?.roster].filter(Boolean)
  let raw = []
  for (const c of candidates) { if (Array.isArray(c)) { raw = c; break } }
  if (!Array.isArray(raw)) raw = []
  return raw.flat().map((x) => {
    if (typeof x === 'object' && x !== null) {
      const cand = x.id ?? x.playerId ?? x.user_id ?? x.userId ?? x.pid ?? x.uid
      return toStr(cand)
    }
    return toStr(x)
  }).filter(Boolean)
}

/**
 * Extract player stats (goals, assists) from match object
 * Returns object with playerId keys and {goals, assists, events} values
 */
export function extractStatsByPlayer(m) {
  const src = m?.stats ?? m?.records ?? m?.playerStats ?? m?.ga ?? m?.scoreboard ?? null
  const out = {}
  if (!src) return out
  
  if (!Array.isArray(src) && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const pid = toStr(k)
      if (!pid) continue
       const csValue = Number(v?.cleanSheet || v?.cs || 0)
       if (csValue > 0) {
         console.log(`🔍 [matchUtils] Player ${pid} has cleanSheet in src:`, csValue, 'v:', v)
       }
      out[pid] = { 
        goals: Number(v?.goals || 0), 
        assists: Number(v?.assists || 0), 
        events: Array.isArray(v?.events) ? v.events.slice() : [],
        // Include clean sheet if present (manual entry via StatsInput)
         cleanSheet: csValue
      }
    }
    return out
  }
  
  if (Array.isArray(src)) {
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid)
      if (!pid) continue
      const type = (rec?.type || (rec?.goal ? 'goal' : rec?.assist ? 'assist' : '')).toString().toLowerCase()
      const date = rec?.dateISO || rec?.date || rec?.time || rec?.ts || null
      const isGoal = /goal/i.test(type)
      const isAssist = /assist/i.test(type)
      out[pid] = out[pid] || { goals: 0, assists: 0, events: [], cleanSheet: 0 }
      if (isGoal) {
        out[pid].goals = (out[pid].goals || 0) + Number(rec?.goals || 1)
        out[pid].events.push({ type: 'goal', date })
      } else if (isAssist) {
        out[pid].assists = (out[pid].assists || 0) + Number(rec?.assists || 1)
        out[pid].events.push({ type: 'assist', date })
      }
      // If array-form stats happen to carry cleanSheet value per record, sum it (rare)
      if (Number(rec?.cleanSheet || 0) > 0) {
        out[pid].cleanSheet = (out[pid].cleanSheet || 0) + Number(rec.cleanSheet)
      }
    }
  }
  return out
}

/**
 * Get membership badges with custom membership support
 */
import { getMembershipBadge } from './membershipConfig'

export function getBadgesWithCustom(membership, customMemberships = []) {
  if (!Array.isArray(customMemberships)) customMemberships = []
  const badgeInfo = getMembershipBadge(membership, customMemberships)
  return badgeInfo ? [badgeInfo.badge] : []
}
