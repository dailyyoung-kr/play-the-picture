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

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.,&'()!?]/g, "");
}

// 공통 글자 수 기반 유사도 (0~1)
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  let matches = 0;
  const used = new Array(longer.length).fill(false);
  for (const ch of shorter) {
    const idx = longer.split("").findIndex((c, i) => !used[i] && c === ch);
    if (idx !== -1) { matches++; used[idx] = true; }
  }
  return matches / longer.length;
}

// 아티스트 매칭 (완화된 로직)
function artistMatches(spotifyArtist: string, claudeArtist: string): boolean {
  const a = normalizeName(spotifyArtist);
  const b = normalizeName(claudeArtist);
  if (a.length <= 2 || b.length <= 2) return false; // 너무 짧은 약어 방지
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

// 곡명 매칭 (완화된 로직)
function songMatches(spotifySong: string, claudeSong: string): boolean {
  const a = normalizeName(spotifySong);
  const b = normalizeName(claudeSong);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return similarity(a, b) >= 0.5;
}

type VerifiedTrack = {
  song: string;
  artist: string;
  spotifyTrackId: string;
  albumArt: string | null;
  popularity: number;
};

function getPopularityThreshold(genre: string): number {
  if (genre === "인디" || genre === "재즈/어쿠스틱") return 10;
  if (genre === "장르 발견하기") return 15;
  return 20;
}

const EXCLUDE_KEYWORDS = [
  "live", "cover", "acoustic", "remix", "instrumental",
  "라이브", "커버", "어쿠스틱", "리믹스", "inst",
  "(from", "ver.", "version",
];

function isOriginalTrack(trackName: string, albumType: string): boolean {
  if (albumType === "compilation") return false;
  const lower = trackName.toLowerCase();
  return !EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw));
}

async function verifyCandidate(
  song: string,
  artist: string,
  token: string,
  popularityThreshold: number
): Promise<VerifiedTrack | null> {
  const query = artist ? `track:${song} artist:${artist}` : `track:${song}`;
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const tracks: {
    id: string;
    name: string;
    popularity: number;
    artists: { name: string }[];
    album: { images: { url: string }[]; album_type: string };
  }[] = data.tracks?.items ?? [];

  // 커버/라이브/리믹스/컴필레이션 제외
  const original = tracks.filter((t) => isOriginalTrack(t.name, t.album.album_type));
  // popularity 기준 적용
  const filtered = original.filter((t) => t.popularity >= popularityThreshold);

  if (!artist) {
    const track = (filtered[0] ?? original[0]); // fallback: popularity 무시
    return track
      ? { song, artist, spotifyTrackId: track.id, albumArt: track.album.images[0]?.url ?? null, popularity: track.popularity }
      : null;
  }

  const findMatch = (pool: typeof original) =>
    pool.find((track) => {
      const sMatch = songMatches(track.name, song);
      const aMatch = track.artists.some((a) => artistMatches(a.name, artist));
      console.log(`[verify] "${song} - ${artist}" vs Spotify "${track.name} - ${track.artists.map(a => a.name).join(",")}" pop:${track.popularity} → song:${sMatch} artist:${aMatch}`);
      return sMatch && aMatch;
    });

  const matched = findMatch(filtered) ?? (() => {
    // fallback: popularity 기준 무시하고 매칭만으로 통과
    const fallback = findMatch(original);
    if (fallback) console.log(`[verify] ↩ "${song} - ${artist}" popularity fallback (pop:${fallback.popularity} < ${popularityThreshold})`);
    return fallback;
  })();

  if (!matched) {
    console.log(`[verify] ✗ "${song} - ${artist}" 매칭 실패 (후보 ${original.length}개 검토, threshold:${popularityThreshold})`);
  } else {
    console.log(`[verify] ✓ "${song} - ${artist}" 매칭 성공: ${matched.id} pop:${matched.popularity}`);
  }

  return matched
    ? { song, artist, spotifyTrackId: matched.id, albumArt: matched.album.images[0]?.url ?? null, popularity: matched.popularity }
    : null;
}

async function verifyCandidates(
  candidates: { song: string; artist: string }[],
  token: string,
  popularityThreshold: number
): Promise<VerifiedTrack[]> {
  const results = await Promise.all(candidates.map((c) => verifyCandidate(c.song, c.artist, token, popularityThreshold)));
  return results.filter((r): r is VerifiedTrack => r !== null);
}

function parseCandidates(text: string): { song: string; artist: string }[] {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.candidates ?? [];
  } catch {
    return [];
  }
}

