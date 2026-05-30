# 오늘의 발견 — 핸드오프 문서

> 작성일: 2026-05-29
> 대상: Play the Picture (플더픽) 웹 + RN 앱 신규 기능
> 상태: 웹 P0 구현 완료 (로컬 테스트만, production 미배포). RN 앱 1단계 완료, 2~7단계 미진행.

---

## 1. 기능 컨셉

**"오늘의 발견"** — 매일 1번 자동 큐레이션된 아티스트 2명을 카드로 추천.

- **개인화 대상**: 활성 사용자 (사용자가 직접 저장한 entries 보유)
- **콜드 스타트**: 신규/비회원은 공통 카드 (Apple Music 큐레이션 playlist 시드)
- **갱신 주기**: 매일 KST 12:00 (현재 cron 미구현, 사용자가 페이지 열면 캐싱 시작)
- **추천 단위**: 아티스트 2명 + 각 아티스트의 추천곡 5곡

---

## 2. 아키텍처 결정 (히스토리)

| 후보 | 채택 여부 | 사유 |
|------|-----------|------|
| **Last.fm API** (`getSimilar`, `getTopTracks`) | ❌ | 상용 라이선스 모호 + API 키 회수 권장 → 무료앱이라도 심사 리스크 회피 |
| **Spotify Web API** (`Get Top Tracks`) | ❌ | 403 Forbidden (메가히트·일반 아티스트 무관) |
| **iTunes Search API** | ❌ | preview·trackViewUrl만 사용 가능, similar 없음 |
| **ListenBrainz Bronze Tier** ($100/월) | ❌ | 비용 부담 |
| **나무위키 API** | ❌ | CC BY-NC-SA → 상용 불가 |
| **Wikipedia ko/en API** | ❌ | 한국 인디 아티스트 매칭률 낮음 + 톤 불일치 |
| **Apple Music Editorial Notes** | ❌ | KR storefront 0%, US도 메가히트 일부만 |
| ✅ **Apple Music API** | ✅ | similar-artists + top-songs + artwork 일체 제공, JWT 인증 |
| ✅ **Anthropic Claude Sonnet 4.6** | ✅ | bio·caption·reason 통합 생성, 자체 지식 활용 |

**최종 데이터 소스**:
- 아티스트 메타: Apple Music API (`/v1/catalog/kr/artists/{id}?views=similar-artists,top-songs`)
- bio·caption·reason: Claude 자체 지식 (Wikipedia 미사용)
- 콜드 스타트 시드: Apple Music 큐레이션 playlist 5개 (한국 인디/시티팝/R&B/칠아웃 K-Pop/오늘의 히트곡 발견)
- 활성 사용자 시드: `entries.song` × `entries.artist` 누적

---

## 3. 인증 (Apple Music JWT)

- **Team ID**: `36XBP44HPP`
- **Key ID**: `TZMAV39YGN`
- **`.p8` 파일**: 로컬 `~/Downloads/AuthKey_TZMAV39YGN.p8` (절대 commit 금지)
- **만료**: 180일 (메모리 캐시, 만료 1시간 전 자동 갱신)
- **알고리즘**: ES256

`.env.local`:
```bash
APPLE_MUSIC_TEAM_ID=36XBP44HPP
APPLE_MUSIC_KEY_ID=TZMAV39YGN
APPLE_MUSIC_KEY_PATH=/Users/pcy_mac/Downloads/AuthKey_TZMAV39YGN.p8
# production 배포 시: APPLE_MUSIC_KEY=<.p8 내용 \n escape>
```

> ⚠️ Apple Developer Console에서 `Media Services Key` 생성 시 **Media ID 별도 등록 필요**. App ID와 별도. 안 만들어두면 "no identifiers available" 에러.

---

## 4. DB 스키마

### `today_discovery` (migration_020)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| `cache_key` | TEXT | `user_id` (활성) 또는 `"common"` (콜드) |
| `date` | DATE | KST 기준 |
| `artist_1` | JSONB | 아티스트 1 snapshot |
| `artist_2` | JSONB | 아티스트 2 snapshot |
| PRIMARY KEY | `(cache_key, date)` ||

### `discovery_saves` (migration_021)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | UUID PK ||
| `cache_key` | TEXT | `user_id` 우선, 없으면 `device_id` |
| `item_type` | TEXT | `'artist'` \| `'track'` |
| `apple_id` | TEXT ||
| `snapshot` | JSONB | UI 표시용 (Apple Music 데이터 그대로) |
| `saved_at` | TIMESTAMPTZ ||
| UNIQUE | `(cache_key, item_type, apple_id)` | toggle 동작 |

