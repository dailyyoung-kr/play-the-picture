# Session Handoff — 2026-05-11 (Part 2)

> 5/11 박제. **Phase 1A 구현 완성·production 배포 (feature flag OFF, 실유저 영향 0)**.
> Apple Developer Program 가입 진행 중 (CSL 검토 hold) → Apple은 Phase 1B로 연기.
> 이전 핸드오프 (방향성·spec): [SESSION_HANDOFF_2026-05-11.md](./SESSION_HANDOFF_2026-05-11.md)
> 영구 참조: [SPEC_phase1_auth.md](./SPEC_phase1_auth.md), [EXTERNAL_SETUP_auth.md](./EXTERNAL_SETUP_auth.md)

---

## 1. 한 줄 요약 (8건)

1. **Phase 1A DB 인프라 완성** — migration_015 + 016 적용 (profiles + user_id 9테이블 + auth_logs + 닉네임 trigger + entries RLS)
2. **Phase 1A 코드 8 파일 commit** — Google OAuth + 게스트 + LoginGate + 서버사이드 마이그레이션
3. **Production 배포 완료** (`a109c30`) — feature flag OFF로 실유저 영향 0
4. **Apple Developer Program 가입 신청** → CSL 검토 hold (한국 이름 부분 매칭 false positive, 1-2주 대기)
5. **Google Cloud OAuth + Supabase provider 등록 완료** — 사업 도메인 GCP 활용 (개인 GCP 결제 회피)
6. **닉네임 디자인 2번 단순화** — 이모지 제거 + UNIQUE 제약 제거 + 환영 화면 자체 제거
7. **OAuth E2E 검증 통과** — Google 로그인 → /auth/callback → /preference 직행. profiles 1건·entries 13건·candidate_logs 200건 등 마이그레이션 확인
8. **3중 안전 장치 박제** — feature flag · additive DB · gitignored .env.local로 production 안전 보장

---

## 2. 5/11 (part 2) commit 2개

| commit | 변경 |
|---|---|
| `50c94bb` | feat(auth): Phase 1A DB 인프라 + spec (migration_015·016, EXTERNAL_SETUP, SPEC 업데이트) |
| `a109c30` | feat(auth): Phase 1A 로그인 게이트 — Google OAuth + 게스트 (Apple placeholder) |

---

## 3. Phase 1A 작업 흐름 박제

### 3-1. 외부 셋업
| 셋업 | 상태 | 비고 |
|---|---|---|
| Apple Developer Program 가입 | ⏳ CSL 검토 hold (1-2주) | 사용자 이름 부분 매칭 false positive. 신분증 업로드 페이지가 status로 redirect되는 sync 이슈 |
| Google Cloud OAuth Client | ✅ 완료 | 사업 도메인 GCP 활용 (개인 신규 결제 회피) |
| Supabase Google Provider | ✅ 등록 | Client ID + Secret 입력, Site URL/Redirect URL 설정 |
| Apple Service ID + Key | ❌ Apple 승인 후 진행 | Phase 1B 시작 시점 |

### 3-2. DB migration 2개

**migration_015** (auth 인프라):
- `public.profiles` 신규 (id FK to auth.users, nickname, device_ids[], created/updated_at)
- 9개 테이블에 `user_id uuid` 컬럼 additive nullable (entries, share_logs, share_views, try_click, preference_logs, analyze_logs, recommendation_logs, candidate_logs, analysis_results)
- `auth_logs` 신규 (device_id, user_id, event, metadata, created_at)
- `generate_random_nickname()` 함수 (30 행위 × 50 동물 = 1500 조합)
- `handle_new_user()` SECURITY DEFINER 트리거 (auth.users INSERT 시 profile 자동 생성)
- entries 추가 RLS 정책 3개 (auth user는 user_id 매칭으로 select/update/delete)

**migration_016** (디자인 단순화):
- profiles.nickname_emoji 컬럼 삭제
- generate_random_nickname/handle_new_user emoji 제거 재정의

**Advisor WARN 수정**:
- generate_random_nickname에 `SET search_path = public` 추가
- `REVOKE EXECUTE ON handle_new_user FROM anon, authenticated, public` (RPC 호출 차단)

### 3-3. 코드 8 파일 (commit `a109c30`)

