# Session Handoff — 2026-05-09 (part2)

> 5/9 part2 박제. **추천 알고리즘 3가지 변경 (rotation 가중치 + candidate logging + 평생 차단) 배포 완료.** 데이터 분석 도중 entries 테이블이 추천 로그의 일부에 불과함을 발견 (recommendation_logs가 진짜 source). 정정 후 진짜 편향 진단 + 장르별 engagement 매트릭스 박제.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-09.md](./SESSION_HANDOFF_2026-05-09.md)
> 영구 참조: [PROJECT_KNOWLEDGE.md](./PROJECT_KNOWLEDGE.md)

---

## 1. 한 줄 요약

**(1) 추천 알고리즘 3건 변경 배포** (commit `bc690a1`, `20d43bb`):
  - 7일 글로벌 순환 가중치 (k=0.10) — top 곡 후보 진입 58% 페널티
  - candidate_logs 테이블 — Claude 후보 50곡 batch insert로 미래 quality scoring 인프라
  - **device 평생 곡 차단** (7일 → 평생) — "새 곡 발견" 컨셉 강화 + 아티스트 cap 제거

**(2) 데이터 분석 메타 박제 정정**: `entries` 테이블은 추천된 곡 중 일부만 보존 (외부 307건). 진짜 추천 로그는 `recommendation_logs` (외부 2,435건, 5.3배). **수동 SQL 분석은 recommendation_logs 사용 표준** (handoff 5/9 part1 §13의 INTERNAL 박제와 같은 메타 학습).

**(3) 장르별 engagement 매트릭스 박제** (외부 only): acoustic_jazz·indie save_rate 8% 강함, rnb·hiphop 3-5% 약함. **rnb 사장은 정당**, kpop이 진짜 problem child (over-recommended + 4.3% engagement).

**(4) Rate limit 코드 검증 완료** — 분당 5 / 시간당 30 / 일당 60. 잘 작동 중. 4/19 봇 케이스는 history.

**(5) 추천 품질 metrics 대시보드 배포** (commit `73c9634`): `/admin` "📊 추천 품질" 섹션. Catalog Coverage + Long-tail share + 단일 곡 max 등 6 metric. ⚠️ Goodhart's Law 운영 원칙 박제 — KPI/목표값 사용 X.

**(6) Claude 편애 가설 5개 박제** (§15): H1 시각·자연·환경 키워드 강한 선호 (4x) / H2 사랑·감정 키워드 회피 / H3 한국어 제목·아티스트 +49% 선호 / H4 rnb·hiphop 풀 절반 사장 (rnb 64%·hiphop 51%) / H5 Energy 5(파워풀) 24% 회피.

**(7) vibeType·vibeDescription 패턴 박제** (§16): 95.5% unique지만 어미 73.7%가 ~러/수집가/단/장인 등 정형. vibeDescription "~중" 종결 20.5%·"지분" 단어 8.1%. 가이드 예시가 패턴 좁힘. 금지어 8.1% 위반.

**(8) candidate_logs 작동 검증 완료** (§17): 12 calls / 581 rows / 선택률 2.07%(1/50). 가중치 정상 작동 (사장 곡 weight 1.0 우선 진입). primacy bias 안 보임 (sample 작아 1주 후 재측정 필요).

**(9) Setlog passkey 도입 검토 → 보류** (§18): 광고 funnel·viral 마찰 위험. archive 페이지 강화로 cross-device 가치 80% 회수 가능. iOS 앱 출시(6개월+) 시 자연 도입.

**(10) analysis_results 테이블 도입 (Phase 1)** (§21, commit `a8ac0e8`): 모든 분석의 vibe·reason·tags 박제. 액션 안 한 87% 분석도 데이터 보존 → 패턴 분석 향후 8x 표본. prompt versioning·A/B test 인프라 (model_id·prompt_version·ab_variant 컬럼 미리). 사용자 영향 0 · 데이터 유실 0.

---

## 2. 추천 알고리즘 변경 박제 ⭐⭐⭐

### 2-1. 변경 전 vs 변경 후

| 영역 | 변경 전 | 변경 후 |
|---|---|---|
| 곡 차단 (device) | 7일 이력 | **평생 이력** |
| 아티스트 cap (device) | 7일 2회+ 차단 | **제거** |
| 후보 샘플링 | 단순 랜덤 (`shuffleAndSlice`) | **가중 무작위** (`weightedShuffleAndSlice`) |
| 글로벌 편향 차단 | 없음 | **7일 카운트 기반 weight** |
| Candidate 측정 | 없음 (selected만 기록) | **50곡 모두 candidate_logs 기록** |

### 2-2. 가중치 공식

```ts
const ROTATION_K = 0.10;
weight = 1 / (1 + recent_7d_global_count × 0.10);
```

| 7일 카운트 | weight | 페널티 |
|---|---|---|
| 0회 (신곡·사장곡) | **1.00** | 0% |
| 1회 (median) | 0.91 | 9% |
| 2회 (p75) | 0.83 | 17% |
| 4회 (p95) | 0.71 | 29% |
| **14회 (top, Blue Hour)** | **0.42** | **58%** |

### 2-3. 변경 파일 + commit

| 파일 | 변경 | commit |
|---|---|---|
| `supabase/migration_013.sql` | 신규 — `idx_rec_logs_created_at` + `candidate_logs` 테이블 | `bc690a1` |
| `src/app/api/analyze/new-recommend.ts` | +70줄 (cache + weight + sampling) / +20줄 (batch insert) | `bc690a1` |
| `src/app/api/analyze/new-recommend.ts` | -36줄 / +12줄 (STEP 0 단순화) | `20d43bb` |

### 2-4. Latency 영향 (사용자 체감)