---

## 5. API endpoints

### `GET /api/discovery/today`
- 쿼리: `device_id`, `user_id?`
- 응답: `{ artist_1, artist_2, cache_key, generated }`
- 동작: 캐시 hit 시 그대로 반환, miss 시 `generateDiscoveryCard()` → upsert → 반환
- `maxDuration = 60` (Vercel Hobby 10초 제한 회피)

### `POST /api/discovery/save`
- 바디: `{ device_id, user_id, item_type, apple_id, snapshot }`
- 동작: 있으면 삭제, 없으면 추가 (toggle)
- 응답: `{ saved: boolean }`

### `GET /api/discovery/saves`
- 쿼리: `device_id`, `user_id?`
- 응답: `{ artists: SavedItem[], tracks: SavedItem[] }`

---

## 6. 추천 엔진 (`src/lib/discovery-engine.ts`)

```
getUserContext(userId, deviceId)
  ├── (활성) entries에서 song·artist + vibe_description 누적
  └── (콜드) getColdStartSeedArtists() → Apple Music 큐레이션 playlist에서 추출

resolveArtistPair(seedNames)
  ├── Fisher-Yates shuffle seed
  ├── 첫 시드 → Apple Music 검색 → similar shuffle → 첫 2명 검증
  └── 검증 실패 시 다음 시드 시도

claudeWriteCards(artists, userContext)
  └── Claude Sonnet 4.6 단일 호출
      ├── bio_ko (80-150자, 곡 인용 금지, 3단 구조)
      ├── caption (활성: 25자 vibe×아티스트 매칭 / 콜드: 시적 20자)
      └── reason (아티스트 매력 + 사용자 매칭, 사진 묘사 절대 금지)
```

### prompt 톤 규칙
- **bio_ko**: 멜론 트랙제로 느낌. 추상적 음악 특징 + 무드. 곡 제목 인용 금지.
- **caption**: 단톡방 한 줄 같은 톤. 활성 사용자는 vibeType과 호응.
- **reason**: 아티스트 매력 → 사용자 vibe와 어떻게 맞는지. "무대 위 마이크" "카메라 앵글" 같은 사용자 사진 묘사 절대 금지 (← 과거 버그).

---

## 7. UI 컴포넌트 구조

### 웹 (`/discovery`)

```
PageShell
├── HamburgerMenu                    (우상단 — 다른 페이지와 통일)
├── 상단 로고 (Play the Picture)     (가운데, 클릭 시 / 이동)
├── 본문
│   ├── header
│   │   ├── h1 "오늘의 발견"
│   │   ├── p "저장·공유한 기록을 기반으로..."
│   │   └── 컬렉션 보기 알약 버튼     (← 우상단에서 이동, 2026-05-29)
│   └── Carousel | DetailView
└── 하단 네비 (아카이브 / 노래 추천받기 / 오늘의 발견)
```

#### Carousel
- 드래그 + snap (threshold = 20%)
- 컨테이너 `marginLeft: -20` → 화면 전체 너비 슬라이드
- `data-no-swipe` 마커 + `pointerEvents: "auto"` 로 별·자세히 보기 버튼만 클릭 통과
- 그라데이션 overlay `pointerEvents: "none"` 필수 (별 클릭 흡수 버그 회피)
- 우상단: `1 | 2` 인디케이터
- 좌상단: ⭐ 별 버튼 (저장 토글, 채워지면 노란색 `#FFD23F`)
- 하단: 1줄 이름 + caption (italic) + "자세히 보기" 알약 버튼
- 하단 외부: 점 인디케이터 (현재 22×8, 비활성 8×8)

#### DetailView (`?detail=1|2`)
- 좌상단 ChevronLeft 원형 뒤로가기 (router.push("/discovery"))
- artwork 4:5 + 상단 그라데이션 + "📍 오늘의 발견 아티스트" 라벨
- h2 아티스트명
- bio_ko 본문
- "추천 이유" 섹션 (라일락 박스)
- "🎵 {이름} 추천곡 들어보기"
- TrackRow × 5

#### TrackRow
- 좌측: album art 52×52
- 가운데: 곡명 + 아티스트·연도
- 우측: 🔖 Bookmark 토글 (저장 시 진한 라일락 fill)
- 하단: MiniPlayer (재생 버튼 + 드래그 가능 진행바)
- 외부 듣기 ⋮ 버튼 없음 (사용자 결정: 북마크 우선)

