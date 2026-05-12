# Session Handoff — 2026-05-12

> 5/12 박제. **근본 fix + Admin AUTH + 카카오 로그인 + 약관·정책 + 게이트 ON + UX 폴리싱 + iOS 폴리싱 plan.**
> 코드 10 commit push 완료. **prod 게이트 ON** (5/12 18:30 KST 시점).
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-11_part3.md](./SESSION_HANDOFF_2026-05-11_part3.md)

---

## 1. 한 줄 요약 (10건)

1. **근본 fix** — API routes·클라이언트 insert에 user_id 박기 + save_logs.user_id 컬럼 추가 (migration_018) + callback merge 분기 A device_id-based migration. moved_rows 0→실숫자 정직화
2. **Admin AUTH 섹션** — 6 카드 (게이트 완료율·우세 가입 방식·비회원→정식 전환율·merge 충돌·닉네임 변경률·인증 에러 합계). 실 데이터로 임계값 재조정 (게이트 완료율 70/50, link 15/5)
3. **카카오 로그인 도입** — Supabase 표준 미지원이라 custom 통합 (REST API 토큰 교환 + magic link 세션 발급). anon→kakao merge·재로그인 idempotent 둘 다 검증 통과
4. **HamburgerMenu handleLinkKakao 버그 fix** — merge_from 미전달로 데이터 안 옮겨지던 문제. anon user_id 전달 → 합치기 정상 작동 확인
5. **이용약관 신규 + 개인정보 처리방침 업데이트** — 8조 minimal 구성. 회사 정보 명시 (리나린·박찬영·김판준·501-31-30511). OAuth 수집 정보 반영
6. **LoginGate disclaimer + Apple 준비중 버튼 제거** — implicit consent 텍스트(이용약관·개인정보 처리방침 링크). Apple은 승인 후 1줄로 복원
7. **D1 2.3% / D7 1.0% / D14 0.2%** 발견 — 사실상 retention 0. PtP는 burst-use 서비스 본질. 리텐션 강화 ROI 매우 낮음
8. **Organic 비중 24.6% vs Paid 75.4%** — organic 사용자가 engagement 1.9x 높음. CAC 절감 path = viral 강화 (K=0.01→0.3 도달 시 흑자 진입)
9. **결제·수익화 모델 검토** — PayApp 추천 (가입비 0, 4% 수수료, 사업자 활용 가능). 쿠팡 파트너스 활용 (24h attribution, 0 commitment). Phase 0 intent 측정 design 정리
10. **사주다이소·인아웃 케이스 스터디** — 사주다이소 ₩300만/월 가능 이유 (카테고리·가격·변동비 0·반복 구매). 인아웃 4-tier (광고·구독·가상화폐·본업 cross-sell). PtP는 viral 본질이라 다른 path

---

## 2. 코드 변경 박제 ⭐

### 2-1. 근본 fix (`e001178`)
**문제**: callback의 merge 분기 A가 `eq("user_id", mergeFrom)`로 row 매칭하는데, API routes·클라이언트 insert가 user_id를 안 박아서 항상 0건 매칭. `moved_rows: 0` 영원히.

**근본 원인**: migration_015에서 9개 테이블에 user_id 컬럼만 추가 (nullable), 트리거·코드 백필 누락. handoff part 3 §2-1 "모든 entries에 user_id 자동 부여" 진술은 design intent였고 실 구현 X.

**해결**:
- `src/lib/auth/server.ts` 신규 — `getCurrentUserId()` 헬퍼 (getSession 기반, ~0ms)
- 7 server API routes·2 클라이언트 insert에 user_id 추가
- `migration_018.sql` — `save_logs.user_id` 컬럼 + 인덱스
- callback 분기 A: 1단계(device_id+NULL→user) + 2단계(user_id=anon→user) 합산
- migrate-device·callback TABLES_TO_MIGRATE에 save_logs 포함

**검증**: account_merged.moved_rows에 entries 1, save_logs 1, candidate_logs 50, analysis_results 1, recommendation_logs 1 — 실숫자 박힘.

### 2-2. Admin AUTH 섹션 (`9c3322b`)
**위치**: [admin/page.tsx](../src/app/admin/page.tsx) KEY METRICS 다음·USERS 전.

6 카드 (모두 표본 부족 시 gray):

