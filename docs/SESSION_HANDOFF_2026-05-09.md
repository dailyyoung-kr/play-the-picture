# Session Handoff — 2026-05-09

> 5/9 박제. **INTERNAL device 미제거로 4월~5월 viral baseline이 1/10 수준으로 부풀어 있었음 발견 + 정정**. 5월 KPI 합의의 "공유율 6.3% baseline" 실제로는 **0.63%**. handoff §10·§11 핵심 가설 다수 무효 또는 재검토. 5/4 "47% viral peak" 가설 완전 무효 (100% internal).
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-08.md](./SESSION_HANDOFF_2026-05-08.md)
> 영구 참조: [PROJECT_KNOWLEDGE.md](./PROJECT_KNOWLEDGE.md)

---

## 1. 한 줄 요약

**(1) 박제 정정**: 4월~5월 누적 share completed 45건 중 36건 (80%)이 INTERNAL_DEVICE_IDS 사용자 본인 테스트로 박제됨이 발견. 외부 진짜 공유율은 **0.63%**(6 device / 957 분석 device, 4/15~5/9 누적). handoff §3-3 "5/4 47% peak", §10 "Returning 50% share completed", §11 Satisfaction Score 등 internal 미제거 base 가설들 다수 무효 또는 재검토 필요.
**(2) 4-way OS×Age 매트릭스 발견**: 18-24 iOS가 product 단일 진짜 viral segment (story_save 도달률 69%, CAC ₩2,348). Android는 OS 자체가 viral 차단 (Age 무관 7-10%). 25-34 iOS도 45% story 도달로 valid.
**(3) 광고 액션 (5/9 적용)**: mbti_18-24·mbti_25-34 두 광고 세트 모두 노출 위치 **iOS only**로 변경 (광고 세트 수준 변경 = engagement 보존). 학습 단계 1주 변동성 모니터링 (5/16까지).
**(4) Power user 4명 발견** — 모두 외부, archive 수요 정량 검증 (save_arch 도달률 15.9%, 외부 152명).

---

## 2. 정정 발견 경위 박제

### 2-1. Trigger
- 5/9 conversation 중 5/8 분석 device 17명 검증 → power user 후보 `511e5a99` 확인 → 사용자 본인 검증 ("나 아니네") → 외부 D19 retain organic user 발견
- 추가 검증 중 5/8 viral funnel 수치에 INTERNAL 영향 의심 → 더블체크 → 5/4 share completed 20건 100% internal 발견 → 4월 전체 백트래킹

### 2-2. 검증 SQL 표준 (재발 방지)
**모든 viral funnel SQL에 INTERNAL exclude 적용 필수**:
```sql
WITH internal AS (
  SELECT unnest(ARRAY[
    'c9a5ac48-...', 'ffbfb9b2-...', ...20개...
  ]) AS device_id
)
-- 모든 share_logs / try_click / share_views / story_save_logs / preview_logs / listen_logs / save_logs 쿼리에:
WHERE device_id NOT IN (SELECT device_id FROM internal)
-- AND/OR 분리 카운트:
COUNT(*) FILTER (WHERE device_id IN (SELECT device_id FROM internal)) AS internal_n
```

→ **admin 대시보드는 "유저/테스트" 토글로 자동 분리**되지만 **수동 SQL 분석 시 internal 미제거 = 사용자 본인 테스트가 viral 수치로 잡힘**. 박제 핵심.

---

## 3. 4월~5월 누적 KPI 정정 (4/15~5/9, 25일)

### 3-1. INTERNAL 영향 종합

| 메트릭 | total | internal | **외부 (정정)** | internal 비중 |
|---|---|---|---|---|
| 분석 success device | 975 | 18 | **957** | 1.8% |
| share_completed events | 45 | **36** | **9** | **80%** 🚨🚨 |
| share_completed device | 12 | 6 | **6** | 50% |
| share_view total | 206 | 71 | **135** | 34% |
| **try_click total** | **38** | 11 | **27** | **29%** |
| story_save shared | 82 | 33 | **49** | 40% |
| save_arch total | 161 | 9 | **152** | 5.6% ✓ (거의 외부) |

### 3-2. 진짜 baseline KPI (외부 only)

