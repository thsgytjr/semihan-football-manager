// src/services/storage.service.js
// Supabase 클라이언트 + 선수 CRUD + 앱 전체 JSON(appdb) + 실시간 구독

import { createClient } from '@supabase/supabase-js'
import { TEAM_CONFIG } from '../lib/teamConfig'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon) {
  console.warn('[storage.service] Supabase env가 비어 있습니다. Vercel 환경변수를 확인하세요.')
}

export const supabase = createClient(supabaseUrl, supabaseAnon)

// 방(룸) 개념 — 같은 ROOM_ID를 쓰는 모든 사용자가 같은 데이터 공유
// 팀별로 자동으로 다른 room ID 사용 (semihan-lite-room-1, dksc-lite-room-1 등)
let ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
export function setRoomId(id) { ROOM_ID = id || ROOM_ID }
console.log(`📦 Room ID: ${ROOM_ID}`)

// -----------------------------
// [A] Players (정규화 테이블)
// -----------------------------
export async function listPlayers() {
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
    origin: row.origin || 'none',
    photoUrl: row.photo_url || null,
    stats: row.stats || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export async function upsertPlayer(p) {
  // p: {id, name, position, membership, origin, photoUrl, stats}
  const row = {
    id: p.id,
    name: p.name ?? '',
    position: p.position ?? null,
    membership: p.membership ?? null,
    origin: p.origin ?? 'none',
    photo_url: p.photoUrl ?? null,
    stats: p.stats ?? {},
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('players').upsert(row)
  if (error) throw error
}

export async function deletePlayer(id) {
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

export function subscribePlayers(callback) {
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
  const { data, error } = await supabase
    .from('appdb')
    .select('data')
    .eq('id', ROOM_ID)
    .single()
  if (error || !data) return { players: [], matches: [] }
  return data.data
}

export async function saveDB(db) {
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

// Atomic하게 방문자 수만 증가 (race condition 방지)
export async function incrementVisits() {
  try {
    // 현재 데이터 조회
    const { data: current } = await supabase
      .from('appdb')
      .select('data')
      .eq('id', ROOM_ID)
      .single()
    
    if (!current) {
      // 첫 초기화
      await saveDB({ players: [], matches: [], visits: 1, upcomingMatches: [] })
      return 1
    }

    const currentVisits = current.data?.visits || 0
    const newVisits = currentVisits + 1

    // visits만 업데이트 (다른 데이터는 그대로 유지)
    const { error } = await supabase
      .from('appdb')
      .update({
        data: { ...current.data, visits: newVisits },
        updated_at: new Date().toISOString()
      })
      .eq('id', ROOM_ID)

    if (error) {
      console.error('[incrementVisits] error', error)
      return currentVisits
    }

    return newVisits
  } catch (e) {
    console.error('[incrementVisits] failed', e)
    return 0
  }
}

// 방문 로그 저장
export async function logVisit({ visitorId, ipAddress, userAgent, deviceType, browser, os }) {
  try {
    const { error } = await supabase
      .from('visit_logs')
      .insert({
        visitor_id: visitorId,
        room_id: ROOM_ID,
        ip_address: ipAddress,
        user_agent: userAgent,
        device_type: deviceType,
        browser: browser,
        os: os
      })

    if (error) {
      console.error('[logVisit] error', error)
      return false
    }

    return true
  } catch (e) {
    console.error('[logVisit] failed', e)
    return false
  }
}

// 방문 통계 조회
export async function getVisitStats() {
  try {
    const { data, error } = await supabase
      .from('visit_logs')
      .select('*')
      .eq('room_id', ROOM_ID)
      .order('visited_at', { ascending: false })

    if (error) {
      console.error('[getVisitStats] error', error)
      return null
    }

    return data || []
  } catch (e) {
    console.error('[getVisitStats] failed', e)
    return null
  }
}
