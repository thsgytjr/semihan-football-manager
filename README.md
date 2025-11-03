# ⚽ Football Manager

풋살 팀 관리 플랫폼 - 선수 관리, 경기 기록, 통계 분석, 드래프트 모드

## 🎯 주요 기능

- **선수 관리**: 선수 등록, 능력치 관리, 사진 업로드
- **경기 기록**: 경기 결과 입력, 골/어시스트 기록
- **통계 분석**: 개인/팀 통계, 리더보드, 순위 변동
- **드래프트 모드**: 주장 선정, 선수 선택, 자동 팀 밸런싱
- **예정 매치**: 다가오는 경기 관리
- **Analytics**: 방문자 통계, OS/브라우저 분석

## 🚀 빠른 시작

### 로컬 개발
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build
```

### 환경변수 설정
`.env.local` 파일 생성:
```bash
VITE_TEAM_NAME="팀 이름"
VITE_TEAM_SHORT_NAME="team-short"
VITE_TEAM_PRIMARY_COLOR="#10b981"

VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-key
```

## 📦 새 팀 배포

이 플랫폼은 **멀티 테넌트** 구조로, 여러 팀이 독립적으로 사용할 수 있습니다.

### 빠른 배포 (3단계)

1. **Supabase 프로젝트 생성**
   - https://supabase.com 에서 새 프로젝트 생성
   - SQL 스키마 실행 (DEPLOYMENT_GUIDE.md 참고)

2. **Vercel에 배포**
   - 이 레포지토리를 Vercel에 Import
   - 환경변수 입력 (팀 정보 + Supabase Keys)

3. **완료!**
   - `your-team.vercel.app`에서 바로 사용 가능

**자세한 가이드**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

## 🏗️ 기술 스택

- **Frontend**: React 19, Vite
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Auth**: Supabase Auth
- **Deployment**: Vercel
- **Charts**: Recharts
- **Drag & Drop**: dnd-kit

## 📂 프로젝트 구조

```
src/
├── components/     # 재사용 컴포넌트
├── pages/          # 페이지 컴포넌트
├── lib/            # 유틸리티, 로직
│   ├── teamConfig.js       # 팀별 설정
│   ├── supabaseClient.js   # Supabase 클라이언트
│   ├── storage.js          # 로컬스토리지
│   └── ...
├── services/       # API 서비스
└── utils/          # 헬퍼 함수
```

## 🎨 팀 커스터마이징

각 팀은 다음을 커스터마이즈할 수 있습니다:

- 팀 이름 및 로고
- 테마 색상
- 기능 활성화/비활성화
- 독립적인 데이터베이스

환경변수로 간단하게 설정 가능합니다.

## 📊 데이터 구조

- **Players**: 선수 정보, 능력치, 멤버십
- **Matches**: 경기 결과, 출전 선수, 통계
- **Upcoming Matches**: 예정된 경기, 참가자
- **Visit Logs**: 방문자 추적 (Analytics용)

## 🔐 보안

- Row Level Security (RLS) 지원
- 팀별 데이터 완전 격리
- Supabase Auth 통합
- 개발 환경 방문 추적 제외

## 📝 라이선스

MIT License

## 🤝 기여

Issues와 Pull Requests를 환영합니다!

## 📞 문의

문제가 있으면 GitHub Issues에 올려주세요.

