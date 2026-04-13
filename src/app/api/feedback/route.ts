import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { spotifyTrackId, action } = await req.json();

  if (!spotifyTrackId || (action !== "like" && action !== "skip")) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const field = action === "like" ? "like_count" : "skip_count";

  const { error } = await supabaseAdmin.rpc("increment_song_count", {
    p_track_id: spotifyTrackId,
    p_field: field,
  });

  // rpc가 없을 경우 직접 update로 fallback
  if (error) {
    const { data: song } = await supabaseAdmin
      .from("songs")
      .select("like_count, skip_count")
      .eq("spotify_track_id", spotifyTrackId)
      .single();

    if (!song) {
      return NextResponse.json({ error: "곡을 찾을 수 없어요." }, { status: 404 });
    }

    const currentVal = (song[field as keyof typeof song] as number) ?? 0;
    const { error: updateError } = await supabaseAdmin
      .from("songs")
      .update({ [field]: currentVal + 1 })
      .eq("spotify_track_id", spotifyTrackId);

    if (updateError) {
      return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
