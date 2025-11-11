// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'
import { TEAM_CONFIG } from './teamConfig'
import { logger } from './logger'

const url = TEAM_CONFIG.supabase.url
const anon = TEAM_CONFIG.supabase.anonKey

function createMockSupabase(){
  const chain = {
    select(){ return this }, insert(){ return this }, update(){ return this }, delete(){ return this }, upsert(){ return this },
    eq(){ return this }, gte(){ return this }, lte(){ return this }, order(){ return this }, single(){ return this },
    async then(){ return { data: null, error: new Error('Supabase not configured') } }
  }
  return {
    from(){ return chain },
    channel(){ return { on(){ return this }, subscribe(){ return {} } } },
    removeChannel(){/* noop */}
  }
}

export const supabase = (url && anon) ? createClient(url, anon) : (logger.error('Supabase env missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'), createMockSupabase())

