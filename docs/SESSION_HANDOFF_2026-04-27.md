# Session Handoff — 2026-04-27

다음 세션 작업 시 혼동 없도록 정리. 코드 상세는 직접 읽으면 되고, **이 세션에서 결정·합의된 맥락**과 **데이터 검증 결과**를 박제.

---

## 1. 플더픽 구조 (현재 상태, ce6cfa4 → 3cb6aa4)

### 도메인
- 메인: `https://playthepicture.com` (4/26 마이그레이션, 인증 완료)
- 이전: `play-the-picture.vercel.app` (계속 작동, redirect)
- Meta Pixel 도메인 인증: 완료 (`facebook-domain-verification` 메타 태그 in `layout.tsx`)
- GA4: 교차 도메인 측정 + vercel.app referral 제외 설정 완료

### 핵심 페이지·라우트 (변경 없음)
| 경로 | 역할 |
|---|---|
| `/` | 랜딩 — 사진 업로드 |
| `/preference` | 분석 트리거 — UTM 캡처 + analyze_logs insert |
| `/result` | 결과 — 공유 버튼 (handleShare에서 OG fetch는 fire-and-forget) |
| `/share/[id]` | 공유 페이지 — generateMetadata로 OG 메타 동적 |
| `/api/og` | OG 이미지 (1200x630, ImageResponse from `next/og`) |
| `/api/og/default` | 랜딩용 정적 OG |

### 데이터 모델 (변경 없음)
- `entries` (uuid, song, artist, album_art, photos, vibe_type, vibe_description, reason, tags, device_id)
- `analyze_logs` (UTM 5종)
- `share_logs` / `share_views` / `try_click` (entry_id, device_id)
- `recommendation_logs` (7일 반복 방지)

### Web Share API (변경됨, 3cb6aa4)
**현재:**
```js
fetch(`/api/og?id=${entryId}`).catch(() => {});  // fire-and-forget (await X)
if (navigator.share) {
  await navigator.share({ url });  // user activation 보존
}
```
- 이전: 6초 await로 user activation 만료 → fallback("링크 복사됐어요") 빠짐
- 변경 후: 즉시 share 시트 + Vercel CDN dedup으로 카톡 미리보기도 정상 작동 (실측 검증)