| 단계 | 현재 | 변경 후 | 차이 |
|---|---|---|---|
| STEP 0 (device 이력) | 10ms | 10ms | 0 |
| 글로벌 7일 카운트 (cache hit) | - | +1ms | +1ms |
| Weight 계산 (50곡) | - | +5ms | +5ms |
| Claude API | 3000-5000ms | 3000-5000ms | 0 |
| Candidate batch insert (비동기) | - | 0ms (체감) | 0 |
| **합** | **~3050ms** | **~3056ms** | **+6ms (0.2%)** |

→ **체감 불가**. 인간 인지 한계(100ms)의 6%.

---

## 3. 데이터 분석 메타 박제 — entries vs recommendation_logs

### 3-1. 발견 경위

처음 곡 편향 분석 시 `entries` 테이블 사용:
- 458 entries / 311 unique songs / 평균 곡당 1.47회
- 단일 곡 max 7회 (낭만을 찾아서)
- "건강한 long-tail" 결론

→ 사용자 지적: "대시보드는 HAPPENING 14번, Sunny Morning 12번이라고 나오는데?"

→ 진짜 source는 `recommendation_logs`. 검증:
- 2,435 외부 추천 / 784 unique songs / 평균 곡당 3.1회
- 단일 곡 max 22회 (Blue Hour)
- KST 기준 7일 + INTERNAL 제외 = 대시보드 수치와 정확히 일치

### 3-2. 두 테이블 의미 차이

| 테이블 | 의미 | 외부 23일 카운트 |
|---|---|---|
| `recommendation_logs` | **모든 추천** (Claude가 1곡 선택할 때마다 1건) | 2,435 |
| `entries` | 일부만 (저장/공유된 결과만 보존?) | 307 |

→ **표본 5.3배 차이**. entries만 보면 편향 약하게 보임. **수동 SQL 분석은 recommendation_logs 사용 표준**.

### 3-3. handoff 메타 학습 (영구 박제)

handoff 5/9 part1 §13 INTERNAL 박제와 같은 카테고리:
- INTERNAL 미제거 = viral 수치 80% 부풀림
- entries 사용 = 편향 1/5로 축소

**수동 SQL 분석 시 표준:**
1. ✅ INTERNAL device 제외 (외부 only)
2. ✅ KST 기준 (`AT TIME ZONE 'Asia/Seoul'`)
3. ✅ **추천 로그는 `recommendation_logs` 사용** (entries 아님) ← 5/9 part2 추가

---

## 4. 진짜 곡 추천 분포 박제 (외부, 23일)

### 4-1. 곡 단위 (recommendation_logs 외부)

| 항목 | 값 |
|---|---|
| 외부 총 추천 | 2,435 |
| Unique 곡 | 784 / pool 1,383 (**56.7% coverage**) |
| 단일 곡 max | **22회** (Blue Hour — 투모로우바이투게더) |
| 10회+ 추천된 곡 | 31곡 |
| 1번만 추천 | 290곡 (37%) |
| top 5 / top 10 / top 50 | 4.1% / 7.4% / 24% |

### 4-2. Top 10 곡 (외부)

| 순위 | 곡 | 아티스트 | 장르 | 외부 추천 |
|---|---|---|---|---|
| 1 | Blue Hour | 투모로우바이투게더 | kpop | **22** |
| 2 | 행운을 빌어요 | 페퍼톤스 | indie | 21 |
| 3 | airplane thoughts | Dhruv | pop | 20 |
| 4 | 너의 의미 | 아이유 | kpop | 19 |
| 5 | HAPPENING | AKMU | kpop | 19 |
| 6 | 루프탑 | Autumn Vacation | indie | 18 |
| 7 | let's go picnic | 죠지 | indie | 16 |
| 8 | 햇빛 bless you | AKMU | kpop | 16 |
| 9 | 초록을거머쥔우리는 | 잔나비 | indie | 15 |
| 10 | Sunny Morning | DOO | acoustic_jazz | 14 |

→ kpop·indie·acoustic_jazz가 top 10 점령, **rnb·hiphop 0건**.

### 4-3. 7일 vs 14일 vs 30일 카운트 분포

| 백분위 | 7일 | 14일 | 30일 |
|---|---|---|---|
| max | 14 | 17 | 22 |
| p95 | 4 | 7 | 9 |
| p75 | 2 | 3 | 4 |
| median | 1 | 2 | 2 |
| 0회 (휴면) | 264곡 | 84곡 | 0곡 |

→ 7일 cycle 선택 근거: 풀 변동·트렌드 즉각 반영, max 14회 → top 곡 50% 페널티 가능.

---

## 5. 장르별 engagement 매트릭스 ⭐ (외부, 23일)

| 장르 | impressions | save_rate | listen_rate | story_rate | 종합 |
|---|---|---|---|---|---|
| **acoustic_jazz** | 362 (over) | **8.6%** ⭐ | 1.4% | **2.8%** ⭐ | **최강** |
| **indie** | 767 (균형) | **7.6%** ⭐ | 1.4% | 2.6% | **강함** |
| **pop** | 206 (균형) | 6.3% | **2.4%** ⭐ | 1.5% | 중간 |
| hiphop | 270 (under) | 4.8% | 0.7% | 1.1% | 약함 |
| **kpop** | 626 (over) | **4.3%** 🚨 | 1.3% | 1.6% | **약함** |
| **rnb** | 204 (under) | **3.4%** 🚨 | 1.0% | 1.5% | **최약** |

### 5-1. 핵심 인사이트 3개

1. **rnb 사장은 정당함** — 추천받아도 사용자 만족 낮음. handoff 5/9 part1에서 "rnb 252곡 사장 = 문제"로 박제했는데 **사실 정당한 시장 신호**. → rnb pool 정리 권고 (252→100곡 다이어트)
2. **kpop = 진짜 problem child** — 추천 26%(over) but save_rate 4.3%(낮음). Claude가 사진→매칭 시 kpop 너무 자주 고름. → 글로벌 가중치로 자연 보정 시작됨
3. **acoustic_jazz는 정확한 over** — over-recommended 맞지만 save_rate 8.6%로 1위. **건들지 마**

