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

type SpotifyTrack = {
  id: string; name: string; popularity: number;
  artists: { name: string }[];
  album: { images: { url: string }[]; album_type: string };
};

const EXCLUDE_KEYWORDS = [
  "live", "cover", "acoustic", "remix", "instrumental",
  "라이브", "커버", "어쿠스틱", "리믹스", "inst", "(from", "ver.", "version",
];

function isOriginalTrack(trackName: string, albumType: string): boolean {
  if (albumType === "compilation") return false;
  return !EXCLUDE_KEYWORDS.some((kw) => trackName.toLowerCase().includes(kw));
}

// Spotify에서 곡 검색 → track ID + 앨범아트 반환
// rateLimited: true면 429로 막힌 상태
async function findOnSpotify(
  song: string,
  artist: string,
  token: string
): Promise<{ trackId: string; albumArt: string | null; rateLimited?: boolean } | null> {
  const query = artist ? `${song} ${artist}` : song;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429) {
    console.log(`[spotify] 429 레이트리밋`);
    return { trackId: "", albumArt: null, rateLimited: true };
  }
  if (!res.ok) {
    console.log(`[spotify] HTTP ${res.status} for "${song} - ${artist}"`);
    return null;
  }

  const data = await res.json();
  const tracks = (data.tracks?.items ?? []) as SpotifyTrack[];
  console.log(`[spotify] "${song} - ${artist}" → ${tracks.length}곡: ${tracks.slice(0, 3).map(t => `"${t.name}-${t.artists[0]?.name}"(${t.popularity})`).join(" | ")}`);

  if (tracks.length === 0) return null;

  const original = tracks.filter((t) => isOriginalTrack(t.name, t.album.album_type));
  const pool = original.length > 0 ? original : tracks;

  // 아티스트명 검증: 특수문자 제거 후 소문자로 포함 여부 확인
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const queryArtist = norm(artist);
  const matched = queryArtist
    ? pool.find((t) => {
        const trackArtist = norm(t.artists[0]?.name ?? "");
        return trackArtist.includes(queryArtist) || queryArtist.includes(trackArtist);
      })
    : pool[0]; // artist 정보 없으면 검증 생략

  if (!matched) {
    console.log(`[spotify] ✗ 아티스트 불일치 - 쿼리: "${artist}" | 결과: ${pool.slice(0, 3).map(t => t.artists[0]?.name).join(", ")}`);
    return null;
  }

  console.log(`[spotify] ✓ 아티스트 매칭: "${artist}" ↔ "${matched.artists[0]?.name}"`);
  return { trackId: matched.id, albumArt: matched.album.images[0]?.url ?? null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const isOverloaded = status === 529 || (err instanceof Error && err.message.includes("529"));
      if (isOverloaded && i < maxRetries) {
        const delay = (i + 1) * 3000;
        console.log(`[analyze] 529 과부하, ${delay / 1000}초 후 재시도`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("최대 재시도 횟수 초과");
}

// ── 프롬프트 빌더 ──

function buildMainPrompt(genre: string, mood: string, listeningStyle: string, attempt = 0): string {
  let retryPrefix = "";
  if (attempt === 1) {
    retryPrefix = `앞서 추천한 곡이 Spotify에 없었어요. 이번엔 반드시:
- 월간 리스너 500만 이상의 확실히 유명한 아티스트
- Spotify에 100% 존재하는 곡
- 완전히 다른 아티스트와 곡으로 추천해줘\n\n`;
  } else if (attempt === 2) {
    retryPrefix = `여전히 Spotify에서 찾지 못했어요. 장르 제한 없이, 월간 리스너 1000만 이상의 매우 유명한 아티스트의 곡으로만 추천해줘.\n\n`;
  } else if (attempt >= 3) {
    retryPrefix = `Spotify 검증이 계속 실패하고 있어요. BTS, IU, NewJeans, aespa, Taylor Swift, Billie Eilish, The Weeknd 등 전 세계적으로 유명한 아티스트 중에서 사진 분위기에 맞는 곡을 추천해줘.\n\n`;
  }

  return `${retryPrefix}아래 정보를 바탕으로 사진에 가장 잘 어울리는 노래 1곡을 추천하고 결과를 반환해줘.

[타겟 사용자]
20대 한국 사용자. "들어본 것 같은데 제목은 몰랐던" 곡 위주. 완전한 언더그라운드 곡은 지양.

[사진 분석]
업로드된 사진들의 색감, 장소, 분위기, 감정을 분석해서 반영해줘.

[사용자 취향]
- 선호 장르: ${genre}
- 현재 기분: ${mood}
- 상황: ${listeningStyle}

[장르별 추천 방향]
인디 → 한국 인디 중심. 날것의 감성, 덜 알려진 곡도 포함. 한국 곡 위주.
K-POP → 타이틀곡 50% + 수록곡/B사이드 50% 비율로 믹스. 잘 알려진 곡과 숨은 명곡 균형있게.
힙합/R&B → 한국/글로벌 구분 없이. 다양한 스타일 자유롭게.
팝 → 인디팝, 드림팝, 얼터너티브팝 등 서브장르 자유롭게. 외국 곡 위주.
재즈/어쿠스틱 → 악기 중심의 잔잔한 곡. 외국 곡 비중 허용.
장르 발견하기 → 인디팝, 드림팝, 시티팝, 네오소울, 얼터너티브, 포스트록, 앰비언트팝, 침머, 로파이 범위 내. 월간 리스너 100만 이상. 한국/글로벌 자유.

[피해야 할 아티스트]
Bon Iver, The xx, Cigarettes After Sex, The National, Hozier, Phoebe Bridgers,
Lana Del Rey, Sufjan Stevens, Iron & Wine, Fleet Foxes, Sigur Rós, Mogwai,
Daughter, Beach House, James Blake, Nick Drake, Elliott Smith, Radiohead.

[공통 조건]
- 반드시 Spotify에 실제 존재하는 곡만 추천
- 곡명과 아티스트명은 Spotify 검색에 최적화된 정확한 영문/한글로
- 오리지널 스튜디오 음원만 (커버/라이브/리믹스 제외)

[응답 형식 - JSON만 반환, 다른 텍스트 없이]
{
  "song": "곡명 - 아티스트명",
  "spotifyQuery": { "song": "Spotify 검색용 곡명 (영문)", "artist": "Spotify 검색용 아티스트명 (영문)" },
  "reason": "2-3문장. 사진에서 오늘의 이야기를 상상해서 짧은 스토리처럼 표현. 분석 리포트가 아닌 감성적이고 시적인 톤으로. 마지막 문장은 약간 신비롭거나 위트있게 마무리. 예시: '키보드 앞에 앉아 있지만 마음은 이미 퇴근한 것 같은 오늘. 이 곡은 그 틈새를 정확히 파고들어요. 오늘 이 곡을 들으면 뭔가 하나가 풀릴 것 같아요.' 존댓말(~요체) 유지.",
  "tags": [
    "1번: 장르/서브장르 (예: 인디팝, 발라드, R&B, 드림팝, 네오소울, 시티팝 / 최대 6자, # 없이 텍스트만)",
    "2번: 무드/감정 (예: 잔잔한, 신나는, 몽환적, 따뜻한, 쓸쓸한, 설레는 / 최대 6자, # 없이 텍스트만)",
    "3번: 상황/시간대 (예: 드라이브, 새벽, 출근길, 작업할때, 잠들기전, 산책 / 최대 6자, # 없이 텍스트만)"
  ],
  "emotions": {
    "행복함": 0~100 숫자,
    "설레임": 0~100 숫자,
    "에너지": 0~100 숫자,
    "특별함": 0~100 숫자
  },
  "hidden_emotion": "오늘의 숨은 감정 한 줄 (이모지 포함)",
  "emotion_comment": "4개 감정 중 가장 높은 수치를 기반으로 사용자에게 말을 거는 느낌의 한 줄 코멘트. 존댓말(~요체), 따뜻하고 공감되는 톤, 20자 이내. 예: '오늘 뭔가 특별한 하루인 것 같아요 ✨'",
  "vibe_type": "이모지 + 오늘의 나를 표현하는 유형명 (10자 이내). 반드시 한글만 사용. 예: 🕺 거리의 주인공 / 🌙 새벽 감성러 / 🍃 조용한 관찰자",
  "vibe_description": "오늘 나의 상황이나 감정을 20자 이내로 표현. 20대 카톡 상태메시지 말투. 예: '회의 3개 버텨낸 사람의 음악' / '조용히 존재하는 중'",
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
반드시 어두운 톤(밝기 10-15% 이하)으로 설정해줘.

---

곡을 추천하기 전에 반드시 아래 검증 과정을 거쳐줘:

STEP 1 - 자가 검증:
추천하려는 곡에 대해 스스로 답해줘:
- 이 곡이 실제로 존재하는가? (확신도 0~100%)
- 아티스트명 정확한 스펠링은?
- 이 곡이 수록된 앨범/싱글 이름은?
확신도가 80% 미만이면 이 곡은 버리고 다른 곡을 선택해.

STEP 2 - 대체 기준:
확신하지 못하는 곡 대신 아래 조건의 곡으로 대체해:
- 해당 아티스트의 대표곡 또는 가장 많이 알려진 곡
- 월간 스트리밍 100만 이상이 확실한 곡
- 앨범 수록곡보다 싱글/타이틀곡 우선

STEP 3 - 최종 출력:
확신하는 곡 1개만 최종 추천해줘.
절대 없는 곡을 만들어내지 마.
모르면 모른다고 하지 말고,
대신 확실히 아는 곡으로 바꿔줘.

예시:
❌ 폴킴의 "나만의 계절" → 없는 곡이므로 버림
✅ 폴킴의 "나만 몰랐던 이야기" → 확실한 곡으로 대체`;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API 키가 설정되지 않았어요." }, { status: 500 });
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

    const spotifyToken = await getSpotifyToken();
    const isGenreDiscovery = genre === "장르 발견하기";
    const maxAttempts = 4;

    let finalResult: Record<string, unknown> | null = null;
    let spotifyTrackId: string | null = null;
    let albumArt: string | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`[analyze] 시도 ${attempt + 1}/${maxAttempts} | 장르: ${genre}`);

      // ── 1단계: Claude가 1곡 선택 + 전체 결과 생성 ──
      const response = await withRetry(() => client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: buildMainPrompt(genre, mood, listeningStyle, attempt) },
          ],
        }],
      }));

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

      let result: Record<string, unknown>;
      try {
        result = JSON.parse(cleaned);
      } catch {
        console.log(`[analyze] JSON 파싱 실패, 재시도`);
        continue;
      }

      const songField = result.song as string;
      const spotifyQuery = result.spotifyQuery as { song: string; artist: string } | undefined;

      // spotifyQuery 있으면 영문 검색, 없으면 song 필드에서 파싱
      const searchSong = spotifyQuery?.song ?? songField.split(" - ")[0]?.trim() ?? songField;
      const searchArtist = spotifyQuery?.artist ?? songField.split(" - ").slice(1).join(" - ").trim();

      console.log(`[analyze] 추천: "${songField}" | 검색: "${searchSong} - ${searchArtist}"`);

      // ── 2단계: Spotify에서 그 1곡만 검색 ──
      if (spotifyToken) {
        const found = await findOnSpotify(searchSong, searchArtist, spotifyToken);
        if (found && !found.rateLimited && found.trackId) {
          spotifyTrackId = found.trackId;
          albumArt = found.albumArt;
          finalResult = result;
          console.log(`[analyze] ✓ Spotify 검증 성공: ${spotifyTrackId}`);
          break;
        } else if (found?.rateLimited) {
          // 429 → 재시도 없이 즉시 현재 결과 사용
          console.log(`[analyze] 429 감지 → 즉시 반환 (플레이어 없음)`);
          finalResult = result;
          break;
        } else {
          console.log(`[analyze] ✗ Spotify에서 찾지 못함 (시도 ${attempt + 1}/${maxAttempts})`);
          // 마지막 시도면 Spotify 없이 그대로 사용
          if (attempt === maxAttempts - 1) {
            console.log(`[analyze] Spotify 검증 실패 - 결과는 반환 (플레이어 없음)`);
            finalResult = result;
          }
          continue;
        }
      } else {
        // Spotify 토큰 없으면 그대로 사용
        finalResult = result;
        break;
      }
    }

    if (!finalResult) {
      return NextResponse.json(
        { error: "분석 중 오류가 발생했어요. 다시 시도해주세요." },
        { status: 500 }
      );
    }

    // spotifyQuery 필드는 응답에서 제거
    const { spotifyQuery: _sq, ...resultToReturn } = finalResult as Record<string, unknown> & { spotifyQuery?: unknown };

    console.log("[analyze] 완료:", finalResult.song, "| id:", spotifyTrackId);

    return NextResponse.json({
      ...resultToReturn,
      spotifyTrackId,
      albumArt,
      isGenreDiscovery,
      discoveredGenre: isGenreDiscovery ? (finalResult.discoveredGenre ?? null) : undefined,
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    const message = error instanceof Error ? error.message : String(error);
    console.error("분석 오류:", message);

    if (status === 529 || message.includes("529") || message.toLowerCase().includes("overloaded")) {
      return NextResponse.json(
        { error: "지금 플더픽이 너무 바빠요 🙏 잠시 후 다시 시도해주세요" },
        { status: 529 }
      );
    }
    if (status === 429 || message.includes("429") || message.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { error: "잠깐, 너무 많은 요청이 들어왔어요. 잠시 후 다시 시도해주세요" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "분석 중 오류가 발생했어요. 다시 시도해주세요" },
      { status: 500 }
    );
  }
}
