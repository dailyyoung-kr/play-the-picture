# Session Handoff — 2026-05-04

> 5/4 작업 박제. 어드민 미리듣기 재생률 0% 사태 원인 분석 + 로그 테이블 SELECT 경로 패턴 통일.
> 이전 핸드오프: [SESSION_HANDOFF_2026-05-03_part2.md](./SESSION_HANDOFF_2026-05-03_part2.md)

---

## 1. 한 줄 요약

**어드민 "🎧 미리듣기 재생률" 0% 표시 = `preview_logs` RLS 켜져있는데 SELECT 정책 누락이 원인. share_logs/preview_logs 둘 다 server API(`/api/admin/log-rows`) 경유 SELECT로 통일하고, share_logs SELECT 정책 제거. 로그 테이블 보안 패턴 일원화 완료.**

---

## 2. 문제 발견

어드민 대시보드 "🎧 미리듣기 재생률" 항상 0%. DB 직접 조회 시 데이터는 정상 적재:

```
preview_logs:
  total_rows: 101
  played_rows: 85
  completed_rows: 16
  played_devices (distinct): 37
  first_log: 2026-05-03 05:52
  last_log:  2026-05-04 00:37
```

→ DB 적재는 OK, 어드민 표시만 막힘.

---

## 3. 진짜 원인 — RLS 정책 누락

### 3-1. 테이블별 RLS 상태

| 테이블 | RLS | 결과 |
|---|---|---|
| analyze_logs, listen_logs | OFF | anon SELECT 정상 |
| share_logs | ON + `"anyone can select"` 정책 | anon SELECT 정상 |
| story_save_logs | ON, SELECT 정책 X | 어드민 server API 경유 |
| **preview_logs** | **ON, SELECT 정책 X** | **anon SELECT 0건 → 화면 0%** |

### 3-2. 흐름 정리

```
사용자 ▶ 클릭
  ↓
/api/log-preview (service role key, RLS 우회) → DB INSERT 정상
  ↓
어드민 페이지 (anon key) → SELECT → RLS 정책 없음 → 0건 리턴
```

INSERT 경로와 SELECT 경로가 다른 키를 쓰는데, RLS는 SELECT 정책만 누락된 상태였음. 어드민에선 데이터가 "사라진 것처럼" 보이지만 실제론 가려진 것.

---

## 4. fix — 옵션 2 (server API 경유) 채택

### 4-1. 옵션 비교

| | 옵션 1: SELECT 정책 추가 | 옵션 2: server API 경유 |
|---|---|---|
| 작업량 | SQL 1줄 | 파일 2개 |
| 보안 | anon에 SELECT 노출 | 어드민 인증 통과만 |
| 확장성 | 신규 테이블마다 정책 추가 | API 한 줄 추가 |
| 일관성 | share_logs와 통일 | story_save_logs와 통일 |

→ **옵션 2 + share_logs까지 같이 정리**로 결정. 장기적 보안·확장성·일관성 우선.

### 4-2. 변경 파일

**[src/app/api/admin/log-rows/route.ts](src/app/api/admin/log-rows/route.ts)**
- `share_logs`, `preview_logs` SELECT 추가 (supabaseAdmin 경유)
- 응답에 `shareLogs`, `previewLogs` 키 추가

**[src/app/admin/page.tsx](src/app/admin/page.tsx)**
- `supabase.from("share_logs")`·`supabase.from("preview_logs")` 직접 호출 제거
- `logRowsRes.shareLogs` / `logRowsRes.previewLogs`에서 받기
- Promise.all 항목 10개 → 8개로 축소

### 4-3. share_logs RLS 정책 제거

```sql
DROP POLICY "anyone can select share_logs" ON share_logs;
```

→ 코드가 더 이상 anon으로 SELECT 안 하므로 정책 불필요. anon은 INSERT만 가능.

---

## 5. 최종 보안 상태

| 테이블 | RLS | INSERT 경로 | SELECT 경로 |
|---|---|---|---|
| share_logs | ON | anon 정책 (사용자 공유 시) | 어드민 server API |
| preview_logs | ON | server route (service role) | 어드민 server API |
| story_save_logs | ON | server route (service role) | 어드민 server API |

**3개 로그 테이블 패턴 통일 완료.**

---

## 6. 신규 로그 테이블 추가 시 가이드 (앞으로의 패턴)

