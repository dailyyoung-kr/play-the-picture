# Phase 1 Spec — 회원가입·인증·랜덤 닉네임

> 5/11 작성. 플더픽 Phase 1 (회원가입 도입) 구현 spec.
> 의사결정 근거: [PRODUCT_DIRECTION_2026-05-11.md](./PRODUCT_DIRECTION_2026-05-11.md)

---

## 1. 목표

**저장·기록 패러다임 변환을 위한 user identity 인프라**.

- 현재: device_id 기반 anonymous (탭 닫으면 cross-device 가치 X)
- Phase 1 후: user_id 기반 identity (cross-device 가능, 미래 retention engine 기반)

### Out of scope (Phase 2 이후)
- 저장/기록 페이지 강화 (Phase 2)
- 결제 시스템 (Phase 3)
- iOS 네이티브 앱 (Phase 4)

---

## 2. 핵심 결정 사항

| 항목 | 결정 |
|---|---|
| 로그인 옵션 | Apple + Google + Passkey + 게스트 |
| 진입점 | 사진 업로드 후 "다음" 클릭 시 게이트 |
| 닉네임 | 음악 동물 자동 부여 (변경 가능) |
| 데이터 마이그레이션 | device_id → user_id 자동 |
| Auth provider | Supabase Auth |
| 게스트 데이터 | device_id 그대로 작동, 가입 시 자동 연결 |

---

## 3. 화면 흐름

### 3-1. 가입·로그인 흐름

```
[랜딩 페이지]
       ↓ 사진 추가
[사진 미리보기]
       ↓ "다음" 클릭
[로그인 팝업]
   ┌──────────────────────────┐
   │ 가입하면 vibe 컬렉션      │
   │ 만들 수 있어요 🎵         │
   ├──────────────────────────┤
   │ [Apple로 로그인]          │
   │ [Google로 로그인]         │
   │ [패스키로 로그인]         │
   │ ─────────────            │
   │ [가입 없이 시작하기]      │
   └──────────────────────────┘
       ↓ (가입 또는 게스트 선택)
[가입 환영 화면 — 가입한 경우만]
   ┌──────────────────────────┐
   │ 🌸 너그러운 거위          │
   │ 환영해요!                 │
   │                           │
   │ [다른 닉네임 받기 🔄]     │
   │ [직접 입력하기 ✏️]       │
   │ [시작하기]                │
   └──────────────────────────┘
       ↓
[장르·에너지 선택 페이지]
       ↓
[분석 → 결과 → 저장]
```

### 3-2. 게스트 → 가입 권유 (저장 시점)

```
[게스트가 결과 저장 클릭]
   ┌──────────────────────────┐
   │ ☁️ 저장됐어요!           │
   │                           │
   │ 💡 가입하면 다른 기기에서도│
   │    볼 수 있어요           │
   │                           │
   │ [지금 가입]   [나중에]    │
   └──────────────────────────┘
```

→ 가입 시 게스트의 기존 device_id 데이터 자동 user_id로 연결.

### 3-3. settings 페이지 (Phase 2에서 구현)
- 닉네임 변경
- 다시 generate 버튼
- 로그아웃
- 계정 삭제

---

## 4. 인증 옵션 상세

### 4-1. Apple Sign-In
- **Supabase Auth 내장 provider**
- "Hide My Email" 지원 (privacy)
- iOS user 1탭

### 4-2. Google Sign-In
- **Supabase Auth 내장 provider**
- Android·Chrome user 1탭
- Gmail 사용자 다수

### 4-3. Passkey
- **Supabase Auth WebAuthn provider** (또는 직접 WebAuthn API)
- 디바이스 95%+ 호환 (iOS 16+, Android 9+, Win 11)
- 디자인: 3개 button 중 secondary (정체성 강조용)

### 4-4. 게스트
- device_id 기반 (현재 anonymous 흐름)
- 모든 기능 사용 가능
- 저장 시점에 가입 권유 prompt

