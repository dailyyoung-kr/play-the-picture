# Session Handoff — 2026-05-03 (Part 2)

> 5/3 저녁 작업 박제. 스토리용 이미지 저장(9:16 카드 viral 채널) 신설 + 트래킹 + 대시보드 + iOS Safari blur 호환 시도.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-03.md](./SESSION_HANDOFF_2026-05-03.md)
> 영구 참조: [PROJECT_KNOWLEDGE.md](./PROJECT_KNOWLEDGE.md)

---

## 1. 한 줄 요약

**스토리용 이미지 저장(9:16 viral 채널) + story_save_logs 트래킹 + 분기 funnel sub-funnel + 인스타 음악 스티커 viral 흐름. iOS Safari Canvas blur 호환은 미해결.**

배포 commit: **15개** (5/3 저녁)
새 viral 채널 도입 — 광고 100% 인스타 유입 사이클 강화 시도.

---

## 2. 5/3 저녁 commit 흐름

```
102dc79  feat(story-save): 9:16 카드 + 인스타 음악 스티커 viral 흐름
8d7de08  fix: iOS Safari Canvas blur — downsample/upsample 트릭 (single-pass)
1de9ccc  feat(admin): 공유 갈래 sub-funnel + 환경별 카드
2ac016d  fix: downsample blur 강도 ↑ (small 25/60)
50c93a9  fix: multi-pass downsample (final 50/100)
390724b  revert: ctx.filter blur 방식 복원 (1차)
b9fc9c7  feat: StackBlur 도입 (가우시안 블러)
76037e1  fix: StackBlur radius·small 조정 (800/540, 50/20)
1f2f620  fix: 약블러 contain 위치 0.25→0.4
00ec40c  revert: 위치 0.4→0.25 원복
f3a7c61  revert: StackBlur 제거 — ctx.filter blur 단순 방식 복원 (최종)
```

---

## 3. 스토리용 이미지 저장 (9:16 카드 viral) ⭐⭐⭐

### 3-1. 배경 — 가설 검증 흐름 (Phase 0 → Phase 1)

**Phase 0 (Meta 공식 문서 조사)**:
- Instagram Stories Sharing API는 iOS 네이티브 앱 전용 (NSPasteboard + deeplink)
- 웹 브라우저에서 이미지 자동 push 불가 (NSData 접근 X)
- Facebook App ID 필수 (2022.10~)
- 결론: 웹 → 인스타 스토리 직접 push는 불가능

**Phase 1 (실기기 검증, /test/ig-stories 임시 페이지)**:
- iOS 인스타 인앱: `instagram://story-camera` 차단 / `instagram-stories://share` 작동 / `instagram://` 차단
- iOS Safari 외부: 모든 deeplink prompt 후 작동
- iOS Safari: `<a download>` → Files 앱 저장 (사진 앱 X)
- iOS 인스타 인앱: `<a download>` → blob viewer (long-press 필요)
- **🟢 핵심 발견**: `navigator.share({ files })` + `canShare({files}) = true` 모든 환경(인앱·외부) 작동
  - share sheet에 "이미지 저장"·카톡·메일·AirDrop·Send Anywhere 등 노출
  - 인스타 인앱에서도 차단 X

→ 마찰 4단계 (탭→시트→이미지 저장→갤러리에서 인스타 스토리 추가). 카톡 SDK 3단계 +1단계지만 viral 가치 큼.

### 3-2. 가설 재정립 — 인스타 viral 우선

이전 핸드오프 §10 권장: **카톡 SDK 우선**
**5/3 저녁 변경**: **인스타 viral 우선** (광고 100% 인스타 유입 컨텍스트 반영)

근거:
- 광고 100% 인스타 → 사용자 이미 인스타 안 → 인스타 viral 자연 동선 (카톡은 환경 전환 마찰)
- Meta 광고 알고리즘 시너지 (인스타 활동 ↑ → CPM ↓ 가설)
- 카톡 chain 폐쇄(§7 H7) 1:N 도달로 돌파
- 18-24 여성 + vibeType 캐릭터 = 인스타 스토리 콘텐츠 적합

### 3-3. 9:16 storyCard 디자인

**1080×1920 hidden 영역** (left: -9999px), html2canvas로 캡처.

