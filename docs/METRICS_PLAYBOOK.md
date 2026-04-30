# 플더픽 지표 분석 Playbook

향후 지표 개선 대화 세션에서 매번 새로 학습하지 않도록 박제. 분석 전제·SQL 패턴·베이스라인·viral 풀 모두 한 파일.

---

## 0. 분석 전 필수 전제 ⚠️

### 0-1. 본인 테스트 device 9개 제외 (외부 유저 측정 시)

```
c9a5ac48-842b-450c-9f55-843f9aad09d7
ffbfb9b2-d60a-43a3-899d-51185fad652e
d49b33dc-698b-4ebf-9c92-11fae75af78f
f39f816f-6e76-4e19-8369-81df4349ef67
4d0071d7-8f52-4564-b307-be03636bf853
f33fc09e-01f0-4abf-8edd-208d37c4bd7a
63f7de85-aa41-47fa-857e-a81f1447a658
98e71f2a-e4ce-4296-9fec-b0f9a7af3d2f      ← playthepicture.com 시절
25a4f774-d724-4769-9897-4ab140a106ee      ← playthepicture.com 시절
```

대시보드(viewMode="user")는 자동 제외하지만, **직접 SQL 분석 시 항상 명시 필요**.

### 0-2. 도메인 격리 이슈 (4/26~)

- device_id는 `localStorage.getItem("ptp_device_id")` 기반 ([src/lib/supabase.ts:10-16](../../../../src/lib/supabase.ts), [src/lib/device.ts:3-6](../../../../src/lib/device.ts))
- localStorage는 **도메인별 완전 격리** → vercel.app vs playthepicture.com에서 동일 기기라도 다른 device_id
- **본인 device 새로 발견 시마다** `.env.local` + Vercel env 양쪽 갱신 + redeploy 필요 (`NEXT_PUBLIC_*`은 빌드 타임 박힘)

### 0-3. 의심 device 식별 패턴

본인 외 device가 **짧은 시간 다발 분석**한 경우 → 외부 viral retry 행동일 가능성. 본인 device로 오인하지 말 것.

```
의심 → 외부 viral 가능성:
- 짧은 시간 (< 10분) 내 3건 이상 분석
- 다양한 장르/곡 (사진 갈아끼움)
- 4월에 없던 행동 패턴
```

---

## 1. 핵심 메트릭 정의

### 1-1. Funnel 단계

```
업로드 → 분석시작 → 분석성공 → 결과조회 → 공유 → 외부조회 → "나도해보기" 클릭 → 후속분석
                                            (Full Loop ⭐)
```

| 메트릭 | 정의 | 테이블 |
|---|---|---|
| 분석 시작 | analyze_logs row 생성 | analyze_logs |
| 분석 성공 | status='success' | analyze_logs |
| 공유 클릭 | share 버튼 누름 | share_logs |
| 외부 조회 | 본인 device 외 조회 | share_views |
| 유입 클릭 | 공유 페이지 "나도해보기" 클릭 | try_click |
| 후속 분석 | 클릭한 device가 24h 내 자기 분석 | analyze_logs (clicker = device_id) |

### 1-2. Viral Loop 분류

| 단계 | 조건 |
|---|---|
| **Full Loop ⭐** | shares > 0 AND views > 0 AND clicks > 0 (외부) |
| **High View** | views ≥ 2, clicks = 0 |
| **Some View** | views = 1, clicks = 0 |
| **Silent** | shares > 0, views = 0 |

### 1-3. 시간 패턴 지표 (NEW from 4/27~4/29)

| 지표 | 측정 방법 |
|---|---|
| 공유 → 첫 조회 | min(view.created_at) - share.created_at, per entry |
| 조회 → 클릭 | click.created_at - 직전 view.created_at, same device |
| 클릭 → 분석 시작 | min(analyze.created_at after click) - click.created_at |
| Viral 지속 시간 | max(view.created_at) - min(view.created_at), per entry |

---

## 2. 베이스라인 비교표

### 4월 production vs 4/27~4/29 (4단 funnel 통일 후)

| 지표 | 4월 (3건) | 4/27~4/29 (5건) | 변화 |
|---|---|---|---|
| Full Loop 케이스 | 2건 | 2건 (셀프 1 제외) | = |
| **공유 → 조회 평균** | ~5분 | **22.5초** | ⭐ 압도적 단축 |
| 조회 → 클릭 평균 | 4.5초 | 5.25초 | ≈ |
| **클릭 → 분석 시작** | 미측정 | **18.5초** | NEW |
| **클릭 → 분석 완주율** | 미측정 | **80% (4/5)** | NEW |
| **분석 성공률** | — | **100% (4/4)** | NEW |
| 단일 entry 최대 view | 3건 | **13건** | ⭐ 4배 |
| 단일 entry 최대 click | 1건 | **3건** | ⭐ 3배 |
| **viral 지속 시간** | 13분 | **28시간** | ⭐ 130배 |
| 사진 디테일 연결 (프롬프트) | ~30% | 100% | ⭐ |
| 사운드 매칭 위반 (프롬프트) | 50% | 0% | ⭐ |

→ **4단 funnel 통일 (단톡방 시추에이션) 효과 정량 입증**

### 미리듣기 Funnel 베이스라인 (4/19~4/29, 10일, GA4 이벤트 기준)

