import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

const SYSTEM_PROMPT = `너는 '플더픽'이라는 사진 기반 음악 추천 서비스의 AI야. 유저가 올린 사진의 분위기를 읽고, 후보곡 중 가장 어울리는 1곡을 골라. 톤은 친구가 "이 노래 들어봐" 하면서 재밌게 추천해주는 느낌. 존댓말(~요체). JSON만 응답.`;

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

  return `후보곡 중 사진에 가장 어울리는 1곡. JSON만.

장르: ${isDiscover ? "AI 자유 선택" : genre}
분위기: ${energyLabel} (${energy}/5)

[후보곡]
${songList}

[분석 지시]
- 여러 장이면 하나의 하루로 읽을 것
- 사진의 구체적 디테일(피사체 표정/동작, 색감, 사물 상태, 장소 분위기) 중 눈에 띄는 것을 잡아서 reason에 녹일 것
- 곡명과 사진의 기계적 매칭(예: 바다 사진→'Ocean' 곡명) 피하고, 곡의 실제 분위기와 사진의 공기가 맞는 곡 우선

금지: '딱 맞아 떨어지다', '그냥 A가 아니라 B', '그 자체로', 의문형 연속, 자음 단독, 태그/장르 붙여쓰기, 'BGM' 남발, 'K-POP'을 '케이팝'으로 쓰지 말 것(그냥 'K팝' 또는 '댄스팝'/'발라드' 등 서브장르로)

{
  "selectedIndex": 번호,
  "reason": "3문장. ①사진의 구체적 디테일(표정/색/사물 상태 등) 하나를 관찰자처럼 묘사 ②그 디테일과 곡의 구체적 특성(멜로디 질감, 리듬, 가사, 보컬 톤) 연결 ③위트있는 마무리 한 줄. 독자가 '맞아 이거 나야' 혹은 '친구한테 보여주고 싶다' 느끼게. 공감/과장/자조/선언/의인화 중 하나. 매번 다른 형식. 광고 카피처럼 설명·설득 금지. 존댓말",
  "tags": ["장르/서브장르 2~5자 (띄어쓰기X, 예: 인디팝·드림팝·R&B)", "무드/감정 2~5자 (예: 나른한·몽글한·설레는)", "상황/시간대 2~5자 (띄어쓰기X, 예: 퇴근길·카페·주말오후)"],
  "vibeSpectrum": {"energy":0~100,"warmth":0~100,"social":0~100,"special":0~100},
  "vibeType": "이모지 + 한글 캐릭터명. 3~7자. '친구가 나한테 붙여줄 별명' 또는 '오늘의 나를 하나의 캐릭터로 정의하는 이름'. 친근하고 위트 있게. 억지로 글자수 맞추지 말 것. 띄어쓰기 허용. 매번 다른 어미 (예: 🌸 벚꽃 수집가 / ☕ 카페 탐험대 / 🎧 골목 DJ / 🍜 야식 헌터)",
  "vibeDescription": "25자 이내. MBTI 밈이나 인스타 스토리 캡션처럼 읽히는 한 줄. 자기 고백 / 자조 / 과장 / 선언 중 하나. 인스타에 올리고 싶은 톤. 설명형 금지. 예: '벚꽃은 핑계고 사실 설레는 중' / '하늘이 예쁜 날은 퇴근도 예뻐진다' / '오늘 하루 내가 주인공' / '커피 없으면 아무것도 안 됨'"${isDiscover ? ',\n  "discoveredGenre": "장르명 한국어"' : ""}
}`;
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
  const deviceId = (body.deviceId as string) ?? null;
  console.log(`[new] genre 변환: "${rawGenre}" → "${genre}"`);

  const perfStart = Date.now();
  const perf = (label: string, since: number) =>
    console.log(`[PERF] ${label}: ${Date.now() - since}ms`);

  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-opus-4-6":   { input: 5, output: 25 },
    "claude-opus-4-7":   { input: 5, output: 25 },
  };

  console.log(`[PERF] 분석 시작 — 사진 ${photos.length}장`);

  // ── STEP 0: 최근 7일 추천 이력 조회 (반복 방지) ──

  let excludedIds: string[] = [];
  if (deviceId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recData } = await supabase
      .from("recommendation_logs")
      .select("song_id")
      .eq("device_id", deviceId)
      .gte("created_at", sevenDaysAgo);
    excludedIds = (recData ?? []).map((r: { song_id: string }) => r.song_id).filter(Boolean);
    console.log(`[new] 최근 7일 추천 제외: ${excludedIds.length}곡`);
  }

  // ── STEP 1: Supabase에서 후보곡 필터링 ──

  const energyMin = Math.max(1, energy - 1);
  const energyMax = Math.min(5, energy + 1);

  const excludedSet = new Set(excludedIds);

  let candidates: SongRow[] = [];

  console.log("[PERF] 후보곡 필터링 시작");
  const t1 = Date.now();

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

  perf("후보곡 필터링 완료", t1);

  if (candidates.length === 0) {
    return NextResponse.json({ error: "해당 조건의 곡이 없어요. 다른 장르나 분위기를 선택해주세요." }, { status: 404 });
  }

  // 반복 추천 방지: 최근 7일 이력 제외 (메모리 필터)
  let filteredCandidates = excludedSet.size > 0
    ? candidates.filter(s => !excludedSet.has(s.id))
    : candidates;

  // 4차 폴백: 제외 후 10곡 미만이면 전체 후보 복원
  if (filteredCandidates.length < 10 && excludedSet.size > 0) {
    console.log(`[new] 4차 폴백: 제외 후 ${filteredCandidates.length}곡 → 반복 제외 해제`);
    filteredCandidates = candidates;
  }

  // 샘플링 (상한 30곡)
  let finalCandidates: SongRow[];
  if (isDiscover) {
    // discover: 장르별 최대 5곡씩 균등 샘플링, 30곡 상한
    finalCandidates = balancedSample(filteredCandidates, 5).slice(0, 30);
  } else if (filteredCandidates.length > 30) {
    finalCandidates = shuffleAndSlice(filteredCandidates, 30);
  } else {
    finalCandidates = shuffleAndSlice(filteredCandidates, filteredCandidates.length);
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

  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  console.log(`[PERF] Claude API 호출 시작 — 사진 ${photos.length}장, 모델: ${model}`);
  const t2 = Date.now();

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        { type: "text", text: buildNewPrompt(genre, energy, finalCandidates) },
      ],
    }],
  });

  perf("Claude API 호출 완료", t2);
  const { input_tokens, output_tokens } = response.usage;
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"];
  const cost = ((input_tokens * pricing.input + output_tokens * pricing.output) / 1_000_000).toFixed(4);
  console.log(`[PERF] 토큰 사용량 — input: ${input_tokens}, output: ${output_tokens} (비용: $${cost})`);

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

  console.log("[PERF] 결과 조합 시작");
  const t3 = Date.now();

  const selectedIndex = (result.selectedIndex as number) ?? 1;
  const selectedSong = finalCandidates[selectedIndex - 1] ?? finalCandidates[0];

  if (!selectedSong) {
    return NextResponse.json({ error: "곡 선택 중 오류가 발생했어요." }, { status: 500 });
  }

  console.log(`[new] 선택된 곡: ${selectedSong.song} - ${selectedSong.artist} | index=${selectedIndex}`);
  perf("결과 조합 완료", t3);
  console.log(`[PERF] 전체 소요: ${Date.now() - perfStart}ms (사진 ${photos.length}장)`);

  // ── STEP 4: 추천 이력 비동기 기록 (응답 대기 시간에 영향 없음) ──
  if (deviceId && selectedSong?.id) {
    after(async () => {
      const { error: logErr } = await supabaseAdmin.from("recommendation_logs").insert({
        device_id: deviceId,
        song_id: selectedSong.id,
      });
      if (logErr) console.error("[new] recommendation_logs insert 실패:", logErr.message);
      else console.log(`[new] 추천 이력 기록: device=${deviceId}, song=${selectedSong.id}`);
    });
  }

  return NextResponse.json({
    song: `${selectedSong.song} - ${selectedSong.artist}`,
    spotifyTrackId: selectedSong.spotify_track_id,
    albumArt: selectedSong.album_art_url,
    reason: result.reason,
    tags: result.tags,
    vibeSpectrum: result.vibeSpectrum,
    vibeType: result.vibeType,
    vibeDescription: result.vibeDescription,
    isGenreDiscovery: isDiscover,
    ...(isDiscover && result.discoveredGenre ? { discoveredGenre: result.discoveredGenre } : {}),
  });
}