```
┌──────────────────────────────────┐
│       Play the Picture           │ y=0~136
│       플더픽의 추천곡             │
├──────────────────────────────────┤
│  사진 영역 (장수별 layout)        │ y=136~880
│  1: 760  / 2: 474  / 3: 309     │
│  4: 380(2x2) / 5: 309(2+3)      │
├──────────────────────────────────┤
│  [오늘의 당신은]                  │ y=970~1240
│   🍎 vibeType (46px medium #fff) │
│   vibeDescription (30px)         │
├──────────────────────────────────┤
│  Don't Worry Be Happy            │ y=1280~1440
│  Bobby McFerrin (가운데)         │
├──────────────────────────────────┤
│  ✦ 플더픽이 추천한 이유            │ y=1500~1820
│  reason (34px lineHeight 1.7)    │
└──────────────────────────────────┘
배경: result 패턴 — 강블러 cover + 약블러 contain + 그라데이션
```

**디자인 결정 박제** (사용자와 ~10라운드 반복 후 확정):
- 모든 사진 1:1 정사각형 + cover 가운데 추출 (확대 X)
- 4장 사이즈 410→400→380 미세 축소 (긴 reason 잘림 방지)
- 1장 사이즈 880→760 (4장과 균형)
- vibeType 박스화 (result 패턴 — flex column gap 16 → marginBottom 14·14·0)
- 해시태그 제거 (4장 케이스에서 reason 잘림 + 자간 정렬 어색)
- reason 폰트 30→34, lineHeight 1.7 (긴 본문 가독성)
- 푸터 제거 (상단 Play the Picture 브랜딩으로 충분)

### 3-4. 핵심 코드 흐름

```
[handleStorySave 클릭]
  ↓
saveEntry() — entry_id 받기 (백그라운드)
  ↓
POST /api/log-story-save (status: clicked) → logId 반환 [백그라운드]
  ↓
prepareStoryBg(albumArt) — Lazy 함수 (첫 클릭만 실행, 이후 캐시)
  - /api/proxy-image 경유 fetch (CORS 우회)
  - blob → base64 변환
  - Canvas API 1080×1920에 다음 합성:
    1) 어두운 fallback #0d1218
    2) 강블러 cover (blur 40px + brightness 0.55, scale 1.5)
    3) 약블러 contain (blur 18px + brightness 0.9, 위에서 25%)
    4) 그라데이션 0.05 → 0.4 → 0.78
  - JPEG 0.85 base64 → setStoryBgBase64
  ↓
storyCard JSX 안 <img src={storyBgBase64}> render (filter X, overlay X — 모두 박혀있음)
  ↓
모든 img.decode() 강제 (이미지 누락 방지)
  ↓
html2canvas(storyCardRef.current, { scale: 2 }) — 결과 2160×3840
  ↓ 실패 시
modern-screenshot fallback (modern-screenshot이 base64 img를 SVG에 못 담는 한계로 fallback이지만 실제 작동)
  ↓
PATCH (generated)
  ↓
navigator.share({ files: [File] })
  ├─ shared    : PATCH (shared)    + 음악 스티커 토스트
  ├─ cancelled : PATCH (cancelled) + 토스트 X
  └─ error     : triggerStoryDownload + PATCH (downloaded)
```

### 3-5. lazy storyBg

result 페이지 진입 시 자동 변환 X. 사용자가 "스토리용 이미지" 클릭 시점만 변환:

```ts
// useEffect 자동 실행 X (lazy)
const prepareStoryBg = async (albumArtUrl: string): Promise<string | null> => {
  // proxy fetch + base64 + Canvas 합성 → JPEG dataURL
};

const handleStorySave = async () => {
  if (!storyBgBase64 && result.albumArt) {
    const bg = await prepareStoryBg(result.albumArt);
    if (bg) {
      setStoryBgBase64(bg);
      await new Promise(r => setTimeout(r, 100)); // React render 반영 대기
    }
  }
  // 캡처 흐름...
};
```

→ **proxy 트래픽 ~70% 절감** (5/3 클릭률 26.5% 가정).

### 3-6. 인스타 음악 스티커 가이드 토스트 (저작권 안전 viral)

iTunes preview 음원을 영상에 박는 건 **Apple 약관 (iv) "synchronized with video" 명시 위반**. 합성 방식(녹화·FFmpeg.wasm·서버) 무관 위반.

→ **저작권 안전한 정공법**: 사용자가 인스타에서 직접 음악 스티커 추가 (인스타 자체 Apple Music/Spotify 라이선스).

토스트 (4줄, 5초):
```
스토리용 이미지가 저장됐어요!
인스타 스토리에
[Almost Heaven - ZxQ]   ← #C4687A 강조, 자동 치환
음악 스티커도 함께 추가해보세요
```

토스트 컨테이너: `whiteSpace: nowrap` 제거 + `wordBreak: keep-all` (한국어 어절 단위 wrap).

---

## 4. story_save_logs 트래킹 인프라

