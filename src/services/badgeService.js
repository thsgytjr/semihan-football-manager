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

export async function fetchPlayerBadges(playerId) {
  if (!playerId) {
    const error = new Error('playerId is required to fetch badges')
    logger.error?.('[badgeService] missing playerId', error)
    return { data: null, error }
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
