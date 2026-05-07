# Session Handoff — 2026-05-07

> 5/7 박제. 웹앱 디버깅 + 5/6·5/7 funnel + 14일 광고 추세 + iOS vs Android funnel + 전체 기간 retention 분석. **광고 vs retention 통념 깬 데이터 발견** — returning device-day 11%가 share completed 50% 만들어냄.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-05.md](./SESSION_HANDOFF_2026-05-05.md)

---

## 1. 한 줄 요약

**`android_instagram_inapp` 0건 = 데이터 한계 + 트래픽 부재 (버그 X). 14일 광고 추세 = 25-34 fatigue cycle 진행 중 (CTR 3.36→1.32, -61%), 18-24 안정. iOS Story save 67% vs Android 15% = iOS 앱 결정 데이터 강화. 전체 기간 retention 분석 — D7 평균 5.7% 정상 카테고리, returning device-day 11%가 share completed 50% 만듦 = retention 강화 = 광고와 동등 viral ROI. Satisfaction Score Framework 시뮬레이션 — 전체 avg 39.8점, **unknown new 290명(74%)이 분석만 보고 떠나는 게 압도적 1순위 lever** (잠재 +14.9점).**

---

## 2. `android_instagram_inapp` 디버깅 — 정상 동작 검증

### 2-1. 디버깅 발단
사용자 보고: 5/6 fix 이후 admin 카드 `android_instagram_inapp` 카운트가 0건 — fix가 동작 안 하는 의심.

### 2-2. 기술 스택 모두 정상
| 체크 | 상태 |
|---|---|
| DB CHECK constraint `inapp_shown` 허용 | ✅ |
| 라우트 화이트리스트 (commit `f856d72` deployed) | ✅ origin/main |
| 클라이언트 분기 ([result/page.tsx:429](src/app/result/page.tsx:429)) | ✅ |

### 2-3. 진짜 원인: Android Instagram inapp 트래픽 부재
| 날짜 | story_save Android Insta | share_logs Android Insta |
|---|---|---|
| 5/4 | 35 (generated stuck — 화이트리스트 누락 시점) | 13 |
| 5/5 | 14 (generated stuck) | 3 |
| **5/6 fix 배포** | **0** | 1 |
| 5/7 | 0 | 0 |

→ 5/6 fix 후 Android Instagram inapp 사용자가 story save 시도 자체 0명. fix 동작은 검증 트래픽 자연 누적 또는 직접 테스트 필요.

### 2-4. 메타 학습 박제
- **`android_instagram_inapp` 카드는 `story_save_logs` 테이블만 본다** (`storyEnvCounts["android_instagram_inapp"]`)
- `share_logs`·`share_views`는 같은 분류명 쓰지만 **다른 테이블·다른 행동**
- "공유 버튼"과 "스토리 저장 버튼"은 별도 추적 — admin 안에서 카운트 비교 시 테이블 출처 항상 명시 필요

### 2-5. 로컬 동기화 필요
- 로컬 main이 origin/main보다 1 커밋 뒤 (`f856d72` 미반영)
- `git pull` 권장 (배포는 prod 정상 작동)

### 2-6. 부수 점검 후보
[admin/page.tsx:736](src/app/admin/page.tsx:736) `storyGeneratedCount` 필터에 `inapp_shown` 미포함:
```ts
storyGeneratedCount = filteredStorySaves.filter(l => 
  ["generated", "shared", "cancelled", "downloaded"].includes(l.status)).length;
```
→ 의도적 분리(§4-2 admin 안내문 "inapp_shown으로만 끝남") 가능성. 향후 inapp_shown row 누적 시 funnel 차트 일관성 점검 필요.

---

## 3. 5/6 + 5/7 Funnel 데이터

### 3-1. 입구 funnel
| 메트릭 | 5/7 (진행중) | 5/6 | 5/4 (베이스) |
|---|---|---|---|
| 분석 시도 | 32 | 157 | 193 |
| 분석 성공 | 29 | 156 | 192 |
| 성공률 | 90.6% ⚠️ | 99.4% ✅ | 99.5% |
| unique device | 13 | 61 | 76 |
| 1인당 시도 | 2.5 | 2.6 | 2.5 |

**5/7 실패 3건 진단**: 동일 device(`c66cc424`) 00:31~00:33 연속 3회 = Anthropic `overloaded` (529). 외부 API 일시 과부하 + 사용자 재시도. 시스템 이슈 X.

