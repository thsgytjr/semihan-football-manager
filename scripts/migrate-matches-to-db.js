// scripts/migrate-matches-to-db.js
// localStorage appdb의 matches 데이터를 Supabase matches 테이블로 마이그레이션

/**
 * 실행 방법:
 * 1. 브라우저 개발자 도구 콘솔에서 실행
 * 2. 또는 App.jsx에서 임시로 호출
 * 
 * 주의사항:
 * - 실행 전 반드시 데이터 백업!
 * - 이미 Supabase에 있는 데이터는 중복되지 않음 (id 기준)
 */

import { loadDB, saveDB } from '../src/services/storage.service'
import { saveMatchToDB, listMatchesFromDB } from '../src/services/matches.service'

export async function migrateMatchesToDB() {
  console.log('🚀 [Migration] Starting matches migration...')
  
  try {
    // 1. localStorage에서 현재 matches 로드
    const appdb = await loadDB()
    const localMatches = appdb.matches || []
    
    console.log(`📦 [Migration] Found ${localMatches.length} matches in localStorage`)
    
    if (localMatches.length === 0) {
      console.log('✅ [Migration] No matches to migrate')
      return { success: true, migrated: 0, skipped: 0, failed: 0 }
    }
    
    // 2. Supabase에서 이미 저장된 matches 확인
    const dbMatches = await listMatchesFromDB()
    const existingIds = new Set(dbMatches.map(m => m.id))
    
    console.log(`🗄️  [Migration] Found ${dbMatches.length} matches already in Supabase`)
    
    // 3. 마이그레이션 실행
    let migrated = 0
    let skipped = 0
    let failed = 0
    
    for (const match of localMatches) {
      if (existingIds.has(match.id)) {
        console.log(`⏭️  [Migration] Skipping ${match.id} (already exists)`)
        skipped++
        continue
      }
      
      try {
        await saveMatchToDB(match)
        console.log(`✅ [Migration] Migrated ${match.id}`)
        migrated++
      } catch (e) {
        console.error(`❌ [Migration] Failed to migrate ${match.id}:`, e)
        failed++
      }
    }
    
    console.log(`
🎉 [Migration] Complete!
   - Migrated: ${migrated}
   - Skipped: ${skipped}
   - Failed: ${failed}
   - Total: ${localMatches.length}
    `)
    
    // 4. 마이그레이션 성공 후 localStorage는 유지 (백업용)
    // 나중에 검증이 끝나면 제거 가능
    
    return { success: true, migrated, skipped, failed }
  } catch (e) {
    console.error('❌ [Migration] Fatal error:', e)
    return { success: false, error: e.message }
  }
}

export async function verifyMigration() {
  console.log('🔍 [Verification] Starting verification...')
  
  try {
    const appdb = await loadDB()
    const localMatches = appdb.matches || []
    const dbMatches = await listMatchesFromDB()
    
    console.log(`📊 [Verification] localStorage: ${localMatches.length} matches`)
    console.log(`📊 [Verification] Supabase: ${dbMatches.length} matches`)
    
    const localIds = new Set(localMatches.map(m => m.id))
    const dbIds = new Set(dbMatches.map(m => m.id))
    
    const missingInDB = localMatches.filter(m => !dbIds.has(m.id))
    const extraInDB = dbMatches.filter(m => !localIds.has(m.id))
    
    if (missingInDB.length > 0) {
      console.warn('⚠️  [Verification] Matches in localStorage but not in Supabase:', missingInDB.map(m => m.id))
    }
    
    if (extraInDB.length > 0) {
      console.log('ℹ️  [Verification] Matches in Supabase but not in localStorage:', extraInDB.map(m => m.id))
    }
    
    if (missingInDB.length === 0) {
      console.log('✅ [Verification] All localStorage matches are in Supabase!')
    }
    
    return {
      success: true,
      localCount: localMatches.length,
      dbCount: dbMatches.length,
      missingInDB: missingInDB.length,
      extraInDB: extraInDB.length,
    }
  } catch (e) {
    console.error('❌ [Verification] Failed:', e)
    return { success: false, error: e.message }
  }
}

// 백업 생성
export async function backupLocalMatches() {
  console.log('💾 [Backup] Creating backup...')
  
  try {
    const appdb = await loadDB()
    const backup = {
      timestamp: new Date().toISOString(),
      matches: appdb.matches || [],
      upcomingMatches: appdb.upcomingMatches || [],
    }
    
    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matches-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    console.log('✅ [Backup] Backup downloaded successfully')
    return { success: true }
  } catch (e) {
    console.error('❌ [Backup] Failed:', e)
    return { success: false, error: e.message }
  }
}
