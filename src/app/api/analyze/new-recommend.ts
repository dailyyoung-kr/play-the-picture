import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SongRow = {
  id: string;
  spotify_track_id: string;
  song: string;
  artist: string;
  genre: string;
  energy: number;
  album_art_url: string | null;
  album: string | null;
  duration: string | null;
};

const ENERGY_LABELS: Record<number, string> = {
  1: "잔잔함",
  2: "여유",
  3: "설렘",
  4: "신남",
  5: "파워풀",
};

function getMediaType(dataUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (dataUrl.startsWith("data:image/png")) return "image/png";
  if (dataUrl.startsWith("data:image/webp")) return "image/webp";
  if (dataUrl.startsWith("data:image/gif")) return "image/gif";
  return "image/jpeg";
}

function shuffleAndSlice(arr: SongRow[], n: number): SongRow[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// discover 모드: 장르별 균등 샘플링 (각 장르에서 최대 maxPerGenre곡)
function balancedSample(arr: SongRow[], maxPerGenre: number): SongRow[] {
  const byGenre: Record<string, SongRow[]> = {};
  for (const song of arr) {
    if (!byGenre[song.genre]) byGenre[song.genre] = [];
    byGenre[song.genre].push(song);
  }
  const result: SongRow[] = [];
  for (const genre of Object.keys(byGenre)) {
    result.push(...shuffleAndSlice(byGenre[genre], maxPerGenre));
  }
  return shuffleAndSlice(result, result.length); // 장르 순서 섞기
}

function buildNewPrompt(
  genre: string,
  energy: number,
  candidates: SongRow[]
): string {
  const energyLabel = ENERGY_LABELS[energy] ?? String(energy);
  const isDiscover = genre === "discover";

  const songList = candidates
    .map((s, i) => `${i + 1}. ${s.song} - ${s.artist}`)
    .join("\n");

  return `아래 후보곡 중 이 사진에 가장 어울리는 1곡을 골라서 JSON으로만 응답해.

[사용자 정보]
- 선택 장르: ${isDiscover ? "장르 발견하기 (AI가 자유롭게 선택)" : genre}
- 원하는 분위기: ${energyLabel} (1=잔잔함 ~ 5=파워풀 중 ${energy})

[후보곡]
${songList}

[사진 분석]
사진의 색감, 장소, 피사체, 분위기, 감정을 분석해서 가장 어울리는 곡을 선택해.

[응답 JSON - 다른 텍스트 없이 JSON만]
{
  "selectedIndex": 후보곡 번호 (1부터 시작하는 숫자),
  "reason": "2~3문장. 사진 속 장면에서 이야기를 상상해 감성적이고 시적으로 표현. 마지막 문장은 약간 신비롭거나 위트있게. 존댓말(~요체)",
  "tags": [
    "장르/서브장르 (예: 인디팝, 드림팝, R&B / 최대 6자, # 없이)",
    "무드/감정 (예: 잔잔한, 몽환적, 설레는 / 최대 6자, # 없이)",
    "상황/시간대 (예: 드라이브, 새벽, 산책 / 최대 6자, # 없이)"
  ],
  "vibeSpectrum": {
    "energy": 0~100,
    "warmth": 0~100,
    "social": 0~100,
    "special": 0~100
  },
  "vibeType": "이모지 + 한글 6자 이내. 사진 소재 반영. 예: ☕ 카페 수집가 / 🌧️ 빗소리 감상러",
  "vibeDescription": "오늘 상황 요약 20자 이내. 20대 카톡 상태메시지 말투",
  "hiddenEmotion": "숨은 감정 한 줄 (이모지 포함)",
  "emotionComment": "vibeSpectrum에서 가장 극단적인 값 기반 한 줄 코멘트. 존댓말, 20자 이내",
  "background": {
    "from": "hex (밝기 10~15% 이하 어두운 톤, 곡 분위기 반영)",
    "to": "hex (밝기 10~15% 이하 어두운 톤, 곡 분위기 반영)"
  }${isDiscover ? `,\n  "discoveredGenre": "AI가 선택한 장르명 한국어로 (예: 시티팝, 드림팝)"` : ""}
}

배경색 참고:
- 감성적 → #0d1a10 ~ #1a0d18
- 설레는 → #0d1218 ~ #1a1408
- 위로 → #1a0d0d ~ #0d0d1a
- 신나는 → #1a1208 ~ #081a12`;
}

export async function newRecommend(
  body: Record<string, unknown>,
  photos: string[]
): Promise<ReturnType<typeof NextResponse.json>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API 키가 설정되지 않았어요." }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const genreMap: Record<string, string> = {
    "K-POP": "kpop",
    "팝": "pop",
    "힙합": "hiphop",
    "힙합/R&B": "hiphop",
    "인디": "indie",
    "R&B/소울": "rnb",
    "락": "indie",
    "어쿠스틱/재즈": "acoustic_jazz",
    "재즈/어쿠스틱": "acoustic_jazz",
    "장르 발견하기": "discover",
    // legacy preference apiGenre 호환
    "힙합R&B": "hiphop",
  };

  const rawGenre = (body.genre as string) ?? "discover";
  const genre = genreMap[rawGenre] ?? rawGenre;
  const energy = Number(body.energy) || 3;
  const isDiscover = genre === "discover";
  console.log(`[new] genre 변환: "${rawGenre}" → "${genre}"`);

  // ── STEP 1: Supabase에서 후보곡 필터링 ──

  const energyMin = Math.max(1, energy - 1);
  const energyMax = Math.min(5, energy + 1);

  // 1차 조회: genre + energy ±1 범위
  const primaryQuery = isDiscover
    ? supabase.from("songs").select("*").gte("energy", energyMin).lte("energy", energyMax)
    : supabase.from("songs").select("*").eq("genre", genre).gte("energy", energyMin).lte("energy", energyMax);

  const { data: rawCandidates, error: dbError } = await primaryQuery;

  if (dbError) {
    console.error("[new] DB 조회 오류:", dbError.message);
    return NextResponse.json({ error: "곡 데이터를 불러오지 못했어요." }, { status: 500 });
  }

  let candidates = (rawCandidates ?? []) as SongRow[];
  console.log(`[new] 1차 후보: ${candidates.length}곡 (genre=${genre}, energy=${energyMin}~${energyMax})`);

  // 후보 10개 미만 → energy 필터 제거 후 재조회
  if (candidates.length < 10) {
    console.log(`[new] 후보 부족 (${candidates.length}곡) → energy 제한 해제 후 재조회`);
    const fallbackQuery = isDiscover
      ? supabase.from("songs").select("*")
      : supabase.from("songs").select("*").eq("genre", genre);
    const { data: fallbackData } = await fallbackQuery;
    candidates = (fallbackData ?? []) as SongRow[];
    console.log(`[new] 확장 후보: ${candidates.length}곡`);
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: "해당 조건의 곡이 없어요. 다른 장르나 분위기를 선택해주세요." }, { status: 404 });
  }

  // 후보 50개 초과 → 샘플링
  let finalCandidates: SongRow[];
  if (isDiscover) {
    // discover: 장르별 균등 샘플링 (각 장르 최대 7곡)
    finalCandidates = balancedSample(candidates, 7).slice(0, 50);
  } else if (candidates.length > 50) {
    finalCandidates = shuffleAndSlice(candidates, 50);
  } else {
    finalCandidates = shuffleAndSlice(candidates, candidates.length);
  }
  console.log(`[new] 최종 후보: ${finalCandidates.length}곡`);

  // ── STEP 2: Claude에게 사진 + 후보곡 전달 ──

  const imageBlocks = photos.map((dataUrl: string) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: getMediaType(dataUrl),
      data: dataUrl.split(",")[1],
    },
  }));

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        { type: "text", text: buildNewPrompt(genre, energy, finalCandidates) },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  let result: Record<string, unknown>;
  try {
    result = JSON.parse(cleaned);
  } catch {
    console.error("[new] JSON 파싱 실패:", cleaned.slice(0, 200));
    return NextResponse.json({ error: "분석 중 오류가 발생했어요. 다시 시도해주세요." }, { status: 500 });
  }

  // ── STEP 3: 결과 조합 ──

  const selectedIndex = (result.selectedIndex as number) ?? 1;
  const selectedSong = finalCandidates[selectedIndex - 1] ?? finalCandidates[0];

  if (!selectedSong) {
    return NextResponse.json({ error: "곡 선택 중 오류가 발생했어요." }, { status: 500 });
  }

  console.log(`[new] 선택된 곡: ${selectedSong.song} - ${selectedSong.artist} | index=${selectedIndex}`);

  return NextResponse.json({
    song: `${selectedSong.song} - ${selectedSong.artist}`,
    spotifyTrackId: selectedSong.spotify_track_id,
    albumArt: selectedSong.album_art_url,
    reason: result.reason,
    tags: result.tags,
    vibeSpectrum: result.vibeSpectrum,
    vibeType: result.vibeType,
    vibeDescription: result.vibeDescription,
    hiddenEmotion: result.hiddenEmotion,
    emotionComment: result.emotionComment,
    background: result.background,
    isGenreDiscovery: isDiscover,
    ...(isDiscover && result.discoveredGenre ? { discoveredGenre: result.discoveredGenre } : {}),
  });
}
