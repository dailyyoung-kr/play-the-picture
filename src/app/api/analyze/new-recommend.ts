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

const SYSTEM_PROMPT = `너는 '플더픽'이라는 사진 기반 음악 추천 서비스의 AI야.
유저가 올린 사진의 분위기를 읽고, 후보곡 중 가장 어울리는 1곡을 골라.
곡 제목 뿐만 아니라 실제 곡의 무드와 어울리는지도 함께 고려.
추천 결과는 단톡방에서 친구들끼리 돌려보고 싶은 카드 —
존댓말(~요체). 농담 섞은 톤. JSON만 응답.`;

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
  "reason": "3문장. '단톡방에 카드 받은 친구가 끝까지 읽고 키득거릴' 추천 이유.
① 사진의 구체적 디테일 1개를 관찰자 + 삐딱한 시선으로 묘사
(설명체·해설체 금지).
② 곡 연결: 제목/아티스트 자체 은유 OR 무드 수준만.
금지: '기타 톤', '통통 튀는 리듬', '목소리가 흩날려요' 같은
사운드 직접 묘사 — AI가 실제 사운드 정확히 모를 수 있어 거짓말 위험.
③ 종결 매번 다르게 — 질문/권유/과장·비교/반전/추측 중.
존댓말. 농담 섞은 톤.",
  "tags": ["장르/서브장르 2~5자 (예: KPOP·시티팝·R&B·어쿠스틱)", "무드/감정 2~5자 (예: 몽글한·들뜬·설레는·나른한)", "상황/시간대 2~5자 (예: 퇴근길·카페·주말오후)"],
  "vibeType": "이모지 + 한글 캐릭터명. 3~7자.
'카톡 단톡방에 떴을 때 친구들이 한 번씩 다 만들어보고 싶게 만드는 별명'.
매번 다른 어미
(예: 🌸 겹벚꽃 덕후 / 🐯 브이요정 듀오 / 📸 셀카 장인 /
    🐻 반짝이 곰선생 / 🏰 동화세계 탐험가)",
  "vibeDescription": "25자 이내.
'친구가 단톡방에 이 카드 띄웠을 때 댓글 달고 싶게 만드는' 한 줄 —
사진의 구체 디테일(소품·동작·배경) 1개를 자기 과시 + 위트로 비틀기.
설명형/단정형 금지.
예: '올해 봄 지분 혼자 다 가져가는 중' / '머리띠가 인격을 바꾸는 날' /
    '내 카메라 롤은 내가 주인공' / '필터빨 아니고 원래 기분 좋음' /
    '하늘은 흐려도 고기는 빨갛게'"${isDiscover ? ',\n  "discoveredGenre": "장르명 한국어"' : ""}
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

  // ── 샘플링 (동적 한도) ──
  // 2026-05-01 로컬 실험: K = max(30, min(50, ceil(P × 0.5)))
  //   - 풀 30곡 미만: 풀 그대로
  //   - 풀 30~60곡: 30곡 (하한)
  //   - 풀 60~100곡: 풀의 50% (곡당 노출 확률 50% 보장)
  //   - 풀 100곡 이상: 50곡 cap (Claude reasoning 부담 방지)
  const dynamicLimit = Math.max(
    30,
    Math.min(50, Math.ceil(filteredCandidates.length * 0.5))
  );

  let finalCandidates: SongRow[];
  if (isDiscover) {
    // discover: 장르당 균등 샘플링 (perGenre = limit ÷ 6 올림)
    const perGenre = Math.ceil(dynamicLimit / 6);
    finalCandidates = balancedSample(filteredCandidates, perGenre).slice(0, dynamicLimit);
  } else if (filteredCandidates.length > dynamicLimit) {
    finalCandidates = shuffleAndSlice(filteredCandidates, dynamicLimit);
  } else {
    finalCandidates = shuffleAndSlice(filteredCandidates, filteredCandidates.length);
  }

  // 아티스트 다양성: 같은 아티스트 최대 2곡
  finalCandidates = limitPerArtist(finalCandidates, 2);
  console.log(`[new] 동적 한도 ${dynamicLimit} (풀 ${filteredCandidates.length}곡), 아티스트 필터 후: ${finalCandidates.length}곡`);

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