| KPI | 핸드오프 박제값 | **정정값** | 영향 |
|---|---|---|---|
| 공유율 (share_compl device / analyze success device) | 6.3% | **0.63%** | **10× 부풀려짐** |
| try_click 도달률 | 추정 4-5% | **2.8%** (27/957) | -50% |
| K-factor (대략) | 0.006 | **~0.003** | -50% |
| save_arch 도달률 | 추정 — | **15.9%** (152/957) | 신규 박제 — archive 수요 강한 신호 |
| story_save shared 도달률 | 추정 — | **5.1%** (49/957) | 인스타 viral 채널 가동 |

**save_arch 비중**: 외부 user **957명 중 152명이 자발적으로 아카이브 보관** (15.9%) = **외부 share completed 0.63%의 25배**. archive 메커니즘이 이미 검증된 수요.

---

## 4. 5/4 "viral peak" 가설 — 완전 무효 박제 ⚠️

### 4-1. 정정 전 (handoff 5/7 part2 §3-3)
| 메트릭 | 5/4 박제값 |
|---|---|
| share_logs total | 36 |
| completed | 20 |
| fallback | 13 |
| cancelled | 3 |
| **성공 device → 공유** | **47%** ← "outlier-peak" 박제 |

### 4-2. 정정 후 (외부 only)
| 메트릭 | 5/4 외부 |
|---|---|
| share_logs total | 4 (12건 중 8건 internal) |
| **completed** | **0** (20건 모두 internal) 🚨 |
| fallback | 4 (5/4 외부 fallback 중 일부) |
| cancelled | 0 |
| **성공 device → 공유 completed** | **0%** |

→ **5/4 "47% viral peak" 가설 = 사용자 본인 테스트 박제**. 광고 viral 효과 0% 시점이었음.

### 4-3. 영향 받는 핸드오프 박제
- handoff 5/7 part2 §3-3: 5/4 47% baseline → 0%
- handoff 5/7 part2 §5: "5/4 viral 광고 효율 분석" → 무효
- handoff 5/1 §3-3: 4월 KPI 합의 baseline (공유율 6.3%) → **0.63%로 대체 필요**
- handoff 5/3 §3-2 viral chain 분석 → 일부 chain은 internal 가능 (재검증 필요)

---

## 5. handoff §10 "Returning 50% share completed" 가설 — 무효 박제 ⚠️

### 5-1. 원본 박제 (5/7 part2 §10)
> "Returning device-day 11%가 share completed 50%를 만들어냄 (7건/14건)"
> 7일 (4/30~5/6) 분석 결과

### 5-2. 외부 only 재계산
4/30~5/6 share completed:
| 일자 | total | internal | **외부** |
|---|---|---|---|
| 4/30~5/1 | 0 | 0 | 0 |
| 5/2 | 4 | 4 | **0** |
| 5/3 | 8 | 4 | **4** |
| 5/4 | 20 | 20 | **0** |
| 5/5 | 2 | 2 | **0** |
| 5/6 | 2 | 0 | **2** |
| **7일 합** | **36** | 30 | **6** |

→ 원본 14건 = 외부 6건 + internal 30건. 분모 자체가 부풀려짐.
→ **§10 "Returning 50%" 가설 = base 자체 무효**. 외부 6건만으로는 returning vs new 비교 표본 부족.

### 5-3. 영향 — 광고 vs Retention ROI 매트릭스 흔들림
handoff §10 박제: "광고비 ₩17,562/공유성공 vs Retention 0원" — 외부 share completed 6건만 보면 광고 1건당 비용 더 부풀려짐. **재계산 필요**.

---

## 6. §11 Satisfaction Score Framework — 재검토 박제 ⚠️

§11-2 segment별 score 계산에서 "공유 또는 저장 success +20점 modifier"가 사용됨. 외부 share completed가 30→6건으로 줄어들면:
- iOS_Insta new (38명, 80+ score 28명) — 80+ 비중 74%는 share success modifier 의존도 높음
- 외부 only로는 80+ score user 41명 → 추정 15-20명으로 축소
- "unknown new 290명 30.9점" 진단은 그대로 유효 (분석만 보고 떠나는 패턴은 internal 영향 X)

→ **§11-3 "score 80+ user는 product의 진짜 fan"** 가설은 valid. 단 절대 비중·인원수는 재계산.

---

## 7. 5/8·5/9 데이터 (외부 only, 정정 후)

