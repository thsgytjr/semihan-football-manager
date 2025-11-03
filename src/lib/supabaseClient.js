// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'
import { TEAM_CONFIG } from './teamConfig'

const url = TEAM_CONFIG.supabase.url
const anon = TEAM_CONFIG.supabase.anonKey

if (!url || !anon) {
  console.error('Supabase env missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  console.log('Current team:', TEAM_CONFIG.shortName)
}

export const supabase = createClient(url, anon)

console.log('✅ Supabase initialized for team:', TEAM_CONFIG.shortName)

