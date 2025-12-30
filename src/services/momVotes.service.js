// src/services/momVotes.service.js
// Supabase helpers for Man of the Match voting

import { supabase } from '../lib/supabaseClient'
import { TEAM_CONFIG } from '../lib/teamConfig'

const TABLE = 'mom_votes'
const ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`

const mapRow = (row) => ({
  id: row.id,
  matchId: row.match_id,
  playerId: row.player_id,
  voterLabel: row.voter_label || null,
  createdAt: row.created_at,
  ipHash: row.ip_hash || null,
  visitorId: row.visitor_id || null,
})

export async function fetchMoMVotes(matchId) {
  if (!matchId) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, match_id, player_id, voter_label, created_at, ip_hash, visitor_id')
    .eq('match_id', matchId)
    .eq('room_id', ROOM_ID)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map(mapRow)
}

export async function submitMoMVote({ matchId, playerId, voterLabel = null, ipHash = null, visitorId = null }) {
  if (!matchId || !playerId) throw new Error('matchId and playerId are required')
  
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('[submitMoMVote] Sandbox mode: Guest write blocked')
        const err = new Error('sandbox_mode')
        err.code = 'sandbox_mode'
        err.message = 'Demo 모드에서는 투표가 저장되지 않습니다.'
        throw err
      }
    } catch (e) {
      if (e.code === 'sandbox_mode') throw e
      console.warn('[submitMoMVote] Session check failed, blocking write', e)
      const err = new Error('sandbox_mode')
      err.code = 'sandbox_mode'
      err.message = 'Demo 모드에서는 투표가 저장되지 않습니다.'
      throw err
    }
  }
  
  if (!visitorId) {
    const err = new Error('device_id_missing')
    err.code = 'device_id_missing'
    err.message = '디바이스 인증에 실패했습니다. 새로고침 후 다시 시도하거나 다른 브라우저를 사용해주세요.'
    throw err
  }

  if (!ipHash) {
    console.warn('MOM Vote: IP hash missing. Duplicate prevention will rely on visitorId only.')
  }
  
  const payload = {
    room_id: ROOM_ID,
    match_id: matchId,
    player_id: playerId,
    voter_label: voterLabel || null,
    ip_hash: ipHash,
    visitor_id: visitorId,
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select('id, match_id, player_id, voter_label, created_at, ip_hash, visitor_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation (중복 투표)
      const dup = new Error('duplicate_vote')
      dup.code = 'duplicate_vote'
      dup.message = '이미 투표하셨습니다. 같은 디바이스에서는 네트워크가 달라도 1회만 투표할 수 있습니다.'
      throw dup
    }
    throw error
  }

  return mapRow(data)
}

export async function fetchAllMoMVotes(matchIds = null) {
  let query = supabase
    .from(TABLE)
    .select('id, match_id, player_id, voter_label, created_at, ip_hash, visitor_id')
    .eq('room_id', ROOM_ID)

  if (Array.isArray(matchIds) && matchIds.length > 0) {
    query = query.in('match_id', matchIds)
  }

  query = query.order('created_at', { ascending: true })

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(mapRow)
}

export async function deleteMoMVote(voteId) {
  if (!voteId) return false
  
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('[deleteMoMVote] Sandbox mode: Guest write blocked')
        return false
      }
    } catch (e) {
      console.warn('[deleteMoMVote] Session check failed, blocking write', e)
      return false
    }
  }
  
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', voteId)
    .eq('room_id', ROOM_ID)
  if (error) throw error
  return true
}

export async function deleteMoMVotesByMatch(matchId) {
  if (!matchId) return false
  
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('[deleteMoMVotesByMatch] Sandbox mode: Guest write blocked')
        return false
      }
    } catch (e) {
      console.warn('[deleteMoMVotesByMatch] Session check failed, blocking write', e)
      return false
    }
  }
  
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('match_id', matchId)
    .eq('room_id', ROOM_ID)
  if (error) throw error
  return true
}


