import { http, HttpResponse, delay } from 'msw'
import { mockPlayers, mockMatches, mockVisitLogs, mockAppDB, mockMembershipSettings, mockTagPresets, mockUpcomingMatches, mockVisitTotals } from './data'
import { logger } from '../lib/logger'

// Mock 인증 상태
let mockAuthSession = null
const mockMoMVotes = []

// Performance: 빠른 응답을 위해 delay 최소화
const MOCK_DELAY = 50 // ms

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
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
    mockAuthSession = null
    return HttpResponse.json({ ok: true })
  }),

  http.get('*/auth/v1/user', async () => {
    await delay(MOCK_DELAY)
    if (mockAuthSession) {
      return HttpResponse.json(mockAuthSession.user)
    }
    return HttpResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }),

  http.get('*/auth/v1/session', async () => {
    await delay(MOCK_DELAY)
    if (mockAuthSession) {
      return HttpResponse.json(mockAuthSession.session)
    }
    return HttpResponse.json(null)
  }),

  // ============ Players API ============
  http.get('*/rest/v1/players', async () => {
    await delay(MOCK_DELAY)
    return HttpResponse.json(mockPlayers)
  }),

  http.post('*/rest/v1/players', async ({ request }) => {
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
    return HttpResponse.json(mockMatches)
  }),

  http.post('*/rest/v1/matches', async ({ request }) => {
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
    const url = new URL(request.url)
    const body = await request.json()
    
    // 쿼리 파라미터에서 id 추출 (id=eq.xxx 형식)
    const idParam = url.searchParams.get('id')
    let matchId = null
    
    if (idParam) {
      // "eq.570aaa31-..." 형식에서 실제 ID 추출
      matchId = idParam.replace('eq.', '')
    } else if (body.id) {
      // Body에 id가 있으면 사용 (하위 호환성)
      matchId = body.id
    }
    
    if (matchId) {
      const index = mockMatches.findIndex(m => m.id === matchId)
      if (index !== -1) {
        mockMatches[index] = { ...mockMatches[index], ...body }
        saveMockData()
        return HttpResponse.json(mockMatches[index])
      }
    }
    
    return HttpResponse.json({ error: 'Match not found' }, { status: 404 })
  }),

  http.delete('*/rest/v1/matches*', async ({ request }) => {
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
    const url = new URL(request.url)
    const roomId = url.searchParams.get('room_id')
    
    if (roomId) {
      const filtered = mockVisitLogs.filter(log => log.room_id === roomId)
      return HttpResponse.json(filtered)
    }
    return HttpResponse.json(mockVisitLogs)
  }),

  http.post('*/rest/v1/visit_logs', async ({ request }) => {
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
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
    await delay(MOCK_DELAY)
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

  // ============ Membership Settings API ============
  http.get('*/rest/v1/membership_settings', async ({ request }) => {
    await delay(MOCK_DELAY)
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    
    if (id) {
      const idValue = id.replace('eq.', '')
      const setting = mockMembershipSettings.find(s => s.id === idValue)
      if (setting) {
        return HttpResponse.json([setting])
      }
      return HttpResponse.json([])
    }
    
    // Sort by sort_order
    const sorted = [...mockMembershipSettings].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    return HttpResponse.json(sorted)
  }),

  http.post('*/rest/v1/membership_settings', async ({ request }) => {
    await delay(MOCK_DELAY)
    const body = await request.json()
    
    // Handle array of memberships (bulk insert)
    const memberships = Array.isArray(body) ? body : [body]
    const results = []
    
    for (const membership of memberships) {
      const newMembership = {
        id: membership.id || crypto.randomUUID(),
        name: membership.name,
        badge: membership.badge,
        badge_color: membership.badge_color,
        deletable: membership.deletable !== false,
        sort_order: membership.sort_order || mockMembershipSettings.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      mockMembershipSettings.push(newMembership)
      results.push(newMembership)
    }
    
    logger.log('[MSW] membership_settings POST:', results.length, 'added')
    logger.log('[MSW] membership_settings POST result:', results[0])
    logger.log('[MSW] membership_settings POST body was array?:', Array.isArray(body))
    
    // Supabase .insert([...]) with .select().single() 
    // insert는 배열을 받지만, .single()이 있으면 단일 객체 반환
    // 원래 body가 배열이 아니면 results[0] 반환 (단일 insert)
    const response = results[0]  // 항상 단일 객체 반환 (.single() 사용)
    logger.log('[MSW] membership_settings POST final response:', response)
    return HttpResponse.json(response, { status: 201 })
  }),

  http.patch('*/rest/v1/membership_settings*', async ({ request }) => {
    await delay(MOCK_DELAY)
    const url = new URL(request.url)
    const body = await request.json()
    
    // Extract id from query parameter (id=eq.xxx)
    const idParam = url.searchParams.get('id')
    let membershipId = null
    
    if (idParam) {
      membershipId = idParam.replace('eq.', '')
    } else if (body.id) {
      membershipId = body.id
    }
    
    if (membershipId) {
      const index = mockMembershipSettings.findIndex(m => m.id === membershipId)
      if (index !== -1) {
        mockMembershipSettings[index] = {
          ...mockMembershipSettings[index],
          ...body,
          updated_at: new Date().toISOString()
        }
        logger.log('[MSW] membership_settings PATCH:', membershipId)
        return HttpResponse.json(mockMembershipSettings[index])
      }
    }
    
    return HttpResponse.json({ error: 'Membership not found' }, { status: 404 })
  }),

  http.delete('*/rest/v1/membership_settings*', async ({ request }) => {
    await delay(MOCK_DELAY)
    const url = new URL(request.url)
    
    // Extract id from query parameter (id=eq.xxx)
    const idParam = url.searchParams.get('id')
    let membershipId = null
    
    if (idParam) {
      membershipId = idParam.replace('eq.', '')
    }
    
    if (membershipId) {
      const index = mockMembershipSettings.findIndex(m => m.id === membershipId)
      if (index !== -1) {
        mockMembershipSettings.splice(index, 1)
        logger.log('[MSW] membership_settings DELETE:', membershipId)
        return HttpResponse.json({ success: true })
      }
    }
    
    return HttpResponse.json({ error: 'Membership not found' }, { status: 404 })
  }),

  // ============ MoM Votes API ============
  http.get('*/rest/v1/mom_votes', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const matchParam = url.searchParams.get('match_id')
    const roomParam = url.searchParams.get('room_id')
    let results = [...mockMoMVotes]
    if (matchParam) {
      const matchId = matchParam.replace('eq.', '')
      results = results.filter(v => v.match_id === matchId)
    }
    if (roomParam) {
      const roomId = roomParam.replace('eq.', '')
      results = results.filter(v => v.room_id === roomId)
    }
    return HttpResponse.json(results)
  }),

  http.post('*/rest/v1/mom_votes', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    const payloads = Array.isArray(body) ? body : [body]
    const inserted = payloads.map(item => {
      const vote = {
        id: item.id || crypto.randomUUID(),
        room_id: item.room_id,
        match_id: item.match_id,
        player_id: item.player_id,
        voter_label: item.voter_label ?? null,
        created_at: new Date().toISOString(),
        ip_hash: item.ip_hash ?? null,
        visitor_id: item.visitor_id ?? null,
      }
  mockMoMVotes.push(vote)
      return vote
    })
    const select = new URL(request.url).searchParams.get('select')
    const single = inserted[0]
    if (select) {
      return HttpResponse.json(single, { status: 201 })
    }
    return HttpResponse.json(inserted, { status: 201 })
  }),

  http.delete('*/rest/v1/mom_votes*', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const idParam = url.searchParams.get('id')
    const matchParam = url.searchParams.get('match_id')
    let deleted = 0

    if (idParam) {
      const idVal = idParam.replace('eq.', '')
      const idx = mockMoMVotes.findIndex(v => v.id === idVal)
      if (idx !== -1) {
        mockMoMVotes.splice(idx, 1)
        deleted += 1
      }
    } else if (matchParam) {
      const matchId = matchParam.replace('eq.', '')
      for (let i = mockMoMVotes.length - 1; i >= 0; i -= 1) {
        if (mockMoMVotes[i].match_id === matchId) {
          mockMoMVotes.splice(i, 1)
          deleted += 1
        }
      }
    }

    return deleted > 0
      ? HttpResponse.json({ success: true })
      : HttpResponse.json({ error: 'Vote not found' }, { status: 404 })
  }),

  // ============ Realtime Subscriptions (더미 응답) ============
  http.post('*/realtime/v1/subscribe', async () => {
    await delay(100)
    return HttpResponse.json({ status: 'ok' })
  }),

  http.all('*/realtime/*', async () => {
    await delay(100)
    return HttpResponse.json({ status: 'ok' })
  }),

  // ============ Tag Presets API ============
  http.get('*/rest/v1/tag_presets', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const roomParam = url.searchParams.get('room_id')
    let results = [...mockTagPresets]
    if (roomParam) {
      const roomId = roomParam.replace('eq.', '')
      results = results.filter(t => t.room_id === roomId)
    }
    return HttpResponse.json(results)
  }),

  http.post('*/rest/v1/tag_presets', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    const newPreset = {
      id: crypto.randomUUID(),
      room_id: body.room_id,
      name: body.name,
      color: body.color || 'stone',
      sort_order: body.sort_order || 0,
      metadata: body.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockTagPresets.push(newPreset)
    return HttpResponse.json(newPreset, { status: 201 })
  }),

  http.patch('*/rest/v1/tag_presets*', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    const url = new URL(request.url)
    const idParam = url.searchParams.get('id')
    const id = idParam ? idParam.replace('eq.', '') : null
    const index = mockTagPresets.findIndex(t => t.id === id)
    if (index !== -1) {
      mockTagPresets[index] = { ...mockTagPresets[index], ...body, updated_at: new Date().toISOString() }
      return HttpResponse.json(mockTagPresets[index])
    }
    return HttpResponse.json({ error: 'Tag preset not found' }, { status: 404 })
  }),

  http.delete('*/rest/v1/tag_presets*', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const idParam = url.searchParams.get('id')
    const id = idParam ? idParam.replace('eq.', '') : null
    const index = mockTagPresets.findIndex(t => t.id === id)
    if (index !== -1) {
      mockTagPresets.splice(index, 1)
      return HttpResponse.json({ success: true })
    }
    return HttpResponse.json({ error: 'Tag preset not found' }, { status: 404 })
  }),

  // ============ Upcoming Matches API ============
  http.get('*/rest/v1/upcoming_matches', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const roomParam = url.searchParams.get('room_id')
    let results = [...mockUpcomingMatches]
    if (roomParam) {
      const roomId = roomParam.replace('eq.', '')
      results = results.filter(m => m.room_id === roomId)
    }
    return HttpResponse.json(results)
  }),

  http.post('*/rest/v1/upcoming_matches', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    const newMatch = {
      id: crypto.randomUUID(),
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockUpcomingMatches.push(newMatch)
    return HttpResponse.json(newMatch, { status: 201 })
  }),

  http.patch('*/rest/v1/upcoming_matches*', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    const url = new URL(request.url)
    const idParam = url.searchParams.get('id')
    const id = idParam ? idParam.replace('eq.', '') : null
    const index = mockUpcomingMatches.findIndex(m => m.id === id)
    if (index !== -1) {
      mockUpcomingMatches[index] = { ...mockUpcomingMatches[index], ...body, updated_at: new Date().toISOString() }
      return HttpResponse.json(mockUpcomingMatches[index])
    }
    return HttpResponse.json({ error: 'Upcoming match not found' }, { status: 404 })
  }),

  http.delete('*/rest/v1/upcoming_matches*', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const idParam = url.searchParams.get('id')
    const id = idParam ? idParam.replace('eq.', '') : null
    const index = mockUpcomingMatches.findIndex(m => m.id === id)
    if (index !== -1) {
      mockUpcomingMatches.splice(index, 1)
      return HttpResponse.json({ success: true })
    }
    return HttpResponse.json({ error: 'Upcoming match not found' }, { status: 404 })
  }),

  // ============ Visit Totals API ============
  http.get('*/rest/v1/visit_totals', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const roomParam = url.searchParams.get('room_id')
    let results = [...mockVisitTotals]
    if (roomParam) {
      const roomId = roomParam.replace('eq.', '')
      results = results.filter(v => v.room_id === roomId)
    }
    return HttpResponse.json(results)
  }),

  http.post('*/rest/v1/rpc/increment_visit_total', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    const roomId = body.p_room_id
    const existing = mockVisitTotals.find(v => v.room_id === roomId)
    if (existing) {
      existing.total_visits += 1
      existing.updated_at = new Date().toISOString()
      return HttpResponse.json(existing.total_visits)
    } else {
      const newTotal = {
        room_id: roomId,
        total_visits: 1,
        updated_at: new Date().toISOString()
      }
      mockVisitTotals.push(newTotal)
      return HttpResponse.json(1)
    }
  }),

  // ============ Settings API (for Google Sheets URL storage) ============
  http.get('*/rest/v1/settings', async ({ request }) => {
    await delay(200)
    const url = new URL(request.url)
    const keyParam = url.searchParams.get('key')
    
    // Return empty array for now - users can set spreadsheet URL in UI
    // In real app, this would fetch from actual settings table
    if (keyParam === 'eq.app_settings') {
      // No spreadsheet URL configured in mock mode
      return HttpResponse.json([])
    }
    return HttpResponse.json([])
  }),

  http.post('*/rest/v1/settings', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    logger.info('[MSW] Settings saved (mock mode - not persisted):', body)
    // In mock mode, just acknowledge the save
    return HttpResponse.json({ success: true })
  }),

  http.patch('*/rest/v1/settings*', async ({ request }) => {
    await delay(200)
    const body = await request.json()
    logger.info('[MSW] Settings updated (mock mode - not persisted):', body)
    // In mock mode, just acknowledge the update
    return HttpResponse.json({ success: true })
  }),

  // ============ Passthrough for external APIs ============
  // Let Google APIs and other external services through
  http.get('https://apis.google.com/*', async ({ request }) => {
    // Passthrough - let the actual request happen
    return fetch(request)
  }),

  http.post('https://accounts.google.com/*', async ({ request }) => {
    // Passthrough - let the actual request happen
    return fetch(request)
  }),

  http.get('https://www.gstatic.com/*', async ({ request }) => {
    // Passthrough - let the actual request happen
    return fetch(request)
  }),

  http.get('https://api.ipify.org/*', async ({ request }) => {
    // Passthrough - let the actual request happen
    return fetch(request)
  })
]