### 7-1. 분석 funnel
| 메트릭 | 5/7 외부 | 5/8 외부 | 5/9 외부 |
|---|---|---|---|
| 분석 success device | 47 | 53 | 28 |
| preview played device | 31 | 41 | 24 |
| preview completed device | 5 | ~9 | 3 |
| listen_logs device | 12 | 12 | 8 |
| **share completed (외부)** | **0** | **3 events / 2 dev** | **0** |
| share_view (외부) | 4 | 2 | 0 |
| **try_click (외부)** | **0** | **0** | **0** |
| story_save shared (외부) | 9 dev | 16 dev | 8 dev |
| save_arch (외부) | 8 dev | **9 dev** | 1 dev |
| **분석 → 공유 률 (외부)** | 0% | **3.8%** | 0% |
| **분석 → 스토리저장 률 (외부)** | 19% | **30%** | 29% |
| **분석 → archive 률 (외부)** | 17% | **17%** | 4% |

### 7-2. 5/9 진행중 위험 신호
- 결과 페이지 체류 평균 5/8 58초 → 5/9 **15초 (-74%)** = 광고 fatigue로 들어온 user 깊이 안 봄
- preview played→completed 5/8 27% → 5/9 12% = 곡 호감도 하락
- viral chain 5/9 모두 0

### 7-3. 5/8 박제할 진짜 신호 (외부)
1. **save_arch 9 dev** = 분석 device 53명 중 17%가 자발적 archive — handoff §10 박제 "0.8% 신규 공유" 대비 **20배** 높은 행동
2. **story_save shared 16 dev** = 30% 도달률. 인스타 viral 채널 안정 가동
3. **listen_logs 12 dev** = 22% 외부 streaming 이동. 음악 발견 도구로 작동 중

---

## 8. 광고 운영 결정 (5/3~5/9 7일 CAC + 4-way OS×Age 매트릭스 종합)

### 8-1. 일별 빈도 vs 누적 빈도

| 광고 세트 | 운영 일수 | Daily 빈도 평균 | 누적 노출 추정 | **누적 빈도 추정** |
|---|---|---|---|---|
| mbti_18-24_f | 17일 | 1.04 | ~35,000+ | **~3.5회/user** |
| mbti_25-34_f | 13일 | 1.05 | ~25,000+ | **~3.0회/user** |

→ Daily 빈도 1.04 = **같은 날 중복 노출 4%**. 그러나 누적으로 평균 3.5회 노출. CTR 하락은 누적 빈도 fatigue 한계 도달 신호.

### 8-2. Retargeting 평가
- 5/8 광고 device 39명 중 **26% (10명)이 이전에도 광고로 진입** = retargeting 자연 byproduct
- 진정한 retargeting (custom audience) 캠페인 아님 — traffic 캠페인의 부수 효과
- **현재 retargeting은 긍정적 byproduct**. 의도적 retargeting 캠페인 추가는 권장 X (누적 빈도 4회 넘어가는 상황에서 fatigue 가속)

### 8-3. 7일 CAC 비교 (5/3~5/9, 외부 only) ⭐

#### 광고비 + Funnel device

| 항목 | mbti_18-24 | mbti_25-34 |
|---|---|---|
| **광고비 7일 합** | **₩51,663** | **₩59,755** |
| 분석 success device | 148 | 125 |
| preview played | 106 (72%) | 87 (70%) |
| listen | 52 (35%) | 40 (32%) |
| save_arch | 19 (13%) | 17 (14%) |
| story_save shared | **23 (16%)** | **7 (5.6%)** 🚨 |
| share completed | 1 | 0 |

#### Funnel 단계별 CAC 매트릭스

| 단계 | mbti_18-24 | mbti_25-34 | **18-24 우위** |
|---|---|---|---|
| 🟢 **분석 CAC** | **₩349** | ₩478 | **27% 효율** |
| listen CAC | ₩993 | ₩1,494 | 34% |
| save_arch CAC | ₩2,719 | ₩3,515 | 23% |
| 🔥 **story_save CAC** | **₩2,246** | ₩8,536 | **4× 효율** ⭐ |

**핵심 발견**: funnel 위쪽(preview·listen·save_arch) 도달률은 18-24와 25-34 거의 동일. 차이는 **story_save (인스타 viral)에서만 4배 격차**.

### 8-4. 4-way Age × OS 매트릭스 (5/3~5/9, matched device only) ⭐⭐

OS는 share_logs/share_views/story_save_logs의 user_agent에서 추출. analyze_logs는 UA 컬럼 없음 → matched device만 OS 분류 가능 (selection bias 명시).

#### 매핑 비율
| Age | analyze 외부 | OS 매핑 | unknown |
|---|---|---|---|
| 18-24 | 148 | 47 (32%) | 101 (68%) |
| 25-34 | 125 | 31 (25%) | 94 (75%) |

#### 4-way 매트릭스

