import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Spotify Access Token 발급 (Client Credentials Flow)
async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

// 아티스트 매칭: 토큰 단위 완전 일치 (crush→acrush, iu→iuliafridrik 오매칭 방지)
function artistMatch(q: string, t: string): boolean {
  if (q === t) return true;
  const tokenize = (s: string) =>
    s.replace(/([a-z0-9]+)/g, " $1 ").replace(/([가-힣]+)/g, " $1 ").trim().split(/\s+/).filter(Boolean);
  const qTokens = tokenize(q);
  const tTokens = tokenize(t);
  return qTokens.every((w) => tTokens.includes(w)) || tTokens.every((w) => qTokens.includes(w));
}

// Spotify Track ID 검색
async function searchSpotifyTrack(song: string, artist: string): Promise<string | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

  async function doSearch(q: string): Promise<string | null> {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5&market=KR`,
      { headers: { Authorization: `Bearer ${token!}` } }
    );
    if (!res.ok) {
      console.log("[music-search] Spotify 응답 오류:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const items = data.tracks?.items ?? [];
    console.log("[music-search] Spotify 검색 쿼리:", q, "/ 결과:", JSON.stringify(items.map((t: { name: string; artists: { name: string }[]; id: string }) => ({ name: t.name, artist: t.artists[0]?.name, id: t.id }))));

    if (!artist) return items[0]?.id ?? null;

    const queryArtist = norm(artist);
    const matched = items.find((t: { name: string; artists: { name: string }[] }) =>
      artistMatch(queryArtist, norm(t.artists[0]?.name ?? ""))
    );
    return matched?.id ?? null;
  }

  // 1차: track:/artist: 필드 검색
  const fieldQuery = artist ? `track:${song} artist:${artist}` : `track:${song}`;
  const result = await doSearch(fieldQuery);
  if (result) return result;

  // 2차 fallback: 일반 키워드 검색
  const fallbackQuery = `${song} ${artist}`.trim();
  return await doSearch(fallbackQuery);
}

const YT_BLOCK_KEYWORDS = ["news", "breaking", "속보", "참사", "사고", "재난", "사망", "뉴스", "warning", "live breaking"];

// YouTube Video ID 검색
async function searchYouTubeVideo(query: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  console.log("[music-search] YouTube 검색 쿼리:", query);

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=id,snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=5&order=relevance&key=${apiKey}`
  );

  if (!res.ok) {
    console.log("[music-search] YouTube 응답 오류:", res.status);
    return null;
  }
  const data = await res.json();
  const items = data.items ?? [];
  console.log("[music-search] YouTube 결과:", JSON.stringify(items.map((v: { id: { videoId: string }; snippet: { title: string } }) => ({ id: v.id?.videoId, title: v.snippet?.title }))));

  const filtered = items.filter((v: { id: { videoId: string }; snippet: { title: string } }) => {
    const title = (v.snippet?.title ?? "").toLowerCase();
    return !YT_BLOCK_KEYWORDS.some((kw) => title.includes(kw));
  });

  return filtered[0]?.id?.videoId ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const song = searchParams.get("song") ?? "";
  const artist = searchParams.get("artist") ?? "";
  const query = `${song} ${artist}`.trim();

  if (!query) {
    return NextResponse.json({ error: "검색어가 없어요" }, { status: 400 });
  }

  // ── STEP 1: DB 조회 (songs 테이블에 이미 캐시된 값 있으면 즉시 반환) ──
  // song + artist 문자열 매칭 (ilike로 대소문자/공백 어느정도 허용)
  const { data: dbRow } = await supabaseAdmin
    .from("songs")
    .select("id, spotify_track_id, youtube_video_id")
    .ilike("song", song)
    .ilike("artist", artist)
    .limit(1)
    .maybeSingle();

  if (dbRow) {
    console.log("[music-search] DB hit:", { song, artist, cachedYoutube: !!dbRow.youtube_video_id });

    // YouTube ID가 없으면 API 호출 + UPDATE (lazy backfill)
    let youtubeId = dbRow.youtube_video_id as string | null;
    if (!youtubeId) {
      youtubeId = await searchYouTubeVideo(query);
      if (youtubeId) {
        const { error: upErr } = await supabaseAdmin
          .from("songs")
          .update({ youtube_video_id: youtubeId })
          .eq("id", dbRow.id);
        if (upErr) console.log("[music-search] youtube_video_id UPDATE 실패:", upErr.message);
      }
    }

    const spotifyId = dbRow.spotify_track_id as string | null;
    return NextResponse.json({
      spotifyUrl: spotifyId ? `https://open.spotify.com/track/${spotifyId}` : null,
      youtubeUrl: youtubeId ? `https://music.youtube.com/watch?v=${youtubeId}` : null,
      spotifyFallback: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
      youtubeFallback: `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
    });
  }

  // ── STEP 2: DB miss — 기존처럼 Spotify + YouTube 병렬 검색 ──
  console.log("[music-search] DB miss → API fallback:", { song, artist });
  const [spotifyId, youtubeId] = await Promise.all([
    searchSpotifyTrack(song, artist),
    searchYouTubeVideo(query),
  ]);

  return NextResponse.json({
    spotifyUrl: spotifyId
      ? `https://open.spotify.com/track/${spotifyId}`
      : null,
    youtubeUrl: youtubeId
      ? `https://music.youtube.com/watch?v=${youtubeId}`
      : null,
    // fallback: 검색 URL
    spotifyFallback: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    youtubeFallback: `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
  });
}
