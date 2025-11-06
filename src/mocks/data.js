// Mock 데이터 (sessionStorage에 영구 저장됨)
// 포트 재시작할 때만 리셋, 페이지 새로고침해도 유지됨
export let mockPlayers = []
export let mockMatches = []

// sessionStorage에서 저장된 Mock 데이터 불러오기
function loadMockFromSession() {
  try {
    const stored = sessionStorage.getItem('mock_data')
    if (stored) {
      const data = JSON.parse(stored)
      mockPlayers = data.players || []
      mockMatches = data.matches || []
      console.log('✨ SessionStorage에서 Mock 데이터 복구됨')
      console.log(`   - 선수: ${mockPlayers.length}명, 매치: ${mockMatches.length}개`)
      return true
    }
  } catch (e) {
    console.warn('⚠️  SessionStorage 복구 실패:', e.message)
  }
  return false
}

// sessionStorage에 Mock 데이터 저장
function saveMockToSession() {
  try {
    const data = {
      players: mockPlayers,
      matches: mockMatches,
      timestamp: new Date().toISOString()
    }
    sessionStorage.setItem('mock_data', JSON.stringify(data))
  } catch (e) {
    console.warn('⚠️  SessionStorage 저장 실패:', e.message)
  }
}

// 매 30초마다 자동 저장
setInterval(saveMockToSession, 30000)
export let mockVisitLogs = [
  {
    id: 'mock-visit-1',
    room_id: 'semihan-lite-room-1',
    visitor_id: 'mock-visitor-1',
    ip_address: '127.0.0.1',
    user_agent: 'Mock Browser',
    device_type: 'Desktop',
    browser: 'Chrome',
    os: 'macOS',
    phone_model: null,
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'mock-visit-2',
    room_id: 'semihan-lite-room-1',
    visitor_id: 'mock-visitor-2',
    ip_address: '127.0.0.1',
    user_agent: 'Mock Mobile Browser',
    device_type: 'Mobile',
    browser: 'Safari',
    os: 'iOS',
    phone_model: 'iPhone 14',
    created_at: new Date(Date.now() - 1800000).toISOString()
  }
]

// AppDB는 곧 retire 예정이지만, 검증 기간 동안 기본 구조 제공
export const mockAppDB = {
  semihan: {
    upcomingMatches: [],
    tagPresets: []
  },
  dksc: {
    upcomingMatches: [],
    tagPresets: []
  }
}

// Prod DB에서 데이터 로드 (Read-Only) + Mock으로 전환
// teamId: 'semihan' | 'dksc' (URL 쿼리 파라미터 또는 환경에서 결정)
export async function loadProdDataToMock(teamId = 'semihan') {
  try {
    console.log(`📥 Prod DB에서 ${teamId.toUpperCase()} 데이터 로드 중... (서버 시작 시마다 최신 데이터 로드)`)
    
    // 항상 Prod에서 최신 데이터 로드 (서버 재시작할 때마다)
    const { supabase } = await import('../lib/supabaseClient')
    
    // 1️⃣ Players 테이블에서 직접 로드
    console.log('🔄 Players 테이블 조회 중...')
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('*')
      .limit(1000)
    
    if (playersError) {
      console.warn('⚠️ Players 조회 실패:', playersError.message)
    } else if (players && players.length > 0) {
      mockPlayers.splice(0, mockPlayers.length, ...players)
      console.log(`✅ ${players.length}명의 선수 로드됨`)
    } else {
      console.log('ℹ️ 저장된 선수가 없습니다.')
    }
    
    // 2️⃣ Matches 테이블에서 직접 로드
    console.log('🔄 Matches 테이블 조회 중...')
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('*')
      .limit(1000)
    
    if (matchesError) {
      console.warn('⚠️ Matches 조회 실패:', matchesError.message)
    } else if (matches && matches.length > 0) {
      mockMatches.splice(0, mockMatches.length, ...matches)
      console.log(`✅ ${matches.length}개의 매치 로드됨`)
    } else {
      console.log('ℹ️ 저장된 매치가 없습니다.')
    }
    
    // 3️⃣ AppDB에서 설정 로드 (정확한 ID 형식: ${teamId}-lite-room-1)
    console.log(`� AppDB (${teamId}) 조회 중...`)
    
    // AppDB의 실제 ID 형식: "semihan-lite-room-1", "dksc-lite-room-1" 등
    const correctAppDbId = `${teamId}-lite-room-1`
    
    try {
      const { data: appdbData, error: appdbError } = await supabase
        .from('appdb')
        .select('data')
        .eq('id', correctAppDbId)
        .single()
      
      if (!appdbError && appdbData) {
        console.log(`✅ AppDB 찾음 (ID: ${correctAppDbId})`)
        
        try {
          const parsedData = typeof appdbData.data === 'string' 
            ? JSON.parse(appdbData.data) 
            : appdbData.data
          
          // upcomingMatches, tagPresets만 가져오기 (검증 기간 동안만)
          if (parsedData?.upcomingMatches) {
            mockAppDB[teamId].upcomingMatches = parsedData.upcomingMatches
            console.log(`✅ ${parsedData.upcomingMatches.length}개의 예정된 매치 로드됨`)
          }
          if (parsedData?.tagPresets) {
            mockAppDB[teamId].tagPresets = parsedData.tagPresets
            console.log(`✅ ${parsedData.tagPresets.length}개의 태그 프리셋 로드됨`)
          }
        } catch (e) {
          console.warn('⚠️ AppDB 파싱 실패:', e.message)
        }
      } else {
        console.log('ℹ️ AppDB 데이터 없음 (정상 - 곧 retire 예정)')
      }
    } catch (err) {
      console.warn('⚠️ AppDB 조회 오류:', err.message)
    }
    
    console.log('✨ Prod DB에서 데이터 로드 완료!')
    console.log('   📊 현재 상태:')
    console.log('      - 선수:', mockPlayers.length, '명')
    console.log('      - 매치:', mockMatches.length, '개')
    console.log('   🔒 이후의 모든 변경사항은 Mock(로컬 메모리)에만 저장됩니다.')
    console.log('   � 페이지 새로고침해도 변경사항 유지됩니다.')
    console.log('   🔄 서버를 재시작하면 Prod 데이터로 리셋됩니다.')
    console.log('   ⚠️  AppDB는 검증 기간 종료 후 retire 예정')
    
    // SessionStorage에 저장 (페이지 새로고침 후에도 유지)
    saveMockToSession()
    
    return true
  } catch (error) {
    console.error('❌ Prod DB 데이터 로드 실패:', error.message)
    console.log('💡 기본 Mock 데이터로 계속 진행합니다.')
    return false
  }
}
