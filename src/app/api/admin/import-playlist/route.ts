import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type RawTrackItem = {
  track: {
    id: string;
    name: string;
    duration_ms: number;
    album: { name: string; images: { url: string }[] };
    artists: { name: string }[];
  } | null;
};

export async function POST(req: NextRequest) {
  const { playlistUrl } = await req.json();

  // playlist ID 추출
  const match = playlistUrl?.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) {
    return NextResponse.json({ error: "유효한 Spotify 플레이리스트 URL이 아니에요." }, { status: 400 });
  }
  const playlistId = match[1];

  // Spotify 토큰
  const token = await getSpotifyToken();
  if (!token) {
    return NextResponse.json({ error: "Spotify 토큰 발급 실패" }, { status: 500 });
  }

  // 플레이리스트 트랙 가져오기
  const spotifyRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&market=KR&fields=items(track(id,name,duration_ms,album(name,images),artists(name)))`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!spotifyRes.ok) {
    return NextResponse.json({ error: `Spotify API 오류: ${spotifyRes.status}` }, { status: 500 });
  }

  const spotifyData = await spotifyRes.json();
  const tracks = (spotifyData.items as RawTrackItem[])
    .filter(item => item.track?.id)
    .map(item => ({
      spotifyTrackId: item.track!.id,
      song: item.track!.name,
      artist: item.track!.artists.map(a => a.name).join(", "),
      album: item.track!.album.name,
      duration: formatDuration(item.track!.duration_ms),
      albumArtUrl: item.track!.album.images[0]?.url ?? null,
    }));

  if (tracks.length === 0) {
    return NextResponse.json({ error: "플레이리스트에서 곡을 찾지 못했어요." }, { status: 400 });
  }

  // Claude energy 태깅
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API 키 없음" }, { status: 500 });
  }
  const client = new Anthropic({ apiKey });

  const songList = tracks.map((t, i) => `${i}: ${t.song} - ${t.artist}`).join("\n");
  const prompt = `아래 곡 목록에 energy 값(1~5)을 붙여줘.
1=잔잔, 2=여유, 3=설렘, 4=신남, 5=파워풀
JSON 배열로만 응답. 각 항목: {"index": N, "energy": N}

${songList}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  let energyMap: Record<number, number> = {};
  try {
    const arr = JSON.parse(cleaned) as { index: number; energy: number }[];
    for (const item of arr) {
      energyMap[item.index] = Math.min(5, Math.max(1, item.energy));
    }
  } catch {
    // fallback: 모두 3
  }

  const tagged = tracks.map((t, i) => ({
    ...t,
    energy: energyMap[i] ?? 3,
  }));

  return NextResponse.json({ tracks: tagged });
}