function buildCandidatePrompt(genre: string, mood: string, listeningStyle: string, attempt = 0): string {
  let retryPrefix = "";
  if (attempt === 1) {
    retryPrefix = `앞서 추천한 곡들이 Spotify에서 검증되지 않았어요. 이번엔 반드시 아래 조건을 지켜줘:
- 월간 리스너 500만 이상의 검증된 아티스트 위주로 추천
- Spotify에 확실히 존재하는 유명한 곡
- 완전히 다른 아티스트와 곡으로 다시 추천해줘\n\n`;
  } else if (attempt === 2) {
    retryPrefix = `장르 제한을 완화해서 사진과 기분에 맞는 확실히 Spotify에 존재하는 곡으로 추천해줘. 월간 리스너 100만 이상의 유명 아티스트 곡으로만 추천해줘.\n\n`;
  } else if (attempt >= 3) {
    retryPrefix = `장르 제한 없이 사진과 기분에 맞는 확실히 Spotify에 존재하는 곡으로 추천해줘. 월간 리스너 100만 이상의 유명 아티스트 곡으로만 추천해줘.\n\n`;
  }

  return `${retryPrefix}다음 정보를 종합해서 Spotify에 실제 존재하는 노래 후보 6곡을 추천해줘.

[타겟 사용자]
추천 대상은 20대 한국 사용자예요.
"들어본 것 같은데 제목은 몰랐던" 곡처럼, 친숙하지만 새로운 발견의 느낌을 주는 곡을 우선해줘.
완전히 생소한 마이너 곡보다는 적당히 알려진 곡과 숨은 명곡의 균형이 중요해요.

[사진 분석]
업로드된 사진들의 색감, 장소, 분위기, 감정을 분석해서 반영해줘.

[사용자 취향]
- 선호 장르: ${genre}
- 현재 기분: ${mood}
- 상황: ${listeningStyle}

[장르별 추천 방향]
인디 → 한국 인디 중심. 날것의 감성, 덜 알려진 곡도 포함. 한국 곡 위주.
K-POP → 타이틀곡 50% + 수록곡/B사이드 50% 비율로 믹스. 잘 알려진 곡과 숨은 명곡 균형있게. 중소형 아티스트 포함.
힙합/R&B → 한국/글로벌 구분 없이. 다양한 스타일 자유롭게. 한국 곡 60% 권장.
팝 → 인디팝, 드림팝, 얼터너티브팝 등 서브장르 자유롭게. 외국 곡 위주 유지 (외국 60%+).
재즈/어쿠스틱 → 악기 중심의 잔잔한 곡. 외국 곡 비중 더 허용 (외국 50%+ 가능).
장르 발견하기 → 사진 분위기에 가장 잘 맞는 장르를 자유롭게 선택. 한국 곡 60% 권장.

[언어 비율 — 장르별]
- 팝 장르: 외국 곡 위주 (외국 4곡 이상)
- 재즈/어쿠스틱: 외국 곡 3곡 이상 허용
- 그 외 기본값: 6곡 중 한국 곡 약 3~4곡, 외국 곡 약 2~3곡 (60:40 비율)

[피해야 할 아티스트 — 아래 아티스트는 절대 포함하지 말 것]
Bon Iver, The xx, Cigarettes After Sex, The National, Hozier, Phoebe Bridgers,
Lana Del Rey, Sufjan Stevens, Iron & Wine, Fleet Foxes, Sigur Rós, Mogwai,
Daughter, Beach House, James Blake, Nick Drake, Elliott Smith, Radiohead.
이 아티스트들은 AI가 과도하게 자주 추천하는 패턴이 있어 의도적으로 제외해줘.

[다양성 조건]
- 6곡 중 같은 아티스트가 2번 이상 등장하면 절대 안 됨
- 잘 알려진 곡 약 40% + 숨은 명곡 약 60% 비율로 구성
- "들어본 것 같은데 제목은 몰랐던" 곡 위주 — 완전히 생소한 언더그라운드 곡은 지양
- 6곡 중 최소 2곡은 대중적으로 덜 알려진 곡으로 추천

[공통 조건]
- 반드시 Spotify에 실제 존재하는 곡만 추천
- 곡명과 아티스트명은 Spotify 검색에 최적화된 정확한 영문/한글로 반환
- 반드시 아티스트 본인이 정식 발매한 오리지널 스튜디오 음원만 추천
- 앨범 또는 싱글로 정식 발매된 곡만 추천
- 커버곡, 라이브 버전, 어쿠스틱 버전, 리믹스, 인스트루멘탈 버전 제외
- 사진의 색감, 장소, 분위기를 최우선으로 반영

[응답 형식 - JSON만 반환, 다른 텍스트 없이]
{
  "candidates": [
    { "song": "곡명", "artist": "아티스트명" },
    { "song": "곡명", "artist": "아티스트명" }
  ]
}`;
}

