-- ========================================
-- Migration 002: share_views + try_click 테이블 생성
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ========================================

-- 1. 공유 페이지 방문 로그
CREATE TABLE IF NOT EXISTS share_views (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  entry_id   uuid REFERENCES entries(id) ON DELETE SET NULL
);

ALTER TABLE share_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert share_views"
  ON share_views FOR INSERT WITH CHECK (true);

CREATE POLICY "anyone can select share_views"
  ON share_views FOR SELECT USING (true);

-- 2. 나도 해보기 클릭 로그
CREATE TABLE IF NOT EXISTS try_click (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  entry_id   uuid REFERENCES entries(id) ON DELETE SET NULL
);

ALTER TABLE try_click ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert try_click"
  ON try_click FOR INSERT WITH CHECK (true);

CREATE POLICY "anyone can select try_click"
  ON try_click FOR SELECT USING (true);
