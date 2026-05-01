# Session Handoff — 2026-05-01

> 다음 세션에서 즉시 컨텍스트 복원할 수 있도록 박제. 4월 마감 + 5월 KPI 합의 + 추천 시스템 동적 한도 도입까지.
> 이전 핸드오프: [SESSION_HANDOFF_2026-04-29.md](./SESSION_HANDOFF_2026-04-29.md)
> 영구 참조: [PROJECT_KNOWLEDGE.md](./PROJECT_KNOWLEDGE.md)

---

## 1. 오늘 한 줄 요약

**4월 회고 + 5월 KPI 합의(공유율 12% / CAC ₩300) + 추천 시스템 동적 한도 K=max(30,min(50,P×0.5)) production 배포**

배포 commit: **5개**
누적 외부 유저: **505명** (4월 마감) / 외부 런칭 17일차

---

## 2. 오늘 commit 흐름 (총 5개)

```
8a28641: perf(recommend): 후보곡 동적 한도 K = max(30, min(50, P × 0.5)) ⭐
83c47d7: chore(rate-limit): 시간당 분석 한도 15 → 20 완화
bdda2a3: docs: PROJECT_KNOWLEDGE.md 추가 (비즈니스/광고/viral 통합 박제) ⭐
98798c0: perf(admin): textarea 입력 지연 + 매초 리렌더 격리
51c940d: docs/ 정본화 — 4/26~4/29 핸드오프 + PLAYBOOK 통합 (4/30 작업)
```

---

## 3. 동업자 회의 + 5월 KPI 합의 ⭐

### 3-1. 회의 자료 PPT 16장 구조 확정

PPT 텍스트 버전은 동업자 공유 완료. 4부 구성:

```
[1부 컨텍스트]   1. 표지 / 2. 플더픽이란(4컷) / 3. viral 4개 사례 / 4. 16일 타임라인
[2부 4월 성과]   5. Stage 3.5 / 6. Funnel / 7. 일별 추세+CAC / 8. 광고 효율 / 9. 비용 ₩576k
[3부 진단]      10. 웹앱 벤치마크 / 11. 이커머스↔toy 지표 번역 / 12. SWOT / 13. 5월 전략
[4부 의사결정]  14. KPI 보드+운영 분배 / 15. 전문가 의견 / 16. 결론
```

회의 자료 작업 자료 위치:
- `/Users/pcy_mac/Downloads/play_the_picture_april_report.pptx` (Session 1 4장)
- 텍스트 버전은 회의 후 노션에 박제됨

### 3-2. 5월 KPI 합의 (심플 2개 + 결과 추적)

**중요한 결정:**
- ❌ **D1 retention 5% 목표는 비현실적** — 다른 서비스 재구매율 2.3% 수준, 웹앱 한계
- ❌ **활성 유저 수는 KPI 제외** — 변수 합산 결과 metric, 결과 추적용으로만
- ✅ **공유율 + CAC 듀얼 KPI** 채택

```
[Primary KPI] 공유율  6.3% → 12% (2배)
[Guardrail]   CAC    ₩398 → ₩300

[결과 추적 (자동 따라옴)]
- 누적 외부 신규: 505 → 1,500+
- 일평균 활동 유저: 33 → 60~80 (현실안) or 100 (도전안)
- K-factor: 0.006 → 0.03+
```

**의사결정 트리거:**
| 조건 | 액션 |
|---|---|
| 공유율 < 8% | 광고 예산 동결, 제품 작업 100% 집중 |
| 공유율 12% + CAC < ₩400 | 6월 수익화 prep 시작 |
| CAC > ₩500 | 캠페인 즉시 OFF, 소재 재제작 |

### 3-3. 5월 광고 운영 합의

**검증된 발견 (4/27~5/1, 정정된 utm 매핑 후):**
| 광고 세트 | LPV→분석 | CAC | 듣기 | 저장 | 공유 |
|---|---|---|---|---|---|
| **mbti_25-34_f** | **53.8%** ⭐ | **₩437** ⭐ | 39.1% | 11.6% | 10.1% |
| mbti_18-24_f | 47.3% | ₩587 | 28.2% | 7.7% | 7.7% |
| gacha_18-24_f | 19.4% | ₩850 | — | — | — |

**핵심 정정**: 4월 누적 분석에선 *"25-34 CTR 높지만 CPM 비싸 LPV로는 18-24 효율"*이라고 결론 냈으나, **실제 분석 진행 + 저장·공유 행동 funnel 전체에서는 25-34가 모든 지표 30~50% 우위**.