### 3-2. 듣기 funnel
| 메트릭 | 5/7 | 5/6 | 5/4 |
|---|---|---|---|
| played event | 30 | 144 | 129 |
| played device | 8 | 48 | 54 |
| 분석성공 device→듣기 | 67% | 79% ✅ | 71% |
| completed event | 4 | 17 | 20 |
| played→completed | 13.3% | 11.8% | 15.5% |

→ 5/6 듣기 device 비율 79% (5/4 71% 위) — 분석 결과 만족도 ↑ 신호.

### 3-3. 공유 funnel
| 메트릭 | 5/7 | 5/6 | 5/5 | 5/4 |
|---|---|---|---|---|
| share_logs total | 0 | 4 | 5 | 36 |
| completed | 0 | 2 | 2 | 20 |
| fallback | 0 | 1 | 3 | 13 |
| cancelled | 0 | 1 | 0 | 3 |
| 성공 device→공유 | 0% | 6.6% | 7.1% | **47%** |

→ **5/4 47%가 outlier-peak**, 5/5-5/6 6.6-7.1%가 새 normal일 가능성. 5/4 광고 viral peak 시점.

### 3-4. 5/6 바이럴 도달
| viewer 매핑 | n | unique |
|---|---|---|
| external | 4 | 3 |
| unmatched | 1 | 1 |
| self | 0 | — |

- share_views 5 / share_logs 4 = K-raw 1.25
- try_click 3 / share_views 5 = 유입률 60% (5/4 8.7% 대비 7배)
- unique 외부 친구 도달 3명 / 공유 4건 = **0.75 friend reach per share**

---

## 4. 5/6 Viral Chain 4건 풀 Reconstruct

### Chain 1: 03:38 — 작동한 진짜 viral
**Sharer** `62720f92` · `🌆 노을멍 장인` · 죠지 "let's go picnic"
- 공유 (completed) → 1분 후 viewer 2명 (Windows + iPhone) → iPhone viewer try_click ✓ + 자기 분석 1번
- chain depth 2, viewer가 또 공유 X
- ⚠️ first_utm_term = `{{adset.name}}` 미치환 — **5/6 가장 강력한 viral chain의 광고 attribution 깨짐**

### Chain 2: 19:46 — 가장 강력한 viral
**Sharer** `63b441c3` · `😈 단체광기 6인방` · KiiiKiii "Delulu"
- 공유 (**fallback** = 클립보드) → 1분 후 Samsung S721N viewer → try_click ✓ + 자기 분석 **10번** 🔥
- first_utm_term = `mbti_25-34_f_260426`
- 💡 **fallback도 viral 작동** — 클립보드 = 카톡 직접 발송 strong-tie 패턴
- 19시 저녁 + Android Samsung + fallback = 카톡 단톡방 dynamic

### Chain 3: 21:42 — 무산
**Sharer** `db5f96ef` · `🌸 픽셀세계 집순이` · ILLIT "Billyeoon Goyangi"
- status=`cancelled`, viewer 0
- 단, **이 device는 5/7 새벽 1:26 재방문** = D+1 retention signal (§9-3)

### Chain 4: 22:41 — 도달 0
**Sharer** `4bbead2d` · `🌼 유채밭 주인공` · 뎁트 "Strawberries & Champagne"
- 공유 completed but viewer 0
- first_utm_term = `mbti_18-24_f_260423`
- 가능 원인: 시트 띄우고 닫기 / share_views INSERT 누락 (§7-E 갭 잠재 영향)

### Bonus: 02:03 unmatched viewer
**Viewer** `6f72dfb3` (Galaxy S936N) → entry `474c9c57` (`🧱 픽셀 큐레이터`, MilliMax "Zombie")
- sharer 매핑 7일 내 없음 — 옛 share·인스타 인앱 PATCH 누락 케이스
- try_click ✓, 분석 4번

### Chain 패턴 박제
- **즉시 진입 (1분 내)** = 카톡/DM 즉시 전달 표준
- **chain depth 3 (viewer→재공유) 0건** = viral coefficient < 1, 2차 확산 정체
- **fallback이 completed보다 efficacy 압도** (Chain 2 vs Chain 4)
- **vibeType 톤 양호** — `노을멍 장인` / `단체광기 6인방` / `픽셀세계 집순이` / `유채밭 주인공` 모두 캐릭터형 (CLAUDE.md 가이드 부합)

