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
    // itunes_preview_cache 페이지네이션 — Supabase PostgREST default max-rows 1000 제한 우회.
    // 1,384곡 (5/3 기준)이라 limit·range 명시해도 잘림. 1000개씩 page 단위로 모두 가져오기.
    async function fetchAllItunesStatus(): Promise<{ status: string | null }[]> {
      const all: { status: string | null }[] = [];
      const pageSize = 1000;
      for (let from = 0; from < 50000; from += pageSize) { // 안전 상한 50,000
        const { data, error } = await supabaseAdmin
          .from("itunes_preview_cache")
          .select("status")
          .range(from, from + pageSize - 1);
        if (error) {
          console.error("[admin/log-rows] itunes_preview_cache page:", error.message);
          break;
        }
        if (!data || data.length === 0) break;
        all.push(...(data as { status: string | null }[]));
        if (data.length < pageSize) break;
      }
      return all;
    }

    const [viewsRes, tryRes, itunesData, storySaveRes, shareRes, previewRes] = await Promise.all([
      supabaseAdmin
        .from("share_views")
        .select("id, created_at, device_id, entry_id")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("try_click")
        .select("id, created_at, device_id")
        .order("created_at", { ascending: false }),
      fetchAllItunesStatus(),
      supabaseAdmin
        .from("story_save_logs")
        .select("id, created_at, device_id, entry_id, status, user_agent")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("share_logs")
        .select("id, created_at, device_id, entry_id")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("preview_logs")
        .select("id, created_at, device_id, song, artist, action")
        .order("created_at", { ascending: false }),
    ]);

    if (viewsRes.error) console.error("[admin/log-rows] share_views:", viewsRes.error.message);
    if (tryRes.error) console.error("[admin/log-rows] try_click:", tryRes.error.message);
    if (storySaveRes.error) console.error("[admin/log-rows] story_save_logs:", storySaveRes.error.message);
    if (shareRes.error) console.error("[admin/log-rows] share_logs:", shareRes.error.message);
    if (previewRes.error) console.error("[admin/log-rows] preview_logs:", previewRes.error.message);

    return NextResponse.json({
      shareViews: viewsRes.data ?? [],
      tryClicks: tryRes.data ?? [],
      itunes: itunesData,
      storySaveLogs: storySaveRes.data ?? [],
      shareLogs: shareRes.data ?? [],
      previewLogs: previewRes.data ?? [],
    });
  } catch (e) {
    console.error("[admin/log-rows] 오류:", e);
    return NextResponse.json({ shareViews: [], tryClicks: [], itunes: [], storySaveLogs: [], shareLogs: [], previewLogs: [] }, { status: 500 });
  }
}