| 지표 | 값 | 메모 |
|---|---|---|
| iTunes 매칭 시도 | 691건 (227 사용자) | matched=true/false 합산 |
| **iTunes 매칭률 (lazy)** | **73%** (581 시도 중 424 성공) | 결과 페이지 mount 시점만 |
| 재생 시작 | 405건 (153 사용자) | preview_play |
| **재생 시작률** | **58.6% (이벤트) / 67.4% (사용자)** | matched 곡 중 |
| 일시정지 | 84건 (54 사용자) | preview_pause + elapsed_sec |
| 30초 완주 | 48건 (31 사용자) | preview_complete |
| **30초 완주율** | **11.9% (이벤트) / 20.3% (사용자)** | preview_play 대비 |
| **추적 누락** | **273건 (67%)** ⚠️ | 4/29 commit 704ebba로 보강 (preview_abandoned) |

→ 추적 누락 273건은 페이지 unmount 시 audio.currentTime 기록 안 됐던 케이스. 4/29 배포로 보강 시작 — 1주 후 진짜 완주율 측정 가능.

### 🏆 itunes_preview_cache 매칭률 (4/29 종일 작업 결과)

songs DB(1369곡) 전체에 대한 미리듣기 URL 보유율 — 실유저는 거의 모든 곡에서 미리듣기 즉시 작동:

| 단계 | 매칭률 | 누적 곡수 | 작업 |
|---|---|---|---|
| 시작 (lazy 매칭만) | ~73% | matched ~999 | mount 시 호출 |
| Phase 1 (Duration 매칭) | 90.4% | +229 | 자동 (29분) |
| Phase 3 (LLM 검증) | 93.7% | +46 | 자동 (9분) |
| **Manual 매칭 (사용자 Apple Music URL)** | **99.7%** ⭐ | +82 | 사용자 ~1시간 |

**남은 4곡 (0.3%) = Apple Music 카탈로그에 진짜 없는 인디 곡** (자동·수동 모두 불가).

---

## 3. 검증된 SQL 패턴 (재사용)

### 3-1. 본인 device 제외 + 기간 필터 boilerplate

```sql
WITH known AS (
  SELECT unnest(ARRAY[
    'c9a5ac48-842b-450c-9f55-843f9aad09d7',
    'ffbfb9b2-d60a-43a3-899d-51185fad652e',
    'd49b33dc-698b-4ebf-9c92-11fae75af78f',
    'f39f816f-6e76-4e19-8369-81df4349ef67',
    '4d0071d7-8f52-4564-b307-be03636bf853',
    'f33fc09e-01f0-4abf-8edd-208d37c4bd7a',
    '63f7de85-aa41-47fa-857e-a81f1447a658',
    '98e71f2a-e4ce-4296-9fec-b0f9a7af3d2f',
    '25a4f774-d724-4769-9897-4ab140a106ee'
  ]) AS device_id
),
period AS (
  SELECT timestamptz '2026-04-27 00:00:00+09' AS lo,
         timestamptz '2026-04-30 00:00:00+09' AS hi
)
-- 사용 예: AND tc.device_id NOT IN (SELECT device_id FROM known)
-- 사용 예: AND tc.created_at >= (SELECT lo FROM period)
```

### 3-2. Funnel 분류 by entry

```sql
-- entry별 share/view/click 카운트 + funnel_stage 분류
-- 본인 device 제외 + 셀프 funnel 제외 (entry owner == clicker)
SELECT entry_id,
       sum(CASE WHEN event='share' THEN 1 ELSE 0 END) AS shares,
       sum(CASE WHEN event='view'  THEN 1 ELSE 0 END) AS views,
       sum(CASE WHEN event='click' THEN 1 ELSE 0 END) AS clicks
FROM (
  SELECT 'share' AS event, ... FROM share_logs WHERE ...
  UNION ALL
  SELECT 'view',  ... FROM share_views WHERE device_id NOT IN (SELECT device_id FROM known)
  UNION ALL
  SELECT 'click', ... FROM try_click   WHERE device_id NOT IN (SELECT device_id FROM known)
) e
GROUP BY entry_id;
```

### 3-3. 클릭 → 후속 분석 추적

```sql
-- 셀프 funnel 제외: e.device_id != tc.device_id
WITH clicks AS (
  SELECT tc.device_id, tc.entry_id, tc.created_at AS click_at,
         e.vibe_type AS source_vibe
  FROM try_click tc
  LEFT JOIN entries e ON e.id = tc.entry_id
  WHERE tc.device_id NOT IN (SELECT device_id FROM known)
    AND (e.device_id IS NULL OR e.device_id != tc.device_id)
)
SELECT c.click_at, LEFT(c.device_id, 8) AS clicker, c.source_vibe,
       MIN(al.created_at) AS first_analyze,
       EXTRACT(EPOCH FROM (MIN(al.created_at) - c.click_at))::int AS sec_to_analyze,
       COUNT(al.id) AS analyze_count,
       COUNT(al.id) FILTER (WHERE al.status='success') AS success_count
FROM clicks c
LEFT JOIN analyze_logs al ON al.device_id = c.device_id
  AND al.created_at >= c.click_at
  AND al.created_at <= c.click_at + interval '24 hours'
GROUP BY c.click_at, c.device_id, c.source_vibe;
```

### 3-4. 시간순 이벤트 타임라인 (entry 단위)

```sql
-- viral case 분석용. 각 entry의 share/view/click을 시간순 정렬
SELECT 'share' AS event, sl.created_at, sl.device_id FROM share_logs sl WHERE sl.entry_id = $1
UNION ALL
SELECT 'view',  sv.created_at, sv.device_id FROM share_views sv WHERE sv.entry_id = $1
UNION ALL
SELECT 'click', tc.created_at, tc.device_id FROM try_click tc WHERE tc.entry_id = $1
ORDER BY 2;
```

