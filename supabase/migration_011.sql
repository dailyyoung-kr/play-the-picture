-- ========================================
-- Migration 011: analyze_logs UTM 추적 컬럼 확장
-- Meta 광고 3계층(campaign / adset / ad) 분리 추적용
--   utm_campaign = campaign.name  (migration_007에서 추가됨)
--   utm_term     = adset.name     (신규)
--   utm_content  = ad.name        (신규)
-- ========================================

ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS utm_term TEXT;

-- 광고 소재(ad.name) 단위 분석이 가장 빈번할 것으로 예상 → 인덱스
CREATE INDEX IF NOT EXISTS idx_analyze_logs_utm_content
  ON analyze_logs(utm_content)
  WHERE utm_content IS NOT NULL;
