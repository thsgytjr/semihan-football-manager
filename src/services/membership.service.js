// src/services/membership.service.js
import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

const LS_CACHE_MEMBERSHIP = 'sfm:cache:membership'

/**
 * 모든 멤버십 설정 가져오기
 */
export async function getMembershipSettings() {
  try {
    const { data, error } = await supabase
      .from('membership_settings')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      logger.error('❌ 멤버십 설정 조회 실패:', error)
      throw error
    }

    // DB 필드명을 앱에서 사용하는 필드명으로 변환
    const mappedData = (data || []).map(item => ({
      id: item.id,
      name: item.name,
      badge: item.badge,
      badgeColor: item.badge_color, // badge_color -> badgeColor 변환
      deletable: item.deletable,
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }))

    // 성공 시 캐시에 저장
    try {
      localStorage.setItem(LS_CACHE_MEMBERSHIP, JSON.stringify(mappedData))
    } catch (e) {
      logger.warn('[getMembershipSettings] Failed to cache', e)
    }

    return mappedData
  } catch (err) {
    logger.error('❌ 멤버십 설정 조회 오류, 캐시 시도:', err)
    
    // 오프라인 폴백: 캐시에서 읽기
    try {
      const cached = localStorage.getItem(LS_CACHE_MEMBERSHIP)
      if (cached) {
        logger.log('[getMembershipSettings] Using cached data')
        return JSON.parse(cached)
      }
    } catch (e) {
      logger.error('[getMembershipSettings] Cache parse error', e)
    }
    
    // 캐시도 없으면 빈 배열
    logger.warn('[getMembershipSettings] No cache available')
    return []
  }
}

/**
 * 멤버십 설정 추가
 */
export async function addMembershipSetting(membership) {
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  const { TEAM_CONFIG } = await import('../lib/teamConfig')
  const { supabase: supabaseClient } = await import('../lib/supabaseClient')
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session) {
        logger.warn('[addMembershipSetting] Sandbox mode: Guest write blocked')
        return { ...membership, id: Date.now() }
      }
    } catch (e) {
      logger.warn('[addMembershipSetting] Session check failed, blocking write', e)
      return { ...membership, id: Date.now() }
    }
  }

  try {
    const { data, error } = await supabase
      .from('membership_settings')
      .insert([membership])
      .select()
      .single()

    if (error) {
      logger.error('❌ 멤버십 추가 실패:', error)
      throw error
    }

    // DB 필드명을 앱에서 사용하는 필드명으로 변환
    return {
      id: data.id,
      name: data.name,
      badge: data.badge,
      badgeColor: data.badge_color,
      deletable: data.deletable,
      sortOrder: data.sort_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  } catch (err) {
    logger.error('❌ 멤버십 추가 오류:', err)
    throw err
  }
}

/**
 * 멤버십 설정 수정
 */
export async function updateMembershipSetting(id, updates) {
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  const { TEAM_CONFIG } = await import('../lib/teamConfig')
  const { supabase: supabaseClient } = await import('../lib/supabaseClient')
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session) {
        logger.warn('[updateMembershipSetting] Sandbox mode: Guest write blocked')
        return { id, ...updates }
      }
    } catch (e) {
      logger.warn('[updateMembershipSetting] Session check failed, blocking write', e)
      return { id, ...updates }
    }
  }

  try {
    const { data, error } = await supabase
      .from('membership_settings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('❌ 멤버십 수정 실패:', error)
      throw error
    }

    // DB 필드명을 앱에서 사용하는 필드명으로 변환
    return {
      id: data.id,
      name: data.name,
      badge: data.badge,
      badgeColor: data.badge_color,
      deletable: data.deletable,
      sortOrder: data.sort_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  } catch (err) {
    logger.error('❌ 멤버십 수정 오류:', err)
    throw err
  }
}

/**
 * 멤버십 설정 삭제
 */
export async function deleteMembershipSetting(id) {
  // Sandbox Mode: 게스트는 Supabase 쓰기 금지
  const { TEAM_CONFIG } = await import('../lib/teamConfig')
  const { supabase: supabaseClient } = await import('../lib/supabaseClient')
  if (TEAM_CONFIG.sandboxMode) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session) {
        logger.warn('[deleteMembershipSetting] Sandbox mode: Guest write blocked')
        return true
      }
    } catch (e) {
      logger.warn('[deleteMembershipSetting] Session check failed, blocking write', e)
      return true
    }
  }

  try {
    const { error } = await supabase
      .from('membership_settings')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('❌ 멤버십 삭제 실패:', error)
      throw error
    }

    return true
  } catch (err) {
    logger.error('❌ 멤버십 삭제 오류:', err)
    throw err
  }
}

/**
 * 멤버십 설정 실시간 구독
 */
export function subscribeMembershipSettings(callback) {
  const subscription = supabase
    .channel('membership_settings_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'membership_settings'
      },
      (payload) => {
        callback(payload)
      }
    )

  const subscribePromise = subscription.subscribe()
  if (subscribePromise && typeof subscribePromise.catch === 'function') {
    subscribePromise.catch((err) => logger?.warn?.('[subscribeMembershipSettings] subscribe error', err))
  }

  return () => {
    subscription.unsubscribe()
  }
}

/**
 * 특정 멤버십을 사용하는 선수가 있는지 확인
 */
export async function canDeleteMembership(membershipName, players) {
  const playersUsingMembership = players.filter(p => p.membership === membershipName)
  return {
    canDelete: playersUsingMembership.length === 0,
    count: playersUsingMembership.length,
    players: playersUsingMembership
  }
}
