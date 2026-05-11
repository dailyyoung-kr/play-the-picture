# Session Handoff — 2026-05-11 (Part 3)

> 5/11 박제. **Anonymous Sign-In 도입 + linkIdentity merge UX + 미시 디테일 다듬기**.
> Phase 1A 코어 흐름이 사실상 마무리 단계. Apple Developer 승인 대기 + 검증 + Admin 섹션 남음.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-11_part2.md](./SESSION_HANDOFF_2026-05-11_part2.md)
> 영구 참조: [SPEC_phase1_auth.md](./SPEC_phase1_auth.md)

---

## 1. 한 줄 요약 (10건)

1. **Anonymous Sign-In 도입** — 게스트도 Supabase auth.users (is_anonymous=true) + 자동 닉네임 부여. localStorage-only 게스트 폐기
2. **linkIdentity 업그레이드 흐름** — 햄버거 메뉴에서 "Google 계정 연동" → 같은 user_id 유지하며 OAuth identity 추가
3. **충돌 시 merge UX** — 같은 Google 이메일이 다른 user에 묶여있으면 `AccountConflictModal` → "기존 계정으로 로그인" → anon 데이터 자동 합치기
4. **migration_017 적용** — nickname CHECK 제약 (1-13자), `profiles` UPDATE 컬럼 제한 (nickname·updated_at만), `auth_logs` anyone-insert 정책 제거
5. **닉네임 13자 결정** — 풀 1500 조합 전수 커버 (`턴테이블 돌리는 고슴도치` 최대), retry 로직 불필요
6. **/journal user.device_ids 기반 조회** — 로그인 시 cross-device 자연 작동 (스키마 변경 없이 device_ids 배열 IN query)
7. **bfcache 우회 fix** — OAuth 이탈 후 뒤로가기에서 React가 hydrate 안 되는 케이스 발견 → layout.tsx inline script로 강제 reload
8. **HamburgerMenu 미니멀 리디자인** — 이모지 제거, 닉네임 강조, OAuth 연동 버튼 스타일 분리
9. **이름·라벨 다듬기** — `가입 없이 시작` → `비회원 로그인`, `비회원 로그인 상태` → `비회원`, `잠시만요` → `잠시만 기다려주세요`, 가이드 문구 제거
10. **5/11 commit 3개** — `de573aa` 등 누적, push 안 한 변경분이 누적된 상태에서 part 3 종합 commit 예정

---

## 2. 5/11 (part 3) 흐름 박제 ⭐

### 2-1. Anonymous Sign-In 결정·이유

**기존 (part 2)**: 게스트 = localStorage `ptp_device_id` 만. Supabase 사용자 X. 닉네임 X.

**변경 (part 3)**: 게스트 = `supabase.auth.signInAnonymously()` 호출 → 실제 auth.users row (is_anonymous=true) 생성 → trigger로 닉네임 자동 부여.

**이유**:
- 가입 사용자와 동일한 UX (닉네임, 로그아웃, profile)
- 데이터 일관성 — 모든 entries에 user_id 자동 부여 (RLS 단순화)
- linkIdentity로 anon → Google 업그레이드 자연스러움 (user_id 유지, 데이터 보존)
- Supabase free tier MAU 50,000 — 우리 DAU 50-70엔 여유

**구현**: `LoginGate.tsx`의 `handleGuest`가 `signInAnonymously()` → migrate-device → full reload to /?signup=success.

### 2-2. linkIdentity 업그레이드 + 충돌 처리

**햄버거 메뉴에 "정식 계정으로 전환" 섹션 추가** (is_anonymous=true일 때만):
- Google 계정 연동 → `supabase.auth.linkIdentity({provider:'google'})`
- Apple 계정 연동 → 승인 후 활성화 (disabled placeholder)

**충돌 시나리오 (3% 예상)**: 같은 Google 이메일이 이미 다른 user에 묶여있을 때.