### OG 이미지 레이아웃 (변경됨)
- 캔버스 1200×630 (사진 영역 520, 앨범아트 영역 680)
- **곡명 박스 (0174dc1)**: fontSize 48 + alignItems flex-end + height 116
- **앨범아트 블러 (3ad82f7)**: 배경 blur(20px), 본체 blur 제거 (식별성 ↑)
- 좌측 상단 로고 ("Play the Picture", #C4687A) 유지

### OG 캐시 전략 (변경 없음)
- `/api/og` 응답 `Cache-Control: public, max-age=31536000, immutable`
- 같은 entry는 첫 빌드(~3~4초) 후 영구 캐시

---

## 2. 이 세션 핵심 결정·맥락

### 2-1. 4단 viral funnel 통일 — 가장 큰 변경
모든 user prompt + SYSTEM에 "단톡방 시추에이션" 일관성:
```
SYSTEM:          단톡방에서 친구들끼리 돌려보고 싶은 카드
vibeType:        단톡방에 떴을 때 친구들이 만들고 싶게
vibeDescription: 단톡방에 카드 띄웠을 때 댓글 달고 싶게
reason:          단톡방에 카드 받은 친구가 끝까지 읽고 키득거릴
```

### 2-2. 프롬프트 변경 검증 결과 (4월 production 대비)
| 지표 | 4월 | 4/27 검증 |
|---|---|---|
| 사진 디테일 연결 | ~30% | **100%** |
| 사운드 매칭 위반 | 50% | **0%** |
| 곡 제목 은유 활용 | ~50% | **100%** |
| 사용자 입력값 인용 | (이번 발견) | **0%** |
| vibeType 신조어 | 산발 | 0 |
| 자조 편중 (vibeDescription) | ~75% | ~25% |
| 3개 user prompt 토큰 | ~370 | **~210 (-43%)** |

### 2-3. 데이터 기반 viral 풀 (실측)
**Full Loop ⭐ (try_click 발생, 3건):**
- 🌸 벚꽃 수집가 (10v/2c) / 🐯 브이요정 듀오 (2v/2c) / 📸 셀카 장인 (6v/1c)

**Partial High (조회 2+, 4건):**
- 🐻 반짝이 곰선생 / 🌸 겹벚꽃 덕후 / 🥩 숯불 감성러 / 🕊️ 묵념하는 사람

→ 이 데이터로 vibeType/Description/reason/tags 예시 교체

### 2-4. 부작용 검출 + 즉시 해결
- "설렘 3 정도면" 류 사용자 입력값 인용 발생 (system prompt에 "에너지 매칭" 추가 후)
- → "에너지" → "무드"로 교체해 차단 (3ab6c55)

### 2-5. 모델 anchoring 패턴 학습
- Opus 4.7은 예시 anchoring 약함 — 곡 실제 메타데이터 우선
- "KPOP" 영문 예시 줘도 "K팝" 한글로 출력 (학습된 한국어 표기 우선)
- 즉 예시는 시그널 정도, 명시 가이드가 진짜 효과

### 2-6. Share flow 안전성 검증 (3cb6aa4)
콜드스타트 케이스 ("Maybe We Could Be a Thing"):
- 22:18:08 share 클릭 → 22:18:09 클라이언트 fetch (await X)
- 22:18:13 카톡 크롤러 fetch (4.5초 lead time)
- Vercel in-progress dedup으로 두 fetch 같은 빌드 결과 받음
- → OG 카드 정상 노출 ⭐

### 2-7. OG 카드 시각 개선 — 두 극단 케이스 검증
- 짧은 곡명 ("항상 엔진을 켜둘께"): 박스 하단 정렬 자연
- 긴 곡명 ("So Easy (To Fall In Love)"): 2줄 wrap + artist 안 겹침
- 사용자 정성 평가: "곡 추천 정확도 확실히 좋아짐"

---

## 3. 운영 원칙 (이 세션 추가 학습)

### 프롬프트 변경 패턴
- **시추에이션 한 줄 + 실측 viral 예시 5개 = 가장 강력**
- 자세한 가이드 + 명시 회피보다 의도 명확화가 효과 큼
- 검증 표본 7~10건이면 production 적용 안전

### 모델 자율성 신뢰
- 권장 어미 풀 좁히지 말 것 (모델 창의력 압살)
- "매번 다른 어미" 같은 자유 지시는 다양성 ↑
- 명시 카테고리(자조/차가움 금지)만 유지

### Share Flow 정책
- iOS Safari user activation ~5초
- await 6초는 위반 → fire-and-forget이 정답
- 카톡은 자체 timeout 6~10초로 길어 진행 중 빌드 견딤
- Vercel CDN immutable 캐시 + dedup으로 안전망

### vibeType의 og:title 형식 호환
- og:title = `[vibeType]의 오늘의 노래`
- "마루의 시간" 류 명사구는 "~의 ~의 노래" 어색 → 행위자 어미 권장

---

## 4. 알려진 이슈·미해결 작업

### 4-1. 카톡 OG 캐시 (수동 무효화 필요)
이전 entries 중 잘못된 OG 캐시 박힌 것들 — 새 분석 entry부턴 자동 새 OG 적용.
강제 갱신: https://developers.kakao.com/tool/clear/og

### 4-2. 본인 테스트 데이터 정리 (사용자가 직접 SQL 실행 예정)
```sql
DELETE FROM share_logs WHERE entry_id IN (
  SELECT id FROM entries 
  WHERE song IN ('Maybe We Could Be a Thing', '항상 엔진을 켜둘께')
);
```
- 4건 삭제 (entries / analyze_logs는 device_id로 필터링되니 그대로)
- Supabase MCP `execute_sql`은 read-only라 Dashboard SQL Editor에서 직접 실행

### 4-3. 본인 테스트 device_id (분석에서 항상 제외) — **9개로 확장 (4/27 갱신)**
대시보드 `INTERNAL_DEVICE_IDS` env에 등록되어 viewMode="user" 모드에서 자동 제외됨 ([admin/page.tsx:506-511](src/app/admin/page.tsx:506)).

**vercel.app 시절 (7개):**
- `c9a5ac48-842b-450c-9f55-843f9aad09d7`
- `ffbfb9b2-d60a-43a3-899d-51185fad652e` — 메인 테스트 device
- `d49b33dc-698b-4ebf-9c92-11fae75af78f`
- `f39f816f-6e76-4e19-8369-81df4349ef67`
- `4d0071d7-8f52-4564-b307-be03636bf853` — share_views 셀프 테스트 다수 발생 device
- `63f7de85-aa41-47fa-857e-a81f1447a658` — 4/27 추가 (이전 누락)
- `f33fc09e-01f0-4abf-8edd-208d37c4bd7a`

**playthepicture.com 마이그레이션 후 (4/27 추가, 2개):**
- `98e71f2a-e4ce-4296-9fec-b0f9a7af3d2f` — "Maybe We Could Be a Thing" 콜드스타트 검증 device
- `25a4f774-d724-4769-9897-4ab140a106ee` — "August" (데이먼스 이어) 분석 device

**🚨 도메인 격리 이슈 (4/26 마이그레이션 영향):**
- device_id는 `localStorage.getItem("ptp_device_id")` 기반 ([src/lib/supabase.ts:10-16](src/lib/supabase.ts:10), [src/lib/device.ts:3-6](src/lib/device.ts:3))
- localStorage는 **도메인별로 완전 격리** → playthepicture.com에서 처음 접속 시 새 device_id 발급
- 같은 기기라도 vercel.app vs playthepicture.com에서 다른 device_id 가질 수 있음
- 따라서 향후 **본인 새 device 발견 시마다** 등록 갱신 필요

**갱신 절차 완료 (4/27):**
- ✅ 로컬 `.env.local` `NEXT_PUBLIC_INTERNAL_DEVICE_IDS`에 9개 등록
- ✅ Vercel 환경변수 동기화 + redeploy 완료 (사용자 수동)

**향후 본인 device 추가 시:** `.env.local` + Vercel env 양쪽 갱신 + redeploy 필수 (`NEXT_PUBLIC_*`은 빌드 타임 박힘). **장기 깔끔한 정리법**: chrome devtools (F12 → Application → Local Storage → playthepicture.com) 에서 `ptp_device_id` 값 직접 확인 후 일괄 등록.

**4/27 viral 신호 (참고):**
도메인 마이그레이션 이후에도 **본인 외 device가 짧은 시간에 다발 분석한 케이스 8개** 발견:
- `6f72dfb3` (10분 8건, 00:38~00:48) / `cc2f24ea` (2.6분 5건) / `c8e77aca` (1.5분 4건) / `3947c73e` (4분 6건) / `11a89acd` (4분 5건) / `20d25ea8` (6분 5건) / `e90816cc` (1분 3건) / `b9355cfc` (5분 3건)
- 본인 device 아님으로 확인됨 → 외부 유저가 사진 갈아끼우며 재시도 = **단톡방 viral 행동 신호** (4단 funnel 통일 효과)
- 4월 production 대비 retry 행동 증가, 1주 데이터 누적 후 정량 비교 가능

### 4-4. OG 빌드 시간 추가 단축 (보류)
- 옵션 N-C: 다운스케일 1000x525 (~30% 추가 절감) — 1주 데이터 후 결정
- 옵션 H: OG 사전 빌드 (entry 생성 시 미리) — 장기 인프라 작업

### 4-5. 사용자 거부 옵션
- **옵션 B (mount 시 OG pre-trigger)** — 모든 페이지 진입에 fetch 부담 거부
  → 다음 세션에서 다시 제안하지 말 것

### 4-6. share_views 추적 — **정상 동작 확인 (4/27 검증)**
- 이전 기록 "0건"은 **잘못된 기록** — 실제론 4/19~4/27(9일) 동안 53건 누적
- /api/log-share-view 정상 동작 중
- **분류 결과 (본인 device 7개 제외 후):**
  - 본인↔본인 (셀프 테스트): 45건 (85%)
  - 본인이 외부 entry 조회: 4건
  - 외부가 본인 entry 조회 ⭐: 4건 (unique 외부 viewer **5명**, 4/19~4/27)
- **share_views도 `filterDevice()` 통과** ([admin/page.tsx:526](src/app/admin/page.tsx:526)) — viewer device가 INTERNAL이면 자동 제외
- 단, 필터는 viewer device만 검사. owner가 본인 + viewer가 외부인 케이스(=⭐ 진짜 외부 view)는 정상적으로 유저 데이터로 카운트됨

---

## 5. 최근 commit 흐름 (이 세션)

```
3cb6aa4 공유 시 OG fetch await 제거 — user activation 보존
3ad82f7 OG 앨범아트 블러 단순화 — 식별성 ↑ + 빌드 시간 ↓
0174dc1 OG 곡명 박스 — fontSize 48 + alignItems flex-end
ce6cfa4 tags 프롬프트 — 예시 viral 데이터 기반 + 띄어쓰기 제약 제거
3ab6c55 SYSTEM_PROMPT 강화 — 단톡방 시추에이션 + 무드 매칭 추가
f764de3 reason 프롬프트 압축 — 단톡방 시추에이션 + 사운드 매칭 회피 강화
e226179 vibeDescription 프롬프트 강화 — 단톡방 시추에이션 + 사진 디테일 연결
ae745f3 vibeType 프롬프트 강화 — 단톡방 시추에이션 + 실측 viral 예시
6da3eae Meta Pixel 도메인 인증 메타 태그 추가
39b50b6 OG 곡명 wrap 시 artist 겹침 후속 수정 — height 고정
```

---

## 6. 다음 세션 우선순위 제안

### A. 1주 데이터 모니터링 (4/28~5/4 KST)
| 카테고리 | 지표 | 베이스라인 | 목표 |
|---|---|---|---|
| viral | 사일런트 비율 | ~43% | <20% |
| viral | Full Loop 비율 | ~10% | >15% |
| viral | 외부 unique viewer | 4/24~26 6명 | >15명/주 |
| 프롬프트 | 사운드 매칭 위반 | 50% | <10% |
| 프롬프트 | 사진 디테일 연결 | ~30% | >70% |
| share | 시트 노출 성공률 | (낮음) | 100% |
| share | 카톡 카드 표시율 | (측정 필요) | >80% |
| OG | 빌드 시간 평균 | 4~6초 | <4초 |

### B. 1주 후 데이터 보고 결정
- 사일런트 < 20% → 가이드 동결
- 사운드 매칭 > 20% → reason 가이드 더 강화
- OG 빌드 p95 > 5초 → 다운스케일 추가
- ~~share_views 여전히 0 → 추적 코드 디버그~~ → ✅ 정상 동작 확인 (4/27), 외부 unique viewer 추세만 모니터링

### C. 새 viral 후보 어미 (1주 데이터 검증 시 viral 풀 업데이트)
이 세션에서 발견된 후보:
~점프러 / ~낭만러 / ~순정파 / ~로맨티스트 / ~챔피언 / ~총대 /
~단골손님 / ~출사조 / ~사냥꾼 / ~챙김러

### D. 보류 작업 (필요 시)
- OG 다운스케일 (1000x525)
- OG 사전 빌드 (entry 생성 시)
- vibeType 신조어 가드레일 (현재 0건이지만 빈도 ↑ 시)

---

## 7. 참고 — 사용자 프로필 (CLAUDE.md/메모리 기반)

- **코딩 입문 단계** (한국어 소통)
- 직설적 의견 + trade-off 명시 선호
- 점진적 실험 + 데이터 검증 선호 (한 번에 다 박지 말기)
- **사전 승인 룰**: 파일 3개+ 또는 큰 로직 변경 시 설명 + 승인
- 배포 전 로컬 검증 흐름 선호 (worktree + 메인 클론)
- **메모리 시스템**: `/Users/pcy_mac/.claude/projects/-Users-pcy-mac-play-the-picture/memory/`

---

## 8. 핸드오프 시점 production 상태

- HEAD: `3cb6aa4` (10개 commit 누적)
- 도메인: playthepicture.com 완전 마이그레이션
- 4단 viral funnel 통일 완료
- OG 카드 시각 개선 완료
- Share flow user activation 안전 확보
- **1주 모니터링 시작 시점** — 다음 세션은 데이터 기반 분석부터
