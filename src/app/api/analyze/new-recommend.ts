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
  return shuffleAndSlice(result, result.length);
}

// 아티스트 다양성: 같은 아티스트 최대 maxPerArtist곡으로 제한
function limitPerArtist(arr: SongRow[], maxPerArtist: number): SongRow[] {
  const count: Record<string, number> = {};
  return arr.filter(song => {
    const key = song.artist.toLowerCase();
    count[key] = (count[key] ?? 0) + 1;
    return count[key] <= maxPerArtist;
  });
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
  "reason": "3문장. 첫 문장은 사진의 구체적인 요소(장소, 사물, 색감 등)를 콕 집어서 관찰한 것처럼 묘사. 두 번째 문장은 그 요소와 추천곡의 구체적인 특성(멜로디, 리듬, 분위기)을 연결해서 '왜 이 곡인지' 설명. 세 번째 문장은 위트있고 재치있는 한마디로 마무리. 매번 다른 형식으로 (예시 — 공감: "이런 날 이 노래 안 들으면 그건 좀 손해예요" / 과장: "이 조합이면 오늘 하루 OST 확정이에요" / 반전: "근데 사실 이 노래가 먼저 이 장소를 찾아온 건지도 몰라요" / 확신: "이건 우연이 아니라 취향이에요"). 사물 의인화('~도 사실 이 노래를 알고 있었다' 류) 사용 금지. '~아닐까요?', '~것 같지 않나요?' 의문형 반복 금지. 전체적으로 감성적이기보다 친구가 '이 노래 들어봐' 하면서 재밌게 추천해주는 톤. 존댓말(~요체)",
  "tags": [
    "장르/서브장르 (2~5자, 구체적으로. 좋은 예: 드림팝, 시티팝, 네오소울 / 나쁜 예: 팝, 음악, # 없이)",
    "무드/감정 (2~5자, 구체적으로. 좋은 예: 나른한, 몽글몽글, 설레는 / 나쁜 예: 좋은, 감성, # 없이)",
    "상황/시간대 (2~5자, 구체적으로. 좋은 예: 한강산책, 새벽드라이브, 비오는날 / 나쁜 예: 외출, 일상, # 없이)"
  ],
  "vibeSpectrum": {
    "energy": 0~100,
    "warmth": 0~100,
    "social": 0~100,
    "special": 0~100
  },
  "vibeType": "이모지 + 한글 6자 이내. 사진 소재를 반영한 오늘의 캐릭터. 같은 단어 반복 금지. 다양한 형식으로 (예: ☕ 카페 탐험가 / 🌧️ 감성 충전러 / 🌸 봄 산책 마스터 / 🎧 골목 DJ / 🌅 노을 전문 감상가 / 🍜 야식 헌터). 특정 단어(수집가, 탐험가 등)가 반복되지 않도록 매번 다른 어미 사용",
  "vibeDescription": "오늘 상황 요약 25자 이내. 공감 가고 위트있는 한 줄. 'ㅋ'이나 자음 단독 사용 금지. (예: 오늘 하루 봄에 잠식당함 / 벚꽃은 핑계고 사실 설레는 중 / 바다가 부른 건지 내가 간 건지)",
  "hiddenEmotion": "숨은 감정 한 줄 (이모지 포함)",
  "emotionComment": "vibeSpectrum 중 가장 극단적인 축을 20자 이내로 가볍게 한마디. 'ㅋ'이나 자음 금지. 존댓말(~요체). (예: 오늘 따뜻함 수치 거의 만땅이에요 / 혼자만의 시간 제대로네요 / 에너지 오늘 완전 풀충전이에요)",
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

  let candidates: SongRow[] = [];

  if (isDiscover) {
    // discover: energy ±1 범위로 바로 조회
    const { data, error } = await supabase.from("songs").select("*").gte("energy", energyMin).lte("energy", energyMax);
    if (error) {
      console.error("[new] DB 조회 오류:", error.message);
      return NextResponse.json({ error: "곡 데이터를 불러오지 못했어요." }, { status: 500 });
    }
    candidates = (data ?? []) as SongRow[];
    if (candidates.length < 10) {
      const { data: fallback } = await supabase.from("songs").select("*");
      candidates = (fallback ?? []) as SongRow[];
    }
    console.log(`[new] discover 후보: ${candidates.length}곡`);
  } else {
    // 1차: genre + energy 정확 매칭
    const { data: exact, error } = await supabase.from("songs").select("*").eq("genre", genre).eq("energy", energy);
    if (error) {
      console.error("[new] DB 조회 오류:", error.message);
      return NextResponse.json({ error: "곡 데이터를 불러오지 못했어요." }, { status: 500 });
    }
    candidates = (exact ?? []) as SongRow[];
    console.log(`[new] 1차 정확매칭: ${candidates.length}곡 (genre=${genre}, energy=${energy})`);

    // 2차: genre + energy ±1
    if (candidates.length < 20) {
      const { data: expanded } = await supabase.from("songs").select("*").eq("genre", genre).gte("energy", energyMin).lte("energy", energyMax);
      candidates = (expanded ?? []) as SongRow[];
      console.log(`[new] 2차 확장: ${candidates.length}곡 (energy=${energyMin}~${energyMax})`);
    }

    // 3차: genre 전체 (energy 제한 없음)
    if (candidates.length < 10) {
      const { data: fallback } = await supabase.from("songs").select("*").eq("genre", genre);
      candidates = (fallback ?? []) as SongRow[];
      console.log(`[new] 3차 fallback: ${candidates.length}곡 (energy 제한 없음)`);
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: "해당 조건의 곡이 없어요. 다른 장르나 분위기를 선택해주세요." }, { status: 404 });
  }

  // 샘플링 (상한 30곡)
  let finalCandidates: SongRow[];
  if (isDiscover) {
    // discover: 장르별 최대 5곡씩 균등 샘플링, 30곡 상한
    finalCandidates = balancedSample(candidates, 5).slice(0, 30);
  } else if (candidates.length > 30) {
    finalCandidates = shuffleAndSlice(candidates, 30);
  } else {
    finalCandidates = shuffleAndSlice(candidates, candidates.length);
  }

  // 아티스트 다양성: 같은 아티스트 최대 2곡
  finalCandidates = limitPerArtist(finalCandidates, 2);
  console.log(`[new] 아티스트 필터 후: ${finalCandidates.length}곡`);

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
