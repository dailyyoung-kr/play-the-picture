# Session Handoff — 2026-05-10

> 5/10 박제. **5/9 추천 알고리즘 변경 24h 모니터링 + 대시보드 viral 측정 정직성 대수술.** 5/9 commit a8ac0e8 후 88건 분석 손실 (migration 미적용 발견·복구). KEY METRICS 재정의 + VIRAL LOOP 확장 + 임계값 13건 reality 반영 + lifetime retention + 공유 Top 5 합집합. 메타 학습: viral direct attribution 본질적 불가능 → cohort 측정 표준화.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-09_part2.md](./SESSION_HANDOFF_2026-05-09_part2.md)
> 영구 참조: [PROJECT_KNOWLEDGE.md](./PROJECT_KNOWLEDGE.md)

---

## 1. 한 줄 요약 (10건)

1. **추천 알고리즘 24h 효과 명확** — Blue Hour 외부 7d 22→8 (-64%), 단일 곡 max 3→2 (분포 평탄화) ✅
2. **🚨 migration_014 누락 발견·복구** — 5/9 a8ac0e8 commit 후 88건 분석의 vibe 데이터 손실 (회복 불가). **메타 학습: commit ≠ migration applied**
3. **storyCard URL 누락 발견** but **추가 보류 결정** — 나만의 네컷·setlog 둘 다 URL 없음 (공유자 자존심 페널티 큼)
4. **viral direct attribution 본질적 불가능 박제** — cohort 측정 (organic 비중·검색량·survey)으로 대체 표준화
5. **KEY METRICS 재정의** (commit `fde7404`) — 공유율(URL only) → viral 행동률(URL ∪ 스토리), K-factor → organic 비중
6. **VIRAL LOOP 섹션 확장** (commit `7fa33fc`) — 스토리 viral 시도율·효율 + 광고 vs organic 7일 mini chart
7. **임계값 13건 데이터 기반 재조정** (commit `c09a18e`) — D1 20/10→7/3, D7 10/5→3/1, 응답시간 8000/10000→11000/13000 등
8. **lifetime 재방문 비율 신규** (commit `4b73394`) — 1회성 도구의 진짜 retention 신호 (baseline 8%)
9. **공유 Top 5 합집합 정정** — URL ∪ 스토리 outcome
10. **20·22시 의심 device 3개 점검 — 모두 진짜 컬렉터형 헤비유저** (봇 X)

---

## 2. 추천 알고리즘 24h 효과 박제 ⭐⭐⭐

### 2-1. Top 곡 외부 7d 카운트 변화 (5/9 baseline → 5/10)

| 곡 | 5/9 baseline | 5/10 현재 | 변화 |
|---|---|---|---|
| **Blue Hour** | **22** | **8** | **-64%** 🔥 |
| HAPPENING | 19 | 14 | -26% |
| 너의 의미 | 19 | 10 | -47% |
| 행운을 빌어요 | 21 | 10 | -52% |
| Sunny Morning | 14 | 10 | -29% |

### 2-2. 배포 전후 24h 직접 비교 (외부)
| 기간 | total recs | unique songs | max | avg |
|---|---|---|---|---|
| before (5/8 18:00 ~ 5/9 18:00 KST) | 108 | 92 | **3** | 1.17 |
| after (5/9 18:00 ~ 5/10 18:00 KST) | 94 | 88 | **2** | 1.07 |

→ **분포 평탄화 + 단일 곡 max 33%↓** ✅ 5/16 측정 안 기다려도 효과 확인됨

### 2-3. candidate_logs 24h 풍성도 (외부 only)
- 4,124 impressions / 91 selected / **2.21% selection rate** (50중 1)
- position 41-50 0.83% 회피 (어제 sample 12에선 안 보였던 패턴)
- position 11-20 selection 3.41% (가장 높음)

---

## 3. 🚨 analysis_results migration 누락 발견·복구 ⭐⭐⭐

### 3-1. 발견 경위
- candidate_logs 데이터는 정상 (table 존재, 2,288 rows 누적)
- 하지만 `analysis_results` 테이블 query → `relation does not exist` 에러
- 즉 5/9 commit `a8ac0e8` (analysis_results Phase 1 도입)이 코드만 푸시됐고 DB migration 적용 안 됨

### 3-2. 영향 측정
- a8ac0e8 push (5/9 22:34 KST) ~ 5/10 15:02 KST 동안 **88건 분석 발생, 0건 박제**
- 사용자 영향 0 (`after()` 비동기 + console.error만)
- 데이터는 영원히 손실 (회복 불가)