| Segment | analyze | preview | listen | save | **story_save** | **story 도달률** |
|---|---|---|---|---|---|---|
| 🟢 **18-24 iOS** | 32 | 26 (81%) | 12 (38%) | 4 | **22** | **69%** ⭐⭐⭐ |
| 🟡 **25-34 iOS** | 11 | 6 (55%) | 4 (36%) | 0 | **5** | **45%** ⭐ |
| 🔴 **25-34 Android** | 20 | 18 (90%) | 8 (40%) | 5 | 2 | 10% |
| 🔴 **18-24 Android** | 15 | 11 (73%) | 5 (33%) | 6 | 1 | **7%** 🚨 |

#### 4-way CAC

| Segment | analyze CAC | story_save CAC |
|---|---|---|
| 🟢 **18-24 iOS** | ₩1,614 | **₩2,348** ⭐⭐⭐ |
| 🟡 25-34 iOS | ₩5,432 | ₩11,951 |
| 🔴 25-34 Android | ₩2,988 | ₩29,878 |
| 🔴 18-24 Android | ₩3,444 | **₩51,663** 🚨 |

**핵심 발견 5개**:
1. **18-24 iOS = product의 단일 진짜 viral segment**: story_save 도달률 69%, CAC ₩2,348 (단일 가장 효율적 channel). handoff 5/7 part2 §7-2 "iOS_Insta new = product native viral wedge" 검증 그대로
2. **Android는 OS 자체가 viral 차단**: Age 무관 7-10% (handoff §7-3 "Android webview navigator.share 차단" 직접 증거)
3. **25-34 iOS도 viral 작동**: 11 dev 중 5 (45%) story_save = Android 4-6배. **25-34 자체가 약한 게 아니라 Android 비중 큰 게 약점**
4. **funnel 위쪽 도달률은 OS 무관**: preview·listen·save_arch는 도달률 차이 작음. 음악 발견 도구 가치는 동등
5. **광고비 ROI 분배**: 18-24 광고비 ₩51,663 중 추정 iOS 33% ≈ ₩17,000이 viral의 거의 100%. Android·unknown 67% ≈ ₩35,000은 viral 0 → ROI 측면 33%만 생산적

→ **광고 segment fatigue 가설보다 OS targeting 한정이 더 큰 lever**. Android에 광고비 쓰는 게 진짜 비효율 source.

### 8-5. 액션 박제 — 5/9 광고 세트 둘 다 iOS only로 노출 변경 ⭐

#### 변경 내역
- **mbti_18-24_f_260423**: 노출 위치 모든 OS → **iOS only**
- **mbti_25-34_f_260426**: 노출 위치 모든 OS → **iOS only**
- 두 광고 세트 모두 광고(Ad) 자체는 변경 없음 (URL·카피·이미지 동일)

#### 변경 결정 근거
- 4-way 매트릭스로 **Android segment story_save 도달률 7~10%, CAC ₩30~52k** = 광고비 효율 산소호흡
- iOS segment만 한정하면 추정 광고비 33% → 100%가 viral 생산적 segment에 집중
- mbti_25-34 OFF 결정도 검토했으나, **25-34 iOS는 45% story_save 도달**으로 Android만 제거하면 살릴 가치 있음

#### Meta 광고 변경 시 engagement 보존 메커니즘 박제
| 변경 위치 | post_id | 좋아요·공유 | 학습 단계 |
|---|---|---|---|
| 광고(Ad) URL·카피·이미지 변경 | 새로 생성 | **🚨 리셋** | 재시작 |
| 광고 세트(Ad Set) 예산 ±20% 이내 | 유지 | 🟢 보존 | 유지 |
| **광고 세트 노출 위치(OS·placement) 변경** | **유지** | **🟢 보존** | **재시작 가능** |
| 광고 세트 타겟팅·입찰 큰 변경 | 유지 | 🟢 보존 | 재시작 |

→ **engagement는 안 잃지만 학습 단계는 1주일 변동성 ↑** 가능. 첫 3~7일 LPV비용·CTR 출렁임 모니터링 필수.

#### 변경 후 모니터링 항목 (5/10~5/16)
1. **LPV비용 추세** — 학습 단계 재시작 영향. 일별 출렁임 정상, 7일 평균이 변경 전보다 안 나빠지면 OK
2. **분석 device 일별** — 18-24 추정 1/3 (iOS) → 진입량 ↓ 가능. 단 quality ↑로 보상 예상
3. **story_save 도달률** — 변경 전 16% (18-24) / 5.6% (25-34) → 30%+ / 20%+ 로 ↑ 예상 (matched 비율 보정)
4. **누적 빈도 fatigue 가속** — iOS only로 도달 pool 줄면 누적 빈도 4회 빨리 도달 → 새 크리에이티브 출시 시점 빨라짐 (M1 작업)

