-- ========================================
-- Migration 013: 7일 글로벌 순환 + Candidate Logging
--
-- 목적:
-- 1. recommendation_logs.created_at 인덱스
--    → 7일 글로벌 카운트 쿼리 최적화 (편향 방지 가중치 계산용)
-- 2. candidate_logs 테이블 생성
--    → Claude에게 보낸 후보 50곡 모두 기록 (선택/미선택 포함)
--    → 누적 데이터로 미래 quality scoring 인프라 구축
--
-- 효과:
-- - Phase 1: top 곡(Blue Hour 등) 후보 진입 weight 50%↓
-- - Phase 2 (1-2개월 후): 곡별 "후보 진입 → 선택 전환률" 계산 가능
-- ========================================

-- ── 1. recommendation_logs.created_at 인덱스 추가 ──
-- 7일 글로벌 카운트 쿼리: WHERE created_at > now() - interval '7 days'
-- 5분 캐시되지만 cache miss 시 빠른 응답 위해 필수
CREATE INDEX IF NOT EXISTS idx_rec_logs_created_at
ON recommendation_logs (created_at);

-- ── 2. candidate_logs 테이블 ──
-- 매 추천 시 Claude에게 후보로 들어간 모든 곡을 기록.
-- 일 100회 추천 × 50곡 = 5000 rows/day, 90일 = 450k rows.
CREATE TABLE IF NOT EXISTS candidate_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 어느 device가 어느 추천 호출에서 받은 후보인지
  device_id text NOT NULL,

  -- 후보 곡 (FK 없음 — songs 삭제 시에도 historical 데이터 보존)
  song_id uuid NOT NULL,

  -- 후보 리스트 내 순서 (1-based, Claude가 본 순서)
  position int NOT NULL,

  -- Claude가 최종 선택했는지 여부
  was_selected boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- 곡별 후보 진입 횟수 / 선택 전환률 계산용
CREATE INDEX idx_candidate_logs_song_id ON candidate_logs (song_id);

-- device별 추천 이력 추적용
CREATE INDEX idx_candidate_logs_device_created ON candidate_logs (device_id, created_at);

-- 기간별 집계용
CREATE INDEX idx_candidate_logs_created_at ON candidate_logs (created_at);
