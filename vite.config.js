import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import pkg from './package.json' assert { type: 'json' }

// git 커밋 해시 가져오기
let commitHash = 'dev'
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch (e) {
  console.warn('Git hash 조회 실패:', e)
}

export default defineConfig(({ mode }) => {
  // 환경 변수 로드
  const env = loadEnv(mode, process.cwd(), '')
  const teamName = env.VITE_TEAM_NAME || 'Football Manager'
  
  return {
    plugins: [
      react(),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          // HTML의 메타태그를 환경 변수로 치환
          return html
            .replace(/<title>.*?<\/title>/, `<title>${teamName}</title>`)
            .replace(/id="og-title" content=".*?"/, `id="og-title" content="${teamName}"`)
            .replace(/id="twitter-title" content=".*?"/, `id="twitter-title" content="${teamName}"`)
        }
      }
    ],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.VITE_APP_COMMIT': JSON.stringify(commitHash),
    },
    // mode에 따라 다른 .env 파일 로드
    envDir: './',
    envPrefix: 'VITE_',
    // MSW Service Worker 파일이 올바르게 제공되도록 설정
    publicDir: 'public',
  }
})