- 기존 흐름: silent fail → 사용자 혼란
- 신규 흐름: `/auth/callback`에서 error 캡쳐 → `?auth_error=email_conflict` → `AccountConflictModal` 표시 → "기존 계정으로 로그인" → 새 OAuth flow (`?merge_from=<anon_id>`) → callback에서 데이터 merge (9 테이블 UPDATE + profile.device_ids 병합 + anon user CASCADE 삭제) → toast `기존 계정으로 로그인됐어요!`

**보안**: anon user 30일 이내 + is_anonymous=true 검증 후만 merge 허용.

### 2-3. /journal user.device_ids 기반 조회

**기존**: `save_logs.device_id = 현재_device` 단일 매칭 → 다른 device의 saves 조회 불가

**변경**: 로그인 시 `profiles.device_ids[]` fetch → `save_logs.device_id IN [...]` query → cross-device 자연스럽게 작동

→ **schema 변경 0개**. profile.device_ids는 이미 migrate-device에서 누적되므로 query만 바꿔서 해결.

### 2-4. bfcache 트랩 발견 + fix

**증상**: Google OAuth 시작 → 뒤로가기 → React가 hydrate 안 됨 → 모달 잔존 또는 사진 추가 불가.

**디버그 과정**:
1. 로그 추가 → `pageshow event` 자체가 안 뜸 (React useEffect 안 살아남)
2. inline script로 옮김 → `pageshow` 뜨지만 `persisted: false` (bfcache 안 씀)
3. `performance.getEntriesByType('navigation')[0].type === 'back_forward'` 체크 추가 → 잡힘
4. back/forward navigation 감지 시 `window.location.reload()` 강제

**최종 fix** ([layout.tsx](../src/app/layout.tsx)):
```html
<script>
  window.addEventListener('pageshow', function(e) {
    var navType = performance.getEntriesByType('navigation')[0]?.type || '';
    if (e.persisted || navType === 'back_forward') {
      window.location.reload();
    }
  });
</script>
```

→ React 의존 없이 브라우저 레벨에서 동작. dev·prod 모두 안전.

### 2-5. HamburgerMenu 미니멀 리디자인

**전**:
- 📱 정식 계정으로 전환 / 🍎 Apple 계정 연동 / 👤 프로필 편집 / 🚪 로그아웃
- 닉네임 pill 테두리 + 배경

**후**:
- 이모지·아이콘 모두 제거 (Google G 브랜드 마크만 유지)
- Apple 🍎 → 정식 Apple SVG 마크
- 닉네임은 테두리 X, fontSize 17 + weight 600으로 강조
- "Google 계정 연동" / "Apple 계정 연동 (준비중)" — 별도 CTA 스타일 (배경 + 테두리)
- "프로필 편집" / "로그아웃" — 미니멀 텍스트 + chevron

---

## 3. 발견·해결한 함정 박제 ⭐⭐

### 3-1. Next.js dev 모드 + 뒤로가기 = React hydrate 안 함
- 증상: OAuth 시작 → 외부 navigation → 뒤로가기 → DOM은 그대로지만 React가 deadlock
- 원인 추정: HMR WebSocket이 bfcache 막음 + 단순 navigation 복원 시 hydration 트리거 안 됨
- 대응: brower-level inline script로 `back_forward` navigation 감지 시 강제 reload
- **production에서도 동일한 fix 필요**. dev-only 문제 아님

### 3-2. browser extension hydration 경고
- ColorZilla 등이 `<body>`에 `cz-shortcut-listen` 속성 자동 추가 → React hydration mismatch
- 사용자 모르게 시야에 들어옴 (DevTools 콘솔 노이즈)
- 대응: `<body suppressHydrationWarning>`

### 3-3. 같은 Google 이메일 충돌 (linkIdentity)
- 우리 production DB에 첫 테스트 user (bb137ba4, pcy2177@gmail.com) 남아있음
- 새 anon에서 같은 Google 연동 시 silent fail
- Conflict modal + merge 로직으로 해결
- **실유저 시나리오에선 ~3% 예상 빈도**

