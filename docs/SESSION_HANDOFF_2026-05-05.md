# Session Handoff — 2026-05-05

> 5/5 작업 박제. iTunes K-POP 한글/영어 cross-script bonus 도입 + 5/5 데일리 메트릭스 점검 + UTM 토큰 미치환 발견 + iOS 네이티브 앱 도입 의사결정 (Expo+RN, 5-7개월 틈틈이).
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-04.md](./SESSION_HANDOFF_2026-05-04.md)

---

## 1. 한 줄 요약

**§7-K 페북 OG fix 검증 완료. iTunes scoreMatch에 K-POP 한글/영어 cross-script bonus +30 추가 (commit `e6eb539`, 옵션 1 — 코드만, 215곡 lazy 재매칭). 5/5 데일리 점검 중 `{{campaign.name}}` UTM 토큰 미치환 발견 (이틀 누적 25건, 사용자 보류). iOS 네이티브 앱 도입 의사결정 — Expo+RN으로 5-7개월 틈틈이 빌딩 결정.**

---

## 2. §7-K 검증 완료 (사용자 보고)

5/4 §7-K (페북 robots.txt `/api/og` Allow fix, commit `7fb10c4`) 검증 완료.
- 5/5 14:00 KST 자동 propagation 후 페북 디버거 + 인스타 DM OG 카드 정상 노출 확인
- §7-K-9 메타 교훈 박제 그대로 유지 (Vercel Logs Export = 결정적 도구)

---

## 3. iTunes cross-script bonus 도입 (§7-J-8 후속)

### 3-1. 배경

§7-J에서 매칭률 90.9% → 99.86% 끌어올린 후, 잔존 미매칭 케이스의 ~90%가 **K-POP 한글/영어 표기 차이**임을 §7-J-2에서 진단:
- 트랙명 완전 일치 (+50)
- 아티스트 "AKMU" vs "악뮤" → 0점 (한글/영어 cross-script)
- 합 50점 < 60점 threshold → low_score

**근본 해결**: `scoreMatch` 함수에 cross-script bonus 추가 (§7-J-8에서 미적용으로 보류했던 항목).

### 3-2. dry-run 검증 (script 작성 → 일회성 정리)

[scripts/dryrun-cross-script-bonus.mjs](scripts/dryrun-cross-script-bonus.mjs) (commit 후 정리됨):
- itunes_preview_cache 1,381건 시뮬레이션
- 분류 정확화 (oldS<60 && newS>=60만 진짜 bonus 효과로 격리)

| 분류 | 건수 |
|---|---|
| ★ bonus로 신규 통과 (oldS<60→newS≥60) | **215건** |
| 회귀 (score ↓) | **0건** ✅ |
| 이미 60+인데 status≠matched (preview NULL 등) | 55건 (별개 이슈) |
| 여전히 < 60 | 86건 (한↔일/한자 9건, 한↔영 track 부분일치 24건) |

→ 회귀 위험 0 확인, 215곡 K-POP 표기차 케이스로 깨끗.

### 3-3. fix 적용 (commit `e6eb539`)

[src/app/api/itunes-preview/route.ts](src/app/api/itunes-preview/route.ts) — `scoreMatch` 분기 한 줄 추가:

```ts
function hasKorean(s: string): boolean { return /[가-힯]/.test(s); }
function isASCIILatin(s: string): boolean {
  return /^[\x00-\x7F]+$/.test(s) && /[a-zA-Z]/.test(s);
}

// 아티스트 매칭 분기:
if (cA === nA) score += 50;
else if (cA.includes(nA) || nA.includes(cA)) score += 30;
else if (
  cT === nT &&  // ← track 완전 일치 게이트
  ((hasKorean(targetArtist) && isASCIILatin(candArtist)) ||
   (isASCIILatin(targetArtist) && hasKorean(candArtist)))
) {
  score += 30;  // ★ K-POP cross-script bonus
}
```

### 3-4. 옵션 1 채택 — 일괄 재매칭 X

사용자 결정: **신규 곡부터만 자동 적용**, 기존 215곡 강제 재매칭 안 함.

이유:
- itunes_preview_cache 24시간 retention으로 **lazy하게 자동 흡수** (§7-J 재호출 정책)
- 기존 매칭/수동 박은 곡 영향 0 (status='matched'/'manual'은 캐시 우선 반환)
- 일괄 작업 부담 회피

### 3-5. 안전장치 (false positive 방어)

