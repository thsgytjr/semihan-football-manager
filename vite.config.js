import { defineConfig } from 'vite'
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
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.VITE_APP_COMMIT': JSON.stringify(commitHash),
    },
    // mode에 따라 다른 .env 파일 로드
    envDir: './',
    envPrefix: 'VITE_',
  }
})
