# Session Handoff — 2026-05-03

> 5/2~5/3 통합 박제. UA 컬럼 + preview_logs + admin 대시보드 재배치 + 5/3 viral chain 발견 + 가설 대거 재정립.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-01.md](./SESSION_HANDOFF_2026-05-01.md)
> 영구 참조: [PROJECT_KNOWLEDGE.md](./PROJECT_KNOWLEDGE.md)

---

## 1. 오늘 한 줄 요약

**공유 측정 인프라 보강 (UA + preview_logs) + admin 대시보드 3갈래 funnel·듣기 만족도 재배치 + 5/3 viral chain 분석으로 silent 진짜 원인 = "사용자 측 마찰"(H6) 확정**

배포 commit: **8개** (5/2~5/3)
누적 외부 유저: **~520명** (5/3 추정)
5/3 단일 KPI 폭증: 공유율 26.5%, K-factor 0.21 (표본 34명, 노이즈 가능성)

---

## 2. 5/2~5/3 commit 흐름 (총 8개)

```
[5/2]
dbb1d88: feat(share-logs): user_agent 컬럼 추적
6509508: fix(result): 공유 fallback 카피 + 토스트 시간 5초 통일

[5/3]
385ead6: feat(admin): viral 측정 정확화 — unique 친구 도달 + 자가 view 비중
e94bc5a: feat(preview): preview_logs 테이블 + 미리듣기 funnel 측정
99616cc: feat(admin): 대시보드 재배치 — 3갈래 funnel + 듣기 만족도 + KEY METRICS 갱신
d786db8: fix(admin): iTunes 매칭률 0/0 오작동 — RLS 우회 admin route 경유
a32c59a: fix(admin): itunes_preview_cache 1000곡 limit 잘림 — 페이지네이션 도입
(Supabase Dashboard 직접): Max rows 1000 → 10000 변경
```

---

## 3. share_logs.user_agent 컬럼 도입 (5/2) ⭐

### 3-1. 변경 내용

**DB:**
```sql
ALTER TABLE share_logs ADD COLUMN user_agent text;
```

**코드** ([api/log-share/route.ts](src/app/api/log-share/route.ts)):
```ts
const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
.insert({ entry_id, device_id, status: finalStatus, user_agent: ua })
```

UA는 'clicked' insert 시점에만 박힘 (PATCH는 status만 갱신, 비대칭 의도적).

### 3-2. 환경 분류 SQL (5/8 분석 시 활용)

```sql
CASE
  WHEN user_agent ILIKE '%KAKAOTALK%'                              THEN 'kakao_inapp'
  WHEN user_agent ILIKE '%Instagram%'                              THEN 'insta_inapp'
  WHEN user_agent ILIKE '%FBAN%' OR user_agent ILIKE '%FBAV%'      THEN 'fb_inapp'
  WHEN user_agent ILIKE '%; wv)%'                                  THEN 'android_webview'
  WHEN user_agent ILIKE '%CriOS%'                                  THEN 'ios_chrome'
  WHEN user_agent ILIKE '%iPhone%' OR user_agent ILIKE '%iPad%'    THEN 'ios_safari'
  WHEN user_agent ILIKE '%Windows%'                                THEN 'win_desktop'
  WHEN user_agent ILIKE '%Macintosh%'                              THEN 'mac_desktop'
  WHEN user_agent ILIKE '%Android%'                                THEN 'android_chrome'
  ELSE 'other'
END AS env
```

5/3 본인 검증으로 ios_safari·insta_inapp·win_desktop·kakao_inapp 모두 분류 정확. **5/8 본격 분석 즉시 사용 가능.**

### 3-3. fallback 카피 + 토스트 시간 정리

[result/page.tsx](src/app/result/page.tsx) 3곳 수정:
- L91 토스트 시간 3초 → **5초** (모든 토스트)
- L229·L985 B-1 토스트: "원하는 곳에 붙여넣어 공유해보세요 ✦" (카톡 unmention)
- L964 B-2 헤딩: "공유 링크" → "**잠깐! 아래 단계로 공유해주세요**"
- L965 서브: 1️⃣2️⃣3️⃣ 단계 가이드
- L988 B-2 fallback의 fallback: "복사에 실패했어요. 위 링크를 꾹 눌러 직접 복사해주세요!"

