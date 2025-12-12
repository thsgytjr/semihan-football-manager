// src/services/upcomingMatches.service.js
// Supabase 기반 예정 경기 CRUD + 실시간 구독

import { supabase } from '../lib/supabaseClient'
import { TEAM_CONFIG } from '../lib/teamConfig'
import { logger } from '../lib/logger'
import { normalizeDateISO } from '../lib/upcomingMatch'

let ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
export function setUpcomingMatchesRoom(id){
  if(id) ROOM_ID = id
}

const TABLE = 'upcoming_matches'

function normalizeMatch(row){
  if(!row) return null
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title || '',
    note: row.note || '',
    dateISO: normalizeDateISO(row.date_iso),
    location: row.location || {},
    snapshot: row.snapshot || [],
    participantIds: row.participant_ids || [],
    attendeeIds: row.participant_ids || [],
    captainIds: row.captain_ids || [],
    formations: row.formations || [],
    teamCount: row.team_count || 2,
    isDraftMode: row.is_draft_mode || false,
    isDraftComplete: row.is_draft_complete || false,
    draftCompletedAt: row.draft_completed_at,
    totalCost: row.total_cost,
    feesDisabled: row.fees_disabled || false,
    teamColors: row.team_colors || {},
    criterion: row.criterion || 'overall',
    status: row.status || 'scheduled',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function buildInsertPayload(payload={}){
  return {
    room_id: payload.roomId || ROOM_ID,
    title: payload.title || null,
    note: payload.note || null,
    date_iso: normalizeDateISO(payload.dateISO || payload.date_iso || new Date().toISOString()),
    location: payload.location || {},
    snapshot: payload.snapshot || [],
    participant_ids: payload.participantIds || payload.attendeeIds || [],
    captain_ids: payload.captainIds || [],
    formations: payload.formations || [],
    team_count: payload.teamCount || 2,
    is_draft_mode: payload.isDraftMode || false,
    is_draft_complete: payload.isDraftComplete || false,
    draft_completed_at: payload.draftCompletedAt || null,
    total_cost: payload.totalCost ?? null,
    fees_disabled: payload.feesDisabled || false,
    team_colors: payload.teamColors || {},
    criterion: payload.criterion || 'overall',
    status: payload.status || 'scheduled',
    metadata: payload.metadata || {}
  }
}

function buildUpdatePayload(payload={}){
  const row = {}
  if('roomId' in payload) row.room_id = payload.roomId || ROOM_ID
  if('title' in payload) row.title = payload.title || null
  if('note' in payload) row.note = payload.note || null
  if('dateISO' in payload || 'date_iso' in payload) row.date_iso = normalizeDateISO(payload.dateISO || payload.date_iso)
  if('location' in payload) row.location = payload.location || {}
  if('snapshot' in payload) row.snapshot = payload.snapshot || []
  if('participantIds' in payload || 'attendeeIds' in payload) row.participant_ids = payload.participantIds || payload.attendeeIds || []
  if('captainIds' in payload) row.captain_ids = payload.captainIds || []
  if('formations' in payload) row.formations = payload.formations || []
  if('teamCount' in payload) row.team_count = payload.teamCount || 2
  if('isDraftMode' in payload) row.is_draft_mode = !!payload.isDraftMode
  if('isDraftComplete' in payload) row.is_draft_complete = !!payload.isDraftComplete
  if('draftCompletedAt' in payload) row.draft_completed_at = payload.draftCompletedAt || null
  if('totalCost' in payload) row.total_cost = payload.totalCost ?? null
  if('feesDisabled' in payload) row.fees_disabled = !!payload.feesDisabled
  if('teamColors' in payload) row.team_colors = payload.teamColors || {}
  if('criterion' in payload) row.criterion = payload.criterion || 'overall'
  if('status' in payload) row.status = payload.status || 'scheduled'
  if('metadata' in payload) row.metadata = payload.metadata || {}
  return row
}

export async function listUpcomingMatches(){
  try{
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('room_id', ROOM_ID)
      .order('date_iso', { ascending: true })
    if(error) throw error
    return (data||[]).map(normalizeMatch)
  }catch(err){
    logger.error('[upcomingMatches] list failed', err)
    return []
  }
}

export async function createUpcomingMatch(payload){
  const row = buildInsertPayload(payload)
  try{
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select('*')
      .single()
    if(error) throw error
    return normalizeMatch(data)
  }catch(err){
    logger.error('[upcomingMatches] create failed', err)
    throw err
  }
}

export async function updateUpcomingMatch(id, patch){
  if(!id) throw new Error('Missing id')
  const row = buildUpdatePayload(patch)
  try{
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .select('*')
      .single()
    if(error) throw error
    return normalizeMatch(data)
  }catch(err){
    logger.error('[upcomingMatches] update failed', err)
    throw err
  }
}

export async function deleteUpcomingMatch(id){
  if(!id) throw new Error('Missing id')
  try{
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
    if(error) throw error
    return true
  }catch(err){
    logger.error('[upcomingMatches] delete failed', err)
    throw err
  }
}

export function subscribeUpcomingMatches(callback){
  const channel = supabase
    .channel('upcoming_matches_changes')
    .on('postgres_changes',{
      event:'*',schema:'public',table:TABLE,filter:`room_id=eq.${ROOM_ID}`
    },payload=>{
      callback(payload)
    })
  
  const subscribePromise = channel.subscribe()
  if (subscribePromise && typeof subscribePromise.catch === 'function') {
    subscribePromise.catch((err) => logger?.warn?.('[subscribeUpcomingMatches] subscribe error', err))
  }
  
  return ()=>{
    try{ supabase.removeChannel?.(channel) }catch{}
  }
}

export { normalizeMatch }