| 카드 | 측정 | 임계 (green/yellow/red) |
|---|---|---|
| 게이트 완료율 | `gate_resolved / gate_shown` | ≥70%/50%/<50% |
| 우세 가입 방식 | 다수 + 분포 (비회원/Google/Apple) | 정보형 (pink) |
| 비회원 → 정식 전환율 | `identity_link_start / anon_signup` | ≥15%/5%/<5% |
| merge 충돌 발생 | `account_merged / link_start` | ≤3%/≤5%/>5% (low-good) |
| 닉네임 변경률 | `nickname_changed / signup_complete` | ≤30%/≤50%/>50% (low-good) |
| 인증 에러 합계 | `*_failed` events | 0/<5/≥5 (절대값) |

**데이터 소스 변경**: `/api/admin/log-rows`에 auth_logs fetch 추가 (service_role 우회). admin/page.tsx에 `AuthLog` 타입·state·`filteredAuth` 패턴 적용.

**임계 재조정**: 게이트 노출 자체가 client flag 의존이라 "도달률"보다 "완료율" 측정이 funnel 본질에 맞음. link 임계 20→15는 산업 평균 5-15% 반영.

### 2-3. 카카오 로그인 도입 (`f6803b6`)
**Architecture**:
```
LoginGate "카카오로 로그인" → /api/auth/kakao/start?device_id=X&action=signin
  → kauth.kakao.com 인증
  → /api/auth/kakao/callback?code=...&state=...
  → 토큰 교환 → user info fetch
  → findSupabaseUserByKakao (kakao_id → email 매칭)
  → 신규: admin.createUser(user_metadata.kakao_id 박힘)
  → device_id 마이그레이션 or anon merge
  → admin.generateLink(magiclink) → token_hash
  → /auth/kakao-finalize?token_hash=...
  → 클라이언트 verifyOtp → 세션 확립
  → /?signup=success or /?merge_success=1
```

**신규 파일**:
- `src/lib/auth/kakao.ts` — 토큰 교환·user info fetch·authorize URL 헬퍼
- `src/app/api/auth/kakao/start/route.ts` — OAuth 인증 시작 (state에 device_id·merge_from·action 인코딩)
- `src/app/api/auth/kakao/callback/route.ts` — 토큰·user·merge·magic link 발급 (271줄)
- `src/app/auth/kakao-finalize/page.tsx` — 클라이언트 verifyOtp 세션 확립