---

## 4. preview_logs 테이블 + 미리듣기 funnel 측정 (5/3) ⭐

### 4-1. DDL

```sql
CREATE TABLE preview_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  device_id text NOT NULL,
  song text,
  artist text,
  action text NOT NULL CHECK (action IN ('played', 'completed'))
);
CREATE INDEX idx_preview_logs_device ON preview_logs(device_id);
CREATE INDEX idx_preview_logs_created ON preview_logs(created_at);
```

**의도적 설계 결정:**
- entries에 boolean 컬럼 추가 X (사진 base64 무게 보호 차원)
- analyze_logs/share_logs와 동일 "_logs" 패턴
- itunes_preview_cache(곡 메타 캐시)와 역할 분리
  - itunes_preview_cache = "이 곡이 iTunes에 매칭됐나" (1 곡당 1 row)
  - preview_logs = "이 사용자가 이 곡을 들었나" (1 액션당 1 row)

### 4-2. 코드 변경

**`/api/log-preview` POST route 신규** — fire-and-forget INSERT, action CHECK 가드.

**[result/page.tsx](src/app/result/page.tsx) + [share/[id]/ShareClient.tsx](src/app/share/[id]/ShareClient.tsx)**:
- `preview_play` trackEvent 직후 → fetch /api/log-preview action=played
- `preview_complete` 직후 → action=completed
- user activation 영향 0 (audio.play() 후 .then 내부)

### 4-3. KPI 측정 정의

| 지표 | 정의 | 작동선 |
|---|---|---|
| 미리듣기 재생률 | played device / 분석 성공 device | ≥ 50% |
| 30초 완료율 | completed device / played device | ≥ 60% |
| 외부 앱 듣기율 | listen_click device / 분석 성공 device | (참고용) |
| **종합 듣기 만족도** | (played ∪ listen_click) device / 분석 성공 device | ≥ 50% |
| iTunes 매칭률 | matched 합 / itunes_preview_cache 전체 | ≥ 95% |

**핵심**: listen_click 단일 지표가 30초 미리듣기 도입 후 의미 변질 → **합집합으로 진짜 듣기 의도 측정**.

### 4-4. 부하 분석

```
일 200건 가정:
  월: 6,000 row × 260 bytes = 1.56 MB
  1년: 19 MB / Supabase 500 MB 한도의 3.8%

→ 수년간 무료 요금제 안전.
```

**진짜 한도 위험은 entries.photos base64** (월 ~180 MB → 6개월 후 1 GB) — 별개 issue, 5월 후반/6월 photos 외부 storage 검토.

---

## 5. admin 대시보드 재배치 (5/3) ⭐⭐⭐

### 5-1. 새 섹션 흐름

```
헤더 / 토글 / 날짜 필터
  ↓
[1] KEY METRICS — 북극성 4개 (변경 1개)
   • 1회차 공유율
   • 종합 듣기 만족도 ⭐ NEW (유입 전환율 대체)
   • K-factor
   • 1회차 저장율
  ↓
[2] USERS (DAU + 신규/재방문) — 변경 X
  ↓
[3] FUNNEL — 분석까지 (선형)
   📷 사진 → 🎵 장르 → ✦ 분석 시작 → ✓ 분석 성공
  ↓
[4] FUNNEL — 분석 후 분기 (3갈래 병렬) ⭐ NEW
   ┌─🎵 듣기 갈래─┬─💾 저장 갈래─┬─↑ 공유 갈래─┐
   │ 진입률      │ 진입률       │ 진입률       │
   │ 재생률      │              │ 공유 건수   │
   │ 30초 완료율│              │ unique 도달 │
   │ 외부 앱듣기│              │ 나도 해보기 │
   └────────────┴──────────────┴─────────────┘
  ↓
[5] 헤비 유저 / 이탈률 ⭐ NEW
  ↓
[6] CONVERSION (3개 — 듣기 클릭률 제거)
  ↓
[7] VIRAL LOOP ⭐ 재구성 (4 카드)
   1행: unique 친구 도달 / 자가 view 비중
   2행: raw 조회 / 유입
  ↓
[8] 🎵 LISTEN SATISFACTION ⭐ NEW 섹션 (4 카드)
   1행: 미리듣기 재생률 / 30초 완료율
   2행: 외부 앱 듣기율 / iTunes 매칭률
  ↓
[9] QUALITY (회차별·재뽑기 텀) — 변경 X
[10] PERFORMANCE — 변경 X
[11] RETENTION — 변경 X
[12] CONTENT INSIGHT — 변경 X
```

