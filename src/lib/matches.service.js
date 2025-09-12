// src/lib/matches.service.js
import { supabase } from './supabaseClient'

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) throw new Error('로그인이 필요합니다.')
  return data.user
}

export async function saveMatch(match) {
  const user = await requireUser()

  const snapshot_str = match.snapshot_str ?? JSON.stringify(match.snapshot ?? [])
  const board_str     = match.board_str     ?? JSON.stringify(match.board ?? [])
  const formations_str= match.formations_str?? JSON.stringify(match.formations ?? [])

  const payload = {
    user_id: user.id,
    date_iso: match.dateISO ?? null,
    attendee_ids: match.attendeeIds ?? [],
    criterion: match.criterion ?? 'overall',
    team_count: match.teamCount ?? 2,
    location: match.location ?? null,
    mode: match.mode ?? '7v7',
    snapshot: match.snapshot ?? [],
    board: match.board ?? [],
    formations: match.formations ?? [],
    selection_mode: match.selectionMode ?? 'manual',
    locked: !!match.locked,
    videos: match.videos ?? [],
    snapshot_str,
    board_str,
    formations_str,
  }

  const { data, error } = await supabase.from('matches').insert(payload).select('*').single()
  if (error) throw error
  return data
}

export async function updateMatch(matchId, patch) {
  const user = await requireUser()
  const payload = {}

  if ('dateISO' in patch) payload.date_iso = patch.dateISO
  if ('attendeeIds' in patch) payload.attendee_ids = patch.attendeeIds
  if ('criterion' in patch) payload.criterion = patch.criterion
  if ('teamCount' in patch) payload.team_count = patch.teamCount
  if ('location' in patch) payload.location = patch.location
  if ('mode' in patch) payload.mode = patch.mode
  if ('snapshot' in patch) payload.snapshot = patch.snapshot
  if ('board' in patch) payload.board = patch.board
  if ('formations' in patch) payload.formations = patch.formations
  if ('selectionMode' in patch) payload.selection_mode = patch.selectionMode
  if ('locked' in patch) payload.locked = !!patch.locked
  if ('videos' in patch) payload.videos = patch.videos

  if ('snapshot' in patch) payload.snapshot_str = JSON.stringify(patch.snapshot ?? [])
  if ('board'  in patch) payload.board_str     = JSON.stringify(patch.board ?? [])
  if ('formations' in patch) payload.formations_str = JSON.stringify(patch.formations ?? [])

  const { data, error } = await supabase
    .from('matches')
    .update(payload)
    .eq('id', matchId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function deleteMatch(matchId) {
  const user = await requireUser()
  const { error } = await supabase.from('matches').delete().eq('id', matchId).eq('user_id', user.id)
  if (error) throw error
  return true
}

export async function listMatches() {
  const user = await requireUser()
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
