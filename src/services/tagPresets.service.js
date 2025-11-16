// src/services/tagPresets.service.js
// Tag Presets CRUD operations (Supabase table)

import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

/**
 * List all tag presets, sorted by sort_order
 */
export async function listTagPresets() {
  try {
    const { data, error } = await supabase
      .from('tag_presets')
      .select('*')
      .order('sort_order', { ascending: true })
    
    if (error) {
      // PGRST205: Table not found (테이블이 아직 생성되지 않음)
      if (error.code === 'PGRST205') {
        logger.log('[listTagPresets] Table not created yet, returning empty array')
        return []
      }
      throw error
    }
    
    // Convert to app format
    const presets = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      sortOrder: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    
    return presets
  } catch (error) {
    logger.error('[listTagPresets] Error', error)
    return []
  }
}

/**
 * Add a new tag preset
 */
export async function addTagPreset(preset) {
  try {
    const row = {
      id: preset.id || crypto.randomUUID(),
      name: preset.name,
      color: preset.color || 'blue',
      sort_order: preset.sortOrder || 0,
    }
    
    const { data, error } = await supabase
      .from('tag_presets')
      .insert([row])
      .select()
      .single()
    
    if (error) throw error
    
    return {
      id: data.id,
      name: data.name,
      color: data.color,
      sortOrder: data.sort_order,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  } catch (error) {
    logger.error('[addTagPreset] Error', error)
    throw error
  }
}

/**
 * Update a tag preset
 */
export async function updateTagPreset(id, patch) {
  try {
    const updates = {}
    if (patch.name !== undefined) updates.name = patch.name
    if (patch.color !== undefined) updates.color = patch.color
    if (patch.sortOrder !== undefined) updates.sort_order = patch.sortOrder
    
    const { data, error } = await supabase
      .from('tag_presets')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    return {
      id: data.id,
      name: data.name,
      color: data.color,
      sortOrder: data.sort_order,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  } catch (error) {
    logger.error('[updateTagPreset] Error', error)
    throw error
  }
}

/**
 * Delete a tag preset
 */
export async function deleteTagPreset(id) {
  try {
    const { error } = await supabase
      .from('tag_presets')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    return { success: true }
  } catch (error) {
    logger.error('[deleteTagPreset] Error', error)
    throw error
  }
}

/**
 * Subscribe to tag presets changes
 */
export function subscribeTagPresets(callback) {
  const channel = supabase
    .channel('tag_presets_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tag_presets' },
      async () => {
        const presets = await listTagPresets()
        callback(presets)
      }
    )
    .subscribe()
  
  return () => {
    channel.unsubscribe()
  }
}

/**
 * Bulk save tag presets (replace all)
 */
export async function saveAllTagPresets(presets) {
  try {
    // Delete all existing presets first
    await supabase.from('tag_presets').delete().neq('id', '')
    
    // Insert new presets
    if (presets.length === 0) {
      return []
    }
    
    const rows = presets.map((preset, index) => ({
      id: preset.id || crypto.randomUUID(),
      name: preset.name,
      color: preset.color || 'blue',
      sort_order: preset.sortOrder !== undefined ? preset.sortOrder : index,
    }))
    
    const { data, error } = await supabase
      .from('tag_presets')
      .insert(rows)
      .select()
    
    if (error) throw error
    
    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      sortOrder: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
  } catch (error) {
    logger.error('[saveAllTagPresets] Error', error)
    throw error
  }
}