---

## 5. 광고 ROI × Funnel × CAC 매트릭스

### 5-1. 5/6 광고세트별 funnel
| 광고세트 | 지출 | 도달 | LPV (매니저) | 분석성공 device | 듣기 | 듣기완료 | 공유 | 공유성공 |
|---|---|---|---|---|---|---|---|---|
| **mbti_18-24_f** | 7,673 | 2,708 | 38 | **23** | 18 | 8 | 1 | **1** |
| **mbti_25-34_f** | 9,889 | 2,651 | 34 | **21** | 18 | 6 | 1 | 0 |
| organic/direct | 0 | — | — | 17 | 11 | 3 | 1 | 0 |
| `{{adset.name}}` 미치환 | (-) | — | — | 1 | 1 | 1 | **1** | **1** |

### 5-2. 5/6 CAC 단계별
| 단계 | 18-24 F | 25-34 F | 합계 |
|---|---|---|---|
| LPV 비용 (매니저) | 202원 | 291원 | 244원 |
| **분석성공 CAC** | **333원** | **471원** | **393원** |
| 듣기 device CAC | 426원 | 549원 | 488원 |
| 듣기완료 device CAC | 959원 | 1,648원 | 1,254원 |
| **공유성공 CAC** | **7,673원** | ∞ | **17,562원** 🚨 |

### 5-3. LPV→분석 누수 (랜딩 페이지)
- 18-24: 38 LPV → 23 분석 = **60.5%**
- 25-34: 34 LPV → 21 분석 = **61.8%**
- **두 광고세트 동일 비율** = 광고 차이 X, 랜딩 자체 누수
- 60% → 70% 끌어올리면 광고비 효율 +14%

### 5-4. organic 비율 안정 (28-29%)
| Date | 광고 | organic+direct | organic % |
|---|---|---|---|
| 5/6 | ~45 device | ~17 | 28% |
| 5/7 | 16 device | 6 | 27% (cross-check 후 정정) |

→ 광고 + 30% 추가 traffic을 organic이 만듦. IG bio·OG (§7-K fix) 효과 지속.

---

## 6. 14일 광고 추세 — 25-34 Fatigue Cycle

### 6-1. mbti 두 세트 일별 추이 (4/27~5/6)
| Date | 18-24 CPC | 25-34 CPC | 18-24 LPV비용 | 25-34 LPV비용 | 18-24 CTR | 25-34 CTR |
|---|---|---|---|---|---|---|
| 4/27 | 290 | 213 | 333 | 233 | 1.47% | 2.41% |
| 4/28 | 209 | **149** | 233 | 237 | 1.74% | **3.36%** |
| 4/29 | 191 | 170 | 302 | 221 | 1.75% | 2.61% |
| 4/30 | 169 | 172 | 234 | 237 | 2.10% | 2.53% |
| 5/1 | 205 | 172 | 253 | 232 | 1.45% | 2.17% |
| 5/2 | 134 | 158 | 159 | 202 | 2.09% | 2.34% |
| 5/3 | 160 | 177 | 182 | 228 | 1.74% | 2.20% |
| 5/4 | 136 | 190 | 166 | 205 | 1.97% | 1.95% |
| 5/5 | 132 | 210 | 165 | 256 | 1.93% | 1.66% |
| **5/6** | **142** | **267** | **202** | **291** | **1.92%** | **1.32%** |

### 6-2. 추세 변곡점 — 5/2 즈음 reversal
| 구간 | 추세 |
|---|---|
| 4/27~5/1 (5일) | 25-34 압도 (CTR·CPC·LPV비용 모두 우위) |
| 5/2~5/3 | 변곡점 |
| 5/4~5/6 (3일) | 18-24 압도 |

### 6-3. 10일 합산 비교 (4/27~5/6)
| 메트릭 | 18-24 | 25-34 | 차이 |
|---|---|---|---|
| 평균 CPC | 189 | 186 | ≈ (1%) |
| 평균 LPV비용 | 213 | 232 | 18-24 8% 우위 |

→ **합산하면 거의 동일**. 5/6 단일에서 본 "30% 우위"는 최근 3일 한정 추세.

