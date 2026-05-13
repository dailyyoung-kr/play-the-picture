import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exchangeKakaoCode, fetchKakaoUser, isKakaoConfigured } from "@/lib/auth/kakao";

// /auth/callback과 동일한 9+1개 테이블
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

type StatePayload = {
  device_id?: string;
  merge_from?: string;
  action?: "signin" | "link";
  native?: boolean; // iOS/Android 앱 deep link 모드
};

// 모바일 앱 deep link scheme (app.json의 scheme과 일치)
const NATIVE_DEEP_LINK_SCHEME = "playthepicture";

function parseState(stateRaw: string | null): StatePayload {
  if (!stateRaw) return {};
  try {
    const json = Buffer.from(stateRaw, "base64url").toString("utf8");
    return JSON.parse(json) as StatePayload;
  } catch {
    return {};
  }
}

// 카카오 user → Supabase user 식별 전략:
// - 1순위: user_metadata.kakao_id 매칭 (이미 가입한 카카오 user)
// - 2순위: email 매칭 (다른 provider로 가입한 user — conflict 후보)
// - 신규: createUser
// admin.listUsers는 작은 페이지로 listing해서 메타데이터 매칭. 우리 스케일(<1만)엔 충분.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findSupabaseUserByKakao(
  adminClient: any,
  kakaoId: string,
  email: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ user: any | null; matchedBy: "kakao_id" | "email" | null }> {
  // listUsers 페이지네이션 — 최대 10페이지 (1000명) 까지 sweep
  const perPage = 100;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.length === 0) break;

    // 1순위 — kakao_id 매칭
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byKakao = users.find((u: any) =>
      (u.user_metadata as Record<string, unknown> | null)?.kakao_id === kakaoId,
    );
    if (byKakao) return { user: byKakao, matchedBy: "kakao_id" };

    // 2순위 — email 매칭
    if (email) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byEmail = users.find((u: any) => u.email === email && !u.is_anonymous);
      if (byEmail) return { user: byEmail, matchedBy: "email" };
    }

    if (users.length < perPage) break; // 마지막 페이지
  }
  return { user: null, matchedBy: null };
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorCode = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const state = parseState(searchParams.get("state"));

  if (!isKakaoConfigured()) {
    return NextResponse.redirect(`${origin}/?auth_error=kakao_not_configured`);
  }

  // 카카오 동의 화면에서 거부한 경우 등
  if (errorCode || errorDescription) {
    const msg = errorDescription || errorCode || "unknown";
    return NextResponse.redirect(`${origin}/?auth_error=kakao_${encodeURIComponent(msg)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // 1. 인가 코드 → 카카오 토큰
    const tokens = await exchangeKakaoCode(code);

    // 2. 카카오 user 정보
    const kakao = await fetchKakaoUser(tokens.access_token);
    const kakaoId = kakao.id;

    // 3. Supabase user 매칭·생성
    // 이메일 미동의 시 fake email — 같은 카카오 user는 항상 같은 fake email
    const email = kakao.email ?? `kakao_${kakaoId}@play-the-picture.kakao`;
    const isRealEmail = !!kakao.email;

    const { user: existing, matchedBy } = await findSupabaseUserByKakao(adminClient, kakaoId, kakao.email);

    let supaUser = existing;
    let isNewUser = false;

    if (existing && matchedBy === "email" && state.action !== "link") {
      // 다른 provider(Google 등)로 가입한 동일 이메일 user → conflict
      // merge_from 들고온 경우엔 의도적 merge이므로 그대로 진행
      if (!state.merge_from) {
        // native 모드: deep link로 conflict 전달 (앱 WebView 세션 자동 종료)
        if (state.native) {
          return NextResponse.redirect(
            `${NATIVE_DEEP_LINK_SCHEME}://auth/callback?auth_error=email_conflict`,
          );
        }
        return NextResponse.redirect(`${origin}/?auth_error=email_conflict`);
      }
    }

    if (!supaUser) {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          provider: "kakao",
          kakao_id: kakaoId,
          kakao_email: isRealEmail ? kakao.email : null,
          kakao_nickname: kakao.nickname ?? null,
        },
      });
      if (error) throw new Error(`createUser failed: ${error.message}`);
      supaUser = data.user;
      isNewUser = true;
    }

    if (!supaUser) {
      return NextResponse.redirect(`${origin}/?auth_error=kakao_user_setup_failed`);
    }

    const userId = supaUser.id;
    const deviceId = state.device_id ?? "";

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 분기 A: merge 케이스 — anon user 데이터를 카카오 user로 합치기
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (state.merge_from) {
      const mergeFrom = state.merge_from;
      const { data: anonAuth } = await adminClient.auth.admin.getUserById(mergeFrom);
      if (!anonAuth?.user) {
        return NextResponse.redirect(`${origin}/?auth_error=merge_source_not_found`);
      }
      if (!anonAuth.user.is_anonymous) {
        return NextResponse.redirect(`${origin}/?auth_error=merge_invalid_source`);
      }
      const createdAt = new Date(anonAuth.user.created_at);
      if (Date.now() - createdAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
        return NextResponse.redirect(`${origin}/?auth_error=merge_source_expired`);
      }

      const { data: anonProfile } = await adminClient
        .from("profiles")
        .select("device_ids")
        .eq("id", mergeFrom)
        .single();
      const { data: kakaoProfile } = await adminClient
        .from("profiles")
        .select("device_ids")
        .eq("id", userId)
        .single();
      const anonDeviceIds = (anonProfile?.device_ids as string[] | null) ?? [];
      const kakaoDeviceIds = (kakaoProfile?.device_ids as string[] | null) ?? [];
      const mergedDeviceIds = Array.from(new Set([...kakaoDeviceIds, ...anonDeviceIds]));

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
        .update({ device_ids: mergedDeviceIds, updated_at: new Date().toISOString() })
        .eq("id", userId);

      await adminClient.from("auth_logs").insert({
        device_id: anonDeviceIds[0] ?? deviceId ?? "unknown",
        user_id: userId,
        event: "account_merged",
        metadata: { merged_from: mergeFrom, provider: "kakao", moved_rows: movedRows },
      });

      await adminClient.auth.admin.deleteUser(mergeFrom);
    } else if (deviceId) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 분기 B: 신규 가입 — device_id → user_id 마이그레이션
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
          .update({ device_ids: [...currentDeviceIds, deviceId], updated_at: new Date().toISOString() })
          .eq("id", userId);
      }
      await adminClient.from("auth_logs").insert([
        { device_id: deviceId, user_id: userId, event: "kakao_login_success" },
        ...(isNewUser ? [{ device_id: deviceId, user_id: userId, event: "signup_complete", metadata: { provider: "kakao" } as Record<string, unknown> }] : []),
        { device_id: deviceId, user_id: userId, event: "device_migrated", metadata: { provider: "kakao", ...movedRows } },
      ]);
    }

    // 4. 매직링크 생성 → 클라이언트에서 verifyOtp로 세션 확립
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: supaUser.email!,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[kakao/callback] generateLink failed:", linkError?.message);
      return NextResponse.redirect(`${origin}/?auth_error=kakao_session_failed`);
    }

    const tokenHash = linkData.properties.hashed_token;

    // native 모드: web finalize 거치지 않고 앱 deep link로 직접 redirect → RN이 verifyOtp 처리
    if (state.native) {
      return NextResponse.redirect(
        `${NATIVE_DEEP_LINK_SCHEME}://auth/callback?token_hash=${encodeURIComponent(tokenHash)}&provider=kakao${state.merge_from ? "&merge_success=1" : "&signup=success"}`,
      );
    }

    const finalizeNext = state.merge_from ? "/?merge_success=1" : "/?signup=success";
    return NextResponse.redirect(
      `${origin}/auth/kakao-finalize?token_hash=${encodeURIComponent(tokenHash)}&next=${encodeURIComponent(finalizeNext)}`,
    );
  } catch (e) {
    console.error("[kakao/callback] error:", e);
    return NextResponse.redirect(`${origin}/?auth_error=kakao_failed`);
  }
}