### 3-3. 복구
- supabase MCP `apply_migration` read-only 모드라 자동 X
- 사용자가 Supabase Dashboard SQL Editor에서 직접 실행
- 검증: 테이블 + 6 인덱스 + 컬럼 14개 모두 정상

### 3-4. 메타 학습 박제 (영구)
> **commit ≠ migration applied**.
> Supabase migration 파일 추가하는 commit 후엔 별도로 **dashboard SQL Editor에서 실행하거나 MCP `apply_migration` 호출** 단계 필수.
> 같은 패턴: 5/9 part2 같은 날 작업 migration_013은 적용됐고 014만 빠진 건 humans error.
> **체크리스트**: migration 파일 commit 시, push 전에 (a) 자동 apply 확인 또는 (b) handoff에 "migration 적용 여부" 명시 박제.

---

## 4. 결과 페이지 두 버튼 실효성 점검 ⭐⭐⭐

### 4-1. 도입 후 7d 비교 (5/3-5/10, 외부)
| 메트릭 | 도입 전 7d | 도입 후 7d | 변화 |
|---|---|---|---|
| 분석 success | 925 | 899 | -3% |
| share intent | 39 | 18 | **-54%** |
| share completed | 4 | 5 | +1 |
| share_views | 66 | 48 | **-27%** |
| **try_click** (KPI) | **16** | **9** | **-44%** 🚨 |
| story attempt | — | 140 | NEW |
| **story shared/dl** | — | **69** | NEW |

### 4-2. Conversion (분석 → outcome)
- share completed: **0.56%**
- story shared/downloaded: **7.7%** ← **14배 강함**

### 4-3. storyCard URL 누락 발견
- `src/app/result/page.tsx:1657-1673` storyCard JSX에 텍스트 "Play the Picture" + "플더픽의 추천곡" 만 있음
- **playthepicture.com 도메인 표시 0, QR 없음**
- 인스타 스토리 노출돼도 followers는 어디 들어갈지 모름 → conversion 누수 추정

### 4-4. 두 버튼 진짜 역할
| 버튼 | 역할 | 강점 | 약점 |
|---|---|---|---|
| **story 저장** | reach 엔진 | 인스타 followers reach × 69 = 추정 ~3,450 imp/주, 브랜드 인지 | URL 없어 conversion 누수 |
| **share (카톡 등)** | conversion 엔진 | 1:1 친한 관계 → try 전환률 1.8x | 절대 reach 좁음 |

→ **둘 다 필요**. 위계 (story 1차, share 2차) 그대로 유지가 데이터로 검증됨.

---

## 5. URL/QR 보류 결정 + 레퍼런스 분석 ⭐⭐⭐

### 5-1. 레퍼런스 비교
| 앱 | URL/QR | 브랜딩 강도 | 특징 |
|---|---|---|---|
| **나만의 네컷** | ❌ | 작은 워드마크 1줄 | 사진이 메인, 앱은 거의 안 보임 |
| **우리 storyCard** | ❌ | 곡 정보 + reason 풀세트 | 콘텐츠 풀, 앱 정체성 진함 |
| **setlog** | ❌ (in-app) | 0 | 친구 closed loop, viral 메커니즘 다름 |

→ **외부 viral 앱은 모두 URL/QR 안 넣음**. 우리 가설이 잘못 됐을 수도.

### 5-2. 가설 보강 — 왜 안 넣을까
1. **공유자 자존심 페널티**: "광고 같아 보임" → 공유율 ↓
2. **인스타 알고리즘 페널티**: 외부 link 유도 콘텐츠 도달률 ↓
3. **검색 마찰 의외로 작음**: 한국 18-24 여성은 "친구 공유 → DM 질문 → 도메인" 흐름 익숙 (MBTI 밈 메커니즘)

→ **URL/QR 추가는 conversion 약하게 올리고 reach 크게 깎을 수 있음**. 보류 결정.

### 5-3. 대신 가야 할 lever
1. storyCard 디자인을 "사진 hero + 앱은 슬쩍" 쪽으로 정리 (나만의 네컷 패턴)
2. vibeType을 더 catchy하게 (5/9 part2 §16 패턴 분석 활용)
3. "플더픽" 검색 자연 유도 (Search Console 연동)
4. 카톡 OG 카드 강화 (1:1 conversion 엔진)