### 5-2. 곡 단위 engagement는 sparse (data reality)

| 신호 | events | unique 곡 | 곡당 평균 | 신뢰성 |
|---|---|---|---|---|
| recommendation | 2,435 | 784 | 3.1회 | 분모 ✅ |
| listen | 34 | 30 | 1.1회 | ❌ 거의 무용 |
| save | 152 | 131 | 1.16회 | ⚠️ 약함 |
| share completed | 9 | 9 | 1.0회 | ❌ 무용 |
| story_save | 49 | 49 | 1.0회 | ❌ 무용 |

→ **곡 단위 quality scoring은 6개월+ 데이터 누적 필요**. 그 전엔 노이즈. **장르 단위는 즉시 활용 가능**.

---

## 6. device × 곡 중복 추천 검증 박제 ✅

### 6-1. 결과
| 항목 | 결과 |
|---|---|
| device × 곡 페어 총 | 2,435건 (외부) |
| 1번만 받음 | **2,432건 (99.9%)** ✅ |
| 2번 받음 | 3건 (0.1%) |
| → 정상 (7일+ 후 재추천) | 1건 (Over The Moon, 9.9일 간격) |
| → 봇 호출 | 2건 (5912d52f, 4/19) |
| **알고리즘 버그** | **0건** ✅ |

### 6-2. 5912d52f 봇 케이스
- 4/19 03:27:34~35 (1.7초 안에 6번 분석 호출)
- Kanye·Jay-Z 곡 6번 (hiphop 모드)
- POWER 2번, Ni**as in Paris 2번
- 사람 불가능 (Claude API 자체가 3-5초)
- → 4/19 당시 device rate limit이 약했거나 race condition 통과

### 6-3. device 평생 차단 후 효과
- 정상 유저: 영향 없음 (이미 99.9% 1회만 받음)
- 헤비 유저: 풀의 3.3%만 추가 차단 (max 46곡 / 1383)
- 봇 케이스: race condition은 막을 수 없지만 rate limit이 1차 방어

---

## 7. Device Rate Limit 코드 검증 박제

### 7-1. 위치
`src/app/api/analyze/route.ts:18-22`, `:33-99`

### 7-2. 임계값
```ts
const RATE_LIMITS = {
  perMinute: 5,   // 봇 방어 (인간 한계 분당 2회의 2배)
  perHour: 30,    // viral 헤비유저 보호
  perDay: 60,     // 최대 45회 파워유저 + 헤드룸
};
```

### 7-3. 운영 history 박제 (코드 주석)
- 2026-04-30: 시간당 15 → 20 완화 (4월 누적 6건 모두 광고 유입 정상 헤비유저)
- 2026-05-01: 시간당 20 → 25 완화 (5/1 컬렉터형 헤비유저 19회 시도 후 차단)
- 2026-05-03: 시간당 25 → 30, 일당 50 → 60 완화 (5/3 viral chain seeder 시간당 25 한도에 6번 fail)
- → 점진 완화 = 헤비유저 보호 + 어뷰저 차단 균형 유지

### 7-4. 검증 결과
- ✅ analyze_logs 기반 device별 카운트 (분/시간/일 3단계)
- ✅ 429 응답 + Retry-After 헤더
- ✅ "어느 한도가 가장 빨리 풀리는지" 정확히 계산해서 retry 안내
- ✅ /preference에서 status="start" 로그 미리 insert → 본인 포함 count

### 7-5. 알려진 한계
- **race condition**: 6 호출이 거의 동시 도착 시 모두 count 5 이하로 보임 → 일부 통과
- → 5912d52f 4/19 케이스는 이 케이스일 가능성. 현재는 history.

---

## 8. 변경 후 모니터링 항목 (5/10~5/16)

### 8-1. Vercel 로그 첫 검증 (배포 후 5-10분)
정상이면 다음 3 줄 보여야 함:
```
[new] device 평생 추천 제외: N곡
[new] global 7d counts cached: XXX곡, YYY건
[new] candidate_logs 기록: 50건 (selected position=N)
```

### 8-2. 1주 후 (5/16) 효과 측정 SQL

```sql
-- (1) Top 곡 분포 변화 — 5/9 이전 vs 이후
WITH internal AS (
  SELECT unnest(ARRAY[/* 20개 INTERNAL device_id */]) AS device_id
)
SELECT
  CASE WHEN created_at < '2026-05-09 18:00' THEN 'before' ELSE 'after' END AS period,
  s.song, s.artist,
  COUNT(*) AS recs
FROM recommendation_logs rl
JOIN songs s ON s.id = rl.song_id
WHERE rl.device_id NOT IN (SELECT device_id FROM internal)
  AND rl.created_at > now() - interval '14 days'
GROUP BY 1, s.song, s.artist
ORDER BY recs DESC LIMIT 30;

-- (2) 곡별 후보 진입 → 선택 전환률 (candidate_logs 활용)
SELECT s.song, s.artist,
  COUNT(*) AS impressions,
  COUNT(*) FILTER (WHERE was_selected) AS selected,
  ROUND(COUNT(*) FILTER (WHERE was_selected) * 100.0 / COUNT(*), 2) AS conversion_pct
FROM candidate_logs cl
JOIN songs s ON s.id = cl.song_id
WHERE cl.created_at > '2026-05-09'
GROUP BY s.song, s.artist
HAVING COUNT(*) >= 30
ORDER BY conversion_pct DESC LIMIT 20;

-- (3) 7일 글로벌 카운트 분포 (편향 차단 효과)
WITH internal AS (...)
SELECT
  COUNT(*) FILTER (WHERE c >= 14) AS songs_with_14plus,
  COUNT(*) FILTER (WHERE c >= 7)  AS songs_with_7plus,
  MAX(c) AS new_max
FROM (
  SELECT song_id, COUNT(*) AS c
  FROM recommendation_logs
  WHERE device_id NOT IN (SELECT device_id FROM internal)
    AND created_at > now() - interval '7 days'
  GROUP BY song_id
) sc;
```

