/**
 * Fix duplicate duo links in existing match data
 * 
 * Problem: When both goal.assistedBy and assist.linkedToGoal are set,
 * the duo is counted twice (e.g., 2 goals shown as 4 in leaderboard)
 * 
 * Solution: Keep only assistedBy on goal events, remove linkedToGoal from assist events
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from .env.local
function loadEnv() {
  try {
    // Get team from command line argument
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
    
    console.log(`📄 Loaded environment from ${envFile}`)
  } catch (err) {
    console.error('❌ Error loading env file:', err.message)
  }
}

loadEnv()

// Get team from command line argument (e.g., node script.js dksc)
const teamArg = process.argv[2]?.toLowerCase()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (teamArg === 'dksc') {
  console.log('🏃 Running for DKSC team')
} else {
  console.log('🏃 Running for Semihan team (default)')
}

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  console.error(`   VITE_SUPABASE_URL: ${supabaseUrl ? '✓' : '✗'}`)
  console.error(`   VITE_SUPABASE_ANON_KEY: ${supabaseKey ? '✓' : '✗'}`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixDuplicateDuoLinks() {
  console.log('🔍 Fetching all matches...')
  
  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('❌ Error fetching matches:', error)
    return
  }
  
  console.log(`📊 Found ${matches.length} matches`)
  
  let fixedCount = 0
  let totalLinksRemoved = 0
  
  for (const match of matches) {
    let modified = false
    const stats = match.stats || {}
    
    // Track which goal events have assistedBy set
    const goalAssistPairs = new Map() // goalPlayerIdx -> assistPlayerId
    
    // First pass: collect all goal->assist links
    for (const [playerId, playerStats] of Object.entries(stats)) {
      if (!playerStats?.events || !Array.isArray(playerStats.events)) continue
      
      playerStats.events.forEach((event, eventIdx) => {
        if (event?.type === 'goal' && event?.assistedBy) {
          const key = `${playerId}:${eventIdx}`
          goalAssistPairs.set(key, event.assistedBy)
        }
      })
    }
    
    // Second pass: remove linkedToGoal from assist events if corresponding goal has assistedBy
    for (const [playerId, playerStats] of Object.entries(stats)) {
      if (!playerStats?.events || !Array.isArray(playerStats.events)) continue
      
      playerStats.events.forEach((event, eventIdx) => {
        if (event?.type === 'assist' && event?.linkedToGoal) {
          // Check if there's a corresponding goal event with assistedBy
          const linkedGoalId = event.linkedToGoal
          
          // Find if any goal event has this assist linked
          let hasDuplicateLink = false
          for (const [goalKey, assistId] of goalAssistPairs.entries()) {
            if (assistId === playerId) {
              // This assist is already linked from a goal event
              hasDuplicateLink = true
              break
            }
          }
          
          if (hasDuplicateLink) {
            console.log(`  🔧 Removing duplicate linkedToGoal from assist (Player: ${playerId}, Match: ${match.id})`)
            delete event.linkedToGoal
            delete event.linkedToGoalIdx
            modified = true
            totalLinksRemoved++
          }
        }
      })
    }
    
    if (modified) {
      const { error: updateError } = await supabase
        .from('matches')
        .update({ stats })
        .eq('id', match.id)
      
      if (updateError) {
        console.error(`❌ Error updating match ${match.id}:`, updateError)
      } else {
        fixedCount++
        console.log(`✅ Fixed match ${match.id} (${match.date_iso || match.created_at || 'no date'})`)
      }
    }
  }
  
  console.log('\n📈 Summary:')
  console.log(`   Total matches checked: ${matches.length}`)
  console.log(`   Matches fixed: ${fixedCount}`)
  console.log(`   Duplicate links removed: ${totalLinksRemoved}`)
  
  if (fixedCount === 0) {
    console.log('\n✨ No duplicate links found! All data is clean.')
  } else {
    console.log('\n✨ All duplicate duo links have been fixed!')
    console.log('💡 Refresh your app to see corrected duo counts.')
  }
}

// Run the fix
fixDuplicateDuoLinks()
  .then(() => {
    console.log('\n✅ Script completed')
    process.exit(0)
  })
  .catch(err => {
    console.error('\n❌ Script failed:', err)
    process.exit(1)
  })