#### MiniPlayer
- 모듈 변수 `currentlyPlayingAudio`로 한 번에 1곡만 재생
- 진행바 라일락 thumb, mouseDown·touchStart로 seek
- `0:00 / 0:30` 시간 표시

### 웹 (`/discovery/collection`)

```
HamburgerMenu + 로고 + 하단 네비           (← 2026-05-29 추가, 다른 페이지와 통일)
└── 본문
    ├── header
    │   ├── 좌상단 ChevronLeft 뒤로가기
    │   ├── h1 "내 컬렉션"
    │   └── 부제목 "오늘의 발견에서 저장한 아티스트·곡"
    ├── 탭 (Star 아티스트 / Bookmark 곡)
    └── 2열 그리드
        ├── ArtistCard: 4:5 portrait + 이름 + 저장일
        └── TrackCard: 1:1 album art + 곡명 + 아티스트·연도 + 저장일
```

---

## 8. 활성 사용자 판별 (cache_key)

```ts
const BUCKET_COUNT = 5;

function bucketOf(deviceId: string, n: number): number {
  const hex = deviceId.replace(/-/g, "").slice(0, 8);
  const num = parseInt(hex, 16);
  if (Number.isFinite(num)) return num % n;
  // fallback: charCode 합산
  let sum = 0;
  for (let i = 0; i < deviceId.length; i++) sum = (sum + deviceId.charCodeAt(i)) >>> 0;
  return sum % n;
}

const bucket = bucketOf(deviceId, BUCKET_COUNT);
const cacheKey = userId && hasEntries ? userId : `common_${bucket}`;
```

- **활성**: 로그인 + entries 1개 이상 → 개인화 카드 (`user_id`)
- **신규/비회원**: `common_0` ~ `common_4` (5개 해시 버킷)
  - device_id UUID 앞 8자리 hex → int → mod 5
  - 같은 device는 매일 같은 버킷 (취향 일관성)
  - 콜드 사용자 5명이 통계적으로 5개 다른 카드 받음 (다양성)
  - 비용: 일 최대 5카드 × ~$0.02 = ~$0.10 (cold 풀 비용)
- → 로그인 후 entries 추가될 때까지 동일한 cold 버킷 유지

---

## 9. 콜드 스타트 큐레이션 playlist

`src/lib/apple-music.ts`:
```ts
CURATED_PLAYLISTS = [
  { id: "pl.8df10a3246544d35bf15a6589291b142", name: "Kool Indie" },
  { id: "pl.ea77dbfd10c64d1e8d1ab58a99a2acc8", name: "한국 시티 팝" },
  { id: "pl.2c470ab2cb66414682b100335afe72af", name: "Rewind: 한국 R&B" },
  { id: "pl.79aa62c2cd4d46e5bdaaa5346e909625", name: "칠 아웃 K-Pop" },
  { id: "pl.7a1d8bd609c44c318d71bf1a0a1e89b5", name: "오늘의 히트곡 발견" },
];
```

- 50곡 한도 fetch → artistName 추출
- "Apple Music KR Charts 인기곡" 대신 큐레이션 playlist 사용 (덜 유명한 아티스트 노출)

---

## 10. INTERNAL_DEVICE_IDS

`.env.local`에 27개 device_id 등록 (사용자 본인 디바이스 포함):
- 신규 추가: `b57bde26-...`, `354a9632-...`
- 분석·내부 metric에서 제외

---

## 11. RN 앱 (`play-the-picture-app/`)

### 파일 구조 (완료)
```
app/discovery/
  ├── index.tsx       — 캐러셀 + 별 저장 (단계 2+5)
  ├── [idx].tsx       — 상세 페이지 + 미리듣기 + 곡 저장 (단계 3+4+5)
  └── collection.tsx  — 저장한 아티스트·곡 컬렉션 (단계 6)

components/
  └── DiscoveryPageShell.tsx — 공통 PageShell (HamburgerMenu + 로고 + 하단 네비)

lib/
  └── discovery.ts    — getIdentity / fetchTodayDiscovery / fetchSaves / toggleSave 헬퍼

app/index.tsx, app/journal.tsx — 하단 네비에 "오늘의 발견" 탭 추가 (Sparkles)
```

### 단계 1: 정적 카드 (완료)
- 1장 ArtistCardStatic 표시

### 단계 2: 캐러셀 + PageShell 통일 (완료)
- `FlatList horizontal pagingEnabled` + `getItemLayout` + `onMomentumScrollEnd`
- 좌상단 별, 우상단 `1 | 2`, 하단 점 인디케이터
- "내 컬렉션" 알약 버튼 (부제목 아래)
- Clock 아이콘 + footer
- `DiscoveryPageShell` (HamburgerMenu top=60 + 로고 + 본문 + 하단 네비 3탭)
- 메인·아카이브 페이지 하단 네비에 "오늘의 발견" 추가

