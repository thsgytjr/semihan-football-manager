# Google Sheets API 통합 가이드

## 설정 방법

### 1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **API 및 서비스 > 라이브러리**로 이동
4. "Google Sheets API" 검색 후 활성화
5. "Google Drive API"도 활성화 (파일 접근에 필요)

### 2. OAuth 2.0 클라이언트 ID 생성

1. **API 및 서비스 > 사용자 인증 정보**로 이동
2. **+ 사용자 인증 정보 만들기 > OAuth 클라이언트 ID** 클릭
3. 애플리케이션 유형: **웹 애플리케이션** 선택
4. 승인된 JavaScript 원본 추가:
   - `http://localhost:5173` (개발 환경)
   - `https://your-production-domain.com` (프로덕션)
5. 승인된 리디렉션 URI 추가:
   - `http://localhost:5173`
   - `https://your-production-domain.com`
6. 생성 후 **클라이언트 ID** 복사

### 3. 환경 변수 설정

프로젝트 루트에 `.env` 파일 생성:

```bash
# OAuth 클라이언트 ID만 있으면 됩니다!
# API 키는 필요하지 않습니다 - 사용자의 Google 계정으로 인증합니다
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
```

## 사용 방법

### 1. AccountingPage에서 Google 로그인

1. Accounting 페이지의 **스프레드시트** 탭으로 이동
2. **Google 로그인** 버튼 클릭
3. Google 계정 선택 및 권한 승인

### 2. 스프레드시트 연결

1. 로그인 후 **설정** 버튼 클릭
2. Google Sheets URL 입력:
   - 예: `https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit`
3. **저장** 버튼 클릭

### 3. 데이터 읽기/쓰기

- 연결된 스프레드시트의 데이터가 자동으로 로드됩니다
- 테이블 형식으로 표시됩니다
- **Google Sheets에서 열기** 버튼으로 원본 파일 편집 가능
- 편집 후 **새로고침** 버튼으로 최신 데이터 확인
- 모든 변경사항은 Google Drive에 자동 저장됩니다

## 권한 관리

### 필요한 권한
- `https://www.googleapis.com/auth/spreadsheets` - 스프레드시트 읽기/쓰기

### 스프레드시트 공유
- 사용하려는 Google 계정에 스프레드시트 편집 권한이 있어야 합니다
- 스프레드시트 소유자가 아닌 경우, 소유자로부터 편집 권한을 받아야 합니다
## 보안 고려사항

1. **환경 변수 보호**
   - `.env` 파일을 `.gitignore`에 추가 (이미 설정됨)
   - 프로덕션에서는 환경 변수로 관리

2. **OAuth 클라이언트 ID 제한**
   - 승인된 도메인만 추가
   - 승인된 리디렉션 URI 제한

3. **최소 권한 원칙**
   - 필요한 최소한의 범위(scope)만 요청
   - API 키 대신 OAuth 사용으로 사용자별 권한 관리
   - 필요한 최소한의 범위(scope)만 요청

## 문제 해결

### "Not signed in" 오류
- Google 로그인을 먼저 수행해야 합니다
- 로그아웃된 경우 다시 로그인

### "Invalid spreadsheet URL" 오류
- URL 형식 확인: `https://docs.google.com/spreadsheets/d/[ID]/edit`
- 스프레드시트 ID가 올바른지 확인

### "Failed to load sheet" 오류
- 스프레드시트에 대한 접근 권한 확인
- 스프레드시트가 삭제되지 않았는지 확인
- Google Sheets API가 활성화되어 있는지 확인

### CORS 오류
- OAuth 클라이언트 ID 설정에서 현재 도메인이 승인된 원본에 포함되어 있는지 확인

## 기능 확장

`src/services/googleSheets.js`에서 추가 기능 구현 가능:
- `appendSheetData()` - 행 추가
- `createSpreadsheet()` - 새 스프레드시트 생성
- `getSpreadsheetInfo()` - 메타데이터 조회

## 참고 자료

- [Google Sheets API 문서](https://developers.google.com/sheets/api)
- [Google OAuth 2.0 문서](https://developers.google.com/identity/protocols/oauth2)
- [gapi-script GitHub](https://github.com/google/google-api-javascript-client)
