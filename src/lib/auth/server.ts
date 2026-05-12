import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * 서버 사이드(Next.js Route Handler·Server Component)에서 현재 로그인 user_id 추출.
 *
 * - getSession() 사용 — 쿠키의 JWT 로컬 디코드만 (auth 서버 ping 없음, ~0ms)
 * - 로그인 안 됐으면 null
 * - 위조 우려는 device_id 신뢰 모델과 동일 baseline
 *   (이 함수의 user_id는 통계·attribution 용도이지 보안 결정에 사용 안 함)
 *
 * 사용처: API routes에서 insert 시 user_id 채우기.
 */
export async function getCurrentUserId(): Promise<string | null> {
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