**5월 광고 예산 ₩400k 한도 내 배분:**
- mbti_25-34: 일 ₩7,000 (₩210k/월) — 메인 채널
- mbti_18-24: 일 ₩4,000 (₩120k/월) — viral 발견 채널
- curiosity_25-34 1주 테스트: ₩28k (5월 2주차)
- picnic utm 보강 후 1주 재테스트: ₩21k

**판단:**
- ❌ gacha 25-34 재테스트 비추천 (컨셉 미스매치, 가챠 문화 + 25-34)
- ✅ curiosity 25-34 권장 (18-24 39% → 25-34 추정 45%)
- ✅ picnic은 utm 보강 후 재평가 (LPV ₩60 잠재력 확인)

### 3-4. UTM 추적 인프라 보강 (5월 1주차)

**4월 발견 이슈:**
- `{{campaign.name}}` placeholder 미치환 8명 (광고 설정 오류)
- utm null 27명 (18%, 추적 누락)
- utm_campaign이 광고 세트 이름이 아닌 상위 캠페인 이름으로 들어감 → 18-24 vs 25-34 분리 추적 불가

**5월 액션 (Meta 광고 매니저):**
```
[현재]
utm_campaign = traffic_video_main
utm_content  = video_mbti_v1

[권고]
utm_campaign = {{adset.name}}    ← mbti_18-24_f_260423
utm_content  = {{ad.name}}       ← 광고 이름·소재 버전
```

→ 5월 데이터부터 광고 세트별·연령별 정확한 ROI 추적 가능.

---

## 4. 추천 시스템 동적 한도 도입 ⭐ (배포 완료)

### 4-1. 변경 내용 (commit 8a28641)

**기존**: 후보 곡 30곡 고정 상한
**변경**: `K = max(30, min(50, ceil(P × 0.5)))`

```ts
// 풀 30곡 미만: 풀 그대로
// 풀 30~60곡: 30곡 (하한, 다양성 보장)
// 풀 60~100곡: 풀의 50% (곡당 노출 50% 보장)
// 풀 100곡 이상: 50곡 cap (Claude reasoning 부담 방지)
const dynamicLimit = Math.max(30, Math.min(50, Math.ceil(filteredCandidates.length * 0.5)));

if (isDiscover) {
  const perGenre = Math.ceil(dynamicLimit / 6);
  finalCandidates = balancedSample(filteredCandidates, perGenre).slice(0, dynamicLimit);
} else if (filteredCandidates.length > dynamicLimit) {
  finalCandidates = shuffleAndSlice(filteredCandidates, dynamicLimit);
}
```

### 4-2. 로컬 5건 검증 결과

| 시나리오 | 풀 P | K | Claude 시간 | 비용 |
|---|---|---|---|---|
| discover/e=1 | 908 | 50 | 7.83초 | $0.021 |
| indie/e=1 | 84 | 42 | 5.98초 | $0.020 |
| kpop/e=3 | 68 | 34 | 6.77초 | $0.020 |
| kpop/e=4 | 56 | 30 | 7.14초 | $0.019 |
| indie/e=2 | 171 | 50 | 6.98초 | $0.020 |

→ 평균 7.0초 (4월 평균 범위), outlier 0건, viral 친화 곡(이진아) 보존.

### 4-3. DB 풀 분포 영향도

50곡 이상 풀 12개 조합 (4월 분석의 ~52% 차지):
- indie e=2 (180), rnb e=2 (111), indie e=3 (95), rnb e=3 (89)
- kpop e=3 (86), hiphop e=3 (85), indie e=1 (84)
- hiphop e=4·e=2 (64), kpop e=4 (60), kpop e=2 (56)
- acoustic_jazz e=2 (50)

→ 이 조합들에서 다양성 +55%, viral 친화 (indie e=2/e=3 + kpop e=2/e=3) 모두 포함.

### 4-4. 1주 모니터링 SQL

```sql
WITH known AS (...)
SELECT
  CASE WHEN created_at < timestamptz '2026-05-01 00:00:00+09' THEN '4월 (30곡)' ELSE '5월 (동적)' END AS period,
  count(*) AS analyses,
  round(avg(perf_claude_ms))::int AS avg_claude_ms,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY perf_claude_ms))::int AS p50,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY perf_claude_ms))::int AS p90,
  count(*) FILTER (WHERE perf_claude_ms > 15000) AS outliers_15s
FROM analyze_logs
WHERE status = 'success'
  AND device_id NOT IN (SELECT device_id FROM known)
  AND created_at >= timestamptz '2026-04-25 00:00:00+09'
GROUP BY period;
```

**판단 기준 (1주 후):**
- ✅ p50 ≤ 8초 / outlier <2% → 유지
- 🟡 p50 8~10초 / outlier 2~5% → 상한 50 → 40 조정
- 🔴 p50 >10초 / outlier >5% → 롤백 (`git checkout`)

