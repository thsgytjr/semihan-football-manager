#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'

const PROD_URL = process.env.PROD_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const PROD_ANON = process.env.PROD_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const CONFIRM = String(process.env.PULL_PROD_CONFIRM || '')

if (CONFIRM !== '1') {
  console.error('Aborting: set PULL_PROD_CONFIRM=1 to allow pulling prod data into local JSON files.')
  process.exit(1)
}

if (!PROD_URL || !PROD_ANON) {
  console.error('Missing PROD_SUPABASE_URL and/or PROD_SUPABASE_ANON_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(PROD_URL, PROD_ANON)

const outPlayers = path.resolve(process.cwd(), 'src/services/local.players.json')
const outAppdb = path.resolve(process.cwd(), 'src/services/local.appdb.json')

async function backupIfExists(file) {
  try {
    const stat = await fs.stat(file)
    if (stat.isFile()) {
      const bak = `${file}.bak-${Date.now()}`
      await fs.copyFile(file, bak)
      console.log(`Backed up ${file} -> ${bak}`)
    }
  } catch (e) {
    // no existing file
  }
}

async function fetchPlayers() {
  const { data, error } = await supabase.from('players').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

async function fetchAppdb() {
  // attempt to fetch room id 'semihan-lite-room-1' first, else return first entry
  const { data, error } = await supabase.from('appdb').select('id,data').limit(1000)
  if (error) throw error
  if (!data || data.length === 0) return { players: [], matches: [] }
  const room = data.find(d => d.id === 'semihan-lite-room-1') || data[0]
  return room.data || { players: [], matches: [] }
}

async function main() {
  try {
    console.log('Pulling players from:', PROD_URL)
    const players = await fetchPlayers()
    console.log(`Fetched ${players.length} players`)

    console.log('Pulling appdb...')
    const appdb = await fetchAppdb()

    await backupIfExists(outPlayers)
    await backupIfExists(outAppdb)

    await fs.writeFile(outPlayers, JSON.stringify(players, null, 2) + '\n', 'utf8')
    console.log('Wrote players to', outPlayers)

    await fs.writeFile(outAppdb, JSON.stringify(appdb, null, 2) + '\n', 'utf8')
    console.log('Wrote appdb to', outAppdb)

    console.log('Done. Local seed files updated. No production writes performed.')
  } catch (err) {
    console.error('Error pulling prod data:', err.message || err)
    process.exit(1)
  }
}

main()