### 8-6. 캠페인별 현재 상태 (5/10 시점)

| 광고 세트 | 상태 | 변경 | 다음 액션 |
|---|---|---|---|
| **mbti_18-24_f** | 🟢 active iOS only | 5/9 OS 한정 | 5/16까지 LPV비용 모니터링, 새 크리에이티브 prep |
| **mbti_25-34_f** | 🟡 active iOS only | 5/9 OS 한정 | 5/16까지 25-34 iOS 단독 효율 검증. 효율 부족 시 OFF |
| **curiosity_25-34_f** | inactive | — | M1.5 reactivate 검토 (mbti_25-34 backup) |
| picnic·gacha·curiosity_18-24 | inactive | — | OFF 유지 |
| {{adset.name}} 미치환 누적 33건 | — | — | Meta Ads Manager 점검 미해결 (handoff §12) |

### 8-7. iOS only 변경 후 다음 단계 옵션
- **A. 7일 데이터 후 둘 다 평가**: 18-24·25-34 iOS only 7일 누적 CAC 다시 비교 후 segment 결정
- **B. 학습 단계 안정화 1주 + 새 크리에이티브 A/B**: 누적 빈도 4회 넘은 상황 + iOS only로 pool 축소 = 새 크리에이티브 prep 시점 임박
- **C. Android user UX 분기 제품 작업**: Android는 광고로는 비효율 (story_save 7%) but 1인당 분석 시도 4.81 (iOS 6.74의 71%) 활동 자체는 강함. **광고로 데려오지 말고 organic으로 들어온 Android user를 archive·save 강화 UX로 retain**하는 별도 lever (M2 후보)

---

## 9. Power User 4명 발견 박제 ⭐

### 9-1. 진짜 외부 retain power user (D7+ retention + 3회+, internal 제외)

#### 🟢 Pure organic — 광고 0원 retained
| device | 첫 진입 | 마지막 | retention | 시도 | 행동 패턴 |
|---|---|---|---|---|---|
| **511e5a99** | 4/19 21:07 | 5/8 01:00 | **D19** | 8회 | preview 7, listen 2, share/save 0 |
| **fb08b555** | 4/24 18:32 | 5/4 17:14 | D10 | 7회 | preview 2, K-pop 팬덤 |
| **228d4e9f** | 4/28 20:28 | 5/5 22:38 | D7 | 3회 | preview 1, K-인디 |

#### 🌟 광고 진입 → retain (대표 1명)
| device | 첫 진입 | 마지막 | retention | 시도 | 진입 경로 |
|---|---|---|---|---|---|
| **e581fe07** | 4/17 organic + 4/24 ig bio | 5/1 | D14 / 7일 active | **35회** ⭐⭐ | preview 0, listen 12, share/save 0 |

### 9-2. 4명 공통 패턴 — "AI 음악 발견 도구" 세그먼트 검증
1. **UTM 없거나 instagram bio** = 광고 funnel 밖에서 retain
2. **곡 취향 매우 일관됨** (각자 다르지만 본인 안에서 vibe 통일)
3. **share·save·story·try_click 모두 0** = vibeType 콘텐츠로 사용 0
4. **preview vs listen 패턴**: 미리듣기 거의 안 누르고 외부 streaming으로 직행

→ **세그먼트 명확히 갈라짐**:
| 세그먼트 | 비중 | 진입 | 행동 |
|---|---|---|---|
| 🟡 **viral hook 세그먼트** | 광고 traffic 89% | 광고 mbti_18-24/25-34 | 분석 1번 → 70%가 떠남 |
| 🟢 **음악 발견 도구 세그먼트** | retain user 4명+ (유추 더 많음) | organic + ig bio | 분석 여러 번 → 곡 받기 → 외부 streaming |

### 9-3. 결정적 단서 — Last.fm 인사이트 검증
- e581fe07이 4/24 5건 모두 `utm_content = link_in_bio` = **인스타 계정 bio link로 진입**
- 이게 **invisible viral channel**의 정체. 도메인 외워서 들어온 것 아니고 인스타 계정 follow + bio link 클릭
- → **인스타 계정 콘텐츠 강화**가 검증된 organic acquisition channel

