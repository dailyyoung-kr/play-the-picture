import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { genre, energy } = await req.json();

    if (!genre) {
      return NextResponse.json({ error: "genre 필요" }, { status: 400 });
    }

    // energy 컬럼 포함 시도
    const { error } = await supabaseAdmin
      .from("preference_logs")
      .insert({ genre, energy: energy ?? null });

    if (error) {
      // energy 컬럼 없을 경우 genre만 저장
      const { error: e2 } = await supabaseAdmin
        .from("preference_logs")
        .insert({ genre });
      if (e2) {
        console.error("[log-preference] insert 실패:", e2.message);
        return NextResponse.json({ error: e2.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[log-preference] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
