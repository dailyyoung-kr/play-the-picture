# Session Handoff — 2026-04-26

다음 세션에서 작업 이어갈 때 혼동 없도록 정리한 문서. 코드 상세는 직접 읽으면 되고, **이 세션에서 결정·합의된 맥락**과 **운영 중 발견한 실제 문제·해결**을 박제하는 게 목적.

---

## 1. 플더픽 구조 (현재 상태)

### 도메인 (NEW)
- **메인**: `https://playthepicture.com` (호스팅케이알 등록, 2026-04-26 마이그레이션)
- **이전 도메인**: `play-the-picture.vercel.app` (Vercel default, 계속 작동)
- DNS: 호스팅케이알 → A 레코드 `216.198.79.1`, CNAME `www` → `cname.vercel-dns.com`
- SSL: Vercel 자동 (Let's Encrypt)

### 핵심 페이지·라우트
| 경로 | 역할 |
|---|---|
| `/` | 랜딩 — 사진 업로드 진입 |
| `/preference` | 분석 트리거 — UTM 캡처 + analyze_logs insert |
| `/result` | 결과 — 공유 버튼, "지금 듣기" CTA, vibeType/Description/reason |
| `/share/[id]` | 공유 페이지 — generateMetadata로 OG 메타 동적 생성 |
| `/api/og` | OG 이미지 동적 생성 (1200x630, ImageResponse from `next/og`) |
| `/api/og/default` | 랜딩용 정적 OG (의도된 디자인 — "플더픽 + + +" 플레이스홀더) |
| `/api/log-share-view` | 공유 페이지 방문 기록 → `share_views` 테이블 |
| `/api/log-try-click` | "내 사진으로 해보기" 클릭 기록 → `try_click` 테이블 |

### 데이터 모델 (DB)
- `entries` — 분석 결과. 핵심 컬럼: `id (uuid)`, `song`, `artist`, `album_art`, `photos (text[] base64)`, `vibe_type`, `vibe_description`, `reason`, `tags`, `device_id`
- `analyze_logs` — 분석 시도. UTM 5종 (`utm_source/medium/campaign/content/term`)
- `share_views` — 공유 페이지 방문 (`entry_id`, `device_id`)
- `try_click` — CTA 클릭 (`entry_id`, `device_id`)
- `recommendation_logs` — 7일 반복 추천 방지 (with `vibe_type`)

### OG 메타 구성 (`/share/[id]/page.tsx` generateMetadata)
- `og:title` = `${vibeType}의 오늘의 노래` (vibeType 누락 시 `song — artist`로 fallback)
- `og:description` = **정적 카피** `"내 사진엔 어떤 노래가 어울릴까?"` (모든 entry 동일)
- `og:image` = `https://playthepicture.com/api/og?id={id}` (1200x630)

### Web Share text (공유 버튼 클릭 시)
**현재 비어있음** — `navigator.share({ url })` 만 호출. text/title 없음 → 카톡에서 노란 말풍선 없이 OG 카드 1개만 노출됨.

### OG 이미지 레이아웃 (`/api/og/route.tsx`, `b0a18ed`)
- 캔버스: 1200×630
- 좌측 사진 영역: **520×630** (PHOTO_W=520)
- 우측 앨범아트 영역: **680×630** (실제 앨범아트 본체는 contain으로 630×630 정사각)
- 사진 우측 페이드: width=40, opacity=0.4 (사진 가림 최소화)
- 곡명 박스: bottom-right, fontSize 56(곡)/32(아티스트), maxWidth 560

### 사진 장수별 레이아웃 (PHOTO_W=520)
| 장수 | 레이아웃 | 슬롯 사이즈 |
|---|---|---|
| 1 | 풀 | 520×630 |
| 2 | 좌우 분할 | 255×630 each |
| 3 | **1+2 (좌측 풀높이 + 우측 상하)** | 255×630 + 255×310×2 |
| 4 | 2x2 그리드 | 255×310 each |
| 5 | 상단 2 + 하단 3 | 255×310 + 167×310 each |

### OG 캐시 전략 (`f068bbb`)
- `/api/og` 응답에 `Cache-Control: public, max-age=31536000, immutable`
- `/result` 공유 버튼 클릭 시 `fetch("/api/og?id=...")` await (max 6초 timeout) → 후 `navigator.share`
- 첫 공유만 1~6초 대기, 그 후 같은 entry는 Vercel CDN edge에서 ~20ms

---

## 2. 이 세션의 핵심 결정·맥락

### 2-1. "전환율 0" 진단 결과
사용자가 "공유 후 전환율 0"이라 판단한 것은 **분모가 작아서**였음:

| 일자 | 외부 unique viewer | try_click 전환율 |
|---|---|---|
| 4/20 | **17명** | 4명 (23.5%) ← 베이스라인 |
| 4/24~26 | **6명** | 0명 (디버깅 트래픽 포함) |

→ 카드 hook 문제가 아니라 **공유 자체가 거의 안 일어남**이 본질.

### 2-2. 광고 UTM 5계층 추적 (Migration 011)
Meta 광고 매개변수: `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}`
- `analyze_logs`에 `utm_content`, `utm_term` 컬럼 추가됨
- `idx_analyze_logs_utm_content` 인덱스 (광고 소재 단위 분석 빈번)

### 2-3. og 카드 디자인 변천사 (이 세션에서 시도한 것들)
1. **og:title** 곡명 → vibeType 형식 (`[vibeType]의 오늘의 노래`)
2. **og:description** vibeDescription → reason → 정적 CTA "내 사진엔 어떤 노래가 어울릴까?"
3. **Web Share text** "오늘의 노래 ✦ 플더픽" → "오늘은 어떤 곡? ✦ 플더픽" → **제거** (1메시지화)
4. **OG 이미지 비율** 520:680 → 800:400(B안) → 롤백 → **520:680 유지**
5. **3장 레이아웃** 2상+1하(가로 띠) → **1+2 재설계** 적용 완료
6. **우측 페이드** 80px/0.72 → **40px/0.4** 적용 완료

### 2-4. OG 이미지 응답 시간 문제
- 정상 응답인데도 **4~6초** 소요 (ImageResponse 무거움)
- 카톡 크롤러 timeout ~5초 → 임계점
- 캐시 헤더 + pre-trigger 적용해서 해결 (`f068bbb`)

### 2-5. 앨범아트 식별성 개선 (`96f85ec`)
- 이전엔 블러 배경만 있어 앨범아트 식별 안 됨
- 선명한 앨범아트 본체 layer 추가 (blur 4px, contain)
- 그라디언트 오버레이로 곡명 박스 가독성 확보

### 2-6. 이전 og:title 구조의 강함 (4/20 베이스라인)
4/20 17명 viewer 시점 og:title = `[vibeType]의 오늘의 노래` — 곡명이 아니라 **vibeType이 카드 큰 글씨로 노출**.
이게 호기심 훅 ("뭐지?" 클릭 유발). MBTI/심리테스트 바이럴 패턴과 일치.
→ 그래서 이번에 곡명 → vibeType로 롤백.

---

## 3. 운영 원칙·제약 (CLAUDE.md 보강)

### 사전 승인 필수
- 수정 파일 3개+ 또는 기존 로직 큰 변경 → 설명 + 승인 후 진행

### 외부 API 비용 주의
- Spotify (rate limit), YouTube (10000 units/day), Anthropic ($0.015~0.02/분석)
- 로컬 테스트는 mock 우선

### 추천 시스템
- 아티스트당 5~7곡 이하
- 메가히트 대표곡 회피
- `[FALLBACK]` 로그 모니터링
- `recommendation_logs`로 7일 반복 방지

### 광고 운영
- 영상 광고 > 캐러셀 (CPA 1.5~2배)
- 18-24 저녁 8시대 바이럴 피크
- 예산 급증 금지
- `NEXT_PUBLIC_ENABLE_ANALYTICS=false` (로컬)

### 지표 해석
- 표본 크기 고려 (듣기 50+, 공유 20+, 유입 10+)
- 단일 일자 금지
- 타임존 KST: `(created_at AT TIME ZONE 'Asia/Seoul')::date`

---

## 4. 알려진 이슈·미해결 작업

### 4-1. 카톡 OG 캐시 (수동 무효화 필요)
이전 entry들 중 잘못된 OG 캐시 박힌 것들:
- `36e0d99f-3151-47cf-b3db-5bd760d6c82e` (4장인데 1장만 보임)
- `5aa2c1d3-25c7-4d66-a3df-9e9ea64bdb6b` (5장인데 3장만 보임)
- 해결: https://developers.kakao.com/tool/clear/og 에서 URL별 캐시 삭제

### 4-2. vibeType 추상형 ("마루의 시간")
가이드("캐릭터화된 별명 ~수집가/탐험가/요정/러")를 위반한 vibeType이 종종 생성됨.
"마루의 시간**의** 오늘**의** 노래" 의 3중 어색함 발생.
→ vibeType 생성 프롬프트 점검 필요 (별도 작업).

### 4-3. 이미지 비율 분석 (보류)
사용자 사진이 세로/가로 어느 쪽 비율이 우세한지 DB 기반 분석 안 함.
720x1280(세로) 위주면 520:680이 최적, 1280x720(가로) 위주면 800:400이 최적.

### 4-4. 도메인 마이그레이션 부수 작업 (옵션)
- vercel.app → playthepicture.com 자동 redirect (Vercel Settings에서)
- Meta 광고 UTM URL 업데이트 (vercel.app → playthepicture.com)
- GA4 referral 제외 도메인 추가

### 4-5. 5장 레이아웃 다듬기 (낮은 우선순위)
현재 상단 2(255×310) + 하단 3(167×310) — 폭 불일치 1.5배.
인스타 콜라주형(메인+4) 등 대안 검토 가능. 단, 현재도 작동은 함.

---

## 5. 최근 커밋 흐름 (이 세션)

```
078c321 도메인 마이그레이션 — playthepicture.com
f068bbb OG 캐시 안정화 — 캐시 헤더 + 공유 클릭 시 pre-trigger
b0a18ed OG 3장 레이아웃 1+2 재설계 + 우측 페이드 축소
b6c55fb Revert "OG 이미지 비율 800:400 — 사용자 사진 강조"
b7fde83 OG 이미지 비율 800:400 (롤백됨)
588c030 공유 시 OG 카드 1개만 노출 — Web Share text 제거
4e5d13d og:description 정적 CTA 카피로 전환
48f89d7 공유 카드 카피 실험 — reason 노출 + 의문형 Web Share
e97b6c1 og:title 위계 롤백 — vibeType이 카드 호기심 훅
1076901 OG 곡명 박스 투명도 완화
96f85ec OG 이미지 앨범아트 식별성 개선
8ef7500 공유 코멘트에 '✦ 플더픽' 시그니처 추가 (이후 588c030에서 제거)
```

---

## 6. 다음 세션 우선순위 제안

1. **검증** — 새 entry 만들어서 카톡 공유 → playthepicture.com 도메인 + OG 카드 정상 노출 확인
2. **데이터 모니터링** (4/28~30 KST) — 외부 unique viewer가 4/20 베이스라인(17명)으로 회복되는지
3. **vercel.app → playthepicture.com redirect 설정** (Vercel Settings UI)
4. **Meta 광고 UTM URL 업데이트**
5. **vibeType 추상형 방지** — 생성 프롬프트 점검

---

## 7. 참고 — 사용자 프로필

- 코딩 입문 단계 (한국어 소통)
- 커뮤니케이션 한국어, 직설적 의견 + 트레이드오프 명시 선호
- 메모리 시스템: `/Users/pcy_mac/.claude/projects/-Users-pcy-mac-play-the-picture/memory/`
