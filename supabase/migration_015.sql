-- migration_015.sql
-- Phase 1A: Auth infrastructure (회원가입 + 닉네임 + 데이터 마이그레이션 인프라)
-- 작성: 2026-05-11
-- SPEC: docs/SPEC_phase1_auth.md
-- DEVIATION: 스펙 §6-1의 "ALTER auth.users" 대신 "public.profiles 신규 테이블" 패턴 (Supabase 공식 권장)
-- ⚠️ DRAFT — 검토 후 적용. 모두 additive (기존 컬럼·정책 변경 X).

-- ============================================================
-- 1. public.profiles 테이블 신규
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  nickname_emoji text NOT NULL,
  device_ids text[] NOT NULL DEFAULT '{}',  -- 게스트 시절 device_id 누적 (마이그레이션 트래킹)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 닉네임 UNIQUE 제거 결정 (5/11): 동명이인 허용 — 캐릭터화 톤 우선, UNIQUE 없어도 운영 영향 X
-- 미래 친구·검색 기능 도입 시 Discord-style discriminator 추가 검토
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON public.profiles (nickname);
CREATE INDEX IF NOT EXISTS idx_profiles_device_ids ON public.profiles USING GIN (device_ids);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 누구나 SELECT (공유 페이지에서 작성자 닉네임 표시 필요)
CREATE POLICY "anyone can select profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- 본인만 UPDATE (닉네임 변경 등)
CREATE POLICY "users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- INSERT는 trigger에서만 (직접 client insert 차단)
-- DELETE는 auth.users CASCADE로 처리

-- ============================================================
-- 2. 닉네임 풀 — 음악 행위(emoji 매칭) × 동물
-- ============================================================
-- SPEC §5-3 이모지 매칭 룰 반영
-- 30 행위 × 50 동물 = 1500 unique 조합