### 5-4. 메타 학습 박제 (영구)
> **외부 viral 앱은 URL/QR을 안 넣는 게 표준**. 우리도 따름.
> "공유자 자존심 + 인스타 알고리즘 페널티 + 검색 마찰 작음" 3박자.
> **storyCard에 URL 추가 가설은 폐기**. 추가 lever는 디자인·vibeType·검색 유도.

---

## 6. Viral Direct Attribution 본질적 불가능 박제 ⭐⭐⭐

### 6-1. 진실
외부 SNS (인스타·카톡·X)를 거치는 순간:
- 인스타 알고리즘이 외부 link click 추적 의도적 차단 (privacy)
- 사용자가 캡션 텍스트로 도메인 언급해도 우린 모름
- 카톡 OG 카드 보고 도메인 외워서 검색해 들어오면 그냥 organic
- DM "이거 뭐야?" 질문도 referrer 안 잡힘

→ **direct attribution = sample 5% 미만 측정 가능 영역**. 95%는 본질적으로 unattributable.

### 6-2. 다른 앱들이 쓰는 5가지 간접 방법
1. **Cohort 비중 추적** — 광고 utm vs organic 비중 (우리 이미 채택)
2. **검색 키워드 추적** — Google/Naver Search Console (미설치)
3. **Survey** — "어떻게 알게 됐나요?" (1-2개월 1회)
4. **Hashtag 모니터링** — 인스타 #플더픽 등 manual check
5. **K-factor 추정** — 정밀도 낮음, 추세만

### 6-3. 우리 viral health metric 표준 (5/10 채택)
- KPI 1개: **organic 비중** (광고 외 신규 device 비율)
- 진단용: organic 절대값 추세 + 검색량 (Search Console 연동 후)
- ❌ direct K-factor에 매달리지 말 것

### 6-4. 메타 학습 박제 (영구)
> 외부 viral은 정밀 측정 못함을 인정하는 게 첫 단계. nytimes·tiktok·인스타 자체도 unattributable. 우리만의 한계 X.
> **"광고 비중·organic 추세·검색량 3개로 거친 추적 + storyCard 디자인은 친구가 공유하고 싶은 쪽으로 최적화" = viral 잘하는 모든 앱의 표준**.

---

## 7. KEY METRICS 재정의 (commit `fde7404`)

### 7-1. 변경 전 vs 후
| 슬롯 | 변경 전 | 변경 후 |
|---|---|---|
| 1 | 공유율 (URL only) | **viral 행동률 (URL ∪ 스토리)** |
| 2 | 1회차 저장율 | (유지) |
| 3 | 종합 듣기 만족도 | (유지) |
| 4 | K-factor | **organic 비중 (신규)** |

### 7-2. K-factor는 VIRAL LOOP로 강등
- 라벨: "K-factor" → **"URL K-factor (측정 가능)"**
- tooltip에 "인스타 viral 영원히 안 잡힘" 명시

### 7-3. CONVERSION 중복 제거
- "전체 공유율" 카드 제거 (KEY METRICS와 중복 명시되어 있던 카드)
- 3열 → 2열

### 7-4. 데이터 fetch 1줄 추가
- `analyze_logs.select` 에 `utm_source` 컬럼 추가 (organic 비중 계산)

---

## 8. VIRAL LOOP 섹션 확장 (commit `7fa33fc`)

### 8-1. 3 sub-section 재구조
```
🔗 URL 공유 viral (기존 5 카드 그대로)
📷 스토리 viral (신규 2 카드)
📈 유입 cohort 7일 추세 (신규 mini chart)
```

### 8-2. 신규 카드 2개 (어제 baseline 검증)
| 카드 | 임계값 | baseline (5/3-5/10) |
|---|---|---|
| 스토리 viral 시도율 | ≥15 / ≥10 | median 12% / range 6.7-24.6% |
| 스토리 viral 효율 | ≥60 / ≥40 | median 50% / range 30-77% |

### 8-3. Mini chart (옵션 X)
- 일별 신규 device 광고(meta paid) vs organic(utm null·ig·instagram) 누적 막대
- inline div bar (외부 의존성 0)
- 광고 변동에 안 흔들리는 organic 절대값 추세 + 비중% 동시 시각화

### 8-4. story_save_logs platform/os 거의 `web_unknown` 정상
- 웹앱 only 라이브 중, 앱 미출시 = 정상
- 환경별 분기 분석 의미 X (아직)

---

## 9. 임계값 13건 데이터 기반 재조정 (commit `c09a18e`)

