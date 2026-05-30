-- migration_021.sql
-- discovery_saves 테이블 신설 — "오늘의 발견" 컬렉션 저장
-- 작성: 2026-05-29
-- 배경:
--   "오늘의 발견" 카드에서 아티스트(캐러셀 별)·곡(상세 페이지 북마크) 저장 기능.
--   저장 시점 메타데이터를 snapshot에 보존 (today_discovery row 만료돼도 컬렉션에서 보임).
--
-- cache_key:
--   · 로그인 사용자 → user_id
--   · 비로그인       → device_id
--   * today_discovery의 cache_key 로직과 약간 다름:
--     today_discovery는 신규 사용자 모두 "common" (공통 카드)
--     discovery_saves는 비회원도 device_id별 (개인 컬렉션)

CREATE TABLE IF NOT EXISTS public.discovery_saves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key   TEXT NOT NULL,
  item_type   TEXT NOT NULL CHECK (item_type IN ('artist', 'track')),
  apple_id    TEXT NOT NULL,
  snapshot    JSONB NOT NULL,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cache_key, item_type, apple_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_saves_cache_key
  ON public.discovery_saves (cache_key);
CREATE INDEX IF NOT EXISTS idx_discovery_saves_saved_at
  ON public.discovery_saves (saved_at DESC);

COMMENT ON TABLE public.discovery_saves IS
  '"오늘의 발견" 카드에서 저장한 아티스트·곡 컬렉션. cache_key = user_id(로그인) or device_id(비회원).';
COMMENT ON COLUMN public.discovery_saves.item_type IS
  '"artist" 또는 "track".';
COMMENT ON COLUMN public.discovery_saves.apple_id IS
  'Apple Music ID — 아티스트 id 또는 트랙 id.';
COMMENT ON COLUMN public.discovery_saves.snapshot IS
  '저장 시점 메타데이터. artist: {apple_id, name, artwork, genres, bio_ko, caption, reason, tracks[]}. track: {id, name, album, year, art, preview, artist_name, artist_apple_id}.';