---

## 5. 닉네임 시스템

> ⚠️ 5/11 업데이트: **이모지 제거 결정**. UNIQUE 제약도 제거 (동명이인 허용). 캐릭터화 텍스트만 유지.
> 환영 화면 UI에서 별도 emoji 표현 가능 (DB와 분리).

### 5-1. 자동 부여 룰
- 가입 시점 (Apple/Google/Passkey 어떤 방식이든) 자동 generate
- 게스트는 닉네임 X (가입 권유 시점에만 부여)
- ~~충돌 시 숫자 suffix~~ → UNIQUE 제약 제거로 충돌 처리 자체 불필요

### 5-2. 데이터 풀

**동물 50개**:
```
여우, 토끼, 사슴, 거위, 수달, 펭귄, 고슴도치, 거북이, 나비, 달팽이,
꿀벌, 무당벌레, 고래, 물범, 문어, 돌고래, 호랑이, 사자, 판다, 코알라,
기린, 캥거루, 라마, 코끼리, 다람쥐, 강아지, 고양이, 햄스터, 너구리,
오소리, 비버, 독수리, 부엉이, 오리, 플라밍고, 앵무새, 박쥐, 두더지,
족제비, 치타, 표범, 알파카, 미어캣, 올빼미, 새우, 곰, 늑대, 코뿔소,
하마, 양
```

**음악 행위·소품 30개**:
```
동작 (10):
노래하는, 흥얼대는, 휘파람 부는, 콧노래 하는, 떼창하는,
박자 맞추는, 발 까딱이는, 고개 끄덕이는, 들썩이는, 신난

소품 든 (10):
이어폰 낀, 마이크 쥔, 우쿨렐레 든, 하모니카 부는, 기타 멘,
헤드폰 쓴, 악보 보는, LP 든, 턴테이블 돌리는, 붐박스 든

악기 연주 (10):
피아노 치는, 기타 치는, 드럼 두드리는, 색소폰 부는, 바이올린 켜는,
트럼펫 부는, 플루트 부는, 실로폰 두드리는, 하프 켜는, 카혼 두드리는
```

### 5-3. ~~이모지 매칭 룰~~ (5/11 폐기 — 이모지 제거)

> 닉네임 자체엔 이모지 X. 아래 표는 UI에서 환영 화면 등에서 활용 가능한 reference로 보존.

음악 행위에 따른 이모지 매핑 (UI용 참고):
| 행위 카테고리 | 이모지 |
|---|---|
| 노래/흥얼/콧노래/떼창 | 🎵 또는 🎶 |
| 마이크 쥔 | 🎤 |
| 이어폰 낀/헤드폰 쓴 | 🎧 |
| 피아노 치는 | 🎹 |
| 기타 치는/기타 멘 | 🎸 |
| 드럼 두드리는/카혼 두드리는 | 🥁 |
| 색소폰 부는 | 🎷 |
| 바이올린 켜는/하프 켜는 | 🎻 |
| 트럼펫 부는 | 🎺 |
| 플루트 부는 | 🪈 |
| 우쿨렐레 든 | 🪕 |
| 하모니카 부는 | 🎼 |
| LP 든/턴테이블 | 💿 |
| 박자/발 까딱/고개 끄덕 | 🎵 |
| 악보 보는 | 🎼 |
| 신난/들썩이는 | ✨ 또는 🌟 |

### 5-4. ~~충돌 처리~~ (5/11 폐기)
- UNIQUE 제약 제거 결정 → 충돌 처리 로직 불필요
- 동명이인 발생해도 entry-id·uuid 기반 식별로 운영 영향 X
- 미래에 친구·검색 기능 도입 시 Discord-style discriminator 검토

### 5-5. 변경
- 가입 환영 화면에서 즉시 변경 가능 (다시 generate 또는 직접 입력)
- settings 페이지에서 언제든 변경 가능 (Phase 2 구현)

---

