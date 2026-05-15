-- migration_019.sql
-- itunes_preview_cache.track_view_url 컬럼 추가 — Apple Music 딥링크 lazy backfill
-- 작성: 2026-05-15
-- 배경:
--   iTunes Search API 응답엔 preview_url과 함께 trackViewUrl(Apple Music 곡 페이지 딥링크)도
--   포함되어 있는데, 지금까지 preview_url만 추출해 캐시 중. trackViewUrl을 함께 캐시하면
--   듣기 시트에서 Apple Music을 검색 URL → 곡 직링크로 업그레이드 가능 (Spotify/YouTube와 동일 패턴).
-- 영향:
--   additive — 신규 곡은 자동 채워짐. 기존 매칭된 1163곡은 lazy backfill(다음 호출 시 채워짐).

-- ============================================================
-- 1. track_view_url 컬럼 추가 (nullable)
-- ============================================================

ALTER TABLE public.itunes_preview_cache
  ADD COLUMN IF NOT EXISTS track_view_url TEXT;

COMMENT ON COLUMN public.itunes_preview_cache.track_view_url IS
  'iTunes Search API의 trackViewUrl — Apple Music 곡 페이지 딥링크. preview_url과 동일 응답에서 함께 옴.';

-- ============================================================
-- 검증 SQL (실행 후 확인용)
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='itunes_preview_cache' AND column_name='track_view_url';
-- → 1 row: (track_view_url, text, YES)
--
-- backfill 진행도 모니터링:
-- SELECT
--   COUNT(*) FILTER (WHERE status='matched') AS matched,
--   COUNT(*) FILTER (WHERE status='matched' AND track_view_url IS NOT NULL) AS has_track_view_url,
--   COUNT(*) FILTER (WHERE status='matched' AND track_view_url IS NULL) AS pending_backfill
-- FROM public.itunes_preview_cache;
