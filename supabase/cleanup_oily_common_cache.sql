-- 콜드 풀(`common_*`) 캐시 중 오늘 날짜 row 삭제
-- 이유: forceColdStart 옵션 도입 이전에 생성된 카드는 첫 진입자의
-- vibe_description이 묻어서 만들어진 가능성이 있음. 한 번 비우고
-- 새 로직으로 깨끗하게 다시 생성되도록 유도.
--
-- 안전성: today_discovery는 캐시 테이블이라 삭제해도 다음 진입자가
-- 새로 생성. 활성 사용자 row(`cache_key=user_uuid`)는 건드리지 않음.
--
-- 실행: Supabase Dashboard SQL editor에서 한 번만.

DELETE FROM today_discovery
WHERE cache_key LIKE 'common%'
  AND date = (now() AT TIME ZONE 'Asia/Seoul')::date;

-- 결과 확인용
SELECT cache_key, date, created_at
FROM today_discovery
WHERE date = (now() AT TIME ZONE 'Asia/Seoul')::date
ORDER BY created_at DESC;