### 3-5. 의심 device 패턴 탐지

```sql
-- 본인 device 외, 짧은 시간 다발 분석한 device 후보
SELECT device_id,
       count(*) AS analyze_count,
       to_char(min(created_at) AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS first_kst,
       to_char(max(created_at) AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS last_kst,
       EXTRACT(EPOCH FROM (max(created_at) - min(created_at)))/60 AS span_min,
       string_agg(song || ' — ' || artist, E'\n  · ' ORDER BY created_at) AS songs
FROM analyze_logs
WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date = $1
  AND device_id NOT IN (SELECT device_id FROM known)
GROUP BY device_id
HAVING count(*) >= 2
ORDER BY count(*) DESC;
```

### 3-6. iTunes 캐시 진단 쿼리

```sql
-- A. status별 분포 (전체 매칭률 점검)
SELECT status, count(*),
       round(avg(match_score)::numeric, 1) AS avg_score,
       round(avg(candidates_count)::numeric, 1) AS avg_candidates
FROM itunes_preview_cache
GROUP BY status
ORDER BY count(*) DESC;

-- B. 60점 borderline (점수 컷오프 적정성 검증)
SELECT song, artist, matched_track_name, matched_artist_name,
       match_score, candidates_count
FROM itunes_preview_cache
WHERE status = 'low_score' AND match_score BETWEEN 50 AND 59
ORDER BY match_score DESC LIMIT 30;

-- C. iTunes에 아예 없는 곡 (수동만 가능)
SELECT song, artist, candidates_count, attempts
FROM itunes_preview_cache
WHERE status = 'no_results'
ORDER BY attempts DESC LIMIT 30;

-- D. 자주 시도되는 실패 곡 (수동 매칭 우선순위)
SELECT song, artist, status, attempts, match_score, last_attempted_at
FROM itunes_preview_cache
WHERE preview_url IS NULL AND attempts >= 3
ORDER BY attempts DESC;

-- E. 캐시 재사용율 (효율 측정)
SELECT
  count(*) AS total_cached,
  count(*) FILTER (WHERE attempts > 1) AS reused,
  round(count(*) FILTER (WHERE attempts > 1) * 100.0 / count(*), 1) AS reuse_rate_pct,
  count(*) FILTER (WHERE status='matched') AS matched_count,
  round(count(*) FILTER (WHERE status='matched') * 100.0 / count(*), 1) AS match_rate_pct
FROM itunes_preview_cache;

-- F. songs DB 대비 매칭 커버리지 (얼마나 많은 곡이 cache에 박혔나)
SELECT
  (SELECT count(*) FROM songs) AS total_songs,
  (SELECT count(*) FROM itunes_preview_cache) AS cached,
  (SELECT count(*) FROM itunes_preview_cache WHERE status='matched') AS matched_in_cache;
```

---

## 4. 실측 viral 콘텐츠 풀

### 4-1. Full Loop 발생 (vibeType + 곡)

| 일자 | vibeType | 곡 | 성과 |
|---|---|---|---|
| 4/24 | 🌸 벚꽃 수집가 | (4월 production) | 10v / 2c |
| 4/24 | 🐯 브이요정 듀오 | (4월 production) | 2v / 2c |
| 4/24 | 📸 셀카 장인 | (4월 production) | 6v / 1c |
| **4/27** | 📸 셀카 장인 | hot!뜨거 — lobonabeat! | **13v / 2c (28h 지속) ⭐⭐⭐** |
| **4/27** | 🐯 브이요정 듀오 | 햇빛 bless you — AKMU | **7v / 3c (전환 100%) ⭐⭐** |
| 4/27 | 🧱 픽셀 큐레이터 | Zombie — MilliMax | 2v / 1c (셀프 funnel) |

→ **"📸 셀카 장인", "🐯 브이요정 듀오"는 반복 viral**. 다음 vibeType 풀 업데이트 시 우선순위.

### 4-2. High View / 클릭 0 (vibeType 톤 재검토 후보)

| 일자 | vibeType | 곡 | views |
|---|---|---|---|
| 4/29 | 🏯 누각 감성러 | The Most Beautiful Thing — Bruno Major | 3 |
| 4/28 | 🚪 사물함 앞 듀오 | 이렇게 좋아해 본 적이 없어요 — BOYNEXTDOOR | 2 |

→ 즉시 조회는 일어나는데 **CTA 작동 안 함**. vibeDescription 자조성 부족 또는 곡 매칭 인상 약함 가능성.

### 4-3. 후보 어미 (1주 데이터 검증 시 추가 풀)

```
~점프러 / ~낭만러 / ~순정파 / ~로맨티스트 / ~챔피언 / ~총대 /
~단골손님 / ~출사조 / ~사냥꾼 / ~챙김러
```

---

## 5. 분석 우선순위 (다음 세션에서)

### Tier 1: 빠른 데이터 점검
1. **금일 viral 케이스** — Full Loop 새로 발생했나? (3-2 쿼리)
2. **클릭 → 분석 완주율** 추세 (3-3 쿼리)
3. **외부 unique viewer 추세** (일별)

### Tier 2: 가설 검증
1. **2차 viral 측정** — 외부 유입 유저(`20d25ea8` 등)가 만든 entry가 다시 share/view/click 만들었나?
2. **이탈 원인** — 클릭 후 분석 안 한 device의 photo_upload_logs / result_view_logs 확인
3. **24h 재방문** — 분석 완주 device가 다음날 재방문하는지