---

## 5. 다른 배포 변경

### 5-1. rate_limit 완화 (commit 83c47d7)

**변경**: `perHour: 15 → 20`

**근거**: 4월 device_rate_limit 6건 모두 시간당 한도에서만 발동, 차단된 3 device 모두 광고 유입 정상 헤비유저(13~19분간 14~15회 시도). 광고 CAC ₩400 × 2 매몰 발생.

**유지**: 분당 5 (봇 방어), 일당 50 (극단 abuse 차단)

### 5-2. admin 입력 지연 해결 (commit 98798c0)

**변경**:
- `ImportTextSection.tsx` 신규 분리 + React.memo
- `SpotifyCountdown` 컴포넌트로 useCountdown 격리
- page.tsx 1,713줄 → 1,540줄

**효과**: textarea 키 입력마다 1,700줄 차트·표 리렌더되던 문제 해결.

### 5-3. PROJECT_KNOWLEDGE.md 신규 (commit bdda2a3)

비즈니스 컨텍스트 / 의사결정 히스토리 M1~M6 / 광고·viral 노하우 / 5월 목표 / 외부 API 정책 통합 박제. 다음 세션에서 즉시 컨텍스트 복원 가능.

---

## 6. 곡 DB 정리 작업

### 6-1. 4/30 삭제 12곡 (Supabase Dashboard에서 직접 실행)

```
Joy of the moment — Hanbatang
야경 — TOUCHED
spring days·Spring Is You — 한올
산책 — GongGongGoo009
산책 — 모트
GANADARA — 박재범
밤 끝없는 밤 — AKMU
moonlight — Dhruv
Summer Is for Falling in Love — Sarah Kang
comethru — Jeremy Zucker
Come Back to Earth — Mac Miller
Regent's Park — Bruno Major (추가 삭제)
```

→ DB 1,365 → 1,353곡

### 6-2. 4/30 신규 9곡 + 장르 보정 5곡

**추가**:
- 백예린: Rest, Datoom, Bunny, 물고기 (rnb→indie 보정)
- SUMIN, Slom: 곤란한 노래, 텅 빈 밤 (rnb 유지)
- NewJeans: Bubble Gum (kpop e=3)
- KiiiKiii: UNDERDOGS (hiphop→kpop 보정), I DO ME (중복)

→ DB 약 1,361곡

### 6-3. K-pop e=1 풀 보강 권고 (5월 작업)

**현재 상태**: kpop e=1 = 1곡 (밤 끝없는 밤 삭제 후)

**보강 후보 (메가히트 회피, 18-24 코어)**:
```
헤어지자 말해요 - 박재정
거리에서 - 성시경
너의 모든 순간 - 성시경
사랑은 늘 도망가 - 임영웅
내가 사랑했던 모든 것들에게 - 김필
그날에 - 적재
시간이 흐른 뒤 - 김연우
Cool With You - NewJeans
ASAP - NewJeans
봄, 사랑, 벚꽃 말고 - 에일리
```

---

## 7. 다음 세션 우선순위

### 🥇 Tier 1 — 5월 1주차 핵심 (KPI 직격)

1. **카톡 share intent 디버깅** — Silent share 62% 분쇄 (5월 KPI 핵심)
   - 4월 외부 공유 4건 중 3건이 view 0 = 카톡 share intent 미작동 의심
   - 브라우저별 (카톡 인앱 vs 사파리 vs 크롬) 동작 검증
2. **Meta UTM 매크로 정리** — `{{adset.name}}` 박기 (광고 ROI 측정 정확화)
3. **K-pop e=1 풀 보강** — 위 10곡 추가 (admin/import-text 페이지 활용)

### 🥈 Tier 2 — 5월 2주차

4. **curiosity 25-34 1주 테스트** (₩28k) — LPV→분석 45% 검증
5. **picnic utm 보강 후 재테스트** (₩21k) — LPV ₩60 잠재력 검증
6. **explicit 정책 옵션 C 적용** (PROJECT_KNOWLEDGE 8-9 / METRICS_PLAYBOOK 8-9)
   - iTunes trackExplicitness 기준 미리듣기 차단 (preview_url=NULL)
   - 기존 67곡 일괄 처리

### 🥉 Tier 3 — 5월 후반 또는 6월

7. **PWA install + Web Push** — D1 retention 작업 (회의에서는 5% 비현실 결론, 그래도 web push는 시도 가치 있음)
8. **시즌 vibeType 풀 추가** — 가정의 달, 어린이날, 봄 끝 톤
9. **Last.fm API 사전 준비** — 상업적 사용 동의 메일 발송 (10분, 무료) → 6월 도입 검토 시 즉시 가능

