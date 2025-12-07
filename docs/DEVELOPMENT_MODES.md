# Development Modes Guide

## 🚀 localhost 개발 모드 (Mock Mode)

**URL**: `http://localhost:5173`

### 특징
- ✅ **MSW (Mock Service Worker) 전용**: 모든 API 요청이 Mock 데이터로 처리
- ✅ **즉시 로그인**: 자물쇠 아이콘만 클릭하면 자동으로 어드민 접근 (이메일/비밀번호 불필요)
- ✅ **로컬 저장소만 사용**: 실제 프로덕션 데이터베이스에 전혀 영향 없음
- ✅ **빠른 개발**: 인증 없이 모든 기능 즉시 테스트 가능
- ✅ **안전**: 실수로 프로덕션 데이터를 건드릴 위험 0%

### 사용 방법
1. `npm run dev` 실행
2. `http://localhost:5173` 접속
3. 자물쇠 🔒 아이콘 클릭
4. "즉시 로그인" 버튼 클릭 → 바로 어드민 모드 진입!

### Mock 데이터
- 선수 데이터: Semihan 팀 Mock 데이터 자동 로드
- 매치 데이터: 로컬 메모리에만 저장
- 태그 프리셋: Mock 배열 사용
- 다가오는 경기: Mock 배열 사용
- 방문자 통계: Mock 카운터

---

## 🔐 localhost 실제 인증 모드 (Real Auth + Production DB)

**URL**: `http://localhost:5173/?nomock`

### 특징
- ✅ **실제 Supabase 인증**: 이메일과 비밀번호로 진짜 로그인
- ✅ **프로덕션 데이터**: 실제 Supabase 데이터베이스 직접 연결
- ✅ **코드 테스트**: 배포 전에 실제 환경과 동일한 조건에서 테스트
- ⚠️ **주의**: 프로덕션 데이터를 직접 수정하므로 신중하게 사용!

### 사용 방법
1. `npm run dev` 실행
2. `http://localhost:5173/?nomock` 접속
3. 자물쇠 🔒 아이콘 클릭
4. **실제 이메일과 비밀번호 입력** 후 로그인
5. 실제 프로덕션 데이터베이스와 연결됨

### 실제 데이터
- Supabase 프로덕션 DB 직접 연결
- RLS 정책 적용
- 실제 인증 JWT 토큰 사용
- 모든 변경사항이 프로덕션에 반영됨

---

## 🌐 프로덕션 배포 (Vercel)

**URL**: `https://your-app.vercel.app`

### 특징
- ✅ **항상 실제 인증**: Mock 모드 비활성화
- ✅ **프로덕션 데이터만**: Supabase 프로덕션 DB 사용
- ✅ **방문자 추적**: 실제 사용자 방문 통계 기록
- ✅ **RLS 보안**: Row Level Security 정책 적용

### 자동 감지
- `localhost`가 아닌 모든 호스트에서는 자동으로 프로덕션 모드 활성화
- MSW 비활성화
- Mock 인증 비활성화
- 실제 Supabase만 사용

---

## 📋 모드 비교표

| 항목 | Mock Mode<br/>`localhost:5173` | Real Auth Mode<br/>`localhost:5173/?nomock` | Production<br/>`vercel.app` |
|------|-------------------------------|---------------------------------------------|----------------------------|
| **인증** | 즉시 로그인 (클릭만) | 실제 이메일/비밀번호 | 실제 이메일/비밀번호 |
| **데이터베이스** | MSW Mock 데이터 | Supabase 프로덕션 | Supabase 프로덕션 |
| **데이터 저장** | 로컬 메모리만 | 실제 DB 수정 | 실제 DB 수정 |
| **방문자 추적** | Mock 카운터 | 실제 DB 기록 (localhost 제외) | 실제 DB 기록 |
| **안전성** | ✅ 100% 안전 | ⚠️ 주의 필요 | ⚠️ 주의 필요 |
| **속도** | ⚡ 매우 빠름 | 🌐 네트워크 의존 | 🌐 네트워크 의존 |
| **용도** | 빠른 개발/테스트 | 배포 전 검증 | 실제 사용자 서비스 |

---

## 🛠️ 개발 워크플로우 권장사항

### 1. 일상 개발
```bash
npm run dev
# → http://localhost:5173 접속
# → 자물쇠 클릭 → 즉시 로그인 → 빠른 개발!
```

### 2. 배포 전 최종 검증
```bash
npm run dev
# → http://localhost:5173/?nomock 접속
# → 실제 계정으로 로그인
# → 프로덕션 데이터로 테스트
# → 문제 없으면 배포!
```

### 3. 프로덕션 배포
```bash
git push origin main
# → Vercel 자동 배포
# → 프로덕션 URL에서 최종 확인
```

---

## 🔍 디버깅 팁

### Mock Mode에서 실제 DB 테스트하고 싶을 때
```
http://localhost:5173/?nomock
```

### Preview 모드 진입 (방문자 추적 OFF)
```
http://localhost:5173/?preview=true
```

### 둘 다 적용
```
http://localhost:5173/?nomock&preview=true
```

---

## ⚠️ 주의사항

### Mock Mode (`localhost:5173`)
- ✅ 안전: 프로덕션 데이터 절대 건드리지 않음
- ✅ 빠름: 네트워크 없이 즉시 테스트
- ⚠️ 제한: 실제 DB 동작과 약간 다를 수 있음

### Real Auth Mode (`localhost:5173/?nomock`)
- ⚠️ **주의**: 프로덕션 DB를 직접 수정함!
- ✅ 정확: 실제 환경과 100% 동일
- 🐢 느림: 네트워크 지연 발생 가능

### Production (`vercel.app`)
- ⚠️ **경고**: 모든 사용자가 접근 가능
- 🔒 보안: RLS 정책으로 보호
- 📊 추적: 모든 방문자 기록됨

---

## 🎯 코드 참고

### 인증 로직
- `src/lib/auth.js` - `shouldUseMockAuth()` 함수
- `src/components/AdminLoginDialog.jsx` - 모드별 UI 분기

### MSW 초기화
- `src/main.jsx` - `enableMocking()` 함수
- `src/mocks/handlers.js` - Mock API 핸들러

### 모드 감지
- `window.location.hostname` - localhost 여부
- `URLSearchParams.has('nomock')` - ?nomock 파라미터
