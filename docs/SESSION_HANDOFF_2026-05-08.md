# Session Handoff — 2026-05-08

> 5/8 박제. **Phase A2/A3/A4 통합 완성** (미리듣기·entries·공유 URL) + **Phase A 폴리시** (음악앱 듣기 + 3단계 로딩 + drag-to-scrub) + **web 1:1 정밀 정렬** (preference·result·StoryCard·index·PreviewPlayer). 네이티브 앱이 web parity 거의 100% 달성. 남은 Phase A는 A6 journal만.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-07_part2.md](./SESSION_HANDOFF_2026-05-07_part2.md)

---

## ℹ️ 정정 참조 (2026-05-09 추가)

> 본 핸드오프는 RN 앱 작업 중심이라 직접 정정 사항 없음.
> 단, 5/8 viral funnel 수치(별도 conversation에서 보고된 "share 5명·try_click 2"건 등)는 INTERNAL 미제거 상태였음 — 정정값은 [SESSION_HANDOFF_2026-05-09.md](./SESSION_HANDOFF_2026-05-09.md) §7 참조.
> 5/8 외부 share completed = 3 device·외부 try_click = 0·외부 save_arch = 9 device.

---

## 1. 한 줄 요약

**Phase A2/A3/A4 (viral wedge — 미리듣기·entries INSERT·share URL) 완성** + **Phase A1 (음악앱 듣기 CTA + ListenSheet)·A5 (3단계 로딩)·A7 일부 (에러 분기) 완료**. RN 앱이 web 핵심 흐름 1:1 매칭. 남은 A6 (journal)만 미구현.

---

## 2. Phase A2/A3/A4 — 미리듣기·entries·공유 URL 통합

### 2-1. 의사결정 박제 (BFF 패턴 채택)

| Q | 결정 | 이유 |
|---|---|---|
| Audio 라이브러리 | **`expo-audio`** | SDK 54 권장, expo-av deprecation 진행 중 |
| entries INSERT 방식 | **신규 `/api/entries` POST** | 장기 web 마이그레이션 가능, RN 코드 단순, RLS 의존 ↓ |
| 공유 라이브러리 | **RN 내장 `Share`** | URL 공유 표준, expo-sharing은 파일 전용 |
| log-* 라우트 platform/os | **RN 호출 5개 일괄 적용** | 데이터 오염 방지 (default 'web' 박힘 회피) |

**박제용**: 통합 운영 표준은 **BFF (Backend for Frontend)** 패턴 — 모든 INSERT는 server route 경유, web/RN 양쪽 동일 라우트 호출. 인스타·트위터·디스코드 등 모두 동일.

### 2-2. Web 라우트 변경 (5개)

| 파일 | 변경 | commit |
|---|---|---|
| [`/api/entries/route.ts`](src/app/api/entries/route.ts) | **POST 신규** — RN entries INSERT | `95ecfa7` |
| [`/api/log-preview/route.ts`](src/app/api/log-preview/route.ts) | platform/os 옵셔널 받기 | `95ecfa7` |
| [`/api/log-share/route.ts`](src/app/api/log-share/route.ts) | platform/os 옵셔널 받기 | `95ecfa7` |
| [`/api/log-share-view/route.ts`](src/app/api/log-share-view/route.ts) | platform/os 옵셔널 받기 | `95ecfa7` |
| [`/api/log-save/route.ts`](src/app/api/log-save/route.ts) | platform/os 옵셔널 받기 | `95ecfa7` |
| [`/api/log-listen/route.ts`](src/app/api/log-listen/route.ts) | platform/os 옵셔널 받기 (Phase A1 추가) | `71364e7` |

**패턴 통일**:
```ts
const { ..., platform, os } = await req.json();
.insert({
  ...,
  ...(platform ? { platform } : {}),
  ...(os ? { os } : {}),
});
```

→ web 호출은 platform 안 보내므로 default 'web' 적용 (영향 0).
→ RN 호출은 명시적으로 'app' + os 박힘.

### 2-3. RN 컴포넌트 신규 (3개)

#### `components/PreviewPlayer.tsx` (신규)
- expo-audio 30초 미리듣기
- iTunes preview URL fetch (`/api/itunes-preview`)
- 30초 도달 시 자동 정지 + completed 로그
- iOS 무음 모드에서도 재생 (`setAudioModeAsync({ playsInSilentMode: true })`)
- **drag-to-scrub** (자세히 §5)

