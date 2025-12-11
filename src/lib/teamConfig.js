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
  
  // Cloudflare R2 설정 (이미지 스토리지)
  r2: {
    publicUrl: import.meta.env.VITE_R2_PUBLIC_URL || 'https://pub-cf56cce5ad30432d9a1d3d9ad6f1d1be.r2.dev',
    teamPath: import.meta.env.VITE_R2_TEAM_PATH || 'semihan',
    signUrl: import.meta.env.VITE_R2_SIGN_URL || '' // 사전 서명 PUT/DELETE 발급 엔드포인트
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