### 6-4. 25-34 fatigue 패턴
```
4/28 CTR 3.36% (peak) → 5/6 1.32% (-61% from peak)
```
**18-24는 stable (1.47% → 1.97%)**. → 25-34가 빠르게 떨어진 것이지 18-24가 우월한 게 아님.

### 6-5. Inactive 광고 점검 — "허수 LPV 함정" 박제

**picnic_18-24_f_260424** (3일 운영 후 inactive) — 부활 X 결정 박제:
| Date | 지출 | CTR | LPV비용 |
|---|---|---|---|
| 4/24 | 2,247 | 6.42% | 53원 |
| 4/25 | 2,147 | 5.04% | 65원 |
| 4/26 | 1,734 | 5.25% | 64원 |

LPV비용은 mbti_18-24의 1/3 outlier였지만 **사용자 직접 테스트 결과 분석 전환율 0%에 수렴** → 부활 가치 없음.

**메타 학습 (운영 원칙 추가)**:
- LPV(랜딩 페이지 조회)는 광고매니저 metric → **사진 업로드·분석 시도까지 안 가도 카운트됨**
- LPV비용 outlier 광고 = "어그로 hook으로 페이지 클릭만 유도, 실제 product engagement 0" 케이스 가능
- → **광고세트 평가 시 LPV비용 < 분석성공 CAC < 공유성공 CAC 순으로 funnel 깊이 검증 필수**
- LPV 효율 outlier ≠ product fit 신호. 우리 분석성공 CAC 또는 듣기 device CAC로 cross-check해야

**curiosity_25-34_f_260501** (3일 운영, inactive):
| Date | CTR | LPV비용 |
|---|---|---|
| 5/2 | 4.44% | 85원 |
| 5/3 | 3.27% | 110원 |

LPV 효율은 outlier지만 **picnic 사례에 비춰 분석 전환 검증 후 reactivate 판단 필요** (단순 LPV 효율로 결정 X).

### 6-6. 운영 원칙 박제
- **단일 일자 → 결론 X** (CLAUDE.md 운영원칙 그대로)
- Meta 광고 fatigue cycle ≈ 30일 → 4/26 launch면 **5/26 즈음 자연 dropoff** 예상
- 18-24 vs 25-34 우위 = **launch 시점·크리에이티브 변수 vs 타겟 변수가 섞임** — 분리 안 됨
- **LPV 효율 outlier ≠ product fit 신호** (picnic 사례). 분석성공 CAC·듣기 device CAC로 funnel 깊이 cross-check 필수

---

## 7. iOS vs Android Funnel — Selection Bias 명시

### 7-1. ⚠️ 데이터 한계
`analyze_logs`에 user_agent 컬럼 없음 → device_id 매핑은 share/view/story_save 한 device만 가능. unknown 비중:
| 기간 | unknown | 매핑된 |
|---|---|---|
| 5/6 | 39 (64%) | 22 (iOS 15 + Android 7) |
| 4/30~5/6 7일 | 270 (80%) | 67 (iOS 35 + Android 32) |

→ 매핑된 device = **이미 engagement한 사용자** = "공유/뷰/스토리 저장 한 user 안에서의 OS 비교".

### 7-2. 7일 (4/30~5/6) Funnel × OS

**분석 (engagement 깊이):**
| OS | device | 시도 | 1인당 시도 | 성공률 |
|---|---|---|---|---|
| iOS | 35 | 236 | 6.74 | 95% |
| Android | 32 | 154 | 4.81 | 91% |

→ iOS 1인당 분석 40% 많음. Android 성공률 4%p 낮음 (인스타 인앱 webview 사진 업로드 이슈 추정).

**듣기:**
| OS | unique | played event | 1인당 듣기 | played→completed |
|---|---|---|---|---|
| iOS | 34 | 97 | 2.85 | 18.6% |
| **Android** | **29** | **109** | **3.76** | 19.3% |

→ Android 듣기 행동 더 강함. webview 한계 X 영역.

**공유 (share_logs):**
| OS | unique | completed event | fallback event |
|---|---|---|---|
| **iOS** | 11 | **34** | 0 |
| **Android** | 13 | 1 | **20** |

→ iOS = Web Share API 정상 (34 event / 6 device = heavy sharer 1-2명)
→ Android = **95% fallback (클립보드)** = webview/인스타 인앱 navigator.share 차단 데이터 증명