---

## 8. 다음 세션 시작 멘트 후보

```
"카톡 share intent 디버깅으로 Silent 62% 분쇄"
```

또는

```
"Meta UTM 매크로 정리 + K-pop e=1 풀 보강"
```

또는

```
"5월 1주차 데이터로 동적 한도(50/30) 효과 검증"
```

상황에 따라 셋 중 하나로 시작.

---

## 9. 미해결 이슈 / 보류 항목

### 9-1. explicit 정책 옵션 C (4/29부터 보류)

PROJECT_KNOWLEDGE.md 8-9에 박제. iTunes trackExplicitness 기준 미리듣기만 차단 (곡 추천은 그대로). 5월 1주차 작업으로.

### 9-2. 추천 정확도 향상 — 6월 검토

- ❌ Spotify Audio Features: 신규 앱 차단 (2024-11)
- ❌ Apple Music API mood: 비공개 (Apple secret sauce)
- 🟡 **Last.fm + Genius + Claude 정형화**: 6월 검토
  - 5월에 partners@last.fm 동의 메일만 보내두기
  - 한국 마이너 인디 커버리지 30~50%가 한계

### 9-3. 분석 응답 시간 outlier

- 4/27 산책-모트 21.9초 케이스: discover + e=1 + 잔잔한 사진 조합
- 빈도 1% (월 4건) — 5월 KPI 우선순위 낮음
- 클라이언트 timeout(30초) + "잠시만요" 토스트 정도만 5월 후반에 보강

### 9-4. recommendation_logs 7일 ban 정확도

- 4월 누적 4차 fallback (이력 무시) 발동 빈도 모니터링 필요
- 헤비유저 (4/18 새벽 33회 / 46분) 패턴에서 ban 풀 부족 가능성

### 9-5. 곡 풀 편애 추가 정리 후보 (5월 후반)

**4회+ 추천 + entries 0 곡 38개 잔여** (12개 정리 후):
- Dhruv airplane thoughts (저장 1, 유지)
- 페퍼톤스 행운을 빌어요 (공유 1, 유지)
- 그 외 36곡 — 5월 데이터 누적 후 재평가

---

## 10. 어제 핸드오프와의 차이 요약

[2026-04-29 → 2026-05-01]

```
- 외부 신규: 505명 (4월 마감 박제)
- 비용: ₩576k (Claude Max 280 / Meta 광고 200 / API 62 / 기타 33)
- 4월 viral hit: 3 entries (셀카장인 13v·9u·2c / 브이요정 7v·2u·3c / 벚꽃수집가 11v·10u·2c)
- 동업자 회의 완료, 5월 KPI 합의 (공유율 12% / CAC ₩300)
- 추천 시스템 동적 한도 production 배포 (8a28641)
- rate_limit 시간당 15→20 완화 (83c47d7)
- admin 입력 지연 해결 (98798c0)
- PROJECT_KNOWLEDGE.md 신규 (bdda2a3)
- 곡 DB 정리: 12곡 삭제 + 9곡 추가 + 5곡 장르 보정
- 추천 정확도 향상 옵션 검증: Spotify·Apple·Last.fm 모두 한계 발견 → 6월 재검토
```

---

## 11. 운영 데이터 박제

### 11-1. 광고 캠페인 utm_campaign 정확 매핑 (5/1 기준)

| utm_campaign | 광고 세트 | 연령 | 비고 |
|---|---|---|---|
| 플더픽 영상광고_트래픽 | mbti_18-24_f_260423 | 18-24 | 한글 캠페인명 |
| traffic_video_main + video_mbti_v1 | mbti_25-34_f_260426 | 25-34 | 영문 캠페인명 |
| traffic_video_main + video_gacha_v1 | gacha_18-24_f_260423 | 18-24 | 1일만 운영 (4/27) |
| traffic_video_main + video_curiosity_v1 | (curiosity 영상) | 18-24 | 4/25 1일 |
| carousel_hook_v1 | 캐러셀 (curiosity 변형) | 18-24 | 4/19~28 |
| {{campaign.name}} ⚠️ | placeholder 미치환 | — | 광고 설정 오류 |

### 11-2. 4월 viral 패턴 (저장형 vs 공유형)

PROJECT_KNOWLEDGE.md §6에 박제. 5월 vibeType 프롬프트 강화 시 활용.

```
저장 발생 = 정체성형:
  ~제조기, ~설계자, ~과몰입러, ~수호자, ~욕심쟁이, ~히로인, ~덕후

공유만 발생 = 풍경 관찰형 (저장 0):
  ~수집가, ~산책러, ~탐험가
```

### 11-3. discover에서 저장·공유까지 이어진 곡의 장르·에너지 분포 (4월)

