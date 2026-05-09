-- ========================================
-- Migration 014: analysis_results 테이블 생성 (Phase 1)
--
-- 목적:
-- 모든 추천 분석의 Claude 응답 콘텐츠 박제 (액션 안 한 87% 분석도 포함).
--
-- 현재 상태:
-- - recommendation_logs: 모든 분석의 song 선택 기록 (vibe_type만)
-- - entries: 사용자 액션(save/share/story) 시 풀데이터 (사진 + Claude 응답)
-- - 외부 308 entries (액션) vs 외부 2,435 recommendation_logs (분석) = 87% 갭
--
-- 변경 후:
-- - recommendation_logs: 그대로 (vibe_type만)
-- - entries: 그대로 (사용자 액션 시만, 사진 포함)
-- - analysis_results 신규: 모든 분석의 vibe·reason·tags 박제 (사진 X)
--
-- Phase 1 원칙:
-- - 기존 데이터 그대로 (backfill X)
-- - 읽기 코드 그대로 (entries에서 직접 읽기)
-- - 신규 분석부터 analysis_results 채워짐
-- - 사용자 영향 0, 위험 0
--
-- 효과:
-- - 패턴 분석 표본 8x (308 → 미래 2400+)
-- - "왜 87% 액션 안 했나" 분석 가능 (vibe별 액션 전환률)
-- - prompt versioning·A/B test 인프라 (model_id, prompt_version 컬럼)
--
-- 비교:
-- - 옵션 A (entries 즉시 insert): storage 5GB/년, privacy 위험
-- - 옵션 B (recommendation_logs 컬럼 추가): rec_logs 비대화
-- - 옵션 C (이 migration): 깨끗한 분리, 미래 확장성
-- ========================================

CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- recommendation_logs 1:1 link (FK 없음 — 비동기 insert 순서 안전)
  -- 같은 시점 recommendation_logs.id를 박지만, 실패 시 NULL 허용
  recommendation_log_id uuid,

  -- denormalized for fast query (JOIN 없이 분석 가능)
  device_id text NOT NULL,
  song_id uuid,

  -- ── Claude 응답 콘텐츠 ──
  vibe_type text,
  vibe_description text,
  reason text,
  tags text[],
  emotions jsonb,

  -- 선택 메타 (position bias 분석용 — candidate_logs와 결합 가능)
  selected_index int,

  -- ── 미래 확장 컬럼 ──
  -- A/B test framework 도입 시 활용
  ab_variant text,

  -- prompt versioning 도입 시 활용 (현재는 NULL)
  prompt_version text,

  -- 모델 비교 시 활용 (Claude vs GPT 등)
  model_id text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- 곡별 vibe·reason 분석용 (handoff §15·§16 같은 패턴 분석)
CREATE INDEX idx_analysis_song_id ON analysis_results (song_id);

-- device별 분석 history (1년+ heavy user 추적)
CREATE INDEX idx_analysis_device_created ON analysis_results (device_id, created_at);

-- recommendation_logs와 매핑용 (필요 시 조인)
CREATE INDEX idx_analysis_rec_log ON analysis_results (recommendation_log_id);

-- vibeType 패턴 분석 (handoff §16 — 73.7% 정형 어미 모니터링)
CREATE INDEX idx_analysis_vibe_type ON analysis_results (vibe_type) WHERE vibe_type IS NOT NULL;

-- 기간별 집계용
CREATE INDEX idx_analysis_created_at ON analysis_results (created_at);
