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
    // localhost에서는 Mock 로그인
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      const mockUser = {
        id: 'mock-admin-123',
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
    // localhost에서는 Mock 로그아웃
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
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
    // localhost에서는 Mock 세션
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
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
    // localhost에서는 Mock 사용자
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
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
  // localhost에서는 Mock 이벤트
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
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
    'sonhyosuck@gmail.com',
    'nedkim.j.m@gmail.com'
  ]
  if (!email) return false
  return devEmails.some(devEmail => email.toLowerCase() === devEmail.toLowerCase())
}

