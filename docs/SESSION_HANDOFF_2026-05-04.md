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