### 5-2. 사용자 직관 반영 (5/3 핵심 결정)

**듣기·저장·공유는 병렬 행동, 순차 funnel 아님.** 분석 성공 후 4갈래 분기 (듣기/저장/공유/이탈), 각 갈래마다 sub-funnel.

이 분리 덕분에 **진단 능력 ↑**:
| 패턴 | 의미 | 액션 |
|---|---|---|
| 듣기 🟢 + 저장 🔴 + 공유 🔴 | 곡 만족 + 자랑·수집 X | 컬렉션 가치 부각 |
| 듣기 🟢 + 저장 🟢 + 공유 🔴 | 본인은 만족, viral X | 마찰 제거 (5/3 발견) |
| 듣기 🔴 + 저장 🟢 + 공유 🟢 | 곡 못 듣지만 결과 가치 | iTunes 매칭률 |

### 5-3. KPI 진단 가이드 (카드 tooltip)

**KEY METRICS:**
- 종합 듣기 만족도: ≥50% green / ≥30% yellow / <30% red
- 공유율: ≥10% green / ≥3% yellow / <3% red
- K-factor: ≥0.1 green / ≥0.05 yellow / <0.05 red

**VIRAL LOOP:**
- unique 친구 도달: ≥1.0 green / ≥0.5 yellow / <0.5 red
- 자가 view 비중: <10% green / <30% yellow / ≥30% red (역방향)

**LISTEN SATISFACTION:**
- 재생률: ≥50% green
- 30초 완료율: ≥60% green
- iTunes 매칭률: ≥95% green

### 5-4. RLS + 1000 row limit fix (5/3 후반)

**문제 1**: itunes_preview_cache는 RLS로 anon SELECT 차단 → admin에서 0/0 표시.
**해결**: `/api/admin/log-rows`에 supabaseAdmin 경유 itunes select 추가.

**문제 2**: Supabase PostgREST default max-rows 1000 → 1,384곡 중 1,000곡만 잡힘.
**해결 1**: itunes 페이지네이션 함수 `fetchAllItunesStatus()` 신설 (1000곡씩 page).
**해결 2**: Supabase Dashboard → API Settings → **Max rows 1000 → 10000** 변경.

→ admin의 모든 테이블 정확히 cover. preference_logs(2,115) / analyze_logs(2,104) / photo_upload_logs(1,859) / result_view_logs(1,679) 모두 정상.

**향후 리스크**: ~5개월 후 10,000 도달 가능. 그때 max rows ↑ 또는 페이지네이션 영구 도입.

---

## 6. 5/3 viral chain 분석 ⭐⭐⭐

### 6-1. chain 패턴 발견

5/3 새벽 04시대 외부 사용자 2명(A·B)의 ping-pong:

```
03:14:31  A 공유 "☕ 햇살러버 미식가"
03:14:46    ↓ B 클릭 (15초 후) 🟢
03:16:52  A 공유 "🍱 정식 두판러"
03:17:16    ↓ B 클릭 (24초 후) 🟢

      ─── B가 흥미로워서 본인도 분석 시도 ───

04:00:02  ⭐ B 공유 "🍱 정식러버 탐험가" ← B가 직접 분석!
04:01:50    ↓ A 클릭 (1분 48초)
04:14:40  ⭐ B 공유 "☕ 무드수집러"
04:15:28    ↓ A 클릭 (48초)

10:58:14    ↓ B가 03:14 카드 다시 봄 — D1 retention 시그널 🟢
```

### 6-2. 결정적 5가지 인사이트

#### 1. **share_views row count는 viral 과대계상** ⚠️

