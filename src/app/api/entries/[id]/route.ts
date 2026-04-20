import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 공유 페이지에서 entry를 id로 조회 — supabaseAdmin으로 RLS 우회
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deviceId = req.headers.get("x-device-id") ?? "";

  if (!id || !deviceId) {
    return NextResponse.json({ error: "id, device_id 필요" }, { status: 400 });
  }

  // device_id가 일치하는 본인 기록만 삭제 (supabaseAdmin으로 RLS 우회하되 서버에서 직접 검증)
  const { error, count } = await supabaseAdmin
    .from("entries")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("device_id", deviceId);

  if (error) {
    console.error("[entries DELETE] 오류:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!count || count === 0) {
    // id가 없거나 device_id 불일치 — 권한 없음
    return NextResponse.json({ error: "삭제 권한 없음" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
