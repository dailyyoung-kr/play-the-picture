import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// 게스트 device_id에 묶인 데이터를 가입 user_id로 이전 (anon signin 후 호출)
// OAuth flow는 /auth/callback에서 inline으로 처리. 이 route는 anonymous signin 전용.
// save_logs는 migration_018에서 user_id 컬럼 추가 후 포함.
const TABLES_TO_MIGRATE = [
  "entries",
  "share_logs",
  "share_views",
  "try_click",
  "preference_logs",
  "analyze_logs",
  "recommendation_logs",
  "candidate_logs",
  "analysis_results",
  "save_logs",
] as const;

export async function POST(req: NextRequest) {
  try {
    const { device_id } = await req.json();
    if (!device_id) {
      return NextResponse.json({ error: "device_id 필요" }, { status: 400 });
    }

    // 세션 cookie에서 user 추출
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
            // read-only — 마이그레이션은 인증 cookie를 수정하지 않음
          },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    // service role로 마이그레이션 (RLS 우회)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const results: Record<string, number> = {};
    for (const table of TABLES_TO_MIGRATE) {
      const { count } = await adminClient
        .from(table)
        .update({ user_id: user.id }, { count: "exact" })
        .eq("device_id", device_id)
        .is("user_id", null);
      results[table] = count ?? 0;
    }

    // profiles.device_ids 업데이트 (중복 방지)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("device_ids")
      .eq("id", user.id)
      .single();
    const currentDeviceIds = (profile?.device_ids as string[] | null) ?? [];
    if (!currentDeviceIds.includes(device_id)) {
      await adminClient
        .from("profiles")
        .update({
          device_ids: [...currentDeviceIds, device_id],
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    // auth_logs 이벤트 기록
    await adminClient.from("auth_logs").insert({
      device_id,
      user_id: user.id,
      event: "device_migrated",
      metadata: { source: "anonymous_signin", ...results },
    });

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error("[migrate-device] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
