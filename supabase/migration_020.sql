-- migration_020.sql
-- analyze_logs RLS 활성화 — anon DENY all (가장 민감 데이터: UTM 5종 + 행동 + user_id)
-- 작성: 2026-05-15
-- 배경:
--   analyze_logs는 utm_source/medium/campaign/content/term 5종 광고 데이터 + user_id + 에러 정보
--   를 한 테이블에 누적. 현재 RLS off라 anon 키로 누구나 SELECT/INSERT/UPDATE 가능 = 광고 전략 노출 위험.
-- 적용 전 작업:
--   클라이언트(preference/admin)의 직접 호출 → 서버 API (/api/analyze-logs, /api/admin/log-rows) 경유로 전환 완료.
-- 영향:
--   - service_role(서버 API): 자동 우회 → 정상 동작
--   - anon: 모든 작업 차단 → 직접 호출 코드 남아있으면 깨짐
--
-- 롤백:
--   ALTER TABLE public.analyze_logs DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1. RLS 활성화
-- ============================================================

ALTER TABLE public.analyze_logs ENABLE ROW LEVEL SECURITY;

-- 정책 추가 안 함 → anon은 default deny (SELECT/INSERT/UPDATE/DELETE 모두 차단)
-- service_role은 RLS 무관하게 항상 통과

-- ============================================================
-- 검증 SQL (적용 후 확인용)
-- ============================================================
-- 1) RLS 켜져 있는지:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname='analyze_logs';
-- → relrowsecurity = true
--
-- 2) anon으로 SELECT 시도 (실패해야 정상):
-- SET ROLE anon;
-- SELECT count(*) FROM analyze_logs;  -- 0 또는 권한 에러
-- RESET ROLE;
--
-- 3) service_role로 SELECT (성공해야 정상):
-- SET ROLE service_role;
-- SELECT count(*) FROM analyze_logs;
-- RESET ROLE;