```
indie     34.3% (24 entries) ← 1위
acoustic_jazz 25.7% (18) ← 2위 (Fairy Tale-한석규 viral)
kpop      22.9% (16)
pop        8.6% (6)
rnb        5.7% (4)
hiphop     5.7% (4)

에너지 e=2~3이 81.4% (viral 골든존)
```

→ 5월 곡 풀 보강 우선순위 (indie e=3, kpop e=2~3) 결정 근거.

---

## 12. 다음 세션 핵심 참조

| 작업 | 참조 파일 |
|---|---|
| 5월 KPI / 운영 분배 / 광고 전략 | PROJECT_KNOWLEDGE.md §7 |
| 광고 캠페인별 효율 | PROJECT_KNOWLEDGE.md §5 |
| viral 콘텐츠 패턴 | PROJECT_KNOWLEDGE.md §6 |
| 외부 API 정책 (Spotify/Apple/Last.fm) | PROJECT_KNOWLEDGE.md §10 + 본 문서 §9-2 |
| iTunes 매칭 인프라 | METRICS_PLAYBOOK.md §8 |
| 분석 SQL 패턴 | METRICS_PLAYBOOK.md §3 |
| 운영 원칙 / 에러 코드 | CLAUDE.md |
| 동적 한도 1주 모니터링 SQL | 본 문서 §4-4 |
| Meta UTM 매크로 정리 가이드 | 본 문서 §3-4 |
| K-pop e=1 풀 보강 후보 곡 | 본 문서 §6-3 |
| 카톡 share intent 가설 재정립 (저녁) | 본 문서 §13-7 |
| share_logs funnel status 도입 (저녁) | 본 문서 §13-8 |
| 1주 funnel 모니터링 SQL | 본 문서 §13-8 |
| 구글 Search Console 등록 완료 | 본 문서 §13-9 |
| admin 인증 서버 사이드 (오후) | 본 문서 §13-3 |
| robots/sitemap + 네이버 등록 (오후) | 본 문서 §13-4, §13-5 |

---

## 13. 5/1 오후 추가 진행 (같은 날 두 번째 세션)

오전 핸드오프 완료 후 오후에 추가로 7건 작업. commit 3개 더 배포.

### 13-1. 추천 시스템 검증 (공유/저장 145 entries 전수)

**정량 결과:**
- 장르 정확 매칭: 55/55 = 100% (discover 제외, 시스템적 보장)
- 에너지 ±1 이내 100% (정확 51%, off-by-1은 31% / 16% 비율로 *낮추는 방향* 우세 → 사진 차분함 반영, 부정적 X)
- discover 선택: 56% (72/128)
- viral 황금존 = `discover/e=3 → indie/e=2` (12건, 가장 흔한 mismatch이자 viral 친화)

**정성 발견:**
- vibe_type/description/reason 3종 일관성 양호 (17 viral hit 검토)
- 🔴 Issue 1: 4/26 잔디밭 사진 7건 중 4건이 동일 "잔디밭 점령러" → vibe_type 다양성 부족
- 🟡 Issue 2: reason 클리셰 "~의무입니다" / "~제목 자체가" 패턴 과다 노출
- 🟢 viral hit 평균 song_energy = 2.3 → e=2 골든존 재확인

**보류한 패치:**
device 기반 vibe_type 회피 패치 검토했으나 트레이드오프 분석 후 보류:
- 같은 device 재방문율 낮아 효과 측정 곤란
- 검증된 viral 톤 강제 회피 시 Claude가 어색한 변형 만들 위험
- 진짜 문제(서로 다른 device 비슷한 사진)는 사진 hash 인프라 필요

대안: reason 클리셰 회피 가이드를 시스템 프롬프트에 추가하는 게 더 안전 (5월 후반 검토)

### 13-2. Cool With You 곡명 SQL 정정

```
song: "**Cool With You -** NewJeans"  ← 마크다운 깨짐
artist: "NewJeans"                     ← 정상
```

4/30 admin/import-text 입력 시 마크다운 형식으로 들어가 song 컬럼만 깨짐.
Spotify 매칭은 정상(track_id 등 다 맞음). entries 0건 (다행히 유저 노출 X).

수정: songs row UPDATE + itunes_preview_cache 깨진 row DELETE (재시도 유도).
사용자가 Supabase Dashboard에서 직접 SQL 실행 (MCP read-only 모드).

**보너스 발견 (보류)**: "Ni**as In Paris" (Jay-Z & Kanye, 4/29 추가)도 같은 마크다운 깨짐 패턴. 사용자 요청으로 이번 세션엔 건드리지 않음.

### 13-3. admin 인증 서버 사이드 이전 ⭐ (commit 7836cb1)

