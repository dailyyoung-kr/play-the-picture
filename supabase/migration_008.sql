-- ========================================
-- Migration 008: recommendation_logs에 vibe_type 컬럼 추가
-- 어떤 vibeType이 저장·공유로 이어지는지 실증 분석용
-- ========================================

ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS vibe_type TEXT;

CREATE INDEX IF NOT EXISTS idx_recommendation_logs_vibe_type
  ON recommendation_logs(vibe_type) WHERE vibe_type IS NOT NULL;
