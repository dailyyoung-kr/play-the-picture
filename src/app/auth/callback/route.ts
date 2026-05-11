import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// 게스트 device_id에 묶인 데이터를 가입 user_id로 이전할 테이블
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
] as const;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const deviceId = searchParams.get("device_id");
  // 가입 후 홈으로 복귀 (사진 그대로) + ?signup=success로 welcome toast 트리거
  const next = searchParams.get("next") ?? "/?signup=success";

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error.message)}`);
  }

  // 세션 교환 후 user 조회 + device 마이그레이션 + 로깅
  if (deviceId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      // 1. 게스트 device_id 묶인 데이터에 user_id 채움
      const migrationResults: Record<string, number> = {};
      for (const table of TABLES_TO_MIGRATE) {
        const { count } = await adminClient
          .from(table)
          .update({ user_id: user.id }, { count: "exact" })
          .eq("device_id", deviceId)
          .is("user_id", null);
        migrationResults[table] = count ?? 0;
      }

      // 2. profiles.device_ids 배열에 device_id 추가 (중복 방지)
      const { data: profile } = await adminClient
        .from("profiles")
        .select("device_ids")
        .eq("id", user.id)
        .single();
      const currentDeviceIds = (profile?.device_ids as string[] | null) ?? [];
      if (!currentDeviceIds.includes(deviceId)) {
        await adminClient
          .from("profiles")
          .update({
            device_ids: [...currentDeviceIds, deviceId],
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }

      // 3. auth_logs 이벤트 기록 (google_login_success + signup_complete + device_migrated)
      await adminClient.from("auth_logs").insert([
        { device_id: deviceId, user_id: user.id, event: "google_login_success" },
        { device_id: deviceId, user_id: user.id, event: "signup_complete" },
        { device_id: deviceId, user_id: user.id, event: "device_migrated", metadata: migrationResults },
      ]);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