| 조건 | 의도 |
|---|---|
| `cT === nT` 게이트 | 다른 곡 자동 매칭 차단 (Take on Me / a-ha vs Kaiak 같은 케이스) |
| 한글 + 영어 cross-script AND | 둘 다 한글이거나 둘 다 영어면 bonus X |
| bonus 30점 | 트랙 완전 일치(+50) + bonus(30) = 80점만 통과 |

### 3-6. 사후 점검 포인트

- admin "iTunes 매칭률" 점진 상승 추세 (215곡 lazy 흡수)
- false positive 발견 시 → manual delete (§7-J 워크플로우 재사용)

### 3-7. 향후 작업 후보

- **점진 상승 정체 시 일괄 재매칭 script** ([scripts/match-all-songs.mjs](scripts/match-all-songs.mjs) 패턴 reuse)
- **한↔일/한자 cross-script** (9건, fix 범위 밖, 별도 작업)
- **track 부분 일치 cases** (24건, 다른 매칭 알고리즘 개선 필요)

---

## 4. 응답시간 점검 — 평소 수준 확인

### 4-1. 사용자 인지

5/5 평균 응답시간 평소보다 길어 보임 → 데이터 점검 요청.

### 4-2. 데이터 분석

오늘(5/5) avg 11,560ms — 평소 분포(10.7~12.8초) **안**. 진단:

| 시간대 | n | avg |
|---|---|---|
| 새벽 1·3시 | 4·9 | **13,959 / 13,482** ← outlier |
| 활성 시간대 (11~13시) | 11·16·7 | 10,813 ~ 11,349 ← 평소 그대로 |

→ **새벽 outlier 6건 + 작은 표본**(74건 vs 평소 130~260건)이 평균 끌어올림. 진짜 latency 증가 아님.

가장 느린 case top 6: 새벽 시간대 한 사용자가 사진 4장 분석 추정 (15~22초 — §7-H-2 측정 패턴).

### 4-3. 결론

- 별도 fix 불필요
- CLAUDE.md "단일 일자 지표로 판단 금지, 표본 크기 고려" 운영원칙 그대로 적용 케이스
- 저녁 피크 후 자연스럽게 11s 내외 수렴 예상

---

## 5. 5/5 데일리 메트릭스 + 바이럴 루프 점검

### 5-1. 입구 funnel (5/5 진행 중 vs 5/4 전일)

| 메트릭 | 5/5 (KST 14시) | 5/4 |
|---|---|---|
| 분석 시도 | 74 | 193 |
| 분석 성공 | 72 | 192 |
| 분석 성공률 | 97.3% | 99.5% |
| unique device | 28 | 76 |
| 1인당 평균 | 2.6 | 2.5 |

→ 5/4의 37% 진행 (오후 시작점 기준 정상 페이스).

### 5-2. 듣기 funnel (preview_logs)

| 메트릭 | 5/5 | 5/4 |
|---|---|---|
| played | 47 | 129 |
| completed | 7 | 20 |
| 분석성공→듣기 device | **68%** | 71% |
| played→completed | **15%** | 15.5% |

→ 평소 패턴 그대로. cross-script bonus 효과는 며칠 누적 후 확인.

### 5-3. 공유 funnel (share_logs status — 실제 컬럼 값 박제)

`share_logs.status` 실제 값: `completed`, `fallback`, `cancelled` (NULL 0건 — §7-E-1 70% NULL 갭 오늘은 사라짐).

| status | 5/5 | 5/4 |
|---|---|---|
| completed | 1 | 20 |
| fallback (클립보드) | 3 | 13 |
| cancelled | 0 | 3 |

→ 5/5 fallback 75% (3/4) — 표본 작지만 평소(36%)보다 ↑.

**중요 박제** — admin 코드는 `status='shared'`로 필터하는데 실제 값은 `'completed'`. **§7-F admin 분류 로직 확인 필요** (status 매핑 미스 가능성).

### 5-4. 바이럴 도달 (share_views)

§7-I-3 정확화 적용 (sharer 매핑 없는 viewer 분리):

| 5/5 viewer | 환경 | n |
|---|---|---|
| android_instagram_inapp | 1 |
| other | 1 |

| viewer→sharer 매핑 | 5/5 | 5/4 |
|---|---|---|
| external (진짜 외부) | 2 | 19 |
| self | 0 | 1 |
| unmatched | 0 | 7 |

→ 5/5 K factor 2.0 (1 share → 2 외부 viewer), 표본 1로 신뢰도 매우 낮음.