### 8-3. 기대 효과 가설
- Top 곡 (Blue Hour 등) 7일 카운트: 14 → **5-8** (50%↓)
- 후보 → 선택 전환률 분포 명확화 (현재 측정 불가, 5/16부터 가능)
- 사장 곡 일부가 다시 후보로 들어가면서 selected 케이스 증가 가능

### 8-4. 노이즈 시나리오 (대비)
- 일별 추천량 변동: 트래픽 변화 vs 알고리즘 효과 분리 필요
- 광고 효과: 5/9~5/16 iOS only 변경(handoff 5/9 part1 §8) 영향과 혼재 가능
- → 7일 누적으로 비교 필수, 단일 일자 판단 X

---

## 9. 장기 가드레일 로드맵 박제

5/9 part2 세션에서 검토한 5가지 가드레일 + 진행 상태:

| 가드레일 | 작업량 | 즉시 효과 | 데이터 누적 가치 | 적용 시점 |
|---|---|---|---|---|
| **1. Candidate logging** | 작음 | 0 | 매우 큼 | ✅ **5/9 적용** |
| 2. 신곡 자동 boost | 매우 작음 | 큼 | 작음 | 보류 |
| 3. song_quality_stats 테이블 | 중간 | 중간 | 큼 | Phase 3 (1개월 후) |
| 4. vibe_song_affinity 테이블 | 중간 | 작음 | 매우 큼 | Phase 3 |
| 5. 장르 multiplier auto-tune | 작음 | 작음 | 중간 | Phase 4 (3개월 후) |

### 9-1. Candidate logging이 핵심 인프라
- 일 5,000 rows 누적 (100 호출 × 50 후보)
- 90일 = 450k rows
- 곡당 평균 60 impressions = quality scoring 충분
- **6개월 후 곡 단위 Bayesian quality 가능**

### 9-2. 6개월 진화 타임라인
```
Day 0      : Phase 1 배포 (rotation + candidate logging) ← 5/9 완료
Day 7      : 첫 효과 측정 (top 곡 분포 변화)
Day 30     : candidate_logs 150k rows = 곡별 conversion rate 첫 측정
Day 90     : song_quality_stats 도입 → quality multiplier 시작
Day 180    : vibe_song_affinity 활성화 → 사진 type별 정교화
Day 365    : 장르 auto-tune → 시즌 자동 적응
```

---

## 10. 다음 우선순위 (5/9 part1 §14 + 5/9 part2 추가)

### 🔴 즉시 모니터링 (5/10~5/16)
1. **iOS only 광고 효율** (handoff 5/9 part1) — LPV비용 출렁임 + 25-34 iOS 단독 검증
2. **추천 알고리즘 효과 측정** ← 5/9 part2 추가
   - Top 곡 분포 변화 (Blue Hour 22회 → ?)
   - candidate_logs 첫 데이터 풍성도 검증
   - "[new] device 평생 추천 제외: N곡" 로그로 평생 차단 작동 확인
3. **5월 KPI 재합의** — save_arch 25% Primary로 동업자 합의

### 🟡 이번 주 작업
4. **vibe archive 페이지 spec 작성** ⭐⭐⭐ (152명 외부 검증)
5. **OG 카드 QR + share URL ref param** ⭐⭐
6. **share 페이지 CTA A/B** ⭐⭐
7. **새 크리에이티브 A/B prep** — iOS only로 누적 빈도 가속

### 🔵 백로그
- **rnb pool 다이어트** ⭐ 신규 — engagement 데이터로 정당화됨 (252 → 100곡)
- **kpop 추천 모니터링** — 글로벌 가중치로 자연 감소 예상, 4.3% engagement 추적
- Android user UX 분기 (M2)
- iOS 앱 Apple Developer 가입
- analyze_logs UA 컬럼 추가
- 인스타 계정 콘텐츠 강화

---

## 11. 다음 세션 시작 멘트 후보

```
"5/16 추천 알고리즘 효과 측정 — Blue Hour 7일 카운트 변화 + candidate_logs 첫 인사이트"
```
또는
```
"vibe archive 페이지 spec 작성 — 4명 power user + save_arch 152명 검증 데이터 기반"
```
또는
```
"rnb pool 다이어트 252→100곡 — engagement 3.4% 데이터로 정당화"
```
또는
```
"5/10~5/16 iOS only 광고 효율 + 추천 알고리즘 효과 동시 측정"
```
또는
```
"5월 KPI 재합의 — save_arch 25% Primary 동업자 합의"
```

---

## 12. 박제 메타 학습 (5/9 part2에서 배운 것)

1. **`entries` 테이블은 추천 로그의 일부만 보존** — 진짜 source는 `recommendation_logs`. 수동 SQL 분석 표준 추가 (handoff 5/9 part1 §13 INTERNAL 박제와 같은 카테고리).
2. **곡 단위 quality scoring은 데이터 sparsity로 6개월 후에야 의미 있음** — 곡당 engagement 평균 0.1회 = 노이즈. **장르 단위는 즉시 활용 가능** (sample 200~700/장르).
3. **rnb 사장은 정당한 시장 신호** — engagement 3.4% 가장 낮음. handoff 5/9 part1 §10에서 "rnb 사장 = 문제"로 박제했지만 정정. **알고리즘 변경 X, pool 정리 O**.
4. **kpop이 진짜 problem child** — 추천 비중 26% but engagement 4.3%. 글로벌 가중치로 자연 보정 시작.
5. **device 평생 차단 안전성 검증** — max 헤비유저 46곡 = 풀의 3.3%, 1년 후 200회 가정도 14% = 풀 86% 남음. + 4차 fallback 안전망. **풀 고갈 위험 0%**.
6. **race condition은 알고리즘으로 못 막음** — rate limit이 1차 방어. 5912d52f 4/19 봇 케이스가 좋은 예시.
7. **Latency 영향은 Claude API 변동성(±2000ms) 안에 묻힘** — 추가 +6ms = 0.2%. 사용자 체감 0. 새 알고리즘 도입의 실질적 페널티 없음.
8. **장기 가드레일은 "데이터 인프라 깔기 → 누적 → 학습"** — candidate logging이 그 시작. 6개월 후 quality scoring 자동 작동.

