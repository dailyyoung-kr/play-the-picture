import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_STATUS = new Set(["clicked", "completed", "cancelled", "fallback"]);

export async function POST(req: NextRequest) {
  try {
    const { entry_id, device_id, status } = await req.json();

    if (!entry_id) {
      return NextResponse.json({ error: "entry_id 필요" }, { status: 400 });
    }

    const finalStatus =
      typeof status === "string" && ALLOWED_STATUS.has(status) ? status : null;

    // UA는 'clicked' insert 시점에만 박힘 (PATCH는 status만 갱신).
    // 같은 세션이라 환경 안 바뀜 — 비대칭 의도적.
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    const { data, error } = await supabaseAdmin
      .from("share_logs")
      .insert({
        entry_id,
        device_id: device_id ?? null,
        status: finalStatus,
        user_agent: ua,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[log-share] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error("[log-share] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
