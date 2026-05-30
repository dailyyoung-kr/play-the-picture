/**
 * GET /api/discovery/saves?device_id=...&user_id=...
 * 응답: { artists: [{ apple_id, snapshot, saved_at }], tracks: [...] }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("device_id") || "";
  const userId = url.searchParams.get("user_id") || null;
  if (!deviceId && !userId) {
    return NextResponse.json({ error: "device_id 또는 user_id 필요" }, { status: 400 });
  }
  const cacheKey = userId || deviceId;

  const { data, error } = await supabaseAdmin
    .from("discovery_saves")
    .select("item_type, apple_id, snapshot, saved_at")
    .eq("cache_key", cacheKey)
    .order("saved_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const artists = (data ?? []).filter((r) => r.item_type === "artist");
  const tracks = (data ?? []).filter((r) => r.item_type === "track");
  return NextResponse.json({ artists, tracks });
}