## 6. 데이터 모델

### 6-1. Supabase Auth users 테이블 확장
```sql
-- 5/11 Phase 1: 닉네임 컬럼 추가
ALTER TABLE auth.users ADD COLUMN nickname text;
ALTER TABLE auth.users ADD COLUMN nickname_emoji text;
ALTER TABLE auth.users ADD COLUMN device_ids text[] DEFAULT '{}';
-- device_ids = 가입 전 게스트 device_id 누적 (마이그레이션 트래킹)

CREATE UNIQUE INDEX idx_users_nickname ON auth.users (nickname);
```

### 6-2. 기존 테이블에 user_id 추가
```sql
-- entries (저장된 vibe)
ALTER TABLE entries ADD COLUMN user_id uuid REFERENCES auth.users(id);
CREATE INDEX idx_entries_user_id ON entries (user_id);

-- save_logs
ALTER TABLE save_logs ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- 기타: share_logs, story_save_logs, listen_logs, preview_logs 등 동일 패턴
```

### 6-3. RLS 정책 변경
```sql
-- entries: 로그인 user는 자기 entries만, 게스트는 device_id 기반
CREATE POLICY entries_user_select ON entries FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (auth.uid() IS NULL AND device_id = current_setting('app.device_id', true))
  );

-- (정책 세부는 구현 시 결정)
```

---

## 7. 데이터 마이그레이션 (게스트 → 가입)

### 7-1. 시점
- 게스트가 Apple/Google/Passkey로 가입하는 순간
- 또는 다른 device에서 같은 계정으로 로그인 시 (cross-device)

### 7-2. 흐름
```
1. 게스트가 가입 button 클릭
2. Auth provider redirect → Supabase 인증 완료
3. 가입 callback 트리거:
   a. 현재 sessionStorage·localStorage의 device_id 추출
   b. auth.users.device_ids 배열에 append
   c. 그 device_id 기반 entries·save_logs·share_logs 등에 user_id 채움 (UPDATE)
4. 가입 환영 화면 → 닉네임 부여
```

### 7-3. 다중 device 통합 처리
- 한 user가 여러 device 사용 (예: 폰·노트북)
- 각 device의 device_id를 모두 user.device_ids에 누적
- 새 device 로그인 시:
  - 이전에 가입한 user면 device_id 추가
  - 신규 user면 새 가입 흐름

### 7-4. 충돌 케이스
- 게스트 device_id가 이미 다른 user에 연결돼 있는 경우 (same device, 다른 사람 가입):
  - 마지막 가입자에게 ownership 이전
  - 또는 충돌 알림 후 user 선택

→ 단순화: 게스트 device_id가 마지막 가입한 user에게 연결.

---

## 8. Funnel 측정 plan

### 8-1. 추적 metric

| Metric | 정의 | 목표 |
|---|---|---|
| 게이트 도달률 | 랜딩 → 사진 업로드 → "다음" 클릭 비율 | 70%+ |
| Apple 가입률 | 게이트 진입자 중 | 30%+ |
| Google 가입률 | 게이트 진입자 중 | 20%+ |
| Passkey 가입률 | 게이트 진입자 중 | 5-15% |
| 게스트 비율 | 게이트 진입자 중 | 30-50% |
| **전체 가입률** | (Apple+Google+Passkey) / 게이트 진입 | **50%+** |
| 게스트→가입 전환 | 저장 시점 권유 후 가입 비율 | 10%+ |
| 닉네임 변경률 | 자동 부여 후 변경한 user 비율 | <30% (적정 수준) |
| 분석 funnel drop | 가입 게이트 도입 전후 분석 성공 비교 | -10% 이내 (acceptable) |

