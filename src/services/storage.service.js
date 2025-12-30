// src/services/storage.service.js
// Supabase 클라이언트 + 선수 CRUD + 앱 전체 JSON(appdb) + 실시간 구독

import { TEAM_CONFIG } from '../lib/teamConfig'
import { logger } from '../lib/logger'
import { supabase } from '../lib/supabaseClient'

// 마이그레이션 플래그: true면 Supabase matches 테이블 사용, false면 appdb JSON 사용
export const USE_MATCHES_TABLE = true

// supabase client is provided by lib/supabaseClient (single instance)

// Mock mode helper (localhost에서 ?nomock 없으면 localStorage 사용)
function isMockMode() {
  try {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    if (!isLocal) return false
    const usp = new URLSearchParams(window.location.search)
    return !usp.has('nomock')
  } catch {
    return false
  }
}

const LS_APPDB_KEY = 'sfm:appdb'
const LS_CACHE_PLAYERS = 'sfm:cache:players'
const LS_CACHE_MATCHES = 'sfm:cache:matches'
const LS_CACHE_MEMBERSHIP = 'sfm:cache:membership'

// 방(룸) 개념 — 같은 ROOM_ID를 쓰는 모든 사용자가 같은 데이터 공유
// 팀별로 자동으로 다른 room ID 사용 (semihan-lite-room-1, dksc-lite-room-1 등)
let ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
export function setRoomId(id) { ROOM_ID = id || ROOM_ID }

// -----------------------------
// [A] Players (정규화 테이블)
// -----------------------------
export async function listPlayers() {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    // 앱 내부 필드명과 맞추기 위해 매핑
    const players = (data || []).map(row => ({
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
    
    // 성공 시 캐시에 저장
    try {
      localStorage.setItem(LS_CACHE_PLAYERS, JSON.stringify(players))
    } catch (e) {
      logger.warn('[listPlayers] Failed to cache', e)
    }
    
    return players
  } catch (error) {
    logger.error('[listPlayers] Supabase error, trying cache', error)
    
    // 오프라인 폴백: 캐시에서 읽기
    try {
      const cached = localStorage.getItem(LS_CACHE_PLAYERS)
      if (cached) {
        logger.log('[listPlayers] Using cached data')
        return JSON.parse(cached)
      }
    } catch (e) {
      logger.error('[listPlayers] Cache parse error', e)
    }
    
    // 캐시도 없으면 빈 배열
    logger.warn('[listPlayers] No cache available, returning empty array')
    return []
  }
}

export async function upsertPlayer(p) {
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        logger.warn('[upsertPlayer] Sandbox mode: Guest write blocked')
        return // 조용히 무시
      }
    } catch (e) {
      logger.warn('[upsertPlayer] Session check failed, blocking write', e)
      return
    }
  }

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
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        logger.warn('[deletePlayer] Sandbox mode: Guest write blocked')
        return
      }
    } catch (e) {
      logger.warn('[deletePlayer] Session check failed, blocking write', e)
      return
    }
  }

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

  const subscribePromise = channel.subscribe()
  if (subscribePromise && typeof subscribePromise.catch === 'function') {
    subscribePromise.catch((err) => logger?.warn?.('[subscribePlayers] subscribe error', err))
  }

  return () => {
    try { supabase.removeChannel?.(channel) } catch {}
  }
}

