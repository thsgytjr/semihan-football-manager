/**
 * Check duo link data in database
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
function loadEnv() {
  try {
    const teamArg = process.argv[2]?.toLowerCase()
    const envFile = teamArg === 'dksc' ? '.env.dksc' : '.env.local'
    
    const envPath = resolve(__dirname, `../${envFile}`)
    const envContent = readFileSync(envPath, 'utf-8')
    const lines = envContent.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').trim()
      process.env[key.trim()] = value
    }
  } catch (err) {
    console.error('❌ Error loading env file:', err.message)
  }
}

loadEnv()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDuoData() {
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .order('created_at', { ascending: false })
  
  console.log(`\n📊 Checking ${matches.length} matches...\n`)
  
  for (const match of matches) {
    const stats = match.stats || {}
    const duos = new Map()
    
    // Count duo links
    for (const [playerId, playerStats] of Object.entries(stats)) {
      if (!playerStats?.events) continue
      
      for (const event of playerStats.events) {
        if (event?.type === 'goal' && event?.assistedBy) {
          const key = `${event.assistedBy} → ${playerId}`
          duos.set(key, (duos.get(key) || 0) + 1)
          console.log(`  ⚽ Goal: ${event.assistedBy} → ${playerId}`)
        }
        if (event?.type === 'assist' && event?.linkedToGoal) {
          const key = `${playerId} → ${event.linkedToGoal}`
          console.log(`  🤝 Assist: ${playerId} → ${event.linkedToGoal} (linkedToGoal)`)
        }
      }
    }
    
    if (duos.size > 0) {
      console.log(`\n  Match ${match.id}:`)
      for (const [duo, count] of duos.entries()) {
        console.log(`    ${duo}: ${count}`)
      }
      console.log('')
    }
  }
}

checkDuoData().then(() => process.exit(0))
