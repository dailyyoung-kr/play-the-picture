import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { entry_id, device_id } = await req.json();

    if (!entry_id) {
      return NextResponse.json({ error: "entry_id 필요" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("share_logs")
      .insert({ entry_id, device_id: device_id ?? null });

    if (error) {
      console.error("[log-share] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[log-share] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
