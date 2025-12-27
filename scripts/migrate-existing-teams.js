/**
 * 기존 2팀 데이터를 멀티테넌트 구조로 마이그레이션
 * 
 * 사용법:
 * 1. .env.migration 파일에 환경변수 설정
 * 2. node scripts/migrate-existing-teams.js
 * 
 * 주의: 드라이런 모드로 먼저 테스트 후 실제 마이그레이션 진행
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

// =============================================================================
// 설정
// =============================================================================

const DRY_RUN = process.env.DRY_RUN !== 'false' // 기본값: true (안전 모드)

// 기존 팀 설정
const OLD_TEAMS = [
  {
    name: '한강 레인저스',
    subdomain: 'hangang-rangers',
    oldSupabaseUrl: process.env.OLD_HANGANG_SUPABASE_URL,
    oldSupabaseKey: process.env.OLD_HANGANG_SUPABASE_KEY,
    adminEmail: process.env.HANGANG_ADMIN_EMAIL,
  },
  {
    name: '진도FC',
    subdomain: 'jindo-fc',
    oldSupabaseUrl: process.env.OLD_JINDO_SUPABASE_URL,
    oldSupabaseKey: process.env.OLD_JINDO_SUPABASE_KEY,
    adminEmail: process.env.JINDO_ADMIN_EMAIL,
  }
]

// 새 멀티테넌트 Supabase
const newSupabase = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_KEY // Service Role Key 필요!
)

// =============================================================================
// 유틸리티 함수
// =============================================================================

function log(message, data = null) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }
}

function logError(message, error) {
  console.error(`❌ ${message}:`, error.message)
  if (error.details) console.error('Details:', error.details)
  if (error.hint) console.error('Hint:', error.hint)
}

// =============================================================================
// 마이그레이션 함수
// =============================================================================

async function migrateTeam(teamConfig) {
  log(`\n${'='.repeat(80)}`)
  log(`🚀 시작: ${teamConfig.name} 마이그레이션`)
  log(`${'='.repeat(80)}`)

  const stats = {
    teamName: teamConfig.name,
    players: 0,
    matches: 0,
    upcomingMatches: 0,
    momVotes: 0,
    badges: 0,
    transactions: 0,
    errors: []
  }

  try {
    // 1. 기존 데이터베이스 연결
    log(`📡 연결 중: ${teamConfig.name} (${teamConfig.oldSupabaseUrl})`)
    const oldSupabase = createClient(
      teamConfig.oldSupabaseUrl,
      teamConfig.oldSupabaseKey
    )

    // 2. 새 팀 생성
    log(`📝 팀 생성: ${teamConfig.name}`)
    let teamId

    if (!DRY_RUN) {
      const { data: team, error: teamError } = await newSupabase
        .from('teams')
        .insert({
          name: teamConfig.name,
          subdomain: teamConfig.subdomain,
          slug: teamConfig.subdomain,
          plan: 'pro', // 기존 팀은 Pro로 시작
          status: 'active'
        })
        .select()
        .single()

      if (teamError) {
        logError('팀 생성 실패', teamError)
        stats.errors.push(`팀 생성 실패: ${teamError.message}`)
        return stats
      }

      teamId = team.id
      log(`✅ 팀 생성 완료: ${teamId}`)
    } else {
      teamId = 'dry-run-uuid'
      log(`🔍 [DRY RUN] 팀 생성 시뮬레이션`)
    }

    // 3. Settings 마이그레이션
    log(`\n📊 Settings 마이그레이션...`)
    const { data: oldSettings, error: settingsError } = await oldSupabase
      .from('settings')
      .select('*')
      .single()

    if (oldSettings) {
      log(`찾은 설정: ${JSON.stringify(oldSettings)}`)
      if (!DRY_RUN) {
        const { error } = await newSupabase
          .from('settings')
          .insert({
            team_id: teamId,
            team_name: oldSettings.team_name || teamConfig.name,
            season: oldSettings.season || '2024/25',
            team_colors: oldSettings.team_colors || null
          })

        if (error) {
          logError('Settings 마이그레이션 실패', error)
          stats.errors.push(`Settings: ${error.message}`)
        } else {
          log(`✅ Settings 마이그레이션 완료`)
        }
      }
    }

    // 4. Membership Settings 마이그레이션
    log(`\n💳 Membership Settings 마이그레이션...`)
    const { data: oldMembership } = await oldSupabase
      .from('membership_settings')
      .select('*')
      .single()

    if (oldMembership) {
      log(`찾은 멤버십 설정: enabled=${oldMembership.enabled}`)
      if (!DRY_RUN) {
        await newSupabase
          .from('membership_settings')
          .insert({
            team_id: teamId,
            enabled: oldMembership.enabled || false,
            monthly_fee: oldMembership.monthly_fee || 0,
            payment_day: oldMembership.payment_day || 1
          })
        log(`✅ Membership Settings 마이그레이션 완료`)
      }
    }

    // 5. Players 마이그레이션
    log(`\n👥 Players 마이그레이션...`)
    const { data: oldPlayers, error: playersError } = await oldSupabase
      .from('players')
      .select('*')

    if (oldPlayers && oldPlayers.length > 0) {
      log(`찾은 선수: ${oldPlayers.length}명`)
      stats.players = oldPlayers.length

      if (!DRY_RUN) {
        const playersToInsert = oldPlayers.map(player => ({
          id: player.id, // 기존 UUID 유지
          team_id: teamId,
          name: player.name,
          number: player.number,
          position: player.position,
          phone: player.phone,
          email: player.email,
          status: player.status || 'active',
          join_date: player.join_date,
          membership_status: player.membership_status,
          membership_amount: player.membership_amount,
          last_payment_date: player.last_payment_date,
          total_goals: player.total_goals || 0,
          total_assists: player.total_assists || 0,
          total_matches: player.total_matches || 0,
          created_at: player.created_at,
          updated_at: player.updated_at || player.created_at
        }))

        // 배치로 나눠서 삽입 (1000개씩)
        const batchSize = 1000
        for (let i = 0; i < playersToInsert.length; i += batchSize) {
          const batch = playersToInsert.slice(i, i + batchSize)
          const { error } = await newSupabase
            .from('players')
            .insert(batch)

          if (error) {
            logError(`Players 배치 ${i}-${i + batch.length} 실패`, error)
            stats.errors.push(`Players batch: ${error.message}`)
          } else {
            log(`✅ Players ${i + 1}-${Math.min(i + batch.length, playersToInsert.length)} 삽입 완료`)
          }
        }
      } else {
        log(`🔍 [DRY RUN] ${oldPlayers.length}명의 선수 마이그레이션 시뮬레이션`)
      }
    }

    // 6. Matches 마이그레이션
    log(`\n⚽ Matches 마이그레이션...`)
    const { data: oldMatches } = await oldSupabase
      .from('matches')
      .select('*')

    if (oldMatches && oldMatches.length > 0) {
      log(`찾은 매치: ${oldMatches.length}개`)
      stats.matches = oldMatches.length

      if (!DRY_RUN) {
        const matchesToInsert = oldMatches.map(match => ({
          id: match.id,
          team_id: teamId,
          opponent: match.opponent,
          date: match.date,
          time: match.time,
          location: match.location,
          match_type: match.match_type || 'league',
          team_score: match.team_score || 0,
          opponent_score: match.opponent_score || 0,
          quarter_scores: match.quarter_scores,
          status: match.status || 'completed',
          is_void: match.is_void || false,
          formation: match.formation,
          lineup: match.lineup,
          stats: match.stats,
          notes: match.notes,
          created_at: match.created_at,
          updated_at: match.updated_at || match.created_at
        }))

        const batchSize = 1000
        for (let i = 0; i < matchesToInsert.length; i += batchSize) {
          const batch = matchesToInsert.slice(i, i + batchSize)
          const { error } = await newSupabase
            .from('matches')
            .insert(batch)

          if (error) {
            logError(`Matches 배치 ${i}-${i + batch.length} 실패`, error)
            stats.errors.push(`Matches batch: ${error.message}`)
          } else {
            log(`✅ Matches ${i + 1}-${Math.min(i + batch.length, matchesToInsert.length)} 삽입 완료`)
          }
        }
      }
    }

    // 7. Upcoming Matches 마이그레이션
    log(`\n📅 Upcoming Matches 마이그레이션...`)
    const { data: oldUpcoming } = await oldSupabase
      .from('upcoming_matches')
      .select('*')

    if (oldUpcoming && oldUpcoming.length > 0) {
      log(`찾은 예정 매치: ${oldUpcoming.length}개`)
      stats.upcomingMatches = oldUpcoming.length

      if (!DRY_RUN) {
        const upcomingToInsert = oldUpcoming.map(match => ({
          id: match.id,
          team_id: teamId,
          opponent: match.opponent,
          date: match.date,
          time: match.time,
          location: match.location,
          notes: match.notes,
          attendance_enabled: match.attendance_enabled || false,
          rsvp_deadline: match.rsvp_deadline,
          created_at: match.created_at,
          updated_at: match.updated_at || match.created_at
        }))

        const { error } = await newSupabase
          .from('upcoming_matches')
          .insert(upcomingToInsert)

        if (error) {
          logError('Upcoming Matches 마이그레이션 실패', error)
          stats.errors.push(`Upcoming Matches: ${error.message}`)
        } else {
          log(`✅ Upcoming Matches 마이그레이션 완료`)
        }
      }
    }

    // 8. MOM Votes 마이그레이션
    log(`\n🏆 MOM Votes 마이그레이션...`)
    const { data: oldMomVotes } = await oldSupabase
      .from('mom_votes')
      .select('*')

    if (oldMomVotes && oldMomVotes.length > 0) {
      log(`찾은 MOM 투표: ${oldMomVotes.length}개`)
      stats.momVotes = oldMomVotes.length

      if (!DRY_RUN) {
        const votesToInsert = oldMomVotes.map(vote => ({
          team_id: teamId,
          match_id: vote.match_id,
          player_id: vote.player_id,
          voter_name: vote.voter_name,
          voted_at: vote.voted_at || new Date().toISOString()
        }))

        const { error } = await newSupabase
          .from('mom_votes')
          .insert(votesToInsert)

        if (error) {
          logError('MOM Votes 마이그레이션 실패', error)
          stats.errors.push(`MOM Votes: ${error.message}`)
        } else {
          log(`✅ MOM Votes 마이그레이션 완료`)
        }
      }
    }

    // 9. Badge System 마이그레이션
    log(`\n🎖️ Badge System 마이그레이션...`)
    const { data: oldBadges } = await oldSupabase
      .from('badge_system')
      .select('*')

    if (oldBadges && oldBadges.length > 0) {
      log(`찾은 배지: ${oldBadges.length}개`)
      stats.badges = oldBadges.length

      if (!DRY_RUN) {
        const badgesToInsert = oldBadges.map(badge => ({
          team_id: teamId,
          player_id: badge.player_id,
          badge_type: badge.badge_type,
          badge_data: badge.badge_data,
          earned_at: badge.earned_at || new Date().toISOString()
        }))

        const { error } = await newSupabase
          .from('badge_system')
          .insert(badgesToInsert)

        if (error) {
          logError('Badge System 마이그레이션 실패', error)
          stats.errors.push(`Badge System: ${error.message}`)
        } else {
          log(`✅ Badge System 마이그레이션 완료`)
        }
      }
    }

    // 10. Accounting 마이그레이션
    log(`\n💰 Accounting 마이그레이션...`)
    const { data: oldTransactions } = await oldSupabase
      .from('accounting_transactions')
      .select('*')

    if (oldTransactions && oldTransactions.length > 0) {
      log(`찾은 거래내역: ${oldTransactions.length}개`)
      stats.transactions = oldTransactions.length

      if (!DRY_RUN) {
        const transactionsToInsert = oldTransactions.map(tx => ({
          team_id: teamId,
          date: tx.date,
          type: tx.type,
          category: tx.category,
          amount: tx.amount,
          description: tx.description,
          player_id: tx.player_id,
          match_id: tx.match_id,
          created_at: tx.created_at,
          updated_at: tx.updated_at || tx.created_at
        }))

        const { error } = await newSupabase
          .from('accounting_transactions')
          .insert(transactionsToInsert)

        if (error) {
          logError('Accounting Transactions 마이그레이션 실패', error)
          stats.errors.push(`Accounting: ${error.message}`)
        } else {
          log(`✅ Accounting Transactions 마이그레이션 완료`)
        }
      }
    }

    // 11. Accounting Categories 마이그레이션
    const { data: oldCategories } = await oldSupabase
      .from('accounting_categories')
      .select('*')

    if (oldCategories && oldCategories.length > 0) {
      log(`찾은 거래 카테고리: ${oldCategories.length}개`)

      if (!DRY_RUN) {
        const categoriesToInsert = oldCategories.map(cat => ({
          team_id: teamId,
          name: cat.name,
          type: cat.type,
          color: cat.color || '#10b981',
          created_at: cat.created_at
        }))

        const { error } = await newSupabase
          .from('accounting_categories')
          .insert(categoriesToInsert)

        if (error) {
          logError('Accounting Categories 마이그레이션 실패', error)
          stats.errors.push(`Categories: ${error.message}`)
        } else {
          log(`✅ Accounting Categories 마이그레이션 완료`)
        }
      }
    }

    // 12. 팀 통계 업데이트
    if (!DRY_RUN) {
      log(`\n📊 팀 통계 업데이트...`)
      const { error } = await newSupabase
        .rpc('update_team_stats', { p_team_id: teamId })

      if (error) {
        logError('팀 통계 업데이트 실패', error)
      } else {
        log(`✅ 팀 통계 업데이트 완료`)
      }
    }

    log(`\n✅ ${teamConfig.name} 마이그레이션 완료!`)
    return stats

  } catch (error) {
    logError(`${teamConfig.name} 마이그레이션 중 오류`, error)
    stats.errors.push(`전체 오류: ${error.message}`)
    return stats
  }
}

// =============================================================================
// 메인 실행
// =============================================================================

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('🚀 멀티테넌트 마이그레이션 스크립트')
  console.log('='.repeat(80))
  console.log(`모드: ${DRY_RUN ? '🔍 DRY RUN (시뮬레이션)' : '⚠️  PRODUCTION (실제 마이그레이션)'}`)
  console.log(`대상 팀: ${OLD_TEAMS.map(t => t.name).join(', ')}`)
  console.log('='.repeat(80) + '\n')

  if (!DRY_RUN) {
    console.log('⚠️  경고: 실제 마이그레이션을 진행합니다!')
    console.log('⚠️  5초 후 시작합니다... (Ctrl+C로 취소)')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  const allStats = []

  for (const teamConfig of OLD_TEAMS) {
    const stats = await migrateTeam(teamConfig)
    allStats.push(stats)
    
    // 팀 간 잠깐 대기 (Rate Limiting 방지)
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // 최종 리포트
  console.log('\n' + '='.repeat(80))
  console.log('📊 마이그레이션 최종 리포트')
  console.log('='.repeat(80))

  allStats.forEach(stats => {
    console.log(`\n팀: ${stats.teamName}`)
    console.log(`  선수: ${stats.players}명`)
    console.log(`  매치: ${stats.matches}개`)
    console.log(`  예정 매치: ${stats.upcomingMatches}개`)
    console.log(`  MOM 투표: ${stats.momVotes}개`)
    console.log(`  배지: ${stats.badges}개`)
    console.log(`  거래내역: ${stats.transactions}개`)
    
    if (stats.errors.length > 0) {
      console.log(`  ❌ 에러: ${stats.errors.length}개`)
      stats.errors.forEach(err => console.log(`    - ${err}`))
    } else {
      console.log(`  ✅ 에러 없음`)
    }
  })

  console.log('\n' + '='.repeat(80))
  console.log(DRY_RUN ? '🔍 DRY RUN 완료' : '✅ 마이그레이션 완료!')
  console.log('='.repeat(80) + '\n')

  if (DRY_RUN) {
    console.log('💡 실제 마이그레이션을 진행하려면:')
    console.log('   DRY_RUN=false node scripts/migrate-existing-teams.js')
  }
}

main().catch(error => {
  console.error('❌ 치명적 오류:', error)
  process.exit(1)
})
