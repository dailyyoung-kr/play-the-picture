import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// service_role로 RLS 우회 — analyze_logs 테이블 RLS는 anon DENY all 정책
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * POST — analyze_logs 신규 INSERT (status=start 시점)
 * body: { device_id, user_id?, status, utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term? }
 * returns: { id }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      device_id, user_id, status,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    } = body as Record<string, string | null | undefined>;

    if (!device_id || !status) {
      return NextResponse.json({ error: "device_id, status 필수" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("analyze_logs")
      .insert({
        device_id,
        user_id: user_id ?? null,
        status,
        utm_source: utm_source ?? null,
        utm_medium: utm_medium ?? null,
        utm_campaign: utm_campaign ?? null,
        utm_content: utm_content ?? null,
        utm_term: utm_term ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[analyze-logs POST] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    console.error("[analyze-logs POST] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

/**
 * PATCH — analyze_logs UPDATE (status=success/fail 시점)
 * body: { id, status, response_time_ms?, error_reason?, error_code?, song?, artist?, spotify_status?, perf_db_ms?, perf_claude_ms?, photo_count? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body as Record<string, unknown>;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id 필수" }, { status: 400 });
    }

    // 허용 컬럼 화이트리스트 — 임의 컬럼 UPDATE 차단
    const ALLOWED = new Set([
      "status", "response_time_ms", "error_reason", "error_code",
      "song", "artist", "spotify_status",
      "perf_db_ms", "perf_claude_ms", "photo_count",
    ]);
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (ALLOWED.has(k)) sanitized[k] = v;
    }
    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json({ error: "업데이트할 필드 없음" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("analyze_logs")
      .update(sanitized)
      .eq("id", id);

    if (error) {
      console.error("[analyze-logs PATCH] update 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[analyze-logs PATCH] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

