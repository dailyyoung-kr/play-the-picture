-- ========================================
-- Migration 004: share_logs.device_id 컬럼 추가
-- 다른 로깅 테이블과 일관성 복구 (listen_logs, save_logs,
-- share_views, try_click은 이미 보유)
-- ========================================

ALTER TABLE share_logs ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_share_logs_device_id ON share_logs(device_id);
