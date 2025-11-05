# Matches 데이터 마이그레이션 가이드

## 📋 개요

localStorage appdb의 `matches` 데이터를 Supabase `matches` 테이블로 안전하게 마이그레이션합니다.

## 🎯 마이그레이션 목표

- ✅ **데이터 무결성**: 기존 데이터 손실 없이 이전
- ✅ **이중 저장**: 검증 기간 동안 두 곳에 동시 저장
- ✅ **롤백 가능**: 문제 발생 시 즉시 원복 가능
- ✅ **점진적 전환**: 단계별로 안전하게 진행

## 📊 현재 상태

### AppDB (localStorage JSON)
- `players` → ✅ 이미 Supabase `players` 테이블로 이관 완료
- `matches` → ❌ localStorage에만 저장 (마이그레이션 대상)
- `upcomingMatches` → ⚠️ appdb에 유지 (향후 고려)
- `tagPresets` → ✅ appdb.data에 저장 중
- `membershipSettings` → ✅ 별도 테이블로 이관 완료
- `visits` → ✅ appdb.data에 저장 중

### Supabase 테이블
- `players` → 활성 사용 중
- `matches` → 준비 완료 (이제 활성화 예정)
- `appdb` → JSON 백업 & 기타 데이터
- `membership_settings` → 활성 사용 중

## 🚀 마이그레이션 단계

### Phase 1: 준비 (5분)

1. **백업 생성**
   ```javascript
   // 브라우저 개발자 도구 콘솔에서 실행
   import { backupLocalMatches } from './scripts/migrate-matches-to-db.js'
   await backupLocalMatches()
   // JSON 파일이 자동 다운로드됨
   ```

2. **Supabase SQL 실행**
   - Supabase Dashboard → SQL Editor
   - `scripts/matches-table-migration.sql` 내용 복사 & 실행
   - matches 테이블 및 인덱스 생성 완료

### Phase 2: 데이터 마이그레이션 (10분)

1. **마이그레이션 실행**
   ```javascript
   // 브라우저 콘솔에서 실행
   import { migrateMatchesToDB } from './scripts/migrate-matches-to-db.js'
   const result = await migrateMatchesToDB()
   console.log(result)
   // { success: true, migrated: X, skipped: Y, failed: 0 }
   ```

2. **검증**
   ```javascript
   import { verifyMigration } from './scripts/migrate-matches-to-db.js'
   const verification = await verifyMigration()
   console.log(verification)
   // { success: true, localCount: X, dbCount: X, missingInDB: 0 }
   ```

### Phase 3: 이중 저장 활성화 (즉시)

1. **플래그 변경**
   - 파일: `src/services/storage.service.js`
   - 변경: `export const USE_MATCHES_TABLE = true`
   - 저장 후 앱 새로고침

2. **동작 확인**
   - 새 매치 생성 테스트
   - 매치 수정 테스트
   - 매치 삭제 테스트
   - Supabase Dashboard에서 데이터 확인

### Phase 4: 검증 기간 (2-4주)

이 기간 동안:
- ✅ Supabase matches 테이블이 Primary
- ✅ appdb JSON이 Backup (자동 동기화)
- ✅ 데이터 정합성 모니터링
- ✅ 문제 발생 시 즉시 롤백 가능

**정기 검증 (주 1회):**
```javascript
import { verifyMigration } from './scripts/migrate-matches-to-db.js'
await verifyMigration()
```

### Phase 5: 완전 전환 (검증 완료 후)

검증이 완료되면:
1. appdb의 matches 백업 제거 (선택사항)
2. `USE_MATCHES_TABLE` 플래그 제거 (항상 true)
3. 레거시 코드 정리

## 🔄 롤백 방법

문제 발생 시 즉시 원복:

```javascript
// 1. 플래그 변경
// src/services/storage.service.js
export const USE_MATCHES_TABLE = false

// 2. 앱 새로고침
// localStorage appdb의 데이터가 복원됨

// 3. 백업에서 복구 (필요시)
// 백업 JSON 파일을 appdb에 수동으로 복원
```

## 📝 체크리스트

### 마이그레이션 전
- [ ] 백업 생성 완료
- [ ] Supabase SQL 실행 완료
- [ ] 마이그레이션 스크립트 준비

### 마이그레이션 중
- [ ] 데이터 이전 완료 (migrate)
- [ ] 검증 완료 (verify)
- [ ] USE_MATCHES_TABLE = true 설정
- [ ] 앱 동작 확인

### 마이그레이션 후
- [ ] 새 매치 생성 테스트
- [ ] 매치 수정 테스트
- [ ] 매치 삭제 테스트
- [ ] 실시간 동기화 확인
- [ ] 주간 검증 일정 설정

## ⚠️ 주의사항

1. **백업은 필수**: 마이그레이션 전 반드시 백업 생성
2. **검증 필수**: 매 단계마다 데이터 확인
3. **점진적 전환**: 한 번에 모든 기능을 전환하지 말 것
4. **롤백 준비**: 문제 발생 시 즉시 원복 가능하도록 준비

## 🐛 문제 해결

### 마이그레이션 실패
```javascript
// 실패한 매치만 재시도
import { migrateMatchesToDB } from './scripts/migrate-matches-to-db.js'
await migrateMatchesToDB()  // 자동으로 기존 데이터는 스킵
```

### 데이터 불일치
```javascript
// 검증으로 차이 확인
import { verifyMigration } from './scripts/migrate-matches-to-db.js'
const result = await verifyMigration()
console.log('Missing in DB:', result.missingInDB)
```

### 완전 롤백
```javascript
// 1. 플래그를 false로
export const USE_MATCHES_TABLE = false

// 2. 앱 새로고침
location.reload()
```

## 📊 진행 상황 추적

| 단계 | 상태 | 완료일 | 비고 |
|------|------|--------|------|
| 백업 생성 | ⏳ | - | - |
| SQL 실행 | ⏳ | - | - |
| 데이터 마이그레이션 | ⏳ | - | - |
| 검증 | ⏳ | - | - |
| 이중 저장 활성화 | ⏳ | - | - |
| 검증 기간 시작 | ⏳ | - | 2-4주 |
| 완전 전환 | ⏳ | - | - |

## 🎉 마이그레이션 완료 후

- ✅ 데이터베이스 기반 안정성 확보
- ✅ 실시간 동기화 지원
- ✅ 백업 및 복구 용이
- ✅ 확장성 향상
- ✅ localStorage 용량 제한 해결

---

**문의**: 문제 발생 시 즉시 롤백하고 상황 공유