### 단계 3+4: 상세 페이지 + 미리듣기 (완료)
- `app/discovery/[idx].tsx` 동적 라우트 — `useLocalSearchParams` 로 idx 받음
- 뒤로가기 ChevronLeft, artwork 4:5, bio, 추천 이유 박스, 추천곡 5곡
- `MiniPlayer` — `expo-audio` `useAudioPlayer` + `useAudioPlayerStatus`
- 진행바 `PanResponder` drag-to-scrub (`PreviewPlayer` 패턴 차용)
- 모듈 변수 `currentPausePrev` 로 동시 1곡 재생 제어
- `useFocusEffect` 화면 이탈 시 자동 정지
- iOS 무음 모드 대응 (`setAudioModeAsync`)

### 단계 5: 저장 toggle API 연결 (완료)
- `lib/discovery.ts` 의 `toggleSave` 호출
- 캐러셀 별 → 아티스트 저장 (`item_type: "artist"`)
- TrackRow 북마크 → 곡 저장 (`item_type: "track"`)
- optimistic UI (실패 시 자동 원복)
- `useFocusEffect` 로 화면 복귀 시 saves 재fetch (sync)

### 단계 6: 컬렉션 페이지 (완료)
- `app/discovery/collection.tsx`
- 탭 (Star 아티스트 / Bookmark 곡)
- `FlatList numColumns={2}` 2열 그리드 + `columnWrapperStyle: { gap: 12 }`
- 아티스트 카드: 4:5 portrait + 이름 + 저장일
- 곡 카드: 1:1 album art + 곡명 + 아티스트·연도 + 저장일
- 빈 상태 (Star/Bookmark 아이콘 + 안내)
- `DiscoveryPageShell` 재사용 (currentTab="discovery")

### 미해결·후속 작업
- RN 앱 실기기 검증 (Expo dev → iOS·Android 시각 확인)
- 메인 페이지 진입 link (랜딩에서 발견 페이지로 들어가는 별도 CTA, 사용자 요청 시)
- production 배포 (사용자 명시 요청 시까지 보류)

---

## 12. 알려진 이슈·미해결 과제

### 즉시 처리 가능
- [ ] **production 배포** (사용자가 요청 시) — 현재 로컬만 동작
- [ ] **cron 등록** — 매일 KST 12:00 자동 갱신 (현재는 첫 방문자가 trigger)
- [ ] **RN 앱 2~7단계** — 사용자 단계별 요청 대기

### 운영 모니터링 필요
- [ ] Anthropic Claude 비용 ($0.015~0.02/카드 × 활성 사용자수)
- [ ] Apple Music JWT 만료 180일 후 갱신 알림 (현재 메모리 캐시 자동 갱신)
- [ ] 콜드 스타트 playlist가 비활성화/삭제될 가능성 (Apple 큐레이션 변경)

### 한계
- bio_ko는 Claude 자체 지식 → 일부 환각 가능 (사용자 동의 후 진행)
- 추천 아티스트 풀이 시드 1단계 similar만 사용 → 확장 시 2단계 similar (유사도 떨어짐) 또는 추가 playlist 필요
- 사용자가 이미 저장한 아티스트 재추천 방지 로직 없음 (필요 시 `discovery_saves` 조회 후 제외)

---

## 13. 작업 규칙 (CLAUDE.md 발췌)

- **사전 승인**: 3파일 이상 또는 큰 로직 변경 시 설명 후 승인 받기
- **외부 API**: 로컬 테스트는 mock 우선, 실제 API는 최종 단계만
- **응답 톤**: 한국어 ~요체
- **commit·push**: 사용자 명시 요청 시만
- **`.p8` 파일·env**: 절대 commit 금지

---