### 3-4. Supabase SQL Editor 긴 SQL paste 잘림
- 50줄+ SQL 한 번에 paste 시 일부 잘림 (`너구리,`에서 끊김)
- 대응: 4 청크로 분리 실행
- 향후 큰 migration도 청크 분리 권장

### 3-5. localStorage SSR mismatch
- `useState(() => JSON.parse(localStorage.getItem(...)))` lazy initializer는 SSR에서 throw
- React 19 hydration이 strict해서 mismatch가 보임 (이전엔 silent)
- 대응: `useState([])` + `useEffect`에서 후 로드 (브라우저에서만)

### 3-6. /api/auth/migrate-device 제거 후 다시 필요
- part 2에서 /auth/callback inline으로 처리 후 endpoint 제거했었음
- part 3에서 anon signin은 callback 안 거쳐서 별도 endpoint 필요해짐 → 재생성

---

## 4. 5/11 (part 3) 핵심 결정 박제

### 4-1. 닉네임 13자 vs 10자
- 닉네임 풀 분석: 1500 조합 중 83.5%만 10자 이내, 100%는 13자 이내
- 10자 강제 시 retry 로직 (16.5% 재시도) 필요 → 코드 복잡 + truncate 안전망
- **13자 결정** — 풀 전수 커버, retry 불필요, 단순함 우선

### 4-2. Anonymous Sign-In 도입 vs localStorage 게스트 유지
- 도입 → Supabase MAU 카운트 ↑, 무료 한도 5만 = DAU 50-70 기준 1년 여유
- 도입 시 게스트도 진짜 user — UX 통일·linkIdentity 가능
- **도입 결정**

### 4-3. 충돌 시 데이터 merge 자동 vs 폐기
- 충돌 시 anon 데이터 그대로 폐기 → 사용자 손실
- merge: 9 테이블 UPDATE + profile.device_ids 병합 + anon user 삭제
- **merge 결정** — 사용자 가치 ↑, 보안 검증 (30일 + is_anonymous) 후 안전

### 4-4. UI 미시 결정
- "가입 없이 시작" → "비회원 로그인" (실제 anon Supabase user 생성이라 더 정확한 표현)
- "비회원 로그인 상태" → "비회원" (간결)
- "잠시만요..." → "잠시만 기다려주세요" (정중함)
- 햄버거 이모지 전체 제거 (미니멀)
- 닉네임: pill 스타일 → 그냥 굵게 (테두리 X)

### 4-5. 작업 방식 결정 — commit batching
- 작은 UX 변경마다 commit·deploy하면 churn ↑
- 큰 기능 단위로 묶어 commit
- 사용자 OK 신호 시 일괄 push

→ feedback 메모리 박제 ([memory file](../.claude/projects/-Users-pcy-mac-play-the-picture/memory/feedback_commit_batching.md))

---

## 5. iOS 네이티브 앱 이식성 분석

사용자 질문: "오늘까지 구현한거 기존에 빌딩 준비중이던 네이티브 앱에도 그대로 적용 가능할까?"

### 5-1. 100% 재사용
- Supabase DB (migration_015·016·017 모두 자동 공유)
- `auth.users` + Anonymous Sign-In + Google·Apple provider
- `profiles` + 닉네임 trigger
- RLS 정책 + CHECK 제약
- `auth_logs` + funnel 측정

### 5-2. SDK 변경 (개념 동일)
- `@supabase/supabase-js` → `supabase-swift`
- `localStorage` → Keychain / UserDefaults
- Cookie 세션 → Supabase Swift SDK 자동 처리

### 5-3. iOS 네이티브 advantage
- **Apple Sign-In** — iOS 네이티브에선 기본 무료 (현재 web은 $99 paid program 필요)
- OAuth UX — ASWebAuthenticationSession 한 줄
- Face ID/Touch ID 재인증
- APNs push

### 5-4. 재작성 필요
- React 컴포넌트 → SwiftUI / UIKit
- Next.js 라우트 → iOS 앱 내부 흐름
- bfcache 우회 script — iOS WebView 안 쓰면 불필요