---

## 10. 다음 Lever 우선순위 재배치 (정정 후)

### 정정 전후 비교
| Lever | 정정 전 | **정정 후** | 근거 |
|---|---|---|---|
| **Vibe archive 페이지** | ⭐⭐ 1순위 | ⭐⭐⭐ **1순위 (유지)** | 152명 자발적 archive (4/15~5/9 누적) = 검증된 수요 |
| **Share 페이지 CTA 강화** | ⭐ 4순위 | ⭐⭐ **2순위로 승격** | 외부 viewer 누적 135명 / try_click 27 = 80% 누수 |
| **OG 카드 QR** | ⭐ 3순위 | ⭐⭐ 2순위 | archive와 병렬 작업 |
| **인스타 계정 콘텐츠 강화** | (미박제) | ⭐⭐ **신규 추가** | e581fe07 link_in_bio 5건 = invisible channel 검증 |
| share URL ref param | 4순위 | 3순위 | 추적 보강 |
| 단체 vibe hook | (별도 카테고리) | M2~M3 | viral coefficient 직접 lever |

### 1순위 — Vibe Archive 페이지 spec 권고
- 현재 `entries` 테이블에 사진·vibeType·곡 누적 중 (424 rows)
- `/archive` 페이지를 단순 목록 → **"내 vibe history"** 형태로:
  - 누적 vibeType 컬렉션 (캐릭터 카드 그리드)
  - 자주 나온 vibeType / 누적 곡 수 / 월별 무드 변화
  - 월말 **"이번 달 vibe wrap"** Wrapped-style 카드 자동 생성
  - export to Spotify/Apple Music 플레이리스트 (deep link)
- 데이터는 이미 있음. UI만 만들면 됨 = **1주일 내 작업 가능**
- 직격 lever: D7 retention 5.7% → 12%+

### 2순위 — Share 페이지 CTA 강화
- 외부 viewer 누적 135명 진입 / try_click 27건 = **80% 누수**
- "나도 해보기" CTA 위계·카피·sticky 전환 등 1차 A/B
- 표본 작아 단일 일자 판단 X — 1주일 누적 후 비교

### 2순위 (병렬) — OG 카드 QR
- handoff 5/7~5/8 박제: story_save 누적 49명, share_view 진입 추적 갭
- OG 이미지 우측 하단 QR — 인스타 스토리 viewer가 폰으로 카드 보면 QR로 진입 가능
- 1주일 작업

### 신규 — 인스타 계정 콘텐츠 강화
- 누적 link_in_bio 진입 검증 (e581fe07 + 잠재 user 더 있을 가능성)
- 인스타 콘텐츠 quality·빈도가 직접 user 획득 lever
- 비용 0원 (광고 외 channel)

---

## 11. 5월 KPI 재합의 권고

### 11-1. 정정 전 KPI (5/1 §3-2 박제)
```
[Primary] 공유율 6.3% → 12% (2배)
[Guardrail] CAC ₩398 → ₩300
```

### 11-2. 진짜 baseline (외부 only)
```
공유율 (share_compl) 0.63% — 1/10 수준
try_click 도달률 2.8%
save_arch 도달률 15.9% ⭐ — 진짜 viral 신호
story_save 도달률 5.1%
```

### 11-3. 권고 — KPI 재합의
- **Primary KPI 변경**: "공유율 12%" → **"save_arch 도달률 25%"** (현재 15.9% → 25%)
- **Secondary KPI 추가**: "외부 share completed device / 일" — 절대값 추적 (현재 일 평균 ~0.7건)
- **Guardrail 유지**: CAC < ₩500
- **Backup KPI**: D7 retention 5.7% → 10%+ (archive 효과 검증)

이유: 기존 KPI는 viral coefficient 가정이었으나 외부 데이터는 viral 거의 안 일어남. archive 행동이 실질 retention/engagement 신호 — Last.fm 후기 모델과 일치. 

---

## 12. 영향 받은 핸드오프 박제 — 정정 anchor 목록

