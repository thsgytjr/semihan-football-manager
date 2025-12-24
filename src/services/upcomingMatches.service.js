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
    board: row.board || [],
    attendeeIds: row.attendeeIds || row.participant_ids || row.participantIds || [],
    formations: row.formations || [],
    teamCount: row.teamCount || row.team_count || 2,
    criterion: row.criterion || 'overall',
    mode: row.mode || '7v7',
    selectionMode: row.selectionMode || row.selection_mode || null,
    locked: row.locked || false,
    videos: row.videos || [],
    teamids: row.teamids || [],
    stats: row.stats || {},
    draft: row.draft || null,
    teamColors: row.teamColors || row.team_colors || {},
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
    board: payload.board || [],
    attendeeIds: payload.participantIds || payload.attendeeIds || [],
    formations: payload.formations || [],
    teamCount: payload.teamCount || 2,
    criterion: payload.criterion || 'overall',
    mode: payload.mode || '7v7',
    selectionMode: payload.selectionMode || null,
    locked: payload.locked || false,
    videos: payload.videos || [],
    teamids: payload.teamids || [],
    stats: payload.stats || {},
    draft: payload.draft || null,
    teamColors: payload.teamColors || {}
  }
}

function buildUpdatePayload(payload={}){
  const row = {}
  if('roomId' in payload) row.room_id = payload.roomId || ROOM_ID
  if('title' in payload) row.title = payload.title || null
  if('note' in payload) row.note = payload.note || null
  if('dateISO' in payload || 'date_iso' in payload) row.dateISO = normalizeDateISO(payload.dateISO || payload.date_iso)
  if('location' in payload) row.location = payload.location || {}
  if('board' in payload) row.board = payload.board || []
  if('participantIds' in payload || 'attendeeIds' in payload) row.attendeeIds = payload.participantIds || payload.attendeeIds || []
  if('formations' in payload) row.formations = payload.formations || []
  if('teamCount' in payload) row.teamCount = payload.teamCount || 2
  if('criterion' in payload) row.criterion = payload.criterion || 'overall'
  if('mode' in payload) row.mode = payload.mode || '7v7'
  if('selectionMode' in payload) row.selectionMode = payload.selectionMode || null
  if('locked' in payload) row.locked = !!payload.locked
  if('videos' in payload) row.videos = payload.videos || []
  if('teamids' in payload) row.teamids = payload.teamids || []
  if('stats' in payload) row.stats = payload.stats || {}
  if('draft' in payload) row.draft = payload.draft || null
  if('teamColors' in payload) row.teamColors = payload.teamColors || {}
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
