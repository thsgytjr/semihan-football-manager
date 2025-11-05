// src/lib/auth.js
import { supabase } from './supabaseClient'

/**
 * Admin 로그인
 * @param {string} email - 관리자 이메일
 * @param {string} password - 비밀번호
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export async function signInAdmin(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) {
      console.error('[Auth] Sign in error:', error.message)
      return { user: null, error }
    }
    
    return { user: data.user, error: null }
  } catch (err) {
    console.error('[Auth] Unexpected error:', err)
    return { user: null, error: err }
  }
}

/**
 * 로그아웃
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[Auth] Sign out error:', error.message)
      return { error }
    }
    return { error: null }
  } catch (err) {
    console.error('[Auth] Unexpected error:', err)
    return { error: err }
  }
}

/**
 * 현재 세션 가져오기
 * @returns {Promise<Object|null>}
 */
export async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('[Auth] Get session error:', error.message)
      return null
    }
    return data.session
  } catch (err) {
    console.error('[Auth] Unexpected error:', err)
    return null
  }
}

/**
 * 현재 사용자 가져오기
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      console.error('[Auth] Get user error:', error.message)
      return null
    }
    return user
  } catch (err) {
    console.error('[Auth] Unexpected error:', err)
    return null
  }
}

/**
 * 인증 상태 변경 리스너 설정
 * @param {Function} callback - 상태 변경 시 호출될 콜백 (session) => void
 * @returns {Function} - 구독 해제 함수
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  
  return () => subscription.unsubscribe()
}