### 9-1. 검증 plan — 3 batch (24개 임계값 중 22개 미검증)
- Batch 1: KEY 4 + CONV 2 + 분기 2 + RET 2 = 10
- Batch 2: VIRAL URL 5 + LISTEN 4 = 9
- Batch 3: PERF 4

### 9-2. 변경 13건 (Batch 1+2+3)

**🔴 우선순위 (5건 — green 0/14일 또는 도달 불가)**
| 카드 | 변경 |
|---|---|
| 종합 듣기 만족도 | 50/30 → **40/25** (median 32%) |
| 헤비 유저 | 5/1 → **3/1** + 표본 100 가드 (max 4.6%) |
| 이탈률 (역) | <50/<70 → **<55/<70** (median 55%) |
| D1 retention | 20/10 → **7/3** (max 7.6%) |
| D7 retention | 10/5 → **3/1** (max 2.9%) |

**🟡 중간 (8건)**
| 카드 | 변경 |
|---|---|
| URL K-factor | 0.1/0.05 → **0.05/0.02** (w2 0.022) |
| 외부 앱 듣기율 | 40/20 → **35/20** (median 32%) |
| iTunes 매칭률 | 95/90 → **90/85** (현재 87.5%) |
| 미리듣기 재생률 | 50/30 → **70/50** (5/3+ 70-81%) |
| 30초 완료율 | 60/40 → **35/25** (5/3+ 17-37%) |
| 응답 시간 | ≤8000/≤10000 → **≤11000/≤13000** (Claude API median 11s) |
| 30초+ 체류 | 40/20 → **25/15** (median 19%) |
| 10초- 이탈 (역) | <60/<80 → **<30/<45** (median 36%) |

### 9-3. 응답 시간 카드 sub 신규
- 기존: `N건 기준`
- 변경: `N건 기준 · 중앙값 N초 · 최대 N초` (avg outlier 영향 함께 보기)

### 9-4. 유지 (검증 정상) 11건
- KEY: viral 행동률 (15/5), 1회차 저장율 (10/5), organic 비중 (25/15)
- CONV: 분석 성공률, 전체 저장률
- VIRAL URL: unique 친구 도달, 자가 view, raw 조회, 공유당 유입
- VIRAL 스토리: 시도율, 효율
- PERF: 분석 실패율, 평균 체류 시간

### 9-5. 패턴 종합 — SaaS 표준 → 1회성 도구 reality
1. SaaS·SNS 임계값이 1회성 도구엔 안 맞음 (D1·D7·헤비유저·이탈률)
2. Claude API latency baseline 무시 (응답 시간)
3. 체류 시간 30초+ 너무 욕심 (median 19%)
4. 임계값이 너무 낮아 항상 green인 경우 (10초- 이탈, 미리듣기 재생률)

→ tooltip에 baseline 박제됨 (예: "5/10 임계값 50/30 → 40/25 (median 32%, green 0/14일)")

---

## 10. lifetime 재방문 비율 + 공유 Top 5 합집합 (commit `4b73394`)

### 10-1. lifetime 재방문 비율 카드 (RETENTION 섹션 신규)
- 분모: 14-30일 전 신규 device cohort
- 분자: first 이후 다른 날 재방문한 device
- baseline (17일치 cohort): **median 8%** / range 1.9-17.6%
- 임계값: ≥10 green / ≥5 yellow / <5 red, cohort 30명+ 시 색상

### 10-2. RETENTION 섹션 layout
```
[D1 리텐션]              [D7 리텐션]
[lifetime 재방문 비율]    [평균 재방문 간격]
```

### 10-3. 공유 Top 5 합집합 정정
- 기존: `filteredShares` (URL 공유 only)
- 변경: `filteredShares ∪ filteredStorySaves(shared·downloaded)`
- 카드 라벨: "↑ 가장 많이 공유된 곡 Top 5 **(URL ∪ 스토리)**"

### 10-4. 메타 학습 박제 (영구)
> **share 관련 metric 만들 때 기본으로 (URL ∪ 스토리) 합집합 검토 필수**.
> 5/3 스토리 도입 후 모든 share metric을 합집합으로 가야 정직.
> 같은 패턴 발견: KEY METRICS 공유율, 공유 Top 5 — 둘 다 정정 완료.

---

## 11. 의심 device 점검 (5/10 KST 20·22시) ⭐

