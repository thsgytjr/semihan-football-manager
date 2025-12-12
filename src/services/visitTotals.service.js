// src/services/visitTotals.service.js
// visit_totals 테이블과 increment_visit_total 함수 래핑

import { supabase } from '../lib/supabaseClient'
import { TEAM_CONFIG } from '../lib/teamConfig'
import { logger } from '../lib/logger'

let ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
export function setVisitRoom(id){ if(id) ROOM_ID = id }

const TABLE = 'visit_totals'

export async function getVisitTotal(){
  try{
    const { data, error } = await supabase
      .from(TABLE)
      .select('total_visits')
      .eq('room_id', ROOM_ID)
      .single()
    if(error){
      if(error.code === 'PGRST116'){ return 0 }
      throw error
    }
    return data?.total_visits || 0
  }catch(err){
    logger.error('[visitTotals] get failed', err)
    return 0
  }
}

export async function incrementVisitTotal(){
  try{
    const { data, error } = await supabase
      .rpc('increment_visit_total', { p_room_id: ROOM_ID })
    if(error) throw error
    return data || 0
  }catch(err){
    logger.error('[visitTotals] increment failed', err)
    return 0
  }
}

export function subscribeVisitTotals(callback){
  const channel = supabase
    .channel('visit_totals_changes')
    .on('postgres_changes',{
      event:'*',schema:'public',table:TABLE,filter:`room_id=eq.${ROOM_ID}`
    },payload=>{
      const total = payload?.new?.total_visits
      if(typeof total === 'number') callback(total)
    })
  
  const subscribePromise = channel.subscribe()
  if (subscribePromise && typeof subscribePromise.catch === 'function') {
    subscribePromise.catch((err) => logger?.warn?.('[subscribeVisitTotals] subscribe error', err))
  }
  
  return ()=>{ try{ supabase.removeChannel?.(channel) }catch{} }
}
