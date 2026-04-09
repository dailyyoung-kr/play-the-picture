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

async function verifySpotifyTrack(songName: string, artistName: string, token: string): Promise<SpotifyTrackInfo> {
  const query = artistName
    ? `track:${songName} artist:${artistName}`
    : `track:${songName}`;

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    console.log("[analyze] Spotify 검색 실패:", res.status);
    return null;
  }
  const data = await res.json();
  const tracks: { id: string; artists: { name: string }[]; album: { images: { url: string }[] } }[] = data.tracks?.items ?? [];

  if (!artistName) {
    const track = tracks[0];
    return track ? { id: track.id, albumArt: track.album.images[0]?.url ?? null } : null;
  }

  const matched = tracks.find((track) =>
    track.artists.some((a) => artistMatches(a.name, artistName))
  );
  return matched ? { id: matched.id, albumArt: matched.album.images[0]?.url ?? null } : null;
}

// iTunes Search API로 앨범아트 가져오기 (무료, 인증 불필요)
async function getITunesAlbumArt(song: string, artist: string): Promise<string | null> {
  try {
    const query = `${song} ${artist}`.trim();

    async function searchItunes(country: string): Promise<string | null> {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=3&country=${country}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const artwork: string | undefined = data.results?.[0]?.artworkUrl100;
      return artwork ? artwork.replace("100x100bb", "600x600bb") : null;
    }

    // US + KR 스토어 동시 검색
    const [us, kr] = await Promise.all([searchItunes("us"), searchItunes("kr")]);
    const result = us ?? kr;
    console.log("[analyze] iTunes albumArt:", result ? result.slice(0, 60) + "..." : null);
    return result;
  } catch (e) {
    console.log("[analyze] iTunes 오류:", e);
    return null;
  }
}

function buildPrompt(genre: string, mood: string, listeningStyle: string): string {
  return `다음 정보를 모두 종합해서 실제로 존재하는 노래 1곡만 추천해줘.
반드시 실제 존재하는 곡인지 확인하고 추천해.

[타겟 사용자]
추천 대상은 20대 한국 사용자로, 매일 사진을 찍고 음악을 즐기며 새로운 음악을 발견하는 것을 좋아하는 사람이에요.
뻔한 추천보다 "오, 이런 곡도 있었어?" 하는 우연한 발견의 경험을 중요시해요.

[사진 분석]
업로드된 사진들의 색감, 장소, 분위기, 감정을 분석해줘.

[사용자 취향]
- 선호 장르: ${genre}
- 현재 기분: ${mood}
- 함께 듣는 사람: ${listeningStyle}

[장르별 추천 방향]
발라드 → 한국 발라드 중심. 서정적이고 감성적인 곡, 가사가 공감되는 곡.
인디 → 한국 인디 중심. 날것의 감성, 주류보다 독특한 사운드. 덜 알려진 곡도 적극 추천.
K-POP → 타이틀곡보다 수록곡·사이드 트랙 우선. 대형 아이돌 외 중소형 아티스트도 포함. 단, Spotify에 실제 존재하는 곡만.
힙합/R&B → 트랩, 붐뱁, 싱잉랩, 올드스쿨, R&B, 네오소울 등 스타일 자유롭게. 한국/글로벌 구분 없이 사진 분위기에 맞는 곡.
팝 → 글로벌 차트 외에도 인디팝, 드림팝, 얼터너티브팝, 아트팝 등 서브장르 자유롭게. 90년대~현재 다양하게. 뻔한 추천 지양, 숨은 명곡 우선.
재즈/어쿠스틱 → 악기 중심의 잔잔한 곡. 재즈, 보사노바, 어쿠스틱 포크 등 자유롭게. 한국/글로벌 구분 없이.
장르 발견하기 → 장르 제한 없이 사진 분위기와 기분에 가장 잘 맞는 장르를 AI가 자유롭게 선택해서 추천해줘. 유저가 평소에 잘 안 듣던 새로운 장르도 괜찮아. 이 경우 아래 JSON에 "discoveredGenre" 필드에 선택한 장르명을 한국어로 적어줘 (예: 시티팝, 드림팝, 네오소울, 보사노바 등).

[공통 조건]
- 반드시 Spotify에 실제 존재하는 곡
- 같은 아티스트가 반복 추천되지 않도록 다양하게
- 사진의 색감, 장소, 분위기를 최우선으로 반영
- 뻔하고 예측 가능한 추천 지양

[기분별 추천 방향]
신나 → 에너지 넘치고 업템포, 같이 흥얼거릴 수 있는 곡
설레 → 두근거리고 기대감 있는 곡
여유로워 → 잔잔하고 편안한 곡, 흘려듣기 좋은
복잡해 → 감정이 교차하는 묵직하고 깊이 있는 곡
지쳐 → 위로가 되거나 감정에 공감해주는 곡

[상황별 추천 방향]
출근/등교길 → 빠른 템포 또는 에너제틱한 곡, 하루를 힘차게 시작할 수 있는 비트감 있는 곡
작업/공부 → 집중을 방해하지 않는 곡, 가사 없거나 적은 곡, 잔잔하고 반복적인 리듬
데이트 → 설레고 두근거리는 곡, 따뜻하고 감성적인 곡, 함께 흥얼거릴 수 있는
휴식 → 편안하고 여유로운 곡, 배경음악처럼 자연스럽게 흐르는
산책/드라이브 → 미디엄 템포, 따뜻한 사운드, 풍경과 어울리는 감성적인 곡
잠들기 전 → 조용하고 잔잔한 곡, 몽환적이고 감성적인, 자극적이지 않은

[응답 형식 - JSON만 반환, 다른 텍스트 없이]
{
  "song": "곡명 - 아티스트명",
  "reason": "왜 이 노래인지 2-3줄 설명. 사진과 취향을 구체적으로 연결해서. 친근하지만 존댓말(~요체)로 작성해줘.",
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
  },
  "discoveredGenre": "장르 발견하기 선택 시에만 포함. AI가 선택한 장르명 한국어로 (예: 시티팝). 다른 장르 선택 시 이 필드 생략."
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

    // ① Claude 분석 + Spotify 토큰 발급을 동시에 시작
    const [response, spotifyToken] = await Promise.all([
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              { type: "text", text: buildPrompt(genre, mood, listeningStyle) },
            ],
          },
        ],
      }),
      getSpotifyToken(),
    ]);

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned);

    const songParts = (result.song as string).split(" - ");
    const songName = songParts[0]?.trim() ?? result.song;
    const artistName = songParts.slice(1).join(" - ").trim();

    // ② Spotify 검색 + iTunes 검색을 동시에 실행
    const [spotifyInfo, itunesArt] = await Promise.all([
      spotifyToken ? verifySpotifyTrack(songName, artistName, spotifyToken) : Promise.resolve(null),
      getITunesAlbumArt(songName, artistName),
    ]);

    const spotifyTrackId = spotifyInfo?.id ?? null;
    // Spotify 앨범아트 우선, 없으면 iTunes
    const albumArt = spotifyInfo?.albumArt ?? itunesArt;

    const isGenreDiscovery = genre === "장르 발견하기";

    console.log("[analyze] spotifyTrackId:", spotifyTrackId, "/ albumArt:", albumArt ? albumArt.slice(0, 60) + "..." : null);
    return NextResponse.json({
      ...result,
      spotifyTrackId,
      albumArt,
      isGenreDiscovery,
      discoveredGenre: isGenreDiscovery ? (result.discoveredGenre ?? null) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("분석 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