### Tier 3: 프롬프트 fine-tune
1. 사일런트 비율 < 20% 미달 → vibeDescription 강화
2. 사운드 매칭 위반 > 10% → reason 가이드 보강
3. 클릭 0 vibeType 패턴 → 톤 회귀 필요 여부

### Tier 4: 미리듣기 매칭률 개선 (4/29~)
1. **일괄 매칭 결과 진단** (3-6 쿼리 A) — status별 분포 보고 작업 규모 추정
2. **borderline 곡 분류** (3-6 쿼리 B) — 50~59점 곡들 수동 검토 → 60점 컷오프 조정 여부
3. **수동 매칭 우선순위** (3-6 쿼리 D) — attempts 높은 실패 곡부터
4. **admin 페이지 구현 결정**:
   - 실패 < 50개: 수동 매칭 UI만 (1.5h)
   - 50~200개: 검색 도우미 + 수동 (3h)
   - 200+: Spotify ISRC 활용 우선 (3h)

→ 8번 섹션 참고.

---

## 6. 관련 파일·이력

### 운영 파일
- 본인 device env: `.env.local` line 25 (`NEXT_PUBLIC_INTERNAL_DEVICE_IDS`) + Vercel env
- device_id 발급: [src/lib/supabase.ts:10-16](../../../../src/lib/supabase.ts), [src/lib/device.ts:3-6](../../../../src/lib/device.ts)
- 대시보드 필터: [src/app/admin/page.tsx:506-528](../../../../src/app/admin/page.tsx)

### 컨텍스트 문서
- 최근 핸드오프: [SESSION_HANDOFF_2026-04-27.md](./SESSION_HANDOFF_2026-04-27.md)
- 4단 funnel 변경 commit: 3ab6c55, f764de3, e226179, ae745f3 (4/27)
- 도메인 마이그레이션: 4/26 (vercel.app → playthepicture.com)
- **iTunes 캐시 + abandoned 추적 commit: 704ebba (4/29)**

### iTunes 미리듣기 인프라
- DB: `itunes_preview_cache` (migration_012)
- API: [src/app/api/itunes-preview/route.ts](../../../../src/app/api/itunes-preview/route.ts) — 캐시 + 점수 + cache_hit 응답
- 클라이언트: [src/app/result/page.tsx](../../../../src/app/result/page.tsx) — preview_match에 match_score/cache_hit, unmount 시 preview_abandoned

### 매칭 스크립트 모음 (4/29 작업)
- `scripts/match-all-songs.mjs` — 일괄 매칭 (1369곡, 3시간, 73% 도달)
- `scripts/match-by-isrc.mjs` — Duration 매칭 (이름은 ISRC지만 실제 duration_ms 사용. +229, 90% 도달)
- `scripts/match-by-llm.mjs` — Claude Haiku LLM 검증 (+46, 93.7% 도달)
- `scripts/match-chunk1.mjs` / `match-chunk2.mjs` / `match-chunk3.mjs` — manual 매칭 (사용자 Apple Music URL 일괄 처리, +82, 99.7% 도달)
- `scripts/match-manual-batch.mjs` — 1차 manual 매칭 시범 (12곡)

```bash
caffeinate -i node scripts/match-all-songs.mjs   # 노트북 sleep 방지
```

### GA4 등록 상태 (4/29)
| 이름 | 측정기준 | 측정항목 |
|---|---|---|
| song | ✅ | — |
| matched | ✅ | — |
| cache_hit | ✅ | — |
| match_score | ✅ | — |
| elapsed_sec | — | ✅ |

### Supabase MCP
- `execute_sql` — read-only, SELECT/CTE 가능, DDL 불가
- DELETE 등 destructive operation은 Supabase Dashboard SQL Editor에서 직접

---

## 7. 갱신 규칙

이 문서를 최신 상태로 유지하려면:

1. **본인 device 추가 시** — 0-1 섹션 갱신 + `.env.local` + Vercel env 동시 갱신
2. **새 viral 케이스 발생 시** — 4-1 표에 추가 (날짜, vibeType, 곡, 성과)
3. **베이스라인 변동 시** — 2번 섹션 갱신 (1주 단위 권장)
4. **새 SQL 패턴 검증되면** — 3번 섹션에 추가
5. **의심 device로 식별됐다가 본인 아닌 것 확인되면** — 0-3 섹션 패턴 보강
6. **iTunes 매칭률 변동 / 컷오프 조정 시** — 8번 섹션 + 2번 베이스라인 갱신
7. **admin 매칭 도구 진척 시** — 8-9 단계 갱신
8. **신곡 자동 매칭 워크플로우 v3 구현 후** — 8-9 결과 + 자동 매칭률 실측 갱신
9. **iTunes/Apple Music API 정책 변경 발견 시** — 8-5 즉시 박제 (오늘 explicit 차단 발견처럼)

---

## 8. iTunes 미리듣기 인프라 (4/29~)

### 8-1. 큰 그림 — songs DB 100% 매칭 목표

```
┌──────────────────────────────────────────────────────────────┐
│  목표: songs DB 모든 곡이 itunes_preview_cache에 박혀있고     │
│        모두 status in ('matched', 'manual')                  │
└──────────────────────────────────────────────────────────────┘

Step A. 일괄 사전 매칭 (Pre-match) — 4/29 진행 중
   ├─ scripts/match-all-songs.mjs 로 1369곡 일괄 처리
   ├─ /api/itunes-preview 호출 → DB 캐시 자동 저장
   └─ 한 번에 80~90% 커버 예상

Step B. 수동 매칭 도구 (Admin UI) — 다음 작업
   ├─ 실패 곡 admin/itunes-cache 페이지에 노출
   ├─ admin이 직접 검색해서 URL 박기 (status='manual')
   └─ 100% 도달

Step C. 신곡 자동 매칭 — 장기
   ├─ /api/admin/import-text에 한 줄 추가
   ├─ 신곡 INSERT 후 자동 fetch
   └─ 실패 시 admin 페이지 자동 노출
```

