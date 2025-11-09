import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

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
  
  // Vercel 배포 환경에서는 VERCEL_GIT_COMMIT_MESSAGE로 팀 판별
  let teamName = env.VITE_TEAM_NAME
  let description = env.VITE_APP_DESCRIPTION
  let appUrl = env.VITE_APP_URL
  
  // CI/CD 환경에서 환경 변수가 없으면 경고만 출력
  if (!teamName && process.env.CI) {
    console.warn('⚠️ VITE_TEAM_NAME not set, using fallback')
    teamName = 'Goalify'
  }
  
  if (!description && process.env.CI) {
    console.warn('⚠️ VITE_APP_DESCRIPTION not set, using fallback')
    description = 'Plan. Play. Win.'
  }
  
  if (!appUrl && process.env.CI) {
    console.warn('⚠️ VITE_APP_URL not set, using fallback')
    appUrl = 'https://semihan-football-manager.vercel.app'
  }
  
  // 로컬 개발에서는 미지정 시 안전한 기본값을 사용하여 개발 편의성 확보
  if (!teamName && !process.env.CI) teamName = 'Goalify'
  if (!description && !process.env.CI) description = 'Plan. Play. Win.'
  if (!appUrl && !process.env.CI) {
    console.warn('⚠️ VITE_APP_URL not set (local dev), using http://localhost:5173')
    appUrl = 'http://localhost:5173'
  }
  
  const imageUrl = `${appUrl}/GoalifyLogo.png`
  
  console.log(`🏗️ Building for: ${teamName} (${appUrl})`)
  
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
            .replace(/id="og-description" content=".*?"/, `id="og-description" content="${description}"`)
            .replace(/id="twitter-description" content=".*?"/, `id="twitter-description" content="${description}"`)
            .replace(/REPLACE_APP_URL/g, appUrl)
            .replace(/REPLACE_IMAGE_URL/g, imageUrl)
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