```
1. 테이블 생성 시 RLS ENABLE
2. INSERT는 두 경로 중 택일:
   a. server route에서 service role key (RLS 우회) — preview_logs/story_save_logs 패턴
   b. anon INSERT 정책만 추가 — share_logs 패턴 (사용자 직접 INSERT)
3. SELECT는 무조건 server API 경유:
   - /api/admin/log-rows에 fetch 한 줄 + Promise.all 항목 추가
   - /admin/page.tsx에서 logRowsRes에서 받기
4. SELECT 정책은 만들지 않음 (=어드민 인증 거친 사람만 봄)
```

→ "RLS 켰는데 SELECT 정책 누락 → 화면 0%" 사태 재발 방지.

---

## 7. 검증

- 어드민 페이지 새로고침 후 "🎧 미리듣기 재생률" 정상 수치 표시 확인 (사용자 확인 완료)
- DROP POLICY 실행 후 `pg_policies` 조회: share_logs는 INSERT 정책만 잔존 (확인 완료)

---

## 7-A. 스토리 카드 3장 layout 변경 (좌1+우2)

5/3 part2 §3-3에서 3장은 가로 1열 (309×3)였으나, 시각 hierarchy가 약해 viral thumbnail 식별성·임팩트 부족 판단. 좌1+우2로 변경.

| 항목 | 5/3 | 5/4 변경 |
|---|---|---|
| 배치 | 가로 1열 | 좌 1장 + 우 2장 (세로 스택) |
| 좌 사진 | — | 638×638 |
| 우 사진 (×2) | 309×309 ×3 | 309×309 |
| 가로 총폭 | 957 | 967 |
| 좌 정렬 | — | 우 스택과 동일 높이 (빈 공간 없음) |

**비율 1.5 옵션 검토 → 기각**: 비율 1.5(좌 540 / 우 360)는 좌측 위·아래 빈 공간 100px씩 발생. 사용자 확인 후 비율 2.07 (빈 공간 없음)로 확정.

**위1+아래2 panorama 옵션 검토 → 기각**: 위 사진 panorama 컷으로 정보 손실(가게 간판/가격표 잘림) + thumbnail 식별성 ↓. 좌1+우2가 viral 임팩트 우위.

[src/app/result/page.tsx:1562](src/app/result/page.tsx) — `count === 3` 분기 추가.

---

## 7-B. 안드로이드 인스타 인앱(IABMV) 스토리 저장 진단 + fix ⚠️

### 7-B-1. 발견 — 친구 안드로이드 인스타 인앱 테스트에서 사고

`Samsung SM-S911N` (갤럭시 S23) + 인스타 인앱 webview에서:
- "스토리용 이미지" 클릭 → "페이지를 읽어들일 수 없습니다" 에러
- "결과 공유하기" 클릭 → fallback 클립보드 복사 (시트 안 뜸)

### 7-B-2. user_agent 기반 funnel 추적 결과

`story_save_logs.user_agent` 분류해 5/3-5/4 데이터 종합:

| 환경 | devices | rows | shared | downloaded | generated만 (이탈) | **share 성공률** |
|---|---|---|---|---|---|---|
| iOS 인스타 인앱 | 7 | 11 | 8 | 0 | 1 | **73%** |
| iOS 외부 | 1 | 7 | 7 | 0 | 0 | **100%** |
| 안드로이드 외부 | 4 | 5 | 2 | 0 | 0 | **40%** |
| **안드로이드 인스타 인앱** | **6** | **9** | **0** | **5** | **4** | **0%** |

→ 안드로이드 인스타 인앱 6명 모두 share 0건, **viral 도달 view_count 합계 0건** (9 entry 모두 viewer 0).

### 7-B-3. 원인 — 알려진 안드로이드 인스타 인앱 webview 제약 (인터넷 조사 검증)

