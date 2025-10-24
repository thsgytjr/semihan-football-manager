// src/services/storage.service.js
// Supabase 클라이언트 + 선수 CRUD + 앱 전체 JSON(appdb) + 실시간 구독

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY
const USE_LOCAL = String(import.meta.env.VITE_USE_LOCAL_DB || '').toLowerCase() === 'true'

if (!supabaseUrl || !supabaseAnon) {
  console.warn('[storage.service] Supabase env가 비어 있습니다. Vercel 환경변수를 확인하세요.')
}

export const supabase = createClient(supabaseUrl, supabaseAnon)

// 방(룸) 개념 — 같은 ROOM_ID를 쓰는 모든 사용자가 같은 데이터 공유
let ROOM_ID = 'semihan-lite-room-1'
export function setRoomId(id) { ROOM_ID = id || ROOM_ID }

// If running in local mode, use embedded JSON seeds and persist to browser localStorage.
let localPlayers = []
let localAppDB = { players: [], matches: [] }
const playersSubscribers = new Set()
const appdbSubscribers = new Set()

function persistLocalState() {
  try {
    localStorage.setItem('semihan_local_players', JSON.stringify(localPlayers))
    localStorage.setItem('semihan_local_appdb', JSON.stringify(localAppDB))
  } catch (e) {
    // ignore
  }
}

function loadLocalSeeds() {
  try {
    // prefer persisted localStorage state so changes survive reloads
    const p = localStorage.getItem('semihan_local_players')
    const a = localStorage.getItem('semihan_local_appdb')
    if (p) localPlayers = JSON.parse(p)
    if (a) localAppDB = JSON.parse(a)
  } catch (e) {
    // ignore parse errors and keep defaults
  }
}

if (USE_LOCAL) {
  // Lazy require JSON seeds at build time (Vite supports JSON imports)
  try {
    // Try to import bundled seed JSONs; fall back to empty state if not present
    // These files live in src/services/local.*.json
    // eslint-disable-next-line import/no-unresolved
    const seedsPlayers = await import('./local.players.json')
    // eslint-disable-next-line import/no-unresolved
    const seedsApp = await import('./local.appdb.json')
    localPlayers = Array.isArray(seedsPlayers?.default) ? seedsPlayers.default.slice() : []
    localAppDB = (seedsApp?.default && typeof seedsApp.default === 'object') ? JSON.parse(JSON.stringify(seedsApp.default)) : { players: [], matches: [] }
  } catch (e) {
    // If dynamic import fails (eg during SSR), just keep defaults
    localPlayers = []
    localAppDB = { players: [], matches: [] }
  }
  loadLocalSeeds()
}

// -----------------------------
// [A] Players (정규화 테이블)
// -----------------------------
export async function listPlayers() {
  if (USE_LOCAL) {
    // Return cloned array to avoid accidental external mutation
    return (localPlayers || []).slice().map(row => ({
      id: row.id,
      name: row.name,
      position: row.position || null,
      membership: row.membership || null,
      photoUrl: row.photoUrl || row.photo_url || null,
      stats: row.stats || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
  }

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  // 앱 내부 필드명과 맞추기 위해 매핑
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    position: row.position || null,
    membership: row.membership || null,
    photoUrl: row.photo_url || null,
    stats: row.stats || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export async function upsertPlayer(p) {
  // p: {id, name, position, membership, photoUrl, stats}
  const row = {
    id: p.id,
    name: p.name ?? '',
    position: p.position ?? null,
    membership: p.membership ?? null,
    photo_url: p.photoUrl ?? p.photo_url ?? null,
    photoUrl: p.photoUrl ?? p.photo_url ?? null,
    stats: p.stats ?? {},
    updated_at: new Date().toISOString(),
    created_at: p.created_at || new Date().toISOString(),
  }

  if (USE_LOCAL) {
    const idx = localPlayers.findIndex(x => String(x.id) === String(row.id))
    if (idx >= 0) {
      localPlayers[idx] = Object.assign({}, localPlayers[idx], row)
    } else {
      localPlayers.unshift(row)
    }
    persistLocalState()
    // notify subscribers
    for (const cb of playersSubscribers) {
      try { cb(await listPlayers()) } catch (e) { console.error(e) }
    }
    return
  }

  const { error } = await supabase.from('players').upsert(row)
  if (error) throw error
}

export async function deletePlayer(id) {
  if (USE_LOCAL) {
    localPlayers = (localPlayers || []).filter(r => String(r.id) !== String(id))
    persistLocalState()
    for (const cb of playersSubscribers) {
      try { cb(await listPlayers()) } catch (e) { console.error(e) }
    }
    return
  }
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

export function subscribePlayers(callback) {
  if (USE_LOCAL) {
    playersSubscribers.add(callback)
    // immediately call with current list
    ;(async()=>{ try { callback(await listPlayers()) } catch(e){} })()
    return () => playersSubscribers.delete(callback)
  }

  // DB 변경 발생 시 최신 목록을 다시 로드해 콜백으로 전달
  const channel = supabase
    .channel('players_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players' },
      async () => {
        try {
          const list = await listPlayers()
          callback(list)
        } catch (e) {
          console.error('[subscribePlayers] reload failed', e)
        }
      }
    )
    .subscribe()

  return () => {
    try { supabase.removeChannel?.(channel) } catch {}
  }
}

// ---------------------------------------
// [B] App DB JSON (간편 공유용 appdb 테이블)
// ---------------------------------------
export async function loadDB() {
  if (USE_LOCAL) {
    return JSON.parse(JSON.stringify(localAppDB || { players: [], matches: [] }))
  }

  const { data, error } = await supabase
    .from('appdb')
    .select('data')
    .eq('id', ROOM_ID)
    .single()
  if (error || !data) return { players: [], matches: [] }
  return data.data
}

export async function saveDB(db) {
  if (USE_LOCAL) {
    localAppDB = JSON.parse(JSON.stringify(db || { players: [], matches: [] }))
    persistLocalState()
    for (const cb of appdbSubscribers) {
      try { cb(localAppDB) } catch (e) { console.error(e) }
    }
    return
  }

  const payload = {
    id: ROOM_ID,
    data: db,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('appdb').upsert(payload)
  if (error) {
    console.error('[saveDB] upsert error', error)
  }
}

export function subscribeDB(callback) {
  if (USE_LOCAL) {
    appdbSubscribers.add(callback)
    try { callback(localAppDB) } catch (e) {}
    return () => appdbSubscribers.delete(callback)
  }

  const channel = supabase
    .channel('appdb_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'appdb', filter: `id=eq.${ROOM_ID}` },
      (payload) => {
        const next = payload?.new?.data
        if (next) callback(next)
      }
    )
    .subscribe()

  return () => {
    try { supabase.removeChannel?.(channel) } catch {}
  }
}
