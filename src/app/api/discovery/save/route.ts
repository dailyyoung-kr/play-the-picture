/**
 * POST /api/discovery/save
 * body: { device_id, user_id (optional), item_type ("artist"|"track"), apple_id, snapshot }
 *
 * 동작: 동일 (cache_key, item_type, apple_id) row 있으면 삭제 (unsave), 없으면 추가 (save).
 * 응답: { saved: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
  let body: {
    device_id?: string;
    user_id?: string | null;
    item_type?: "artist" | "track";
    apple_id?: string;
    snapshot?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { device_id, user_id, item_type, apple_id, snapshot } = body;
  if (!device_id) {
    return NextResponse.json({ error: "device_id 필수" }, { status: 400 });
  }
  if (item_type !== "artist" && item_type !== "track") {
    return NextResponse.json({ error: "item_type은 'artist' 또는 'track'" }, { status: 400 });
  }
  if (!apple_id) {
    return NextResponse.json({ error: "apple_id 필수" }, { status: 400 });
  }

  const cacheKey = user_id || device_id;

  // 기존 row 확인
  const { data: existing } = await supabaseAdmin
    .from("discovery_saves")
    .select("id")
    .eq("cache_key", cacheKey)
    .eq("item_type", item_type)
    .eq("apple_id", apple_id)
    .maybeSingle();

  if (existing) {
    // 이미 저장됨 → 삭제 (unsave)
    const { error } = await supabaseAdmin
      .from("discovery_saves")
      .delete()
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ saved: false });
  }

  // 없으면 추가 (save)
  const { error } = await supabaseAdmin
    .from("discovery_saves")
    .insert({
      cache_key: cacheKey,
      item_type,
      apple_id,
      snapshot: snapshot ?? {},
    });
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