### 4-1. DDL

```sql
CREATE TABLE story_save_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  device_id text,
  entry_id uuid,
  status text NOT NULL CHECK (status IN ('clicked', 'generated', 'shared', 'cancelled', 'downloaded', 'failed')),
  user_agent text
);
CREATE INDEX idx_story_save_logs_device ON story_save_logs(device_id);
CREATE INDEX idx_story_save_logs_created ON story_save_logs(created_at);
CREATE INDEX idx_story_save_logs_status ON story_save_logs(status);
```

### 4-2. funnel 정의

```
clicked     — 버튼 클릭 (즉시 INSERT)
   ↓
generated   — html2canvas 결과 blob 생성 (PATCH)
   ↓
shared      — navigator.share completed (PATCH)
   OR
cancelled   — 사용자 시트 취소 (PATCH, AbortError)
   OR
downloaded  — fallback (canShare 미지원 또는 share 실패)
   OR
failed      — 캡처·처리 자체 실패
```

### 4-3. API route

- **POST /api/log-story-save** — entry_id, device_id, status: "clicked" → row id 반환 + UA 자동 캡처
- **PATCH /api/log-story-save/[id]** — { status } → 동일 row update

share_logs 패턴 그대로.

### 4-4. 첫 검증

5/3 21:10 본인 device 15cc7b32에서 1건:
```
status=shared, ios_safari, entry_id=0d735c81..., 정상 funnel 도달
```

→ 로컬 .env.local에서 `NEXT_PUBLIC_ENABLE_ANALYTICS=true` 임시 변경 후 검증, 다시 false 복원.

---

## 5. 외부 이미지 proxy API

### 5-1. /api/proxy-image route

**목적**: Spotify CDN album art가 CORS 헤더 안 줘서 Canvas 처리 시 taint 발생 → proxy 경유로 같은 도메인 처리.

**보안 가드**:
- HTTPS만 허용
- 화이트리스트 도메인: `i.scdn.co`, `mosaic.scdn.co`, `is{1-5}-ssl.mzstatic.com`
- image content-type 검증
- SSRF / Open Redirect / 임의 외부 사이트 proxy 차단

**캐시**:
- Vercel edge 1일 캐시 (`Cache-Control: public, max-age=86400, immutable`)
- 같은 album art 반복 요청 시 즉시 응답 (~30ms)

---

## 6. 결과 페이지 버튼 위계 재배치

### 6-1. 새 위계 (Tier 3단계)

```
[🔖 아카이브 보관 ┃ 📷 스토리용 이미지]   ← Tier 3 (회색 secondary, 한 줄)
[💬 결과 공유하기]                       ← Tier 2 (옅은 분홍, 단독 — 측정 가능 viral 강조)
[▶ 음악앱에서 듣기]                      ← Tier 1 (진한 분홍, 메인 CTA)
[↺ 한 번 더 해보기]                      ← text link
```

### 6-2. 위계 결정 근거

5/3 데이터 측정 측면:
- 결과 공유하기 (URL) → 추적 명확 (entry_id 기반 friend 도달)
- 스토리 이미지 → 추적 한계 (인스타 외부 행동 측정 X) but 잠재 viral 가치 ↑

→ **단기(5/8)**: 측정 가능한 결과 공유하기를 시각 강조. **장기**: 스토리 viral 효과 누적 후 재평가.

### 6-3. 아이콘 처리

lucide-react가 브랜드 트레이드마크 이슈로 Instagram·KakaoTalk 아이콘 제거.

→ **inline SVG 컴포넌트** 직접 정의:
- `InstagramIcon` (둥근 사각형 + 원 + 점, lucide outline 패턴)
- `KakaoTalkIcon` (말풍선 outline, 단순화 — 카톡 공식 로고는 트레이드마크 회피)

### 6-4. 토스트 메시지 정리

| 케이스 | 메시지 |
|---|---|
| 보관 성공 | "아카이브에 보관됐어요 · 모아보기 →" (✦ 제거, 동사 통일) |
| 스토리 저장 성공 | 4줄 음악 스티커 가이드 |
| 사용자 시트 취소 | (토스트 X) |
| 이미지 생성 실패 | "이미지 생성에 실패했어요. 다시 시도해주세요" |

---

## 7. iOS Safari Canvas blur 호환 — 미해결 ⚠️

### 7-1. 문제

iOS Safari Webkit이 `ctx.filter = "blur(...)"` 미지원/약지원:
- Chrome/Firefox/Android: blur 정상
- **iOS Safari**: blur 무시 → album art 텍스트 그대로 노출 (viral 콘텐츠로 부적합)

