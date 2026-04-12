import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const TOKENS_PATH = path.join(process.cwd(), ".spotify-tokens.json");

type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

async function getOAuthToken(): Promise<string | null> {
  // .spotify-tokens.json 없으면 미연결 상태
  if (!fs.existsSync(TOKENS_PATH)) {
    console.log("[import-playlist] .spotify-tokens.json 없음 → Spotify 미연결");
    return null;
  }

  let tokens: SpotifyTokens;
  try {
    tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    console.log("[import-playlist] 토큰 파일 파싱 실패");
    return null;
  }

  // 아직 유효한 토큰 (만료 60초 전까지 그대로 사용)
  if (Date.now() < tokens.expiresAt - 60_000) {
    console.log("[import-playlist] 기존 토큰 유효, 재사용");
    return tokens.accessToken;
  }

  // 만료됐으면 refresh
  console.log("[import-playlist] 토큰 만료 → refresh 시도");
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!res.ok) {
    console.log("[import-playlist] refresh 실패:", res.status);
    return null;
  }

  const data = await res.json();
  const newTokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  fs.writeFileSync(TOKENS_PATH, JSON.stringify(newTokens, null, 2), "utf-8");
  console.log("[import-playlist] 토큰 갱신 완료");
  return newTokens.accessToken;
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

  // OAuth 토큰
  const token = await getOAuthToken();
  console.log("[import-playlist] token:", token ? token.slice(0, 20) + "..." : null);
  if (!token) {
    return NextResponse.json(
      { error: "Spotify 연결이 필요해요. 어드민 페이지에서 'Spotify 연결' 버튼을 눌러주세요." },
      { status: 401 }
    );
  }

  // 플레이리스트 트랙 가져오기
  const spotifyRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&market=KR`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log("[import-playlist] spotifyRes.status:", spotifyRes.status);
  if (!spotifyRes.ok) {
    const errBody = await spotifyRes.text();
    console.log("[import-playlist] spotifyRes error body:", errBody);
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
