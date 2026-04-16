import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { entry_id, song } = await req.json();
    const device_id = req.headers.get("x-device-id") ?? null;

    const { error } = await supabaseAdmin
      .from("listen_logs")
      .insert({
        entry_id: entry_id ?? null,
        song: song ?? null,
        device_id,
      });

    if (error) {
      console.error("[log-listen] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[log-listen] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
