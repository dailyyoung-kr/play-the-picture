# SESSION HANDOFF — 2026-05-12 (Part 2)

> **5/12 저녁 세션** — iOS 앱 폴리싱 1차. Kakao Native SDK 도입·검증, HamburgerMenu RN 이식, Provider 아이콘 표시.

이전 박제: [SESSION_HANDOFF_2026-05-12.md](./SESSION_HANDOFF_2026-05-12.md) (5/12 낮 — 카카오 web 로그인·약관 도입·게이트 ON).

---

## 1. 한 줄 요약

**iOS Expo 앱에 Kakao Native SDK 도입(카톡 deep link + WebView fallback), HamburgerMenu·Settings RN 이식, 닉네임 옆 provider 아이콘 표시 — web·RN 1:1 매칭 완료.**

---

## 2. 작업 내역

### 2-1. Kakao Native SDK 도입 (iOS)

**신규 패키지**:
- `@react-native-kakao/core@2.4.5`
- `@react-native-kakao/user@2.4.5`

**구성 변경**:
- `app.json`:
  - `plugins`: `@react-native-kakao/core` 추가 (`nativeAppKey` 환경변수 주입)
  - `ios.infoPlist.LSApplicationQueriesSchemes`: `kakaokompassauth`, `kakaolink`, `kakaoplus` 추가 (카톡 앱 호출용)
- `.env`: `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY=bead2facfa2b55251310be482c35ce29`
- Kakao Developers 콘솔: Native App Key·iOS Bundle ID 등록

**Server 신규 endpoint**:
- `src/app/api/auth/kakao/native/route.ts` — 이전 핸드오프(part1)에서 작성, 본 세션에서 실전 검증 완료
  - POST body: `{ access_token, device_id?, merge_from? }`
  - flow: Kakao `/v2/user/me` → Supabase user 매칭·생성 → device 마이그 or anon merge → magic link 발급 → token_hash 반환
  - 클라이언트는 token_hash로 `verifyOtp({type:'magiclink'})` 호출해 세션 확립

**Client 신규 함수** — `play-the-picture-app/lib/auth.ts`:
```ts
export async function signInWithKakaoNative(
  mergeFrom?: string,
): Promise<{ ok: boolean; userId?: string }>
```
- `mergeFrom` 옵션 — anon user_id 넘기면 server가 anon→kakao 데이터 merge 수행
- `_layout.tsx` 에서 `initKakaoSDK()` 1회 호출

**LoginGate.tsx 변경** — Native SDK 1순위 시도, 실패 시 WebView fallback (silent).

### 2-2. 검증 결과 (auth_logs)

**Test 1 — Native SDK silent re-login** (기존 카카오 user, kakao_id 매칭):
```
gate_shown          12:04:36  device 183e91c4...
kakao_login_start   12:04:46
kakao_login_success 12:04:51  source: "native"      ← server route
kakao_login_success 12:04:53  method: "native_sdk"  ← client lib/auth
```
- 동의 UI skip 정상 (이미 동의된 계정)
- 소요 시간: 5.3초 (Kakao SDK 토큰 + server roundtrip + magic link + verifyOtp + 마이그)
- web 계정(`milk2177@naver.com`)과 동일 user(`ec914637-...`) 재사용 — cross-platform identity 유지

**Test 2 — anon → kakao merge** (iOS 햄버거 메뉴에서):
```
anonymous_signin_success 12:19:56  device 183e91c4...
identity_link_start      12:20:08  provider: kakao
account_merged           12:20:13  merged_from: 748f16ee...  ← anon
                                   user_id:     ec914637...  ← kakao
kakao_login_success      12:20:14
device_migrated          12:20:16  source: anonymous_signin (idempotent 0건)
```
- anon user → kakao 통합 정상 동작
- `merge_from` 파라미터가 server route로 정확히 전달돼 처리

**Test 3 — device 마이그레이션** (orphan 검증):
```sql
kakao_entries:  14    (web에서 11건 + 추가)
kakao_analyze:  29
kakao_saves:    9
orphan_entries: 0     ← device_id 있는데 user_id null인 row 0건
orphan_analyze: 0
kakao_device_ids: [..., 183e91c4-...]   ← 5개 device 누적 (web 4 + iOS 1)
```

### 2-3. HamburgerMenu RN 이식

**신규 파일** — `components/HamburgerMenu.tsx`:
- 우상단 absolute floating button (40×40, top/right prop)
- Pressable 탭 → `Modal` (transparent + backdrop) → 시트 형태로 메뉴 노출
- 아이콘 분기: 비로그인 = `MoreHorizontal` (⋯), 로그인 = `User` (👤) — web과 동일
- 메뉴 구성:
  - **비로그인**: "로그인" → LoginGate 오픈
  - **로그인 + anon**: 카카오 연동 + Google 연동 + 프로필 편집 + 로그아웃
  - **로그인 + OAuth**: 프로필 편집 + 로그아웃
- `refreshAuth()` — mount 시·메뉴 open 시 fresh fetch (settings 다녀온 후 닉네임 반영)

**Linking 로직**:
- 카카오 연동: `signInWithKakaoNative(userId)` 호출 → server route가 merge 처리
- Google 연동: `signInWithOAuth({provider: "google"})` + callback URL에 `merge_from=${userId}` 추가 → WebView flow

**배치**:
- `app/index.tsx` — 랜딩 우상단 (top: 60, right: 16)
- `app/journal.tsx` — 아카이브 우상단 (top: 60, right: 16)

### 2-4. Settings 페이지 RN

