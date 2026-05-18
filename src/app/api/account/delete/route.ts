import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "@/lib/auth/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 분석/로그 테이블 — user_id NULL로 익명화 (운영 통계 유지, Apple/GDPR 충족)
const ANON_TABLES = [
  "analyze_logs",
  "preference_logs",
  "listen_logs",
  "preview_logs",
  "result_view_logs",
  "save_logs",
  "share_logs",
  "share_views",
  "story_save_logs",
  "try_click",
  "photo_upload_logs",
] as const;

// 완전 행 삭제 — 개인 데이터
const DELETE_TABLES = ["entries", "recommendation_logs", "profiles"] as const;

/**
 * POST /api/account/delete
 *
 * 인증된 사용자 자신의 계정을 완전 삭제.
 * - 분석/로그 테이블: user_id NULL (행 유지, 식별자만 제거)
 * - 개인 데이터 (entries, profiles, recommendation_logs): 행 삭제
 * - auth.users: 마지막 (모든 세션 자동 무효화)
 *
 * 호출: 클라이언트에서 Authorization: Bearer <access_token> 헤더 필수.
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1. 분석/로그 테이블 익명화 (병렬) — 일부 실패해도 진행 (best effort)
  await Promise.allSettled(
    ANON_TABLES.map((table) =>
      supabaseAdmin
        .from(table)
        .update({ user_id: null })
        .eq("user_id", userId),
    ),
  );

  // 2. 개인 데이터 삭제 (병렬)
  await Promise.allSettled(
    DELETE_TABLES.map((table) =>
      supabaseAdmin.from(table).delete().eq(
        table === "profiles" ? "id" : "user_id",
        userId,
      ),
    ),
  );

  // 3. auth.users 삭제 — 가장 마지막 (Supabase가 모든 세션 자동 무효화)
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("[account/delete] auth.deleteUser 실패:", authError.message);
    return NextResponse.json(
      { error: `auth 삭제 실패: ${authError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
