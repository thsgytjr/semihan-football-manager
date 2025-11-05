// src/lib/dbMigration.js
import { supabase } from './supabaseClient'

/**
 * membership_settings 테이블 존재 확인 및 초기화
 */
export async function initMembershipSettings() {
  try {
    // membership_settings 테이블에서 데이터 조회
    const { data, error } = await supabase
      .from('membership_settings')
      .select('*')
      .limit(1)

    if (error) {
      // 테이블이 없는 경우
      if (error.code === '42P01') {
        console.warn('⚠️ membership_settings 테이블이 없습니다. SQL 스크립트를 실행해주세요.')
        console.warn('📝 scripts/create-membership-settings-table.sql')
        return false
      }
      console.error('❌ membership_settings 조회 실패:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('❌ DB 마이그레이션 오류:', err)
    return false
  }
}

/**
 * 모든 마이그레이션 실행
 */
export async function runMigrations() {
  await initMembershipSettings()
}