---

## 13. 코드 변경 파일 박제 (영구 참조용)

### 13-1. `supabase/migration_013.sql` (신규, commit `bc690a1`)
```sql
CREATE INDEX IF NOT EXISTS idx_rec_logs_created_at
ON recommendation_logs (created_at);

CREATE TABLE IF NOT EXISTS candidate_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  song_id uuid NOT NULL,
  position int NOT NULL,
  was_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidate_logs_song_id ON candidate_logs (song_id);
CREATE INDEX idx_candidate_logs_device_created ON candidate_logs (device_id, created_at);
CREATE INDEX idx_candidate_logs_created_at ON candidate_logs (created_at);
```

### 13-2. `src/app/api/analyze/new-recommend.ts` (수정, commits `bc690a1` + `20d43bb`)

**STEP 0** (line ~258-275, 평생 차단):
```ts
let excludedIds: string[] = [];
if (deviceId) {
  const { data: recData } = await supabase
    .from("recommendation_logs")
    .select("song_id")
    .eq("device_id", deviceId);  // ← 7일 필터 제거
  excludedIds = (recData ?? []).map(r => r.song_id).filter(Boolean);
}
```

**Helper functions** (line ~46-122, 가중치 + 캐시):
```ts
const GLOBAL_COUNTS_TTL_MS = 5 * 60 * 1000;
let globalCountsCache: { counts: Map<string, number>; fetchedAt: number } | null = null;
async function getGlobal7dCounts(supabase): Promise<Map<string, number>> { ... }

const ROTATION_K = 0.10;
function computeWeight(songId, counts): number {
  return 1 / (1 + (counts.get(songId) ?? 0) * ROTATION_K);
}

function weightedShuffleAndSlice(arr, n, counts): SongRow[] { ... }
function balancedSample(arr, maxPerGenre, counts): SongRow[] { ... }
```

**STEP 1.5** (line ~377-390, 가중 샘플링):
```ts
const global7dCounts = await getGlobal7dCounts(supabase);
if (isDiscover) {
  finalCandidates = balancedSample(filteredCandidates, perGenre, global7dCounts).slice(0, dynamicLimit);
} else if (filteredCandidates.length > dynamicLimit) {
  finalCandidates = weightedShuffleAndSlice(filteredCandidates, dynamicLimit, global7dCounts);
}
```

**STEP 4** (line ~459-483, candidate logging):
```ts
after(async () => {
  await supabaseAdmin.from("recommendation_logs").insert({...});  // 기존
  // 신규: candidate_logs 50건 batch
  const candidateRows = finalCandidates.map((s, i) => ({
    device_id: deviceId,
    song_id: s.id,
    position: i + 1,
    was_selected: s.id === selectedSong.id,
  }));
  await supabaseAdmin.from("candidate_logs").insert(candidateRows);
});
```

### 13-3. Rate limit 검증 위치 (변경 없음, 박제용)
`src/app/api/analyze/route.ts:18-22, 33-99`
- 분당 5 / 시간당 30 / 일당 60
- 4/30~5/3 점진 완화 history 코드 주석에 박제됨

---

## 14. 5/9 박제 전체 정리 (part1 + part2)

### Part 1 (오전~낮)
- INTERNAL device 미제거 → viral 수치 80% 부풀림 정정
- 4월~5월 KPI 재계산 (공유율 6.3% → 0.63%)
- 4-way OS×Age 매트릭스: 18-24 iOS = 단일 viral segment
- mbti_18-24·25-34 광고 iOS only로 변경

### Part 2 (오후~저녁) ← 이 핸드오프
- 추천 알고리즘 3건 변경 배포 (rotation + candidate logging + 평생 차단)
- entries vs recommendation_logs 메타 박제
- 장르별 engagement 매트릭스 (rnb 사장 정당화, kpop problem child)
- Rate limit 코드 검증
- 6개월 장기 가드레일 로드맵
- 추천 품질 metrics 대시보드 배포 (Catalog Coverage + Long-tail)
- Claude 편애 가설 5개 + vibeType·description 패턴 박제
- candidate_logs 작동 검증 + Setlog passkey 도입 보류 결정
- analysis_results Phase 1 도입 (모든 분석 vibe 데이터 박제)

---

## 15. Claude 편애 가설 5개 박제 ⭐⭐⭐

### H1. 시각·자연·환경 키워드 강한 선호 (가장 강함)
| 키워드 | 곡당 평균 추천 | 평균(1.76) 대비 |
|---|---|---|
| ☕ 카페/커피 (pool 3) | 7.00 | **4.0x** |
| 🌤️ 하늘/푸름 (pool 14) | 4.14 | 2.4x |
| ☀️ 햇빛/노을 (pool 24) | 3.96 | 2.3x |
| 🌙 밤/달/별 (pool 45) | 3.60 | 2.0x |
| 🌸 계절 (pool 26) | 3.50 | 2.0x |
| ⏰ 시간대 (pool 22) | 3.45 | 2.0x |
| 💕 사랑/감정 (pool 102) | 1.45 | **0.8x** |

→ 사진 = 시각 매체. Claude는 곡 제목의 시각·자연 키워드를 가장 강한 매칭 단서로 사용. **추상 감정·관계는 사진과 매칭 어렵다 판단**.