#### `components/ListenSheet.tsx` (신규)
- "음악앱에서 듣기" 바텀시트 (Modal)
- Spotify (deeplink) + YouTube Music (deeplink/검색 fallback)
- expo-linking으로 외부 앱 열기
- 곡명 chip + "▶ 바로 재생" / "검색 화면으로 이동" 표시

#### `app/result.tsx` (대폭 수정)
- imports: Share, ListenSheet, lucide icons (Bookmark/Check/Play/RotateCcw/Music/Archive), inline KakaoTalk·Instagram SVG
- state: savedEntryIdRef, saving, sharing, isSaved, deviceId, showListenSheet, musicLinks, loadingLinks
- 함수:
  - `saveEntry()` — entries INSERT (캐시, 1번만)
  - `handleSave()` — 보관 → entries + log-save
  - `handleShare()` — 공유 → entries + log-share + Share.share({ url })
  - `handleListenClick()` — 음악앱 듣기 → log-listen + bottomsheet
  - `fetchMusicLinks()` — `/api/music-search` GET
- handleStorySave에 saveEntry 통합 (entry_id 박힘 → viral 추적 정확 ↑)

### 2-4. CTA layout 정렬 (web 1:1)

```
[Bookmark 아카이브 보관] + [Instagram 스토리용 이미지]   ← Tier 3 (회색 secondary)
[KakaoTalk 결과 공유하기]                                 ← Tier 2 (옅은 분홍)
[Play 음악앱에서 듣기]                                    ← Tier 1 (핑크 핵심 CTA)
[RotateCcw 한 번 더 해보기]                              ← 텍스트 링크
```

핵심: **음악앱 듣기**가 핸드오프 §13의 "unknown new 290명 → 듣기 conversion" 1순위 lever와 직결. 핑크 강조.

### 2-5. RN preference.tsx — base64 photos 덮어쓰기 (OG 이미지 fix)

**버그**: 카톡에 보낸 share URL의 OG 이미지 안 뜸.

**진단**:
- 공유 URL → web `/share/[id]` 정상
- 카톡 OG 미리보기는 `/api/og?id={entry_id}` 호출
- `/api/og`가 entries에서 `photos` SELECT → `<img src={photos[0]}>` 합성
- RN의 photos는 **`file:///var/...` raw URI** (expo-image-picker 결과)
- 서버 (Vercel)가 file:// URI 접근 불가 → OG 이미지 빈 상태

**fix**: preference.tsx에서 분석 성공 후 base64 photos를 ptp_photos에 덮어쓰기.
```ts
await AsyncStorage.setItem("ptp_photos", JSON.stringify(photos)); // base64 array
```

→ result.tsx에서 받는 photos가 base64 → entries INSERT 시 base64 박힘 → `/api/og` 정상 합성.

**부수 효과**: `/api/og` 호출이 `fetch(${API_BASE}/api/og?id=${entryId}).catch(() => {})` (handleShare 내, fire-and-forget) — 카톡 크롤러 timeout 6~10초 견디게 사전 트리거.

### 2-6. handleStorySave entry_id 통합

기존 RN handleStorySave는 entry_id 안 박음 (story_save_logs.entry_id = null). web은 entry_id 박음.

수정: handleStorySave 시작 시 saveEntry 호출 + log-story-save POST에 entry_id 같이.

→ 인스타 스토리 viral chain (sharer ↔ viewer 매핑) RN row에서도 정확히 추적 가능.

---

## 3. Phase A1 — 음악앱에서 듣기 (ListenSheet)

### 3-1. 흐름

```
사용자 [🎵 음악앱에서 듣기] 클릭
  ↓
log-listen POST + platform='app' + os
  ↓
fetchMusicLinks (/api/music-search GET) — DB 캐시 우선, miss 시 Spotify·YouTube API
  ↓
바텀시트 모달 (slide-up)
  - YouTube Music 카드 (1DB954 빨간 원 아이콘)
  - Spotify 카드 (1DB954 초록 원 아이콘)
  - "▶ 바로 재생" (deeplink 가능 시) / "검색 화면으로 이동" (fallback)
  ↓
사용자 카드 클릭 → expo-linking.openURL → 외부 앱 열림
  ↓
바텀시트 자동 닫힘
```

