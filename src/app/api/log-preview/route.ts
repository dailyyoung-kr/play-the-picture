import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_ACTION = new Set(["played", "completed"]);

/**
 * POST /api/log-preview
 * body: { device_id, song, artist, action: 'played' | 'completed' }
 *
 * 미리듣기 행동 로그 — 사용자가 ▶ 누름(played) / 30초 완료(completed) 시 호출.
 * 사용자 액션 단위라 entries 무관 (entries는 저장/공유 발생 시만 INSERT).
 *
 * 호출 패턴: fire-and-forget. user activation 영향 0.
 * 같은 device가 같은 곡 여러 번 재생/완료 시도 시 매번 row INSERT (행동 트랙).
 * KPI 측정 시 device_id로 distinct 카운트해 노이즈 제거 가능.
 */
export async function POST(req: NextRequest) {
  try {
    const { device_id, song, artist, action } = await req.json();

    if (!device_id || typeof device_id !== "string") {
      return NextResponse.json({ error: "device_id 필요" }, { status: 400 });
    }
    if (!action || !ALLOWED_ACTION.has(action)) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("preview_logs")
      .insert({
        device_id,
        song: typeof song === "string" ? song.slice(0, 200) : null,
        artist: typeof artist === "string" ? artist.slice(0, 200) : null,
        action,
      });

    if (error) {
      console.error("[log-preview] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[log-preview] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
