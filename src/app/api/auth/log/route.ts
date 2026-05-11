import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const { device_id, user_id, event, metadata } = await req.json();

    if (!device_id || !event) {
      return NextResponse.json({ error: "device_id, event 필요" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("auth_logs").insert({
      device_id,
      user_id: user_id ?? null,
      event,
      metadata: metadata ?? null,
    });

    if (error) {
      console.error("[auth/log] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/log] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