**기존 취약점:**
- `NEXT_PUBLIC_ADMIN_PASSWORD`가 클라이언트 번들에 노출 (폴백 `coldboardp1!` 코드 박힘)
- `/api/admin/{import-text,log-rows,diag,spotify-status}` 4개 라우트 인증 자체 없음 → service_role_key가 외부에 그대로 열려 있던 상태
- import-text는 누구나 호출 가능 → DB 오염 + Spotify quota + Anthropic 비용 누설 가능

**구현:**
- `src/lib/admin-auth.ts` 신규 — Node crypto HMAC-SHA256 토큰 생성/검증 (의존성 0)
- `/api/admin/auth` 신규 — POST(로그인) / GET(세션 체크) / DELETE(로그아웃)
- 4개 admin 라우트에 `verifyAdminRequest` 가드 추가
- `/admin` 페이지 클라이언트 — 비번 상수 삭제, fetch로 서버 검증, 세션 자동 복원
- 쿠키: HttpOnly + SameSite=Strict + Production은 Secure, 7일 TTL
- timingSafeEqual로 비번 비교 (타이밍 공격 완화)

**환경변수:**
- 추가: `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` (.env.local + Vercel Production/Preview 모두)
- 폐기: `NEXT_PUBLIC_ADMIN_PASSWORD`
- 새 비번 본인 비번 매니저에 저장됨 ⚠️ 채팅에 평문으로 입력했으므로 **5월 말 한 번 더 회전 권장**

**검증:**
- 시크릿 창에서 비번 폼 → 로그인 성공 ✅
- 일반 창 → 자동 진입 (세션 복원 정상) ✅
- production 배포 후도 동일 동작 ✅

### 13-4. robots.ts + sitemap.ts (commit 38e2464)

Next.js 16 표준 `app/robots.ts` + `app/sitemap.ts` 생성:

**robots.txt:**
- User-agent `*` + `Yeti` 모두에 동일 disallow 적용
- Disallow: `/api/`, `/admin/`, `/share/`, `/result`, `/preference`, `/journal`
- → admin/api 봇 호출 차단 (비용 보호) + share 페이지 검색 노출 차단 (개인정보)

**sitemap.xml:**
- 메인 `/` 1개만 색인. 동적 라우트는 sitemap에서 제외 (404 리스크 회피)

**share 페이지 보안 점검 결과 (별도):**
- ✅ EXIF 자동 제거됨 (canvas 재인코딩 → 위치정보 노출 X)
- ✅ service_role_key는 클라이언트 번들에 노출 안 됨
- ✅ entries RLS 활성 + service_role 우회 패턴 OK
- 🟡 `/api/entries/[id]`에 rate limit 없음 (5월 후반 검토)
- 🟡 DELETE 라우트 device_id 위조 가능 (5월 후반 검토)
- 🟡 `/api/log-share-view, /log-try-click` 위조 가능 (광고 분석 노이즈)

### 13-5. 네이버 + 구글 검색엔진 등록

**네이버 (commit dc6a8c1로 메타태그 + 사용자 직접 작업):**
- `verification.other.naver-site-verification` 메타태그 추가 (`97385e9...`)
- 네이버 서치어드바이저 사이트 등록 ✅
- sitemap.xml 제출 ✅
- robots.txt 검증 "수집 가능" ✅
- 마지막 1단계: **요청 → 웹페이지 수집** (메인 색인 가속) ⏳ 사용자 직접

**구글 (DNS TXT 방식, 진행 중):**
- 호스팅케이알 DNS에 TXT 레코드 추가 완료
- `google-site-verification=eyT-5C_3Kqs45-vw4AAjLvA-WW23A4VmyNnHOrkwNi8`
- 로컬·8.8.8.8·1.1.1.1 모두 전파 확인 ✅
- 단 **Search Console 인증은 부정 캐시로 첫 시도 실패** → 30분~3시간 후 재시도 필요
- 다음 세션 시작 시 Search Console 재확인 → 인증 통과 → sitemap 제출

**효과 발현 시점:**
- 네이버: 1~4주 후 검색 결과 노출
- 구글: 이미 색인 중 (Search Console 등록은 키워드 데이터 수집용)

### 13-6. 외부 시스템 연결 상태 (5/1 오후 종료 시점)

| 시스템 | 상태 |
|---|---|
| Vercel `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` | ✅ Production + Preview |
| 네이버 서치어드바이저 사이트 등록 | ✅ |
| 네이버 sitemap 제출 | ✅ |
| 네이버 robots.txt 검증 | ✅ |
| 네이버 웹페이지 수집 요청 | ⏳ 사용자 작업 |
| 구글 Search Console 도메인 인증 | ⏳ 캐시 대기 (30분~3시간) |
| 구글 sitemap 제출 | ⏳ 인증 후 |

