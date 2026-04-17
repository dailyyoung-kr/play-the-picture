import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_EXIT_TYPES = ["navigate", "listen_click", "unload"] as const;
type ExitType = typeof ALLOWED_EXIT_TYPES[number];

export async function POST(req: NextRequest) {
  try {
    // sendBeacon은 custom header 불가 → URL 파라미터에서 device_id 추출
    const device_id =
      req.nextUrl.searchParams.get("device_id") ??
      req.headers.get("x-device-id") ??
      null;

    const body = await req.json();
    const { entry_id, duration_seconds, exit_type } = body;

    if (!ALLOWED_EXIT_TYPES.includes(exit_type as ExitType)) {
      return NextResponse.json({ error: "invalid exit_type" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("result_view_logs").insert({
      entry_id: entry_id ?? null,
      device_id,
      duration_seconds: typeof duration_seconds === "number" ? duration_seconds : null,
      exit_type,
    });

    if (error) {
      console.error("[log-result-view] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[log-result-view] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
