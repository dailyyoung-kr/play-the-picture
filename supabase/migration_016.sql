-- migration_016.sql
-- Phase 1A: 닉네임에서 이모지 제거 (5/11 결정)
-- 이유: 캐릭터화 톤 유지하되 이모지가 닉네임 일부로 들어가는 게 어색 — 깔끔하게 텍스트만
-- 영향: 환영 화면 UI에서만 추후 별도 emoji 표현 가능 (DB와 분리)

-- 1. profiles에서 nickname_emoji 컬럼 삭제
ALTER TABLE public.profiles DROP COLUMN IF EXISTS nickname_emoji;

-- 2. 옛 함수·트리거 정리 (return type 변경 위해 DROP 후 재생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.generate_random_nickname();

-- 3. generate_random_nickname() 재생성 — emoji 반환 제거
CREATE FUNCTION public.generate_random_nickname()
RETURNS TABLE (out_action text, out_animal text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
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
BEGIN
  out_action := v_actions[floor(random() * 30 + 1)::int];
  out_animal := v_animals[floor(random() * 50 + 1)::int];
  RETURN NEXT;
END;
$$;

-- 4. handle_new_user() 재생성 — nickname_emoji INSERT 제거
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nick record;
BEGIN
  SELECT * INTO v_nick FROM public.generate_random_nickname();
  INSERT INTO public.profiles (id, nickname)
  VALUES (NEW.id, v_nick.out_action || ' ' || v_nick.out_animal);
  RETURN NEW;
END;
$$;

-- 5. 트리거 재생성
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. 권한 재revoke (CREATE는 권한 초기화하니까)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
