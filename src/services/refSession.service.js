// src/services/refSession.service.js
// 심판모드 세션 관리 및 실시간 동기화

import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'
import { TEAM_CONFIG } from '../lib/teamConfig'

const TABLE = 'ref_sessions'
const ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`

/**
 * 심판모드 세션 생성 또는 업데이트
 * @param {string} matchId - 매치 ID
 * @param {number} gameIndex - 게임 인덱스
 * @param {object} sessionData - 세션 데이터 (status, duration, lastEventAt 등)
 */
export async function upsertRefSession(matchId, gameIndex, sessionData) {
  if (!matchId) return null
  
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
  if (!matchId) return false
  
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
  if (!matchId) return false
  
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
  if (!matchId) return false
  
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
  if (!matchId) return { unsubscribe: () => {} }

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
  if (!matchId) return null
  
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
      throw error
    }
    return data
  } catch (e) {
    logger.error('[getRefSession] failed', e)
    return null
  }
}
