import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { entry_id, device_id } = await req.json();

    if (!entry_id || !device_id) {
      return NextResponse.json({ error: "entry_id, device_id 필요" }, { status: 400 });
    }

    // 중복 저장 방지 — UNIQUE index가 있지만 API 레벨에서 친절하게 처리
    const { data: existing } = await supabaseAdmin
      .from("save_logs")
      .select("id")
      .eq("entry_id", entry_id)
      .eq("device_id", device_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, already_saved: true });
    }

    const { error } = await supabaseAdmin
      .from("save_logs")
      .insert({ entry_id, device_id });

    if (error) {
      console.error("[log-save] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[log-save] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