### 5-5. Edge Function 이전 권장
- `/auth/callback`의 merge 로직, `/api/auth/migrate-device`, `/api/auth/log`
- Phase 4 (iOS 출시) 진입 시점에 Supabase Edge Functions로 추출 권장 (1-2시간)
- 그 전까지 옵션 A (iOS가 웹 API 호출)도 OK

### 5-6. iOS 현 상태
- 폴리시만 완료, 심사 신청 X
- Phase 4 시점에 Apple Sign-In + Edge Function 이전 + iOS UI 빌드

---

## 6. 미커밋 변경분 (commit 묶음)

| 파일 | 변경 요약 |
|---|---|
| [migration_017.sql](../supabase/migration_017.sql) | 닉네임 CHECK 1-13자 + profiles UPDATE 컬럼 제한 + auth_logs 정책 제거 |
| [log.ts](../src/lib/auth/log.ts) | AuthEvent 추가: anonymous_signin_success/failed, identity_link_start/failed |
| [LoginGate.tsx](../src/components/auth/LoginGate.tsx) | signInAnonymously + source prop + 비회원 로그인 라벨 + 항상 노출 |
| [migrate-device/route.ts](../src/app/api/auth/migrate-device/route.ts) | 재생성 (anon signin 후 호출) |
| [callback/route.ts](../src/app/auth/callback/route.ts) | error 캡쳐 + email conflict 감지 + merge_from 분기 inline 처리 |
| [AccountConflictModal.tsx](../src/components/auth/AccountConflictModal.tsx) | **신규** — 충돌 모달 + "기존 계정으로 로그인" 트리거 |
| [page.tsx](../src/app/page.tsx) | photo hydration fix + ConflictModal 통합 + MergeSuccessHandler |
| [NicknameEditor.tsx](../src/components/settings/NicknameEditor.tsx) | 로딩 메시지 + 가이드 문구 제거 |
| [journal/page.tsx](../src/app/journal/page.tsx) | user.device_ids 기반 IN query |
| [HamburgerMenu.tsx](../src/components/header/HamburgerMenu.tsx) | anon upgrade 섹션 + 이모지 제거 + 닉네임 강조 |
| [layout.tsx](../src/app/layout.tsx) | suppressHydrationWarning + bfcache inline script |

---

## 7. 안전 메커니즘 재확인

- ✅ `NEXT_PUBLIC_AUTH_GATE_ENABLED` Vercel production 미설정 — 실유저 영향 0
- ✅ DB migration 모두 additive — 기존 컬럼·정책 변경 X
- ✅ `.env.local` gitignored — flag 노출 안 됨
- ✅ HamburgerMenu flag-only 차단 — 로그인 user에게도 production에선 안 보임
- ✅ Anonymous Sign-In Supabase Dashboard에서 활성화됨

---

## 8. 다음 세션 시작 plan

### 8-1. 검증 우선 (남은 작업)
1. **bb137ba4 user 삭제** (Dashboard SQL Editor):
   ```sql
   DELETE FROM auth.users WHERE id = 'bb137ba4-d82a-4d1e-bc30-9bed48340b44';
   ```
2. **conflict merge 시나리오 검증**:
   - 새 anon 만들고 같은 Google 계정으로 link 시도 → AccountConflictModal 표시 확인
   - "기존 계정으로 로그인" 클릭 → OAuth → 데이터 합쳐지고 toast `기존 계정으로 로그인됐어요!`
3. **DB 검증**:
   - `account_merged` 이벤트 auth_logs에 있는지
   - anon user CASCADE 삭제됐는지
   - entries 등 9 테이블 user_id가 Google user로 옮겨졌는지

### 8-2. Admin AUTH 섹션 (funnel 측정)
- /admin 대시보드에 새 카드:
  - 게이트 도달률 (gate_shown / 진입 수)
  - 가입 방식별 비율 (anonymous / google / apple)
  - linkIdentity 사용률 (anon → Google 업그레이드)
  - 충돌 발생률 (email_conflict 이벤트)
  - 닉네임 변경률 (nickname_changed / signup_complete)

