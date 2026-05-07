# Session Handoff — 2026-05-07

> 5/7 작업 박제. 어드민 inapp_shown PATCH fix + **네이티브 앱 Phase 0~2 진행 (Expo)**. iOS 인스타 스토리 1-tap 검증 완료.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-04.md](./SESSION_HANDOFF_2026-05-04.md)

---

## 1. 한 줄 요약

**Expo 기반 네이티브 앱 PoC 완성**. 사진→분석→결과→**인스타 스토리 1-tap** 흐름 iOS 본인 폰에서 검증. §7-G 박제된 "안드 인스타 인앱 viral 0% / iOS cancel 42%" 가설 → **네이티브 앱이 진짜 viral 가치 만든다**는 결정적 증거 (iOS). 안드 검증은 5/8 친구 폰 예정.

---

## 2. 어드민 — 5/5~5/6 데이터 점검 + inapp_shown fix

### 2-1. 5/5~5/6 KST 핵심 지표 (정확 boundary 사용)

⚠️ **버그 박제** — `DATE 'X' AT TIME ZONE` 표현식의 boundary 폭에 따라 PostgreSQL이 일관되지 않게 평가. 같은 5/5 데이터인데 5/5~5/7 group by에선 188, 5/5~5/7 단일 boundary에선 69. **정확한 boundary는 `TIMESTAMPTZ '2026-05-05 00:00:00+09'` 명시**.

| 단계 | 5/5 | 5/6 |
|---|---|---|
| 분석 시도 | 188 | 43 |
| 분석 성공 | **172** | 43 |
| 분석 실패 | 15 (8%) | 0 |
| unique device | 70 | 17 |
| entries | 45 | 5 |
| share_logs | 5 | 1 |
| share_views | 3 unique | 2 unique |
| try_click | 1 | 2 |

5/5 viral 피크 — 70 unique device (직전 평균 +27%).

### 2-2. ⚠️ UTM `{{campaign.name}}` 36건 (5/5~5/6)

meta 광고 set의 UTM 변수 치환 실패. 트래킹 누수. **즉시 광고 set 점검 필요**.

### 2-3. android_insta_inapp story 14건 모두 'generated' — 진짜 원인

§7-D-2 박제 시점에 **DB constraint는 추가했지만 라우트 ALLOWED_STATUS 화이트리스트는 누락**. `inapp_shown` PATCH 시 400 invalid status 응답 → DB update X.

**fix (commit `f856d72`)** — [src/app/api/log-story-save/[id]/route.ts:9-16](src/app/api/log-story-save/[id]/route.ts:9):
```ts
const ALLOWED_STATUS = new Set([
  "clicked", "generated", "shared", "cancelled", "downloaded", "failed",
  "inapp_shown",  // ★ 추가
]);
```

→ 5/4~5/6 누적된 14건은 영원히 'generated'로 박제됨 (소급 fix 불가). 5/7부터 정상 분류.

### 2-4. 5/4 박제와 비교 점검 검증

- §7-D-2 DDL — 정상 적용 (pg_constraint에 inapp_shown 포함됨)
- §7-D-3 코드 — 정상 (handleStorySave 분기에 patchStoryStatus("inapp_shown") 호출됨)
- 빠진 건 ALLOWED_STATUS 화이트리스트 1줄. **DDL ↔ 라우트 화이트리스트 동기화 필요**.

---

## 3. 네이티브 앱 Phase 0~2 — 본 세션 핵심

### 3-1. 의사결정 박제

| # | 결정 |
|---|---|
| 빌드 도구 | **Expo + React Native** (Xcode 단독·React Native raw 비교) |
| 앱 이름 | **플더픽** (앱스토어 표시: `플더픽 - Play the Picture`) |
| **번들 ID** | **`com.playthepicture.app`** (변경 거의 불가) |
| 사용자 ID | **device_id 유지** (web과 별도 UUID) |
| 로그인 | MVP X, Phase 3 이후 |
| 단독 기능 | MVP는 web parity만 |
| GitHub repo | **`dailyyoung-kr/play-the-picture-app` (private)** |
| Facebook App ID | **`2449124362263833`** (인스타 스토리 sharedSticker용) |
| Apple Developer | 보류. 무료 Apple ID + Personal Team으로 본인 폰 검증 (7일 만료) |

