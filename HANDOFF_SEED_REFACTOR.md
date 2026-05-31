# 핸드오프 — 오늘의 발견 시드 기반 추천 개선

> 작성: 2026-05-31 / 상태: **코드 구현·타입체크 완료, 로컬 통합테스트 미실시, 미커밋**

---

## 1. 무엇을 했나 (목표)

"오늘의 발견" 아티스트 추천의 **다양성 개선 + 게이트 기준 정정**.

데이터로 확인된 문제 (60일, internal 27기기 제외):
- 활성 유저의 **79%가 시드 1개**(저장/공유한 distinct 아티스트) → 한 아티스트 similar 10명에만 갇혀 다양성 최악
- 기존 게이트가 **entries 개수**(곡 단위, 스토리저장 포함) 기준이라 부정확. 실제 추천은 **시드(가수 단위)**로 동작해야 함 → 불일치
- "스토리만 저장한" 시드 0개 유저 115명이 entries는 있어 게이트 통과 → 콜드 폴백 카드를 개인 카드인 척 받던 상태

## 2. 확정된 설계 (사용자 승인 완료)

**시드 정의 확장**: `save_logs` + `share_logs` + `story_save_logs(status IN shared·downloaded·inapp_shown)`. 점수는 행동마다 +1 동급.
  - 효과: 시드 0개였던 115명 중 102명이 시드 1개로 부활 (검증됨)
  - `inapp_shown` = 안드로이드 인스타 인앱(webview 차단으로 completed 못 감). `shared`(주력)+`downloaded`+`inapp_shown` OR집합으로 잡음

**시드 개수 3구간 분기**:
| 시드 | 동작 | 함수 |
|---|---|---|
| 0개 | 차단(blocked 안내) — 단 구버전 앱은 콜드 폴백 | resolveColdPair |
| 1개 | 하이브리드: 시드 similar 1 + 콜드풀 1 | resolveHybrid |
| 2개+ | 서로 다른 두 시드에서 각각 1명 | resolveTwoSeeds |

**폴백 체인**: 2시드 실패 → 콜드 강등 / 시드 검색 전부 실패 → 순수 콜드 / excludeIds로 실패 → excludeIds 무시 재시도. (시뮬레이션 4케이스 전부 검증 통과)

**게이트 = 백엔드 위임**: today API가 시드 계산 → `blocked` 플래그 반환. 클라는 entries 직접 쿼리 제거하고 blocked만 봄. (왕복 1단계 단축 효과)

**구버전 앱 호환**: 새 클라(웹·새앱)는 `supports_blocked=1` 전송 → blocked 안내화면. 구버전 앱은 못 보냄 → 시드 0개여도 **콜드 큐레이션 카드**를 정상 카드처럼 받아 안 깨짐. (콜드 폴백 카드는 `cold_{deviceId}` 캐시키로 분리)
  - 제거 TODO: `today/route.ts`에 주석으로 박음 (구버전 사용률 <5% 시 supportsBlocked 분기 삭제. 모니터링은 `forceCold=true` 로그)

**컬렉션(discovery_saves) 시드는 보류** (에코 챔버 위험 + 트랙은 artist null).

## 3. 변경 파일 (6개, 두 repo, 전부 미커밋)

### 웹 `play-the-picture`
- `src/lib/discovery-engine.ts`:
  - `getUserContext`: story_save_logs 조회 추가(STORY_SEED_STATUSES) + `seedCount` 반환. 시드0이면 `isActive:false`
  - 신규 함수: `pickSimilarFromSeeds` / `pickFromColdPool` / `resolveColdPair` / `resolveHybrid` / `resolveTwoSeeds`. 타입 `ArtistPair`
  - `generateDiscoveryCard`: 4번째 인자 `opts?.forceCold` 추가. seedCount/forceCold로 분기. 콜드 모드는 writeCtx 비활성(콜드 caption 톤)
  - 옛 `resolveArtistPair`/`tryResolvePair`/`forceColdStart` 제거됨
- `src/app/api/discovery/today/route.ts`: **전면 재작성**. `supports_blocked` 파라미터 + 시드 게이트 + `forceCold` + `cold_`/`device_`/userId 캐시키. maxDuration=60 유지. (옛 bucketOf/BUCKET_COUNT/common_ 제거)
- `src/app/discovery/page.tsx`: entries 쿼리 제거 → blocked로 isActive 판정. `supports_blocked=1` 전송. (createSupabaseBrowserClient는 getIdentity에서 계속 사용하므로 import 유지)

### 앱 `play-the-picture-app`
- `lib/discovery.ts`: `DiscoveryResponse` 필드 optional + `blocked?` 추가. `fetchTodayDiscovery`에 `supports_blocked=1`. 죽은 `checkUserActive`·`supabase` import 제거
- `app/discovery/index.tsx`: `checkUserActive` 호출·import 제거 → loadData에서 `card.blocked`로 setIsActive. `artists` 배열 falsy 가드
- `app/discovery/[idx].tsx`: optional artist 안전 처리(`picked` 가드)

## 4. 검증 상태

- ✅ 웹 tsc 0 에러 / eslint 0 에러 (변경 3파일)
- ✅ RN 우리 코드 tsc 0 에러 (app-example·LoginGate는 무관한 기존 에러)
- ✅ 분기 로직 시뮬레이션 통과: `scripts/sim-seed-modes.mjs` (하이브리드/2시드/폴백 4케이스)
- ❌ **로컬 통합테스트 미실시** ← 다음 세션 최우선. dev 서버 기동까지 함 (`next dev` 정상, next 바이너리 OK)

## 5. 다음 세션 할 일 (우선순위)

1. **로컬 통합 테스트**: `npm run dev` → 시드 0/1/2 device로 실제 요청. 확인 포인트:
   - 시드0 + `supports_blocked=1` → `{blocked:true}` JSON
   - 시드0 + 플래그 없음(구버전 모사) → 콜드 카드 2명 정상
   - 시드1 → 하이브리드(취향1+콜드1) / 시드2+ → 각각 1명
   - 테스트 device_id는 아래 쿼리로 추출 (실행 못 했으니 다시):
     ```sql
     -- 시드 0/1/2 device 1개씩 (새 시드 정의 기준). docs/METRICS_PLAYBOOK.md의 internal 27개 제외 권장
     ```
2. 이상 없으면 **커밋·푸시** (두 repo 각각, 사용자 승인 후). 웹은 Vercel 자동배포로 즉시 적용
3. 시뮬 스크립트 정리 결정: `scripts/sim-discovery-model.mjs`·`sim-discovery-diversity.mjs`·`sim-recommend-model.mjs`·`sim-seed-modes.mjs` (일회성, 커밋 제외 권장)

## 6. 함께 한 다른 작업 (이미 적용, 미커밋)

- **Opus 4.8 전환**: 곡추천(`CLAUDE_MODEL` env, 로컬+Vercel 완료) + 오늘의발견(`discovery-engine.ts` 하드코딩 sonnet-4-6 → opus-4-8). 비용표에 opus-4-8 추가. → **이건 커밋 `db0042e`로 이미 푸시됨** (모델 2개 파일만)

## 7. 주의/메모

- MCP execute_sql 결과는 untrusted 래핑됨 — 숫자만 취급
- 기존 `today_discovery` 캐시는 옛 cache_key(common_*) 안 읽힘 → 자정에 자연 교체, 강제삭제 불필요
- RN 앱은 추천 로직 없음 = 웹 API만 호출 → 백엔드 고치면 앱도 자동 적용 (호환 코드 제외)