**신규 파일** — `app/settings.tsx`:
- 닉네임 편집 (max 13자, TextInput + KeyboardAvoidingView)
- 저장 → `profiles.nickname` UPDATE → `logAuthEvent("nickname_changed", ...)` → 자동 router.back()
- 비로그인 시 router.replace("/") guard
- web의 NicknameEditor 1:1 매칭

### 2-5. Provider 표시 (web + RN)

**1차 시도 (텍스트 라벨)** → 사용자 요청에 따라 **2차 (아이콘 only)** 로 변경.

**2차 (최종)**:
- 닉네임 **왼쪽**에 18px provider 아이콘 (Kakao 노란 채팅버블 / Google 컬러)
- "비회원"은 텍스트 라벨 유지 (anon은 아이콘 없음)

**Provider 추출 우선순위**:
```ts
const provider = user.user_metadata?.provider ?? user.app_metadata?.provider ?? null;
// Kakao user: app_metadata.provider="email"(Supabase 자동), user_metadata.provider="kakao"(우리 직접 셋)
// Google user: app_metadata.provider="google"(Supabase 자동), user_metadata.provider 없음
```

**파일**:
- `src/components/header/HamburgerMenu.tsx` (web)
- `play-the-picture-app/components/HamburgerMenu.tsx` (RN)

---

## 3. 변경 파일 목록

### Web (`play-the-picture/`)
- `src/components/header/HamburgerMenu.tsx` — provider 상태 + 아이콘 표시

### iOS (`play-the-picture-app/`)
- `lib/auth.ts` — `signInWithKakaoNative(mergeFrom?)` 파라미터 추가
- `components/HamburgerMenu.tsx` ⭐ 신규
- `app/settings.tsx` ⭐ 신규
- `app/index.tsx` — HamburgerMenu 배치
- `app/journal.tsx` — HamburgerMenu 배치

---

## 4. 보류·다음 작업

### 4-1. iOS §13 잔여

- **AccountConflictModal RN 이식** — anon→OAuth merge 시 이메일 충돌 UI (지금은 server route가 409 반환만, UI 없음)
- **journal/result/preference user_id 흐름 점검** — web과 동일하게 user_id 박는지 확인
- **로그아웃 후 archive 빈 상태 UX** (web 1:1)
- **Apple Sign-In** — Apple Developer 승인 후 native AuthenticationServices framework 도입
- **Universal Links** — playthepicture.com/share/... 을 앱에서 직접 열기
- **카톡 미설치 시 WebView fallback 실전 테스트** (현재는 silent re-login 케이스만 검증됨)

### 4-2. 모니터링

- Native SDK login 평균 소요시간 (현재 5.3초) — server 측 listUsers loop가 bottleneck 가능성, perf 분석 필요
- `account_merged` 빈도 — anon→kakao 전환률
- 5/13~ web 카카오 로그인 도입 후 funnel 추적

### 4-3. 광고·운영 (이전 핸드오프 §12 잔재)

이전 part1 §12-4의 잔여 작업 (5/12 18:30 KST 게이트 ON 후 24시간 지표 관찰) — **5/13 오전 우선 체크**:
- 게이트 통과율 (gate_shown → guest_skip 비율)
- 카카오 로그인 첫날 비율
- 분석 진입률 변동 (게이트 도입 전후 대비)

---

## 5. 검증 SQL

```sql
-- iOS 카카오 로그인 활동
select created_at, event, metadata->>'source' as source, metadata->>'method' as method
from auth_logs
where created_at >= '2026-05-12'
  and metadata->>'platform' = 'app'
  and event like 'kakao_%'
order by created_at desc;

-- anon → OAuth merge 발생 카운트
select date(created_at AT TIME ZONE 'Asia/Seoul') as day,
       metadata->>'provider' as provider,
       count(*) as merges
from auth_logs
where event = 'account_merged'
  and created_at >= '2026-05-12'
group by 1, 2 order by 1 desc;

-- iOS device 마이그 결과 (orphan 검증)
select
  (select count(*) from entries where device_id = ? and user_id is null) as orphan_entries,
  (select count(*) from analyze_logs where device_id = ? and user_id is null) as orphan_analyze;
```

---

## 6. 환경 변수 (참고)

### iOS `.env`
```
EXPO_PUBLIC_SUPABASE_URL=https://vwyytppyvmkpwzjcfnzr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
EXPO_PUBLIC_API_BASE_URL=https://playthepicture.com
EXPO_PUBLIC_WEB_BASE_URL=https://playthepicture.com
EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY=bead2facfa2b55251310be482c35ce29
EXPO_PUBLIC_ENABLE_ANALYTICS=true
```

### Web Vercel env (이전 박제)
- `KAKAO_REST_API_KEY=89743153cd57f3ee74a270db81758765`
- `KAKAO_CLIENT_SECRET=k0oUTSx3IR521wJbIpW2mLeaSm6eEv8I`
- `KAKAO_REDIRECT_URI=https://playthepicture.com/api/auth/kakao/callback`

---

## 7. 검증 환경 (참고)

- 디바이스: 실제 iPhone (iOS 26.4.2)
- Xcode 26.5 + iOS 26.5 Simulator SDK 다운로드 후 빌드 성공
- Metro: `npx expo start --dev-client` (port 8081)
- Expo Development Build (Expo Go 아님, `expo prebuild --clean` + `expo run:ios --device`)

---

## 끝

내일(5/13) 작업 시 이 핸드오프 + part1을 함께 읽어 컨텍스트 복원.