### 8-2. 인프라 구성 (commit 704ebba)

**DB 스키마** (`migration_012.sql`):
```
itunes_preview_cache (
  track_key text UNIQUE,    -- normalize(song + '|' + artist)
  song, artist text,
  preview_url text,
  matched_track_name, matched_artist_name text,
  match_score int,           -- 60 미만도 기록 (진단용)
  candidates_count int,
  status text,               -- matched | low_score | no_results | error | manual
  attempts int,
  first_attempted_at, last_attempted_at, matched_at timestamptz
)
```

**API 동작 흐름** (`/api/itunes-preview`):
```
요청 → track_key 생성 → DB 조회
  ├─ HIT (matched, 영구) → 즉시 반환 + cache_hit:true
  ├─ HIT (실패, 24h 이내) → 즉시 null 반환
  ├─ HIT (실패, 24h 지남) → iTunes 재호출 + attempts+1
  └─ MISS → iTunes 호출 + cache 저장
```

**GA4 이벤트** (4개):
- `preview_match` { song, matched, match_score, cache_hit }
- `preview_play` { song }
- `preview_pause` { song, elapsed_sec }
- `preview_complete` { song }
- `preview_abandoned` { song, elapsed_sec } ⭐ NEW (unmount 시 발화)

### 8-3. 일괄 매칭 스크립트 운영

```bash
# 노트북 sleep 방지 + 실행
caffeinate -i node scripts/match-all-songs.mjs

# 설정 (필요 시 스크립트에서 수정)
DELAY_MS = 5000      # 곡 간 텀 (기본 5초, 안전)
LOG_EVERY = 10       # 진행 로그 빈도
RETRY_429_BACKOFF = 60_000  # 429 시 기본 대기
```

**resumable**: 이미 status='matched'인 곡 자동 skip → 중단 후 재실행 시 처리된 만큼 빠르게 진행.

**처리 시간 추정**:
| 곡수 | 텀 5초 | 텀 3초 |
|---|---|---|
| 500 | 42분 | 25분 |
| 1000 | 84분 | 50분 |
| 1369 | 114분 | 68분 |

### 8-4. 반자동 매칭 단계별 결과 + 우선순위 (4/29 갱신)

**오늘 4/29 작업 완료:**
- ✅ Phase 1 (Duration 매칭) — 73% → **90.4%** (+17.4%p)

**남은 9.6% (132곡):**
- 79곡: low_score, candidates=10 (iTunes 후보 가득) → **Phase 3 LLM 검증 대상**
- 36곡: no_results 14 + candidates 1~3 (마이너곡) → **Phase 4 Spotify 폴백**
- 17곡: 기타 low_score → admin 수동

#### Phase 1 ⭐⭐⭐: Duration 기반 매칭 — 완료 (4/29)

**중요 발견 (실행 중 변경):**
iTunes Search API가 ISRC 검색을 지원 안 해서, 원래 계획한 ISRC 매칭은 막힘.
대신 **Spotify duration_ms로 매칭**하는 방식으로 전환 (옵션 A).

**작동 방식:**
```
1. Spotify GET /v1/tracks/{id} → duration_ms 받기
2. iTunes Search 기존 방식 (artist + title) → 후보 10개
3. 후보 중 (트랙명 정규화 매칭) AND (duration_ms ±2000ms 일치) → 채택
4. cache UPDATE (status='matched_by_duration')
```

**한영 표기 차이 곡들이 거의 다 살아남:**
- 입력: "BOYNEXTDOOR" / iTunes 결과: "보이넥스트도어"
- 알고리즘 점수 50점 (탈락) → duration 매칭으로 통과

**검증된 텀 (보수적):**
- DELAY_MS = 2000 (곡 간 2초)
- BATCH_SIZE = 25
- BATCH_REST_MS = 60000 (25곡당 60초)
- → 361곡 처리 ~29분
- 429 rate limit 0건, 에러 0건 (안정)

**스크립트:** `scripts/match-by-isrc.mjs` (이름은 ISRC지만 내용은 duration 매칭)

**개념:**
```
songs.spotify_track_id 있는 곡
   ↓
Spotify API: track 정보 조회 → ISRC 받음 (예: "USRC11700001")
   ↓
iTunes Search: term=ISRC로 재검색
   ↓
정확히 같은 곡 매칭 (한영 표기 차이 영향 0)
   ↓
status='matched_by_isrc'로 cache 갱신
```

**호출 구조 (곡당 외부 API 2회):**
- Spotify API: `GET /v1/tracks/{id}` (ISRC 받기)
- iTunes API: `/search?term={isrc}` (ISRC로 재검색)

**검증된 텀 패턴 — `import-text` 라인 174~180 참고:**
- 곡 간 1초 + 30곡마다 30초 추가 대기 (검증된 안전 패턴)

**보수적 텀 (PLAYBOOK 권장):**
```ts
const DELAY_MS = 2000;          // 곡 간 2초 (import-text의 1초 → 2배)
const BATCH_SIZE = 25;          // 30 → 25곡으로 보수적
const BATCH_REST_MS = 60000;    // 30초 → 60초 (rate limit window 2배)
```

**처리 시간 추산:**
| 대상 곡 수 | 보수적 텀 |
|---|---|
| 100곡 | ~7분 |
| 161곡 (50점대) | ~12분 |
| 300곡 (전체 실패) | ~22분 |