### 3-2. 박제 - 핵심 viral lever

§13 1순위: "unknown new 290명 (74%) 평균 30.9점 → 분석 → 듣기 conversion 강화 = 잠재 +14.9점"
- RN 앱에 듣기 CTA 0이면 viral chain 시작점 끊김
- ListenSheet 도입 = unknown new가 곡 들을 수단 확보
- 듣기 → 곡 호감 → 공유 chain 가능

---

## 4. Phase A5 — 3단계 로딩 스토리텔링

### 4-1. 진행 단계

| Phase | 시간 | 콘텐츠 |
|---|---|---|
| **0** | 0~3s | 사진 fade-in (0.35→1.0, 150ms delay 후 2.6s) + "사진 속 오늘을 읽고 있어요 🔍" + 부제 |
| **1** | 3~6s | 사진 작아짐 (opacity 0.65) + "사진 속 오늘을 읽었어요 ✦" + **4축 게이지** stagger 애니메이션 |
| **2** | 6s+ | 사진 더 작음 (opacity 0.5) + 텍스트 6개 순환 (3s 간격) + WAVE BARS 6개 무한 loop |

### 4-2. 4축 게이지 — App Store 심사 위험 박제

**의사결정**: web과 1:1 (가짜 게이지 4개) 유지. 사용자 결정 (디자인 일관성 우선).

**위험 인지**:
- **2.3.1 Accurate Information** misleading 가능성 1차 거절 10~20%
- 게이지 값은 random (`Math.floor(Math.random() * 60) + 20`)
- 차분함↔에너제틱 등 음악 관련 실제 의미 있는 축
- "사진 속 오늘을 읽었어요 ✦" 과거형 + 게이지 = 분석 결과처럼 보임

**대안 (심사 거절 시 fallback)**:
- 옵션 B: 메시지 "분석하는 중" + disclaimer ("진행 중인 모습이에요")
- 옵션 C: 게이지 4개 → 단일 progress bar
- 옵션 D: 게이지 제거 (1단계 + 3단계만)

→ 출시 전 결정 유예. 1차 거절 받으면 옵션 B/C로 1줄 변경 가능.

### 4-3. RN Animated 패턴 박제

**핵심 학습**: web의 CSS animation을 RN으로 옮길 때:
| Web | RN |
|---|---|
| `transition: opacity 2.6s ease` | `Animated.timing(opacity, { duration: 2600, useNativeDriver: true })` |
| `transition: left/width cubic-bezier` | `Animated.timing(progress, { useNativeDriver: false }) + interpolate` |
| `@keyframes wave1/2/3` | `Animated.loop(Animated.sequence([min, max]))` |

**WAVE BARS min/max 분리** (이전 commit `c791bfb`에서 모두 6 잘못, `e1ef1bf`에서 fix):
- wave1 (idx 0, 4): min 6, max 22
- wave2 (idx 1, 3): min 10, max 32
- wave3 (idx 2, 5): min 4, max 16

**ref 미러링 패턴**:
- player, status.duration, status.playing 등 PanResponder closure에서 최신값 필요 시 useRef
- ScrollView 스크롤 후 절대 X stale 가능성 → grant에서 measureInWindow 한 번 더

### 4-4. 에러 오버레이 풀스크린 (web 1:1)

기존 inline 빨간 텍스트 → 풀스크린 모달:
- rgba(13,18,24,0.92) 배경
- 🙏 36px + 메시지 15px 500 lineHeight 24
- "다시 시도하기" 핑크 버튼 (radius 24, padding 12/32)

---

## 5. PreviewPlayer drag-to-scrub — 시행착오 박제

이번 세션에서 가장 깊이 디버깅한 영역. **5번의 fix 누적**.

### 5-1. 시행 흐름