### 13-7. 카톡 share intent 가설 H1 ❌ 기각, H2 유력으로 재정립 ⭐

**최신 데이터 검증 (디버깅 정당화):**

| 지표 | 2026-04 | 2026-05 (1일치) |
|---|---|---|
| 공유 발생 entries | 84개 | 7개 |
| **외부 view 0 (Silent)** | **51개 (60.7%)** | **6개 (85.7%)** |
| 공유당 평균 외부 view | 1.39 | 0.86 |
| **median 외부 view** | **0** | 0 |

→ 4월 평균 1.39는 viral outlier 5건(8/10/11/13/17 view)이 끌어올린 수치.
**일반적 공유는 0~1명** (median=0). silent 비율 5월에 더 악화.

**코드 점검 결과 ([result/page.tsx:165-221](src/app/result/page.tsx:165)):**

```ts
1. saveEntry()
2. /api/log-share POST (share_logs INSERT) ← 클릭 즉시
3. /api/og?id=... fire-and-forget
4. navigator.share({ url }) ← Web Share API 단독 사용
5. fallback: clipboard.writeText
6. fallback fallback: URL 박스 노출
```

**카카오 SDK 도입 0%**, user-agent 분기 0%.

**1차 실기기 검증 (사용자 본인 iOS 카톡 인앱):**
- 카톡 인앱에서 메인 → 사진 분석 → 공유하기 → 시트 정상
- 카톡 친구에게 전송 → OG 카드 정상 도착 → 친구 클릭 시 share_views 정상 누적
- → **iOS는 navigator.share 정상 동작** → **H1 기각**

**가설 재정립 (5/1 저녁):**
| 가설 | 상태 |
|---|---|
| H1 (iOS 카톡 navigator.share 차단) | ❌ 기각 (실기기 검증) |
| H2 (share_logs overcounting) | 🔴 **유력** (코드상 confirmed) |
| H1' (Android 카톡만 차단) | ⏳ 미검증 |
| H3 (친구 측 트래킹 차단) | ❌ 기각 (`isAnalyticsEnabled()`은 빌드 시 환경변수만 체크 → production 항상 true) |
| H4 (친구가 카드 받고 클릭 안 함) | 🟡 가능 (viral 양극화 설명) |

**H2가 silent의 큰 부분일 가능성:**
- iOS 공유 시트는 카톡 외에 메시지·인스타·메일 등 다 노출
- 카톡 외 앱 선택 또는 취소 시: share_logs +1, share_views 0 → silent로 잡힘
- silent 60% 중 일부는 카운팅 룰 문제 (진짜 누수 아님)

**카카오 SDK는 보류.** 본인 iOS에서 정상 동작하므로 SDK 도입은 과잉 처방 가능. 5월 1주 funnel 데이터로 silent의 진짜 원인 확정 후 결정.

### 13-8. share_logs funnel status 도입 ⭐ (commit cbd0645)

**목적**: silent 60%의 진짜 원인 분해 측정 — overcounting(취소·다른 앱) vs 진짜 silent(친구 클릭 X) 분리.

**DB 변경 (사용자가 Supabase Dashboard에서 SQL 실행 완료):**
```sql
ALTER TABLE share_logs ADD COLUMN status text;
CREATE INDEX IF NOT EXISTS idx_share_logs_status ON share_logs(status);
```

**status 값:**
- `null` — 5/1 이전 legacy 데이터
- `clicked` — 공유 버튼 누름 (시작점)
- `completed` — `navigator.share` 성공
- `cancelled` — 시트 띄우고 취소 또는 다른 앱 선택 후 abort
- `fallback` — `navigator.share` 없거나 실패 → clipboard/URL 노출

**코드 변경:**
- `POST /api/log-share`: `status='clicked'`로 INSERT 후 row id 반환
- `PATCH /api/log-share/[id]` 신규: status 업데이트
- `result/page.tsx` `handleShare`:
  - POST는 await 없이 fire-and-forget (user activation 보존)
  - logIdPromise 받아두고 navigator.share 결과에 따라 fire-and-forget PATCH
  - 성공 → `completed`, abort → `cancelled`, fallback 진입 → `fallback`

**유저 체감 시간 영향: 0ms** — 모든 fetch fire-and-forget, await 추가된 곳 없음.

**검증 완료 (5/1 저녁):**
- 본인 iOS 카톡 인앱에서 시트 띄우고 취소 → DB row `status='cancelled'` 확인 ✅
- legacy row(배포 전 기록)는 `status=null`로 정상 분리 ✅

