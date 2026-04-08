import { NextRequest, NextResponse } from "next/server";

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

// Spotify Track ID 검색
async function searchSpotifyTrack(query: string): Promise<string | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.tracks?.items?.[0]?.id ?? null;
}

// YouTube Video ID 검색
async function searchYouTubeVideo(query: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=id&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=1&key=${apiKey}`
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0]?.id?.videoId ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const song = searchParams.get("song") ?? "";
  const artist = searchParams.get("artist") ?? "";
  const query = `${song} ${artist}`.trim();

  if (!query) {
    return NextResponse.json({ error: "검색어가 없어요" }, { status: 400 });
  }

  // 병렬로 두 플랫폼 검색
  const [spotifyId, youtubeId] = await Promise.all([
    searchSpotifyTrack(query),
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