function buildExtraPrompt(genre: string, mood: string, listeningStyle: string): string {
  return `장르: ${genre}, 기분: ${mood}, 상황: ${listeningStyle} 조건에 맞는 Spotify 실존 노래 후보 5곡을 추가로 추천해줘.

- 아티스트 모두 달라야 함 (중복 없이)
- Bon Iver, The xx, Cigarettes After Sex, Beach House, Lana Del Rey 등 과도하게 자주 추천되는 아티스트는 제외
- 덜 알려졌지만 좋은 곡을 가진 아티스트를 적극 포함

[응답 형식 - JSON만 반환]
{
  "candidates": [
    { "song": "곡명", "artist": "아티스트명" }
  ]
}`;
}

function buildFinalPrompt(
  genre: string,
  mood: string,
  listeningStyle: string,
  verifiedTracks: VerifiedTrack[]
): string {
  const trackList = verifiedTracks
    .map((t, i) => `${i + 1}. ${t.song} - ${t.artist} (popularity: ${t.popularity})`)
    .join("\n");

  return `아래 검증된 후보 목록 중에서 사진, 기분, 상황에 가장 잘 어울리는 1곡을 골라 결과를 반환해줘.

[사용자 취향]
- 선호 장르: ${genre}
- 현재 기분: ${mood}
- 상황: ${listeningStyle}

[사진 분석]
업로드된 사진들의 색감, 장소, 분위기, 감정을 다시 참고해서 선택해줘.

[검증된 후보 목록 — 반드시 이 중에서만 선택]
${trackList}

[선택 기준]
- 사진의 분위기와 감정에 가장 잘 맞는 곡
- 기분(${mood})과 상황(${listeningStyle})에 어울리는 곡
- 뻔하지 않고 발견의 기쁨을 줄 수 있는 곡
- popularity가 높다고 무조건 선택하지 말고, 사진/기분/상황과 가장 잘 맞는 곡을 선택해줘
- popularity 기준 미달 곡은 이미 제외됐으니 남은 후보 중에서만 선택해줘

[기분별 추천 방향]
신나 → 에너지 넘치고 업템포, 같이 흥얼거릴 수 있는 곡
설레 → 두근거리고 기대감 있는 곡
여유로워 → 잔잔하고 편안한 곡, 흘려듣기 좋은
복잡해 → 감정이 교차하는 묵직하고 깊이 있는 곡
지쳐 → 위로가 되거나 감정에 공감해주는 곡

[상황별 추천 방향]
출근/등교길 → 빠른 템포 또는 에너제틱한 곡
작업/공부 → 집중을 방해하지 않는 곡, 가사 없거나 적은 곡
데이트 → 설레고 두근거리는 곡, 따뜻하고 감성적인 곡
휴식 → 편안하고 여유로운 곡, 배경음악처럼 자연스럽게 흐르는
산책/드라이브 → 미디엄 템포, 따뜻한 사운드, 감성적인 곡
잠들기 전 → 조용하고 잔잔한 곡, 몽환적이고 감성적인

[응답 형식 - JSON만 반환, 다른 텍스트 없이]
{
  "song": "곡명 - 아티스트명",
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
  "emotion_comment": "4개 감정 중 가장 높은 수치를 기반으로 사용자에게 말을 거는 느낌의 한 줄 코멘트. 존댓말(~요체), 따뜻하고 공감되는 톤, 20자 이내. 예: '오늘 뭔가 특별한 하루인 것 같아요 ✨' / '사진에서 행복한 기운이 넘쳐흘러요 😊' / '오늘 마음이 두근거리고 있군요 💗' / '오늘 에너지가 넘치는 날이네요 ⚡'",
  "vibe_type": "이모지 + 오늘의 나를 표현하는 유형명 (10자 이내). 사진과 취향을 종합해 오늘의 나를 하나의 캐릭터로 표현. 곡이 아닌 오늘의 나 중심. 반드시 한글만 사용 (한자·영어·특수문자 제외). 예: 🕺 거리의 주인공 / 🌙 새벽 감성러 / 🍃 조용한 관찰자",
  "vibe_description": "오늘 나의 상황이나 감정을 20자 이내로 표현. 20대가 카톡 상태메시지에 쓸 법한 말투. 너무 시적이거나 진지하지 않게. 살짝 웃기거나 '맞아 이거야' 하는 공감 포인트. 예: '회의 3개 버텨낸 사람의 음악' / '아무도 건들지 마세요 모드' / '조용히 존재하는 중' / '퇴근까지 2시간 남은 표정'",
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


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const isOverloaded = status === 529 || (err instanceof Error && err.message.includes("529"));
      if (isOverloaded && i < maxRetries) {
        const delay = (i + 1) * 3000;
        console.log(`[analyze] 529 과부하, ${delay / 1000}초 후 재시도 (${i + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("최대 재시도 횟수 초과");
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

    // Spotify 토큰 미리 발급
    const spotifyToken = await getSpotifyToken();

    // ── 1단계 + 2단계: 후보 생성 및 Spotify 검증 (최대 5회) ──
    const baseThreshold = getPopularityThreshold(genre);
    console.log(`[analyze] 장르: ${genre}, popularity 기준: ${baseThreshold}+`);
    let verifiedTracks: VerifiedTrack[] = [];
    let attempt = 0;

    while (verifiedTracks.length === 0 && attempt < 5) {
      // attempt 증가할수록 popularity 완화: 1차→기본값, 2차→10, 3차→0
      const popularityThreshold = attempt === 0 ? baseThreshold
        : attempt === 1 ? Math.min(baseThreshold, 20)
        : attempt === 2 ? 10
        : 0;

      console.log(`[analyze] 시도 ${attempt + 1}/5, popularity 기준: ${popularityThreshold}+`);

      const candidateResponse = await withRetry(() => client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: buildCandidatePrompt(genre, mood, listeningStyle, attempt) },
          ],
        }],
      }));

      attempt++;

      const candidateText = candidateResponse.content[0].type === "text" ? candidateResponse.content[0].text : "";
      const candidates = parseCandidates(candidateText);
      console.log(`[analyze] 시도 ${attempt}: 후보 ${candidates.length}곡 →`, candidates.map((c) => `${c.song} - ${c.artist}`));

      if (spotifyToken && candidates.length > 0) {
        verifiedTracks = await verifyCandidates(candidates, spotifyToken, popularityThreshold);
      } else if (candidates.length > 0) {
        // Spotify 없으면 후보를 그대로 사용
        verifiedTracks = candidates.map((c) => ({ ...c, spotifyTrackId: "", albumArt: null, popularity: 0 }));
      }

      console.log(`[analyze] 시도 ${attempt}: 검증 통과 ${verifiedTracks.length}곡`);
    }

    // 검증 통과곡이 3개 미만이면 추가 후보 1회 요청
    if (spotifyToken && verifiedTracks.length > 0 && verifiedTracks.length < 3) {
      const extraResponse = await withRetry(() => client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [{ type: "text", text: buildExtraPrompt(genre, mood, listeningStyle) }],
        }],
      }));

      const extraText = extraResponse.content[0].type === "text" ? extraResponse.content[0].text : "";
      const extraCandidates = parseCandidates(extraText);
      if (extraCandidates.length > 0) {
        const extraVerified = await verifyCandidates(extraCandidates, spotifyToken, baseThreshold);
        verifiedTracks = [...verifiedTracks, ...extraVerified];
      }
      console.log(`[analyze] 추가 후보 후 검증 통과 ${verifiedTracks.length}곡`);
    }

    if (verifiedTracks.length === 0) {
      return NextResponse.json(
        { error: "Spotify에서 검증된 곡을 찾지 못했어요. 다시 시도해주세요." },
        { status: 500 }
      );
    }

    // ── 3단계: Claude 최종 선택 ──
    const finalResponse = await withRetry(() => client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: [
          ...imageBlocks,
          { type: "text", text: buildFinalPrompt(genre, mood, listeningStyle, verifiedTracks) },
        ],
      }],
    }));

    const finalText = finalResponse.content[0].type === "text" ? finalResponse.content[0].text : "";
    const finalCleaned = finalText.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(finalCleaned);

    // 선택된 곡과 매칭되는 검증 결과에서 spotifyTrackId, albumArt 추출
    const selectedSong = (result.song as string).split(" - ")[0]?.trim() ?? result.song;
    const selectedArtist = (result.song as string).split(" - ").slice(1).join(" - ").trim();

    const matched =
      verifiedTracks.find(
        (t) =>
          (t.song.toLowerCase().includes(selectedSong.toLowerCase()) ||
            selectedSong.toLowerCase().includes(t.song.toLowerCase())) &&
          (artistMatches(t.artist, selectedArtist) || !selectedArtist)
      ) ??
      verifiedTracks.find(
        (t) =>
          t.song.toLowerCase().includes(selectedSong.toLowerCase()) ||
          selectedSong.toLowerCase().includes(t.song.toLowerCase())
      ) ??
      verifiedTracks[0]; // 매칭 실패 시 첫 번째 검증 곡으로 fallback

    const spotifyTrackId = matched?.spotifyTrackId || null;
    const albumArt = matched?.albumArt || null;
    const isGenreDiscovery = genre === "장르 발견하기";

    console.log("[analyze] 최종 선택:", result.song, "/ spotifyTrackId:", spotifyTrackId, "/ albumArt:", albumArt ? albumArt.slice(0, 60) + "..." : null);

    return NextResponse.json({
      ...result,
      spotifyTrackId,
      albumArt,
      isGenreDiscovery,
      discoveredGenre: isGenreDiscovery ? (result.discoveredGenre ?? null) : undefined,
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
