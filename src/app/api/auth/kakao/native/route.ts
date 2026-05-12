import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchKakaoUser, isKakaoConfigured } from "@/lib/auth/kakao";

// POST /api/auth/kakao/native
// body: { access_token: string, device_id?: string, merge_from?: string }
//
// 네이티브 RN 앱에서 Kakao SDK로 받은 access_token을 보내면:
// 1) Kakao /v2/user/me로 사용자 정보 조회
// 2) Supabase user 매칭 또는 신규 생성
// 3) device_id 마이그레이션 or anon merge (web /api/auth/kakao/callback 분기 A·B 동일)
// 4) magic link 발급 → token_hash 반환
// 클라이언트는 token_hash로 supabase.auth.verifyOtp({type:'magiclink'}) 호출해 세션 확립.

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findSupabaseUserByKakao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  kakaoId: string,
  email: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ user: any | null; matchedBy: "kakao_id" | "email" | null }> {
  const perPage = 100;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.length === 0) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byKakao = users.find((u: any) =>
      (u.user_metadata as Record<string, unknown> | null)?.kakao_id === kakaoId,
    );
    if (byKakao) return { user: byKakao, matchedBy: "kakao_id" };
    if (email) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byEmail = users.find((u: any) => u.email === email && !u.is_anonymous);
      if (byEmail) return { user: byEmail, matchedBy: "email" };
    }
    if (users.length < perPage) break;
  }
  return { user: null, matchedBy: null };
}

export async function POST(request: NextRequest) {
  if (!isKakaoConfigured()) {
    return NextResponse.json({ error: "kakao_not_configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const accessToken: string | undefined = body.access_token;
    const deviceId: string = body.device_id ?? "";
    const mergeFrom: string | undefined = body.merge_from;

    if (!accessToken) {
      return NextResponse.json({ error: "access_token 필요" }, { status: 400 });
    }

    // 1. 카카오 user 정보 조회
    const kakao = await fetchKakaoUser(accessToken);
    const kakaoId = kakao.id;

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 2. user 매칭·생성
    const email = kakao.email ?? `kakao_${kakaoId}@play-the-picture.kakao`;
    const isRealEmail = !!kakao.email;
    const { user: existing, matchedBy } = await findSupabaseUserByKakao(
      adminClient,
      kakaoId,
      kakao.email,
    );

    let supaUser = existing;
    let isNewUser = false;

    if (existing && matchedBy === "email" && !mergeFrom) {
      // 다른 provider로 가입한 동일 이메일 → 충돌. native에서는 모달 띄울 수 없으니 에러 반환
      return NextResponse.json(
        { error: "email_conflict", message: "이 이메일은 이미 다른 계정에 등록되어 있어요." },
        { status: 409 },
      );
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
      if (error || !data?.user) {
        return NextResponse.json({ error: `createUser failed: ${error?.message}` }, { status: 500 });
      }
      supaUser = data.user;
      isNewUser = true;
    }

    if (!supaUser) {
      return NextResponse.json({ error: "user_setup_failed" }, { status: 500 });
    }

    const userId = supaUser.id;

    // 3. merge or device 마이그레이션 (web callback 분기 A·B와 동일 로직)
    if (mergeFrom) {
      const { data: anonAuth } = await adminClient.auth.admin.getUserById(mergeFrom);
      if (anonAuth?.user && anonAuth.user.is_anonymous) {
        const createdAt = new Date(anonAuth.user.created_at);
        if (Date.now() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000) {
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
            metadata: { merged_from: mergeFrom, provider: "kakao", moved_rows: movedRows, source: "native" },
          });

          await adminClient.auth.admin.deleteUser(mergeFrom);
        }
      }
    } else if (deviceId) {
      const movedRows: Record<string, number> = {};
      await Promise.all(
        TABLES_TO_MIGRATE.map(async (table) => {
          const { count } = await adminClient
            .from(table)
            .update({ user_id: userId }, { count: "exact" })
            .eq("device_id", deviceId)
            .is("user_id", null);
          movedRows[table] = count ?? 0;
        }),
      );
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
        { device_id: deviceId, user_id: userId, event: "kakao_login_success", metadata: { source: "native" } },
        ...(isNewUser
          ? [
              {
                device_id: deviceId,
                user_id: userId,
                event: "signup_complete",
                metadata: { provider: "kakao", source: "native" } as Record<string, unknown>,
              },
            ]
          : []),
        { device_id: deviceId, user_id: userId, event: "device_migrated", metadata: { provider: "kakao", source: "native", ...movedRows } },
      ]);
    }

    // 4. magic link 발급
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: supaUser.email!,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.json(
        { error: `magic link failed: ${linkError?.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      token_hash: linkData.properties.hashed_token,
      user_id: userId,
    });
  } catch (e) {
    console.error("[kakao/native] error:", e);
    return NextResponse.json({ error: "unexpected_error" }, { status: 500 });
  }
}
