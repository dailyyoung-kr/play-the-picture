-- migration_018.sql
-- save_logs.user_id 컬럼 추가 — 다른 9개 user-attribution 테이블과 일관성 맞춤
-- 작성: 2026-05-12
-- 배경: migration_015에서 entries 등 9개 테이블에 user_id 추가했으나 save_logs는 누락.
--       Phase 1A 근본 fix(API routes가 insert 시 user_id 박기)에 맞춰 일관 보강.
-- 영향: additive — 기존 device_id 기반 흐름은 변경 없음.

-- ============================================================
-- 1. save_logs.user_id 컬럼 추가 (nullable, FK auth.users)
-- ============================================================

ALTER TABLE public.save_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_save_logs_user_id
  ON public.save_logs (user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 검증 SQL (실행 후 확인용)
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='save_logs' AND column_name='user_id';
-- → 1 row: (user_id, uuid, YES)