**스토리 저장 viral:**
| OS | unique | shared device | shared 비율 |
|---|---|---|---|
| **iOS** | 39 | 26 | **67%** ✅ |
| **Android** | 26 | 4 | **15%** 🔴 |

→ **iOS 4.4× 효율**. **iOS 앱 결정 (§7) 데이터 근거 강화**.

### 7-3. Viral chain — viewer 후속 (5/6+5/7)
| OS | view | unique viewer | try_click | later_analyze |
|---|---|---|---|---|
| Android | 22 | 18 | 4 (22%) | 6 (33%) |
| **iOS** | 20 | 5 | 4 (**80%**) | 5 (**100%**) |
| Desktop | 8 | 8 | 0 | 0 |

→ iOS viewer 5명 → 5명 분석 = 100% conversion (작은 표본, 강력 신호)

### 7-4. 종합 매트릭스
| funnel 단계 | iOS 우위 | Android 우위 |
|---|---|---|
| 분석 (1인당) | ✅ 40% 많이 | |
| 듣기 | | ✅ 31% 더 |
| Web Share API | ✅ 100% | (95% fallback) |
| 스토리 viral | ✅ 4.4× | |
| viewer→분석 | ✅ 100% | (33%) |

**iOS = 깊은 engagement layer / Android = 폭은 넓지만 깊이 얕음 (webview 차단)**

### 7-5. 개선 후보 — analyze_logs UA 박제
- 현재 80% device가 OS unknown
- POST 라우트에서 `req.headers['user-agent']`를 INSERT 시점에 박기 (story_save_logs 동일 패턴)
- 분석 시점 OS 분포 정확 파악 → 광고 ROAS OS별 정밀 측정 가능

---

## 8. 5/7 Organic vs 광고 Cross-check — D+1 Retention Signal

### 8-1. 5/7 유입 분류 (cross-check 후 정정)
| 분류 | device |
|---|---|
| 광고 (Meta, UTM 살아있음) | 13 |
| 광고 (UTM 미치환) | 2 |
| **광고 (UTM 완전 누락, multi-touch)** | **1 (`a9cb20b8`)** |
| organic (IG bio link) | 2 |
| organic/direct (진짜) | 4 |
| **합계** | **22 device** |

→ **광고 16 (73%) / organic 6 (27%)**

### 8-2. UTM 없음 5 device cross-check 결과
| device | 첫 분석 | 광고 history | 진단 |
|---|---|---|---|
| `a9cb20b8` | 15:53 | 5/7 15:45 mbti_18-24 | 🚨 attribution 깨짐 (multi-touch) |
| **`db5f96ef`** | 01:26 | 없음 | 🟢 **5/6 sharer 재방문 (D+1 retention!)** |
| `c66cc424` | 00:31 | 없음 | 🟢 진짜 direct (5/7 overloaded 실패 device) |
| `54e6c0fa` | 15:18 | 없음 | 🟢 진짜 direct |
| `98e71f2a` | 13:10 | 없음 | 🟢 진짜 direct |

### 8-3. 핵심 발견 박제
- **`db5f96ef`** = 5/6 21:42 sharer (🌸 픽셀세계 집순이, ILLIT) → 5/7 01:26 재방문
- 광고 attribution 0 = 즐겨찾기·카톡 보관·SNS 다시 보기 패턴
- D+1 retention signal — vibeType 콘텐츠가 "다시 와서 보고 싶은" 가치 만든 첫 데이터

### 8-4. 어드민 분류 로직 개선 후보
- 현재: device의 첫 row UTM만 보고 분류 → multi-touch 케이스 organic으로 over-count
- 개선: 같은 day 모든 row UTM merge → 하나라도 광고면 광고 카운트
- 효과: organic over-count 보정, 광고 ROAS 정확도 ↑

---

## 9. 🔥 전체 기간 Retention 풀 분석 (출시 4/15 ~ 5/7)

