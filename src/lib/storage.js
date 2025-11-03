// src/lib/storage.js  — v4로 올리고 match.location 보존
import { DEFAULT_STATS } from './constants'
import { defaultPlayers } from './players'
import { STORAGE_PREFIX } from './teamConfig'

export const LS_KEY = `${STORAGE_PREFIX}football-manager:v4`

export function loadDB() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const fresh = { version: 4, players: normalizePlayers(defaultPlayers), matches: [] }
      localStorage.setItem(LS_KEY, JSON.stringify(fresh))
      return fresh
    }
    const data = JSON.parse(raw)
    const players = Array.isArray(data.players) ? normalizePlayers(data.players) : normalizePlayers(defaultPlayers)
    const matches = Array.isArray(data.matches) ? data.matches.map(safeMatch) : []
    const db = { version: 4, players, matches }
    localStorage.setItem(LS_KEY, JSON.stringify(db))
    return db
  } catch {
    const fallback = { version: 4, players: normalizePlayers(defaultPlayers), matches: [] }
    localStorage.setItem(LS_KEY, JSON.stringify(fallback))
    return fallback
  }
}

export function saveDB(db) {
  const safe = {
    version: 4,
    players: normalizePlayers(db.players || []),
    matches: Array.isArray(db.matches) ? db.matches.map(safeMatch) : [],
  }
  localStorage.setItem(LS_KEY, JSON.stringify(safe));
}

export function normalizePlayers(list){
  return (list || []).map(p => ({
    ...p,
    stats: { ...DEFAULT_STATS, ...(p.stats || {}) },
    membership: p.membership === 'member' ? 'member' : 'guest',
  }));
}

function safeMatch(m){
  return {
    id: m.id || String(Date.now()),
    dateISO: m.dateISO || new Date().toISOString(),
    attendeeIds: Array.isArray(m.attendeeIds) ? m.attendeeIds : [],
    selectionMode: m.selectionMode || 'auto',
    mode: m.mode || '9v9',
    teamCount: Math.max(2, Math.min(8, Math.floor(m.teamCount || 2))),
    criterion: m.criterion || 'overall',
    teamIds: Array.isArray(m.teamIds) ? m.teamIds.map(row => Array.isArray(row) ? row : []) : [],
    snapshot: isPlainObject(m.snapshot) ? m.snapshot : {},
    location: m.location ? {
      name: m.location.name || '',
      address: m.location.address || '',
      mapsUrl: m.location.mapsUrl || ''
    } : null,
  }
}
function isPlainObject(v){ return v && typeof v === 'object' && !Array.isArray(v) }