### 3-2. 환경 셋업 (호스트 Mac)

세션 중 설치한 도구:
- **Homebrew** (`/opt/homebrew/`) + `.zprofile` PATH 등록
- **gh CLI** — `gh auth login` 완료 (login: dailyyoung-kr, 본인 user 계정)
- **Xcode 26.4.1** — App Store + 무료 Apple ID 등록 (Personal Team)
- **Expo Dev Client + react-native-share** + 의존성 (아래 §3-7)

### 3-3. 새 RN 프로젝트 — `~/play-the-picture-app/`

```
~/play-the-picture-app/
├── app/
│   ├── _layout.tsx          (Stack + DM Sans 로딩)
│   ├── index.tsx            (메인 화면 — web 1:1)
│   ├── preference.tsx       (장르·에너지 선택 + 분석 호출)
│   └── result.tsx           (결과 화면 + storyCard offscreen + 인스타 1-tap)
├── components/
│   └── StoryCard.tsx        (1080x1920 9:16 카드, 사진 1~5장 layout)
├── lib/
│   ├── supabase.ts          (insertLog wrapper — platform/os 자동)
│   ├── device.ts            (AsyncStorage UUID)
│   ├── analytics.ts         (EXPO_PUBLIC_ENABLE_ANALYTICS)
│   └── imageUtils.ts        (사진 800px 압축 + base64)
├── ios/                     (prebuild 자동 생성, .gitignore)
├── app.json                 (LSApplicationQueriesSchemes + bundle id)
├── .env                     (Supabase·API base URL·analytics)
└── package.json             (의존성 — §3-7)
```

### 3-4. RN 코드 — web과 1:1 매칭 작업

