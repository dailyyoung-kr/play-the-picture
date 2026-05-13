import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * 서버 사이드(Next.js Route Handler·Server Component)에서 현재 로그인 user_id 추출.
 *
 * 인증 소스 (우선순위):
 *   1. Authorization: Bearer <access_token> 헤더 (RN/native 앱)
 *   2. 쿠키 세션 (web — getSession()으로 JWT 로컬 디코드, ~0ms)
 *
 * - 로그인 안 됐으면 null
 * - 위조 우려는 device_id 신뢰 모델과 동일 baseline
 *   (이 함수의 user_id는 통계·attribution 용도이지 보안 결정에 사용 안 함)
 *
 * 사용처: API routes에서 insert 시 user_id 채우기.
 * Request 객체를 받으면 Bearer 헤더 검사 → 없으면 쿠키로 fallback.
 */
export async function getCurrentUserId(req?: Request): Promise<string | null> {
  // 1. Bearer 토큰 (RN/native)
  if (req) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const accessToken = authHeader.slice(7);
      const adminCheck = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { data, error } = await adminCheck.auth.getUser(accessToken);
      if (!error && data.user) return data.user.id;
    }
  }

  // 2. 쿠키 세션 (web)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only 컨텍스트(API route)에서는 set 불필요 — no-op
        },
      },
    },
  );
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}