**Spotify token 발급:** `/api/admin/import-text`의 [getSpotifyToken 함수](../../../../src/app/api/admin/import-text/route.ts) 재활용.

**환경변수:** `.env.local`에 이미 등록됨
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

**예상 효과:** 매칭률 73% → **85%+** (50점 161건 중 90%+ 살아남)

#### Phase 2: 점수 알고리즘 보강 (보류 — Phase 1 Duration으로 통합됨)

원래 trackTimeMillis 보너스 계획이었으나, Phase 1 Duration 매칭이 같은 원리를 더 강력하게 적용해서 사실상 통합. 별도 작업 불필요.

#### Phase 3 ⭐⭐: LLM 검증 (다음 작업, ~1h)

**대상:** 79곡 (low_score, candidates=10)
- iTunes 카탈로그에 후보 가득 있는데 알고리즘 못 잡음
- duration 매칭도 실패 (인스트루멘탈/리믹스/외국어 버전 섞여 있을 가능성)

**작동 방식:**
```
각 79곡:
1. iTunes Search 다시 호출 → 후보 10개
2. Spotify에서 duration_ms 받기 (참고용)
3. Claude API (Haiku):
   "사용자가 찾는 곡 [입력] / iTunes 후보 [10개] /
    원곡 몇 번? 인스트/리믹스/외국어 제외. 번호만. 없으면 0."
4. LLM 답 받음 (숫자)
5. 안전장치: LLM이 고른 후보 duration ±2초 일치 확인
6. OK면 cache UPDATE (status='matched_by_llm')
7. NO면 그대로 둠 → 수동 매칭 큐
```

**비용 (79곡):**
| 모델 | 곡당 | 79곡 총 | 정확도 |
|---|---|---|---|
| **Haiku** ⭐ | ~$0.0005 | **~$0.04** | 90% (충분) |
| Sonnet | ~$0.003 | ~$0.24 | 95% |
| Opus | ~$0.015 | ~$1.20 | 97% |

→ Haiku로 충분 (4센트). 비용 무시 수준.

**처리 시간:** 79곡 × (Spotify 0.3s + iTunes 0.3s + Claude 1s + sleep 1s) ≈ **5~8분**

**텀:** 1.5초 (LLM은 일반 API보다 텀 짧아도 OK — Anthropic은 분당 5000 RPM)

**예상 효과:** +3~5%p (90.4% → 93~95%)

**안전장치:**
- LLM 답이 잘못돼도 duration 검증으로 거름
- "0" 답하면 매칭 안 함 (보수적)

#### Phase 4: Spotify Preview 폴백 (30분)

iTunes 매칭 실패해도 Spotify의 30초 미리듣기로 대체:
```
songs.spotify_track_id → Spotify API: track.preview_url
  ├─ 있으면 → URL 박기 (status='spotify_fallback')
  └─ 없으면 → admin 수동
```
**예상 효과:** +3~5% 추가 (총 94~96%)

#### Phase 5: 신곡 자동 매칭 (30분)

`/api/admin/import-text`에 한 줄 추가 — 신곡 INSERT 후 백그라운드 매칭. 앞으로의 매칭률 100% 유지용.

#### Phase 6: Admin 수동 매칭 UI (1h, 마지막)

- 경로: `/admin/itunes-cache`
- Phase 1~4 후에도 실패한 ~50곡 미만 대상
- 수동 URL 입력 + status='manual' 박음
- attempts 높은 순 정렬

#### 단계별 누적 매칭률 — 4/29 종일 작업 결과

| 단계 | 매칭률 | 결과 |
|---|---|---|
| 시작 (1차 lazy 매칭) | — | (mount-time만) |
| + 일괄 매칭 1369곡 | **73.0%** | matched 999 ✅ |
| + 9곡 재시도 | 73.6% | matched 1007 ✅ |
| + Phase 1 (Duration 매칭) | **90.4%** | +matched_by_duration 229 ⭐⭐⭐ ✅ |
| + Phase 3 (LLM 검증) | **93.7%** | +matched_by_llm 46 ✅ |
| + **Manual 매칭 (사용자 Apple Music URL)** | **99.7%** ⭐⭐⭐ | +manual 82 ✅ |
| + Phase 4 (Spotify preview 폴백) | ❌ 무효 | Spotify Preview API deprecated (2024) |
| + Phase 6 (남은 4곡 admin 수동) | — | E:Apple Music 부재 곡 X (자동·수동 모두 불가) |

**최종 99.7% (1364/1368). 남은 4곡 = Apple Music 카탈로그에 진짜 없음.**

⚠️ **Phase 4 (Spotify preview 폴백) 무효 — Spotify Preview API가 2024년 deprecated.** 이 섹션 향후 무시.

→ admin 수동 부담 실측: 82곡 (전체의 6%, 사용자 1시간 작업)

### 8-5. 실패 원인 — 최종 진단 (4/29 manual 매칭 72곡 분석 완료)

#### 🚨 가장 충격적 발견: **iTunes Search API의 explicit 곡 글로벌 차단**

**검증된 사실:**
- iTunes Search API는 explicit (19금) 곡을 검색 결과에서 **전 세계적으로 제외**
- `country=us`/`country=jp` 폴백도 동일하게 차단
- `&explicit=Yes` 파라미터도 효과 없음
- `lookup?id=...` 엔드포인트는 ID 명시 시 정상 조회됨

**시사점:** Search 흐름으로는 explicit 곡 자동 매칭 불가능. ID를 알아야만 lookup으로 박을 수 있음.

