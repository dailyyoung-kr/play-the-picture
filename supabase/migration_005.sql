-- ========================================
-- Migration 005: preference_logs.device_id 컬럼 추가
-- 다른 로깅 테이블과 일관성 복구 (share_logs 004에 이어서)
-- ========================================

ALTER TABLE preference_logs ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_preference_logs_device_id ON preference_logs(device_id);