### 9-1. Cohort retention curve (n≥30 성숙 cohort)
| Cohort | n | D1-7 누적 | D1-14 누적 | D7+ |
|---|---|---|---|---|
| 4/16 | 32 | 6.3% | 6.3% | 6.3% |
| 4/19 | 58 | 6.9% | 6.9% | 1.7% |
| 4/20 | 67 | 3.0% | 6.0% | 3.0% |
| 4/25 | 42 | 2.4% | 4.8% | 2.4% |
| 4/26 | 66 | 3.0% | 3.0% | 1.5% |
| **4/27** | **59** | **8.5%** | **10.2%** | **5.1%** |
| 4/28 | 46 | 6.5% | 6.5% | 2.2% |
| 4/29 | 39 | 7.7% | 7.7% | 2.6% |
| 4/30 | 49 | 6.1% | 6.1% | 0% |
| **평균** | | **~5.7%** | **~6.3%** | **~2.4%** |

→ **D7 평균 5.7%** = **일회성 콘텐츠 앱 정상 범위** (MBTI/사주/점성술 카테고리 4-8%)
→ 4/27 cohort outlier (D7 8.5%·D7+ 5.1%) — **재현 가능한 좋은 수치**, 진단 가치 있음

### 9-2. DAU 추이 + 신규/재방문 분리
| Date | DAU | 신규 | 재방문 | 재방문 % |
|---|---|---|---|---|
| 4/15 (출시) | 16 | 16 | 0 | 0% |
| 4/26 (mbti 시작) | 57 | 54 | 3 | 5% |
| 5/4 (DAU peak) | **76** | 69 | 7 | 9% |
| 5/5 | 70 | 56 | **14** | **20%** |
| 5/6 | 61 | 50 | 11 | 18% |
| 5/7 진행중 | 20+ | 17 | 3 | 15% |

→ 출시 첫 주 5% → 4월 말 7-12% → **5월 들어 18-20% 안정화**
→ 누적 user base 확장으로 자연스러운 retention % 상승 (절대값도 ↑)

### 9-3. New vs Returning 활동 강도 (전체 기간)
| 메트릭 | New (883 dd) | Returning (109 dd) | Returning 우위 |
|---|---|---|---|
| Device-day 비중 | **89%** | **11%** | — |
| 공유 시도 | 7.4% | 18.3% | 2.5× |
| **공유 completed** | **0.8%** | **6.4%** | **8.1× 🔥** |
| 스토리 저장 시도 | 7.2% | 10.1% | 1.4× |
| 스토리 shared | 3.4% | 4.6% | 1.4× |
| 듣기 played | 18.1% | 22.9% | 1.3× |

→ **Returning user 1 device-day = 신규의 8배 viral 효율**
→ Returning 11%가 share completed 50%를 만들어냄 (7건 / 전체 14건)

---

## 10. 🚨 광고 vs Retention 중요도 매트릭스 (핵심 박제)

| 영역 | DAU 기여 | Viral 기여 (share completed) | 비용 |
|---|---|---|---|
| **광고 신규 유입** | **89%** | 50% | 17,562원 / 공유성공 |
| **Retention** | 11% | **50%** | 기능 개발 1회성 |

### 결론: 카테고리별 다름

**📊 DAU 관점**
- 광고 = 결정적 (89%)
- 광고 stop = 즉시 DAU 89% 증발
- D7+ retention 2.4% → 잔존 user도 점진 dropoff

**🔥 Viral 활성화 관점**
- Returning user 1명 = 신규 user 8명과 동등한 viral 가치
- **광고 vs retention 강화 ROI = retention 압도적**
- 현재 viral coefficient < 1 = retention 강화 없으면 광고 의존 100% 영구

**💰 Long-term sustainability 관점**
- 광고비 stop 가능성 (예산·계절·CTR fatigue) → retention이 안전망
- D7+ 2.4% → 5%로만 끌어올려도 누적 user pool 2배 + share completed +50%

### 박제용 한 줄
> **"Returning device-day 11%가 share completed 50%를 만든다"**
> = 광고 100명 데려와서 1명 공유 ↔ Retention 12명 데려와서 1명 공유 = 같은 viral 효과

---

## 11. 🎯 Satisfaction Score Framework — 사용자 만족도 시뮬레이션

### 11-1. Framework 정의 (Behavior depth × Modifier)

**Base score (행동 도달 단계):**
| 도달 | Score |
|---|---|
| 분석 실패만 | 0 |
| 분석 완료 | 20 |
| + 듣기 played | 40 |
| + 공유 또는 저장 시도 | 60 |
| + 공유 또는 저장 success | 80 |