### 11-1. 발견 device 3개
| device | 시간대 | 분석 | 곡 다양성 | viral 액션 |
|---|---|---|---|---|
| `0c02386d` | 22:19~22:32 (13분) | 12 | 12곡 모두 다름 | share completed 1 + story shared 1 |
| `0785faca` | 20:27~20:34 (7분) | 8 | 8곡 모두 다름 | 없음 |
| `0775e202` | 11:58~22:38 (10시간 분산) | 17 | 17곡 모두 다름 | share/story cancelled |

### 11-2. 봇 vs 헤비유저 판정
- 봇 신호 (4/19 사례): 1.7초에 6번, 같은 곡 반복, viral 액션 0
- 오늘 3 device: 분당 0.83-1.19회, 곡 다 다름, viral 액션 발생
- → **모두 진짜 컬렉터형 헤비유저**, 차단 X

### 11-3. 박제 사례
1. **광고 막 들어와 사진 12장 시도 → share+story** (0c02386d) — 추천 만족 후 viral
2. **하루 종일 retention 사례** (0775e202) — 6세션 분산, 17곡 시도, 컬렉터형 power user

### 11-4. 운영 룰 박제 (영구)
> **분당 1회 페이스 + 곡 다양 + viral 액션 발생 = 컬렉터형 헤비유저, 차단 X**.
> **봇 신호: (a) 1초 미만 간격, (b) 같은 곡 반복, (c) viral 액션 0, (d) UA 비표준 — 복합 조건일 때만 봇으로 판정**.

---

## 12. 유입 경로 데이터 박제 (도입 후 7d, 외부)

### 12-1. 신규 device utm 분포 (5/3-5/10)
| source | 신규 device | 비중 |
|---|---|---|
| meta paid 합 | 266 | **78.0%** |
| ├ 플더픽 영상광고_트래픽 | 147 | 43.1% |
| ├ traffic_video_main | 109 | 32.0% |
| └ `{{campaign.name}}` ⚠️ | 10 | 2.9% |
| organic 합 | 61 | **17.9%** |
| ├ (null) direct | 45 | 13.2% |
| ├ ig/instagram social | 14 | 4.1% |
| └ ig "carousel_hook_v1" | 2 | 0.6% |

### 12-2. 도입 전 vs 후 비교
| | 도입 전 7d | 도입 후 7d | 변화 |
|---|---|---|---|
| 총 신규 device | 310 | 341 | +10% |
| meta paid | 235 (76.0%) | 266 (78.0%) | +13% |
| (null) direct | 46 (14.9%) | 45 (13.2%) | -2% |
| **ig/instagram organic** | 29 (9.4%) | 16 (4.7%) | **-45%** 🚨 |

→ story 도입 후 신규 +10%는 거의 전부 광고. organic 비중 24.2%→17.9%로 하락. ig/instagram referrer -45% 폭감 (try_click -44%와 일치).

### 12-3. 부수 발견 — Meta 광고 utm 설정 오류
- `{{campaign.name}}` 변수 미치환 10건
- ig vs instagram utm_source 표기 불일치
- ig "carousel_hook_v1" utm_medium=paid (organic 분류 실수 가능)

→ Meta Ads Manager 캠페인 utm 설정 점검 필요 (별도 작업)

---

## 13. 코드 변경 파일 박제 (commit별)

### 13-1. `src/app/admin/page.tsx` 4 commit
- **fde7404**: KEY METRICS 재정의 + utm_source fetch + organic 비중 계산
- **7fa33fc**: VIRAL LOOP 3 sub-section + 스토리 카드 2 + cohort mini chart
- **c09a18e**: 임계값 13건 + 응답시간 중앙값/최대
- **4b73394**: lifetime retention + topSharedSongs 합집합

### 13-2. DB 변경
- migration_014 (analysis_results) — 5/10 15:20 KST에야 적용 (88건 손실)

---

## 14. 다음 우선순위

### 🔴 즉시 모니터링 (5/10~5/16)
1. **viral 행동률 + organic 비중 추세** (KEY METRICS 신규 KPI 검증)
2. **lifetime 재방문 비율 추세** (1주 후 재측정)
3. **추천 알고리즘 효과 7d 누적** (Blue Hour ?, top max ?)
4. analysis_results 데이터 누적 시작 (오늘부터)

