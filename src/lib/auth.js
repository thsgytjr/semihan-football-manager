// src/lib/auth.js
import { supabase } from './supabaseClient'
import { logger } from './logger'

// Mock 인증 상태 (개발 환경)
let mockSession = null
let mockAuthCallbacks = []

/**
 * Admin 로그인
 * @param {string} email - 관리자 이메일
 * @param {string} password - 비밀번호
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export async function signInAdmin(email, password) {
  try {
    // localhost에서 실제 Supabase 인증 사용 (Mock 로그인 비활성화)
    // 프로덕션에서는 항상 실제 인증 사용
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const useMockAuth = false // Mock 로그인 완전히 비활성화
    logger.log('[Auth] isLocalhost:', isLocalhost, 'useMockAuth:', useMockAuth)
    if (useMockAuth && isLocalhost) {
      const mockUser = {
        id: '00000000-0000-0000-0000-000000000001', // UUID 형식의 Mock ID
        email: email || 'admin@mock.local',
        user_metadata: {}
      }
      
      mockSession = {
        user: mockUser,
        access_token: 'mock-token-123'
      }
      
      // 등록된 콜백 모두 호출
      mockAuthCallbacks.forEach(cb => cb(mockSession))
      
      logger.log('✅ Mock 어드민 로그인 성공:', mockUser.email)
      return { user: mockUser, error: null }
    }
    
    // 실제 Supabase 로그인
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) {
      logger.error('[Auth] Sign in error:', error.message)
      return { user: null, error }
    }
    
    return { user: data.user, error: null }
  } catch (err) {
    logger.error('[Auth] Unexpected error:', err)
    return { user: null, error: err }
  }
}

/**
 * 로그아웃
 */
export async function signOut() {
  try {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const useMockAuth = false // Mock 로그인 완전히 비활성화
    if (useMockAuth && isLocalhost) {
      mockSession = null
      mockAuthCallbacks.forEach(cb => cb(null))
      logger.log('✅ Mock 로그아웃 성공')
      return { error: null }
    }
    
    // 실제 Supabase 로그아웃
    const { error } = await supabase.auth.signOut()
    if (error) {
      logger.error('[Auth] Sign out error:', error.message)
      return { error }
    }
    return { error: null }
  } catch (err) {
    logger.error('[Auth] Unexpected error:', err)
    return { error: err }
  }
}

/**
 * 현재 세션 가져오기
 * @returns {Promise<Object|null>}
 */
export async function getSession() {
  try {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const useMockAuth = false // Mock 로그인 완전히 비활성화
    if (useMockAuth && isLocalhost) {
      return mockSession
    }
    
    // 실제 Supabase 세션
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      logger.error('[Auth] Get session error:', error.message)
      return null
    }
    return data.session
  } catch (err) {
    logger.error('[Auth] Unexpected error:', err)
    return null
  }
}

/**
 * 현재 사용자 가져오기
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUser() {
  try {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const useMockAuth = false // Mock 로그인 완전히 비활성화
    if (useMockAuth && isLocalhost) {
      return mockSession?.user || null
    }
    
    // 실제 Supabase 사용자
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      logger.error('[Auth] Get user error:', error.message)
      return null
    }
    return user
  } catch (err) {
    logger.error('[Auth] Unexpected error:', err)
    return null
  }
}

/**
 * 인증 상태 변경 리스너 설정
 * @param {Function} callback - 상태 변경 시 호출될 콜백 (session) => void
 * @returns {Function} - 구독 해제 함수
 */
export function onAuthStateChange(callback) {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const useMockAuth = false // Mock 로그인 완전히 비활성화
  if (useMockAuth && isLocalhost) {
    mockAuthCallbacks.push(callback)
    // 초기 상태 전달
    callback(mockSession)
    // 구독 해제 함수
    return () => {
      mockAuthCallbacks = mockAuthCallbacks.filter(cb => cb !== callback)
    }
  }
  
  // 실제 Supabase 이벤트
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  
  return () => subscription.unsubscribe()
}

/**
 * 이메일이 개발자 이메일인지 확인 (방문자 분석 접근 제한용)
 * @param {string} email - 확인할 이메일
 * @returns {boolean}
 */
export function isDeveloperEmail(email) {
  const devEmails = [
    'sonhyosuck@gmail.com'
  ]
  if (!email) return false
  return devEmails.some(devEmail => email.toLowerCase() === devEmail.toLowerCase())
}

