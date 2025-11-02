// src/lib/appSettings.js
// 앱 설정 관리 (로컬스토리지)

const SETTINGS_KEY = 'app_settings'

const DEFAULT_SETTINGS = {
  appTitle: 'Semihan-FM',
  appName: 'Semihan Football Manager'
}

export function getAppSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const settings = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...settings }
    }
  } catch (err) {
    console.error('Failed to load app settings:', err)
  }
  return DEFAULT_SETTINGS
}

export function saveAppSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch (err) {
    console.error('Failed to save app settings:', err)
    return false
  }
}

export function updateAppTitle(newTitle) {
  const settings = getAppSettings()
  settings.appTitle = newTitle
  if (saveAppSettings(settings)) {
    // 브라우저 탭 타이틀 업데이트
    document.title = newTitle
    return true
  }
  return false
}