5/3 04:00 정식러버 탐험가 = 4 views로 보였지만:
- B 자가 view 2건 (04:01, 04:12)
- A view 2건 (04:01:50, 04:02:13)
- **unique 친구 도달 = 1명**

→ admin VIRAL LOOP의 raw 조회와 unique 친구 도달 분리가 정당화됨.

#### 2. **친구 도달 속도 매우 빠름** 🟢

| 공유 → 클릭 | 간격 |
|---|---|
| A → B (1차) | 15초 |
| A → B (2차) | 24초 |
| B → A (1차) | 1분 48초 |
| B → A (2차) | 48초 |

→ **카톡 채널 viral conversion 즉각**. H4(친구 미클릭) 또 다른 각도로 기각.

#### 3. **2명 내부 폐쇄 chain — 외부 확장 X**

A → B 끌어들임으로 신규 1명. B의 답례 공유는 새 사용자 유입 0 (A는 이미 사용자).

```
chain 외부 유입: 1명 (B)
chain 분석자: 2명
chain K-factor: 0.5 ← 평균 80배지만 외부로 안 퍼짐
```

#### 4. **자가 view 다수 = 자기 캐릭터 만족도** 🟢

B가 자기 결과 30분 안에 4번 다시 봄 (04:01, 04:12, 04:15, 04:30).
- vibeType이 캐릭터형(~수집러, ~탐험가)일 때 자기 만족 ↑
- 4월 §13-1·11-2 viral 톤 가이드 검증 데이터 추가

#### 5. **D1 retention 시그널** 🟢

10:58 B가 7시간 후 A의 03:14 카드 다시 봄. **하루 안에 재방문** 패턴 — Tier 3 PWA install + Web Push 작업 baseline.

---

## 7. 가설 재정립 (§13-7 갱신) ⭐⭐⭐

5/3 데이터로 가설 대거 재정립:

| 가설 | 5/1 상태 | **5/3 데이터 후** |
|---|---|---|
| H1 (iOS 카톡 navigator.share 차단) | ❌ | ❌ **완전 기각** (kakao_inapp viral 2건 외부 사용자) |
| H1' (Android 카톡 차단) | ⏳ 미검증 | 🟡 약화 (android_chrome cancelled = API 동작) |
| **H2 (overcounting)** | 🔴 코드 confirmed | 🟢 **데이터로 confirmed** (cancelled+fallback 100% silent) |
| H3 (친구 측 트래킹 차단) | ❌ | ❌ 유지 |
| **H4 (친구가 카드 받고 클릭 안 함)** | 🟡 가능 | ❌ **기각** (completed 4/4 viral, 100% conversion) |
| **H5 (사용자 공유 의도 약함)** | — | 🟡 → 🟢 다듬기 |
| **H6 (시트~전송 사이 마찰 큼)** ⭐ | — | **🟢 NEW — 사용자 직관 반영** |
| **H7 (chain은 친구 그룹 내부 폐쇄)** ⭐ | — | **🟢 NEW** (5/3 chain 데이터로 확정) |

### 7-1. silent 88.9%의 진짜 원인

```
외부 사용자 신규 status 12건 (5/1 19:00 이후):
  cancelled  6건 → 100% silent
  fallback   4건 → 100% silent
  completed  0건 (5/1~5/2) → 5/3 4건 추가 → 모두 viral!

→ silent = 사용자 측 미공유 (시트 띄우고 진행 안 함)
→ completed = viral 100% (4/4 conversion)
```

**핵심**: 친구·환경 문제 X, **사용자가 시트 띄우고 친구 선택 단계에서 마찰에 꺾임**.

### 7-2. 폐기되는 작업 (이전 우선순위 → ❌)

| 작업 | 폐기 이유 |
|---|---|
| 카카오 SDK 도입 (이전 검토) | H1 기각으로 정당화 사라짐... 했으나 **마찰 제거 관점에선 정공법** (사용자 직관 H6 반영, 재검토) |
| OG 카드 디자인 개선 | H4 기각 — 친구가 받으면 어차피 클릭 |
| share 페이지 사진 ↑ | 동일 — 친구 클릭률 이미 높음 |
| Android 폰 검증 | H1' 약화 — 우선순위 ↓ |
| 옵션 1+2 인스타 콤보 | viral 채널 다각화 가치 작음 (4월 viral 거의 카톡) |
| 결과 페이지 광고 도입 | KPI 자살 (월 수익 ₩4~10k vs 광고비 ₩200k+, viral 죽임) |