### 5-5. 종합 진단

- 🟢 분석·듣기 funnel 정상
- 🟡 share completed 1.4% (5/4 10.4% 대비 저조 — 단 진행 중)
- 🟡 fallback 비율 ↑ — 안드 인스타 인앱 사용자 비중 ↑ 가능성
- 🔴 **`{{campaign.name}}` UTM 토큰 미치환** — §6 별도 박제

---

## 6. ⚠️ `{{campaign.name}}` UTM 토큰 미치환 (이틀 누적 25건)

### 6-1. 발견

오늘 첫 발견. 5/5 14건 + 5/4 9건 + 5/3 2건 = **25건 누적** (10 device).

```
utm_source = "meta"           ← 정상 (정적 값)
utm_medium = "paid_social"    ← 정상 (정적 값)
utm_campaign = "{{campaign.name}}"  ← 미치환
utm_content = "{{ad.name}}"         ← 미치환
utm_term = "{{adset.name}}"         ← 미치환
```

→ 광고 setup의 dynamic 변수 syntax가 일부 광고에서 치환 실패.

### 6-2. 결정적 단서

**7명 중 4명이 같은 device로 정상 캠페인 + 미치환 둘 다 경험**:

| device | 본 캠페인들 |
|---|---|
| 376da01a | `{{campaign.name}}` + `traffic_video_main` |
| 38945a3d | `{{campaign.name}}` + `플더픽 영상광고_트래픽` |
| 6666e43e | `{{campaign.name}}` + `플더픽 영상광고_트래픽` |
| 164c55ba | `{{campaign.name}}` + `traffic_video_main` |
| 0775e202, 87424187, 7732a8c0 | `{{campaign.name}}` 단독 |

→ 두 정상 캠페인(`traffic_video_main`, `플더픽 영상광고_트래픽`)이 같은 광고 계정에서 운영 중인데, **일부 광고는 정적 텍스트로 박혀 정상**, **일부 광고는 dynamic 변수가 미치환** 상태.

### 6-3. 시간 패턴

- **5/3 02:46 첫 발생** (그 전 0건)
- 5/4 04:25-04:30, 19:47 — 6건
- 5/5 11:37-13:22 — 14건

→ **5/3 새벽 02시쯤 광고 setup 변경 추정** (광고 추가? Advantage+ Creative 토글? 새 광고세트?).

### 6-4. 가설 (좁혀짐)

| 가설 | 확률 |
|---|---|
| **Advantage+ Creative 자동 변형** — base 광고에서 자동 생성된 변형이 dynamic 변수 미치환 상태 송출 | 🟡 가장 유력 |
| **광고 복제·수정 시 syntax 미세 차이** — 공백·인코딩 등 | 🟡 가능 |
| **특정 placement(Reels/Stories)에서 dynamic 변수 미작동** | 🔵 가능 |

### 6-5. 권장 액션 (사용자 보류 결정)

**즉시 점검 (5분 작업, 사용자 보류)**:
1. Meta Ads Manager → 활성 광고 row 수 확인 (소재 2개 외에 자동 변형 있는지)
2. 광고별 "URL parameters" 필드 비교 (정적 vs dynamic syntax 차이)
3. Advantage+ Creative 토글 ON/OFF 확인
4. 5/3 02시쯤 변경 이력(Activity log) 확인

### 6-6. 빠른 fix 옵션

- **옵션 A (추천)**: 모든 광고 URL parameter를 정적 텍스트로 통일 — 데이터 무결성 보장, 캠페인명 변경 시 수동 update 필요 (광고 2~3개면 부담 적음)
- **옵션 B**: dynamic 변수 syntax 정확히 통일 + Advantage+ Creative OFF — 자동 반영 ↑, Meta UI 변경에 취약

### 6-7. 영향

- 캠페인별 ROAS 측정 데이터 25건 손실 (이틀 누적)
- §3-2 광고 ROAS 가설 검증 시 이 케이스 집계 분리 필요

---

## 7. iOS 네이티브 앱 도입 의사결정

### 7-1. 결정 박제

> **Expo + React Native로 iOS·Android 동시 풀 네이티브 앱.**
> 5-7개월 틈틈이 빌딩 페이스. 심사 reject 시 학습으로 전환.
> 웹앱 운영은 계속 유지 (웹 + 앱 병행).

### 7-2. 진짜 동기 (검증된 한계)

