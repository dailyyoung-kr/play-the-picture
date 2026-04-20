@AGENTS.md

---

# ⚠️ 작업 규칙

## 사전 승인
수정해야 할 파일이 3개 이상이거나, 기존 로직을 크게 바꿔야 하는 경우
반드시 나에게 먼저 설명하고 승인을 받은 후 진행할 것.

## 외부 API 테스트
프로젝트에서 외부 API 호출되는 곳:

1. **Spotify API**
   - `/api/music-search`: 유저가 듣기 버튼 클릭 시 (DB 캐시 우선, miss 시만 호출)
   - `/api/admin/import-text`: 관리자가 곡 추가할 때만
   - Rate limit: 30초 rolling window, 429 시 Retry-After 준수
   - 개발 모드 제한 낮음 → 로컬 테스트 시 연속 호출 주의

2. **YouTube Data API**
   - 일 쿼터 10,000 units (search = 100 units → 최대 100곡/일)
   - `/api/music-search`에서 youtube_video_id 없는 곡만 lazy backfill
   - `/api/admin/import-text`에서 곡 추가 시 함께 호출
   - 쿼터 소진 시 검색 fallback (앱 중단 없음)

3. **Anthropic Claude API**
   - 분석 1회당 약 $0.015~0.02 (Opus 4.7 기준)
   - 연속 테스트 시 비용 누적 주의

→ 로직 테스트는 mock/하드코딩 우선, 실제 API는 최종 단계에서.

---

# 🎯 서비스 컨텍스트

## Play the Picture (플더픽)
- **컨셉**: 사진 업로드 → AI가 분위기 분석 → 어울리는 음악 1곡 추천
- **타겟**: 18-24 한국 여성 중심 (확장 가능)
- **차별점**: 시각 기반 음악 추천, 1곡만(선택 피로 제거), vibeType이 공유 콘텐츠 역할 (MBTI 밈 구조)
- **브랜드 컬러**: 다크 #0d1218 + 로즈핑크 #C4687A
- **URL**: https://play-the-picture.vercel.app

기능 제안/카피 검토 시 이 타겟/컨셉을 기본 필터로 적용.

---

# ✍️ vibeType / vibeDescription 톤 가이드

## vibeType 원칙
- 이모지 1개 + 한글 3~7자
- 캐릭터화된 별명 ("~수집가", "~탐험가", "~요정", "~제조기", "~설계자")
- 사진 소재 반영
- 긍정적·재미있는 톤

## vibeDescription 원칙
- 관찰자 + 삐딱한 시선
- MBTI 밈 / 인스타 캡션 톤
- 자조적 위트 / 일상의 모순
- "~입니다" 반복 억제

## 바이럴 성공 사례
- 🏰 동화세계 탐험가 / "현실은 퇴근인데 마음은 아직 판타지랜드"
- ✈️ 탑승구 브이요정 / "여행은 안 갔는데 이미 추억 만드는 중"
- 🌉 야경 수집가 / "보라빛 다리 앞에서 브이는 국룰이지"
- 🧱 벽돌야경 수집가 / "달빛이랑 조명이랑 싸우는 밤이 제일 좋아"

---

# 🔧 운영 원칙 (축적된 학습)

## 추천 시스템
- **아티스트당 5~7곡 이하 유지** (초과 시 편애 위험)
- 메가히트 대표곡 삭제 권장 ("뻔한 추천" 회피)
- 2차 확장 경계: `< 30곡` (`new-recommend.ts:207`)
- 폴백 임계치: `< 5곡` (`new-recommend.ts:234`, 이력 무시 발동)
- `[FALLBACK]` 로그로 모니터링
- `recommendation_logs` 테이블로 최근 7일 반복 추천 방지 (`vibe_type` 컬럼 포함)

## 광고 운영
- 영상 광고 > 캐러셀 (CPA 1.5~2배 효율 차이)
- 18-24 저녁 8시대가 바이럴 피크 타임
- 예산 급격 증액 금지 (알고리즘 학습 교란)
- 로컬 테스트 시 `NEXT_PUBLIC_ENABLE_ANALYTICS=false`

## 지표 해석
- **표본 크기 고려** (최소: 듣기 50+, 공유 20+, 유입 10+)
- 단일 일자 지표로 판단 금지, 주간 추세 중요
- API 장애 시 지표 왜곡 가능
- 타임존 KST 기준 `(created_at AT TIME ZONE 'Asia/Seoul')::date`

## UX
- vibeType은 캐릭터형(~수집가, ~탐험가, ~요정)가 공유 가치 높음
- 공유 후 조회까지 평균 10분 이내
- 조회 후 "나도 해보기" 클릭까지 4~5초

## UTM 추적 플로우
- 캡처 지점: `/` (`src/app/page.tsx`), `/share/[id]` (`ShareClient.tsx`) — `captureUtmFromUrl()` 호출
- 저장소: `sessionStorage["ptp_utm"]` (탭 닫으면 자동 소멸)
- DB 기록 시점: `/preference`에서 분석 시작 시 `analyze_logs`에 insert (utm_source/medium/campaign)
- **entries 테이블엔 UTM 컬럼 없음** — 분석 단계에서만 기록됨

---

# 🚨 에러 코드 분류

```
usage_limit      → Anthropic 월 한도 초과 (503)
rate_limit       → Anthropic 429
overloaded       → Anthropic 529 (서버 과부하)
no_candidates    → 후보곡 0건
no_photos        → 사진 없음
api_key_missing  → API 키 누락
db_error         → Supabase DB 조회 실패
json_parse_error → Claude 응답 파싱 실패
selection_error  → 곡 선택 실패
network_error    → 네트워크/기타
unknown          → 분류 불가
```

error_code 관련 작업 시 이 분류 기준으로 정확히 매핑할 것.
