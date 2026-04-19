-- ========================================
-- Migration 007: analyze_logs UTM 추적 컬럼 추가
-- Meta 광고 캠페인별 유입 후 전환(저장/공유) 측정용
-- ========================================

ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

CREATE INDEX IF NOT EXISTS idx_analyze_logs_utm_campaign ON analyze_logs(utm_campaign) WHERE utm_campaign IS NOT NULL;
