// src/lib/appSettings.js
// 앱 설정 관리 (Supabase 기반으로 전환)

import { supabase } from './supabaseClient'
import { logger } from './logger'

const SETTINGS_KEY = 'app_settings'
const SUPABASE_SETTINGS_KEY = 'app_settings'

const DEFAULT_SETTINGS = {
  appTitle: 'Semihan-FM',
  appName: 'Semihan Football Manager',
  seasonRecapEnabled: true,  // 시즌 리캡 슬라이드쇼 표시
  maintenanceMode: false, // 유지보수 모드 (개발자만 접근 가능)
  // 선택: 관리자 이메일 화이트리스트(있으면 이 목록만 Admin 허용)
  adminEmails: [],
  features: {
    players: true,      // 선수 관리
    planner: true,      // 매치 플래너
    draft: true,        // 드래프트
    formation: true,    // 포메이션 보드
    stats: true,        // 기록 입력
    mom: true,          // MOM 투표/리더보드
    accounting: true,   // 회계
    analytics: true,    // 방문자 분석
    badges: true,       // 챌린지 뱃지 (선수 기록 모달 내부)
    playerStatsModal: true, // 선수 종합 기록 모달
    // 리더보드 카테고리별 표시 토글 (데이터 유지, UI만 제어)
    leaderboards: {
      pts: true, // 종합(공격포인트)
      g: true,   // 득점
      a: true,   // 어시스트
      gp: true,  // 출전
      cs: true,  // 클린시트
      duo: true, // 듀오
      cards: true // 카드(옐/레드)
    }
  },
  accounting: {
    memberFeeOverride: null,        // 숫자 또는 null
    guestSurchargeOverride: null,   // 숫자 또는 null
    venueTotalOverride: null,        // 매치 전체 구장비 강제 설정 (멤버/게스트 계산에 사용)
    renewalPreferences: {},          // 선수별 회비 납부 방식 수동 설정
    renewalResets: {}               // 선수별 수동 정상 처리 기록
  },
  badgeTierOverrides: {}
}

function mergeSettings(partial = {}) {
  const incoming = partial || {}
  const mergedFeatures = {
    ...DEFAULT_SETTINGS.features,
    ...(incoming.features || {}),
  }

  if (mergedFeatures.playerStatsModal === undefined && Object.prototype.hasOwnProperty.call(mergedFeatures, 'playerFunFacts')) {
    mergedFeatures.playerStatsModal = mergedFeatures.playerFunFacts
  }

  return {
    ...DEFAULT_SETTINGS,
    ...incoming,
    features: mergedFeatures,
    accounting: {
      ...DEFAULT_SETTINGS.accounting,
      ...(incoming.accounting || {}),
    },
    badgeTierOverrides: {
      ...(incoming.badgeTierOverrides || {})
    }
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
      return mergeSettings({})
    }
    
    const settings = mergeSettings(data?.value || {})
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
      return mergeSettings(settings)
    }
  } catch (err) {
    logger.error('Failed to load app settings:', err)
  }
  return mergeSettings({})
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

// 시즌 리캡 활성화 상태 업데이트 (서버 + 로컬)
export async function updateSeasonRecapEnabled(enabled) {
  const settings = getAppSettings()
  settings.seasonRecapEnabled = enabled
  
  const success = await saveAppSettingsToServer(settings)
  return success
}

// 유지보수 모드 업데이트 (서버 + 로컬)
export async function updateMaintenanceMode(enabled) {
  const settings = getAppSettings()
  settings.maintenanceMode = enabled
  
  const success = await saveAppSettingsToServer(settings)
  return success
}

// 기능 활성화 상태 업데이트 (서버 + 로컬)
export async function updateFeatureEnabled(featureName, enabled) {
  const settings = getAppSettings()
  if (!settings.features) {
    settings.features = DEFAULT_SETTINGS.features
  }
  // 단일 키 또는 중첩 키 (예: 'leaderboards.cards') 지원
  if (featureName.includes('.')) {
    const [group, key] = featureName.split('.')
    if (!settings.features[group]) settings.features[group] = { ...(DEFAULT_SETTINGS.features[group] || {}) }
    settings.features[group][key] = enabled
  } else {
    settings.features[featureName] = enabled
  }
  
  const success = await saveAppSettingsToServer(settings)
  return success
}

// 리더보드 카테고리 전용 토글 도우미
export async function updateLeaderboardCategoryEnabled(category, enabled) {
  return updateFeatureEnabled(`leaderboards.${category}`, enabled)
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

export function getBadgeTierOverrides() {
  const settings = getAppSettings()
  return settings.badgeTierOverrides || DEFAULT_SETTINGS.badgeTierOverrides
}

export async function updateBadgeTierOverrides(nextOverrides = {}) {
  const settings = getAppSettings()
  settings.badgeTierOverrides = typeof nextOverrides === 'object' && nextOverrides !== null
    ? nextOverrides
    : DEFAULT_SETTINGS.badgeTierOverrides
  const success = await saveAppSettingsToServer(settings)
  return success ? settings.badgeTierOverrides : null
}