```
src/lib/supabase-browser.ts                     ← @supabase/ssr 브라우저 클라이언트
src/lib/auth/feature-flag.ts                   ← isAuthGateEnabled()
src/lib/auth/log.ts                            ← logAuthEvent() (12개 event 타입)
src/app/api/auth/log/route.ts                  ← auth_logs INSERT 엔드포인트
src/app/auth/callback/route.ts                 ← OAuth 처리 + 마이그레이션 + 로깅 inline
src/app/auth/logout/route.ts                   ← 세션 정리 + redirect (Phase 2 재사용)
src/components/auth/LoginGate.tsx              ← 로그인 모달 (Apple disabled + Google + 게스트)
src/app/page.tsx                               ← handleNext 게이트 분기 + AuthErrorHandler Suspense
```

### 3-4. UX 이터레이션 3단계

| 단계 | 결정 | 이유 |
|---|---|---|
| 초기 | 닉네임에 이모지 + UNIQUE | spec §6 원안 |
| iter 1 | UNIQUE 제거 (동명이인 OK) | 정체성 = uuid라 운영 영향 X, 충돌 처리 로직 불필요 |
| iter 2 | 이모지 제거 | 텍스트만으로 캐릭터화 충분, dead column 회피 |
| iter 3 | 환영 화면 자체 제거 (callback → /preference 직행) | 마찰 제거, 닉네임 변경은 Phase 2 햄버거 메뉴로 |

---

## 4. 주요 결정 박제 ⭐⭐

### 4-1. 스펙 deviation: `ALTER auth.users` → `public.profiles`
- 스펙 §6-1 원안: `ALTER TABLE auth.users ADD COLUMN nickname` 등
- **변경 이유**:
  - Supabase 관리 schema 직접 수정은 향후 upgrade 충돌 위험 (예: 2024년 is_anonymous 추가)
  - JS SDK는 auth.users 커스텀 컬럼 자동 노출 X → 어차피 별도 query 필요
  - public.profiles는 RLS·인덱스 자유, 미래 user 메타데이터 확장 안전
- **Supabase 공식 권장 패턴**

### 4-2. 닉네임 UNIQUE 제거 결정
- 처음엔 suffix 패턴 (예: `노래하는 거위 #4283`) 검토
- 깊은 분석 후 **UNIQUE 자체 제거**로 결정
  - 닉네임 사용처 (공유 페이지 표시·admin) 모두 uuid 기반 → UNIQUE 불필요
  - 두 user가 `노래하는 거위` 가져도 운영 문제 0
  - 미래 친구·검색 기능 도입 시 Discord-style discriminator로 진화 가능

### 4-3. 데이터 마이그레이션 위치 — callback 서버사이드
- 처음엔 클라이언트(WelcomeNickname)에서 `/api/auth/migrate-device` 호출
- 환영 화면 제거하면서 callback route에 inline (service_role 클라이언트로 직접)
- 장점: HTTP hop 1번 제거, 환영 화면 없어도 마이그레이션 보장
- 영향: `/api/auth/migrate-device` 삭제됨 (callback에 통합)

### 4-4. Feature flag — production OFF 출발
- `NEXT_PUBLIC_AUTH_GATE_ENABLED=true` 로컬·preview만, production 미설정
- `.env.local`은 `.gitignore`로 제외돼 Vercel에 전파 X
- 향후 활성화: Vercel Dashboard → Environment Variables → Preview만 추가 → 1-2주 검증 → Production

---

## 5. 발견된 함정·해결 박제 ⭐

### 5-1. Suspense 경계 필수 (Next.js 16 정적 생성)
- `useSearchParams()` 직접 사용 시 prerender 실패
- 해결: `AuthErrorHandler` 분리 → `<Suspense fallback={null}>` 안에 감싸기
- 이후 다른 페이지에서도 useSearchParams 쓸 때 동일 패턴 필요

### 5-2. Claude Code 환경에서 ANTHROPIC_API_KEY 빈 문자열
- Claude Code subprocess가 `ANTHROPIC_API_KEY=""` shell env로 export
- Next.js가 shell env를 .env.local보다 우선시 → 키 인식 안 됨
- **영향 범위**: Claude가 띄운 백그라운드 dev 서버만. 사용자 일반 터미널 / Vercel production은 영향 X
- 해결: `unset ANTHROPIC_API_KEY` 후 dev 서버 시작 (테스트 환경에서만)