**1주 모니터링 SQL (5/8쯤 돌릴 것):**
```sql
SELECT
  status,
  count(*) AS rows,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM share_logs
WHERE created_at >= timestamptz '2026-05-01 12:00:00+09'
GROUP BY status
ORDER BY rows DESC;
```

**판단 기준:**
- 🟢 `completed` ≥ 60% → silent의 큰 부분이 overcounting이었음. 카카오 SDK 불필요. 카드 매력도 개선만으로 충분
- 🟡 `cancelled` 30~50% → 사용자가 카톡 외 앱 선택 또는 취소 多. 카톡 우선 노출 UI 또는 카카오 SDK 검토
- 🔴 `cancelled` ≥ 50% 또는 `fallback` 多 → 카톡 인앱에서 진짜 막히는 비율 큼. 카카오 SDK 도입

**funnel 추가 분석 (entry 기준):**
```sql
WITH funnel AS (
  SELECT
    entry_id,
    bool_or(status = 'completed') AS completed,
    bool_or(status = 'cancelled') AS cancelled,
    (SELECT count(*) FROM share_views svw WHERE svw.entry_id = sl.entry_id) AS views
  FROM share_logs sl
  WHERE created_at >= timestamptz '2026-05-01 12:00:00+09'
  GROUP BY entry_id
)
SELECT
  count(*) FILTER (WHERE completed AND views > 0) AS shared_and_viewed,
  count(*) FILTER (WHERE completed AND views = 0) AS shared_but_silent,
  count(*) FILTER (WHERE cancelled AND NOT completed) AS only_cancelled,
  count(*) AS total
FROM funnel;
```

### 13-9. 구글 Search Console 등록 ✅ 완료

DNS TXT(`google-site-verification=eyT-5C_3Kqs45-vw4AAjLvA-WW23A4VmyNnHOrkwNi8`) 첫 시도 시 부정 캐시로 실패했으나 5/1 저녁에 캐시 풀려 **인증 통과**.

**진행 상태:**
| 단계 | 상태 |
|---|---|
| DNS TXT 인증 | ✅ 통과 |
| 사이트 속성 등록 | ✅ |
| sitemap.xml 제출 | ✅ (재제출, 처음 "가져올 수 없음" → 재제출 후 처리 대기) |
| 메인 URL 색인 | ✅ 이미 색인됨 ("URL이 Google에 등록되어 있음") |

**다음 세션에서 확인할 것 (선택, 5분):**
1. Sitemaps 메뉴 → 상태가 "가져올 수 없음" → **"성공"** 으로 바뀌었는지
2. 실적 메뉴 → 검색어/노출수/CTR (1~2주 후 차오름)
3. 페이지 메뉴 → 색인된 페이지 목록

**바뀌지 않는 경우 (며칠 후에도 "가져올 수 없음"):**
- Sitemaps에서 행 삭제 후 재제출
- robots.txt 정상 응답 확인 (`curl https://playthepicture.com/sitemap.xml` 200 OK)

### 13-10. 5/1 종료 시점 우선순위 갱신

기존 §7 우선순위 → **재정립:**

🥇 Tier 1 (5월 1주차):
1. **5/8쯤 share funnel 1주 데이터 분석** ⭐ — silent 진짜 원인 확정
2. ~~카카오 SDK 도입~~ → **funnel 데이터 보고 결정** (지금 확정 X)
3. 네이버 웹페이지 수집 요청 (1분)
4. Meta UTM 매크로 정리 (그대로)
5. K-pop e=1 풀 보강 (그대로)

✅ 5/1 **완료된 작업:**
- 추천 시스템 검증 (장르 100%, 에너지 ±1, 클리셰 발견)
- Cool With You 곡명 SQL 정정
- admin 보안 패치 (commit 7836cb1)
- robots/sitemap + 네이버 등록 (commit 38e2464, dc6a8c1)
- share funnel status 도입 (commit cbd0645)
- **구글 Search Console 등록 + sitemap 제출 + 메인 색인 확인** ✅

⏳ **본인 미완 작업 (사용자 직접, 작은 것):**
- 네이버 웹페이지 수집 요청 (1분)
- Android 카톡 인앱에서 navigator.share 동작 검증 (H1' 확정용, 친구 폰 빌려서)
- (선택) 5/3쯤 구글 Sitemaps 상태가 "성공"으로 바뀌었는지 확인

### 13-11. 다음 세션 시작 멘트 후보

```
"5/8 share funnel 1주 데이터 — silent 진짜 원인 확정"
```

또는

```
"5월 1주차 광고 데이터로 동적 한도(50/30) + funnel + KPI 종합 점검"
```

또는

```
"Android 카톡 인앱 navigator.share 검증 + funnel 중간 점검"
```
