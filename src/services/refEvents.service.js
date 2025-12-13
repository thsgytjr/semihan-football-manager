import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

const TABLE = 'ref_events'
const allowLiveRef = import.meta.env.VITE_ALLOW_REF_LIVE === 'true'
const hostname = typeof window !== 'undefined' ? window.location?.hostname || '' : ''
const isLocalHostName = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')
const isPrivateRange = /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
const isLocalNetwork = isLocalHostName || isPrivateRange
const mockDisabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nomock')
const blockWrites = isLocalNetwork && !allowLiveRef && mockDisabled

const safeMatchId = (match) => match?.id || match?.matchId || match?.uuid || match?.slug || null

export async function fetchRefEvents(matchId, gameIndex) {
  if (!matchId) return []
  if (blockWrites) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('match_id', matchId)
    .eq('game_index', gameIndex)
    .order('created_at', { ascending: false })
  if (error) {
    logger?.warn?.('[refEvents] fetch error', error)
    return []
  }
  return Array.isArray(data) ? data.map(rowToEvent) : []
}

export async function saveRefEvent(matchId, gameIndex, event) {
  if (!matchId || !event?.id || blockWrites) return
  const payload = {
    id: event.id,
    match_id: matchId,
    game_index: gameIndex,
    event,
  }
  const { error } = await supabase.from(TABLE).upsert(payload)
  if (error) logger?.warn?.('[refEvents] upsert error', error)
}

export async function deleteRefEvent(matchId, gameIndex, eventId) {
  if (!matchId || !eventId || blockWrites) return
  const { error } = await supabase.from(TABLE).delete().eq('match_id', matchId).eq('game_index', gameIndex).eq('id', eventId)
  if (error) logger?.warn?.('[refEvents] delete error', error)
}

// 특정 매치/게임의 모든 이벤트 삭제
export async function deleteAllRefEvents(matchId, gameIndex) {
  if (!matchId || blockWrites) return
  const { error } = await supabase.from(TABLE).delete().eq('match_id', matchId).eq('game_index', gameIndex)
  if (error) logger?.warn?.('[refEvents] delete all error', error)
}

export function subscribeRefEvents(matchId, gameIndex, onInsert, onDelete, onUpdate) {
  if (!matchId || blockWrites) return { unsubscribe: () => {} }
  const channel = supabase.channel(`ref-events-${matchId}-${gameIndex}`)

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: TABLE, filter: `match_id=eq.${matchId}` },
    (payload) => {
      if (payload?.new?.game_index !== gameIndex) return
      onInsert?.(rowToEvent(payload.new))
    }
  )

  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: TABLE, filter: `match_id=eq.${matchId}` },
    (payload) => {
      if (payload?.new?.game_index !== gameIndex) return
      onUpdate?.(rowToEvent(payload.new))
    }
  )

  channel.on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: TABLE, filter: `match_id=eq.${matchId}` },
    (payload) => {
      if (payload?.old?.game_index !== gameIndex) return
      onDelete?.(payload.old?.id)
    }
  )

  const subscribePromise = channel.subscribe()
  if (subscribePromise && typeof subscribePromise.catch === 'function') {
    subscribePromise.catch((err) => logger?.warn?.('[refEvents] subscribe error', err))
  }

  return {
    unsubscribe: () => {
      try { channel.unsubscribe() } catch (_) {}
    }
  }
}

function rowToEvent(row) {
  if (!row) return null
  // ensure event has id and created_at for ordering
  return { ...row.event, id: row.id, created_at: row.created_at }
}

export { safeMatchId }
