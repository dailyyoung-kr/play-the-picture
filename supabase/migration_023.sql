-- migration_023: 한줄 일기에서 감정 이모지 제거 — user_mood 컬럼 삭제
-- UI·API·타입에서 user_mood 제거 완료 후 적용 (한줄 일기는 user_note 텍스트만 사용).
-- 적용: Supabase 대시보드 SQL Editor에서 실행 (MCP/CLI는 read-only).

ALTER TABLE entries DROP COLUMN IF EXISTS user_mood;
