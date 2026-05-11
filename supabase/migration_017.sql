-- migration_017.sql
-- Phase 1A 보안 강화 + 닉네임 13자 제한
-- 작성: 2026-05-11
-- 결정: 13자 = 풀 1500 조합 전수 커버 (max = "턴테이블 돌리는 고슴도치" 13자)
-- 따라서 retry 로직·truncate 안전망 불필요 → 트리거 그대로 유지

-- ============================================================
-- 1. nickname 길이 CHECK 제약 (1-13자)
-- ============================================================

ALTER TABLE public.profiles
  ADD CONSTRAINT nickname_length_check
  CHECK (char_length(nickname) BETWEEN 1 AND 13);

-- ============================================================
-- 2. profiles UPDATE 컬럼 제한
-- ============================================================
-- 클라이언트(authenticated role)는 nickname·updated_at만 수정 가능
-- device_ids 등은 server callback에서 service_role로만 수정 (데이터 무결성)

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nickname, updated_at) ON public.profiles TO authenticated;

-- ============================================================
-- 3. auth_logs "anyone insert" 정책 제거
-- ============================================================
-- /api/auth/log에서 service_role로만 insert (RLS 우회) → 공개 정책 불필요
-- dead policy + spam 위험 제거

DROP POLICY IF EXISTS "anyone can insert auth_logs" ON public.auth_logs;
