import { http, HttpResponse, delay } from 'msw'
import { mockPlayers, mockMatches, mockVisitLogs, mockAppDB } from './data'
import { logger } from '../lib/logger'

// Mock 인증 상태
let mockAuthSession = null

// SessionStorage 저장 함수
function saveMockData() {
  try {
    const data = {
      players: mockPlayers,
      matches: mockMatches,
      timestamp: new Date().toISOString()
    }
    sessionStorage.setItem('mock_data', JSON.stringify(data))
  } catch (e) {
    logger.warn('⚠️ SessionStorage 저장 실패:', e.message)
  }
}

export const handlers = [
  // ============ Auth API (Supabase) ============
  http.post('*/auth/v1/signin', async ({ request }) => {
    await delay(500)
    // Mock 로그인: 어떤 이메일이든 성공
    const body = await request.json()
    mockAuthSession = {
      user: {
        id: 'mock-user-123',
        email: body.email,
        user_metadata: {}
      },
      session: {
        access_token: 'mock-token-123',
        refresh_token: 'mock-refresh-token-123'
      }
    }
    return HttpResponse.json(mockAuthSession, { status: 200 })
  }),

  http.post('*/auth/v1/signout', async () => {
    await delay(300)
    mockAuthSession = null
    return HttpResponse.json({ ok: true })
  }),

  http.get('*/auth/v1/user', async () => {
    await delay(300)
    if (mockAuthSession) {
      return HttpResponse.json(mockAuthSession.user)
    }
    return HttpResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }),

  http.get('*/auth/v1/session', async () => {
    await delay(300)
    if (mockAuthSession) {
      return HttpResponse.json(mockAuthSession.session)
    }
    return HttpResponse.json(null)
  }),

  // ============ Players API ============
  http.get('*/rest/v1/players', async () => {
    await delay(300)
    return HttpResponse.json(mockPlayers)
  }),

  http.post('*/rest/v1/players', async ({ request }) => {
    await delay(300)
    const body = await request.json()
    const newPlayer = {
      ...body,
      id: body.id || `player-${Date.now()}`,
      lastUpdated: new Date().toISOString()
    }
    mockPlayers.push(newPlayer)
    saveMockData()
    return HttpResponse.json(newPlayer, { status: 201 })
  }),

  http.patch('*/rest/v1/players*', async ({ request }) => {
    await delay(300)
    const body = await request.json()
    const index = mockPlayers.findIndex(p => p.id === body.id)
    if (index !== -1) {
      mockPlayers[index] = { ...mockPlayers[index], ...body, lastUpdated: new Date().toISOString() }
      saveMockData()
      return HttpResponse.json(mockPlayers[index])
    }
    return HttpResponse.json({ error: 'Player not found' }, { status: 404 })
  }),

  http.delete('*/rest/v1/players*', async ({ request }) => {
    await delay(300)
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const index = mockPlayers.findIndex(p => p.id === id)
    if (index !== -1) {
      mockPlayers.splice(index, 1)
      saveMockData()
      return HttpResponse.json({ success: true })
    }
    return HttpResponse.json({ error: 'Player not found' }, { status: 404 })
  }),

  // ============ Matches API ============
  http.get('*/rest/v1/matches', async () => {
    await delay(300)
    return HttpResponse.json(mockMatches)
  }),

  http.post('*/rest/v1/matches', async ({ request }) => {
    await delay(300)
    const body = await request.json()
    const newMatch = {
      ...body,
      id: body.id || `match-${Date.now()}`,
      created_at: new Date().toISOString()
    }
    mockMatches.push(newMatch)
    saveMockData()
    return HttpResponse.json(newMatch, { status: 201 })
  }),

  http.patch('*/rest/v1/matches*', async ({ request }) => {
    await delay(300)
    const body = await request.json()
    const index = mockMatches.findIndex(m => m.id === body.id)
    if (index !== -1) {
      mockMatches[index] = { ...mockMatches[index], ...body }
      saveMockData()
      return HttpResponse.json(mockMatches[index])
    }
    return HttpResponse.json({ error: 'Match not found' }, { status: 404 })
  }),

  http.delete('*/rest/v1/matches*', async ({ request }) => {
    await delay(300)
    const url = new URL(request.url)
    
    // 쿼리 파라미터에서 id 추출 (id=eq.xxx 형식)
    const idParam = url.searchParams.get('id')
    let matchId = null
    
    if (idParam) {
      // "eq.570aaa31-..." 형식에서 실제 ID 추출
      matchId = idParam.replace('eq.', '')
    }
    
    if (matchId) {
      const index = mockMatches.findIndex(m => m.id === matchId)
      if (index !== -1) {
        mockMatches.splice(index, 1)
        saveMockData()
        return HttpResponse.json({ success: true })
      }
    }
    
    return HttpResponse.json({ error: 'Match not found' }, { status: 404 })
  }),

  // ============ Visit Logs API ============
  http.get('*/rest/v1/visit_logs', async ({ request }) => {
    await delay(300)
    const url = new URL(request.url)
    const roomId = url.searchParams.get('room_id')
    
    if (roomId) {
      const filtered = mockVisitLogs.filter(log => log.room_id === roomId)
      return HttpResponse.json(filtered)
    }
    return HttpResponse.json(mockVisitLogs)
  }),

  http.post('*/rest/v1/visit_logs', async ({ request }) => {
    await delay(300)
    const body = await request.json()
    const newLog = {
      ...body,
      id: `visit-${Date.now()}`,
      created_at: new Date().toISOString()
    }
    mockVisitLogs.push(newLog)
    return HttpResponse.json(newLog, { status: 201 })
  }),

  // ============ AppDB API ============
  http.get('*/rest/v1/appdb*', async ({ request }) => {
    await delay(300)
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    
    if (id) {
      // mockAppDB에서 키 찾기 (semihan 또는 semihan-lite-room-1 등 모두 지원)
      let data = mockAppDB[id]
      
      // 정확한 일치가 없으면 'semihan' 또는 'dksc' 접두사로 찾기
      if (!data) {
        if (id.includes('semihan')) {
          data = mockAppDB.semihan
        } else if (id.includes('dksc')) {
          data = mockAppDB.dksc
        }
      }
      
      // 데이터가 없어도 기본 구조 반환 (appdb retire 준비)
      if (!data) {
        data = {
          upcomingMatches: [],
          tagPresets: []
        }
      }
      
      // Supabase 형식: { id, data } 객체로 반환
      // .single() 호출 시 배열의 첫 번째 요소를 객체로 반환
      const responseData = JSON.stringify(data)
      
      // .single()은 배열이 아닌 단일 객체를 기대함
      return HttpResponse.json({ id, data: responseData })
    }
    
    // ID 없으면 빈 배열 반환
    return HttpResponse.json([])
  }),

  http.post('*/rest/v1/appdb', async ({ request }) => {
    await delay(300)
    try {
      const body = await request.json()
      let id = body.id
      
      logger.log('[MSW] appdb POST:', { id, keys: Object.keys(body) })
      
      // ID로 해당 데이터 찾기
      let key = id
      if (id && !mockAppDB[id]) {
        if (id.includes('semihan')) {
          key = 'semihan'
        } else if (id.includes('dksc')) {
          key = 'dksc'
        }
      }
      
      if (key && mockAppDB[key]) {
        // data가 문자열인 경우 파싱
        const newData = typeof body.data === 'string' ? JSON.parse(body.data) : body.data
        mockAppDB[key] = { ...mockAppDB[key], ...newData }
        const responseData = JSON.stringify(mockAppDB[key])
        return HttpResponse.json({ id, data: responseData }, { status: 201 })
      }
      
      logger.warn('[MSW] appdb POST failed: Invalid ID', id, 'Available:', Object.keys(mockAppDB))
      return HttpResponse.json({ error: 'Invalid appdb ID' }, { status: 400 })
    } catch (error) {
      logger.error('[MSW] appdb POST error:', error)
      return HttpResponse.json({ error: error.message }, { status: 400 })
    }
  }),

  http.patch('*/rest/v1/appdb*', async ({ request }) => {
    await delay(300)
    const body = await request.json()
    let id = body.id
    
    // ID로 해당 데이터 찾기
    let key = id
    if (id && !mockAppDB[id]) {
      if (id.includes('semihan')) {
        key = 'semihan'
      } else if (id.includes('dksc')) {
        key = 'dksc'
      }
    }
    
    if (key && mockAppDB[key]) {
      // data가 문자열인 경우 파싱
      const newData = typeof body.data === 'string' ? JSON.parse(body.data) : body.data
      mockAppDB[key] = { ...mockAppDB[key], ...newData }
      const responseData = JSON.stringify(mockAppDB[key])
      return HttpResponse.json({ id, data: responseData })
    }
    return HttpResponse.json({ error: 'Invalid appdb ID' }, { status: 400 })
  }),

  // ============ Realtime Subscriptions (더미 응답) ============
  http.post('*/realtime/v1/subscribe', async () => {
    await delay(100)
    return HttpResponse.json({ status: 'ok' })
  }),

  http.all('*/realtime/*', async () => {
    await delay(100)
    return HttpResponse.json({ status: 'ok' })
  })
]