### H2. 사랑·감정 키워드 회피 (0.8x under)
"love·heart·사랑·마음" 등 추상 감정 단어 곡은 평균보다 적게 픽.

### H3. 한국어 제목·아티스트 강한 선호
| 차원 | 영문 | 한글 | over |
|---|---|---|---|
| 곡 제목 (recs/song) | 1.60 | 2.39 | **+49%** |
| 아티스트 (recs/song) | 1.57 | 2.30 | **+46%** |

→ 한국 사진 → 한국 곡 매칭 자연스럽다 판단. 또는 한글 제목이 시각 단어 비중 높음.

### H4. rnb·hiphop 풀 절반 사장
| 장르 | 사장 / 추천 | 사장률 |
|---|---|---|
| **rnb** | 161/91 | **64%** 🚨 |
| **hiphop** | 121/116 | **51%** |
| pop | 65/78 | 45% |
| indie | 168/238 | 41% |
| acoustic_jazz | 28/93 | 23% |
| **kpop** | 56/168 | **25%** ⭐ |

→ rnb·hiphop 곡 제목 "love·grit·감정" 비중 높음 → H1·H2 결합되어 회피. **사장이 정당** (engagement 데이터로도 검증 §5).

### H5. Energy 5(파워풀) 24% 회피
사진 = 정적 매체 → 댄스·헤비록·EDM 매칭 어려움. 잔잔한 곡(power 1) 1.21x slight over.

### 종합 가설: **시각적 환유(metonymy) 매칭**
> Claude는 사진 → 곡 매칭을 **시각·환경·시간 단어의 환유**로 해결.
> 카페 사진 → "Sunny Morning"·"Coffee with My Baby" 같은 곡 텍스트.

→ **편향 ≠ 버그**. 인간 큐레이터도 비슷. **풀 큐레이션이 알고리즘만큼 중요**.

### 풀 큐레이션 권고 (H4 기반)
1. **rnb·hiphop 다이어트** ⭐⭐⭐ — visual 키워드 없는 곡 archive (rnb 252→100, hiphop 237→100)
2. **신곡 추가 룰** — visual 키워드 + 한글 제목 우선
3. **알고리즘 변경 X** — 풀 자체 큐레이션이 진짜 lever

---

## 16. vibeType·vibeDescription 패턴 박제

### 표면 metric (308 외부 entries)
- vibeType **95.5% unique** (294/308) ✅
- vibeDescription **25자 룰 0건 위반** ✅
- 평균 reason 139.3자 (3문장 적정) ✅
- K-POP 표기 오류 0건 ✅
- 매칭 자체는 대부분 자연스럽고 위트 있음

### ⚠️ 숨은 패턴화 (정량 검출)

**vibeType 어미 — 73.7%가 정형**
| 어미 | 건수 | 비중 |
|---|---|---|
| **~러** (산책러·셀카러) | 101 | **33%** |
| **수집가** | 57 | **18.5%** |
| ~단/단장 | 20 | 6.5% |
| ~자 (기록자) | 15 | 4.9% |
| 장인 | 12 | 3.9% |
| 요정 | 10 | 3.2% |

→ **CLAUDE.md 가이드 예시 5개("~수집가·탐험가·요정·제조기·설계자")가 그대로 답습**. 두 어미만으로 51.5%.

**vibeDescription / reason 클리셰**
| 패턴 | 건수 | 비중 |
|---|---|---|
| **"~ 중" 종결** | 63 | **20.5%** ⚠️ |
| "본인" (자기 객체화) | 36 | 11.7% |
| "오늘"로 시작 | 31 | 10.1% |
| **"지분" 단어** | 25 | **8.1%** |
| 의문형 "?" 종결 | 1 | 0.3% 🚨 (가이드 강조 vs 거의 안 씀) |

**금지어 위반 8.1%** (25건/308): "딱 / 이건 그냥 A 아니라 B / 결이 맞 / 어울려요 / 그 자체" — 가이드가 길어 묻혀 위반됨.

### 곡 매칭 어색 사례 (H1 가설 검증)
- 🌳 청량 화보러 / 햇살 메타세콰이어 사진 / **"Time for the moon night"** — 여자친구
  - 사진은 햇살, 곡은 달밤
  - reason: "달빛 대신 햇빛 버전으로 골라봤어요" ← **Claude가 self-justify** = 매칭 어색함 인지

### 개선 권고 (보류 — 사용자 "과한 개입 X" 우려)
1. **vibeType 가이드 예시 형식 다양화** ⭐⭐⭐ — 직업형(~가/~자) 외 동사구·시간+정체성·짧은 명사구
2. **vibeDescription 종결 다양화** — "~중" 의식적 회피
3. **금지어 위치 강조** — JSON 위 별도 한 줄

→ 5/16 measurement 후 결정.

---

## 17. candidate_logs 작동 검증 박제 ✅

### 첫 데이터 (5/9 19:19~21:32 KST, 12 calls)
| 항목 | 값 |
|---|---|
| total rows | 581 |
| analyze device | 6명 |
| 후보 진입 unique 곡 | 464곡 |
| selected count | 12 (각 호출 1곡) |
| **selection rate** | **2.07%** = 1/50 ✅ |
| 호출당 후보 수 | 50 (대부분), 41-45 (limitPerArtist 일부 제거) |
| position | 1~50 1-based 정확 |

### 가중치 작동 검증 ✅
top 후보 진입 곡들이 **7d count 0 (weight 1.0) 위주**:
- Love in the Margins (정세운, kpop) — weight 1.00
- Summer In Love (SAAY, **rnb**) — weight 1.00, 진입 ✅
- DIE 4 YOU (DEAN, **rnb**) — weight 1.00, 진입 ✅
- Cheek To Cheek (meenoi) — 7d count 4, weight 0.71 → 페널티 받지만 여전히 진입 (페널티 ≠ 차단)

