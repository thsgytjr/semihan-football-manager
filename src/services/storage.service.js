// src/services/storage.service.js
// Supabase 클라이언트 + 선수 CRUD + 앱 전체 JSON(appdb) + 실시간 구독

import { TEAM_CONFIG } from '../lib/teamConfig'
import { logger } from '../lib/logger'
import { supabase } from '../lib/supabaseClient'

// 마이그레이션 플래그: true면 Supabase matches 테이블 사용, false면 appdb JSON 사용
export const USE_MATCHES_TABLE = true

// supabase client is provided by lib/supabaseClient (single instance)

// 방(룸) 개념 — 같은 ROOM_ID를 쓰는 모든 사용자가 같은 데이터 공유
// 팀별로 자동으로 다른 room ID 사용 (semihan-lite-room-1, dksc-lite-room-1 등)
let ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
export function setRoomId(id) { ROOM_ID = id || ROOM_ID }

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
    position: row.position || null, // 레거시 필드
    positions: row.positions || [], // 새로운 배열 필드
    membership: row.membership || null,
    origin: row.origin || 'none',
    status: row.status || 'active', // 선수 상태
    tags: row.tags || [], // 커스텀 태그
    photoUrl: row.photo_url || null,
    stats: row.stats || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export async function upsertPlayer(p) {
  // p: {id, name, position, positions, membership, origin, status, tags, photoUrl, stats}
  const row = {
    id: p.id,
    name: p.name ?? '',
    position: p.position ?? null, // 레거시 필드 (호환성)
    positions: p.positions ?? [], // 새로운 배열 필드
    membership: p.membership ?? null,
    origin: p.origin ?? 'none',
    status: p.status ?? 'active', // 선수 상태 저장
    tags: p.tags ?? [], // 커스텀 태그 저장
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
          logger.error('[subscribePlayers] reload failed', e)
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
  
  if (error || !data) {
    return { upcomingMatches: [], tagPresets: [] }
  }
  
  const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data
  return parsed || { upcomingMatches: [], tagPresets: [] }
}

export async function saveDB(db) {
  const payload = {
    id: ROOM_ID,
    data: db,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('appdb').upsert(payload)
  if (error) {
    logger.error('[saveDB] upsert error', error)
  }
}

// 태그 프리셋 관리
export async function loadTagPresets() {
  try {
    const db = await loadDB()
    return db.tagPresets || []
  } catch (e) {
    logger.error('[loadTagPresets] failed', e)
    return []
  }
}

export async function saveTagPresets(tagPresets) {
  try {
    const db = await loadDB()
    await saveDB({ ...db, tagPresets })
  } catch (e) {
    logger.error('[saveTagPresets] failed', e)
  }
}

// 멤버십 설정 관리
export async function loadMembershipSettings() {
  try {
    const db = await loadDB()
    return db.membershipSettings || []
  } catch (e) {
    logger.error('[loadMembershipSettings] failed', e)
    return []
  }
}

export async function saveMembershipSettings(membershipSettings) {
  try {
    const db = await loadDB()
    await saveDB({ ...db, membershipSettings })
  } catch (e) {
    logger.error('[saveMembershipSettings] failed', e)
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
      await saveDB({ players: [], matches: [], visits: 1, upcomingMatches: [], tagPresets: [] })
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
      logger.error('[incrementVisits] error', error)
      return currentVisits
    }

    return newVisits
  } catch (e) {
    logger.error('[incrementVisits] failed', e)
    return 0
  }
}

// 방문 로그 저장
export async function logVisit({ visitorId, ipAddress, userAgent, deviceType, browser, os, phoneModel }) {
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
        os: os,
        phone_model: phoneModel
      })

    if (error) {
      logger.error('[logVisit] error', error)
      return false
    }

    return true
  } catch (e) {
    logger.error('[logVisit] failed', e)
    return false
  }
}

// 총 방문자 수 조회 (visit_logs 테이블에서 직접 카운트)
export async function getTotalVisits() {
  try {
    const { count, error } = await supabase
      .from('visit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', ROOM_ID)

    if (error) {
      logger.error('[getTotalVisits] error', error)
      return 0
    }

    return count || 0
  } catch (e) {
    logger.error('[getTotalVisits] failed', e)
    return 0
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
      logger.error('[getVisitStats] error', error)
      return null
    }

    return data || []
  } catch (e) {
    logger.error('[getVisitStats] failed', e)
    return null
  }
}