CREATE OR REPLACE FUNCTION public.generate_random_nickname()
RETURNS TABLE (out_emoji text, out_action text, out_animal text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_emojis text[] := ARRAY[
    '🎵','🎵','🎤','🎵','🎵',           -- 노래·휘파람·콧노래·떼창
    '🎵','🎵','🎵','✨','🌟',           -- 박자·발까딱·고개끄덕·들썩이는·신난
    '🎧','🎤','🪕','🎼','🎸',           -- 소품 (이어폰·마이크·우쿨렐레·하모니카·기타멘)
    '🎧','🎼','💿','💿','🎧',           -- 헤드폰·악보·LP·턴테이블·붐박스
    '🎹','🎸','🥁','🎷','🎻',           -- 악기 연주 (피아노·기타·드럼·색소폰·바이올린)
    '🎺','🪈','🎼','🎻','🥁'            -- 트럼펫·플루트·실로폰·하프·카혼
  ];
  v_actions text[] := ARRAY[
    '노래하는','흥얼대는','휘파람 부는','콧노래 하는','떼창하는',
    '박자 맞추는','발 까딱이는','고개 끄덕이는','들썩이는','신난',
    '이어폰 낀','마이크 쥔','우쿨렐레 든','하모니카 부는','기타 멘',
    '헤드폰 쓴','악보 보는','LP 든','턴테이블 돌리는','붐박스 든',
    '피아노 치는','기타 치는','드럼 두드리는','색소폰 부는','바이올린 켜는',
    '트럼펫 부는','플루트 부는','실로폰 두드리는','하프 켜는','카혼 두드리는'
  ];
  v_animals text[] := ARRAY[
    '여우','토끼','사슴','거위','수달','펭귄','고슴도치','거북이','나비','달팽이',
    '꿀벌','무당벌레','고래','물범','문어','돌고래','호랑이','사자','판다','코알라',
    '기린','캥거루','라마','코끼리','다람쥐','강아지','고양이','햄스터','너구리',
    '오소리','비버','독수리','부엉이','오리','플라밍고','앵무새','박쥐','두더지',
    '족제비','치타','표범','알파카','미어캣','올빼미','새우','곰','늑대','코뿔소',
    '하마','양'
  ];
  v_action_idx int;
  v_animal_idx int;
BEGIN
  v_action_idx := floor(random() * 30 + 1)::int;
  v_animal_idx := floor(random() * 50 + 1)::int;

  out_emoji := v_emojis[v_action_idx];
  out_action := v_actions[v_action_idx];
  out_animal := v_animals[v_animal_idx];

  RETURN NEXT;
END;
$$;

-- ============================================================
-- 3. auth.users INSERT 시 profile 자동 생성 trigger
-- ============================================================
-- SPEC §5-1, §5-4

-- 닉네임 UNIQUE 제거 결정 (5/11) → 충돌 retry 로직 불필요. 단순 INSERT.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- RLS 우회용 (트리거 함수가 profiles에 insert 권한 필요)
SET search_path = public
AS $$
DECLARE
  v_nick record;
BEGIN
  SELECT * INTO v_nick FROM public.generate_random_nickname();

  INSERT INTO public.profiles (id, nickname, nickname_emoji)
  VALUES (
    NEW.id,
    v_nick.out_action || ' ' || v_nick.out_animal,
    v_nick.out_emoji
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. 기존 테이블에 user_id 컬럼 추가 (additive, nullable)
-- ============================================================
-- 모든 컬럼 nullable + REFERENCES with ON DELETE SET NULL.
-- 게스트 흐름은 user_id NULL로 그대로 작동 (기존 device_id 흐름 keep).

ALTER TABLE entries ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE share_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_share_logs_user_id ON share_logs (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE share_views ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_share_views_user_id ON share_views (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE try_click ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE preference_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_preference_logs_user_id ON preference_logs (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE analyze_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_analyze_logs_user_id ON analyze_logs (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recommendation_logs_user_id ON recommendation_logs (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE candidate_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results (user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 5. auth_logs 신규 (SPEC §8-2)
-- ============================================================
-- event 예시: 'gate_shown', 'google_login_start', 'google_login_success',
--   'apple_login_start', 'apple_login_success', 'guest_skip',
--   'signup_complete', 'nickname_changed', 'nickname_regenerated',
--   'device_migrated', 'save_prompt_shown', 'save_prompt_signup'

CREATE TABLE IF NOT EXISTS auth_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_device_id ON auth_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id ON auth_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_logs_event ON auth_logs (event);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON auth_logs (created_at DESC);

ALTER TABLE auth_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert auth_logs"
  ON auth_logs FOR INSERT
  WITH CHECK (true);

-- SELECT는 service_role bypass으로 admin이 조회 (별도 정책 X)

-- ============================================================
-- 6. entries 추가 RLS — 인증 user는 user_id 기반으로도 접근
-- ============================================================
-- 기존 policy "users can select own entries" (device_id 기반) 유지 → 게스트 흐름 keep
-- 신규 policy: 인증 user는 본인 user_id 매칭으로 select/update/delete 가능
-- 두 policy는 OR로 평가 → 가입 user는 device_id 또는 user_id 어느 쪽으로도 접근 가능

CREATE POLICY "auth users can select own entries"
  ON entries FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND user_id = auth.uid()
  );

CREATE POLICY "auth users can update own entries"
  ON entries FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND user_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND user_id = auth.uid()
  );

CREATE POLICY "auth users can delete own entries"
  ON entries FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND user_id = auth.uid()
  );

-- ============================================================
-- 검증 쿼리 (적용 후 실행)
-- ============================================================
-- SELECT * FROM public.generate_random_nickname();  -- 함수 작동 확인
-- SELECT count(*) FROM public.profiles;  -- 0
-- SELECT count(*) FROM auth_logs;  -- 0
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='user_id' ORDER BY table_name;
--   -- 9개 테이블에 user_id 보여야 함

-- ============================================================
-- ROLLBACK SCRIPT (별도 파일로 분리 권장 — 적용 후 문제 시 대비)
-- ============================================================
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP FUNCTION IF EXISTS public.generate_random_nickname();
-- DROP TABLE IF EXISTS auth_logs CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;
-- DROP POLICY IF EXISTS "auth users can select own entries" ON entries;
-- DROP POLICY IF EXISTS "auth users can update own entries" ON entries;
-- DROP POLICY IF EXISTS "auth users can delete own entries" ON entries;
-- ALTER TABLE entries DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE share_logs DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE share_views DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE try_click DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE preference_logs DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE analyze_logs DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE recommendation_logs DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE candidate_logs DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE analysis_results DROP COLUMN IF EXISTS user_id;
