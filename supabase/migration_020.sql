-- migration_020.sql
-- today_discovery 테이블 신설 — "오늘의 발견" 카드 캐싱
-- 작성: 2026-05-28
-- 배경:
--   "오늘의 발견" 기능 — 사용자가 /discovery 페이지 진입 시 매일 1번 카드 생성·저장.
--   Apple Music API (similar artists + top songs + artwork) + Claude Sonnet 4.6 bio·caption·reason.
--   생성 비용 큼 (~15초, ~$0.02) → DB 캐싱으로 같은 사용자·같은 날엔 즉시 응답.
--
-- 캐싱 단위 (cache_key):
--   · 활성 사용자 (entries 1건+) → device_id 사용 (개인화)
--   · 신규 사용자 (entries 0건) → "common" 사용 (모든 신규 공통)
--
-- 영향:
--   additive — 신규 테이블, 기존 시스템 무영향.

-- ============================================================
-- today_discovery 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS public.today_discovery (
  cache_key   TEXT NOT NULL,
  date        DATE NOT NULL,
  artist_1    JSONB NOT NULL,
  artist_2    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cache_key, date)
);

CREATE INDEX IF NOT EXISTS idx_today_discovery_date
  ON public.today_discovery (date DESC);

COMMENT ON TABLE public.today_discovery IS
  '오늘의 발견 카드 캐싱. cache_key = device_id(활성) or "common"(신규). artist_1/artist_2 = {apple_id, name, artwork, genres, bio_ko, caption, reason, tracks[]}.';
COMMENT ON COLUMN public.today_discovery.cache_key IS
  '활성 사용자 device_id 또는 "common" (신규 공통).';
COMMENT ON COLUMN public.today_discovery.date IS
  'KST 기준 yyyy-mm-dd. (created_at AT TIME ZONE Asia/Seoul)::date 동기화 권장.';
COMMENT ON COLUMN public.today_discovery.artist_1 IS
  'Primary 아티스트 카드 JSON. shape: { apple_id, name, artwork, genres, bio_ko, caption, reason, tracks: [{ id, name, album, year, art, preview }] }.';
COMMENT ON COLUMN public.today_discovery.artist_2 IS
  'Partner 아티스트 카드 JSON. 동일 shape.';