핸드오프 §7-B~7-G의 안드로이드 인스타 인앱 webview 한계:
- navigator.share·blob download·intent URI 모두 차단
- 사진첩 직접 접근 불가 (web `<input type=file>` 1번 선택 후 끝, 갤러리 탐색 X)
- 스토리 공유 1탭 = native share intent만 가능
- viral 동선 100% 차단 (§7-G GA4 데이터: 21.5% Android Webview)

→ web 기술로 **본질적 해결 불가**. 네이티브 앱이 정공법.

### 7-3. 전제 조건 (검증 완료)

- ✅ 웹앱 product spec 검증 끝남 (vibeType·추천·매칭률 99.86%)
- ✅ 광고·viral·데이터 적재 흐름 안정
- ✅ Mac 보유 (iOS 빌드 환경)
- ✅ 5-7개월 페이스 합의 (틈틈이, 웹앱 운영 우선)

### 7-4. Capacitor X, Expo+RN ✅ 결정 근거

| 기준 | Capacitor (입점몰 비유) | Expo+RN (자사몰 비유) |
|---|---|---|
| 출시 속도 | 1-2주 | 5-7개월 |
| 학습 비용 | 거의 0 | 1-2개월 |
| 사용자 체감 UX | 어색 | native 그대로 |
| 4.2 심사 통과 | 🔴 reject 위험 큼 | 🟢 통과 쉬움 |
| 장기 운영 부담 | 누적 (키보드·상태바 보정) | 안정적 |
| 사진첩·공유 native | plugin 가능 | 풀 native (Expo SDK 풍부) |

→ **사용자 본업(이커머스) 의사결정 framework 일관 적용**: 검증된 product + 장기 의지 + 브랜드/UX 컨트롤 → 자사몰 직접 구축 = Expo+RN.

### 7-5. 인터넷 조사 핵심 사례 (subagent 리포트 박제)

| 사례 | 시사점 |
|---|---|
| **Cal.com (5명/3주)** | Expo+RN 생산성 검증 (1인이면 더 좁힌 범위) |
| **한국 1인 인디 (velog)** | Capacitor → RN 갈아탄 후회기 |
| **GoalPlan (Brunch)** | RN 1인 4개월+, MVP 안 줄여서 실패 |
| **토스** | WebView → RN, 1초+ 로딩 단축 |
| **당근마켓** | 핵심 native, 변경 잦은 영역만 file:// WebView |
| **Locket** | 위젯 풀 네이티브 → 2주 200만 가입 (OS-only 표면 점유 = viral 무기) |
| **App Store 4.2** | WebView 단순 래핑 reject. push·위젯·생체인증 추가 필수 |
| **Meta CPI** | 앱 인스톨 캠페인 평균 $3.75 vs 웹 CPA $35-55 |

### 7-6. 단계별 준비 순서

#### Phase 0 (지금 ~ 이번 주)
- ✅ 의사결정 박제 (이 문서)
- 🟡 Apple Developer Program 가입 ($99, 1-3일 승인) — **가장 시급**
- 🟡 Xcode 16 다운로드 (백그라운드)
- 🟡 Expo / Kakao Developers 계정 발급

#### Phase 1 (2-3주, 환경·학습)
- React Native 공식 튜토리얼 1번 완주
- Expo SDK 학습 (image-picker, sharing, notifications)
- Expo Router (Next.js App Router 비슷)
- TypeScript / NativeWind / Supabase JS SDK (대부분 익숙)

#### Phase 2 (1-2주, MVP 정의 + 셋업)
- MVP 범위 칼질 (admin·collection·history 등 1차 출시 제외)
- Expo 프로젝트 생성, EAS Build 셋업
- API endpoint는 Vercel 그대로 (서버리스 fn 재활용)

#### Phase 3 (3-4개월, 개발)
- 화면 1개씩 RN으로 옮기기 (사진 업로드 → 분석 → 결과 → 듣기 → 공유)
- 매주 1회 본인 폰 실기기 테스트 (Expo Go)
- 카톡 SDK (`react-native-kakao` mjstudio)

#### Phase 4 (2-4주, 심사·출시)
- App Store Connect 자료 (아이콘·스크린샷·Privacy Manifest·Privacy Labels)
- 4.2 통과 전략: **Push 알림 + 카메라 직접 촬영** 조합 (작업 부담 적음)
- TestFlight 베타 → 정식 심사
- 첫 reject 정상, 평균 2-3회 거침

