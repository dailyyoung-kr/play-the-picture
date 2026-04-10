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

// Spotify에서 곡 검색 → track ID + 앨범아트 + 실제 메타데이터 반환
// rateLimited: true면 429로 막힌 상태
async function findOnSpotify(
  song: string,
  artist: string,
  token: string
): Promise<{ trackId: string; albumArt: string | null; trackName: string; trackArtist: string; rateLimited?: boolean } | null> {
  const query = artist ? `${song} ${artist}` : song;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5&market=KR`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429) {
    console.log(`[spotify] 429 레이트리밋`);
    return { trackId: "", albumArt: null, trackName: "", trackArtist: "", rateLimited: true };
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

  // 아티스트명 + 곡명 검증: 특수문자 제거 후 소문자로 비교
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  // 아티스트 매칭: 토큰 단위 완전 일치 (crush→acrush, iu→iuliafridrik 오매칭 방지)
  const artistMatch = (q: string, t: string): boolean => {
    if (q === t) return true;
    const tokenize = (s: string) =>
      s.replace(/([a-z0-9]+)/g, " $1 ").replace(/([가-힣]+)/g, " $1 ").trim().split(/\s+/).filter(Boolean);
    const qTokens = tokenize(q);
    const tTokens = tokenize(t);
    return qTokens.every((w) => tTokens.includes(w)) || tTokens.every((w) => qTokens.includes(w));
  };
  const queryArtist = norm(artist);
  const querySong = norm(song);
  const matched = pool.find((t) => {
    const trackArtist = norm(t.artists[0]?.name ?? "");
    const trackName = norm(t.name);
    const artistOk = !queryArtist || artistMatch(queryArtist, trackArtist);
    const songOk = !querySong || trackName.includes(querySong) || querySong.includes(trackName);
    return artistOk && songOk;
  });

  if (!matched) {
    console.log(`[spotify] ✗ 불일치 - 쿼리: "${song} - ${artist}" | 결과: ${pool.slice(0, 3).map(t => `"${t.name}-${t.artists[0]?.name}"`).join(", ")}`);
    return null;
  }

  const trackArtist = matched.artists[0]?.name ?? "";
  console.log(`[spotify] ✓ 매칭: "${song} - ${artist}" ↔ "${matched.name} - ${trackArtist}"`);
  return { trackId: matched.id, albumArt: matched.album.images[0]?.url ?? null, trackName: matched.name, trackArtist };
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
- 같은 장르 내에서 더 유명한 곡으로
- 월간 리스너 500만 이상의 아티스트
- Spotify에 확실히 존재하는 곡으로 추천해줘\n\n`;
  } else if (attempt === 2) {
    retryPrefix = `앞선 추천 곡들이 Spotify에 없었어요. 이번엔 장르를 완전히 바꿔서 추천해줘.\n- 사진 분위기와 100% 일치하지 않아도 돼\n- 이전에 추천한 장르와 다른 장르로\n- Spotify에 확실히 존재하는 곡만\n\n`;
  } else if (attempt >= 3) {
    retryPrefix = `Spotify 검증이 계속 실패하고 있어요. 팝 / K-POP / 힙합 중 하나를 선택해서, 월간 리스너 1000만 이상 아티스트의 확실히 존재하는 곡으로 추천해줘.\n\n`;
  }

  const genreDiscoveryPrefix = genre === "장르 발견하기" && attempt === 0
    ? `[장르 발견하기 주의사항]\n월간 리스너 100만 이상 아티스트의 곡만 추천. Spotify에 확실히 존재하는 곡이어야 함.\n\n`
    : "";

  return `${retryPrefix}${genreDiscoveryPrefix}아래 정보를 바탕으로 사진에 가장 잘 어울리는 노래 1곡을 추천하고 결과를 반환해줘.

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
K-POP → 타이틀/수록곡 구분 없이 자유롭게. 잘 알려진 곡과 숨은 명곡 균형있게.
힙합/R&B → 한국 곡 60%, 글로벌 40% 비중으로. 다양한 스타일 자유롭게.
팝 → 인디팝, 드림팝, 얼터너티브팝 등 서브장르 자유롭게. 외국 곡 위주.
재즈/어쿠스틱 → 악기 중심의 잔잔한 곡. 외국 곡 비중 허용.
장르 발견하기 → 인디팝, 드림팝, 시티팝, 네오소울, 얼터너티브, 포스트록, 앰비언트팝, 침머, 로파이 범위 내. 월간 리스너 100만 이상. 한국 곡 우선으로.


[절대 추천 금지 - 어떤 상황에서도 제외]
- Bloom - The Paper Kites
- 봄날 - BTS
- Bon Iver의 모든 곡 (아티스트 전체 제외)
- 곡 제목에 "Interlude", "Skit", "Intro", "Outro"가 포함된 모든 트랙 (앨범 인터루드/스킷 트랙 전체 제외)
- 곡 제목에 "Cherry Blossom"이 포함된 모든 곡 (Spotify KR에 없음). 봄 관련 한국 곡이 필요하다면 대신 추천 가능한 예시: 봄봄봄 - 로이킴, 벚꽃 엔딩 - 버스커 버스커, 봄사랑 벚꽃 말고 - 에일리, 봄이 좋냐 - 하림, 꽃 - 아이유, Blossom - 헤이즈

[공통 조건]
- 반드시 Spotify에 실제 존재하는 곡만 추천
- 곡명과 아티스트명은 Spotify 검색에 최적화된 정확한 영문/한글로
- 오리지널 스튜디오 음원만 (커버/라이브/리믹스 제외)

[응답 형식 - JSON만 반환, 다른 텍스트 없이]
{
  "song": "곡명 - 아티스트명",
  "spotifyQuery": { "song": "song 필드와 동일한 곡의 Spotify 검색용 영문 제목. 반드시 같은 곡이어야 함. Spotify에 등록된 정확한 곡명 전체를 영문으로 입력 (축약하거나 일부만 입력 금지). 예: song이 '꽃 - 아이유'면 spotifyQuery.song은 'Flower' (O) / 'Palette' (X - 다른 곡). 예: 'Goodbye Seoul' (O) / 'Seoul' (X). 예: 'Through the Night' (O) / 'Night' (X)", "artist": "Spotify 검색용 아티스트명 (영문)" },
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
          // 원본 song이 한글이면 유지, 영문이면 Spotify 메타로 덮어쓰기
          const originalSong = (result.song as string) ?? "";
          const hasKorean = /[\u3131-\u318E\uAC00-\uD7A3]/.test(originalSong);
          finalResult = found.trackName && found.trackArtist && !hasKorean
            ? { ...result, song: `${found.trackName} - ${found.trackArtist}` }
            : result;
          console.log(`[analyze] ✓ Spotify 검증 성공: ${spotifyTrackId} | 표시명: ${(finalResult as Record<string,unknown>).song}`);
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
