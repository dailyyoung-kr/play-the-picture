-- ========================================
-- Migration 001: genre/mood 컬럼 추가 + share_logs 테이블 생성
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ========================================

-- 1. entries 테이블에 genre, mood 컬럼 추가
ALTER TABLE entries ADD COLUMN IF NOT EXISTS genre text;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS mood text;

-- 2. share_logs 테이블 생성
CREATE TABLE IF NOT EXISTS share_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  entry_id    uuid REFERENCES entries(id) ON DELETE SET NULL
);

-- 3. share_logs RLS 활성화 및 insert 허용
ALTER TABLE share_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert share_logs"
  ON share_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "anyone can select share_logs"
  ON share_logs FOR SELECT
  USING (true);
