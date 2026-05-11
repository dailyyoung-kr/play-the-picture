# Session Handoff — 2026-05-11

> 5/11 박제. **개발 방향성·우선순위 결정 + Phase 1 (회원가입·인증) spec 작성 완료**.
> 대시보드 viral 측정 정직성 보강 (KEY METRICS organic 정의 통일·임계값 13건 데이터 기반 재조정·lifetime retention 카드 추가).
> 시장 reality 조사 (한국 음악 스트리밍·MBTI·운세·Lensa·indie SaaS·바이브코딩 카테고리·"오늘의 네컷" 모델).
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-10.md](./SESSION_HANDOFF_2026-05-10.md)
> 영구 참조: [PROJECT_DIRECTION_2026-05-11.md](./PRODUCT_DIRECTION_2026-05-11.md), [SPEC_phase1_auth.md](./SPEC_phase1_auth.md)

---

## 1. 한 줄 요약 (8건)

1. **INTERNAL device 65ce15ca 추가** — 운영자 본인 새 device 발견·추가 (commit `3a4cdad`)
2. **organic 비중 정의 통일** — KEY METRICS도 (null + ig + instagram) 합집합 (commit `5927242`)
3. **시장 reality 조사** — 한국 음악 스트리밍 MAU 2,345만 / 점신 1900만 / Lensa $50M peak / indie SaaS BEP $560/mo (도달 가능)
4. **카테고리 진단** — 플더픽 = #5 Entertainment/fun (7개 중 5번째 어려운 위치, viral peak 확률 5%)
5. **개발 방향성 결정** (commit `eba9f38`) — Option 3 (저장/기록 정체성) 70% + Option 2 (정체성 강화) 30%
6. **Phase 1 spec 작성** (commit `c3aa441`) — 회원가입 + 음악 동물 닉네임 + 데이터 마이그레이션
7. **로그인 옵션 결정** — Apple + Google + Passkey + 게스트 (옵션 D) + 사진 후 게이트 진입점
8. **닉네임 결정** — 음악 동물 패턴 (예: 🎵 노래하는 거위) 자동 부여 + 변경 가능

---

## 2. 5/11 commit 6개

| commit | 변경 |
|---|---|
| `3a4cdad` | INTERNAL device 65ce15ca 추가 (Stop The Rain 케이스) |
| `5927242` | organic 비중 정의 통일 (null + ig + instagram) |
| `eba9f38` | PRODUCT_DIRECTION 박제 (방향성·우선순위 결정) |
| `c3aa441` | Phase 1 SPEC 작성 (회원가입·인증·닉네임) |
| (handoff) | 이 파일 |

---

## 3. 시장 reality 박제 ⭐⭐⭐

### 3-1. 정정된 가정 (이전 답변 비관적)
| 가정 | 실제 | 시사점 |
|---|---|---|
| "한국 음악 결제 안 함" | 음악 스트리밍 MAU 2,345만 (47%) | 음악 활발, 단 추천 도구는 별개 |
| "한국 콘텐츠 결제 어려움" | 점신 1900만 / 마이타로 월 20,900원 | 한국은 콘텐츠 결과물 결제 활발 |
| "BEP 거의 불가능" | indie 46%가 $500-1k MRR (BEP) | 충분히 도달 가능 |
| "오늘의 네컷이 큰 매출" | My4Cut indie / **포토이즘 515억은 오프라인 매장** | 온라인 앱 자체로는 작은 수익 |
| "B2B vibe analysis 시장 X" | Brand24·Sprinklr·KKBC 시장 reality | pivot 가능 |

### 3-2. 우리 BEP 목표
- 광고비 75만원/월 ≈ **$560/mo**
- indie 46%가 도달하는 수준 (escape velocity)
- AI wrapper 도구: 80-95%가 fail / 60-70%가 zero revenue / 상위 3-5%만 $10k+ MRR

### 3-3. 한국 운세·사주 앱 사례 (가장 가까운 reference)
| 앱 | 모델 | 단가 |
|---|---|---|
| 점신 (1900만 user) | 광고 + 부적·굿즈 + 상담 + 광고 제거 패스 | 자유 결제 |
| 마이타로 | 구독 모델 | 월 20,900원 / 년 175,000원 |
| 헬로우봇 | 운세·타로 챗봇 | 결제 |

### 3-4. Lensa AI viral peak (1회성 도구 reference)
- 2022 12월 peak: 매출 $30.75M / 다운로드 19.3M
- 2023: $18M (-58% peak 후 declining)
- 모델: $4 일회 (50 avatars) / $7.99 월 / $29.99 연
- → **viral peak 짧음** (2-3개월), 그러나 한번 뜨면 큰 매출

