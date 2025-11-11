// src/services/matches.service.js
// Match 데이터를 Supabase에 저장/로드하는 서비스
// user_id (개인) 또는 room_id (팀) 기반으로 동작

import { supabase } from '../lib/supabaseClient'
import { TEAM_CONFIG } from '../lib/teamConfig'
import { getCurrentUser } from '../lib/auth'
import { logger } from '../lib/logger'

const ROOM_ID = `${TEAM_CONFIG.shortName}-lite-room-1`
const LS_CACHE_MATCHES = 'sfm:cache:matches'

// Supabase DB 컬럼명 → 앱 내부 필드명 변환
// 주의: matches 테이블은 camelCase 컬럼명 사용 (dateISO, attendeeIds 등)
function toAppFormat(row) {
  // videos 배열 파싱: JSONB에서 문자열로 저장된 경우 파싱
  let videos = row.videos || []
  if (Array.isArray(videos)) {
    videos = videos.map(v => {
      if (typeof v === 'string') {
        try {
          return JSON.parse(v)
        } catch {
          return v
        }
      }
      return v
    })
  }

  return {
    id: row.id,
    dateISO: row.dateISO || row.date_iso, // camelCase 우선
    attendeeIds: row.attendeeIds || row.attendee_ids || [],
    criterion: row.criterion || 'overall',
    teamCount: row.teamCount || row.team_count || 2,
    location: row.location || null,
    mode: row.mode || '7v7',
    snapshot: row.snapshot || {},
    board: row.board || [],
    formations: row.formations || [],
    selectionMode: row.selectionMode || row.selection_mode || 'manual',
    locked: row.locked || false,
    videos: videos,
    teamIds: row.teamids || row.teamIds || [], // 주의: 테이블은 teamids (소문자)
    stats: row.stats || {}, // 골/어시 기록
    draft: row.draft || {}, // Draft 데이터 (선수승점, 주장승점 등)
    quarterScores: row.quarterScores || row.quarter_scores || null, // 쿼터 점수
    teamColors: row.teamColors || row.team_colors || null, // 팀 색상 설정
    fees: row.fees || null, // 📊 비용 정보 추가
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// 앱 내부 필드명 → Supabase DB 컬럼명 변환
// 주의: matches 테이블은 camelCase 컬럼명 사용
function toDbFormat(match, userId = null) {
  const payload = {
    id: match.id, // ID 보존 (마이그레이션 시 필수)
    room_id: ROOM_ID,
  }
  
  // user_id 설정 (있으면 포함)
  if (userId) {
    payload.user_id = userId
  }
  
  return {
    ...payload,
    dateISO: match.dateISO ?? null,
    attendeeIds: match.attendeeIds ?? [],
    criterion: match.criterion ?? 'overall',
    teamCount: match.teamCount ?? 2,
    location: match.location ?? null,
    mode: match.mode ?? '7v7',
    snapshot: match.snapshot ?? {},
    board: match.board ?? [],
    formations: match.formations ?? [],
    selectionMode: match.selectionMode ?? 'manual',
    locked: !!match.locked,
    videos: match.videos ?? [],
    teamids: match.teamIds ?? [], // 주의: 테이블 컬럼은 teamids (소문자)
    stats: match.stats ?? {}, // 골/어시 기록
    draft: match.draft ?? {}, // Draft 데이터 (선수승점, 주장승점 등)
    quarterScores: match.quarterScores ?? null, // 쿼터 점수
    teamColors: match.teamColors ?? null, // 팀 색상 설정
    fees: match.fees ?? null, // 📊 비용 정보 추가
  }
}

export async function saveMatchToDB(match) {
  try {
    const user = await getCurrentUser()
    const userId = user?.id || null
    
    const payload = toDbFormat(match, userId)
    const { data, error } = await supabase
      .from('matches')
      .insert(payload)
      .select('*')
      .single()
    
    if (error) throw error
    return toAppFormat(data)
  } catch (e) {
    logger.error('[saveMatchToDB] failed', e)
    throw e
  }
}

export async function updateMatchInDB(matchId, patch) {
  try {
    const payload = {}
    
    // camelCase 컬럼명 사용
    if ('dateISO' in patch) payload.dateISO = patch.dateISO
    if ('attendeeIds' in patch) payload.attendeeIds = patch.attendeeIds
    if ('criterion' in patch) payload.criterion = patch.criterion
    if ('teamCount' in patch) payload.teamCount = patch.teamCount
    if ('location' in patch) payload.location = patch.location
    if ('mode' in patch) payload.mode = patch.mode
    if ('snapshot' in patch) payload.snapshot = patch.snapshot
    if ('board' in patch) payload.board = patch.board
    if ('formations' in patch) payload.formations = patch.formations
    if ('selectionMode' in patch) payload.selectionMode = patch.selectionMode
    if ('locked' in patch) payload.locked = !!patch.locked
    if ('videos' in patch) payload.videos = patch.videos
    if ('teamIds' in patch) payload.teamids = patch.teamIds // 주의: 소문자 teamids
    if ('stats' in patch) payload.stats = patch.stats // 골/어시 기록
    if ('draft' in patch) payload.draft = patch.draft // Draft 데이터
    if ('quarterScores' in patch) payload.quarterScores = patch.quarterScores // 쿼터 점수
    if ('teamColors' in patch) payload.teamColors = patch.teamColors // 팀 색상 설정
    if ('fees' in patch) payload.fees = patch.fees // 📊 비용 정보 추가
    
    payload.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('matches')
      .update(payload)
      .eq('id', matchId)
      .eq('room_id', ROOM_ID)
      .select('*')
      .single()

    if (error) throw error
    return toAppFormat(data)
  } catch (e) {
    logger.error('[updateMatchInDB] failed', e)
    throw e
  }
}

export async function deleteMatchFromDB(matchId) {
  try {
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', matchId)
      .eq('room_id', ROOM_ID)
    
    if (error) throw error
    return true
  } catch (e) {
    logger.error('[deleteMatchFromDB] failed', e)
    throw e
  }
}

export async function listMatchesFromDB() {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('room_id', ROOM_ID)
      .order('dateISO', { ascending: false })
    
    if (error) throw error
    
    const matches = (data || []).map(toAppFormat)
    
    // 성공 시 캐시에 저장
    try {
      localStorage.setItem(LS_CACHE_MATCHES, JSON.stringify(matches))
    } catch (e) {
      logger.warn('[listMatchesFromDB] Failed to cache', e)
    }
    
    return matches
  } catch (e) {
    logger.error('[listMatchesFromDB] Supabase error, trying cache', e)
    
    // 오프라인 폴백: 캐시에서 읽기
    try {
      const cached = localStorage.getItem(LS_CACHE_MATCHES)
      if (cached) {
        logger.log('[listMatchesFromDB] Using cached data')
        return JSON.parse(cached)
      }
    } catch (err) {
      logger.error('[listMatchesFromDB] Cache parse error', err)
    }
    
    // 캐시도 없으면 빈 배열
    logger.warn('[listMatchesFromDB] No cache available')
    return []
  }
}

// Matches 실시간 구독
export function subscribeMatches(callback) {
  const channel = supabase
    .channel('matches_changes')
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'matches',
        filter: `room_id=eq.${ROOM_ID}`
      },
      async () => {
        try {
          const matches = await listMatchesFromDB()
          callback(matches)
        } catch (e) {
          logger.error('[subscribeMatches] reload failed', e)
        }
      }
    )
    .subscribe()

  return () => {
    try { supabase.removeChannel?.(channel) } catch {}
  }
}
