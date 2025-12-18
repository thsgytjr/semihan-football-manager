# Google Sheets 연동 간단 가이드

## 빠른 시작

### 1. Google Cloud 설정 (5분)

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **API 및 서비스 > 라이브러리** 에서:
   - "Google Sheets API" 검색 → **사용 설정**
   - "Google Drive API" 검색 → **사용 설정**

4. **API 및 서비스 > 사용자 인증 정보**:
   
   **OAuth 클라이언트 ID 만들기:** (API 키는 필요 없습니다!)
   - **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 JavaScript 원본:
     - `http://localhost:5173`
     - (배포 시) `https://yourdomain.com`
   - 승인된 리디렉션 URI:
     - `http://localhost:5173`
     - (배포 시) `https://yourdomain.com`
   - **만들기** 클릭 → 클라이언트 ID 복사

### 2. 환경 변수 설정 (1분)

프로젝트 루트에 `.env` 파일 생성:

```bash
# OAuth 클라이언트 ID만 있으면 됩니다!
VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

### 3. 앱에서 사용 (1분)

1. 앱 실행: `npm run dev`
2. **Accounting** 페이지 → **스프레드시트** 탭
3. **Google 로그인** 클릭
4. **설정** 버튼 클릭 → Google Sheets URL 입력
   ```
   https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit
   ```
5. **저장** 클릭

완료! 이제:
- ✅ 스프레드시트 데이터가 표시됩니다
- ✅ DB에 저장되어 다음 로그인에도 유지됩니다
- ✅ Google Sheets에서 직접 편집 가능
- ✅ 변경사항 자동으로 Google Drive에 저장

## 작동 방식

- **Google 로그인**: 관리자의 Google 계정으로 OAuth 2.0 인증 (API 키 불필요!)
- **사용자별 권한**: 로그인한 사용자가 접근 가능한 스프레드시트만 사용
- **URL 저장**: Supabase DB의 `app_settings` 테이블에 저장
- **자동 로드**: 다음 로그인 시 저장된 URL로 자동 연결
- **실시간 동기화**: Google Sheets API로 직접 읽기/쓰기
- **자동 저장**: 모든 변경사항은 Google Drive에 자동 저장

## 문제 해결

**"로그인이 필요합니다" 오류**
- `.env` 파일이 있는지 확인
- OAuth 클라이언트 ID가 올바른지 확인
- 앱 재시작: `npm run dev`

**"스프레드시트를 로드할 수 없습니다" 오류**
- 스프레드시트 URL이 올바른지 확인
- 해당 Google 계정에 스프레드시트 접근 권한이 있는지 확인

**CORS 오류**
- Google Cloud Console에서 현재 도메인이 승인된 원본에 포함되어 있는지 확인