---

## 8. 5/3 KPI 폭증 + 표본 한계

### 8-1. 측정 결과 (admin 대시보드 5/3 단일)

```
사용자: 34명 (오늘 신규 31명 / 재방문 3명)

[KEY METRICS]
공유율:           26.5% (4월 6.3% → 4배 ↑)
1회차 저장율:     26.5% (4월 ~8% → 3배 ↑)
종합 듣기 만족도: 26.5% (= 외부 앱 듣기율, 미리듣기 0건)
K-factor:        0.21  (4월 0.006 → 35배 ↑)

[3갈래 분기]
듣기 갈래: 26.5% (9명)
저장 갈래: 29.4% (10명)
공유 갈래: 17.6% (6명)
헤비 유저: 8.8%  (3명, 3가지 다)
이탈률:    52.9% (18명)

[VIRAL LOOP]
unique 친구 도달: 0.56 (5명/9공유)  ← 진짜 viral 약함
자가 view 비중:   40%   (4자가/10전체)
공유 1건당 raw:   1.1   (자가 포함)
```

### 8-2. 표본 한계

- 34명 / 9공유 / 5 unique 친구 — **통계적 신뢰도 낮음**
- 5/3 chain 영향 큼 (B 본인 + A·다른 친구 viral 끌어올림)
- **5/8까지 추세 봐야 진짜 KPI 변화 확정**

### 8-3. 신규 vs 재방문 행동 격차

```
신규 (31명): 저장 32.3% / 공유 29.0%  ← viral 친화 사용자 군집
재방문 (3명): 저장 0% / 공유 0%       ← 표본 부족
```

→ 5/3 chain의 신규 사용자가 광고 유입 후 매우 viral 친화적. 다만 표본 작아 일반화 X.

---

## 9. GA4 기술 인사이트 (5/2 확인)

```
모바일:  95.6% (~2,000명)
desktop: 3.6%  (76명)
tablet:  0.8%  (17명)

iOS:     ~70% (1,400명)
Android: ~30% (621명)

브라우저:
  Safari (메인) > AndroidWebview (인앱) > Chrome > SamsungInternet
  > Safari (in-app) > Whale (네이버) > Edge

화면 해상도: iPhone 14·15 standard 시리즈 (393x852, 390x844 다수)
```