### 3-5. 바이브코딩 product 카테고리 분류
```
1. B2B SaaS / Dev tools           ← 1-3개월에 $1k MRR (쉬움)
2. AI productivity wrapper        ← 80% fail
3. Niche utility                  ← 안정적
4. Content generative (viral)     ← Lensa-like, peak 짧음
5. ⭐ Entertainment / fun         ← 플더픽 (수익화 6-12개월 또는 X)
6. 콘텐츠·미디어 채널             ← 6-12개월
7. Social / community             ← VC 자금 없으면 X
```

→ 플더픽 = 7개 중 5번째 → 끝에서 3번째로 어려운 위치.

---

## 4. 개발 방향성·우선순위 결정 박제 ⭐⭐⭐

### 4-1. 데이터 기반 3가지 옵션 분석

**Option 1: Viral 활성화** — 이미 31% (best-in-class), 추가 marginal, ❌ ROI 낮음
**Option 2: 곡 추천 품질·정체성 강화** — 듣기 84% 압도적, ⚠️ marginal product upside, 큰 brand upside
**Option 3: ⭐ 저장/기록 앱 정체성** — 7%→30% 도달 시 카테고리 자체 이동 (#5→#3), 가장 큰 upside + risk

→ **결정: Option 3 (70%) + Option 2 (30%)**

### 4-2. 4단계 실행 우선순위

| # | 단계 | 시기 |
|---|---|---|
| 1 | 회원가입 도입 (Apple/Google/Passkey + 게스트) | Phase 1 |
| 2 | 저장/기록 업그레이드 (vibe archive·다이어리·월말 wrap) | Phase 2 |
| 3 | n회 이상 코인 결제 (My4Cut 식빵 모델 검토) | Phase 3 |
| 4 | iOS 네이티브 앱 출시 준비 | Phase 4 |

### 4-3. 보류
- Setlog 같은 SNS 네트워킹 (카테고리 본질 다름, 1인 indie + VC 자금 X)
- 인스타 콘텐츠 마케팅 (별도 검토)

### 4-4. 운영 원칙
- 광고 burn 멈추고 product 자체로 sustainable 만들기 — burn 0 = 가장 큰 무기
- 각 단계 게이트: 다음 단계 진입 전 검증 신호 확인
- 6개월 timeline: 각 단계 기대 신호 못 나오면 pivot/lean 검토

---

## 5. Phase 1 spec 핵심 결정 박제 ⭐⭐

### 5-1. 로그인 옵션 — 옵션 D
```
[Apple로 로그인]
[Google로 로그인]
[패스키로 로그인]
─────────────────
[게스트로 시작]
```
- 진입점: **사진 업로드 후 "다음" 클릭 시 게이트** (Dot Map 패턴)
- Auth provider: Supabase Auth
- Passkey 정체성 강조 + Apple/Google 친숙 + 게스트 fallback

### 5-2. 닉네임 — 음악 동물 자동 부여
샘플:
```
🎵 노래하는 거위
🎶 흥얼대는 토끼
🎧 이어폰 낀 수달
🎤 마이크 쥔 펭귄
🪕 우쿨렐레 든 사슴
🎹 피아노 치는 고양이
```
- 동물 50 × 음악 행위 30 = 1,500 unique 조합
- 충돌 시 숫자 suffix
- settings에서 변경 가능 (Phase 2)

### 5-3. 데이터 마이그레이션
- 게스트 device_id → 가입 시 user_id 자동 연결
- Transaction (실패 시 rollback)
- auth_logs 박제

### 5-4. 단계별 구현
- **Phase 1A (Week 1)**: Apple + Google + 게스트
- **Phase 1B (Week 2)**: Passkey 추가
- **Phase 1C (Week 3)**: 검증·iteration

자세한 spec: [SPEC_phase1_auth.md](./SPEC_phase1_auth.md)

---

## 6. 다음 세션 시작 plan

### 6-1. 셋업 사항 (사용자 직접)

다음 세션 첫 1-2시간 = 외부 셋업:

| 셋업 | 필수 여부 | 시간 |
|---|---|---|
| ~~`pg_dump` SQL backup~~ | ❌ skip 결정 (5/11) — Docker 의존성 + 우회 셋업 부담 vs DAU 작음·결제 데이터 X·Additive 변경·Feature flag로 risk 충분히 작음 | — |
| **Apple Developer 계정** | Apple Sign-In 쓰려면 (무료 OK) | 30-60분 |
| **Google Cloud OAuth client** | Google Sign-In 쓰려면 | 20-30분 |
| **Supabase Auth provider 등록** | Apple·Google 쓰려면 | 5분 |
| Feature flag 환경변수 추가 | ✅ 필수 | 1분 |

대안: **Passkey + 게스트만 먼저 시작** = 외부 셋업 0, 즉시 시작 가능.
- Phase 1A1: Passkey + 게스트 (셋업 0)
- Phase 1A2: Google 추가 (셋업 30분)
- Phase 1A3: Apple 추가 (셋업 1시간)

### 6-2. 다음 세션 첫 작업 (4-6시간)

```
A. SQL backup (5분)
B. Supabase Auth Apple+Google provider 등록 (5-10분)
C. DB migration 작성 (30분)
   - user_id 컬럼 추가 (entries·save_logs·share_logs 등 nullable)
   - auth_logs 테이블 신규
   - RLS 정책 추가 (기존 device_id 정책 keep)
   - users 테이블 nickname·nickname_emoji 컬럼 추가
   - 닉네임 자동 부여 trigger
D. Feature flag 환경변수 추가 (NEXT_PUBLIC_AUTH_GATE_ENABLED) (5분)
E. 로그인 팝업 컴포넌트 (1-2시간)
F. 사진 업로드 후 "다음" 게이트 진입점 (30분)
G. 데이터 마이그레이션 로직 (가입 callback) (1시간)
H. 가입 환영 화면 + 닉네임 변경 옵션 (1시간)
I. Admin 대시보드 "AUTH" 섹션 (1시간)
```

### 6-3. 다음 세션 시작 멘트 후보
```
"Phase 1A 시작 — 외부 셋업 (pg_dump + Apple/Google) → DB migration → 로그인 컴포넌트"
```
또는
```
"Phase 1A — Passkey + 게스트만 먼저 시작 (외부 셋업 0)"
```

---

## 7. 안전 메커니즘 박제 (Phase 1A 일괄 적용)

사용자 결정: **점진적 rollout 대신 일괄 적용** (DAU 50-70 + 게스트 옵션 + 결제·보안 데이터 X 이유).

유지할 안전 장치 3개:
1. **Feature flag** — 게이트만 ON/OFF (env 변경 1분)
2. **Additive DB 변경** — nullable 컬럼·새 RLS 정책만 추가, 기존 keep
3. **외부 SQL dump** — Free 플랜 백업 X 보완 (5분)

위험 시나리오 5가지 모두 30분 내 대응 가능. 자세한 plan: [SPEC_phase1_auth.md](./SPEC_phase1_auth.md) §10.

---

## 8. 다음 우선순위 (Phase 1 후)

### Phase 2 (저장/기록 업그레이드, Week 5-12)
- vibe archive 풀 구현 (다이어리·메모·태그·통계)
- 월말 vibe wrap (Spotify Wrapped 모델)
- 셰어 가능 컬렉션 URL
- settings 페이지 (닉네임 변경 등)

### Phase 3 (수익화 검증, Month 4-6)
- n회 이상 코인 결제 시스템
- 평생 이용권 (My4Cut 식빵 모델 차용)
- B2B affiliate (Spotify·Apple Music)
- 인스타 콘텐츠 마케팅

### Phase 4 (Month 6+)
- iOS 네이티브 앱
- 인스타 인앱 webview 우회
- Apple Sign-In 정책 충족
- DAU 200+ 시점 시작

---

## 9. 박제 메타 학습 (5/11에서 배운 것)

1. **랜덤 닉네임 = 가입 funnel 마찰 -10~15%** (당근·dotmap 검증). 우리 = "음악 동물" 패턴 (vibeType과 시너지)
2. **Passkey 인지도 글로벌 75%** but 한국 18-24 50-60% 추정 → primary X, secondary로
3. **Setlog 모델 ≠ 우리** — SNS 카테고리는 1인 indie + VC 자금 X 조합엔 거의 불가능
4. **"오늘의 네컷" 큰 매출은 오프라인 매장** (포토이즘 515억) — 온라인 앱 단독 indie 규모 (My4Cut)
5. **한국 콘텐츠 결제 시장 활발** — 점신 1900만, 마이타로 구독 20,900원. 우리 모델은 운세 카테고리 가장 가까움
6. **viral peak ≠ sustainable** — Lensa $30M peak 후 -58%. retention 모델 별개 필요
7. **카테고리 인식이 의사결정의 첫 단계** — "우리는 SNS 모델이 아니다" 인정이 plan의 시작
8. **시장 reality 조사 필수** — 추측 (이전 답변)이 데이터와 30-50% 어긋날 수 있음
9. **Free Supabase = 백업 직접 떠놓기** — pg_dump 5분 작업으로 안전 확보
10. **"점진적 rollout vs 일괄" 결정은 사용자 규모·결제 데이터 유무에 달림** — DAU 50-70 + 게스트 fallback이면 일괄 OK

---

## 10. 영구 박제 가치 항목 (PROJECT_KNOWLEDGE.md 이전 검토)

다음 항목은 영구 가치 있음:
1. **카테고리 분류 (#1 B2B → #7 SNS)** + 플더픽 위치 (#5)
2. **수익화 시장 reference** (운세·MBTI·Lensa·점신·인디 SaaS BEP)
3. **viral direct attribution 본질적 불가능** + cohort 측정 표준 (5/10 박제)
4. **외부 viral 앱 URL/QR 정책** (5/10 박제)
5. **Free Supabase 백업 정책** (pg_dump)

다음 세션 시 PROJECT_KNOWLEDGE.md 업데이트 검토.
