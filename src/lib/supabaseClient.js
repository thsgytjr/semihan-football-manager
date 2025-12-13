// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'
import { TEAM_CONFIG } from './teamConfig'
import { logger } from './logger'

const url = TEAM_CONFIG.supabase.url
const anon = TEAM_CONFIG.supabase.anonKey
const hostname = typeof window !== 'undefined' ? window.location?.hostname || '' : ''
const isLocalHostName = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')
const isPrivateRange = /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
const isLocalNetwork = isLocalHostName || isPrivateRange
const allowProdWrite = import.meta.env.VITE_ALLOW_PROD_WRITE === 'true'

// If MSW is active (default on local network/localhost), allow writes to flow so MSW can intercept.
// If ?nomock is present, block writes unless explicitly overridden.
const mockDisabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nomock')
const allowWritesViaMock = isLocalNetwork && !mockDisabled
const blockWrites = isLocalNetwork && !allowProdWrite && !allowWritesViaMock

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

function createWriteBlockedClient(client) {
  const makeStubResult = (op) => ({ data: null, error: new Error(`Writes blocked in localhost (MSW): ${op}`) })

  const makeChain = (op) => {
    const result = makeStubResult(op)
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      is: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => chain,
      not: () => chain,
      single: () => chain,
      maybeSingle: () => chain,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      catch: (reject) => Promise.resolve(result).catch(reject),
      finally: (cb) => Promise.resolve(result).finally(cb)
    }
    return chain
  }

  const blockFn = (op) => () => makeChain(op)

  return {
    ...client,
    from(table) {
      const builder = client.from(table)
      builder.insert = blockFn('insert')
      builder.upsert = blockFn('upsert')
      builder.update = blockFn('update')
      builder.delete = blockFn('delete')
      return builder
    },
    channel: client.channel?.bind(client),
    removeChannel: client.removeChannel?.bind(client),
    rpc() {
      return makeChain('rpc')
    }
  }
}

const baseClient = (url && anon)
  ? createClient(url, anon)
  : (logger.error('Supabase env missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'), createMockSupabase())

export const supabase = blockWrites
  ? (logger.warn('[supabase] Writes blocked on localhost; set VITE_ALLOW_PROD_WRITE=true to enable'), createWriteBlockedClient(baseClient))
  : baseClient

