// src/services/storage.service.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ----[A] 선수 CRUD + 실시간 ----
export async function listPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function upsertPlayer(p) {
  // p: {id, name, position, membership, photoUrl, stats}
  const row = {
    id: p.id, name: p.name ?? '',
    position: p.position ?? null,
    membership: p.membership ?? null,
    photo_url: p.photoUrl ?? null,
    stats: p.stats ?? {},
    updated_at: new Date().toISOString()
  }
  const { error } = await supabase.from('players').upsert(row)
  if (error) throw error
}

export async function deletePlayer(id) {
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

export function subscribePlayers(callback) {
  // callback(playersArray)
  const channel = supabase
    .channel('players_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, async () => {
      const list = await listPlayers()
      callback(list)
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ----[B] 매치 JSON(간편 유지) ----
const ROOM_ID = 'semihan-lite-room-1'

export async function loadDB() {
  const { data } = await supabase.from('appdb').select('data').eq('id', ROOM_ID).single()
  return data?.data ?? { players: [], matches: [] }
}

export async function saveDB(db) {
  const payload = { id: ROOM_ID, data: db, updated_at: new Date().toISOString() }
  await supabase.from('appdb').upsert(payload)
}

export function subscribeDB(callback) {
  const ch = supabase
    .channel('appdb_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appdb', filter: `id=eq.${ROOM_ID}` },
      (m) => m?.new?.data && callback(m.new.data)
    ).subscribe()
  return () => supabase.removeChannel(ch)
}