| 핸드오프 | 섹션 | 영향 | 정정 |
|---|---|---|---|
| 5/1 (§3-2) | 5월 KPI 합의 — "공유율 6.3%" | base 부풀림 | **0.63%로 대체** |
| 5/1 (§3-2) | 누적 외부 user 505명 | analyze success 957 (정정 시점 4/15~5/9) | 정정 |
| 5/3 (§3-2) | 5/3 viral chain | 일부 chain internal 가능 | 재검증 필요 |
| 5/7 part2 (§3-3) | 5/4 47% peak / 5/5-6 6-7% normal | 5/4 = 0%, 5/5 = 0%, 5/6 = 2명 외부 | 무효 |
| 5/7 part2 (§5) | 5/4 viral 광고 효율 | 같은 base | 무효 |
| 5/7 part2 (§9-3) | New vs Returning 활동 | 외부 only로 재계산 필요 | 재계산 |
| 5/7 part2 (§10) | "Returning 50% share completed" | base 자체 무효 | 무효 |
| 5/7 part2 (§11) | Satisfaction Score 80+ user 41명 | 절대 비중 재계산 | 재계산 |

→ **이 핸드오프(5/9) 본문이 정정 source of truth**. 위 핸드오프 들은 history로 보존하되 5/9 anchor 참조.

---

## 13. INTERNAL 필터링 표준 박제 (재발 방지)

### 13-1. 표준 SQL 패턴
```sql
WITH internal AS (
  SELECT unnest(ARRAY[
    'c9a5ac48-842b-450c-9f55-843f9aad09d7',
    'ffbfb9b2-d60a-43a3-899d-51185fad652e',
    'd49b33dc-698b-4ebf-9c92-11fae75af78f',
    'f39f816f-6e76-4e19-8369-81df4349ef67',
    '4d0071d7-8f52-4564-b307-be03636bf853',
    '63f7de85-aa41-47fa-857e-a81f1447a658',
    'f33fc09e-01f0-4abf-8edd-208d37c4bd7a',
    '98e71f2a-e4ce-4296-9fec-b0f9a7af3d2f',
    '25a4f774-d724-4769-9897-4ab140a106ee',
    'd3d80439-c519-486a-840a-563d18c86696',
    '15cc7b32-6089-4f2c-ac2f-fb5837b59453',
    'c1904437-bf02-4970-9431-7361a0031ba8',
    '93038bf5-225f-4e22-8657-eaaa9ff304eb',
    'c59476c5-46e5-4bce-a8c0-21f2e3c4359f',
    '3093e413-489b-485c-8ca2-d4caa9385f96',
    'fca75eda-9f0a-44dc-855a-81038a2ebc2b',
    '90ad0567-e04b-4a7b-99a4-9353c592dd6f',
    '01c77837-2095-4953-bd89-5126a98c4f2d',
    '2d181638-aa4a-4969-9b50-591bce879243',
    '183e91c4-96af-4518-8e40-7bc4412e5a4c'
  ]) AS device_id
)
-- ... 본 쿼리에서 ...
WHERE device_id NOT IN (SELECT device_id FROM internal)
```

### 13-2. 적용 대상 테이블 (모두 INTERNAL 영향 가능)
- `analyze_logs` (낮음, 1.8%)
- `share_logs` ⚠️ (높음, 80%)
- `share_views` ⚠️ (34%)
- `try_click` ⚠️ (29%)
- `story_save_logs` ⚠️ (40%)
- `save_logs` (낮음, 5.6%)
- `preview_logs` (낮음, ~7%)
- `listen_logs` (매우 낮음, ~0%)

### 13-3. 운영 원칙 (CLAUDE.md 추가 후보)
- **수동 SQL 분석 시 INTERNAL exclude 표준 적용 필수**
- viral 카테고리(share·try·story)는 internal 비중 30~80%로 매우 큼
- 단일 일자 단순 카운트로 "viral peak"·"공유율" 결론 금지 — 외부 분리 필수
- handoff 박제 시 INTERNAL 필터링 적용 여부 명시 (예: `(외부)` 표기)

### 13-4. 자동화 권고 (M2 작업)
- Supabase function 또는 view: `external_share_logs`, `external_try_click` 등 internal 자동 제외 view 생성
- admin 대시보드: 이미 자동 분리 (장점). 수동 SQL이 위험 source

---

## 14. 다음 우선순위 (5/9 정정 후 + iOS only 변경 반영)

### ✅ 5/9 적용 완료
- **mbti_18-24·mbti_25-34 두 광고 세트 노출 위치 iOS only로 변경** (광고 세트 수준 = engagement 보존)