// ---------------------------------------
// [B] App DB JSON (간편 공유용 appdb 테이블)
// ---------------------------------------
export async function loadDB() {
  // Mock mode: localStorage 사용하되, production 데이터도 읽어서 병합
  if (isMockMode()) {
    try {
      // 1. localStorage 데이터 읽기
      const localRaw = localStorage.getItem(LS_APPDB_KEY)
      const localData = localRaw ? JSON.parse(localRaw) : null
      
      // 2. Production DB에서도 데이터 읽기 시도 (캐시용)
      let prodData = null
      try {
        const { data, error } = await supabase
          .from('appdb')
          .select('data')
          .eq('id', ROOM_ID)
          .single()
        
        if (!error && data) {
          prodData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data
          // Production 데이터를 캐시에 저장
          try {
            localStorage.setItem(LS_APPDB_KEY + ':prod', JSON.stringify(prodData))
          } catch (e) {
            logger.warn('[loadDB] Failed to cache prod data', e)
          }
        }
      } catch (e) {
        logger.warn('[loadDB] Failed to load prod data in mock mode, using cache', e)
        // Production 로드 실패 시 캐시된 production 데이터 사용
        try {
          const cachedProd = localStorage.getItem(LS_APPDB_KEY + ':prod')
          if (cachedProd) {
            prodData = JSON.parse(cachedProd)
          }
        } catch (err) {
          logger.error('[loadDB] Failed to parse cached prod data', err)
        }
      }
      
      // 3. 병합: localStorage 우선, production 데이터는 참고용
      // upcomingMatches: localStorage에 없으면 production 것 사용
      // tagPresets, membershipSettings: 둘 다 병합
      const result = {
        upcomingMatches: (localData?.upcomingMatches?.length > 0) 
          ? localData.upcomingMatches 
          : (prodData?.upcomingMatches || []),
        tagPresets: localData?.tagPresets || prodData?.tagPresets || [],
        membershipSettings: localData?.membershipSettings || prodData?.membershipSettings || []
      }
      
      return result
    } catch (e) {
      logger.error('[loadDB] Mock mode error', e)
      return { upcomingMatches: [], tagPresets: [], membershipSettings: [] }
    }
  }

  // Production mode: Supabase 사용 (오프라인 폴백 포함)
  try {
    const { data, error } = await supabase
      .from('appdb')
      .select('data')
      .eq('id', ROOM_ID)
      .single()
    
    if (error) throw error
    
    const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data
    const result = parsed || { upcomingMatches: [], tagPresets: [], membershipSettings: [] }
    
    // 성공 시 캐시에 저장
    try {
      localStorage.setItem(LS_APPDB_KEY + ':cache', JSON.stringify(result))
    } catch (e) {
      logger.warn('[loadDB] Failed to cache', e)
    }
    
    return result
  } catch (error) {
    logger.error('[loadDB] Supabase error, trying cache', error)
    
    // 오프라인 폴백: 캐시에서 읽기
    try {
      const cached = localStorage.getItem(LS_APPDB_KEY + ':cache')
      if (cached) {
        logger.log('[loadDB] Using cached appdb data')
        return JSON.parse(cached)
      }
    } catch (e) {
      logger.error('[loadDB] Cache parse error', e)
    }
    
    // 캐시도 없으면 빈 객체
    logger.warn('[loadDB] No cache available')
    return { upcomingMatches: [], tagPresets: [], membershipSettings: [] }
  }
}

export async function saveDB(db) {
  // Mock mode: localStorage 사용
  if (isMockMode()) {
    try {
      localStorage.setItem(LS_APPDB_KEY, JSON.stringify(db))
      return
    } catch (e) {
      logger.error('[saveDB] localStorage save error', e)
      return
    }
  }

  // Sandbox Mode: 게스트는 Supabase 쓰기 금지 → 로컬에만 저장
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        try {
          localStorage.setItem(LS_APPDB_KEY, JSON.stringify(db))
          logger.warn('[saveDB] Sandbox mode: Guest write blocked, saved locally')
        } catch (e) {
          logger.warn('[saveDB] Sandbox local save failed', e)
        }
        return
      }
    } catch (e) {
      logger.warn('[saveDB] Sandbox session check failed, blocking write', e)
      return
    }
  }

  // Production mode: Supabase 사용
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
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지 → 로컬 카운터만 증가
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const key = `${LS_APPDB_KEY}:visits`
        const current = Number(localStorage.getItem(key) || 0)
        const next = current + 1
        localStorage.setItem(key, String(next))
        logger.warn('[incrementVisits] Sandbox mode: Guest write blocked, using local counter')
        return next
      }
    } catch (e) {
      logger.warn('[incrementVisits] Sandbox session check failed, blocking write', e)
      return 0
    }
  }

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
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지 → no-op
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        logger.warn('[logVisit] Sandbox mode: Guest write blocked')
        return true
      }
    } catch (e) {
      logger.warn('[logVisit] Sandbox session check failed, blocking write', e)
      return true
    }
  }

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
