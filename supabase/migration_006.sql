-- ========================================
-- Migration 006: analyze_logs 성능 측정 컬럼 추가
-- perf_db_ms: Supabase 후보곡 필터링 소요
-- perf_claude_ms: Claude API 호출 소요
-- photo_count: 분석에 사용된 사진 장수
-- ========================================

ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS perf_db_ms INT;
ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS perf_claude_ms INT;
ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS photo_count INT;