### 🟡 이번 주 작업
5. **분석 성공률 정의 재진단** ⭐ (start status 거의 안 박힘 — admin code의 analyzeUsers 재정의)
6. **Search Console 연동** ⭐⭐ (organic 신호 보강, 1시간 + 1주 누적)
7. **storyCard 디자인 정리** ⭐⭐ (사진 hero, vibeType 강조 — 나만의 네컷 패턴)
8. **vibe archive 페이지 spec** ⭐⭐⭐ (5/9 part2 백로그)

### 🔵 백로그
- Meta 광고 utm 설정 정리 (`{{campaign.name}}` 미치환 + ig 표기 통일)
- rnb pool 다이어트 (5/9 part2 백로그, engagement 3.4% 정당화)
- vibeType prompt 가이드 강화 (5/9 part2 §16 패턴)
- iOS 앱 Apple Developer 가입

---

## 15. 다음 세션 시작 멘트 후보

```
"5/16 추천 알고리즘 7d 효과 측정 + viral 행동률·organic 비중 추세 점검"
```
또는
```
"분석 성공률 정의 재진단 — start status 거의 안 박히는 이유 + admin analyzeUsers 재정의"
```
또는
```
"Search Console + Naver Search Advisor 연동 — '플더픽' 검색량 추적 시작"
```
또는
```
"storyCard 디자인 정리 — 사진 hero + 앱은 슬쩍 (나만의 네컷 패턴)"
```
또는
```
"vibe archive 페이지 spec 작성 — 4명 power user + lifetime 8% 검증 데이터 기반"
```

---

## 16. 박제 메타 학습 (5/10에서 배운 것)

1. **commit ≠ migration applied** — Supabase migration 파일 commit 후 별도 apply 단계 필수. 5/9 a8ac0e8 88건 손실 사례.
2. **외부 viral 앱은 URL/QR 안 넣는 게 표준** — 나만의 네컷·setlog 검증. 공유자 자존심 + 인스타 알고리즘 페널티 + 검색 마찰 작음.
3. **viral direct attribution 본질적 불가능** — 95% unattributable. cohort 측정 (organic 비중)으로 대체 표준.
4. **SaaS·SNS 임계값 ≠ 1회성 도구 reality** — D1·D7·헤비유저·이탈률 모두 데이터 기반 정정. tooltip에 baseline 박제로 다음 사람도 근거 알 수 있게.
5. **share metric은 (URL ∪ 스토리) 합집합 표준** — 5/3 스토리 도입 후 share 관련 모든 metric에 기본 적용. KEY 공유율·공유 Top 5 정정.
6. **lifetime retention이 1회성 도구의 진짜 retention** — D1·D7는 유지하되 lifetime이 진짜 신호. baseline 8%.
7. **봇 vs 헤비유저 운영 룰** — 분당 1회·곡 다양·viral 액션 = 헤비유저. 봇은 (a) 1초 미만 간격, (b) 같은 곡 반복, (c) viral 액션 0, (d) UA 비표준 복합 조건.
8. **Claude API latency baseline = 11s** — 응답시간 임계값 8s green은 도달 불가. baseline 반영 11s/13s로 정정.
9. **응답시간 표시는 avg + median + max 3개 함께** — avg는 outlier에 흔들림. median 안정.

---

## 17. 영구 박제 가치 항목 (PROJECT_KNOWLEDGE.md 이전 검토)

다음 메타 학습은 다음 세션·다른 사람한테도 영구 가치 있어 PROJECT_KNOWLEDGE.md 이전 검토:
1. **viral direct attribution 불가능 + cohort 측정 표준** (§6)
2. **외부 viral 앱 URL/QR 정책** (§5)
3. **commit ≠ migration applied 체크리스트** (§3)
4. **봇 vs 헤비유저 운영 룰** (§11)
5. **share metric (URL ∪ 스토리) 합집합 표준** (§10)

별도 핸드오프 작업으로 PROJECT_KNOWLEDGE.md 업데이트 (다음 세션).

---

## 18. 5/10 commit 5개 (전체)

| commit | 변경 |
|---|---|
| `fde7404` | KEY METRICS 재정의 (viral 행동률 + organic 비중) |
| `7fa33fc` | VIRAL LOOP 확장 (스토리 viral 카드 2 + cohort mini chart) |
| `c09a18e` | 임계값 13건 재조정 + 응답시간 중앙값/최대 |
| `4b73394` | lifetime 재방문 + 공유 Top 5 합집합 |
| (DB) | analysis_results migration_014 적용 (오전, 사용자 직접 실행) |

→ 전체 작업: code 1 file (admin/page.tsx 4회 수정) + DB migration 1 + handoff 1