### 5-3. Apple Developer Program CSL screening hold
- 한국 이름 부분 매칭으로 자동 hold (false positive)
- 메일에 신분증 업로드 URL 안내됐으나 페이지가 status로 즉시 redirect (sync 지연)
- 권장: Apple Developer Support 직접 전화 (080-333-4000, 평일)
- 처리 시간: 24시간 ~ 2주

### 5-4. PostgreSQL 함수 return type 변경 — `CREATE OR REPLACE` 안 됨
- migration_016에서 emoji 컬럼 제거 시 함수 시그니처 변경
- `cannot change return type of existing function` 에러
- 해결: `DROP FUNCTION ... CASCADE` 또는 트리거·함수 정렬 순서로 `DROP TRIGGER → DROP FUNCTION → CREATE`

### 5-5. Supabase Dashboard SQL Editor — 긴 SQL paste 잘림
- migration_016 초안 (50+ 행) 붙여넣기 도중 `너구리,`에서 절단
- 해결: 4개 짧은 청크 (DROP / generate 함수 / handle_new_user 함수 / 검증)로 분리
- 교훈: 향후 큰 마이그레이션도 작은 청크로 쪼개서 실행

---

## 6. OAuth E2E 검증 박제

### 6-1. 흐름 작동 확인
```
/ (사진 업로드)
   ↓ "다음"
[LoginGate] Google 로그인 클릭
   ↓ (device_id를 callback URL query에 포함)
[Google OAuth] 동의
   ↓
[/auth/callback]
   ├─ 세션 교환 (cookie 설정)
   ├─ 9 테이블에 user_id UPDATE (entries 13, candidate_logs 200, recommendation_logs 359 등)
   ├─ profiles.device_ids에 append
   └─ auth_logs 3건 INSERT (google_login_success, signup_complete, device_migrated)
   ↓ redirect
/preference 정상 도착
   ↓
[분석 흐름] song / vibeType / vibeDescription 정상 응답
```

### 6-2. auth_logs 이벤트 12종
실측 확인된 이벤트:
- `gate_shown` ✅ (LoginGate 표시 시 클라이언트)
- `google_login_start` ✅ (Google 버튼 클릭 시 클라이언트)
- `google_login_success` ✅ (callback 서버사이드)
- `signup_complete` ✅ (callback 서버사이드)
- `device_migrated` ✅ (callback, metadata에 9테이블 업데이트 count)
- `guest_skip` ✅ (게스트 버튼 클릭)
- `nickname_regenerated` ✅ (옛 welcome 화면, 현재는 미사용 — Phase 2에서 재활용)

미사용 (Phase 1B+):
- `apple_login_start`, `apple_login_success`
- `nickname_changed`, `save_prompt_shown`, `save_prompt_signup`

### 6-3. profiles 검증
| 항목 | 값 |
|---|---|
| user_id | `bb137ba4-d82a-4d1e-bc30-9bed48340b44` |
| nickname | `흥얼대는 라마` (3번 regenerate 후 정착 — 옛 welcome 화면 테스트 흔적) |
| device_ids count | 1 |
| 데이터 이전 entries | 13건 (게스트 시절 저장된 vibe 전부) |

---

## 7. Production 배포 상태

### 7-1. 배포 정보
- Commits: `50c94bb` (DB infra) + `a109c30` (code)
- Vercel deployment: 39s build, Production Ready
- URL: https://play-the-picture.vercel.app
- Smoke test: `GET /` 200, `GET /auth/callback` 307, `POST /api/auth/log` 200

### 7-2. 실유저 영향 검증
- `NEXT_PUBLIC_AUTH_GATE_ENABLED` Vercel 미설정 → flag false
- `handleNext` 분기: flag false → 기존 `proceedToPreference()` 직행
- LoginGate 렌더 X, Supabase auth 체크 X, auth_logs 호출 X
- DB는 살아있지만 trigger는 가입 발생 시에만 발동 → 가입 0건 = 영향 0

### 7-3. 활성화 시점
- Apple Developer 승인 → Apple Sign-In 활성화
- Vercel Preview 환경 먼저 ON → 베타 테스터로 1-2주 검증
- 가입률 30%+ 검증되면 Production 활성화

---

## 8. 다음 우선순위