→ rnb·hiphop 후보엔 정상 진입. **사장은 selected 단계에서 발생** (H4 가설 강화).

### Primacy bias
| Position | selection_rate |
|---|---|
| 01-05 | 1.67% |
| 06-10 | 0.00% |
| **11-20** | **4.17%** ⭐ |
| 21-30 | 0.83% |
| 31-40 | 1.67% |
| 41-50 | 2.97% |

→ first 5 위치가 high 아님 = **primacy bias 안 보임 ✅** (sample 12로 단정 못함, 5/16 재측정)

---

## 18. Setlog passkey 도입 검토 → **보류** 결정

### Setlog vs Play the Picture 모델 차이
| 차원 | Setlog | Play the Picture |
|---|---|---|
| 핵심 가치 | 친구와 매시간 일상 공유 (소셜) | 사진 → 곡 추천 (콘텐츠·유틸) |
| Login 필요성 | **필수** (친구 = 사용자 식별) | **선택** (anonymous 작동) |
| 사용 빈도 | 매시간 (high) | 1-3회/user (low) |
| Viral 메커니즘 | 친구 초대 기반 | 카드 공유 기반 (login 무관) |

### 데이터 충격 예측
- 광고 funnel: 70% drop-off에 추가 마찰 30-50% → CAC 2-3배 악화
- Viral try_click: 80% 누수 → 95%+ 누수
- Login 가치는 **헤비유저 4명 (957명 중 0.4%)** 한정

### 권고: **Archive 페이지 강화** (login 없이도 가능)
- 이미 152명 (15.9%) archive 사용 = 검증된 retention 메커니즘
- "내 vibeType 컬렉션 카드" 셰어 가능 URL → cross-device 가치 80% 회수
- "월말 vibe wrap" Wrapped-style

### 시점
- 지금 (0-3개월): PMF 검증, anonymous 유지
- 3-6개월: optional login 검토
- **6개월+ iOS 앱 출시**: Apple Sign-In 자연 도입 (Apple 정책)

→ **Setlog의 product structure 카피 X, design language inspiration ⭕** (이모지·일러스트 톤 차용 가능)

---

## 19. Spotify 사고 실험 박제 (인디 vs 대형 차이)

만약 Spotify가 운영했다면 추가했을 것:

### 트래킹 지표
- **Streaming attribution**: 추천 → 실제 재생 완료 → playlist 추가
- **NDCG / Coverage / Diversity / Serendipity / Novelty**
- L7/L28 stickiness, retention curve by cohort × genre
- **Audio feature alignment** (Spotify Web API에 free)
- Premium conversion uplift, ad impression value
- Creator-side: 추천 → streaming uplift → 아티스트 로열티

### 운영 정책
- 콜드 스타트 X (사용자 청취 이력 활용)
- GDPR/CCPA 컴플라이언스
- Editorial 큐레이션 팀 (부적절 곡 제외)
- Independent artist quota
- Anti-bias audit (성별·인종·언어)
- A/B test framework 필수
- Multi-armed bandit 자동 explore/exploit

### 인디 입장 빌려올 것 5개 (우선순위)
1. ⭐⭐⭐ **Audio Features 활용** — Spotify Web API 무료, songs에 valence·danceability·acousticness 추가 → Claude한테 메타데이터로 같이 전달
2. ⭐⭐ **Quality 메트릭 표준화** ✅ **5/9 적용** (commit `73c9634`)
3. ⭐⭐ **간이 A/B test framework** — hash(deviceId) 50/50 분할
4. ⭐ **Editorial gate** — 신곡 추가 시 review (handoff §13 풀 다이어트)
5. ⭐ **Serendipity 측정** — candidate_logs + listen_logs로 사장 곡 클릭률

### 인디 우위
- **빠른 의사결정** (Spotify는 알고리즘 변경 = 6개월 review)
- **사용자와의 직접 거리** (power user 4명 이름까지 박제)
- **단일 vibe·target 집중** (18-24 한국 여성 / Spotify는 6억 user 평균)

→ "Spotify처럼 측정하되, 인디처럼 빠르게 결정"

---