**시사점:**
- DB user_agent 컬럼 추가 작업 폐기 (GA4가 cover, 모바일 95.6%면 desktop 노이즈 수준)
- AndroidWebview = 카톡 인앱 가능성 (5/8 분석 시 H1' 검증 핵심)
- Whale Browser 등장 = 네이버 SEO 효과 baseline

---

## 10. 다음 세션 우선순위 (재조정)

### 🥇 Tier 1 — 5월 1주차 핵심 (silent 88.9% 직격)

#### 1. **공유 마찰 제거 작업** ⭐ (사용자 직관 H6 반영)

**옵션 A. fallback 모달 1단계 압축** (~30분)
- 현재 1️⃣2️⃣3️⃣ 3단계 가이드 → 사용자 부담
- 단일 버튼 "링크 복사하고 카톡 열기"
- `clipboard.writeText` + `kakaotalk://` deeplink 동시
- **우선순위 🔴 HIGH** — 즉시 적용 가능, 마찰 제거

**옵션 B. 카카오 SDK 도입** (~4~6시간)
- UA 분기: 카톡 인앱·Android만 SDK, 그 외 navigator.share
- 친구 선택창 직진 (5 step → 3 step)
- **5/8 데이터 보고 결정** (cancelled/fallback이 카톡·Android에 몰리면 정당화)

#### 2. **5/8 funnel 본격 분석** (5/8 ~ 5/9)
- status × user_agent crosstab으로 silent 원인 환경별 분리
- preview_logs 1주 누적분으로 듣기 funnel 진단
- 본인 device 13개 known list 제외 외부 한정 분석

#### 3. **iTunes low_score 96곡 batch 처리** (60~90분, §13-12 갱신)
- 5/3 기준 low_score **96곡** (4/30 54곡 → 늘어남)
- KR → JP → US fallback 도입 + artistId lookup
- 듣기 클릭률 +2~3% 개선 예상

### 🥈 Tier 2 — 5월 2주차

4. **K-pop e=1 풀 보강** (admin/import-text, §6-3 그대로)
5. **Meta UTM 매크로 정리** (`{{adset.name}}`)
6. **광고 placement mobile-only 전환 검토** (desktop 3.6% 헛돈 가능성, GA4 검증 후)

### 🥉 Tier 3 — 5월 후반 또는 6월

7. **PWA install + Web Push** — D1 retention 작업 (5/3 chain에서 7시간 후 재방문 패턴 발견)
8. **explicit 정책 옵션 C** (PROJECT_KNOWLEDGE.md §8-9, 4/29부터 보류)
9. **photos 외부 storage 이전** ⚠️ 무료 한도 위험 (월 180MB, 6개월 후 1GB 초과)
10. **ffbfb9b2 device 분석 영향 재검토** (§13-1 잔디밭 점령러 패턴 — 본인 device 확정 후 외부 사용자 패턴 재추정)

---

## 11. 미해결 이슈

### 11-1. 본인 device 정리 완료 (5/3)

`NEXT_PUBLIC_INTERNAL_DEVICE_IDS` 13개 (vercel + .env.local 동기화 완료):

```
c9a5ac48 / ffbfb9b2 / d49b33dc / f39f816f / 4d0071d7 /
63f7de85 / f33fc09e / 98e71f2a / 25a4f774 /
d3d80439 / 15cc7b32 / c1904437 / 93038bf5
```

오늘 신규 4개 (5/2~5/3 본인 검증 device): d3d80439·15cc7b32·c1904437·93038bf5.

### 11-2. share_logs 측정 누수 1.3% (KPI 영향 미미, 보류)

4/15 이후 entries 160 중 누수 2건:
- 돗자리 점령단 (5/1 17:00, 본인 device 15cc7b32) — 진짜 누락 (production navigator.share + fetch 실패)
- 잔디밭 관찰러 (4/26 21:52, 본인 device 98e71f2a) — 자가 view (1분 후)

**진짜 누락은 1건 (전체 0.6%)**. KPI 영향 X, 디버깅 우선순위 낮음.

향후 보강 (5월 후반/6월):
- `navigator.sendBeacon`으로 fetch 변경 (페이지 떠나도 보장 전송)
- retry 1회 추가

### 11-3. 1000 row limit (5개월 후 다시 도달 예상)

5/3 max rows 1000 → 10000 변경으로 일시 해결. 일평균 50 row/일이라 ~158일 후 (10월) 다시 도달.

영구 해결: 페이지네이션 모든 admin 데이터 로드 (~1~1.5h) 또는 server-side aggregation.

### 11-4. entries.photos base64 무게 (잠재 위험)

```
entries.photos: 100~500 KB/row (사진 1~5장 base64)
일 30 entries × 평균 200 KB = 6 MB/일 = 180 MB/월
6개월 후 ~1 GB 도달 → 무료 한도 500MB 초과
```

5월 후반/6월 외부 storage 이전 검토 (Supabase Storage 또는 S3).

### 11-5. 추천 정확도 향상 — 6월 검토 (§9-2 그대로)

- ❌ Spotify Audio Features (신규 앱 차단)
- ❌ Apple Music API mood (비공개)
- 🟡 Last.fm + Genius + Claude 정형화 (5월에 partners@last.fm 동의 메일만)

---

## 12. 다음 세션 시작 멘트 후보

```
"공유 마찰 제거 — fallback 모달 1단계 압축 + 카톡 deeplink"
```

또는

```
"5/8 funnel 분석 — UA × status crosstab으로 silent 원인 분해"
```

또는

```
"iTunes low_score 96곡 batch 처리 (KR→JP→US fallback)"
```

---

## 13. 다음 세션 핵심 참조

| 작업 | 참조 |
|---|---|
| 5월 KPI / 광고 전략 / 운영 분배 | PROJECT_KNOWLEDGE.md §7 |
| viral 콘텐츠 패턴 | PROJECT_KNOWLEDGE.md §6 |
| 가설 재정립 (H1·H4·H6·H7) | 본 문서 §7 |
| 5/3 viral chain 패턴 | 본 문서 §6 |
| share_logs UA 분류 SQL | 본 문서 §3-2 |
| preview_logs DDL + KPI 정의 | 본 문서 §4 |
| admin 대시보드 새 구조 | 본 문서 §5 |
| 본인 device 13개 known list | 본 문서 §11-1 |
| iTunes low_score 96곡 batch | 본 문서 §10 Tier 1 + SESSION_HANDOFF_2026-05-01.md §13-12 |
| 마찰 제거 옵션 A·B 트레이드오프 | 본 문서 §10 Tier 1 |
| GA4 기술 인사이트 (모바일 95.6%) | 본 문서 §9 |

---

## 14. 5/1 핸드오프 대비 변화 요약

```
[5/1 → 5/3]

▶ 측정 인프라 보강:
  - share_logs.user_agent 컬럼 추가 (5/2)
  - preview_logs 테이블 신설 (5/3)
  - 본인 device 13개 known list 정리 (vercel + .env.local 동기화)

▶ admin 대시보드 재배치:
  - KEY METRICS: 유입 전환율 → 종합 듣기 만족도
  - FUNNEL: 선형 → 분석 후 3갈래 병렬 분기
  - VIRAL LOOP: raw 2개 → 신규 unique 친구 도달 + 자가 view + raw 4개
  - 🎵 LISTEN SATISFACTION 신규 섹션 (재생률·완료율·외부앱·iTunes매칭)
  - 헤비 유저 / 이탈률 카드 추가
  - iTunes 매칭률 RLS + 1000 row limit fix (Max rows 10000)

▶ 가설 대거 재정립:
  - H1 (iOS 카톡 차단) ❌ 완전 기각 — kakao_inapp viral 2건 외부 사용자 발견
  - H4 (친구 미클릭) ❌ 기각 — completed 4/4 viral (100% conversion)
  - H6 (시트~전송 마찰) 🟢 NEW — 사용자 직관, silent 진짜 원인
  - H7 (chain 친구 그룹 폐쇄) 🟢 NEW — 5/3 chain으로 확정

▶ 우선순위 재조정:
  - 🔴 폐기: OG 카드 개선·인스타 콤보·결과창 광고
  - 🥇 신설: 공유 마찰 제거 (fallback 압축 + 카카오 SDK 검토)
  - 🥈 유지: iTunes 96곡 batch / k-pop e=1 풀 / Meta UTM

▶ 5/3 KPI 폭증 (표본 34명 한계):
  공유율 6.3% → 26.5% / K-factor 0.006 → 0.21
  → 5/8 추세로 진짜 KPI 변화 검증 필요
```

---

## 15. 운영 데이터 박제

### 15-1. 신규 status × view 매트릭스 (5/1 19:00 ~ 5/3 외부)

| status | shares | view 발생 | silent% |
|---|---|---|---|
| cancelled | 6 | 0 | 100% |
| fallback | 4 | 0 | 100% |
| **completed** | **4** | **4** | **0%** ⭐ |

→ **completed = viral 100%** (4/4 conversion). H4 기각 결정적 증거.

### 15-2. 5/3 KPI 변화 (raw vs 보정)

```
raw 공유율:  26.5%
실제 viral 강도 (unique 친구 도달): 0.56 (1.0 작동선 미달)
자가 view 비중 40% → raw 1.1을 진짜 0.66으로 보정
```

→ **raw 지표는 폭증으로 보이지만 진짜 viral은 약함**. 5/3 chain 영향 큼.

### 15-3. 4월 viral 17건 회고 영향 (본인 device 정리 후)

본인 device 13개 (특히 ffbfb9b2)가 known list에 들어가면서 4월 분석 일부 재추정 필요:
- §13-1 "4/26 잔디밭 점령러 4건 동일 vibe_type → 다양성 부족" 결론
- 만약 ffbfb9b2이 본인 거였으면 본인 테스트 패턴 영향이었을 수도

5/3 일단 보류 — 별도 분석 시 재검토 (Tier 3).
