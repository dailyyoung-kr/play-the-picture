---
name: EXTERNAL_SETUP_auth
description: Phase 1A 외부 셋업 가이드 — Apple Developer Program / Google Cloud OAuth / Supabase Auth provider 등록. 사용자 직접 진행 필요.
type: setup
created: 2026-05-11
---

# Phase 1A 외부 셋업 가이드

> 5/11 작성. spec: [SPEC_phase1_auth.md](./SPEC_phase1_auth.md)
> 이 문서는 **사용자 직접** 진행할 외부 셋업 step-by-step.
> 내부 코드 작업(Claude)은 셋업과 병렬 진행 가능.

---

## 🔑 우리 프로젝트 고정 값 (복붙용)

이 값들은 셋업 곳곳에 입력해야 함:

| 항목 | 값 |
|---|---|
| Supabase 프로젝트 ref | `vwyytppyvmkpwzjcfnzr` |
| **Supabase Auth callback URL** | `https://vwyytppyvmkpwzjcfnzr.supabase.co/auth/v1/callback` |
| Production URL | `https://play-the-picture.vercel.app` |
| Local URL | `http://localhost:3000` |
| 앱 이름 (consent screen) | `Play the Picture` |
| 앱 도메인 | `play-the-picture.vercel.app` |
| 운영자 이메일 | `pcy2177@gmail.com` |

---

## 진행 순서·예상 시간

```
오늘 (병렬):
├─ ① Apple Developer Program 가입 신청 (10분 + 승인 대기 1-3일)
└─ ② Google Cloud OAuth Client (20-30분)
       ↓
   ③ Supabase Dashboard에 Google provider 등록 (5분)
       ↓
   ④ Supabase Auth Redirect URL 등록 (5분)
       ↓
   → 여기서 일단 Google + 게스트로 개발·테스트 시작 가능

승인 후 (1-3일 뒤):
├─ ⑤ Apple Sign-In Service ID + Key 생성 (20-30분)
└─ ⑥ Supabase Dashboard에 Apple provider 등록 (5분)
       ↓
   → Apple Sign-In 활성화
```

---

## ① Apple Developer Program 가입 신청 (10분 + 1-3일 대기)

### 왜 필요한가
- 무료 Apple Developer 계정은 Sign-In with Apple 키 생성 불가
- $99/년 paid program 필수
- iOS 앱 출시(Phase 4)에도 어차피 필요

### 단계

1. **Apple ID로 로그인**: https://developer.apple.com/account
2. 좌측 메뉴 **"Membership"** 클릭
3. **"Enroll"** 버튼 클릭
4. 약관 동의 → **"Continue Enrollment"**
5. Entity Type 선택:
   - **Individual / Sole Proprietor** 선택 (개인) ← 추천
   - Organization은 D-U-N-S 번호 필요 (2주+ 소요)
6. 개인 정보 입력 (영문):
   - Legal First Name / Last Name (여권 영문명 사용 권장)
   - Address (영문 주소 변환: jusoen.com 등 활용)
   - Phone (+82 10-XXXX-XXXX)
7. 결제 정보 입력 ($99/년, USD)
8. **승인 대기** (보통 24-48시간, 한국 1-3일)
   - 이메일로 Apple에서 추가 정보 요청할 수 있음 → 빠른 응답

### 승인되면
- `developer.apple.com/account`에서 **"Certificates, Identifiers & Profiles"** 메뉴 활성화됨
- 이 메뉴 보이면 ⑤번 단계로 진행

---

## ② Google Cloud OAuth Client ID (20-30분)

### 단계

#### 2-1. Google Cloud Console 접속
1. https://console.cloud.google.com 접속 (`pcy2177@gmail.com` 로그인)
2. 상단 프로젝트 선택 드롭다운 → **"새 프로젝트"** (또는 기존 프로젝트 활용)
3. 프로젝트 이름: `Play the Picture` → **만들기**
4. 생성된 프로젝트로 전환

#### 2-2. OAuth consent screen 설정
1. 좌측 햄버거 메뉴 → **"API 및 서비스"** → **"OAuth 동의 화면"**
2. User Type: **"외부"** 선택 → **만들기**
3. 앱 정보 입력:
   - 앱 이름: `Play the Picture`
   - 사용자 지원 이메일: `pcy2177@gmail.com`
   - 앱 로고: 일단 skip (나중에 업로드 가능)
   - **앱 도메인** 섹션:
     - 애플리케이션 홈페이지: `https://play-the-picture.vercel.app`
     - 개인정보처리방침 URL: `https://play-the-picture.vercel.app/privacy` *(없으면 일단 home URL 같은 거 입력)*
     - 서비스 약관 URL: `https://play-the-picture.vercel.app/terms` *(없으면 home URL)*
   - **승인된 도메인**: `vercel.app` 추가 → Enter
   - 개발자 연락처 정보: `pcy2177@gmail.com`
