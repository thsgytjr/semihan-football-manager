// src/services/tagPresets.service.js
// 태그 프리셋 CRUD 및 실시간 구독

import { supabase } from '../lib/supabaseClient'
import { TEAM_CONFIG } from '../lib/teamConfig'
import { logger } from '../lib/logger'

let ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
export function setTagPresetRoom(id){
  if(id) ROOM_ID = id
}

const TABLE = 'tag_presets'

function normalize(row){
  if(!row) return null
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order ?? 0,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function denormalize(preset={}){
  return {
    id: preset.id,
    room_id: preset.roomId || ROOM_ID,
    name: preset.name,
    color: preset.color || 'stone',
    sort_order: typeof preset.sortOrder === 'number' ? preset.sortOrder : 0,
    metadata: preset.metadata || {}
  }
}

export async function listTagPresets(){
  try{
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('room_id', ROOM_ID)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if(error) throw error
    return (data||[]).map(normalize)
  }catch(err){
    logger.error('[tagPresets] list failed', err)
    return []
  }
}

export async function createTagPreset(preset){
  const row = denormalize(preset)
  try{
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select('*')
      .single()
    if(error) throw error
    return normalize(data)
  }catch(err){
    logger.error('[tagPresets] create failed', err)
    throw err
  }
}

export async function updateTagPreset(id, patch){
  if(!id) throw new Error('Missing id')
  const row = denormalize({ ...patch, id })
  try{
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .select('*')
      .single()
    if(error) throw error
    return normalize(data)
  }catch(err){
    logger.error('[tagPresets] update failed', err)
    throw err
  }
}

export async function deleteTagPreset(id){
  if(!id) throw new Error('Missing id')
  try{
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
    if(error) throw error
    return true
  }catch(err){
    logger.error('[tagPresets] delete failed', err)
    throw err
  }
}

export function subscribeTagPresets(callback){
  const channel = supabase
    .channel('tag_presets_changes')
    .on('postgres_changes',{
      event:'*',schema:'public',table:TABLE,filter:`room_id=eq.${ROOM_ID}`
    },payload=>{
      callback(payload)
    })
  
  const subscribePromise = channel.subscribe()
  if (subscribePromise && typeof subscribePromise.catch === 'function') {
    subscribePromise.catch((err) => logger?.warn?.('[subscribeTagPresets] subscribe error', err))
  }
  
  return ()=>{
    try{ supabase.removeChannel?.(channel) }catch{}
  }
}

export { normalize as normalizeTagPreset }