**Modifier (±):**
- 듣기 completed: **+10** (곡 강한 호감)
- 분석 5회+: **+10** (power user, vibeType collecting)
- D+1 재방문: **+20** (retention = 진심 좋아함)
- Android 인스타 인앱 + generated stuck: **-20** (frustration)
- 분석 일부 실패 경험: **-10**

### 11-2. 7일 (4/30~5/6) 세그먼트별 결과 (390 device)

| 세그먼트 | n | 비중 | 평균 score | 80+ 비중 |
|---|---|---|---|---|
| 💎 iOS_other returning | 1 | 0.3% | 120 | 100% |
| 💎 iOS_Insta returning | 1 | 0.3% | 100 | 100% |
| 🟢 **iOS_Insta new** | **38** | **9.7%** | **76.6** | **74%** |
| 🟢 Android_other new | 10 | 2.6% | 77.0 | 60% |
| 🟢 iOS_other new | 8 | 2.1% | 75.0 | 63% |
| 🟡 **Android_Insta new** | **25** | **6.4%** | **58.4** | **12%** (88% 60-79 stuck) |
| 🟡 unknown returning | 15 | 3.8% | 32.7 | 0% |
| 🔴 **unknown new** | **290** | **74.4%** | **30.9** | 0.3% |

**전체 weighted avg = 39.8점**

### 11-3. 핵심 finding 5가지

1. **iOS_Insta new (38명, 9.7% 비중) = product native viral wedge** — 80+ score 28명 (전체 80+ 의 68%)
2. **Android_Insta new (25명) 88%가 60-79 stuck** — 분석·듣기·저장 시도까지 갔지만 webview 차단으로 fail = iOS·Android 앱 도입 직격 segment
3. **unknown new 290명 (74%) 평균 30.9점** = 광고비 의존 funnel의 본질, 분석만 보고 떠남 = **가장 큰 lever**
4. **Returning device (17명, 4.4%) 평균 60+** = retention 자체가 satisfaction 강한 신호 (§9·10 데이터 보강)
5. **unknown returning 15명 평균 32.7점 = 분석만 반복** = "vibeType collecting" 패턴 — vibeType은 hook이지만 곡·공유는 별개 conversion (분리 진단 가치)

### 11-4. Lever 우선순위 (전체 평균 39.8 → ?)

| Lever | 영향 device | 잠재 변화 | 전체 avg 변화 |
|---|---|---|---|
| 🔴 **unknown new 290명 → 듣기 진입 (+20)** | 290 | +5,800 | **+14.9 → 54.7** |
| 🟢 Returning 비율 11% → 20% | +35 | +1,500 | +3.8 |
| 🟡 Android_Insta new 25명 → 60→80 (+20) | 25 | +500 | +1.3 |
| 🟡 iOS_Insta new 38명 → 76.6→90 (+13) | 38 | +494 | +1.3 |

→ **압도적 1순위: 신규 user의 분석 → 듣기 conversion 강화** (다른 lever 합쳐도 같은 영향 못 만듦)

### 11-5. 페르소나 narrative

- 💎 **유진 (iOS Insta returning, 100점)** — "어제 친구한테 보여줬는데 vibeType 너무 웃겨서 단톡 자랑. 오늘 다른 사진으로 또 해봤는데 다른 vibeType 나옴" → viral coefficient 1+ 만드는 진짜 엔진
- 🟢 **지수 (iOS Insta new, 76.6점)** — "인스타 광고 보고 → 분석 → 곡 들어보니 좋음 → 인스타 스토리 음악 스티커로 올림" → product 핵심 viral 엔진 (38명 모집단)
- 🟡 **민지 (Android Insta new, 58.4점)** — "결과 vibeType 진짜 좋은데 스토리 저장 누르니 '이미지 길게 누르세요'... 폰 스크린샷으로 우회" → frustration 누적 (25명, iOS·Android 앱 도입 핵심 타겟)
- 🔴 **진주 (unknown new, 30.9점)** — "광고 → 분석 → vibeType 보고 '오 뭐야' → 곡? 글쎄... 닫음" → 광고비 74% 차지 segment, 가장 큰 product lever

### 11-6. 박제용 메타 학습

