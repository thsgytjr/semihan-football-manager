# Chrome Crash 해결 가이드

## 문제: "Aw, Snap! Error code: 5"

localhost 개발 중 Chrome에서 간헐적으로 발생하는 메모리 관련 크래시입니다.

## 적용된 최적화

### 1. Vite 설정 개선 (vite.config.js)
- **청크 분리**: React, Recharts, UI 라이브러리 등을 별도 청크로 분리하여 메모리 사용량 감소
- **Terser 최적화**: 프로덕션 빌드에서 console 제거 및 압축 최적화
- **HMR 최적화**: Hot Module Replacement 개선
- **Watch 최적화**: 불필요한 파일 감시 제외

### 2. Chrome 실행 플래그

Chrome을 다음 플래그와 함께 실행하면 크래시를 방지할 수 있습니다:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --disable-dev-shm-usage \
  --disable-gpu \
  --no-sandbox \
  --js-flags="--max-old-space-size=4096"
```

또는 Chrome을 종료하고 터미널에서:
```bash
open -a "Google Chrome" --args --disable-dev-shm-usage --disable-gpu --no-sandbox --js-flags="--max-old-space-size=4096"
```

### 3. 추가 해결 방법

#### Chrome 설정
1. Chrome 재시작
2. 브라우저 캐시 완전히 삭제 (⌘+Shift+Delete → 전체 기간)
3. Chrome 확장 프로그램 비활성화
4. 하드웨어 가속 끄기: `chrome://settings` → "시스템" → "사용 가능한 경우 하드웨어 가속 사용" 끄기

#### 개발 환경 최적화
1. 개발 서버 재시작: `npm run dev`
2. node_modules 재설치: `rm -rf node_modules package-lock.json && npm install`
3. React DevTools 확장 프로그램 일시 비활성화
4. 다른 Chrome 탭 닫기

#### macOS 시스템
1. 활성 상태 보기로 메모리 상태 확인
2. 메모리 부족 시 불필요한 앱 종료
3. Chrome 캐시 위치 변경 (SSD → 더 빠른 드라이브)

### 4. 모니터링

개발 중 다음을 확인하세요:
- Chrome 작업 관리자 (⌘+Option+Esc): 메모리 사용량 모니터링
- 개발자 도구 Performance 탭: 메모리 프로파일링
- Console 경고/오류: 메모리 누수 징후

### 5. 긴급 대처

크래시가 자주 발생하면:
1. **Safari로 전환**: 임시로 Safari에서 개발
2. **포트 변경**: `npm run dev -- --port 3000`
3. **Incognito 모드**: 확장 프로그램 없이 실행
4. **Chrome Canary**: 최신 Chrome 베타 버전 사용

## 참고

- Vite manualChunks로 1047KB 메인 청크를 여러 작은 청크로 분리
- 프로덕션 빌드에서 console.log 자동 제거
- 개발 서버 HMR 최적화로 리로드 부담 감소
