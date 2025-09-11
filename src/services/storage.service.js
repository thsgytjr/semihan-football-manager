// src/services/storage.service.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// 한 방에 다 같이 쓰는 방(룸) 개념 — 원하면 다른 문자열로 변경
const ROOM_ID = 'semihan-lite-room-1'

export async function loadDB() {
  const { data, error } = await supabase
    .from('appdb')
    .select('data')
    .eq('id', ROOM_ID)
    .single()

  if (error || !data) return { players: [], matches: [] } // 초기값
  return data.data
}

export async function saveDB(db) {
  const payload = {
    id: ROOM_ID,
    data: db,
    updated_at: new Date().toISOString(),
  }
  // upsert = 있으면 업데이트, 없으면 생성
  const { error } = await supabase.from('appdb').upsert(payload)
  if (error) console.error('saveDB error', error)
}

export function onDBChange(callback) {
  // 같은 ROOM_ID 레코드의 변경을 실시간으로 수신
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
    supabase.removeChannel?.(channel)
  }
}