#### 실패 패턴 종합 (manual 매칭 72곡 분석)

| 패턴 | 건수 | 비율 | 자동화 가능성 |
|---|---|---|---|
| **X: 19금 (explicit 검색차단)** ⭐⭐⭐ | **59** | **86%** | ❌ Apple Music API 도입 또는 manual |
| **Z: 원인불명 = 19금 검색차단** | 54 | 78% | ❌ X와 동일 케이스 |
| B: 아티스트 한영 표기 (DAY6↔데이식스 등) | 10 | 14% | ✅ Duration 매칭으로 일부 해결 (Phase 1) |
| K: 곡명 자체 상이 (한국 발매 곡명 변경) ⭐ NEW | 4 | 6% | ❌ ISRC 매핑 필수, fuzzy도 무효 |
| E: Apple Music 카탈로그 부재 | 4 | 6% | ❌ 자동·수동 모두 불가 |
| D: 곡명 표기 변형 | 2 | 3% | ✅ fuzzy matching |
| H: feat. 한영 표기 | 1 | 1% | ✅ feat 부분 분리 비교 |
| G: 특수문자 ({<pending>} 등) | 1 | 1% | ✅ 검색어 정제 |

#### K: 곡명 자체 상이 (한국 시장 현지화) — 새로 발견

같은 곡인데 발매 지역에 따라 곡명 다른 케이스:

| Spotify (영문) | Apple Music KR (한글/번역) | 아티스트 |
|---|---|---|
| Countdown! | 마음 따라 뛰는 건 멋지지 않아? | 투어스 |
| Ease | 단잠 | 이강승 |
| Hot and Cold | 츤데레 | 선우정아 |
| Just A Little Bit | 몰랐어 | ENHYPEN |

→ **자동 매칭 본질적으로 어려움** (다른 곡으로 보임). 향후 신곡 등록 시 이 패턴 의심되면 admin 수동 큐로 라우팅.

#### E: Apple Music 카탈로그 부재 — 4곡 (불가)

| 곡 | 아티스트 |
|---|---|
| Autumn Groove | Ljones |
| Dawn of us | 잭슨 |
| Hope Springs Eternal | Witness |
| Letters to Jun(E) | Witness |

→ Apple Music 자체에 등록 안 된 인디 SSW. **삭제 또는 그대로 (미리듣기 비활성)**.

### 8-6. 진단 데이터 (4/29 일괄 매칭 중간 결과)

#### 점수 분포 (전체 매칭 시도)

| match_score | count | 비고 |
|---|---|---|
| 100 | 483 | 완벽 매칭 (트랙+아티스트 둘 다 완전 일치) |
| 85 | 7 | 인스트루멘탈 감점 |
| 80 | 53 | 한쪽 완전 + 한쪽 포함 |
| 65 | 4 | 한쪽 완전 + 인스트 감점, 또는 양쪽 포함 + 보너스 |
| 60 | 1 | 컷오프 정확 |
| **50** | **161** ⚠️ | **한영 아티스트명 표기 차이가 압도적** |
| 35 | 2 | 한쪽 부분 + 인스트 감점 |
| 30 | 10 | 한쪽 포함만 |
| 0 | 15 | 매칭 불가능 |

#### low_score 곡의 candidates 분포

| candidates_count | songs |
|---|---|
| **10 (가득)** | **118** ⚠️ (61.5%) |
| 1 (마이너) | 31 |
| 2 | 14 |
| 3 | 5 |
| 4~9 | 22 |

→ 후보가 10개 가득 차는 case가 압도적 → iTunes 카탈로그에 곡은 충분히 있음. 알고리즘이 못 잡고 있을 뿐.

#### 50점 케이스 샘플 (한영 표기 차이 패턴)

```
DAY6        ↔ 데이식스
HANRORO     ↔ 한로로
LUCY        ↔ 루시
BOYNEXTDOOR ↔ 보이넥스트도어
비투비       ↔ BTOB
미쓰에이     ↔ miss A
Bas Bao     ↔ 바스바오
Joob A      ↔ 줍에이
Minna Seo   ↔ 서민아
```

### 8-7. ISRC 매칭 작업 운영 가이드 (4/29 완료, 참조용)

> **이 섹션은 4/29 작업 종료. 8-9의 신곡 자동 매칭 워크플로우 v3가 현재 표준.**

이미 작성된 스크립트 (참조용):
- `scripts/match-all-songs.mjs` — 일괄 매칭
- `scripts/match-by-isrc.mjs` — Duration 매칭 (ISRC 안 통해서 duration_ms 활용으로 변경됨)
- `scripts/match-by-llm.mjs` — LLM 검증
- `scripts/match-chunk1.mjs` / `match-chunk2.mjs` / `match-chunk3.mjs` — manual 매칭

### 8-8. Manual 매칭 워크플로우 (검증된 흐름)

#### 어떤 케이스에 manual이 필요한가

1. **explicit (19금) 곡** ⭐ — iTunes Search 글로벌 차단으로 자동 매칭 불가
2. **K: 곡명 자체 상이** — Spotify(영문) ↔ Apple Music KR(한글)이 완전 다른 곡명
3. **자동 매칭 알고리즘이 못 잡은 borderline 케이스**

#### 흐름 (4/29 검증)