4. **저장하고 계속** 클릭
5. **범위(scopes)** 페이지: 기본값 그대로 → **저장하고 계속**
6. **테스트 사용자** 페이지: `pcy2177@gmail.com` 추가 → **저장하고 계속**
7. 요약 페이지 → **대시보드로 돌아가기**

> ⚠️ 앱이 "테스트" 상태일 동안엔 추가한 테스트 사용자만 로그인 가능.
> 출시 후 production 검증 받으면 일반 사용자 OK (Phase 1A 끝나고 신청).

#### 2-3. OAuth Client ID 생성
1. 좌측 **"API 및 서비스"** → **"사용자 인증 정보"**
2. 상단 **"+ 사용자 인증 정보 만들기"** → **"OAuth 클라이언트 ID"**
3. 애플리케이션 유형: **"웹 애플리케이션"** 선택
4. 이름: `Play the Picture - Web Client`
5. **승인된 자바스크립트 원본** — 다음 3개 추가:
   ```
   http://localhost:3000
   https://play-the-picture.vercel.app
   https://vwyytppyvmkpwzjcfnzr.supabase.co
   ```
6. **승인된 리디렉션 URI** — 다음 1개 추가:
   ```
   https://vwyytppyvmkpwzjcfnzr.supabase.co/auth/v1/callback
   ```
7. **만들기** 클릭
8. **Client ID** + **Client Secret** 표시됨 → **둘 다 복사해서 안전한 곳에 저장**
   - 잃어버려도 다시 볼 수 있지만, Secret은 한 번만 노출됨

#### 2-4. (선택) Google 검색 API enable
- 우리는 OAuth만 쓰므로 추가 API enable 불필요

---

## ③ Supabase Dashboard에 Google provider 등록 (5분)

1. https://supabase.com/dashboard/project/vwyytppyvmkpwzjcfnzr 접속
2. 좌측 메뉴 **"Authentication"** → **"Providers"** (또는 "Sign In / Up")
3. **Google** 행 찾기 → 토글 ON
4. 입력:
   - **Client ID (for OAuth)**: ②-3에서 복사한 Client ID
   - **Client Secret (for OAuth)**: ②-3에서 복사한 Client Secret
   - **Skip nonce check**: OFF (기본)
   - **Callback URL** 박스는 자동 표시 (`https://vwyytppyvmkpwzjcfnzr.supabase.co/auth/v1/callback`) — 이미 ②-3에 등록한 값
5. **Save** 클릭

---

## ④ Supabase Auth URL Configuration (5분)

1. Supabase Dashboard → **"Authentication"** → **"URL Configuration"**
2. **Site URL** 입력: `https://play-the-picture.vercel.app`
3. **Redirect URLs** (Allow List)에 다음 4개 추가:
   ```
   http://localhost:3000/auth/callback
   http://localhost:3000/**
   https://play-the-picture.vercel.app/auth/callback
   https://play-the-picture.vercel.app/**
   https://*-pcy-mac.vercel.app/**
   ```
   *(맨 마지막은 Vercel preview deployment 패턴 — 자신의 Vercel team scope에 맞춰 조정 필요할 수 있음)*
4. **Save changes**

---

## ⑤ (Apple 승인 후) Apple Sign-In Service ID + Key 생성

> Apple Developer Program 승인 이메일 받은 후 진행. 약 20-30분 소요.

### 5-1. App ID 생성 (또는 확인)
1. https://developer.apple.com/account → **"Certificates, Identifiers & Profiles"**
2. 좌측 **"Identifiers"** → 우측 상단 **"+"**
3. **"App IDs"** 선택 → **Continue**
4. **"App"** 선택 → **Continue**
5. 입력:
   - Description: `Play the Picture`
   - Bundle ID: **Explicit** 선택 → `com.playthepicture.app` *(미래 iOS 앱용)*
6. **Capabilities** 목록에서 **"Sign In with Apple"** 체크박스 ON
7. **Continue** → **Register**

### 5-2. Service ID 생성 (웹 Sign-In용)
1. 다시 **"Identifiers"** → **"+"**
2. **"Services IDs"** 선택 → **Continue**
3. 입력:
   - Description: `Play the Picture Web`
   - Identifier: `com.playthepicture.web` ← **이 값이 Supabase의 "Client ID"가 됨**