## 20. 추천 품질 Metrics 대시보드 박제 ⭐⭐ (commit `73c9634`)

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/app/api/admin/quality-metrics/route.ts` | 신규 — 5개 metric 계산 (외부 only, INTERNAL 자동 제외) |
| `src/app/admin/page.tsx` | "📊 추천 품질" 섹션 추가 (관리 도구 위) |
| `docs/QUALITY_METRICS.md` | 영구 박제 — 5개 metric 정의 + SQL + ⚠️ Goodhart 원칙 |

### 대시보드 카드 6개 (30일) + 3개 (7일 cycle)
- Catalog Coverage / Top 10 share / Top 50 share / Long-tail share / 단일 곡 max / 1회만 추천 비중
- 7일: 총 추천·max·top10 (cycle 효과 빠른 측정)

### 색상 가드레일
- Top 10 share > 15% = 주황색 (편향 ↑)
- 단일 곡 max (7d) > 14회 = 주황색 (5/9 baseline 초과)
- Long-tail share > 60% = 초록색 (다양성 좋음)

### Baseline (5/9 박제)
- Coverage 30d: **56.7%** (784/1383)
- Top 10 share 30d: **7.4%**
- 단일 곡 max 7d: **14회**

### ⚠️ 운영 원칙 (Goodhart's Law)
- 이 metric은 **가드레일·편향 진단용**
- **KPI/목표값으로 사용 X** ("coverage 90% 달성" → rnb 강제 노출 → save_rate ↓)
- 진짜 KPI는 user 만족 (save_rate, retention)

### 5/16 효과 측정 score card 양식
```markdown
## 변경: 7일 글로벌 가중치 (k=0.10) (5/9 → 5/16)
| Metric | 변경 전 | 변경 후 | delta | 평가 |
|---|---|---|---|---|
| Coverage 30d | 56.7% | ?% | ? | |
| Top 10 share | 7.4% | ?% | ? | |
| 단일 곡 max 7d | 14회 | ?회 | ? | |
| save_rate (KPI) | 6% | ?% | ? | |
Verdict: [ship / iterate / rollback]
```

자세한 정의·SQL: [QUALITY_METRICS.md](./QUALITY_METRICS.md)

---

## 21. analysis_results 테이블 도입 박제 ⭐⭐ (commit `a8ac0e8`)

### 도입 배경
- entries 308건 (외부 액션) vs recommendation_logs 2,435건 (외부 분석) = **87% 갭**
- 액션 안 한 2,127건 분석의 vibe·reason 데이터 영원히 없음
- handoff §15·§16 패턴 분석을 더 큰 표본으로 가능하게

### 검토한 옵션 3개
| 옵션 | 평가 | 채택 |
|---|---|---|
| A. entries 즉시 insert (사진 포함) | storage 5GB/년 + privacy 위험 + UX 혼란 | ❌ |
| B. recommendation_logs 컬럼 확장 | 단순하지만 rec_logs 비대화 + 미래 확장성 약함 | ❌ |
| **C. analysis_results 신규 테이블** | 깨끗한 분리 + 미래 확장성 ⭐⭐⭐ | ✅ |

### Phase 1 원칙 박제
- **기존 데이터 그대로** (backfill 없음)
- **읽기 코드 그대로** (entries에서 직접 읽기)
- **신규 분석부터** analysis_results 채워짐
- **사용자 영향 0**, 위험 0

### 변경 파일
| 파일 | 변경 |
|---|---|
| `supabase/migration_014.sql` | 신규 — analysis_results 테이블 + 5 인덱스 |
| `src/app/api/analyze/new-recommend.ts` | STEP 4: recommendation_logs.id 받아서 analysis_results와 link insert |

### Schema (주요)
```sql
analysis_results (
  id, recommendation_log_id, device_id, song_id,
  vibe_type, vibe_description, reason, tags, emotions,
  selected_index,
  -- 미래 확장 컬럼 (현재 NULL)
  ab_variant, prompt_version, model_id,
  created_at
);
```

### 데이터 비교 (운영 원칙)
| 데이터 source | 의미 | 사용처 |
|---|---|---|
| **entries** | 사용자 의도적 저장 (사진 포함) | journal·share·OG 페이지 (user-facing) |
| **recommendation_logs** | 알고리즘 행위 (Claude 호출 사실) | 추천 분포·편향 분석 |
| **analysis_results** | Claude 응답 콘텐츠 (사진 X) | 패턴 분석·prompt versioning·A/B test |
| **candidate_logs** | Claude 후보 50곡 박제 | 곡별 진입→선택 전환률 |

### 향후 확장 시점 (컬럼 미리 두었음)
- **prompt_version**: 5/16 후 prompt 변경 시 채우기 시작 → 변경 효과 분리 측정
- **ab_variant**: A/B test framework 도입 시 활용 (handoff §19 Spotify lever 3)
- **model_id**: 매 분석에 채워짐 (Claude vs 미래 다른 모델 비교)

### 5/16+ 활용 SQL 예시
```sql
-- 1. 벤치마크: 모든 분석의 vibeType 어미 패턴 (8x 표본)
SELECT
  CASE WHEN vibe_type ~ '러$' THEN '~러'
       WHEN vibe_type ~ '수집가' THEN '수집가'
       ELSE 'other' END AS suffix,
  COUNT(*) AS cnt
FROM analysis_results
WHERE created_at > '2026-05-09'
GROUP BY 1;

-- 2. vibe별 액션 전환률 (왜 87% 액션 안 했나?)
SELECT
  ar.vibe_type,
  COUNT(*) AS recommended,
  COUNT(e.id) AS actioned,
  ROUND(COUNT(e.id) * 100.0 / COUNT(*), 1) AS conversion_pct
FROM analysis_results ar
LEFT JOIN entries e ON e.device_id = ar.device_id
  AND e.song = (SELECT song FROM songs WHERE id = ar.song_id)
WHERE ar.created_at > '2026-05-09'
GROUP BY ar.vibe_type
HAVING COUNT(*) >= 10
ORDER BY conversion_pct DESC;

-- 3. prompt versioning 전후 비교 (5/16 후 가능)
SELECT prompt_version,
  COUNT(*) FILTER (WHERE reason ~ '딱|결이 맞|어울려요') * 100.0 / COUNT(*) AS banned_phrase_pct
FROM analysis_results
GROUP BY prompt_version;
```

### Phase 2·3 영구 보류 결정
- Phase 2 (entries 컬럼 deprecate) = 코드 4페이지 수정 + 위험 ↑
- Phase 3 (entries.vibe drop) = 돌이킬 수 없음
- → **Phase 1만으로 효과 충분**, normalization은 미래 ML pipeline 도입 시 재검토

### 한 줄
> "기존은 그대로, 새 분석부터 더 풍부한 데이터 박제 시작" — 사용자 영향 0, 위험 0, 작업 30분.

---

## 22. 5/9 part2 commit 5개 (전체)

| commit | 변경 |
|---|---|
| `bc690a1` | 7일 글로벌 순환 가중치 + candidate_logs |
| `20d43bb` | device 평생 곡 차단 + 아티스트 cap 제거 |
| `73c9634` | 추천 품질 metrics 대시보드 (Coverage·Long-tail) |
| `604c748` | handoff 5/9 part1·part2 박제 |
| **`a8ac0e8`** | **analysis_results Phase 1 (모든 분석 vibe 박제)** |

→ 전체 작업: SQL migration 2개 + 코드 5개 영역 + handoff 2개 + doc 1개
