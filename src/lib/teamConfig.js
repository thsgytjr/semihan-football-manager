// src/lib/teamConfig.js
// 팀별 설정 (환경변수에서 로드)

export const TEAM_CONFIG = {
  // 팀 기본 정보
  name: import.meta.env.VITE_TEAM_NAME || '세미한 FC',
  shortName: import.meta.env.VITE_TEAM_SHORT_NAME || 'semihan',
  
  // 브랜딩
  primaryColor: import.meta.env.VITE_TEAM_PRIMARY_COLOR || '#10b981', // emerald-500
  
  // Supabase 설정 (팀별 독립 프로젝트)
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
  },
  
  // 기능 토글
  features: {
    analytics: import.meta.env.VITE_FEATURE_ANALYTICS !== 'false', // 기본 true
    draft: import.meta.env.VITE_FEATURE_DRAFT !== 'false',
    upcoming: import.meta.env.VITE_FEATURE_UPCOMING !== 'false'
  }
}

// 로컬스토리지 키 프리픽스
export const STORAGE_PREFIX = `${TEAM_CONFIG.shortName}_`

// 디버그 로그
console.log('🏆 Team Config:', {
  name: TEAM_CONFIG.name,
  shortName: TEAM_CONFIG.shortName,
  hasSupabase: !!TEAM_CONFIG.supabase.url
})