4. **Continue** → **Register**
5. 방금 만든 Service ID 클릭 (목록에서)
6. **"Sign In with Apple"** 체크박스 ON → 옆의 **"Configure"** 클릭
7. Primary App ID: 5-1에서 만든 App ID (`com.playthepicture.app`) 선택
8. **Domains and Subdomains**:
   ```
   vwyytppyvmkpwzjcfnzr.supabase.co
   ```
9. **Return URLs**:
   ```
   https://vwyytppyvmkpwzjcfnzr.supabase.co/auth/v1/callback
   ```
10. **Next** → **Done** → **Continue** → **Save**

### 5-3. Sign In with Apple Key 생성
1. 좌측 **"Keys"** → **"+"**
2. Key Name: `Play the Picture SIWA Key`
3. **"Sign In with Apple"** 체크박스 ON → 옆의 **"Configure"** 클릭
4. Primary App ID: `com.playthepicture.app` 선택 → **Save**
5. **Continue** → **Register**
6. **Download** 버튼 클릭 → `.p8` 파일 다운로드 (⚠️ **한 번만 다운로드 가능**)
7. 화면에 표시된 **Key ID** 메모 (예: `ABC123DEF4`)
8. 우측 상단 본인 이름 클릭 → **Team ID** 메모 (예: `XYZ789ABCD`)

### 5-4. Client Secret 생성 (JWT)
Apple은 Client Secret을 직접 발급 X — 위에서 받은 `.p8` 파일로 **JWT를 생성**해서 사용. Supabase Dashboard가 이 JWT 자동 생성 지원 (아래 ⑥에서):
- Team ID
- Key ID
- Service ID
- .p8 파일 내용

다 입력하면 Supabase가 Client Secret JWT 자동 생성.

---

## ⑥ (Apple 승인 후) Supabase Dashboard에 Apple provider 등록 (5분)

1. Supabase Dashboard → **"Authentication"** → **"Providers"**
2. **Apple** 행 찾기 → 토글 ON
3. 입력:
   - **Client ID (for OAuth)**: 5-2의 Service ID (`com.playthepicture.web`)
   - **Secret Key (for OAuth)**: 5-3의 `.p8` 파일 내용 **전체 복붙** (BEGIN ~ END 포함)
   - **Team ID**: 5-3의 Team ID
   - **Key ID**: 5-3의 Key ID
4. **Save**

> Supabase가 .p8 + Team/Key/Service ID로 JWT Client Secret 자동 생성·갱신.

---

## 셋업 완료 후 알려줄 값

이 단계들 끝나면 다음 값을 알려줘 (Claude가 코드 작업에 사용):

### Google 셋업 완료 후 (③ 끝):
```
✅ Google Client ID: (Supabase Dashboard에서 다시 확인 가능)
✅ Supabase Provider 등록 완료
```
→ 이 시점에서 Claude가 로그인 컴포넌트의 Google 버튼 활성화.

### Apple 셋업 완료 후 (⑥ 끝):
```
✅ Apple Service ID: com.playthepicture.web (또는 본인이 정한 값)
✅ Supabase Provider 등록 완료
```
→ 이 시점에서 Claude가 Apple 버튼 활성화.

---

## ⚠️ 자주 발생하는 함정

### Google
- consent screen "테스트" 상태에선 등록한 테스트 사용자만 로그인 가능 → Phase 1A는 OK, 출시 후 "production" 신청
- "승인된 자바스크립트 원본"에 Supabase URL 빼면 invalid request 에러
- localhost는 https 없어도 OK (Google 예외)

### Apple
- Service ID와 App ID 헷갈리기 쉬움: **Service ID = 웹 OAuth용 Client ID**
- `.p8` 파일은 **단 1회 다운로드** — 잃어버리면 새 Key 생성
- Domain 등록할 때 Supabase URL 도메인만 (`vwyytppyvmkpwzjcfnzr.supabase.co`), `https://` 없이
- Apple은 첫 로그인 시에만 email 줌, 두 번째부터는 user ID만 → DB에 email 저장은 첫 로그인 응답에서

### Supabase
- Site URL과 Redirect URLs 모두 정확히 설정해야 redirect 작동
- Vercel preview deployment URL 패턴 wildcard 등록 안 하면 preview 환경에서 로그인 실패

---

## 다음 단계 (Claude 작업)

이 셋업과 병렬로 Claude가 진행:
1. DB migration 작성 (사용자 검토 후 적용)
2. `LoginGate` / `WelcomeNickname` 컴포넌트 골격 (Google + 게스트 + Apple placeholder)
3. 데이터 마이그레이션 로직 (callback handler)
4. 닉네임 자동 부여 trigger
5. auth_logs 이벤트 트래킹
