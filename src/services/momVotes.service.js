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
  
  // ⭐ 중복 체크 개선: IP와 Visitor ID 모두 필수
  // 같은 와이파이(같은 IP)를 쓰는 여러 디바이스가 각각 투표 가능하도록
  if (!ipHash || !visitorId) {
    console.warn('MOM Vote: IP or Visitor ID missing. Vote may be rejected by DB constraint.')
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
      dup.message = '이미 투표하셨습니다. 같은 디바이스(IP + 브라우저)에서는 1회만 투표할 수 있습니다.'
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
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('match_id', matchId)
    .eq('room_id', ROOM_ID)
  if (error) throw error
  return true
}