| commit | 시도 | 증상 | 원인 |
|---|---|---|---|
| `21c5da9` | 초기 PanResponder + locationX | 떨림 + 0초로 점프 | locationX 불안정 |
| `67b9fe0` | dx 누적 변위 | 떨림 ↓ but 여전히 부정확 | 시작 progress 부정확 |
| `8c87c87` | 자식 View pointerEvents="none" | thumb 위 누르면 0초 점프 fix | 자식 hit view가 locationX 가로챔 |
| `3fd4605` | pageX 절대 좌표 + measureInWindow | 거의 정확 (web 패턴 1:1) | locationX → pageX 변경 |
| `a6e7d25` | release grace 200ms | tap "왔다갔다" flicker fix | seekTo 비동기 + status 업데이트 갭 |

### 5-2. 핵심 박제 (RN PanResponder drag UI 만들 때 반드시 따를 것)

1. **`evt.nativeEvent.pageX`** (절대 좌표) **+ `measureInWindow`** (element 절대 X) 사용
   - `locationX`는 자식 view 안 좌표 — multi-layer 구조에선 부정확
   - `dx` 누적은 시작점 부정확 시 누적도 부정확

2. **자식 View 모두 `pointerEvents="none"`**
   - touch가 부모(PanResponder attach)로 bubble 보장
   - 자식 View들이 absolute positioned일 때 필수

3. **Release grace 200ms**
   - expo-audio seekTo는 비동기 (~100ms)
   - 즉시 setIsDragging(false) → status.currentTime 옛 값으로 visualProgress 점프 → flicker
   - 200ms grace로 dragProgress 유지 → status 새 위치 도달 후 자연 전환

4. **ref 미러링** (closure 안 최신값)
   - `playerRef`, `durationRef`, `isPlayingRef`, `seekBarLeftRef`, `seekBarWidthRef`
   - PanResponder는 useRef로 stable하게 한 번만 생성

### 5-3. Web과 동등성

| | Web | RN |
|---|---|---|
| 절대 좌표 | `e.clientX` | `evt.nativeEvent.pageX` |
| element X | `rect.left` (synchronous) | `measureInWindow` (async, ref 캐시) |
| progress | `(clientX - rect.left) / width` | `(pageX - seekBarLeft) / width` |
| 자식 hit | (단순 div, 자연 bubble) | `pointerEvents="none"` 명시 |
| seek 동기성 | `audio.currentTime = X` 즉시 | `player.seekTo(X)` 비동기 + 200ms grace |

---

## 6. Web parity 정밀 폴리싱 — 페이지별

### 6-1. 메인 (index.tsx)

| 변경 | commit |
|---|---|
| 사진 슬롯 우측 페이드 그라데이션 (3장+ 시) | `cb0cb45` |
| 하단 nav "노래 추천받기" `onPress={() => router.replace("/")}` 추가 | `cb0cb45` |

→ web 1:1 (lineHeight 0.1~0.2 미세 차이만 남음, 시각 X)

### 6-2. preference.tsx

| 변경 | commit |
|---|---|
| WAVE_BAR min/max 정확 분리 (wave1·2·3) | `e1ef1bf` |
| 사진 fade-in 150ms delay (web 패턴) | `e1ef1bf` |
| Phase 1 letterSpacing 0.5 → 0.52 | `e1ef1bf` |
| Phase 2 lineHeight 26 → 26.35 | `e1ef1bf` |
| 분석 시작 버튼 ActivityIndicator → ✦ rotate (Animated.loop) | `e1ef1bf` |
| 에러 오버레이 풀스크린 (🙏 + "다시 시도하기") | `e1ef1bf` |

### 6-3. result.tsx

| 변경 | commit |
|---|---|
| "플더픽의 추천곡" color rgba(0.4)→0.35 | `a1ded24` |
| "오늘의 당신은" color rgba(0.4)→0.38 | `a1ded24` |
| vibeType lineHeight 22→21.6 | `a1ded24` |
| vibeDescription color 0.5→0.45, lineHeight 17→16.5 | `a1ded24` |
| 아티스트 color 0.5→0.48 | `a1ded24` |
| 섹션 1·3·추천 이유 marginBottom 12→10 | `a1ded24` |
| 사진 모달 카운터 bottom 50→24 | `a1ded24` |

**의도적 미적용** (사용자 결정 — `34b2f7e` revert):
- 앨범 layer 2 contentFit `cover` + blurRadius `12` 유지 (모바일 세로 portrait 최적화)
- web의 `contain + objectPosition center 25% + blurRadius 6` 패턴 거부
- → portrait 화면에 contain면 위아래 검은 띠 발생 → cover가 적합

