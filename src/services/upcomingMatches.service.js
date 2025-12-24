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
    roomId: row.room_id || row.roomId,
    title: row.title || '',
    note: row.note || '',
    dateISO: normalizeDateISO(row.dateISO || row.date_iso),
    location: row.location || {},
    snapshot: row.snapshot || [],
    participantIds: row.participant_ids || row.participantIds || [],
    attendeeIds: row.participant_ids || row.participantIds || [],
    captainIds: row.captain_ids || row.captainIds || [],
    formations: row.formations || [],
    teamCount: row.team_count || row.teamCount || 2,
    isDraftMode: row.is_draft_mode || row.isDraftMode || false,
    isDraftComplete: row.is_draft_complete || row.isDraftComplete || false,
    draftCompletedAt: row.draft_completed_at || row.draftCompletedAt,
    totalCost: row.total_cost || row.totalCost,
    feesDisabled: row.fees_disabled || row.feesDisabled || false,
    teamColors: row.team_colors || row.teamColors || {},
    criterion: row.criterion || 'overall',
    status: row.status || 'scheduled',
    metadata: row.metadata || {},
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  }
}

function buildInsertPayload(payload={}){
  return {
    room_id: payload.roomId || ROOM_ID,
    title: payload.title || null,
    note: payload.note || null,
    dateISO: normalizeDateISO(payload.dateISO || payload.date_iso || new Date().toISOString()),
    location: payload.location || {},
    snapshot: payload.snapshot || [],
    participantIds: payload.participantIds || payload.attendeeIds || [],
    captainIds: payload.captainIds || [],
    formations: payload.formations || [],
    teamCount: payload.teamCount || 2,
    isDraftMode: payload.isDraftMode || false,
    isDraftComplete: payload.isDraftComplete || false,
    draftCompletedAt: payload.draftCompletedAt || null,
    totalCost: payload.totalCost ?? null,
    feesDisabled: payload.feesDisabled || false,
    teamColors: payload.teamColors || {},
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
  if('dateISO' in payload || 'date_iso' in payload) row.dateISO = normalizeDateISO(payload.dateISO || payload.date_iso)
  if('location' in payload) row.location = payload.location || {}
  if('snapshot' in payload) row.snapshot = payload.snapshot || []
  if('participantIds' in payload || 'attendeeIds' in payload) row.participantIds = payload.participantIds || payload.attendeeIds || []
  if('captainIds' in payload) row.captainIds = payload.captainIds || []
  if('formations' in payload) row.formations = payload.formations || []
  if('teamCount' in payload) row.teamCount = payload.teamCount || 2
  if('isDraftMode' in payload) row.isDraftMode = !!payload.isDraftMode
  if('isDraftComplete' in payload) row.isDraftComplete = !!payload.isDraftComplete
  if('draftCompletedAt' in payload) row.draftCompletedAt = payload.draftCompletedAt || null
  if('totalCost' in payload) row.totalCost = payload.totalCost ?? null
  if('feesDisabled' in payload) row.feesDisabled = !!payload.feesDisabled
  if('teamColors' in payload) row.teamColors = payload.teamColors || {}
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
      .order('dateISO', { ascending: true })
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