## 14. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-30 | **컬렉션 곡 UI 가로형 플레이리스트로 변경**. 아티스트는 4:5 세로 그리드 유지. 곡은 1열 가로(좌측 album art 52×52 + 곡명·아티스트·연도 + 우측 저장일). RN + 웹. |
| 2026-05-30 | **entries 0건 로그인 사용자 안내 UI**. `checkUserActive` 헬퍼(`lib/discovery.ts`) 추가 — entries count로 활성 판정. 진입 시 비활성이면 콜드 카드 fetch 차단 + "사진으로 추천 받은 곡을 저장·공유해보세요!" 큰 텍스트 + "노래 추천 받기" 버튼. 부제목·내 컬렉션 알약·footer 숨김. 활성이면 기존 카드 UI. RN + 웹. |
| 2026-05-30 | **result 페이지 하단 네비에 "오늘의 발견" 탭 추가**. RN `app/result.tsx` (다크 톤), 웹 `src/app/result/page.tsx`. 라이트 톤. |
| 2026-05-30 | **비로그인 진입 시 즉시 게이트 + 카드 fetch 차단**. `/discovery`, `/discovery/[idx]` 진입 시 `userId` 없으면 Apple Music/Claude 호출 자체 차단 + LoginGate 모달 즉시 표시. 모달 닫으면 `/` 메인으로 router 이동. 로그인 완료 후 `loadData(id)` 호출로 즉시 카드 fetch. 비로그인 사용자에게 콜드 풀 카드 노출 X. |
| 2026-05-30 | **로그인 필수 게이트 도입 (웹·RN)**. LoginGateSource에 `"discovery"` 추가. 비로그인(`userId === null`) 사용자가 자세히 보기 / 내 컬렉션 / 별·북마크 누르면 LoginGate 모달. 컬렉션 페이지(`/discovery/collection`) URL 직접 진입도 차단. 익명 로그인 사용자(`is_anonymous=true`)는 통과. |
| 2026-05-30 | **RN 상세 페이지 헤더 통일**. `app/discovery/[idx].tsx`에 DiscoveryPageShell 적용 (PLAY THE PICTURE 로고 + HamburgerMenu + 하단 네비). 뒤로가기 ChevronLeft는 article 좌상단 유지. |
| 2026-05-30 | **RN 컬렉션 그리드 단일 카드 보정**. items 홀수 개일 때 마지막 row에 `null` placeholder 추가 → `<View flex:1 />` 렌더 → 카드가 항상 화면 절반 폭 차지. |
| 2026-05-29 | **RN 앱 단계 2~6 일괄 완료**. discovery/index.tsx 캐러셀(FlatList horizontal pagingEnabled) + PageShell 통일 + 별 저장. discovery/[idx].tsx 상세 페이지 + expo-audio MiniPlayer(PanResponder drag-to-scrub + 동시 1곡 제어) + 곡 저장. discovery/collection.tsx 2열 그리드 컬렉션. components/DiscoveryPageShell.tsx + lib/discovery.ts 공유. app/index.tsx, app/journal.tsx 하단 네비에 "오늘의 발견" 탭 추가. |
| 2026-05-29 | **콜드 풀 개인 신호 leak 차단**. `cache_key`가 `common_*` 면 `generateDiscoveryCard({ forceColdStart: true })` 전달 → `getUserContext` 우회 → vibe_description 신호 0. 기존 오염 row는 `supabase/cleanup_oily_common_cache.sql` 로 비움. |
| 2026-05-29 | **콜드 스타트 해시 버킷 5개 도입** (`common` → `common_0~4`). device_id UUID 앞 8자리 hex → int → mod 5. 같은 device 일관성 + 콜드 사용자 다양성. 기존 `common` row는 자연 소멸. |
| 2026-05-29 | 핸드오프 문서 작성. discovery 우상단 FolderHeart 제거 → HamburgerMenu만 유지(프로필 아이콘 통일), 부제목 아래 "내 컬렉션" 알약 버튼 추가 (FolderHeart 아이콘). collection 페이지 HamburgerMenu + 로고 + 하단 네비 통일. footer에 Clock 아이콘 추가. |
| 이전 | discovery·journal에 하단 네비 "오늘의 발견" 추가. PageShell 전면 재구성 (로고 + 본문 + 네비). |
| 이전 | 컬렉션 카드 가로형 → 세로형 그리드. 곡 컬렉션 썸네일 = album art. "저장" 텍스트 제거 (날짜만). |
| 이전 | TrackRow ⋮ 외부 듣기 제거 → 🔖 북마크 only. MiniPlayer 동시 재생 차단. |
| 이전 | 별 버튼 클릭 안 됨 → 그라데이션 overlay `pointerEvents: "none"` 로 해결. |
| 이전 | RN 앱 1단계 (정적 카드) 완료. |
| 이전 | Spotify·Last.fm·ListenBrainz·Wikipedia 후보 검토 후 Apple Music + Claude 채택. |
| 이전 | Apple Music JWT 발급 (Media ID 별도 생성 필요). Spotify Top Tracks 403 차단 확인. |
| 이전 | DB migration_020 (today_discovery) + 021 (discovery_saves) 적용. |
