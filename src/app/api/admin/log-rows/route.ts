import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/admin-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// admin 대시보드용 — anon key RLS 우회가 필요한 테이블들을 supabaseAdmin으로 읽기
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [viewsRes, tryRes] = await Promise.all([
      supabaseAdmin
        .from("share_views")
        .select("id, created_at, device_id")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("try_click")
        .select("id, created_at, device_id")
        .order("created_at", { ascending: false }),
    ]);

    if (viewsRes.error) console.error("[admin/log-rows] share_views:", viewsRes.error.message);
    if (tryRes.error) console.error("[admin/log-rows] try_click:", tryRes.error.message);

    return NextResponse.json({
      shareViews: viewsRes.data ?? [],
      tryClicks: tryRes.data ?? [],
    });
  } catch (e) {
    console.error("[admin/log-rows] 오류:", e);
    return NextResponse.json({ shareViews: [], tryClicks: [] }, { status: 500 });
  }
}
