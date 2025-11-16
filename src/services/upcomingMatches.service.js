// src/services/upcomingMatches.service.js
// Upcoming Matches CRUD operations (Supabase table)

import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

/**
 * List all upcoming matches, sorted by date
 */
export async function listUpcomingMatches() {
  try {
    const { data, error } = await supabase
      .from('upcoming_matches')
      .select('*')
      .order('date_iso', { ascending: true })
    
    if (error) {
      // PGRST205: Table not found (테이블이 아직 생성되지 않음)
      if (error.code === 'PGRST205') {
        logger.log('[listUpcomingMatches] Table not created yet, returning empty array')
        return []
      }
      throw error
    }
    
    // Convert to app format (snake_case → camelCase)
    const matches = (data || []).map(row => ({
      id: row.id,
      dateISO: row.date_iso,
      location: row.location || {},
      snapshot: row.snapshot || [],
      captainIds: row.captain_ids || [],
      formations: row.formations || [],
      teamCount: row.team_count || 2,
      isDraftMode: row.is_draft_mode || false,
      isDraftComplete: row.is_draft_complete || false,
      draftCompletedAt: row.draft_completed_at,
      totalCost: row.total_cost || 0,
      feesDisabled: row.fees_disabled || false,
      teamColors: row.team_colors || [],
      criterion: row.criterion || 'overall',
      status: row.status || 'pending',
      participantIds: row.participant_ids || [],
      attendeeIds: row.attendee_ids || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    
    return matches
  } catch (error) {
    logger.error('[listUpcomingMatches] Error', error)
    return []
  }
}

/**
 * Add a new upcoming match
 */
export async function addUpcomingMatch(match) {
  try {
    const row = {
      id: match.id,
      date_iso: match.dateISO,
      location: match.location || {},
      snapshot: match.snapshot || [],
      captain_ids: match.captainIds || [],
      formations: match.formations || [],
      team_count: match.teamCount || 2,
      is_draft_mode: match.isDraftMode || false,
      is_draft_complete: match.isDraftComplete || false,
      draft_completed_at: match.draftCompletedAt || null,
      total_cost: match.totalCost || 0,
      fees_disabled: match.feesDisabled || false,
      team_colors: match.teamColors || [],
      criterion: match.criterion || 'overall',
      status: match.status || 'pending',
      participant_ids: match.participantIds || match.attendeeIds || [],
      attendee_ids: match.attendeeIds || match.participantIds || [],
    }
    
    const { data, error } = await supabase
      .from('upcoming_matches')
      .insert([row])
      .select()
      .single()
    
    if (error) throw error
    
    // Return in app format
    return {
      id: data.id,
      dateISO: data.date_iso,
      location: data.location,
      snapshot: data.snapshot,
      captainIds: data.captain_ids,
      formations: data.formations,
      teamCount: data.team_count,
      isDraftMode: data.is_draft_mode,
      isDraftComplete: data.is_draft_complete,
      draftCompletedAt: data.draft_completed_at,
      totalCost: data.total_cost,
      feesDisabled: data.fees_disabled,
      teamColors: data.team_colors,
      criterion: data.criterion,
      status: data.status,
      participantIds: data.participant_ids,
      attendeeIds: data.attendee_ids,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  } catch (error) {
    logger.error('[addUpcomingMatch] Error', error)
    throw error
  }
}

/**
 * Update an upcoming match
 */
export async function updateUpcomingMatch(id, patch) {
  try {
    // Convert camelCase to snake_case
    const updates = {}
    if (patch.dateISO !== undefined) updates.date_iso = patch.dateISO
    if (patch.location !== undefined) updates.location = patch.location
    if (patch.snapshot !== undefined) updates.snapshot = patch.snapshot
    if (patch.captainIds !== undefined) updates.captain_ids = patch.captainIds
    if (patch.formations !== undefined) updates.formations = patch.formations
    if (patch.teamCount !== undefined) updates.team_count = patch.teamCount
    if (patch.isDraftMode !== undefined) updates.is_draft_mode = patch.isDraftMode
    if (patch.isDraftComplete !== undefined) updates.is_draft_complete = patch.isDraftComplete
    if (patch.draftCompletedAt !== undefined) updates.draft_completed_at = patch.draftCompletedAt
    if (patch.totalCost !== undefined) updates.total_cost = patch.totalCost
    if (patch.feesDisabled !== undefined) updates.fees_disabled = patch.feesDisabled
    if (patch.teamColors !== undefined) updates.team_colors = patch.teamColors
    if (patch.criterion !== undefined) updates.criterion = patch.criterion
    if (patch.status !== undefined) updates.status = patch.status
    if (patch.participantIds !== undefined) updates.participant_ids = patch.participantIds
    if (patch.attendeeIds !== undefined) updates.attendee_ids = patch.attendeeIds
    
    const { data, error } = await supabase
      .from('upcoming_matches')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    // Return in app format
    return {
      id: data.id,
      dateISO: data.date_iso,
      location: data.location,
      snapshot: data.snapshot,
      captainIds: data.captain_ids,
      formations: data.formations,
      teamCount: data.team_count,
      isDraftMode: data.is_draft_mode,
      isDraftComplete: data.is_draft_complete,
      draftCompletedAt: data.draft_completed_at,
      totalCost: data.total_cost,
      feesDisabled: data.fees_disabled,
      teamColors: data.team_colors,
      criterion: data.criterion,
      status: data.status,
      participantIds: data.participant_ids,
      attendeeIds: data.attendee_ids,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  } catch (error) {
    logger.error('[updateUpcomingMatch] Error', error)
    throw error
  }
}

/**
 * Delete an upcoming match
 */
export async function deleteUpcomingMatch(id) {
  try {
    const { error } = await supabase
      .from('upcoming_matches')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    return { success: true }
  } catch (error) {
    logger.error('[deleteUpcomingMatch] Error', error)
    throw error
  }
}

/**
 * Subscribe to upcoming matches changes
 */
export function subscribeUpcomingMatches(callback) {
  const channel = supabase
    .channel('upcoming_matches_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'upcoming_matches' },
      async () => {
        const matches = await listUpcomingMatches()
        callback(matches)
      }
    )
    .subscribe()
  
  return () => {
    channel.unsubscribe()
  }
}
