// src/services/membership.service.js
import { supabase } from '../lib/supabaseClient'

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
      console.error('❌ 멤버십 설정 조회 실패:', error)
      return []
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

    return mappedData
  } catch (err) {
    console.error('❌ 멤버십 설정 조회 오류:', err)
    return []
  }
}

/**
 * 멤버십 설정 추가
 */
export async function addMembershipSetting(membership) {
  try {
    const { data, error } = await supabase
      .from('membership_settings')
      .insert([membership])
      .select()
      .single()

    if (error) {
      console.error('❌ 멤버십 추가 실패:', error)
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
    console.error('❌ 멤버십 추가 오류:', err)
    throw err
  }
}

/**
 * 멤버십 설정 수정
 */
export async function updateMembershipSetting(id, updates) {
  try {
    const { data, error } = await supabase
      .from('membership_settings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ 멤버십 수정 실패:', error)
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
    console.error('❌ 멤버십 수정 오류:', err)
    throw err
  }
}

/**
 * 멤버십 설정 삭제
 */
export async function deleteMembershipSetting(id) {
  try {
    const { error } = await supabase
      .from('membership_settings')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ 멤버십 삭제 실패:', error)
      throw error
    }

    return true
  } catch (err) {
    console.error('❌ 멤버십 삭제 오류:', err)
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
        console.log('🔄 멤버십 설정 변경 감지:', payload)
        callback(payload)
      }
    )
    .subscribe()

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