#### Phase 5 (출시 후)
- EAS Update (JS OTA 업데이트, 심사 없이)
- Crashlytics·Sentry 모니터링
- Meta App Install 캠페인 검토

### 7-7. 가장 큰 함정 (한국 인디 후기 공통)

1. MVP 안 줄임 → 4개월 → 8개월 → 출시 못 함
2. 시뮬레이터로만 개발 → 실기기 카메라·share·push 다 안 됨 발견
3. Privacy Manifest 누락 → iOS 17.4+ 자동 reject
4. 카톡 로그인 URL scheme 미설정 → 무한 loop
5. 첫 심사 reject 좌절 → 정상이라는 걸 모름

### 7-8. 1인 + 바이브코딩 강점

| 영역 | 바이브코딩 활용 |
|---|---|
| 코드 작성·디버깅 | 🟢 압도적 (지금 conversation처럼) |
| 학습 가속 | 🟢 1/2-1/3 시간 단축 |
| 환경 셋업·Xcode 빌드 | 🔴 사람 직접 (한계) |
| 심사 답변·디자인·운영 판단 | 🔴 사람 직접 |

→ **1인 + 바이브코딩 = 한국 평균 4개월의 절반 ~ 비슷**으로 출시 가능 (이론상). 단 환경·심사는 단축 어려움.

### 7-9. 미적용 / 의도적으로 안 한 것

- **TWA로 Android 우선 출시 (1-2주)**: 가장 빠른 viral 회복 옵션이었지만, **Expo+RN 풀 앱이 어차피 Android 동시 빌드**라 별도 TWA 작업 부담만 늘어남. **Expo+RN으로 단일화** 결정.
- **Capacitor 검토**: 운영 부담 ↑ + 4.2 reject 위험 → 명시적 배제
- **Swift 풀 네이티브**: 1인 코딩 초보 컨텍스트 정면 충돌 → 명시적 배제
- **PWA 강화**: 인스타 webview 우회 효과 없음 → 우선순위 낮음
- **게스트 로그인 (Dotmap 패턴)**: 흥미롭지만 iOS 앱 도입 작업과 통합해서 진행 (Phase 4-5에서)

### 7-10. 사용자 본업 비유 박제

> "Capacitor는 플랫폼 입점, Expo+RN은 자사몰 직접 구축"

이 framework 앞으로 다른 의사결정에서도 ref:
- 검증된 product + 장기 의지 + UX 풀 컨트롤 → 자사몰
- 빠른 launch 검증 단계 + 인지도 0 → 입점

웹앱 + 앱 병행 운영 = 자사몰 + 스마트스토어 병행 운영 (트래픽 채널 별도 구축 필수).

---

## 8. 다음 우선순위

### 🔴 즉시 (사용자 결정)
- iOS 앱 진행: **Apple Developer Program 가입**부터 (승인 1-3일)

### 🟡 미정 (보류)
- Meta Ads Manager `{{campaign.name}}` 원인 점검 (사용자 보류 — §6-5)
- iOS 앱 plan을 [docs/IOS_APP_PLAN.md](docs/IOS_APP_PLAN.md)로 별도 박제 검토

### 🔵 백로그 (변동 없음)
- iOS Safari blur 실기기 검증 (StackBlur, commit `09006f9`)
- share_logs status PATCH 갭 디버깅 (§7-E-1 — 단 5/5는 NULL 0건이므로 우선순위 ↓)
- 5/8 funnel 데이터 분석 (§5/3 part2 §12)
- 카톡 silent 비율 분석 후 SDK 도입 결정
- iTunes 한↔일/한자 cross-script (§3-7, 9건)

---

## 9. 다음 세션 시작 멘트 후보

```
"Apple Developer Program 가입 진행. 승인 대기 동안 Expo 환경 셋업 + MVP 범위 draft"
```
또는
```
"iOS 앱 plan을 docs/IOS_APP_PLAN.md로 박제하고, MVP 범위 draft부터"
```
또는
```
"{{campaign.name}} Meta Ads Manager 원인 점검 (5/3 새벽 변경 이력 확인)"
```
또는
```
"iTunes cross-script bonus 며칠 후 점진 매칭률 ↑ 확인 (admin)"
```

---

## 10. 5/5 commit history

| commit | 변경 | 메모 |
|---|---|---|
| `e6eb539` | feat(itunes): scoreMatch K-POP 한글/영어 cross-script bonus +30 | 옵션 1 (코드만, lazy 흡수) |