### 8-3. Apple Developer 승인 후
- developer.apple.com에서 App ID·Service ID·Key 생성
- Supabase Apple provider 등록
- HamburgerMenu의 Apple 버튼 disabled placeholder → 활성화

### 8-4. Phase 1B 진입 검증 신호
- Vercel Preview env에서 `NEXT_PUBLIC_AUTH_GATE_ENABLED=true` 1주 측정 후:
  - 게이트 도달률 70%+
  - 비회원 로그인 비율 (사용자 분포 파악용)
  - Google 가입률 20%+
  - 닉네임 변경률 30% 미만
- 통과 시 Production 활성화

### 8-5. 다음 세션 시작 멘트 후보
```
"5/12 시작 — bb137ba4 삭제 후 conflict merge 검증, 그 다음 Admin AUTH 섹션"
```
또는
```
"Apple 승인 받았어 — Apple Sign-In 활성화"
```
또는
```
"iOS 앱 작업 같이 시작 — Edge Function 이전 + Supabase Swift SDK 통합"
```

---

## 9. 5/11 part 3 박제 메타 학습

1. **Anonymous Sign-In은 게스트 UX의 정답** — 모든 user가 진짜 identity 가지면 데이터 일관성·코드 단순성·미래 확장성 모두 ↑
2. **linkIdentity 충돌은 미리 핸들링 필수** — silent fail은 가입 funnel을 죽임. 정직한 에러 UX + 데이터 보존 액션 제공이 baseline
3. **닉네임 풀 사이즈는 retry 회피 기준으로 결정** — 풀 전수 커버 길이가 +3자라도 코드 단순성 가치가 큼
4. **bfcache는 dev·prod 모두 함정** — Next.js + 외부 OAuth + 뒤로가기 조합에서 React가 deadlock 가능. inline browser script가 가장 reliable
5. **browser extension은 production 분석에서도 고려** — `cz-shortcut-listen` 같은 외부 속성 주입은 hydration 경고만 줘도 사용자 신뢰 손상
6. **합집합 query 패턴 (`device_ids IN [...]`)** — schema 변경 없이 cross-device 가능. profile 배열에 모든 device 누적해두면 다음 작업에서 query만 바꿔서 자연 작동
7. **commit batching은 작업 흐름 효율 ↑** — UX 미시 조정은 한 번에 묶어 commit (관련 컨텍스트가 묶임 + git history 깨끗)
8. **재테스트 후 정리** — 디버그 로그·setTimeout 등 시험용 코드는 검증 직후 제거. 미커밋 상태에서 cleanup 작업이 가장 효율적
9. **iOS 이식성은 처음부터 의식** — 백엔드 API는 추후 Edge Function 이전 고려, UI는 자연스럽게 분리됨
10. **사용자 라벨 직관성 우선** — "가입 없이 시작" → "비회원 로그인"처럼 동작 정확성과 사용자 이해 둘 다 챙기는 라벨 다듬기는 작은 거 같지만 funnel 영향 큼

---

## 10. 영구 박제 후보 (PROJECT_KNOWLEDGE 업데이트 검토)

1. **Next.js bfcache + 외부 OAuth 우회 패턴** — inline script + `performance.getEntriesByType('navigation')` 체크
2. **Supabase Anonymous Sign-In + linkIdentity merge UX** — 게스트 → 정식 가입 자연스러운 흐름 표준
3. **profile.device_ids 배열을 통한 cross-device 데이터 통합** — schema 변경 없이 다기기 지원
4. **닉네임 충돌 처리 전략** — UNIQUE 제거 + 풀 전수 커버 길이로 retry 회피
5. **Supabase MCP read-only 제약 대응** — 마이그레이션은 Dashboard SQL Editor로 분리 적용 (긴 SQL은 청크로)
