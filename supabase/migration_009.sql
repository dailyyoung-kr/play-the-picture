-- ========================================
-- Migration 009: songs 테이블에 youtube_video_id 컬럼 추가
-- music-search API 호출 시 YouTube API 중복 호출 방지 (lazy caching)
-- ========================================

ALTER TABLE songs ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;

CREATE INDEX IF NOT EXISTS idx_songs_youtube_video_id
  ON songs(youtube_video_id) WHERE youtube_video_id IS NOT NULL;
