// src/services/refSession.service.js
// 심판모드 세션 관리 및 실시간 동기화

import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'
import { TEAM_CONFIG } from '../lib/teamConfig'

const TABLE = 'ref_sessions'
const ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
const allowLiveRef = import.meta.env.VITE_ALLOW_REF_LIVE === 'true'
const hostname = typeof window !== 'undefined' ? window.location?.hostname || '' : ''
const isLocalHostName = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')
const isPrivateRange = /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
const isLocalNetwork = isLocalHostName || isPrivateRange
const mockDisabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nomock')
const blockWrites = isLocalNetwork && !allowLiveRef && mockDisabled
let sessionTableAvailable = true

/**
 * 심판모드 세션 생성 또는 업데이트
 * @param {string} matchId - 매치 ID
 * @param {number} gameIndex - 게임 인덱스
 * @param {object} sessionData - 세션 데이터 (status, duration, lastEventAt 등)
 */
export async function upsertRefSession(matchId, gameIndex, sessionData) {
  if (!matchId || !sessionTableAvailable || blockWrites) return null
  
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        logger?.warn?.('[upsertRefSession] Sandbox mode: Guest write blocked')
        return null
      }
    } catch (e) {
      logger?.warn?.('[upsertRefSession] Session check failed, blocking write', e)
      return null
    }
  }
  
  try {
    const payload = {
      match_id: matchId,
      game_index: gameIndex,
      room_id: ROOM_ID,
      status: sessionData.status || 'active', // active, cancelled, completed
      duration: sessionData.duration || 20,
      started_at: sessionData.startedAt || new Date().toISOString(),
      last_event_at: sessionData.lastEventAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'match_id,game_index,room_id' })
      .select('*')
      .single()

    if (error) throw error
    return data
  } catch (e) {
    if (e?.code === 'PGRST205') {
      sessionTableAvailable = false
      logger.warn?.('[upsertRefSession] table missing, disabling session sync')
      return null
    }
    logger.error('[upsertRefSession] failed', e)
    return null
  }
}

/**
 * 심판모드 세션 취소 (다른 디바이스에 알림)
 * @param {string} matchId - 매치 ID
 * @param {number} gameIndex - 게임 인덱스
 */
export async function cancelRefSession(matchId, gameIndex) {
  if (!matchId || !sessionTableAvailable || blockWrites) return false
  
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        logger?.warn?.('[cancelRefSession] Sandbox mode: Guest write blocked')
        return false
      }
    } catch (e) {
      logger?.warn?.('[cancelRefSession] Session check failed, blocking write', e)
      return false
    }
  }
  
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('match_id', matchId)
      .eq('game_index', gameIndex)
      .eq('room_id', ROOM_ID)

    if (error) throw error
    return true
  } catch (e) {
    if (e?.code === 'PGRST205') {
      sessionTableAvailable = false
      logger.warn?.('[cancelRefSession] table missing, disabling session sync')
      return false
    }
    logger.error('[cancelRefSession] failed', e)
    return false
  }
}

/**
 * 심판모드 세션 완료 처리
 * @param {string} matchId - 매치 ID
 * @param {number} gameIndex - 게임 인덱스
 */
export async function completeRefSession(matchId, gameIndex) {
  if (!matchId || !sessionTableAvailable || blockWrites) return false
  
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        logger?.warn?.('[completeRefSession] Sandbox mode: Guest write blocked')
        return false
      }
    } catch (e) {
      logger?.warn?.('[completeRefSession] Session check failed, blocking write', e)
      return false
    }
  }
  
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('match_id', matchId)
      .eq('game_index', gameIndex)
      .eq('room_id', ROOM_ID)

    if (error) throw error
    return true
  } catch (e) {
    if (e?.code === 'PGRST205') {
      sessionTableAvailable = false
      logger.warn?.('[completeRefSession] table missing, disabling session sync')
      return false
    }
    logger.error('[completeRefSession] failed', e)
    return false
  }
}

/**
 * 마지막 이벤트 시간 업데이트
 * @param {string} matchId - 매치 ID
 * @param {number} gameIndex - 게임 인덱스
 */
export async function updateLastEventTime(matchId, gameIndex) {
  if (!matchId || !sessionTableAvailable || blockWrites) return false
  
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        logger?.warn?.('[updateLastEventTime] Sandbox mode: Guest write blocked')
        return false
      }
    } catch (e) {
      logger?.warn?.('[updateLastEventTime] Session check failed, blocking write', e)
      return false
    }
  }
  
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ 
        last_event_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('match_id', matchId)
      .eq('game_index', gameIndex)
      .eq('room_id', ROOM_ID)

    if (error) throw error
    return true
  } catch (e) {
    if (e?.code === 'PGRST205') {
      sessionTableAvailable = false
      logger.warn?.('[updateLastEventTime] table missing, disabling session sync')
      return false
    }
    logger.error('[updateLastEventTime] failed', e)
    return false
  }
}

/**
 * 심판모드 세션 구독 (상태 변경 감지)
 * @param {string} matchId - 매치 ID
 * @param {number} gameIndex - 게임 인덱스
 * @param {function} onUpdate - 업데이트 콜백
 */
export function subscribeRefSession(matchId, gameIndex, onUpdate) {
  if (!matchId || !sessionTableAvailable || blockWrites) return { unsubscribe: () => {} }

  const channel = supabase
    .channel(`ref-session-${matchId}-${gameIndex}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: TABLE,
        filter: `match_id=eq.${matchId}`
      },
      (payload) => {
        if (payload?.new?.game_index !== gameIndex) return
        onUpdate?.(payload.new)
      }
    )

  const subscribePromise = channel.subscribe()
  if (subscribePromise && typeof subscribePromise.catch === 'function') {
    subscribePromise.catch((err) => logger?.warn?.('[subscribeRefSession] subscribe error', err))
  }

  return {
    unsubscribe: () => {
      try { channel.unsubscribe() } catch (_) {}
    }
  }
}

/**
 * 현재 세션 가져오기
 * @param {string} matchId - 매치 ID
 * @param {number} gameIndex - 게임 인덱스
 */
export async function getRefSession(matchId, gameIndex) {
  if (!matchId || !sessionTableAvailable || blockWrites) return null
  
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('match_id', matchId)
      .eq('game_index', gameIndex)
      .eq('room_id', ROOM_ID)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      if (error.code === 'PGRST205') {
        sessionTableAvailable = false
        logger.warn?.('[getRefSession] table missing, disabling session sync')
        return null
      }
      throw error
    }
    return data
  } catch (e) {
    logger.error('[getRefSession] failed', e)
    return null
  }
}