### 8-1. Apple Developer 승인 대기 중 가능한 작업
- **Phase 1B (Passkey)** — Supabase Auth WebAuthn primary 로그인 직접 통합 (+4-6시간)
- **Admin AUTH 섹션** — funnel 측정용 admin 카드 추가 (게이트 도달률·각 옵션 가입률·전체 가입률 등)

### 8-2. Apple 승인 후
- developer.apple.com에서 App ID · Service ID · Key 생성 ([EXTERNAL_SETUP §⑤](./EXTERNAL_SETUP_auth.md))
- Supabase Dashboard에 Apple provider 등록 ([§⑥](./EXTERNAL_SETUP_auth.md))
- LoginGate.tsx의 Apple disabled placeholder → 활성 버튼으로 교체

### 8-3. Phase 2 (저장/기록 업그레이드)
- 햄버거 메뉴 + settings 페이지 (닉네임 변경·로그아웃·계정 삭제)
- vibe archive 풀 구현 (다이어리·메모·태그·통계)
- 월말 vibe wrap

### 8-4. 진입 검증 신호 (Phase 1A → 1B 게이트)
- Vercel Preview에서 1주 데이터 측정 후:
  - Gate 도달률 70%+ 확인
  - Google 가입률 20%+ 확인
  - 가입 → /preference 분석 성공률 -10% 이내
- 통과 시 Production 활성화 → Phase 1B 진입

---

## 9. 영구 박제 가치 항목

### 9-1. PROJECT_KNOWLEDGE.md 후보
1. **Supabase 권장 패턴** — `auth.users` 직접 수정 회피, `public.profiles` + FK
2. **PostgreSQL 함수 return type 변경** — DROP CASCADE 후 CREATE 필수
3. **Next.js 16 useSearchParams Suspense 패턴**
4. **Feature flag 3중 안전 장치** (`.env.local` gitignore + Vercel 환경별 + 코드 guard)
5. **OAuth callback에서 device_id 전달 패턴** — `redirectTo` query param 활용

### 9-2. 메모리 update 후보
- 닉네임 디자인 결정 (이모지 X, UNIQUE X, 동명이인 OK) — 미래 닉네임 관련 작업 시 참고
- Apple Developer Program CSL hold — 한국 이름 사용자 가입 시 흔함

---

## 10. 다음 세션 시작 멘트 후보

```
"Phase 1B 시작 — Passkey 통합" (Apple 대기 중 작업)
```
또는
```
"Apple 승인 받았어 — Apple Sign-In 활성화 진행"
```
또는
```
"Phase 1A funnel 데이터 측정 / Admin AUTH 섹션 만들자"
```
또는
```
"Phase 2 시작 — 햄버거 메뉴 + settings 페이지"
```

---

## 11. 5/11 part 2 박제 메타 학습

1. **외부 셋업 = 가장 큰 일정 변수** — Apple CSL hold 1-2주, Google OAuth 30분, Supabase 5분. external 의존성은 일정 견적 시 ×2 safety margin
2. **Spec과 implementation은 평행하게 진화** — 스펙 §6-1 deviation 3개 (auth.users·UNIQUE·이모지) 발생. 스펙은 dogma X, 실제 구현 학습 따라 업데이트
3. **빈 화면 transit도 UX 마찰** — 닉네임 표시 환영 화면 1초도 사용자가 거부 → 직행이 정답
4. **Feature flag = production 안전망의 80%** — DB additive + flag false 조합으로 commit & deploy 부담 zero
5. **DB 트리거 + 서버 callback inline = 가장 깔끔한 OAuth 마이그레이션** — 클라이언트 fetch hop 제거, 단일 트랜잭션 (실패 시 rollback도 가능)
6. **Claude Code 환경의 env 충돌** — 백그라운드 dev 서버에서만 발생, 실서비스 무관. 향후 비슷한 진단 시 첫 의심 포인트
7. **Supabase SQL Editor paste 제한** — 50+ 행 SQL은 청크로 분리 실행 권장
8. **OAuth callback에서 device_id 전달** — `redirectTo` URL query param이 가장 간단. state 파라미터·쿠키·cross-tab storage 보다 추천
9. **Vercel auto-deploy의 신뢰성** — main push → 30-40s 빌드 → ready. 평소 환경 (env vars·domains·redirect URLs) 잘 설정돼있으면 안정적
10. **commit 분리의 가치** — DB와 코드 분리 commit으로 향후 revert·검토 유연성 확보 (DB 박제는 남기고 코드만 revert 가능)