### 7-2. 시도 매트릭스 (모두 실패 또는 trade-off)

| 시도 | 결과 |
|---|---|
| **A. ctx.filter "blur(40/18px)"** | Chrome OK, iOS X — 원본 노출 |
| B. Single-pass downsample (small 50/110) | 격자 픽셀화 |
| C. Single-pass 강도 ↑ (small 25/60) | 더 심한 픽셀화 + 곡 제목 단절 |
| D. Multi-pass downsample (final 50/100, 4× 중간) | 부드러움 ↑ but 단절감 잔존 |
| E. **StackBlur** (radius 50/20, small 800/540) | 🟢 가장 좋음 — 가우시안 블러 모든 환경 호환 |

### 7-3. 최종 상태 (5/3 저녁 종료 시점)

**옵션 A로 복원** (사용자 결정):
```ts
ctx.filter = "blur(40px) brightness(0.55)";  // 강블러 cover
ctx.filter = "blur(18px) brightness(0.9)";   // 약블러 contain
```

iOS Safari blur 미해결. **추후 재검토 항목**.

### 7-4. StackBlur 재도입 가능성

- 패키지 (`stackblur-canvas` ^3.0.1) 이미 설치됨 (제거 X)
- 코드만 다시 적용하면 즉시 작동 가능
- 추후 사용자 결정 시 5분 작업으로 복원

---

## 8. 관리자 대시보드 확장

### 8-1. 분기 funnel — 공유 갈래 sub-funnel

```
↑ 공유 갈래 (URL 공유 ∪ 스토리 저장 device 합집합 진입률)
│
├─ 🔗 URL 공유 (기존)
│   ↑ 공유 건수 / 👁 unique 친구 도달 / → 나도 해보기
│
└─ 📷 스토리 저장 (NEW)
    📷 클릭 / ✓ 이미지 생성 (XX%) / ✦ Share completed (XX%)
```

**진입률 정의 변경**: `share_logs.clicked` → `(share_logs ∪ story_save_logs).clicked` device 합집합. 진짜 viral 시도 측정.

### 8-2. VIRAL LOOP — 환경별 미니 영역

```
📷 스토리 저장 환경별 (N건)
  insta_inapp: NN% (N)   ← 광고 ROAS 시너지 신호
  ios_safari: NN% (N)
  ... 기타 환경
  ─ 다운로드 N / 취소 N / 실패 N
```

### 8-3. 미적용 항목

- KEY METRICS 영향 검토 (1회차 공유율 정의 변경 vs 별도 KPI 신설) — 5/8 데이터 보고 결정
- 헤비 유저 / 이탈률 정의 변경 X — 기존 share_logs 기준 유지 (KPI 변동 최소화)

---

## 9. share_views user_agent 박제 (보강)

이전 commit `5a8aa83`에서 도입한 share_views.user_agent 컬럼은 그대로 유지.

→ 5/8 분석 시 sharer × viewer UA 매트릭스 가능:
```
sharer 환경 (share_logs.user_agent)
  ↓
viewer 환경 (share_views.user_agent) — entry_id로 join
```

진짜 카톡 viral·인스타 viral 채널 추적 정확도 ↑.

---

## 10. dead code 정리

| 항목 | 이유 |
|---|---|
| `/test/ig-stories` 폴더 | Phase 1 검증 완료, 본 도입에 사용 X |
| `handleSave` 함수 | PNG 캡처 dead code (호출처 없음) |
| `cardRef` useRef + JSX ref | handleSave 의존 |
| 주석 "캡처 영역 시작/끝" | 의미 없음 |
| `Camera` lucide import | 결과 공유하기 → KakaoTalkIcon으로 변경 |

---

## 11. rate limit 완화

5/3 §11(이전 핸드오프) c70c4974 사례(45회/일 외부 viral seeder, 시간당 25 한도에 6번 fail)로 한도 조정:

```
이전: 분당 5 / 시간당 25 / 일당 50
변경: 분당 5 / 시간당 30 / 일당 60
```

토스트 메시지 🙏 중복 제거 (모달 헤더 🙏 + 메시지 끝 🙏).

---

## 12. 미해결 이슈 / 다음 우선순위

### 12-1. iOS Safari Canvas blur 호환

**우선순위**: 🔴 HIGH (viral 콘텐츠 품질 직격)

**옵션**:
- A. StackBlur 재도입 (5분 작업, 검증된 가우시안 블러)
- B. 픽셀 단위 직접 처리 (느림, but 호환 100%)
- C. 서버 측 sharp blur 처리 (proxy API 확장)
- D. 약블러 contain 제거 (단순화, 분위기 약함)

