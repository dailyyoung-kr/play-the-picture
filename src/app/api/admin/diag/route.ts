import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const usingServiceRole = !!serviceKey;
  const supabaseAdmin = createClient(url, serviceKey ?? anonKey);

  // share_views 행 수 조회
  const { count: viewCount, error: viewErr } = await supabaseAdmin
    .from("share_views")
    .select("*", { count: "exact", head: true });

  // try_click 행 수 조회
  const { count: tryCount, error: tryErr } = await supabaseAdmin
    .from("try_click")
    .select("*", { count: "exact", head: true });

  // share_logs 행 수 조회 (비교용)
  const { count: shareCount, error: shareErr } = await supabaseAdmin
    .from("share_logs")
    .select("*", { count: "exact", head: true });

  // 테스트 INSERT 시도 (실제 저장은 안 함 — 결과만 확인)
  const testInsert = await supabaseAdmin
    .from("share_views")
    .insert({ entry_id: "00000000-0000-0000-0000-000000000000", device_id: "diag-test" })
    .select("id")
    .single();

  // 테스트 데이터 롤백
  if (testInsert.data?.id) {
    await supabaseAdmin.from("share_views").delete().eq("id", testInsert.data.id);
  }

  return NextResponse.json({
    usingServiceRole,
    serviceKeyPrefix: serviceKey ? serviceKey.slice(0, 20) + "..." : null,
    tables: {
      share_views: { count: viewCount, error: viewErr?.message ?? null },
      try_click:   { count: tryCount,  error: tryErr?.message  ?? null },
      share_logs:  { count: shareCount, error: shareErr?.message ?? null },
    },
    testInsert: {
      success: !testInsert.error,
      error: testInsert.error?.message ?? null,
      errorCode: testInsert.error?.code ?? null,
    },
  });
}
