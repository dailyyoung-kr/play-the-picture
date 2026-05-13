import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// 게스트 device_id에 묶인 데이터를 가입 user_id로 이전할 테이블
// save_logs는 migration_018에서 user_id 컬럼 추가 후 포함
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

// Supabase가 OAuth 실패 시 redirect URL에 담는 에러 description 패턴 → conflict 분류
function isEmailConflict(errorCode: string | null, errorDescription: string | null): boolean {
  const desc = (errorDescription || "").toLowerCase();
  const code = (errorCode || "").toLowerCase();
  return (
    code.includes("identity_already_exists") ||
    code.includes("email_address_already") ||
    code.includes("user_already_exists") ||
    desc.includes("identity is already") ||
    desc.includes("email") && (desc.includes("already") || desc.includes("in use")) ||
    desc.includes("user already")
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorCode = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const deviceId = searchParams.get("device_id");
  const mergeFrom = searchParams.get("merge_from"); // anon → google merge 케이스
  const native = searchParams.get("native") === "1"; // iOS/Android 앱 deep link 모드
  const NATIVE_DEEP_LINK_SCHEME = "playthepicture";

  // OAuth 에러 응답 — 이메일 충돌 vs 기타로 분류
  // native=1 모드: deep link로 redirect (앱 WebView 세션 자동 종료 + 클라이언트가 error 파싱)
  if (errorCode || errorDescription) {
    const isConflict = isEmailConflict(errorCode, errorDescription);
    if (native) {
      const err = isConflict
        ? "email_conflict"
        : encodeURIComponent(errorDescription || errorCode || "unknown");
      return NextResponse.redirect(`${NATIVE_DEEP_LINK_SCHEME}://auth/callback?auth_error=${err}`);
    }
    if (isConflict) {
      return NextResponse.redirect(`${origin}/?auth_error=email_conflict`);
    }
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(errorDescription || errorCode || "unknown")}`,
    );
  }

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

  const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[auth/callback] exchange failed:", exchangeError.message);
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(exchangeError.message)}`);
  }

  const userId = exchangeData?.user?.id;
  if (!userId) {
    return NextResponse.redirect(`${origin}/?auth_error=no_user`);
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 분기 A: merge 케이스 — anon user 데이터를 현재 Google user로 합치기
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (mergeFrom) {
    try {
      // 1. anon user 검증
      const { data: anonAuth } = await adminClient.auth.admin.getUserById(mergeFrom);
      if (!anonAuth?.user) {
        return NextResponse.redirect(`${origin}/?auth_error=merge_source_not_found`);
      }
      if (!anonAuth.user.is_anonymous) {
        return NextResponse.redirect(`${origin}/?auth_error=merge_invalid_source`);
      }
      // 30일 이내 anon만 허용 (sanity)
      const createdAt = new Date(anonAuth.user.created_at);
      if (Date.now() - createdAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
        return NextResponse.redirect(`${origin}/?auth_error=merge_source_expired`);
      }

      // 2. anon profile.device_ids 먼저 fetch — 아래 device_id 기반 UPDATE에서 사용
      const { data: anonProfile } = await adminClient
        .from("profiles")
        .select("device_ids")
        .eq("id", mergeFrom)
        .single();
      const { data: googleProfile } = await adminClient
        .from("profiles")
        .select("device_ids")
        .eq("id", userId)
        .single();
      const anonDeviceIds = (anonProfile?.device_ids as string[] | null) ?? [];
      const googleDeviceIds = (googleProfile?.device_ids as string[] | null) ?? [];
      const mergedDeviceIds = Array.from(new Set([...googleDeviceIds, ...anonDeviceIds]));

      // 3. 테이블별 user_id UPDATE: anon → google (2단계)
      //   1단계: anon device_id에 속하고 user_id=NULL인 row (insert 시 user_id 못 박은 케이스)
      //   2단계: user_id=anon인 row (migrate-device로 attribute됐던 케이스)
      // 두 단계 모두 다른 user 데이터 절대 못 건드림 (NULL 가드 + user_id 일치 가드)
      const movedRows: Record<string, number> = {};
      for (const table of TABLES_TO_MIGRATE) {
        let migrated = 0;
        if (anonDeviceIds.length > 0) {
          const { count } = await adminClient
            .from(table)
            .update({ user_id: userId }, { count: "exact" })
            .in("device_id", anonDeviceIds)
            .is("user_id", null);
          migrated += count ?? 0;
        }
        const { count: byUserId } = await adminClient
          .from(table)
          .update({ user_id: userId }, { count: "exact" })
          .eq("user_id", mergeFrom);
        migrated += byUserId ?? 0;
        movedRows[table] = migrated;
      }
      await adminClient
        .from("profiles")
        .update({
          device_ids: mergedDeviceIds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      // 4. auth_logs 이벤트 기록
      await adminClient.from("auth_logs").insert({
        device_id: anonDeviceIds[0] ?? "unknown",
        user_id: userId,
        event: "account_merged",
        metadata: { merged_from: mergeFrom, moved_rows: movedRows },
      });

      // 5. anon user 삭제 (CASCADE로 profile도 함께 삭제)
      await adminClient.auth.admin.deleteUser(mergeFrom);

      return NextResponse.redirect(`${origin}/?merge_success=1`);
    } catch (e) {
      console.error("[auth/callback] merge failed:", e);
      return NextResponse.redirect(`${origin}/?auth_error=merge_failed`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 분기 B: 신규 가입 (OAuth) — 기존 device_id → user_id 마이그레이션
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (deviceId) {
    const movedRows: Record<string, number> = {};
    for (const table of TABLES_TO_MIGRATE) {
      const { count } = await adminClient
        .from(table)
        .update({ user_id: userId }, { count: "exact" })
        .eq("device_id", deviceId)
        .is("user_id", null);
      movedRows[table] = count ?? 0;
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("device_ids")
      .eq("id", userId)
      .single();
    const currentDeviceIds = (profile?.device_ids as string[] | null) ?? [];
    if (!currentDeviceIds.includes(deviceId)) {
      await adminClient
        .from("profiles")
        .update({
          device_ids: [...currentDeviceIds, deviceId],
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    await adminClient.from("auth_logs").insert([
      { device_id: deviceId, user_id: userId, event: "google_login_success" },
      { device_id: deviceId, user_id: userId, event: "signup_complete" },
      { device_id: deviceId, user_id: userId, event: "device_migrated", metadata: movedRows },
    ]);
  }

  // native 모드: 이미 web 세션은 쿠키에 박혔지만, RN은 별도 세션 필요 → magic link 생성 후 deep link redirect
  if (native && exchangeData?.user?.email) {
    try {
      const { data: linkData } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: exchangeData.user.email,
      });
      const tokenHash = linkData?.properties?.hashed_token;
      if (tokenHash) {
        const provider = exchangeData.user.app_metadata?.provider ?? "oauth";
        return NextResponse.redirect(
          `${NATIVE_DEEP_LINK_SCHEME}://auth/callback?token_hash=${encodeURIComponent(tokenHash)}&provider=${encodeURIComponent(provider)}&signup=success`,
        );
      }
    } catch (e) {
      console.error("[auth/callback] native magic link failed:", e);
      return NextResponse.redirect(`${NATIVE_DEEP_LINK_SCHEME}://auth/callback?auth_error=session_failed`);
    }
  }

  const next = searchParams.get("next") ?? "/?signup=success";
  return NextResponse.redirect(`${origin}${next}`);
}