**메인 화면 (`app/index.tsx`)** — web `src/app/page.tsx` 1:1:
- 그라데이션 배경 (`expo-linear-gradient`)
- "Play the Picture" 영문 — **DM Sans Light 300** (`@expo-google-fonts/dm-sans` + expo-font plugin)
- 사진 5장 멀티 선택 (`expo-image-picker` `allowsMultipleSelection`)
- AsyncStorage `ptp_photos`로 영구 저장
- ✕ 버튼·+ 슬롯·카운트 pill·하단 네비
- 사진 자동 정리 정책 — **메인 mount 시 `AsyncStorage.removeItem("ptp_photos")`** (사용자 결정 B' — 결과 후 ←preference 재분석은 사진 유지)

**preference 화면 (`app/preference.tsx`)** — web 1:1:
- "오늘의 취향" / "정확한 추천을 위해 두 가지만 알려주세요"
- "어떤 음악이 끌려요?" / "어떤 바이브로 듣고 싶어요?"
- 장르 chip 7개 + 에너지 chip 5개 (활성 시 핑크 30% bg + 1.5px 핑크 테두리)
- 하단 네비 (아카이브 / 노래 추천받기)
- 분석 호출 — `${API_BASE}/api/analyze` POST + analyze_logs INSERT/UPDATE
- 단순 spinner 로딩 (3단계 애니메이션은 미적용 — 추후)

**result 화면 (`app/result.tsx`)** — web 1:1:
- **앨범아트 3-layer 블러 배경** (`expo-image` `blurRadius`):
  - Layer 1: cover scale 1.5 + blurRadius 40
  - 검은 오버레이 0.45 (brightness 0.55 흉내)
  - Layer 2: cover (모바일 세로 비율 최적화) + blurRadius 12 (인물 윤곽 부드럽게)
  - 검은 오버레이 0.1
  - LinearGradient (위→아래 어두워짐)
- "Play the Picture / 플더픽의 추천곡" 헤더 (DM Sans)
- 사진 슬롯 (장수별 사이즈)
- "오늘의 당신은" 카드 (vibeType + vibeDescription)
- 곡명·아티스트·태그 chip
- "플더픽이 추천한 이유" 박스 (#f0d080)
- **사진 확대 모달** (RN `Modal` + 좌/우 화살표 + 카운터, web 1:1)
- 좌상단 X 제거 (web에 없음)
- "📸 스토리용 이미지" 버튼 ← Phase 2 추가
- "처음으로" 버튼

**StoryCard 컴포넌트 (`components/StoryCard.tsx`)** — Phase 2 정교화:
- 1080x1920 9:16
- 배경 albumArt blurRadius 50 + 검은 오버레이 0.55
- 상단 "Play the Picture" 30px DM Sans + "플더픽의 추천곡" 26px
- **사진 1~5장 layout 분기** — web 1:1:
  - 1장: 760x760
  - 2장: 474x474 가로
  - 3장: 좌 638x638 + 우 309x309 ×2 세로 스택 (§7-A 박제 viral 우위)
  - 4장: 2x2 grid 380x380
  - 5장: 위 2장 + 아래 3장 (309x309)
- 캐릭터 박스 (28/46/30, padding 36/40, radius 36)
- 곡명 72px 600 + 아티스트 36px (태그 X — web 의도)
- "플더픽이 추천한 이유" 박스 (28px #f0d080 + 본문 34px lineHeight 58)

### 3-5. Phase 2 — 핵심 viral 가치

**iOS 인스타 스토리 1-tap 작동 흐름**:
```
result 화면 "📸 스토리용 이미지" 탭
  ↓
react-native-view-shot으로 1080x1920 PNG 캡처 (offscreen StoryCard)
  ↓
react-native-share Share.shareSingle({
  social: INSTAGRAM_STORIES,
  backgroundImage: uri,
  appId: "2449124362263833",  // ← Facebook App ID
  attributionURL: "https://playthepicture.com",
})
  ↓
iOS Pasteboard sharedSticker (com.instagram.sharedSticker.backgroundImage)
  ↓
instagram-stories://share?source_application=2449124362263833 deep link
  ↓
인스타 앱 자동 열림 + storyCard 자동 첨부 + 인스타 스토리 편집 화면 직진
  ↓
좌상단 "◀ 플더픽" — attribution 표시
```

**검증 완료** (사용자 본인 iPhone) — "플더픽에서 Instagram에 붙여넣기 됨" 메시지 + 자동 첨부 ✅.

**Expo Go 한계**:
- `react-native-share`는 native module — Expo Go에서 작동 X
- `Constants.executionEnvironment === "storeClient"` 체크 후 lazy require
- Expo Go에선 단순 `Linking.openURL` fallback (작동 가능성 ↓) → expo-sharing 시트
- **Dev Client·정식 빌드만 진정 1-tap 작동**

**fallback 흐름** (인스타 미설치 또는 deep link 실패):
- `expo-sharing.shareAsync(uri)` — 네이티브 공유 시트
- 시트에서 카톡·메시지·기타 채널 선택 가능

### 3-6. iOS 빌드 — Xcode UI 우회

**문제 박제** — macOS 25.4 + Xcode 26.4 환경에서 `npx expo run:ios --device`가 `devicectl JSON version mismatch` 에러로 실패. expo CLI가 디바이스 list 못 가져옴.

**우회**:
1. `npx expo prebuild --platform ios --clean` (native iOS 폴더 생성)
2. ⚠️ **CocoaPods 한국어 locale 인코딩 에러** — `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 환경변수 prefix 필수 (Ruby 4.0 + Korean locale Unicode normalize 충돌)
3. `pod install` (위 prefix로 재시도) — 105 dependencies 설치
4. `open ~/play-the-picture-app/ios/app.xcworkspace`
5. Xcode → Project → Signing & Capabilities → **Team: 박찬영 (Personal Team)** 선택
6. iPhone USB 연결 + 신뢰 등록
7. ▶ Run (또는 ⌘+R) — 빌드 5~15분 → 폰 자동 설치
8. 첫 실행 시 iPhone 설정 → 일반 → VPN 및 기기 관리 → "Apple Development: pcy2177@gmail.com" → 신뢰

**Personal Team 한계**:
- 본인 iPhone만 (친구 폰 X — Apple Developer Program $99 필요)
- 7일 후 만료 → 다시 빌드 (캐시 활용 시 1~2분)
- TestFlight 사용 X
- App Store 출시 X

**Mac LAN IP**: `192.168.35.34` (Wi-Fi 환경별 변동 가능). 폰의 Dev Client 앱이 `http://192.168.35.34:8081`로 Metro 서버 연결.

**iPhone UDID**: `00008150-0008256214B8401C` (iOS 26.3.1).

### 3-7. RN 의존성 (`package.json`)

```
@supabase/supabase-js
react-native-url-polyfill
expo-crypto
@react-native-async-storage/async-storage
expo-image-picker
expo-image
expo-linear-gradient
expo-image-manipulator
lucide-react-native + react-native-svg
@expo-google-fonts/dm-sans + expo-font + expo-splash-screen
react-native-view-shot
expo-sharing
expo-file-system
expo-linking
expo-constants
react-native-share              ← Dev Client·native 빌드만 작동
expo-dev-client
```

### 3-8. 환경 트래킹 — 12개 테이블 platform/os 컬럼

**DDL (5/7 적용 완료)**:
```sql
ALTER TABLE analyze_logs ADD COLUMN platform text NOT NULL DEFAULT 'web', ADD COLUMN os text NOT NULL DEFAULT 'unknown';
-- (12개 테이블 동일)
```

대상 테이블: `analyze_logs`, `preference_logs`, `photo_upload_logs`, `result_view_logs`, `entries`, `listen_logs`, `save_logs`, `preview_logs`, `share_logs`, `share_views`, `story_save_logs`, `try_click`.

**의도된 동작**:
- 기존 web row 자동 `platform='web'`, `os='unknown'` (default)
- 우리 RN 앱 INSERT 시 `lib/supabase.ts`의 `insertLog()` wrapper가 자동으로 `platform: 'app'`, `os: Platform.OS` 박음
- web 코드 변경 0 (default 유지)

**server route 수정** (commit `3d289fb`) — [src/app/api/log-story-save/route.ts](src/app/api/log-story-save/route.ts):
```ts
const { entry_id, device_id, status, platform, os } = await req.json();
// ... INSERT 시 옵셔널 spread:
...(platform ? { platform } : {}),
...(os ? { os } : {}),
```

→ web 호출은 platform 안 보내므로 default 'web' 적용. 우리 앱은 명시 박음.

**미수정 server route**:
- `/api/log-preview` POST — preview_logs INSERT 시 platform/os 받기 미적용 (Phase A 시 같이)

**롤백 정책** (사용자 확인 — 출시 안 하기로 결정 시):
- 컬럼 그대로 두기 (비용 0) ⭐ 또는 DROP (1초)
- web 영향 0 — 안전

### 3-9. INTERNAL_DEVICE_IDS — 우리 앱 device_id 4개 추가

`.env.local` + Vercel env (사용자 본인 추가 완료):
- `90ad0567-e04b-4a7b-99a4-9353c592dd6f` (활성, 26 rows)
- `01c77837-2095-4953-bd89-5126a98c4f2d` (cache clear 후 1회)
- `2d181638-aa4a-4969-9b50-591bce879243` (cache clear 후 1회)
- `183e91c4-96af-4518-8e40-7bc4412e5a4c` (Dev Client 빌드 후 활성)

총 16 → 19 device. 향후 친구 안드 폰 검증 시 새 device_id 발급되면 추가 필요.

---

## 4. RN repo commit·push 박제

GitHub: `https://github.com/dailyyoung-kr/play-the-picture-app` (private)

| commit | 내용 |
|---|---|
| `a7654d8` | feat: 플더픽 네이티브 앱 PoC — 사진→분석→결과 1회 흐름 풀 작동 (Phase 1 완전 종료) |
| `104d6d2` | feat(phase2): storyCard 9:16 캡처 + 인스타 스토리 1-tap (iOS) + 환경 트래킹 |

---

## 5. web repo commit·push 박제

| commit | 내용 |
|---|---|
| `f856d72` | fix(tracking): log-story-save PATCH 화이트리스트에 inapp_shown 추가 (§2-3) |
| `3d289fb` | feat(tracking): log-story-save POST에 platform/os 필드 추가 (§3-8) |

---

## 6. 안드 검증 미완 — 5/8 친구 폰 예정

§7-G 박제된 "안드 인스타 인앱 viral 0%" 가설의 핵심 검증.

**필요 작업**:
1. `eas login` (gh와 별개)
2. `eas build:configure` (eas.json 자동 생성)
3. `eas build --profile development --platform android` (~10~15분, 무료, Apple 무관)
4. .apk 다운 → 친구 안드 폰에 설치 (USB 또는 이메일·QR)
5. `npx expo start --dev-client` (Mac에서)
6. 친구 폰의 Dev Client 앱 → 우리 코드 로드
7. 인스타 1-tap 검증 (안드 인스타 정책상 작동 가능성 확인)

**검증 시 기대**:
- 작동 → §7-G 가설 무력화 확정 (네이티브 앱이 진짜 안드 viral 회복) 🎉
- 차단 → 안드는 일부 한계 (단 시트 fallback은 작동 — 인스타 외 채널)

---

## 7. iOS 출시 plan (Phase A~F) — 4~6주

다음 세션부터 Phase A 진입 권장.

### Phase A: 기능 완성도 (1~2주) — 출시 전 필수

| Sub-step | 내용 | 시간 | 우선 |
|---|---|---|---|
| **A1. result CTA 4개 완성** | "아카이브 보관" / "결과 공유하기" / "음악 앱에서 듣기" + "스토리용 이미지" | 1~2일 | |
| **A2. 30초 미리듣기 (audio player)** | `expo-av` + preview_logs INSERT | 1일 | ⭐ viral 핵심 |
| **A3. entries INSERT 정책** | "보관"·"스토리 저장" 시 entries 만들기 + share URL 생성 | 1일 | ⭐ viral 핵심 |
| **A4. share URL** | `playthepicture.com/share/[entry_id]` + share_logs·share_views 트래킹 | 1일 | ⭐ viral 핵심 |
| A5. 분석 3단계 로딩 애니메이션 | web §7-A의 사진 fade → 게이지 → 메시지 순환 | 1일 | |
| A6. journal·아카이브 화면 | 본인 분석 이력 보기 | 1일 | |
| A7. 에러 처리 정교화 | 네트워크·timeout·api_key_missing 등 메시지 분기 | 0.5일 | |

→ **A2+A3+A4 우선** (viral 핵심).

### Phase B: UX·디자인 폴리시 (5~7일)

- B1. 앱 아이콘 (1024x1024 마스터)
- B2. splash screen (다크 + 핑크 로고)
- B3. 권한 plist 메시지 한글화 (사진 보관함 등)
- B4. 첫 실행 안내 (선택)
- B5. 빈 상태 처리
- B6. 미세 디자인 조정

### Phase C: 법적·정책 자산 (2~3일)

- **C1. 개인정보 처리방침** (web에 페이지 추가)
- **C5. Privacy Nutrition Label** (iOS 14.5+ 필수)
- C2/C3/C4. 이용약관·카테고리·연령 등급

### Phase D: 인프라·계정 (3~7일 대기)

- **D1. Apple Developer Program 가입 ($99)** — 신원 확인 1~3일
- D2. App Store Connect 앱 등록
- D3. EAS production profile 셋업
- D4. EAS Build production → `.ipa`

### Phase E: TestFlight 베타 + 자산 (1주)

- E1. 친구 5~10명 초대
- E2. 베타 사용 1주 + 피드백
- E3. 앱스토어 스크린샷 8장 (iPhone 6.7"·6.1")
- E4. 앱 미리보기 동영상 (선택)
- E5. 앱 설명 (한글·영어)
- E6. ASO 키워드

### Phase F: 심사 + 출시 (2~3주)

- iOS 심사 7~14일 평균
- 거절 1번 거의 확정 (가이드라인 학습 비용)
- 통과 후 출시

---

## 8. 미해결 / 추후

### 8-1. UTM `{{campaign.name}}` 36건 (§2-2)

meta 광고 set의 변수 치환 실패. 즉시 광고 set 점검 권장 (Vercel·앱과 무관, 사용자 광고 콘솔에서).

### 8-2. preview_logs server route platform/os 미적용

`/api/log-preview` POST에 platform/os 받기 추가 필요. Phase A2 미리듣기 작업 시 같이.

### 8-3. storyCard 사진 1장 케이스 SIZE (§3-4)

사용자 결정 — **그대로 760 유지** (web 1:1). 향후 시각적 변경 원하면 920·968로 조정 가능.

### 8-4. 다중 사진 storyCard 검증

1장만 검증됨. 2~5장 layout 미검증. 친구 폰 검증 시 같이 시도 가치.

### 8-5. RLS OFF 8개 테이블 (Supabase advisory)

`photo_upload_logs`, `preference_logs`, `analyze_logs`, `songs`, `listen_logs`, `result_view_logs`, `recommendation_logs`, `save_logs` — anon 키로 누구나 read/modify 가능. §7-D-2 패턴 (server route 경유 + 정책 추가)으로 일괄 정리 필요. 별도 세션 작업.

---

## 9. 다음 세션 시작 멘트 후보

```
"안드 친구 폰 EAS Build 검증 — eas login + eas build --profile development --platform android"
```

또는 안드 검증 끝난 후:

```
"Phase A2 진입 — 30초 미리듣기 audio player 구현 (expo-av + preview_logs)"
```

또는 Apple Developer 가입 시작:

```
"Apple Developer Program 가입 신청 (신원 확인 1~3일 대기, Phase D 미리 시작)"
```

---

## 10. 핵심 박제

1. **Expo Dev Client + react-native-share + Facebook App ID**가 진정 인스타 1-tap 정공법. Expo Go에선 작동 X.
2. **iOS 본인 폰 검증은 무료 Apple ID + Personal Team으로 가능** (7일 만료). $99 결제는 Phase D (출시 직전)에 미루기.
3. **Mac 한국어 locale + Ruby CocoaPods 인코딩 충돌** — `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` 환경변수 박는 게 핵심.
4. **`expo run:ios` macOS 25.4 + Xcode 26.4 환경에서 devicectl JSON mismatch 막힘** — Xcode UI 직접 빌드로 우회.
5. **DDL ↔ 라우트 화이트리스트 동기화** (§7-D 박제 fix 후속) — 신규 status 추가 시 둘 다 같이.
6. **timezone boundary 정확히 하려면 `TIMESTAMPTZ '2026-05-05 00:00:00+09'` 명시** — `DATE 'X' AT TIME ZONE`은 PostgreSQL 환경에 따라 비결정적.
7. **storyCard 사진 1~5장 layout** — §7-A "3장 좌1+우2 viral 우위" 박제 그대로 RN에 1:1 변환.
8. **DB·테이블 공유 정책** — 통합 + `platform`/`os` 컬럼이 정답. 분리 DB·테이블은 ROI 낮음 (사용자 결정).
9. **Apple Developer 가입은 reversible 결정** — 보류해도 PoC·Phase A·B 진행 가능. Phase D 직전에 결제.
