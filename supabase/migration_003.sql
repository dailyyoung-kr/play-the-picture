-- migration_003.sql
-- entries 테이블 RLS 설정
-- 실행 순서: 코드 배포(Vercel) 완료 확인 후 Supabase SQL Editor에서 실행

-- 1. RLS 활성화
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- 2. INSERT — 누구나 가능 (새 기록 저장)
CREATE POLICY "anyone can insert entries"
  ON entries FOR INSERT
  WITH CHECK (true);

-- 3. SELECT — x-device-id 헤더와 device_id가 일치하는 행만 조회 가능
--    (공유 페이지 등 서버 API는 service_role key 사용으로 RLS 우회)
CREATE POLICY "users can select own entries"
  ON entries FOR SELECT
  USING (
    device_id = nullif(current_setting('request.headers', true), '')::json->>'x-device-id'
  );

-- 4. DELETE — x-device-id 헤더와 device_id가 일치하는 본인 기록만 삭제 가능
CREATE POLICY "users can delete own entries"
  ON entries FOR DELETE
  USING (
    device_id = nullif(current_setting('request.headers', true), '')::json->>'x-device-id'
  );