- `navigator.share` API 자체가 webview에서 차단 ([react-native-webview #1262](https://github.com/react-native-webview/react-native-webview/issues/1262))
- `<a download>` blob URL → 외부 navigation 시도로 인식 → 차단
- `intent://` URI, `target="_system"`, `window.open()` 모두 실패 ([luizcieslak/am-i-inapp-browser](https://github.com/luizcieslak/am-i-inapp-browser))
- Chrome deep link만 일부 작동 (~64% 커버리지)
- **유일한 신뢰 가능 동작**: long-press 컨텍스트 메뉴 (webview 내부 처리, 외부 navigation 아님)

### 7-B-4. 광고 ROAS 가설 (§3-2) 부분 무력화

> "광고 100% 인스타 → 인스타 viral 자연 동선" — 안드로이드 인스타 인앱 사용자(인스타 인앱 user의 ~46%)가 viral 동선 100% 차단 상태.

### 7-B-5. fix — 옵션 D 채택

UA `Android` && `Instagram` 동시 감지 시:
- navigator.share / triggerStoryDownload 호출 자체 skip
- blob → `URL.createObjectURL` → 모달에 `<img>` 표시
- 안내 메시지: "💾 사진을 길게 눌러 갤러리에 저장할 수 있어요"
- ✕ 버튼 또는 backdrop 클릭으로 닫기 (revokeObjectURL)

**iOS·외부 브라우저·카톡 인앱·기타 환경 영향 0** — 분기 조건이 강한 AND라 오탐 위험 사실상 0.

### 7-B-6. 의도적으로 안 한 것

- **결과 공유하기는 손 안 댐** — 사용자 결정. 클립보드 fallback이 인앱에서도 작동하므로 우선순위 ↓
- **"Chrome에서 열기" 보조 안내 제거** — 안드로이드 기본 브라우저 다양 (삼성 인터넷 등). long-press 단일 액션으로 단순화
- **`/share/[id]/ShareClient.tsx` 미적용** — 친구가 share 페이지 진입 후 다시 스토리 저장 시도하는 케이스. 추후 데이터 보고 결정
- **DDL 변경 없음** — 새 status 'inapp_shown' 추가 보류. 추적은 trackEvent("story_inapp_modal_shown") + UA 분류로 진행. 데이터 누적 후 정식 status 도입 검토

### 7-B-7. 측정 방법

- Vercel Analytics: `story_inapp_modal_shown` event 카운트
- admin funnel: `story_save_logs.user_agent ILIKE '%Android%Instagram%'` + status `generated` = 모달 분기 진입
- viral 회복 측정: 같은 device의 후속 entry view_count 변화

[src/app/result/page.tsx:411](src/app/result/page.tsx) — handleStorySave 분기, helper 함수, 모달 컴포넌트 추가.

---

## 7-C. 안드로이드 인스타 인앱 fix 후속 — Plan A → Plan I 전환

### 7-C-1. long-press 차단 확인

§7-B fix 배포 후 안드로이드 인스타 인앱 실기기 검증:
- 모달 안 이미지 long-press → **컨텍스트 메뉴 안 뜸** (저장 불가)
- CSS 명시(`userSelect: auto`, `WebkitTouchCallout: default`, `pointerEvents: auto`)도 효과 X
- 사용자 측 검증: **구글 이미지 검색에서도 long-press 안 됨** → 인스타 webview의 컨텍스트 메뉴 자체 차단 정책 확정

→ Plan A(long-press 모달) 본질 무용. **plan 전환 필요**.

### 7-C-2. 인터넷 조사 — 검증된 워크어라운드 매트릭스

| 시도 | 결과 |
|---|---|
| `navigator.share` files | 차단 |
| `<a download>` blob URL | 차단 |
| long-press 컨텍스트 메뉴 | 차단 (인앱 정책) |
| Intent URI (`intent://...`) | 차단 |
| Chrome deep link (`googlechrome://`) | 64% 커버리지, 인앱 차단 가능 |
| Data URL navigate | 차단 |
| Clipboard image write | 가능하지만 사용자 paste 워크플로우 모름 (안드로이드 기본 키보드는 image paste 안 됨, Swiftkey 필요) |
| **사용자 자체 폰 스크린샷** | 🟢 **100% 작동** (OS 기능, 인앱 차단 불가) |

→ 자동화 솔루션 없음. **사용자 스크린샷 안내가 정공법**.

### 7-C-3. Plan I 채택 — 화면 캡처 안내

**디자인 진화 과정**:
1. 안내 메시지 변경: "💾 길게 눌러 저장" → "📸 화면을 캡처해 저장하세요"
2. 카드 좌우 풀폭 (width 100%, padding 좌우 0, borderRadius 0) — cropping 시 좌우 정렬 정확
3. ✕ 버튼 가림 해소 (modal padding-top 60px → 16px, chip을 ✕ 같은 위쪽 라인에)
4. chip → 토스트 시도 → **인스타 webview에서 토스트 안 보임** (결과 공유 fallback도 동일) → chip 회귀

**최종 모달 구조**:
- 카드: 화면 가로 가득 + max-height 85vh
- chip: 카드 위 (✕와 같은 위쪽 라인)
- ✕ 버튼: 우상단 (top·right 12, 36×36)
- cropping 마찰: 위쪽 한 번만 잘라내면 깔끔한 9:16 카드

### 7-C-4. 토스트 시도 실패 박제

**시도한 fix 모두 효과 X**:
- 위치 top 80 → 130 (인스타 헤더 회피 시도)
- duration 3s → 4s
- z-index 250 → 9999
- showToast 호출을 setTimeout(150ms)로 분리 (React batch 우회)

**원인 추정**: 인스타 안드로이드 webview의 fixed position 요소 차단 또는 stacking context 강제 격리. **결과 공유하기 fallback 토스트도 동일하게 안 보임** → 토스트 메커니즘 자체 차단.

**박제**: 안드로이드 인스타 인앱에서는 **토스트 사용 불가**. 모달 안 chip이 유일한 신뢰 가능 안내 수단. dead code (showToast 옵션 duration·position) 제거 후 5/3 원본 시그니처로 회귀.

---

## 7-D. 안드로이드 인스타 인앱 트래킹 보강

### 7-D-1. 트래킹 갭 발견

§7-B fix 적용 후 첫 데이터 점검: 친구 device 6번 시도 모두 `status='generated'`로 적재.
→ "캡처 후 사고"와 "fix 적용 후 모달 진입"이 DB에서 구분 불가. fix 효과 측정 불가.

### 7-D-2. DDL: status에 'inapp_shown' 추가

```sql
ALTER TABLE story_save_logs DROP CONSTRAINT story_save_logs_status_check;
ALTER TABLE story_save_logs ADD CONSTRAINT story_save_logs_status_check
  CHECK (status IN ('clicked', 'generated', 'shared', 'cancelled', 'downloaded', 'failed', 'inapp_shown'));
```

(Supabase MCP가 read-only 모드라 사용자 직접 SQL Editor 실행 — 적용 완료)

### 7-D-3. 코드: handleStorySave 분기에서 patchStoryStatus("inapp_shown") 호출

[result/page.tsx:436-443](src/app/result/page.tsx) — 안드로이드 인스타 인앱 분기 진입 시 `patchStoryStatus("inapp_shown")` 추가. admin funnel에서 모달 진입 사용자 별도 분류 가능.

### 7-D-4. 미적용 항목 (선택, 5/8 데이터 보고 결정)

- **Plan 2 — 모달 닫기/체류 시간 추적**: ref 기반 elapsed_sec 측정. 캡처 추정 정확도 ↑이지만 간접 측정.
- **share_views로 viral 결과 직접 측정 가능**: 안드로이드 인스타 인앱 사용자가 만든 entry의 viewer 도달 카운트가 더 직접적 지표.

---

## 7-E. 결과 공유하기 진단 + 카톡 SDK 한계 조사

### 7-E-1. 트래킹 갭 발견

share_logs 14일 데이터:
- total: 131건
- user_agent NULL: **75% (98건)** — 옛 데이터 + PATCH 시점 누락
- status NULL: **70% (91건)** — PATCH 도달 못 한 케이스 다수
- clicked: 0건 (PATCH로 항상 다른 status로 update — 정상)

→ admin funnel share status 분류 70% 데이터 누락. 후속 디버깅 필요 (PATCH `/api/log-share/[id]` 라우트 또는 호출 흐름 검증).

### 7-E-2. 안드로이드 인스타 인앱 결과 공유 흐름

5/3-5/4 누적: 안드로이드 인스타 인앱 6 device 중 share 시도 2 device (4명은 시도조차 안 함). 5개 shared entry의 viewer 합계 **0건** = **viral 도달 0%**.

원인 추정: 클립보드 fallback 토스트가 인지 약함 + 사용자가 paste할 곳 모름. (그리고 토스트 자체가 안드로이드 인스타 인앱에서 안 보임 — §7-C-4와 동일 메커니즘)

### 7-E-3. 카톡 SDK 도입 검토 (인터넷 조사 결과)

**결정적 발견 — 안드로이드 인스타 인앱은 카톡 SDK 인텐트도 차단**:
- 인스타 webview = JavaScript에서 호출되는 모든 외부 인텐트 silently 차단
- `kakaolink://`, `intent://...package=com.kakao.talk;end` 모두 무용
- [카카오 DevTalk](https://devtalk.kakao.com/t/topic/120890): 인스타 인앱 카톡 로그인 시도 시 "이 웹사이트를 읽어들이는 중 문제가 발생했습니다" 오류 + 앱 튕김 보고 다수
- 안드로이드 카톡 인앱 webview에서도 navigator.share 미지원 ([devtalk.kakao.com](https://devtalk.kakao.com/t/navigator-share-api/144328))

**카톡 SDK ROI 재계산** (GA4 14일 데이터 기준):
| 환경 | 카톡 SDK 효과 | GA4 비중 |
|---|---|---|
| iOS Safari·인앱 | navigator.share로 이미 OK | 68.7% |
| 안드로이드 외부 (Chrome·Samsung) | 작동 (단 navigator.share도 작동함) | 8.4% |
| **안드로이드 인스타 인앱** | **차단 → 효과 0%** | 21.5% |

→ **카톡 SDK는 후순위 유지**. 핸드오프 §12-4 결정 데이터로 강화.

### 7-E-4. 적용한 미세 변경

- 결과 공유 fallback 토스트 메시지 끝 ` ✦` 제거 (시각 노이즈 ↓)
- 토스트 노출 시간은 이미 5초로 설정돼 있음 (변경 X)

### 7-E-5. 의도적으로 안 한 것

- **결과 공유하기 모달 강화** (Plan A — 토스트 → 모달): 안드로이드 인스타 인앱 토스트 자체 안 보이는 문제는 모달도 같은 차단일 가능성. 5/8 데이터 보고 결정.
- **status PATCH 갭 디버깅**: HIGH 우선순위지만 별도 세션 작업으로 미룸.

---

## 7-F. admin 환경별 분류 세분화

### 7-F-1. 발견 — `insta_inapp` 합쳐진 시각 착시

기존 admin: `insta_inapp` 카테고리 1개 (iOS·안드로이드 합침).
- 5/4 데이터: insta_inapp 13건 = android 7 + ios 5 + other 1
- "insta_inapp 86.7% = 광고 viral 작동 신호"로 보였지만 실제론 **안드로이드 7건은 share completed 도달 불가** (구조적)

### 7-F-2. 분류 함수 변경 ([admin/page.tsx:737-754](src/app/admin/page.tsx))

```ts
if (/Instagram/i.test(ua)) {
  if (/Android/.test(ua)) return "android_instagram_inapp";
  if (/iPhone|iPad/.test(ua)) return "ios_instagram_inapp";
  return "instagram_inapp_other";
}
```

### 7-F-3. JSX — android_instagram_inapp 핑크 강조

`#C4687A` 색상으로 시각 강조 (구조적 viral 차단 환경 표시). iOS 인스타 + iOS Safari 별도 줄.

### 7-F-4. 안내 문구 두 줄 분리

```
"android_instagram_inapp는 share completed 도달 불가(webview 차단) — inapp_shown으로만 끝남."
"외부 환경 fallback: 다운로드 N건 / 취소 N건 / 실패 N건"
```

`downloaded`·`cancelled`는 외부 환경에서만 발생하는 status — 안드로이드 인스타 인앱 안내와 같은 줄에 있으면 인지 단절. 분리.

### 7-F-5. 5/4 검증 결과 — admin 표시 정확

| metric | DB | admin | 일치 |
|---|---|---|---|
| 공유 건수 | 3 | 3 | ✅ |
| 나도 해보기 | 0 | 0 | ✅ |
| unique 친구 도달 | 1.00 | 1.00 | ✅ (sharer 매핑 없는 viewer도 external 카운트) |
| android_instagram_inapp | 7 device (user 6) | 7건 | ✅ |
| 친구 device 격리 | 3093e413 (20건) → INTERNAL | 미포함 | ✅ Vercel env 정상 반영 |

---

## 7-G. 결정적 인사이트 — 광고 ROAS 가설 재검토 신호

### 7-G-1. GA4 14일 브라우저 비중

| 브라우저 | 사용자 | % | 분류 |
|---|---|---|---|
| Safari | 1,413 | 68.3% | 🟢 iOS — viral OK |
| **Android Webview** | **445** | **21.5%** | 🔴 인앱들 (대다수 인스타 인앱 추정) |
| Chrome | 145 | 7.0% | 🟢 외부 |
| Samsung Internet | 28 | 1.35% | 🟢 외부 |

### 7-G-2. 광고 100% 인스타 가설 (§3-2) 부분 무력화 확정

> "광고 100% 인스타 → 사용자 이미 인스타 안 → 인스타 viral 자연 동선"

이 가설의 안드로이드 부분은 web 기술로 자동화 불가능 확정:
- 스토리 이미지 저장: navigator.share·long-press·download·intent·toast 모두 차단
- 결과 공유하기 카톡: 카톡 SDK 인텐트 차단
- 결과 공유하기 클립보드: 작동하지만 사용자가 paste 안 함 → viral 0%
- iOS만 정상 viral 동선

### 7-G-3. 추후 검토할 광고 채널 옵션

1. Meta 광고 타게팅에서 안드로이드 비중 ↓ (iOS 우선)
2. 광고 카피·랜딩에 "Chrome으로 보기" 안내 (마찰 ↑이지만 viral 가능)
3. 현재 web 기술 한계 받아들이고 측정 → 데이터 기반 결정

→ 본격 결정은 5/8-5/15 광고 ROAS 데이터 누적 후.

---

## 7-H. iOS 인스타 인앱 결과 공유하기 OG 미스크래핑 — 디버깅 종합

### 7-H-1. 발견 — iOS 인스타 인앱 → DM에 OG 카드 안 뜸

iOS 인스타 인앱에서 결과 공유하기 → navigator.share → 인스타 친구 선택 → DM 전송 시 **OG 카드 없이 raw URL만 표시**.

대조: 같은 URL을 카톡에 paste 시 OG 카드 정상.

### 7-H-2. 4개 가설 → 점진적 진단 → 진짜 원인 발견

**가설 1 (기각): 인스타 DM 자체 정책상 OG 표시 안 함**
- 사용자 과거 메시지 스크린샷에서 인스타 DM에 OG 카드 정상 표시된 기록 다수
- → 인스타 DM은 OG 카드 표시 가능. 정책 문제 X

**가설 2 (기각): OG 빌드 timeout**
- 측정: fresh entry 첫 빌드 4.5초, warm 함수 2.67~4.22초
- 사진 수에 비례 (1장 2.67초, 4장 4.22초)
- 페북 크롤러 timeout ~3-5초 추정 → timeout 가능성
- 단 페북 디버거 응답 코드는 403 (robots.txt block) — timeout이면 다른 메시지
- → timeout이 직접 원인은 X (단 background pre-build 가치는 있음)

**가설 3 (부분 원인): robots.txt에 `/share/` Disallow**
- `src/app/robots.ts` (commit `38e2464`)에서 `/share/` 차단
- 페북 디버거 메시지 "Please allowlist facebookexternalhit on your sites robots.txt"
- → fix 1차: SNS 크롤러 6개 (facebookexternalhit, Twitterbot, LinkedInBot, Slackbot, Discordbot, TelegramBot) 명시 Allow
- → fix 2차: Meta 신규 UA 추가 (meta-externalagent, facebookcatalog, Slackbot-LinkExpanding, WhatsApp)

**가설 4 (진짜 원인): Next.js App Router streaming metadata**
- Next.js 15.2+ App Router는 동적 페이지 메타를 streaming으로 전달
- 단순 fetch 봇은 streaming 처리 못함 → 메타 못 가져감
- Next.js 기본 화이트리스트(`htmlLimitedBots`)에 Twitterbot·Slackbot만 포함
- **facebookexternalhit, meta-externalagent 누락** → blocking metadata 안 받음
- GitHub: [vercel/next.js#44470](https://github.com/vercel/next.js/issues/44470) (App Router OG 미스크래핑)
- → fix 3차: `next.config.ts`에 `htmlLimitedBots` 정규식 추가

### 7-H-3. 적용한 fix (commit 51bf1f2, 7a2b9f0, 80fbe88)

**robots.ts** ([src/app/robots.ts](src/app/robots.ts)):
```ts
const SNS_CRAWLERS = [
  "facebookexternalhit",  // Facebook, Instagram (구버전), WhatsApp
  "meta-externalagent",   // Meta 2024+ 통합 (Threads·인스타 OG·Meta AI)
  "facebookcatalog", "Twitterbot", "LinkedInBot",
  "Slackbot", "Slackbot-LinkExpanding", "Discordbot",
  "TelegramBot", "WhatsApp",
];
// SNS 봇은 /share/ 허용, 일반 검색엔진(Google·Naver Yeti)은 차단 유지
```

**next.config.ts**:
```ts
htmlLimitedBots: /facebookexternalhit|meta-externalagent|facebookcatalog|LinkedInBot|Slackbot-LinkExpanding|Discordbot|TelegramBot|WhatsApp/,
```

### 7-H-4. 검증 결과 — 우리 측 fix 100% 작동 확인

curl 직접 테스트 (facebookexternalhit + Range header):
- HTTP 200 ✅
- og:title/description/image/type/url 모두 첫 1KB head에 박힘 ✅
- meta-externalagent UA도 200 ✅

### 7-H-5. Preview deploy 검증 — Vercel `X-Robots-Tag: noindex` 정책 발견

Vercel preview URL로 검증 시도 → 페북 디버거 여전히 403.

**원인 발견**: `x-robots-tag: noindex` 응답 헤더 — **Vercel이 모든 preview deployment에 자동 추가**. robots.txt와 별개의 응답 헤더 단위 robots 지시. 페북 봇이 noindex 보고 OG 처리 거부.

검증:
| 환경 | X-Robots-Tag | 페북 처리 |
|---|---|---|
| Preview (Vercel 자동 noindex) | `noindex` | 거부 (정상) |
| Prod (`playthepicture.com`) | **없음** | 정상 처리 가능 |

→ **preview는 SNS OG 검증에 부적합** (Vercel 정책으로 영원히 안 됨). prod custom domain만 검증 가능.

또 — Vercel preview 검증하려면 Vercel Authentication도 일시 disable 필요 (Standard Protection은 preview 인증 강제).

### 7-H-6. Prod 미해결 — 페북 24시간 robots.txt 캐시 (확신 50-60%)

5/4 KST 14시 fix 배포 후 7시간 경과 시점에도 페북 디버거 prod URL 403:
- 우리 측 응답 정상 (200, og 메타 head, X-Robots-Tag 없음)
- 페북 메시지 "robots.txt block" — robots.txt 캐시 추정
- [Meta 공식](https://developers.facebook.com/docs/sharing/best-practices/): "The crawler caches robots.txt for up to 24 hours."
- **5/5 KST 14:00 자동 갱신 예약**

**다른 가설 (확률 낮음)**:
- Range header + Next.js dynamic route (vercel/next.js#44470 잔여 영향): 25-30%
- Vercel WAF가 페북 IP 차단: 10-15%
- 인스타 자체 정책: 5%

### 7-H-7. 검증 일정 + Plan B

**5/5 KST 14:00 이후 prod 재검증**:
1. 페이스북 디버거에 prod entry URL → 응답 코드 확인
2. **200 + og 정상** → 가설 1 확정, 인스타 DM 새 entry paste로 viral 동선 검증
3. **여전히 403** → Plan B 진행

**Plan B 후보 (5/5 결과 보고 결정)**:
- A. `share/[id]/page.tsx`에 `export const dynamic = 'force-static'` 시도 (메타 빌드 타임 박힘)
- B. `middleware.ts`로 페북 봇 감지 후 정적 HTML 응답 (generateMetadata 우회)
- C. OG 이미지 따로 정적 호스팅
- D. share URL 형식 변경 (페북 캐시 무효화 — 다만 기존 viral 데이터 단절)

### 7-H-8. 핵심 박제 — 향후 SNS 미리보기 디버깅 체크리스트

새 SNS 미리보기 이슈 발생 시 순서대로 확인:

1. **다른 메신저 비교** (카톡·디스코드) → 다른 메신저 정상이면 SNS별 정책, 아니면 우리 측
2. **curl로 봇 UA + Range header 직접 fetch** → 응답 코드, og 메타 head 위치
3. **페북 디버거 Sharing Debugger** → 메시지·응답 코드. 단 misleading 가능성 항상 의심
4. **`htmlLimitedBots` 설정 확인** (next.config.ts) → 새 SNS 봇 UA 추가 필요 여부
5. **`robots.txt` SNS 봇 명시 Allow** → 검색엔진 차단과 분리
6. **응답 헤더 X-Robots-Tag 확인** → preview vs prod 차이
7. **Vercel preview 검증 시 Authentication·noindex 영향 인지** → prod 검증이 더 정확
8. **페북 24시간 robots.txt 캐시** → 변경 후 즉시 검증 어려움, 24시간 대기

[next.config.ts](next.config.ts), [src/app/robots.ts](src/app/robots.ts) 영구 박제 — 새 SNS 봇 추가 시 위 두 파일 동시 수정 권장.

---

## 7-I. admin viral 측정 정확도 fix — sharer 매핑 없는 viewer 분리

### 7-I-1. 발견 — admin "공유 1건당 unique 친구 도달" inflated

5/4 데이터 분석 중 발견:
- admin 표시: `unique 친구 도달 3.33` (10명 외부 / 3 share)
- DB 직접 매칭: 5/4 share에서 **실제 외부 viewer는 2명만**
- 차이 8명 = sharer 매핑 없는 viewer (옛 share 도달, share_logs INSERT 누락 등)

### 7-I-2. 원인 — admin 코드의 분기

[admin/page.tsx:707-717](src/app/admin/page.tsx) 기존 로직:
```ts
if (sharer && v.device_id === sharer) selfViewCount++;
else externalViewCount++;  // ★ sharer 매핑 없어도 external로 카운트
```

→ sharer 없는 viewer (예: 옛 entry 도달자)도 "외부 친구"로 분류 → viral 측정 inflated.

### 7-I-3. fix — 옵션 A (단순 수정)

```ts
if (sharer && v.device_id === sharer) selfViewCount++;
else if (sharer) externalViewCount++;  // sharer 매핑 있고 본인 아님 = 진짜 외부
else unmatchedViewCount++;             // sharer 없음 — viral 측정에서 제외
```

### 7-I-4. 측정값 변화 예시 (5/4 데이터)

| 항목 | Before | After |
|---|---|---|
| selfViewCount | 2 | 2 |
| externalViewCount | 10 | **2** |
| unmatchedViewCount | (없음) | **8** |
| 공유 1건당 unique 친구 도달 | 3.33 (inflated) | **0.67** (정확) |
| 자가 view 비중 | 17% (2/12) | **50%** (2/4) |

### 7-I-5. 의도적으로 안 한 것 (옵션 B 보류)

- unmatched 카운트를 admin UI에 표시 안 함 (단순 시작)
- 변수만 추가해서 추후 옵션 B (둘 다 표시) 도입 시 reuse 가능

### 7-I-6. 시사점 — 이전 viral 측정 수치 재해석 필요

**과거 viral 메트릭이 모두 inflated 가능성**:
- 4/26 ~ 5/3 viral coefficient 측정값에 옛 entry 재방문이 포함됐을 것
- 정확한 sharer→viewer chain은 더 약함
- §7-G의 OG 미스크래핑 영향 분석(4일 누적 손실 ~24 viewers)도 이전 inflated 기준 → 진짜 손실은 더 적을 가능성

### 7-I-7. 회귀 위험·심리적 영향

- 코드 변경 ~5줄, 회귀 위험 0
- **viral 메트릭 갑자기 ↓ 표시** — "viral 떨어진 줄" 오해 가능 → 박제로 명시

---

## 8. 다음 우선순위 (변동 없음)

[5/3 part2 핸드오프 §12](./SESSION_HANDOFF_2026-05-03_part2.md) 그대로 유지:
- 🔴 iOS Safari blur 실기기 검증 (StackBlur 재도입 결과 — commit `09006f9`)
- 🔵 5/8 funnel 데이터 분석 (story_save_logs status × UA crosstab)
- 🔵 카톡 silent 비율 분석 후 SDK 도입 결정

---

## 9. 다음 세션 시작 멘트 후보

```
"iOS Safari blur 실기기 검증 — 09006f9 StackBlur 재도입 결과 확인"
```
또는
```
"5/8 funnel 분석 진입 (이제 미리듣기 데이터 정상 측정됨)"
```