**iOS safe area 보정** (변경 X):
- paddingTop 60 (notch + status bar)
- 사진 모달 닫기 버튼 top 60

### 6-4. StoryCard.tsx

| 변경 | commit |
|---|---|
| 사진 영역 marginBottom 36→28 | `a1ded24` |
| "오늘의 당신은" lineHeight 28 명시 | `a1ded24` |

→ web 1:1

### 6-5. PreviewPlayer.tsx

| 변경 | commit |
|---|---|
| 단순 ▶ 핑크 버튼 → 핑크 그라디언트 컨테이너 (24px round) | `b30514f` |
| ▶/❚❚ 텍스트 → lucide Play/Pause 32x32 회색 버튼 | `b30514f` |
| 진행바 thumb 추가 (10x10 흰 원 + shadow) | `b30514f` |
| "30초 들어보기" 라벨 위 중앙 | `b30514f` |
| 시간 형식 "0:NN / 0:30" tabular-nums | `b30514f` |
| 컨테이너 전체 탭 토글 | `b30514f` |
| drag-to-scrub (5번 fix 누적, §5) | `21c5da9` ~ `a6e7d25` |

---

## 7. 부수 발견 / 학습 박제

### 7-1. iOS 사진 picker 메시지 — Apple 표준 (변경 불가)

`launchImageLibraryAsync({ selectionLimit > 1 })` 호출 시 iOS의 **PHPickerViewController**가 자동으로 "최대 N장의 사진을 선택합니다." 표시. 한국어 locale 기본.

- 우리 코드 무관
- 변경 불가 (Apple 표준 컨트롤러)
- selectionLimit 동적 (`MAX_PHOTOS - photos.length`)만 우리가 박음

### 7-2. 결과 화면 2개 뜨는 모호 버그 (재현 미완)

**사용자 보고**: 분석 → 결과 화면(김하온 - traveler) 보다가 그 위로 새 결과 떠있음.

**가설**:
- A) Stack 중첩 — preference → result `router.push` (replace X). 결과에서 ← swipe → preference → 분석 다시 → result 또 push.
- B) 빠른 더블탭
- C) Hot reload 부작용

**fix (안전망 추가)**: handleAnalyze 시작에 `if (loading) return` 명시 guard. disabled prop 외 추가 보호.

→ 사용자 다시 안 보고 X. 재현 시 또 추적.

### 7-3. preview_abandoned 로깅 미구현

web의 `trackEvent("preview_abandoned")` (페이지 이탈 시 미완료면) — RN 미적용. RN에 analytics 라이브러리 X (mixpanel/posthog 등). Phase D 후 별도 결정.

대안: `/api/log-preview` ALLOWED_ACTION에 `'abandoned'` 추가 + RN cleanup에서 호출 — 미진행.

---

## 8. 다음 우선순위

### 🔴 즉시 결정 필요
- **A6 journal 화면 구현** (1일) — 마지막 Phase A 미구현. web parity 100% 도달.
  - `app/journal.tsx` 신규
  - 본인 entries fetch (`/api/entries` GET 또는 supabase + device_id)
  - UI: web journal과 1:1 (그리드/리스트, 사진·곡명·날짜, 클릭 시 share 페이지)
  - 삭제 기능 (DELETE /api/entries/[id])
  - 3개 placeholder Alert → router.push("/journal") 교체

### 🟡 다음 후보
1. **안드 친구 폰 EAS Build 검증** (5/7 §6 박제 우선순위 1) — 안드 인스타 인앱 viral 0% 가설 검증
2. **App Store Apple Developer 가입** ($99) — 출시 인프라
3. **drag-to-scrub 추가 검증** — 200ms grace 충분한지 본인 폰 다양 시나리오
4. **preview_abandoned 로깅** — 데이터 정합성

### 🔵 백로그 (변동 없음)
- iOS Safari blur 실기기 검증
- share_logs status PATCH 갭 디버깅
- iTunes cross-script 모니터링
- analyze_logs user_agent 컬럼 추가 (OS selection bias 해소)
- 5/7 §13의 remaining lever 작업

---

## 9. commit 박제

