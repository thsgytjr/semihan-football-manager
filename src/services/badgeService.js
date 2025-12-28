// src/services/badgeService.js
import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

const enrichedColumns = [
  'id',
  'player_id',
  'badge_id',
  'numeric_value',
  'match_id',
  'awarded_at',
  'metadata',
  'slug',
  'name',
  'description',
  'category',
  'tier',
  'icon',
  'color_primary',
  'color_secondary',
  'has_numeric_value'
]

// 메모리 캐시 (5분 TTL)
const badgeCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5분

export async function fetchPlayerBadges(playerId) {
  if (!playerId) {
    const error = new Error('playerId is required to fetch badges')
    logger.error?.('[badgeService] missing playerId', error)
    return { data: null, error }
  }
  
  // 캐시 확인
  const cacheKey = `player_${playerId}`
  const cached = badgeCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { data: cached.data, error: null }
  }
  
  const { data, error } = await supabase
    .from('player_badges_enriched')
    .select(enrichedColumns.join(', '))
    .eq('player_id', playerId)
    .order('awarded_at', { ascending: false })

  if (error) {
    logger.error?.('[badgeService] fetchPlayerBadges failed', error)
    return { data: null, error }
  }
  
  // 캐시 저장
  badgeCache.set(cacheKey, { data: data || [], timestamp: Date.now() })
  
  return { data: data || [], error: null }
}

export async function fetchBadgeDefinitions() {
  const { data, error } = await supabase
    .from('badge_definitions')
    .select('*')
    .order('tier', { ascending: true })
  if (error) {
    logger.error?.('[badgeService] fetchBadgeDefinitions failed', error)
    return { data: null, error }
  }
  return { data: data || [], error: null }
}

// 캐시 초기화 함수 (필요시 사용)
export function clearBadgeCache(playerId = null) {
  if (playerId) {
    badgeCache.delete(`player_${playerId}`)
  } else {
    badgeCache.clear()
  }
}
