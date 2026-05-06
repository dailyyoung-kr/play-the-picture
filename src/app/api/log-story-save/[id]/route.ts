import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_STATUS = new Set([
  "clicked",
  "generated",
  "shared",
  "cancelled",
  "downloaded",
  "failed",
  "inapp_shown",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }

    const { status } = await req.json();
    if (typeof status !== "string" || !ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("story_save_logs")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error("[log-story-save PATCH] 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[log-story-save PATCH] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