```
1. admin queue (manual 필요한 곡 목록) 보기:
   SELECT song, artist, candidates_count, match_score
   FROM itunes_preview_cache
   WHERE status IN ('low_score', 'no_results')
   ORDER BY song;

2. admin (또는 사용자):
   - music.apple.com에서 "곡명 + 아티스트" 검색
   - 곡 페이지 URL 복사 (https://music.apple.com/kr/album/.../12345?i=67890)

3. 시스템:
   - URL에서 i=67890 추출
   - iTunes Lookup API: GET /lookup?id=67890&country=kr
   - 응답에서 previewUrl 추출
   - itunes_preview_cache UPDATE (status='manual')

4. 즉시 production cache hit으로 동작
```

#### 검증된 처리 속도

- **사용자 검색**: 곡당 ~30초 (Apple Music 웹 검색 → URL 복사)
- **자동 lookup + DB UPDATE**: 곡당 ~0.5초
- **72곡 처리 시간**: 사용자 ~1시간 (분산), 시스템 처리 ~30초

#### Apple Music URL 파싱 패턴

```js
// URL: https://music.apple.com/kr/album/<slug>/<albumId>?i=<trackId>
const trackId = url.match(/[?&]i=(\d+)/)?.[1];
// country: URL의 /kr/ 부분에서 추출
const country = url.match(/music\.apple\.com\/(\w{2})\//)?.[1] || 'kr';
```

### 8-9. 신곡 자동 매칭 워크플로우 v3 ⭐ (다음 세션 구현 대상)

#### 큰 그림

```
신곡 추가 (admin import) 시점에 explicit 분기 자동화:

Spotify 정보 받기 (이미 import-text에서 함):
  ├─ track.explicit (true/false)
  ├─ track.duration_ms
  └─ track.external_ids.isrc (참고용)

[분기 1] explicit=false → 자동 매칭 흐름:
  ├─ iTunes Search (artist + song, country=kr)
  ├─ Duration ±2초 매칭 (한영 표기 우회)
  ├─ LLM 검증 (모호한 케이스)
  └─ 매칭 성공 → status='matched' / 실패 → status='auto_failed'
  
  예상 자동 매칭률: ~85~90%
  
[분기 2] explicit=true → admin manual queue로 자동 라우팅:
  ├─ status='pending_manual' (또는 'explicit_blocked')
  ├─ admin 페이지에서 일괄 처리
  └─ admin: Apple Music URL 입력 → 자동 lookup → status='manual'
  
  예상 처리 부담: 신곡의 ~30~40% (K-힙합 비중)

[분기 3] 매칭 실패 (자동 흐름 후) → admin manual queue 합류
```

#### 구현 단계

##### Phase A: songs DB 스키마 확장 (선택)

```sql
-- migration_013.sql (선택, 추후)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_explicit BOOLEAN DEFAULT false;

-- 기존 곡들 explicit 정보 backfill (Spotify API로 일괄 조회)
-- 또는 itunes_preview_cache에서 trackExplicitness 받아서 매핑
```

##### Phase B: import-text route 변경

[`/api/admin/import-text/route.ts`](../../../../src/app/api/admin/import-text/route.ts)에 explicit 분기 추가:

```ts
const track = await spotifySearch(...);

// ⭐ NEW: explicit 정보 활용
const isExplicit = track.explicit === true;

await supabase.from("songs").insert({
  ...,
  is_explicit: isExplicit,  // 신규 컬럼
});

if (isExplicit) {
  // explicit 곡: iTunes Search 시도하지 말고 admin queue
  await supabase.from("itunes_preview_cache").insert({
    track_key: makeTrackKey(track.name, artist),
    song: track.name,
    artist,
    status: "pending_manual",  // explicit_blocked 의미
    candidates_count: 0,
  });
} else {
  // non-explicit: 기존 자동 매칭 흐름
  await fetch(`${BASE_URL}/api/itunes-preview?title=...&artist=...`);
}
```

##### Phase C: admin manual queue 페이지 ⭐

`/admin/itunes-cache` 라우트:

```
필터:
- status='pending_manual' (explicit 자동 분류된 것)
- status='low_score' (자동 매칭 실패)
- status='no_results' (iTunes 카탈로그 부재)

각 row:
- song, artist, Spotify URL (검색용 링크)
- [Apple Music URL 입력 필드] [저장 버튼]
- 저장 시 자동 lookup + DB UPDATE
- 또는 [(없음)] 버튼 → status='manual_unavailable'

배치 작업:
- 한 번에 N개씩 표시 (10~20곡)
- 진행률 표시
```

##### Phase D: admin queue 단축 도우미 (선택)

- iTunes 후보 자동 미리보기 (lookup으로 정답 후보 1~3개 제시)
- LLM 추천 (Claude Haiku로 정답 후보 선택)
- admin이 클릭 한 번으로 박기

#### 성과 추정

```
[현재 상태 = manual 부담 100%]
신곡 추가 시 admin이 어떻게든 매칭해야 함

[v3 적용 후]
- non-explicit (~60~65%): 자동 매칭 ~85% → 자동 처리율 51~55%
- explicit (~35~40%): admin queue 자동 라우팅 → admin 클릭 1번
- 자동 매칭 실패 (~10%): admin queue 합류

전체:
  자동 처리:    51~55% (코드만으로 끝)
  admin 1클릭:  35~40% (Apple Music URL 입력만)
  admin manual: 5~10% (실제 검색 필요)
```

#### 우선순위

1. **Phase B (import-text 분기)** — 1시간 — 즉시 효과 큼
2. **Phase C (admin queue 페이지)** — 2~3시간 — UI 작업
3. **Phase A (DB 스키마)** — 30분 — 신중하게 (필요 시)
4. **Phase D (도우미)** — 2시간 — 장기 개선

총 작업 시간: ~5~6시간. 다음 세션 1~2회로 완료 가능.
