import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { spotifyTrackId, action } = await req.json();

  if (!spotifyTrackId || !["like", "unlike", "skip", "unskip"].includes(action)) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const field = action === "like" || action === "unlike" ? "like_count" : "skip_count";
  const delta = action === "like" || action === "skip" ? 1 : -1;

  const { data: song } = await supabaseAdmin
    .from("songs")
    .select("like_count, skip_count")
    .eq("spotify_track_id", spotifyTrackId)
    .single();

  if (!song) {
    return NextResponse.json({ error: "곡을 찾을 수 없어요." }, { status: 404 });
  }

  const currentVal = (song[field as keyof typeof song] as number) ?? 0;
  const newVal = Math.max(0, currentVal + delta);

  const { error: updateError } = await supabaseAdmin
    .from("songs")
    .update({ [field]: newVal })
    .eq("spotify_track_id", spotifyTrackId);

  if (updateError) {
    return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