### Web (4 commits)
| commit | 변경 |
|---|---|
| `95ecfa7` | feat(api): RN 통합용 entries POST + log-* 4개 platform/os 받기 (Phase A2/A3/A4) |
| `71364e7` | feat(api): log-listen에 platform/os 옵셔널 받기 추가 |
| `8661257` | feat(preview): 미리듣기 진행바 drag-to-scrub (Pointer events + capture) |

### RN (16 commits)
| commit | 변경 |
|---|---|
| `6b3f119` | feat(phase-a): 30초 미리듣기 + entries INSERT + 공유/보관 버튼 + base64 photos fix |
| `538a7d7` | polish: 공유 fallback alert + 분석 네트워크 에러 분기 + loading guard 강화 |
| `9cb77e1` | feat(parity): web result page 1:1 정렬 — 음악앱 듣기 CTA + ListenSheet + lucide 아이콘 + 하단 nav |
| `b30514f` | polish(preview): web 미리듣기 UI 1:1 재작성 |
| `21c5da9` | feat(preview): RN 미리듣기 진행바 drag-to-scrub (PanResponder) |
| `67b9fe0` | fix(preview): RN drag-to-scrub 떨림 — locationX → gestureState.dx 기반 |
| `8c87c87` | fix(preview): RN 진행바 thumb 위 누르면 0초로 점프 — 자식 View pointerEvents='none' |
| `3fd4605` | fix(preview): RN drag pageX 절대 좌표 기반 (web 패턴 1:1) + measureInWindow |
| `a6e7d25` | fix(preview): RN tap-to-seek '왔다갔다' flicker — release grace 200ms |
| `cb0cb45` | polish(index): web 1:1 — 사진 슬롯 우측 페이드 + 하단 nav onPress 보강 |
| `c791bfb` | feat(preference): 3단계 로딩 스토리텔링 (옵션 C — 단일 progress, App Store 안전) |
| `6c05b26` | polish(preference): Phase 1 메시지 web 1:1 — '사진 속 오늘을 읽었어요 ✦' |
| `6b58036` | revert(preference): Phase 1 단일 progress → 4축 게이지 (web 1:1, 사용자 결정) |
| `e1ef1bf` | polish(preference): web 1:1 정확 정렬 — WAVE 분리·fade delay·spin·에러 오버레이 |
| `a1ded24` | polish(parity): result + StoryCard web 1:1 정밀 정렬 |
| `34b2f7e` | revert(result): 앨범 배경 layer 2 — cover + blurRadius 12 (모바일 세로 비율 최적화 의도) |

---

## 10. 다음 세션 시작 멘트 후보

```
"A6 journal/아카이브 화면 구현 — 본인 entries fetch + UI + 삭제 + 3개 placeholder 제거"
```

또는

```
"안드 친구 폰 EAS Build — eas login + eas build --profile development --platform android"
```

또는

```
"Apple Developer Program 가입 신청 (신원 확인 1~3일 대기, Phase D 미리)"
```

---

## 11. 핵심 박제

1. **BFF 패턴이 web+native 통합 운영 표준** — 모든 INSERT는 server route 경유 (RLS 의존도 ↓, platform 자동 박힘, 로직 1곳)
2. **photos는 분석 직후 base64로 덮어써야** — `/api/og` 합성에 file:// URI 접근 불가
3. **PanResponder drag UI 5원칙**: pageX·measureInWindow / pointerEvents="none" / release grace 200ms / ref 미러링 / useRef로 stable PanResponder
4. **web의 CSS animation → RN Animated 변환**: useNativeDriver는 transform/opacity만, width/height/left는 false
5. **WAVE_BAR min/max 분리** — wave1(6/22), wave2(10/32), wave3(4/16). 단일 min 잘못된 경우 잡히기 어려움
6. **iOS PHPickerViewController 메시지 변경 불가** — Apple 표준
7. **App Store 심사 misleading 위험 인지** — preference Phase 1 4축 게이지 random값. 1차 거절 시 옵션 B/C 복귀 옵션 박제
8. **iOS safe area는 web 1:1 적용 X** — paddingTop 60·모달 닫기 top 60는 notch 보정 그대로 유지
9. **앨범 layer 2 contentFit cover (RN 의도)** — web의 contain+25%는 portrait에 안 맞음. 모바일 세로 최적화는 cover
