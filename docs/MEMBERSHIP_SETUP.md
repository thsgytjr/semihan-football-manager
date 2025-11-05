# 멤버십 시스템 업그레이드 가이드

## 🎯 개요
`appdb` 테이블을 건드리지 않고 안전하게 새로운 `membership_settings` 테이블을 추가하는 방법입니다.

## 📋 필요한 작업

### 1. Supabase SQL 스크립트 실행

#### 방법 A: Supabase Dashboard에서 실행 (권장)
1. Supabase 프로젝트 대시보드 접속
   - 세미한 FC: https://zevkvfsfxxomfxwygcqm.supabase.co
   
2. 왼쪽 메뉴에서 **SQL Editor** 클릭

3. `scripts/create-membership-settings-table.sql` 파일 내용을 복사하여 붙여넣기

4. **Run** 버튼 클릭하여 실행

5. 결과 확인:
   ```sql
   SELECT * FROM membership_settings ORDER BY sort_order;
   ```
   - 3개의 기본 멤버십(정회원, 준회원, 게스트)이 표시되어야 합니다.

#### 방법 B: psql CLI에서 실행
```bash
# Supabase 연결 정보로 psql 실행
psql -h [YOUR_SUPABASE_HOST] -U postgres -d postgres -f scripts/create-membership-settings-table.sql
```

### 2. 앱 재시작
SQL 스크립트 실행 후 앱을 재시작하면 자동으로 새 테이블을 인식합니다.

```bash
npm run dev
```

## ✅ 완료 체크리스트

- [ ] `membership_settings` 테이블 생성됨
- [ ] 기본 멤버십 3개가 삽입됨 (정회원, 준회원, 게스트)
- [ ] RLS 정책이 설정됨
- [ ] 앱이 정상적으로 시작됨
- [ ] 콘솔에 "✅ membership_settings 테이블 확인됨" 메시지 표시

## 🔒 안전성

### appdb 테이블은 건드리지 않습니다!
- ✅ 새로운 `membership_settings` 테이블만 생성
- ✅ 기존 데이터에 영향 없음
- ✅ 롤백이 쉬움 (테이블만 삭제하면 됨)

### 롤백 방법 (필요시)
```sql
DROP TABLE IF EXISTS membership_settings CASCADE;
```

## 📊 테이블 구조

```sql
CREATE TABLE membership_settings (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,        -- 멤버십 이름
  badge TEXT,                        -- 배지 (1글자)
  badge_color TEXT DEFAULT 'stone', -- 배지 색상
  deletable BOOLEAN DEFAULT true,   -- 삭제 가능 여부
  sort_order INTEGER DEFAULT 0,     -- 정렬 순서
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 🎨 기능

1. **커스텀 멤버십 추가**: 팀에 맞는 멤버십 타입 생성
2. **배지 커스터마이징**: 1글자 배지 + 9가지 색상
3. **실시간 동기화**: 모든 클라이언트에 즉시 반영
4. **안전한 삭제**: 사용 중인 멤버십은 삭제 방지

## 🚨 문제 해결

### "membership_settings 테이블이 없습니다" 오류
→ SQL 스크립트를 아직 실행하지 않았습니다. 위의 1단계를 진행하세요.

### "Permission denied for table membership_settings"
→ RLS 정책 문제일 수 있습니다. SQL 스크립트를 다시 실행하세요.

### 멤버십 추가/수정이 안 됨
→ 관리자 로그인이 필요합니다. 로그인 후 다시 시도하세요.

## 📞 지원

문제가 계속되면 다음을 확인하세요:
1. 브라우저 콘솔 (F12) 에러 메시지
2. Supabase Dashboard → Database → Tables에서 `membership_settings` 테이블 확인
3. Supabase Dashboard → Authentication에서 로그인 상태 확인
