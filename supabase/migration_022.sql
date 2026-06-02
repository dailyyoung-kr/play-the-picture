-- migration_022: 사진 일기 (유저 입력) 컬럼 추가
-- entries에 유저가 직접 남기는 한 줄(user_note) + 감정 이모지(user_mood).
-- 둘 다 nullable text → 기존 동작/쿼리에 영향 없음 (ADD COLUMN IF NOT EXISTS, instant).
-- 적용: Supabase 대시보드 SQL Editor에서 실행 (MCP/CLI는 read-only).

ALTER TABLE entries ADD COLUMN IF NOT EXISTS user_note text;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS user_mood text;