### 🔴 즉시 모니터링 (5/10~5/16, 1주)
1. **iOS only 변경 후 학습 단계 안정화 추적** — 일별 LPV비용 출렁임 정상, 7일 평균 ↑↓ 판단
2. **mbti_25-34 iOS 단독 효율 검증** — 25-34 iOS만 한정 시 segment 살릴지 OFF 결정 (5/16 D-Day)
3. **18-24 iOS pool 축소로 누적 빈도 4회 빨리 도달 가능** → 새 크리에이티브 prep 시점 임박
4. **{{adset.name}} 미치환 누적 33건** — Meta Ads Manager 점검 미해결 (handoff §12)
5. **5월 KPI 재합의** — "공유율 12%" → **"save_arch 도달률 25%"** 변경 권고 (현재 15.9%)

### 🟡 이번 주 (M1.5 lever)
6. **vibe archive 페이지 spec 작성·구현** ⭐⭐⭐ (1순위) — 검증된 152명 외부 수요
7. **OG 카드 QR + share URL ref param** ⭐⭐ (2순위 병렬)
8. **share 페이지 CTA A/B** ⭐⭐ (2순위) — 외부 viewer 135명 / try_click 27 = 80% 누수
9. **새 크리에이티브 A/B prep** — iOS only로 누적 빈도 가속, 1~2주 내 출시 필요

### 🔵 백로그
- **Android user UX 분기 (M2 후보)** ⭐ 신규 — Android 1인당 분석 4.81 (iOS의 71%) 활동 강함. organic Android user를 archive·save 강화 UX로 retain
- iOS 앱 Apple Developer 가입
- analyze_logs UA 컬럼 추가 (selection bias 80% 해소)
- 4월 viral chain 재검증 (handoff 5/3 §3-2 internal 영향)
- handoff §11 Satisfaction Score 외부 only 재계산
- 인스타 계정 콘텐츠 강화 (e581fe07 link_in_bio 검증된 채널)
- curiosity_25-34 reactivate 검토 (mbti_25-34 OFF 결정 시)

---

## 15. 다음 세션 시작 멘트 후보

```
"5/10~5/16 iOS only 광고 효율 모니터링 — LPV비용 출렁임 + 25-34 iOS 단독 효율 검증"
```
또는
```
"vibe archive 페이지 spec 작성 — 4명 power user + save_arch 152명 행동 기반"
```
또는
```
"새 크리에이티브 A/B brief — iOS only pool 축소로 누적 빈도 가속 대비"
```
또는
```
"4월 viral chain 재검증 — internal 제거 후 진짜 chain 몇 개 남는지"
```
또는
```
"5월 KPI 재합의 — save_arch 25% Primary로 동업자 합의"
```

---

## 16. 박제 메타 학습 (이 세션에서 배운 것)

1. **수동 SQL 분석 시 INTERNAL 미제거 = viral 수치 80% 부풀림**. admin 대시보드는 자동 처리되지만 SQL 직접 쿼리는 위험
2. **Daily 빈도와 누적 빈도 분리 필수**. Daily 1.04는 거의 신규 노출이지만 누적 3.5회면 fatigue 한계
3. **K-factor < 0.005 = 사실상 viral coefficient 0**. 그러나 archive 도달률 15.9%는 다른 카테고리 = retention 자산
4. **광고 viral peak (5/4)가 사실은 사용자 본인 테스트**. 광고 ROAS 평가 시 internal 제외 후 재계산 표준화 필요
5. **"공유"와 "archive"는 다른 행동 카테고리** — 공유는 viral, archive는 retention. 같은 KPI에 묶지 말 것
6. **invisible viral channel 검증** = `utm_content=link_in_bio`가 그 자체로 신호. 인스타 계정 follow → bio link → 진입 패턴
7. **광고 fatigue vs segment 본질 차이 분리 필수**. 5/9 25-34 1일 폭락은 fatigue 단정 노이즈, 그러나 7일 누적 CAC 비교 + 4-way OS×Age 매트릭스로 보면 **Android segment 자체가 viral 차단**. fatigue가 아닌 OS targeting 한정이 더 큰 lever
8. **Meta 광고 변경 — 광고(Ad) 수준 vs 광고 세트(Ad Set) 수준 영향 다름**. 광고 수준 (URL·카피·이미지) 변경 = post 새로 생성 = engagement 리셋. 광고 세트 수준 (예산·노출 위치·타겟팅) 변경 = engagement 보존 + 학습 단계만 재시작 가능. **engagement 자산 보호하려면 광고 세트 수준에서 운영**
9. **selection bias 명시 박제** — analyze_logs UA 컬럼 없음. share/view/story_save 한 device만 OS 매핑 가능 (75% unknown). **"매핑된 device 안에서의 OS 비교"** 라고 명시 필수. broad acquisition 평가는 못 하지만 funnel 효율 비교는 valid