### 8-2. 신규 logs 테이블
```sql
CREATE TABLE auth_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  user_id uuid,
  event text NOT NULL, -- 'gate_shown', 'apple_login', 'google_login', 'passkey_login', 'guest_skip', 'nickname_changed', etc.
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_auth_logs_device_id ON auth_logs (device_id);
CREATE INDEX idx_auth_logs_user_id ON auth_logs (user_id);
CREATE INDEX idx_auth_logs_event ON auth_logs (event);
CREATE INDEX idx_auth_logs_created_at ON auth_logs (created_at);
```

### 8-3. Admin 대시보드에 "AUTH" 섹션 추가
- 게이트 도달률·각 옵션 가입률·게스트 비율·전체 가입률
- 일별 추세 chart
- 닉네임 변경률

---

## 9. 단계별 구현 순서

### Phase 1A (Week 1) — Apple + Google + 게스트
- [ ] Supabase Auth 설정 (Apple·Google provider)
- [ ] 로그인 팝업 컴포넌트 (Apple+Google+게스트, Passkey 빠진 상태)
- [ ] 사진 업로드 후 "다음" 게이트 진입점
- [ ] 데이터 마이그레이션 로직 (device_id → user_id)
- [ ] entries·save_logs 등에 user_id 컬럼 추가
- [ ] RLS 정책 변경
- [ ] auth_logs 테이블·이벤트 트래킹
- [ ] Admin 대시보드 "AUTH" 섹션
- [ ] 닉네임 자동 부여 (Supabase trigger)
- [ ] 가입 환영 화면 (닉네임 표시·변경 옵션)

### Phase 1B (Week 2) — Passkey 추가
- [ ] Passkey provider 설정 (또는 직접 WebAuthn)
- [ ] 로그인 팝업에 Passkey button 추가
- [ ] 가입 직후 Passkey enroll prompt (eBay 패턴)
- [ ] enrollment rate 측정

### Phase 1C (Week 3) — 검증·iteration
- [ ] funnel metric 측정 (1주 데이터)
- [ ] 가입률 30% 미만 시 진입점 변경 (저장 시점으로) 또는 카카오 추가 검토
- [ ] 데이터 마이그레이션 edge case 처리
- [ ] 닉네임 풀 확장·refinement

---

## 10. 예상 risk + 대응

### Risk 1: 가입 funnel drop-off
- 광고 trag → 가입 게이트 = 분석 funnel 30%+ drop 가능
- **대응**: 게스트 옵션이 fallback. 가입률 30% 미만이면 게이트 시점 변경 (저장 시점으로)

### Risk 2: 데이터 마이그레이션 충돌
- 게스트 device가 다른 user 가입 후 같은 device로 새 가입
- **대응**: 마지막 가입자에게 ownership 이전 (단순 룰)

### Risk 3: Passkey 학습 비용
- 한국 18-24 인지도 50-60%
- **대응**: Apple/Google primary, Passkey secondary 디자인

### Risk 4: 닉네임 변경 빈번 → 정체성 약화
- 자동 부여한 닉네임이 마음에 안 들어 자주 변경
- **대응**: 변경률 30% 이상이면 풀 다양성 확장·patterns 추가

---

## 11. 다음 Phase 연결

### Phase 2 (저장/기록 업그레이드) 진입 전 검증
- [ ] 가입률 30%+ 도달 (Phase 1A 후 1주 측정)
- [ ] 데이터 마이그레이션 정상 작동 (game-breaking bug 없음)
- [ ] 닉네임 시스템 안정 (변경률 30% 미만)

→ 이 3가지 통과 시 Phase 2 진입.

---

## 12. 참고 자료

- [PRODUCT_DIRECTION_2026-05-11.md](./PRODUCT_DIRECTION_2026-05-11.md) — 의사결정 박제
- [SESSION_HANDOFF_2026-05-10.md](./SESSION_HANDOFF_2026-05-10.md) — 5/10 분석 박제
- 한국 18-24 segment 친숙도: Apple 90%+ / Google 80%+ / Passkey 50-60%
- Passkey UX 사례: TikTok 1.9초 sign-in, Sony 88% enrollment, eBay 75% enrollment after login
