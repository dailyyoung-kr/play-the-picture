import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "@/lib/auth/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/entries
 * body: { date, song, artist, reason, tags, emotions, vibe_type,
 *         vibe_description, photos, album_art, device_id, genre,
 *         platform?, os? }
 *
 * RN 앱이 호출. web은 client-side supabase INSERT 그대로 사용 (점진 마이그레이션 예정).
 * 서버에서 supabaseAdmin으로 RLS 우회 — device_id는 클라이언트가 박은 값 그대로 신뢰
 * (web과 동일 — RLS도 결국 헤더 device_id를 그대로 받는 구조라 신뢰 모델 동일).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      date,
      song,
      artist,
      reason,
      tags,
      emotions,
      vibe_type,
      vibe_description,
      photos,
      album_art,
      device_id,
      genre,
      platform,
      os,
    } = body;

    if (!device_id || typeof device_id !== "string") {
      return NextResponse.json({ error: "device_id 필요" }, { status: 400 });
    }
    if (!song || typeof song !== "string") {
      return NextResponse.json({ error: "song 필요" }, { status: 400 });
    }

    const user_id = await getCurrentUserId(req);

    const { data, error } = await supabaseAdmin
      .from("entries")
      .insert({
        date,
        song,
        artist: artist ?? "",
        reason: reason ?? "",
        tags: Array.isArray(tags) ? tags : [],
        emotions: emotions ?? {},
        vibe_type: vibe_type ?? "",
        vibe_description: vibe_description ?? "",
        photos: Array.isArray(photos) ? photos : [],
        album_art: album_art ?? null,
        device_id,
        user_id,
        genre: genre ?? null,
        ...(platform ? { platform } : {}),
        ...(os ? { os } : {}),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[entries POST] insert 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error("[entries POST] 오류:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