- **광고로 데려온 user 90%가 분석만 보고 떠남** = 일회성 콘텐츠 카테고리 자연 한계 (MBTI/사주 동일 패턴)
- **Score 80+ user는 product의 진짜 fan + viral 엔진** — 41명 / 390 = 10.5% 비중인데 share completed의 압도적 비중 차지
- **Lever 우선순위 = 모집단 크기 × 잠재 score 변화** — 일부 segment 깊이 개선보다 전체 segment 폭 conversion이 큰 효과

---

## 12. `{{campaign.name}}` 누적 29건 update (5/5 §6 → 갱신)

| 날짜 | 미치환 row |
|---|---|
| 5/3 | 2 |
| 5/4 | 9 |
| 5/5 | 14 |
| 5/6 | 2 (대폭 ↓) |
| 5/7 | 2 |
| **누적** | **29건 (5/3~5/7)** |

→ 5/5 §6에서 **25건이었는데 5/6+5/7 +4건 추가**. 사용자 fix 안 한 상태로 계속 누적 중.

**5/6 강력 viral chain 1 (Chain 1 — 03:38 죠지·노을멍)이 정확히 이 미치환 케이스** = §6-2의 단서 아래 보강:

> 5/3 02시 광고 setup 변경 추정 가설 — **여전히 유효**. 5/6 ↓ 추세 = 일부 수정됐을 가능성 (사용자 직접 만진 적 없으면 Meta side fix?). 그러나 Chain 1 attribution 깨졌음 = 광고세트별 viral ROAS 측정 영구 누수 진행.

### 권장 액션 (5/5 §6-5에서 보류 → 재요청)
1. Meta Ads Manager → 광고 row 점검 (Advantage+ Creative 자동 변형)
2. 광고별 URL parameter 정적 vs dynamic syntax 비교
3. 5/3 02시 Activity log 확인

---

## 13. 다음 우선순위

### 🔴 즉시 (사용자 결정 필요)
- **`{{campaign.name}}` Meta Ads Manager 점검** (5/5 §6-5에서 보류, 누적 29건 — viral attribution 영구 누수 막기)
- **로컬 main `git pull`** (origin/main 1 커밋 뒤)

### 🟡 다음 작업 후보 (Satisfaction Framework §11-4 결과 반영)
1. 🔴 **unknown new 290명의 분석 → 듣기 conversion 강화** (Satisfaction 압도적 1순위, 전체 avg 39.8 → 54.7 잠재)
   - 듣기 자동 재생 / 듣기 CTA 강화 / 곡 hook 보강
   - viral 진입의 첫 step
2. **신규 share rate 0.8% → 2% 끌어올리는 result CTA 강화** (viral lever 직접, returning 8× 효율 차이 좁히기)
3. **4/27 cohort outlier 진단** (D7 8.5%·D7+ 5.1%) — 재현 가능한 retention lever found?
4. **mbti_25-34 새 크리에이티브 A/B** (CTR 3.36→1.32 fatigue, curiosity_25-34 reference 활용)
5. **analyze_logs user_agent 컬럼 추가** (OS selection bias 해소, Satisfaction 정밀도 ↑)
6. **랜딩 페이지 LPV→분석 60%→70% 누수 fix** (광고비 효율 +14%, 1번 lever와 funnel 인접)

### 🔵 백로그 (변동 없음)
- iOS 앱 Apple Developer Program 가입 (§7 5/5 박제)
- iOS Safari blur 실기기 검증
- share_logs status PATCH 갭 디버깅 (§7-E)
- iTunes 한↔일/한자 cross-script (5/5 §3-7, 9건)
- iTunes cross-script bonus 점진 매칭률 ↑ 모니터링 (5/5 §3-6)

---

## 14. 다음 세션 시작 멘트 후보

```
"unknown new 290명 분석→듣기 conversion 강화 — 곡 hook · 자동재생 · CTA 디자인"
```
또는
```
"{{campaign.name}} Meta Ads Manager 직접 점검 (5/3 02시 변경 이력)"
```
또는
```
"신규 share rate 0.8% → 2% 끌어올리는 result CTA 디자인"
```
또는
```
"4/27 cohort D7 8.5% outlier 진단 — 광고 크리에이티브? vibeType? 시간대?"
```
또는
```
"iOS 앱 Apple Developer Program 가입 진행 + Expo 환경 셋업"
```

---

## 15. 5/7 commit history

| commit | 변경 | 메모 |
|---|---|---|
| (없음) | 데이터 분석 세션 — 코드 변경 없음 | 박제 only |
