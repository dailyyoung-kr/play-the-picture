-- ========================================
-- Migration 012: itunes_preview_cache 테이블 생성
-- iTunes 30초 미리듣기 매칭 결과 캐시 + 진단 데이터 누적
--
-- 목적:
-- 1. 같은 곡 재호출 시 외부 API 생략 → 응답 속도↑
-- 2. 매칭 점수·후보 수·실패 원인 누적 → 알고리즘 개선 토대
-- 3. /share 페이지 등 재방문 시 동일 URL 재사용
-- ========================================

CREATE TABLE IF NOT EXISTS itunes_preview_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 정규화 키 (song + '|' + artist 의 normalize 결과)
  -- normalize: 괄호·특수문자 제거 + 소문자 + 영숫자만
  track_key text NOT NULL UNIQUE,

  -- 원본 입력값 (디버그·재현용)
  song text NOT NULL,
  artist text NOT NULL,

  -- 매칭 결과
  preview_url text,                -- 매칭 성공 시 URL, 실패 시 NULL
  matched_track_name text,         -- iTunes가 반환한 실제 트랙명
  matched_artist_name text,
  match_score int,                 -- 점수 (60 미만도 기록 → 컷오프 적정성 검증)
  candidates_count int,            -- iTunes 검색 결과 후보 수
  search_country text DEFAULT 'kr',

  -- 상태 분류
  -- 'matched'    : 60점 이상 + previewUrl 있음 (정상 매칭)
  -- 'low_score'  : 60점 미만 (후보는 있지만 점수 부족)
  -- 'no_results' : iTunes 검색 결과 0건
  -- 'error'      : 네트워크/타임아웃/JSON 파싱 실패
  status text NOT NULL,

  -- 재시도 추적
  attempts int DEFAULT 1,
  first_attempted_at timestamptz DEFAULT now(),
  last_attempted_at timestamptz DEFAULT now(),
  matched_at timestamptz           -- 성공 시점 (실패였다가 성공한 경우 추적)
);

-- 상태별 조회 (실패 케이스 진단용)
CREATE INDEX IF NOT EXISTS idx_itunes_cache_status
  ON itunes_preview_cache (status);

-- 24시간 후 재시도 정책용
CREATE INDEX IF NOT EXISTS idx_itunes_cache_last_attempted
  ON itunes_preview_cache (last_attempted_at);

-- ========================================
-- 롤백 (필요 시):
-- DROP TABLE IF EXISTS itunes_preview_cache;
-- ========================================
