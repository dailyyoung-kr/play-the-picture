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
- 사진에서 가장 눈에 띄는 요소 1~2개를 자연스럽게 관찰해 reason에 녹일 것 (피사체의 동작·포즈, 장소, 색감·빛, 사물 상태 중)
- 개인 정보성 세부(옷 색깔·브랜드·티셔츠 글자·얼굴 특징·액세서리)는 짚지 말 것
- reason 1번째 문장은 40자 이내로 간결하게

금지: '딱 맞아 떨어지다', '이건 그냥 A가 아니라 B', '그 자체로', 의문형 연속, 'ㅋ' 자음 단독, 태그 띄어쓰기, 'BGM' 사용 자제(같은 대화에서 여러 번 쓰지 말 것), 'K-POP'을 '케이팝'으로 쓰지 말 것('K팝' 또는 '댄스팝'·'발라드' 등 서브장르), '~어울려요' / '~딱이에요' / '~이만한 게 없어요' / '~결이 맞아요' 같은 평범한 종결 반복 금지

{
  "selectedIndex": 번호,
  "reason": "3문장. 읽는 사람이 킥킥거리거나 '맞다 이거 나야' 느끼는 게 목표. ①사진의 구체적 디테일 하나를 관찰자 + 슬쩍 삐딱한 시선으로 묘사 (설명체 금지, 혼잣말·농담·자조 섞을 것) ②그 디테일과 곡을 연결. 단, 곡의 구체적 사운드 요소(기타 리프·멜로디·베이스·그루브·보컬톤·템포)를 사진 디테일과 직접 매칭하지 말 것 — 억지스럽고, AI가 곡의 정확한 사운드를 모를 수 있어 오류 위험. 대신 (a) 장르·무드 수준의 연결, (b) 곡 제목·아티스트 이름 자체를 은유로 활용, (c) 곡이 주는 전반적 인상을 쓰는 방향으로. ③마무리 종결 패턴을 매번 다르게 돌려 쓸 것. 아래 예시에서 고르거나 비슷한 형식으로: 질문('~맞죠?'/'~아닌가요?'), 권유('~해봐요'/'~한번 해보자고요'), 과장·비교('~급이에요'/'~의 정석이죠'), 반전('~일 줄 누가 알았을까요'/'~인 척 하지만 사실'), 추측('~일지도 몰라요'), 확신('~만 기억나는 날이에요'), 명령조 농담('~금지'/'~의무입니다'). 피할 것: '~어울려요', '~BGM이에요', '~딱이에요', '~입니다/인정합니다' 종결 반복. 특히 '~입니다/합니다' 단정형 선언은 한 세션에 한 번만. 존댓말(~요/어요) 유지. 톤은 친한 언니/누나가 농담 섞어서 얘기하는 느낌.",
  "tags": ["장르/서브장르 2~5자 (띄어쓰기X, 예: 인디팝·드림팝·R&B)", "무드/감정 2~5자 (예: 나른한·몽글한·설레는)", "상황/시간대 2~5자 (띄어쓰기X, 예: 퇴근길·카페·주말오후)"],
  "vibeType": "이모지 + 한글 캐릭터명. 3~7자. '친구가 나한테 붙여줄 별명'. 매번 다른 어미 (예: 🔥 복수 설계자 / 💗 하트 제조기 / 🐯 브이요정 / 🍜 야식 수호자)",
  "vibeDescription": "25자 이내. MBTI 밈이나 인스타 스토리 캡션처럼 읽히는 한 줄. 자기 고백 / 자조 / 과장 / 선언 중 하나. 인스타에 올리고 싶은 톤. 설명형 금지. 예: '벚꽃은 핑계고 사실 설레는 중' / '하늘이 예쁜 날은 퇴근도 예뻐진다' / '오늘 하루 내가 주인공' / '커피 없으면 아무것도 안 됨'"${isDiscover ? ',\n  "discoveredGenre": "장르명 한국어"' : ""}
}`;
}

export async function newRecommend(
  body: Record<string, unknown>,
  photos: string[]
): Promise<ReturnType<typeof NextResponse.json>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API 키가 설정되지 않았어요.", error_code: "api_key_missing" }, { status: 500 });
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
      return NextResponse.json({ error: "곡 데이터를 불러오지 못했어요.", error_code: "db_error" }, { status: 500 });
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
      return NextResponse.json({ error: "곡 데이터를 불러오지 못했어요.", error_code: "db_error" }, { status: 500 });
    }
    candidates = (exact ?? []) as SongRow[];
    console.log(`[new] 1차 정확매칭: ${candidates.length}곡 (genre=${genre}, energy=${energy})`);

    // 2차: genre + energy ±1
    if (candidates.length < 30) {
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

  const perfDbMs = Date.now() - t1;
  perf("후보곡 필터링 완료", t1);

  if (candidates.length === 0) {
    return NextResponse.json({ error: "해당 조건의 곡이 없어요. 다른 장르나 분위기를 선택해주세요.", error_code: "no_candidates" }, { status: 404 });
  }

  // 반복 추천 방지: 최근 7일 이력 제외 (메모리 필터)
  let filteredCandidates = excludedSet.size > 0
    ? candidates.filter(s => !excludedSet.has(s.id))
    : candidates;

  // 4차 폴백: 제외 후 5곡 미만이면 전체 후보 복원
  if (filteredCandidates.length < 5 && excludedSet.size > 0) {
    console.log(`[FALLBACK] 이력 무시 발동: ${filteredCandidates.length}곡 가용 (genre=${genre}, energy=${energy}, excluded=${excludedSet.size})`);
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

  const perfClaudeMs = Date.now() - t2;
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
    return NextResponse.json({ error: "분석 중 오류가 발생했어요. 다시 시도해주세요.", error_code: "json_parse_error" }, { status: 500 });
  }

  // ── STEP 3: 결과 조합 ──

  console.log("[PERF] 결과 조합 시작");
  const t3 = Date.now();

  const selectedIndex = (result.selectedIndex as number) ?? 1;
  const selectedSong = finalCandidates[selectedIndex - 1] ?? finalCandidates[0];

  if (!selectedSong) {
    return NextResponse.json({ error: "곡 선택 중 오류가 발생했어요.", error_code: "selection_error" }, { status: 500 });
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
        vibe_type: result.vibeType ?? null,
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
    vibeType: result.vibeType,
    vibeDescription: result.vibeDescription,
    isGenreDiscovery: isDiscover,
    perfDbMs,
    perfClaudeMs,
    photoCount: photos.length,
    ...(isDiscover && result.discoveredGenre ? { discoveredGenre: result.discoveredGenre } : {}),
  });
}