**수정 파일**:
- `src/components/auth/LoginGate.tsx` — 카카오 노란 버튼 (#FEE500)
- `src/components/header/HamburgerMenu.tsx` — anon → 카카오 연동 옵션
- `src/lib/auth/log.ts` — `kakao_login_(start|success|failed)` 이벤트 추가

**검증 시나리오 통과**:
- Scenario 1 (anon → kakao merge): moved_rows 실숫자, CASCADE 삭제, device_ids 병합 ✓
- Scenario 2 (재로그인 idempotent): kakao_id로 기존 user 재사용, 중복 X ✓

**버그·fix**: 초기 구현에서 HamburgerMenu의 handleLinkKakao가 merge_from 누락. anon user_id 전달 추가 후 정상 작동.

### 2-4. 약관·정책 + Apple 버튼 제거 (`7fe88fa`)
**신규 `/terms` 페이지** — 8조 minimal 구성:
1. 목적·정의
2. 이용 자격 (만 14세 이상)
3. 회원 의무
4. 운영자 권리·책임
5. **부적절 콘텐츠 무관용 정책** (9개 금지 항목 — 사진 업로드 특화)
6. 책임 제한
7. 약관 변경
8. 준거법·관할 (서울중앙지방법원)

**회사 정보 명시**: 리나린 / 박찬영·김판준 / 501-31-30511 / 강동구 성내로6가길 8, 101호 / 0507-1303-5742 / dailyyoung@linareen.com

**`/privacy` 업데이트** — Section 1에 OAuth 수집 정보 추가, Section 4에 OAuth 인증 제공자 명시, Section 9에 회사 정보 박스 추가, 시행일 5/8 → 5/12.

**LoginGate disclaimer** — 비회원 로그인 버튼 아래 implicit consent 텍스트 + `/terms`·`/privacy` 새 탭 링크.

**Apple "준비 중" 버튼 제거** — LoginGate·HamburgerMenu 두 곳. Apple Developer 승인 시점 불명확(1-4주) + 사용자 마찰 ↓. 승인 후 1줄로 복원.

**의도적 생략 (검증 단계 fit)**:
- 마케팅 활용 동의
- explicit checkbox 가입 동의
- 결제·환불 조항
- 신고 절차 시스템

---

## 3. 발견·해결한 함정 박제 ⭐⭐

### 3-1. user_id 안 박는 버그의 본질
- migration_015가 컬럼만 추가하고 채우는 트리거·코드 안 만듦
- handoff part 3 §2-1 "user_id 자동 부여" 진술은 사실이 아닌 design intent
- callback merge 로직이 이 잘못된 전제 위에 구축됨 → 결과는 `moved_rows: 0`
- **교훈**: 핸드오프 박제 진술은 코드 검증 후 작성. design intent vs 사실 구분.

### 3-2. callback `state.action` 분기 함정
- HamburgerMenu link 시도 시 action="link" 전달
- callback에서 `if (existing && matchedBy === "email" && state.action !== "link")` 로 conflict 처리
- 의도: link 흐름은 사용자가 의식적으로 한 거니 conflict 우회
- 단 안전망: merge_from 없으면 결국 신규 user 생성됨 → 사용자가 "왜 데이터 안 옮겨졌지?" 의문
- **fix**: HamburgerMenu에서 merge_from 반드시 전달 (handleLinkKakao 수정)

### 3-3. Kakao = Supabase 표준 OAuth 미지원
- Google·Apple·GitHub 등은 표준 → linkIdentity·signInWithOAuth 한 줄
- Kakao·Naver·LINE는 표준 X → 커스텀 (200+ 줄)
- 우리 패턴: REST API 토큰 교환 → admin.createUser → admin.generateLink(magic link)
- 영향: 같은 user에 신분증 추가가 아닌 새 user 만들고 데이터 이전. 더 복잡하지만 결과 동일.

### 3-4. listUsers 페이지 제한
- 현재 코드: 최대 10 page × 100 perPage = 1,000 users sweep
- 현재 user 10명이라 무관, 단 DAU 1만+ 도달 시 RPC 함수로 전환 필요
- **box note**: 미래 사용자 확보 후 우선순위 ↑

### 3-5. NEXT_PUBLIC_KAKAO_REST_API_KEY 노출
- client_id는 OAuth 표준상 공개 정보 (브라우저 redirect URL에 들어감)
- NEXT_PUBLIC_ 접두사로 의도적 노출
- CLIENT_SECRET은 서버 전용 (NEXT_PUBLIC_ 없음)
- 위조 위험은 매우 낮음. 산업 표준 패턴.

### 3-6. 카카오 비즈 앱 검수
- Kakao Sync 이메일 수집은 비즈 앱 검수 필요 (사업자 등록증 제출)
- 검수 전엔 닉네임만 받음. 검수 후 이메일 자동 활성화
- 검증 단계엔 닉네임만으로 충분. 사용자 식별은 kakao_id로 함

---

## 4. 5/12 핵심 결정 박제

### 4-1. 포지셔닝: viral·웹앱 메인 (리텐션·native 안 함) ★
**실 데이터 근거**:
- D1 2.3%, D7 1.0%, D14 0.2% → 사실상 retention 0
- 헤비유저(20회+)도 5.5일 안에 burst 후 떠남
- vibeType 공유 콘텐츠 = MBTI·심리테스트류 = viral 잠재력
- 광고 75% / Organic 25% but organic engagement 1.9x 높음

**결정**:
- 메인 channel = 웹앱 (설치 마찰 0, viral 친화)
- 핵심 lever = K-factor 0.01 → 0.3 (도다마인드급)
- 리텐션 강화 노력 ROI 낮음 → 우선순위 ↓
- Native는 보조 (App Store 검색 + 광고 retargeting), 메인 매출 lever 아님

### 4-2. 카카오 도입 timing
- Apple 승인 대기 중 (1-4주 변동)
- Apple parallel 작업으로 카카오 먼저 도입
- 인프라 70% 재사용 가능 (iOS 출시 시 native SDK만 추가)
- 18-24 한국 여성 가입 마찰 ↓ 효과 예상

### 4-3. 결제 모델 검토 결과 (구현은 후순위)
- 객단가 ₩2-3천 직접 결제 = 고정 수수료 13% 손실
- **Stored Credit Wallet 패턴이 정답** (₩10,000 충전 + ₩833/회 차감)
- 한국 PG 추천: PayApp (가입비 0, 4% 수수료, 사업자 활용)
- 토스는 11만원/년 가입비 → 검증 단계엔 부담
- 검증 단계엔 결제 도입 시기상조 (DAU 50-70). DAU 1,000+ 도달 후 본격

### 4-4. 약관 minimal 8조 구성
- Liner 15조, Dotmap 12조 → 우리는 8조로 압축
- 결제 조항 placeholder도 생략 (도입 시점에 추가)
- 마케팅 동의·explicit checkbox 모두 생략 (검증 단계 fit)
- 부적절 콘텐츠 무관용 정책만 강화 (사진 업로드 abuse 대응)

### 4-5. Apple 버튼 즉시 제거
- "준비 중" disabled 버튼 = UX noise
- Kakao + Google = 18-24 한국 여성 100% cover
- 승인 후 1줄로 복원 가능
- 사용자에게 보이는 마찰만 제거

### 4-6. 안내 모달 vs 자연 흐름 (Kakao 데이터 merge)
- Google linkIdentity = 같은 user에 신분 추가, 데이터 이동 없음 → 안내 불필요
- Kakao = 새 user + 데이터 이전 발생 → 안내 가치 있음
- 단 검증 단계엔 자연 흐름 + merge_success 토스트로 충분. 사전 모달 X.

---

## 5. 데이터 분석 핵심 인사이트 ⭐⭐⭐

### 5-1. 사용자 분포 (28일, 외부 1,050명)
| 임계 | devices | % | 누적 분석 | volume % |
|---|---|---|---|---|
| 1회만 | 535 | 51% | 535 | 18.4% |
| 2-4회 | 375 | 36% | 975 | 33.6% |
| 5-9회 (P75-P90) | 95 | 9% | 599 | 20.6% |
| 10-19회 (P90-P98) | 33 | 3% | 436 | 15.0% |
| 20회+ (P99 헤비) | 12 | 1% | 364 | 12.5% |

**핵심**: 51% 1회 사용자. P95 = 9회. P99 = 21회. 평균 2.76회.

### 5-2. Burst 패턴
- P99 헤비유저: 30.3회 평균, **2.7 active days**, 5.5일 span
- 사용 패턴: "한 번 와서 burst로 다 쓰고 떠남"
- 시사: 월 구독 부적합. 일일 cap 의미 약함. **One-time credit pack이 fit**.

### 5-3. Viral 지표
| 단계 | 수치 |
|---|---|
| 공유한 device | 68 (6.5%) |
| share_views (다른 device가 봄) | 99 |
| try_click 누른 device | 14 |
| 실제 분석까지 간 device | 11 |
| story_save (스토리 저장) | 164 (15.6%/user) |

**K-factor 추정**: 0.01 (1,050 사용자에서 11 신규 viral 유입)
- 도다마인드급 viral: 0.3+
- TikTok·MBTI viral: 0.3-1.0+
- 평균 모바일 앱: 0.05-0.15
- **우리는 viral 모델로 보면 매우 약함**

### 5-4. Paid vs Organic cohort (★ 결정적)
| 항목 | Paid (792명) | Organic (258명) |
|---|---|---|
| 비중 | 75.4% | 24.6% |
| 평균 분석 횟수 | 2.90 | **5.54** (1.9x) |
| 저장률 | 10.1% | **14.0%** (1.4x) |
| URL 공유율 | **6.8%** | 5.4% |
| 스토리 저장률 | **12.6%** | 8.1% |

**해석**: Organic 사용자가 진성, Paid 사용자가 viral 행동 살짝 강함. 광고가 viral 동력은 만들지만 진성 유저는 organic. CAC 절감 = organic 확대.

### 5-5. 단위 경제 매트릭스
| segment | 비용 (28일) | 매출 | 손익 |
|---|---|---|---|
| 1회 사용 (51%) | ₩40 | 0 | -₩40 |
| 5-9회 (9%) | ₩250 | ₩125 (가정 쿠팡 50%) | -₩125 |
| P99 헤비 (1%) | ₩1,212 | ₩390 (3 모달) | -₩820 |

**LTV/CAC 비교**:
- CAC: ₩500/유저 (광고)
- LTV (28일): ₩22/유저 (모든 BM 가정 합)
- LTV/CAC = 0.044 — 표준 SaaS의 1/7
- **흑자 path = 매출 ↑가 아니라 광고비 ↓** (viral 확대로 CAC 절감)

---

## 6. iOS 이식성 재정리 (5/12 업데이트)

기존 (5/11 part 3) 분석에 카카오 추가:

### 100% 재사용
- Supabase DB·user 모델·user_metadata.kakao_id 식별 패턴
- callback merge 로직 (개념·서버 구현)
- 카카오 개발자 계정·앱 (Bundle ID만 추가 등록)
- REST API 키·CLIENT_SECRET
- `/api/auth/kakao/callback` 토큰 교환·user 매칭·세션 발급 (iOS도 같은 endpoint 호출 가능)

### iOS 추가 작업
- Kakao iOS SDK 통합 (Swift / React Native)
- Apple AuthenticationServices framework (Apple 승인 후)
- URL Scheme·Universal Links 설정
- 네이티브 로그인 버튼 UI

**핵심**: Web Kakao 인프라 70%가 iOS native에 재사용됨. Web 작업이 iOS의 기반.

---

## 7. 미커밋·미해결 항목

### 미커밋 (불필요)
- 핸드오프 작성용 자료 외 코드 변경 없음

### 미해결·후순위
- Apple Sign-In 승인 대기 → 활성화 후 1줄 복원
- listUsers 페이지 limit → DAU 1만+ 도달 시 RPC로 전환
- 카카오 Sync 이메일 검수 신청 → 진행 권장 (3-7 영업일)
- AccountConflictModal 텍스트 "Google 계정" 하드코딩 → Kakao→Google conflict는 OK, Kakao→Apple은 미세 어색

---

## 8. 안전 메커니즘 재확인

- ✅ `NEXT_PUBLIC_AUTH_GATE_ENABLED` Vercel production 미설정 — 게이트 OFF 그대로
- ✅ DB schema additive (migration_018 save_logs.user_id) — 기존 흐름 영향 0
- ✅ KAKAO_CLIENT_SECRET 서버 전용 (NEXT_PUBLIC_ 없음)
- ✅ KAKAO_REST_API_KEY는 OAuth 표준 공개 정보 (위조 위험 X)
- ✅ Kakao 라우트는 isKakaoConfigured 가드 (env 없으면 즉시 error redirect)
- ✅ Rollback: Vercel env에서 KAKAO_REST_API_KEY 제거 → 즉시 비활성

---

## 9. 다음 세션 시작 plan

### 9-1. 즉시 검증 (선택)
- production https://playthepicture.com/api/auth/kakao/start?device_id=test 직접 접속 → 카카오 인증 페이지 redirect 확인
- production /terms·/privacy 페이지 표시 확인
- 게이트 OFF 상태 유지 확인 (사용자에게 UI 안 보임)

### 9-2. Apple 승인 대기 동안 할 수 있는 작업 후보

**A. Phase 0 intent 측정 (1-2시간)**
- 5회+ user에게 모달 (쿠팡 보고 unlock / 친구 공유 + 3회 / X 닫기)
- 클릭률 데이터 수집
- 매출 발생 (쿠팡 affiliate 24h attribution)
- 검증 데이터 기반으로 본격 결제 도입 결정

**B. K-factor 강화 (1-2일)**
- vibeType 공유 friction 줄이기 (share_views → try_click 14% → 30% 목표)
- Story save 워터마크에 URL/QR (164 story save → 신규 device 유입으로 연결)
- 인스타 스토리 공유 UX 매끄럽게

**C. 카카오 Sync 이메일 검수 신청**
- 사업자 등록증 제출 (3-7 영업일)
- 검수 후 이메일 동의 항목 자동 활성화
- 향후 CS·복구 인프라 강화

**D. /admin 약관 정책 검토 도구**
- 회사 정보 변경·약관 갱신 시 admin에서 미리보기
- 변경 history 추적
- 가치 작음 (수동 변경 빈도 낮음)

### 9-3. Apple 승인 후
- Apple Developer Service ID 등록
- Supabase Apple provider 활성화
- LoginGate·HamburgerMenu에 Apple 버튼 복원 (1줄 추가)
- iOS 출시 시 native AuthenticationServices framework 통합

### 9-4. Phase 1B 진입 검증 신호 (재확인)
- Vercel Preview env에 `NEXT_PUBLIC_AUTH_GATE_ENABLED=true` 1주 측정
- 게이트 완료율 70%+
- 비회원 가입 비율
- 닉네임 변경률 < 50%
- 인증 에러 합계 < 5건/일
- 통과 시 Production 활성화 검토

### 9-5. 다음 세션 시작 멘트 후보
```
"Apple 승인 받았어 — Apple Sign-In 활성화"
```
또는
```
"5/13 시작 — Phase 0 intent 모달 구현 (쿠팡 + 공유 + X)"
```
또는
```
"viral 강화 — vibeType share UX 개선"
```

---

## 10. 5/12 박제 메타 학습

1. **handoff 진술은 사실 vs design intent 구분 필수** — part 3의 "user_id 자동 부여" 진술이 사실이 아닌 의도였고, 그 위에 callback merge 로직 빌드해 버그 만듦. 박제 시 코드 검증 후 작성.

2. **카카오 통합은 Supabase 표준 미지원이라 200+줄 custom** — Google·Apple linkIdentity 한 줄 대비 큰 차이. 한국 시장 진입 시 이 비대칭 인지하고 시간 산정.

3. **데이터 검증 시 placeholder UUID 그대로 실행 위험** — Scenario 검증 중 사용자가 `<anonUserId>` 그대로 SQL 실행해서 시간 낭비. 검증 SQL은 실제 UUID 채워서 제공.

4. **moved_rows 0이 정상으로 보이는 함정** — 데이터 없는 anon이 link한 경우 자연스럽게 0건. 진짜 버그(API에 user_id 안 박힘)인지 표면적 동작인지 구분하려면 사용자 데이터 있는 케이스로 검증 필수.

5. **D7 retention 1% = 리텐션 강화 ROI 매우 낮음** 인지 → BM 방향 결정. 산업 평균(10-15%) 대비 10x 낮으면 본질이 다른 카테고리(burst-use)임을 인정.

6. **광고 cohort engagement < organic cohort** — 광고로 데려온 사용자가 진성이 아니라는 일반 인사이트. CAC 절감 path = organic·viral 확대.

7. **Burst pattern → 구독 부적합, 가상 화폐 적합** — 인아웃이 매일 사용 도구라 구독 viable, PtP는 burst라 credit pack viable. 같은 BM이 모든 카테고리에 작동 X.

8. **사주다이소 ₩300만 매출 = 카테고리·가격·변동비·반복 구매 절묘한 조합** — 우리 카테고리(음악 추천)는 다른 path 필요. 같은 매출 액수 노리면 비현실적.

9. **검증 단계 약관·정책 = minimal 8조 충분** — Liner 15조·Dotmap 12조 그대로 따라하지 않음. PIPA·전자상거래법 최소만, 결제·신고 등은 도입 시점에 추가.

10. **Apple "준비 중" 버튼 = UX noise** — disabled 버튼은 사용자에게 "왜 안 됨?" 의문 생성. 활성화 시점 불명확하면 차라리 안 보이는 게 conversion에 좋음.

---

## 11. 영구 박제 후보 (PROJECT_KNOWLEDGE 업데이트 검토)

1. **Kakao 통합 패턴 (Supabase 미지원 OAuth)** — REST API 토큰 교환 + admin.createUser + magic link 세션 발급. 200+줄 custom 코드 표준
2. **`getCurrentUserId()` server helper** — getSession 기반 user_id 추출. API route insert 시 user_id 박는 표준 패턴
3. **Burst-use 서비스에 stored credit wallet 모델** — 구독·일일 cap 부적합, ₩10,000 충전 → ₩833/회 차감
4. **K-factor 0.01 = 흑자 path = CAC 절감** — 매출 ↑보다 광고 의존도 ↓이 중요. organic 확대 lever (vibeType share UX·셀럽·트렌드 연계)
5. **/api/admin/log-rows 확장 패턴** — RLS 우회용 admin 데이터 fetch 라우트. AUTH 추가 데이터 소스 통합 표준
6. **회사 정보 명시 (PIPA 요구)** — /privacy·/terms 두 곳에 일관 박기. 사업자 정보 placeholder로 시작해 본인이 채우는 흐름
7. **모달 단일 흐름 = 동시 재생 자연 처리** — 글로벌 player manager 없이 PreviewPlayer unmount 시 audio.pause() cleanup만으로 충분
8. **AUTH 데이터 cutoff 패턴** — 게이트 ON 시점 기준 timestamp 컷오프로 검증 데이터 자동 제외 (env var 또는 hardcoded constant)

---

## 12. 5/12 추가 작업 (핸드오프 작성 후 — `7bb4387` 이후)

핸드오프 작성 후 동일 세션 내 5 commit 추가 + 운영 결정·이슈 발견:

### 12-1. 코드 commit (5건)

| commit | 내용 |
|---|---|
| `8eab4dc` | **perf(auth)**: 비회원 로그인 응답성 개선. 4 logAuthEvent + migrate-device sequential await(3-4초) → 로깅 fire-and-forget + signInAnonymously·migrate-device만 await. loading state ("잠시만 기다려주세요...") 추가. 1.5초로 단축 |
| `967e8ba` | **feat(header)**: HamburgerMenu 아이콘 분기. 비로그인=MoreHorizontal(•••), 로그인 후=User. 사용자 본인 상태 시각 구분 |
| `971860b` | **feat(preview)**: journal 모달 미리듣기 + PreviewPlayer 컴포넌트 추출. result 페이지의 200+줄 preview 로직 → 재사용 컴포넌트로 분리. journal에서 entry 클릭 시 모달에서 30초 미리듣기 가능. 카드 사진 영역 stopPropagation 제거 → 사진 탭으로도 모달 열림. "다시 듣기" → "음악앱에서 듣기" 라벨 통일 |
| `26418f9` | **feat(journal)**: 카드 우측 ▶ 외부 듣기 버튼 제거 (미리듣기·외부 듣기 모두 모달로 단일화). 사진 인디케이터 조건 hasCarousel(≥2) → photos.length>0 (1장도 "1/1" 표시) |
| `e0fd893` | **fix(admin)**: AUTH 섹션 데이터 cutoff. AUTH_PROD_START_UTC=2026-05-12T09:30:00Z 컷오프 추가 → 게이트 ON 전 검증 데이터(Scenario 1·2) 자동 제외 |

### 12-2. ★ 게이트 ON 결정 (운영 변경)

- 결정 시점: 2026-05-12 18:30 KST
- Soft Launch 단계 skip하고 바로 prod ON (롤백 비용 0 — env var 토글)
- Vercel env에 `NEXT_PUBLIC_AUTH_GATE_ENABLED=true` 추가 (Production만)
- 검증된 흐름 (Scenario 1·2 통과 + 카카오 로그인 동작 확인)에 기반

**모니터링 대상**:
- 분석 성공률 (평소 95%+ vs Anthropic 부하 시 감소)
- 게이트 완료율 (signup_complete + guest_skip + anon_success / gate_shown)
- 비회원·Kakao·Google 분포

**롤백 path**: Vercel env `NEXT_PUBLIC_AUTH_GATE_ENABLED` 값을 `false`로 또는 변수 삭제 → 자동 redeploy 1-2분.

### 12-3. 발견·박제한 함정·이슈

#### a) Instagram in-app browser → Safari cross-browser 데이터 격리
- 사용자가 인스타 인앱에서 사용 후 Safari로 직접 진입 시 localStorage·세션 분리 → 데이터 안 보임
- **해결**: OAuth 로그인 = profile.device_ids 누적 → 어느 브라우저에서든 동일 데이터 접근 가능
- 게이트 ON이 cross-browser UX 정상화 핵심 lever임을 데이터로 검증

#### b) Anthropic API 529 (overloaded) 발생
- 5/12 15:30-16:30 KST 1시간 사이 분석 실패 3건 (2 device, 모두 overloaded)
- 동시간대 성공률 4/7 = 57% (평소 95%+ 대비 매우 낮음)
- device B는 1분 안에 2번 연속 실패 → 이탈 가능성 큼
- 우리 측 버그 X, Anthropic 글로벌 부하
- **대응 옵션 (구현 안 함, 박제)**:
  - A. 서버 자동 retry (1-2초 후 1회) — 짧은 hiccup 복구
  - B. Fallback model (Opus → Sonnet) — 부하 시 quality 살짝 ↓·비용 ↓·성공률 ↑
  - C. 모니터링 알림만

#### c) 로그아웃 후 journal 일부 entry 안 보이는 현상
- 사용자가 로그인 시 cross-device 데이터 3개 → 로그아웃 후 2개만
- **원인**: profile.device_ids 합집합 → 로그아웃 시 현재 device_id만 매칭
- by design 동작 (privacy + 데이터 분리). 단 사용자 인식 마찰 있음
- 후속 대응 option: "더 많은 기록이 있어요. 로그인하면 모두 보여요" 안내 추가 (현재 보류)

#### d) AUTH 섹션 cutoff 적용 후 본인 device 인지 issue
- cutoff 적용해도 본인 device(15cc7b32)가 INTERNAL_DEVICE_IDS에 등록돼 있어 "user" 모드 필터됨
- → 실 외부 사용자 게이트 통과해야 AUTH 섹션 숫자 잡힘
- 현재 임시: admin 상단 "테스트" 모드 토글로 본인 데이터 확인

### 12-4. UX 개선 박제

#### 사진 탭 → 모달 열림 fix
- journal/page.tsx 카드 사진 영역의 `onClick={(e) => e.stopPropagation()}` 제거
- 사용자가 사진 영역 탭 시 무반응 → 모달 정상 열림 (`971860b`에 포함)

#### 카드 UI 정리
- 카드 우측 ▶ 외부 듣기 버튼 제거 → 미리듣기·외부 듣기 모두 모달에서 처리 (`26418f9`)
- 사진 인디케이터 1/1 통일

---

## 13. iOS Expo 앱 폴리싱 plan ★

**현 상태** (`/Users/pcy_mac/play-the-picture-app/`):
- Expo SDK 54, React Native 0.81, Expo Router 6
- 4 화면 (index, preference, result, journal) — 약 4,000줄
- PreviewPlayer · ListenSheet · StoryCard 컴포넌트
- supabase.ts 45줄 (minimal, anon key client only)
- **AUTH 기능 거의 없음** — LoginGate·Kakao·signInAnonymously 모두 미구현
- 카카오 SDK 미설치 (lucide-react-native에 KakaoTalk 아이콘만 share용)

→ **web Phase 1A 수준 sync 필요**.

### 13-1. 기반 인프라 (1-2일)

| 작업 | 내용 | 시간 |
|---|---|---|
| Supabase Auth React Native 통합 | `@supabase/supabase-js` + SecureStore session persist | 0.5일 |
| Kakao iOS SDK 통합 | `@react-native-kakao/core` + `@react-native-kakao/user` (또는 EAS Config Plugin) | 0.5일 |
| Apple Sign-In native | `expo-apple-authentication` (Apple 승인 후) | 0.5일 |
| AsyncStorage device_id → user.id 마이그레이션 | web과 동일 흐름 | 0.5일 |

### 13-2. 화면 단위 sync (2-3일)

| 화면 | 작업 |
|---|---|
| **LoginGate** (신규) | RN 모달 컴포넌트. Kakao·Google·Apple·비회원 4 옵션 + disclaimer (Terms/Privacy 링크) |
| **HamburgerMenu** (신규) | RN drawer/popover. 닉네임·로그아웃·연동 옵션 |
| **AccountConflictModal** (신규) | merge 흐름 처리 |
| **index** | 사진 추가 → 다음 클릭 시 LoginGate trigger (web과 동일 조건) |
| **result** | OAuth user 한정 entry 저장 (현 비회원 흐름과 양립) |
| **journal** | profile.device_ids 합집합 query (web과 동일) |

### 13-3. 백엔드·공유 자산 재사용

- ✅ Supabase DB·user 모델·migration 모두 공유
- ✅ `/api/auth/kakao/start·callback` 라우트 그대로 사용 가능 (RN webview·딥링크로 호출)
- ✅ AccountConflictModal merge 로직 callback 그대로 작동
- 단 redirect URI는 RN deep link 전용 새 등록 필요 (예: `playthepicture://auth/callback`)

### 13-4. Tracking 통일

- web의 logAuthEvent 동일 이벤트 타입 (gate_shown, kakao_login_*, anonymous_signin_*, signup_complete 등)
- iOS native에서도 `/api/auth/log` 호출
- admin AUTH 섹션이 iOS 데이터도 자동 집계

### 13-5. 약관·정책

| 옵션 | 작업 |
|---|---|
| WebView로 web 페이지 노출 | https://playthepicture.com/terms·/privacy 그대로 표시. 일관성 ↑, 작업 최소 |
| RN 화면 별도 작성 | 텍스트 복붙. iOS 디자인 가이드 적용 가능 |

→ **WebView 권장** (동기화 자동, 변경 시 web만 수정).

### 13-6. iOS 특화 추가

- **Apple Sign-In** ← 승인 후 native AuthenticationServices framework
- **Universal Links** — `playthepicture.com/share/...` URL을 iOS 앱에서 직접 열기
- **Push notification** (선택) — APNs로 viral 신호·재방문 알림
- **Haptics** (이미 expo-haptics 있음) — 분석 완료·저장 시 미세 진동

### 13-7. App Store 심사 대응

- App Store Review Guidelines 5.1.1 (수집 데이터·동의) — /privacy 링크 노출 필수
- 5.1.2 (Apple Sign-In 의무) — 다른 OAuth 있으면 Apple도 제공
- Apple Developer 승인 떨어지면 Apple Sign-In 활성화·UI에 노출
- 2026 App Privacy "Nutrition Label" 작성 (수집 데이터 명시)

### 13-8. 권장 진행 순서

1. **Phase 1 (1-2일)** — Supabase Auth + Kakao SDK 인프라 구축 + AsyncStorage session persist
2. **Phase 2 (1일)** — LoginGate·HamburgerMenu 화면 작성
3. **Phase 3 (1일)** — index 화면에 게이트 trigger + result·journal에 user_id flow 적용
4. **Phase 4 (반일)** — WebView로 /terms·/privacy 노출
5. **Phase 5 (Apple 승인 후, 1일)** — Apple Sign-In 활성화
6. **Phase 6 (선택, 1-2일)** — Universal Links + Push notification

**합계: 약 4-6일 작업** (Apple 승인 대기 동안 1-4 진행 가능)

### 13-9. 짚어볼 점

- web의 카카오 callback은 magic link 발급 → 클라이언트 verifyOtp 패턴. RN에선 deep link로 finalize page 호출 또는 직접 세션 발급 endpoint 별도 검토
- Apple Sign-In의 relay email 처리 (web과 동일 — `sub` identifier로 매칭)
- iOS 앱 분석 비용은 web과 동일 Anthropic API 사용 → 분석 횟수 제한·결제 모델도 양 플랫폼 공유
- 검증 단계엔 Web에서 사용자 분포 데이터 모은 후 iOS 출시 결정 권장