### 12-2. 5/8 funnel 데이터 분석

**story_save_logs 누적 분석 가능 항목**:
- status × user_agent crosstab (인스타 인앱·iOS Safari 분리)
- entry_id별 인기 곡 (viral 콘텐츠 발견)
- 공유 갈래 진입률 변화 (URL ∪ 스토리 합집합)
- 헤비 유저 (스토리 저장 반복) 패턴

**share_views.user_agent 활용**:
- sharer × viewer UA 매트릭스 (진짜 viral 채널 추적)
- 카톡 friend 도달 vs 인스타 friend 도달 비교

### 12-3. KEY METRICS 정의 검토

5/8 데이터 누적 후:
- 1회차 공유율: URL 공유만 vs 합집합?
- 새 KPI "1회차 스토리 저장률" 신설?
- 종합 듣기 만족도 vs viral 만족도 (스토리 share_completed 비율)

### 12-4. 카카오톡 SDK — 후순위로 이동

5/3 §10에선 우선순위 🥇였지만, 광고 100% 인스타 컨텍스트 반영 후 인스타 viral 우선.
- 5/8 데이터 보고 silent 12건 중 카톡 환경 비율 확인 후 결정
- 카톡 silent 비율 ↑ → 카톡 SDK 도입 정당화
- 인스타 viral 비율 ↑ → 인스타 우선 유지

### 12-5. 광고 ROAS 시너지 검증

가설: 인스타 스토리 viral → Meta 알고리즘 학습 → CPM ↓
- admin VIRAL LOOP의 `insta_inapp 비율` 추적
- Meta 광고 매니저에서 CPM 변화 시계열 비교 (5/8~5/15)

---

## 13. 다음 세션 시작 멘트 후보

```
"5/8 funnel 분석 — story_save_logs status × UA crosstab + 환경별 viral 효과 검증"
```

또는

```
"iOS Safari blur 재도입 (StackBlur) — viral 콘텐츠 품질 격상"
```

또는

```
"카톡 silent 비율 분석 후 SDK 도입 결정 (5/3 §10 후속)"
```

---

## 14. 다음 세션 핵심 참조

| 작업 | 참조 |
|---|---|
| 스토리 카드 디자인 결정 박제 | 본 문서 §3-3 |
| Phase 1 검증 결과 (deeplink·navigator.share) | 본 문서 §3-1 |
| story_save_logs DDL + funnel 정의 | 본 문서 §4 |
| iOS Safari blur 시도 매트릭스 | 본 문서 §7-2 |
| 인스타 음악 스티커 토스트 패턴 | 본 문서 §3-6 |
| 광고 ROAS 시너지 가설 | 본 문서 §3-2, §12-5 |
| admin 공유 갈래 sub-funnel 정의 | 본 문서 §8-1 |
| iTunes preview 약관 (iv) 위반 | 본 문서 §3-6 |

---

## 15. 운영 데이터 박제

### 15-1. 5/3 저녁 작업 자체 측정 (본인 device)

```
story_save_logs 첫 검증 (15cc7b32):
  status: shared
  entry_id: 0d735c81-7867-4a95-b1ac-17ad8656ab33
  user_agent: ios_safari
  funnel: clicked → generated → shared 정상 도달
```

### 15-2. proxy-image 첫 호출

```
초기 albumArtBase64 변환:
  proxy 응답 200 / image/jpeg
  blob 117KB
  base64 156KB
  Canvas 처리 후 storyBg 71KB JPEG (q=0.85)
  → ~700ms (lazy 첫 클릭)
```

### 15-3. 5/3 데이터 변화 (이전 핸드오프 §8 대비)

추가 변경 없음. 5/8까지 데이터 누적 후 비교 예정.

---

## 16. 5/3 핸드오프 통합 상태

```
[5/3 통합 박제 (a655d29)]
  - 측정 인프라 (UA 컬럼 + preview_logs)
  - admin 대시보드 재배치 (3갈래 funnel + 듣기 만족도)
  - viral chain 분석 + 가설 재정립

[5/3 저녁 (본 문서)]
  - 스토리용 이미지 저장 (9:16 viral 채널)
  - story_save_logs 트래킹 + admin sub-funnel
  - 인스타 음악 스티커 가이드 (저작권 안전)
  - rate limit 완화 (분당 5 / 시간당 30 / 일당 60)
  - 미해결: iOS Safari Canvas blur 호환
```

→ 5/3 = 핵심 viral 채널 도입 + 측정 인프라 완성. 5/8까지 데이터 누적 후 본격 분석.
