import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

function getMediaType(dataUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (dataUrl.startsWith("data:image/png")) return "image/png";
  if (dataUrl.startsWith("data:image/webp")) return "image/webp";
  if (dataUrl.startsWith("data:image/gif")) return "image/gif";
  return "image/jpeg";
}

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

function normalizeArtist(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

function artistMatches(spotifyArtist: string, claudeArtist: string): boolean {
  const a = normalizeArtist(spotifyArtist);
  const b = normalizeArtist(claudeArtist);
  return a.includes(b) || b.includes(a);
}

type SpotifyTrackInfo = { id: string; albumArt: string | null } | null;

async function verifySpotifyTrack(songName: string, artistName: string): Promise<SpotifyTrackInfo> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const query = artistName
    ? `track:${songName} artist:${artistName}`
    : `track:${songName}`;

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const tracks: { id: string; artists: { name: string }[]; album: { images: { url: string }[] } }[] = data.tracks?.items ?? [];

  if (!artistName) {
    const track = tracks[0];
    return track ? { id: track.id, albumArt: track.album.images[0]?.url ?? null } : null;
  }

  // 아티스트 이름 매칭 확인
  const matched = tracks.find((track) =>
    track.artists.some((a) => artistMatches(a.name, artistName))
  );
  return matched ? { id: matched.id, albumArt: matched.album.images[0]?.url ?? null } : null;
}

function buildPrompt(genre: string, mood: string, listeningStyle: string, rejectedSong?: string): string {
  const retryPrefix = rejectedSong
    ? `앞서 추천한 ${rejectedSong}는 Spotify에 존재하지 않아. 다른 곡으로 추천해줘.\n\n`
    : "";

  return `${retryPrefix}다음 정보를 모두 종합해서 실제로 존재하는 노래 1곡만 추천해줘.
반드시 실제 존재하는 곡인지 확인하고 추천해.

[사진 분석]
업로드된 사진들의 색감, 장소, 분위기, 감정을 분석해줘.

[사용자 취향]
- 선호 장르: ${genre}
- 현재 기분: ${mood}
- 함께 듣는 사람: ${listeningStyle}

[장르별 추천 방향]
인디/락 → 감성적이고 독립적인 인디 또는 록 계열
발라드 → 서정적이고 감성적인 발라드
K-POP → 트렌디하고 세련된 케이팝
POP → 글로벌 팝 계열
장르 발견하기 → 장르 제한 없이 사진 분위기와 기분에 가장 잘 맞는 장르를 AI가 자유롭게 선택해서 추천해줘. 유저가 평소에 잘 안 듣던 새로운 장르도 괜찮아.

[기분별 추천 방향]
설레 → 두근거리고 기대감 있는 곡
평온해 → 잔잔하고 여유로운 곡
좀 지쳐 → 위로가 되거나 공감되는 곡
신나 → 에너지 넘치고 업템포 곡
복잡해 → 감정이 교차하는 묵직한 곡

[함께 듣는 사람별 추천 방향]
혼자 → 나만 아는 감성, 내밀하고 조용한 곡
친한 친구와 → 같이 흥얼거릴 수 있는 신나고 편한 곡
사랑하는 사람과 → 따뜻하고 감성적인 곡
새로운 사람과 → 설레고 두근거리는 분위기 곡

[응답 형식 - JSON만 반환, 다른 텍스트 없이]
{
  "song": "곡명 - 아티스트명",
  "reason": "왜 이 노래인지 2-3줄 설명. 사진과 취향을 구체적으로 연결해서",
  "tags": ["태그1", "태그2", "태그3"],
  "emotions": {
    "행복함": 0~100 숫자,
    "설레임": 0~100 숫자,
    "에너지": 0~100 숫자,
    "특별함": 0~100 숫자
  },
  "hidden_emotion": "오늘의 숨은 감정 한 줄 (이모지 포함)",
  "vibe_type": "이모지 + 위트있는 유형명 (10자 이내, 예: 🌙 새벽 감성 수집가)",
  "vibe_description": "장르명 · 한 줄 설명 (20자 이내, 예: 서정적 발라드 · 일상의 소소함을 아름답게 바라보는 시선)",
  "background": {
    "from": "시작 hex 색상 (어두운 톤, 곡 분위기 반영)",
    "to": "끝 hex 색상 (어두운 톤, 곡 분위기 반영)"
  }
}

배경 색상 가이드:
- 잔잔하고 감성적인 곡 → from: #0d1a10, to: #1a0d18
- 설레는 곡 → from: #0d1218, to: #1a1408
- 위로 발라드 → from: #1a0d0d, to: #0d0d1a
- 신나는 곡 → from: #1a1208, to: #081a12
반드시 어두운 톤(밝기 10-15% 이하)으로 설정해줘.`;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API 키가 설정되지 않았어요. .env.local을 확인해주세요." }, { status: 500 });
    }
    const client = new Anthropic({ apiKey });

    const { photos, genre, mood, listeningStyle } = await req.json();

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "사진이 없어요" }, { status: 400 });
    }

    const imageBlocks = photos.map((dataUrl: string) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: getMediaType(dataUrl),
        data: dataUrl.split(",")[1],
      },
    }));

    const MAX_RETRIES = 3;
    let result = null;
    let spotifyTrackId: string | null = null;
    let albumArt: string | null = null;
    let rejectedSong: string | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              {
                type: "text",
                text: buildPrompt(genre, mood, listeningStyle, rejectedSong),
              },
            ],
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      result = JSON.parse(cleaned);

      // Spotify 존재 여부 검증 (곡명 + 아티스트 매칭)
      const songParts = (result.song as string).split(" - ");
      const songName = songParts[0]?.trim() ?? result.song;
      const artistName = songParts.slice(1).join(" - ").trim();

      const verified = await verifySpotifyTrack(songName, artistName);
      if (verified) {
        spotifyTrackId = verified.id;
        albumArt = verified.albumArt;
        break;
      }

      // 검증 실패 시 다음 시도에서 재요청
      rejectedSong = result.song;
    }

    return NextResponse.json({ ...result, spotifyTrackId, albumArt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("분석 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
