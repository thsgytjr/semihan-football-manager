# 🚀 빠른 시작: Matches 마이그레이션

## 5분 안에 시작하기

### 1단계: 백업 (1분)
브라우저 개발자 도구 콘솔 열기 → 실행:
```javascript
// 백업 파일 자동 다운로드
const { backupLocalMatches } = await import('./scripts/migrate-matches-to-db.js')
await backupLocalMatches()
```
✅ `matches-backup-2025-11-05.json` 다운로드 완료

### 2단계: SQL 실행 (2분)
1. [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. `scripts/matches-table-migration.sql` 내용 복사
3. Run → ✅ 테이블 생성 완료

### 3단계: 마이그레이션 (2분)
브라우저 콘솔:
```javascript
const { migrateMatchesToDB } = await import('./scripts/migrate-matches-to-db.js')
await migrateMatchesToDB()
// ✅ 마이그레이션 완료: migrated: 50, skipped: 0, failed: 0
```

### 4단계: 활성화 (즉시)
`src/services/storage.service.js` 파일:
```javascript
export const USE_MATCHES_TABLE = true  // false → true 변경
```
앱 새로고침 → ✅ 완료!

---

## 📖 상세 가이드
전체 마이그레이션 가이드: [docs/MATCHES_MIGRATION.md](./MATCHES_MIGRATION.md)

## 🔄 롤백 방법
문제 발생 시:
```javascript
// storage.service.js
export const USE_MATCHES_TABLE = false  // true → false
```
앱 새로고침 → ✅ 원복 완료

## ✅ 이점
- 🗄️ **안정성**: DB 기반 저장
- 🔄 **실시간**: 자동 동기화
- 💾 **백업**: 이중 저장 (검증 기간)
- 📈 **확장성**: localStorage 한계 해결
