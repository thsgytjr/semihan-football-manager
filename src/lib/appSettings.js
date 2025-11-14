// src/lib/appSettings.js
// 앱 설정 관리 (Supabase 기반으로 전환)

import { supabase } from './supabaseClient'
import { logger } from './logger'

const SETTINGS_KEY = 'app_settings'
const SUPABASE_SETTINGS_KEY = 'app_settings'

const DEFAULT_SETTINGS = {
  appTitle: 'Semihan-FM',
  appName: 'Semihan Football Manager',
  tutorialEnabled: true,
  // 선택: 관리자 이메일 화이트리스트(있으면 이 목록만 Admin 허용)
  adminEmails: [],
  features: {
    players: true,      // 선수 관리
    planner: true,      // 매치 플래너
    draft: true,        // 드래프트
    formation: true,    // 포메이션 보드
    stats: true,        // 기록 입력
      accounting: true,   // 회계
    analytics: true     // 방문자 분석
  },
  accounting: {
    memberFeeOverride: null,        // 숫자 또는 null
    guestSurchargeOverride: null,   // 숫자 또는 null
    venueTotalOverride: null        // 매치 전체 구장비 강제 설정 (멤버/게스트 계산에 사용)
  }
}

// Supabase에서 앱 설정 로드
export async function loadAppSettingsFromServer() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', SUPABASE_SETTINGS_KEY)
      .single()
    
    if (error) {
      return DEFAULT_SETTINGS
    }
    
    const settings = data?.value || DEFAULT_SETTINGS
    // 로컬에도 캐시
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return settings
  } catch (err) {
    logger.error('Failed to load settings from server:', err)
    return getAppSettings() // 로컬 폴백
  }
}

// Supabase에 앱 설정 저장
export async function saveAppSettingsToServer(settings) {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({
        key: SUPABASE_SETTINGS_KEY,
        value: settings,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      })
    
    if (error) throw error
    
    // 로컬에도 저장
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch (err) {
    logger.error('Failed to save settings to server:', err)
    // 서버 저장 실패시 로컬에만 저장
    return saveAppSettings(settings)
  }
}

// 로컬 스토리지에서 앱 설정 로드 (폴백용)
export function getAppSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const settings = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...settings }
    }
  } catch (err) {
    logger.error('Failed to load app settings:', err)
  }
  return DEFAULT_SETTINGS
}

// 로컬 스토리지에 저장 (폴백용)
export function saveAppSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch (err) {
    logger.error('Failed to save app settings:', err)
    return false
  }
}

// 앱 타이틀 업데이트 (서버 + 로컬)
export async function updateAppTitle(newTitle) {
  const settings = getAppSettings()
  settings.appTitle = newTitle
  
  const success = await saveAppSettingsToServer(settings)
  
  if (success) {
    // 브라우저 탭 타이틀 업데이트
    document.title = newTitle
    return true
  }
  return false
}

// 튜토리얼 활성화 상태 업데이트 (서버 + 로컬)
export async function updateTutorialEnabled(enabled) {
  const settings = getAppSettings()
  settings.tutorialEnabled = enabled
  
  const success = await saveAppSettingsToServer(settings)
  return success
}

// 기능 활성화 상태 업데이트 (서버 + 로컬)
export async function updateFeatureEnabled(featureName, enabled) {
  const settings = getAppSettings()
  if (!settings.features) {
    settings.features = DEFAULT_SETTINGS.features
  }
  settings.features[featureName] = enabled
  
  const success = await saveAppSettingsToServer(settings)
  return success
}

// 모든 기능 설정 한번에 업데이트
export async function updateAllFeatures(features) {
  const settings = getAppSettings()
  settings.features = { ...DEFAULT_SETTINGS.features, ...features }
  
  const success = await saveAppSettingsToServer(settings)
  return success
}

// 회계 구장비 관련 override 업데이트 (서버 + 로컬)
export async function updateAccountingOverrides(partial) {
  const settings = getAppSettings()
  if (!settings.accounting) settings.accounting = { ...DEFAULT_SETTINGS.accounting }
  settings.accounting = { ...settings.accounting, ...partial }
  const success = await saveAppSettingsToServer(settings)
  return success ? settings.accounting : null
}

export function getAccountingOverrides() {
  const settings = getAppSettings()
  return settings.accounting || DEFAULT_SETTINGS.accounting
}
